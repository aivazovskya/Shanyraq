# Task 0025: Mobile SOS dashboard (staff)

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

First real staff feature built on [Task 0024](0024-mobile-staff-mode-foundation.md)'s
navigation shell — **do not start this task until 0024 is merged**, it
depends on `StaffMainTabs`, `isStaffRole`, and `mobile/src/lib/socket.ts`
existing. This brings the web SOS dashboard
([frontend-web/src/app/dashboard/sos/page.tsx](../frontend-web/src/app/dashboard/sos/page.tsx))
to mobile, reusing the exact same backend endpoints and the real-time
WebSocket infrastructure [Task 0020](0020-realtime-websocket.md) already
built — a guard or dispatcher on patrol, not sitting at a desk, is
precisely the use case that makes this the highest-value staff screen to
bring to mobile first.

### Architecture decisions already made — do not re-litigate

1. **Reuse the backend as-is — zero backend changes in this task.**
   `GET /sos/tenants/:tenantId` and `PATCH /sos/:id/resolve`
   ([sos.controller.ts](../backend/src/modules/sos/sos.controller.ts))
   already exist, are tested, and are exactly what this screen needs.
2. **Reuse the WebSocket room, don't invent a new one.** Task 0020
   already built `sos:tenant:<tenantId>` with `sos:alert:triggered`/
   `sos:alert:updated` events, consumed today only by the web dashboard.
   Join the same room from mobile via the `sos:join` message
   (`RealtimeGateway.handleSosJoin` already authorizes via
   `SosService.assertStaffOrChairmanRole` — no gateway changes needed,
   this authorization already covers mobile clients identically since
   auth is the same JWT-based handshake regardless of client).
3. **`HOA_CHAIRMAN` is read-only — mirror the web dashboard's exact rule,
   don't relax it.** `PATCH /sos/:id/resolve` doesn't accept
   `HOA_CHAIRMAN` in its `@Roles(...)` list (only `SECURITY`/`DISPATCHER`/
   `HOA_ADMIN`/`SUPERADMIN`) — hide or disable the resolve action for a
   `HOA_CHAIRMAN` user on mobile exactly like the web dashboard already
   does (`isChairman` check in `sos/page.tsx`), not just let the backend
   reject it silently on tap.
4. **No polling, ever — this screen is being built after Task 0020, not
   before it.** Don't write a `setInterval` "temporarily" and plan to
   remove it later; wire the socket connection (via
   `mobile/src/lib/socket.ts`) from the start, with the initial `GET
   /sos/tenants/:tenantId` fetch on mount plus a reconciliation refetch on
   the socket's `reconnect` event, matching exactly how the web dashboard
   and mobile chat screen already do it.
5. **Push notifications for new SOS alerts already exist and are
   untouched.** `NotificationsService` already pushes an "🚨 EMERGENCY"
   alert to relevant staff on trigger — this task is about the in-app
   live list, not about notifications; don't touch the push-sending code.

---

## Subtask A — `StaffSosScreen`

- New `mobile/src/screens/staff/StaffSosScreen.tsx`, added as a tab (or a
  screen reachable from `StaffHomeScreen` — your call on the exact nav
  placement, but it needs to be reachable within one tap of the staff
  home screen given how time-sensitive this screen is) in `StaffMainTabs`.
- On mount: fetch `GET /sos/tenants/:tenantId` (tenantId from
  `user.tenantId`, same as the resident screens already do), connect the
  shared socket, emit `sos:join` with the tenant id, listen for
  `sos:alert:triggered`/`sos:alert:updated` and update the list exactly
  like the web dashboard's handlers do (new alert prepended/updated,
  existing alert updated in place by id).
- List each alert: resident name/phone, unit, elapsed time since trigger,
  status. Tapping an active alert opens a resolve action (status +
  optional note, matching `ResolveSosDto`) for every role except
  `HOA_CHAIRMAN` (decision #3).
- Disconnect the socket on screen blur/unmount (mirroring the existing
  chat screen's cleanup pattern from Task 0020).

**Test:** whatever test convention this codebase already uses for mobile
screens involving API calls (check existing resident screens like
`SosHistoryScreen.tsx` for the pattern — if there's no established mobile
screen-testing convention at all, don't invent one for this task; a
manual verification described in the PR is acceptable, matching how
Task 0020's live-update behavior was also verified manually rather than
by automated test).

---

## Acceptance criteria

- A `DISPATCHER`/`SECURITY`/`HOA_ADMIN` can view and resolve SOS alerts
  for their own tenant from the mobile app, live-updating via the shared
  WebSocket room without polling.
- A `HOA_CHAIRMAN` sees the same live list but has no resolve action
  available.
- No backend changes were made — confirm this explicitly in the PR.
- `npx tsc --noEmit` clean in `mobile/`.
- Full kk/ru/en i18n parity for any new strings.

## Explicitly out of scope

- Any other staff feature (chat inbox, requests, access control) — each
  is its own follow-up task in this sequence.
- Cross-tenant SOS visibility for `SUPERADMIN` on mobile — out of scope
  per [Task 0024](0024-mobile-staff-mode-foundation.md)'s decision #1.
- Any change to `sos.service.ts`, `sos.controller.ts`, or
  `RealtimeGateway` — this task only consumes existing backend surface.

## Deliverable

- One commit or PR.
- PR description confirms live-update behavior was verified manually
  (e.g. triggering an SOS alert as a resident on one device/tab while
  watching it appear on this new mobile screen without a refresh), same
  verification style Task 0020 used.

---

## Review addendum (2026-09-10) — the screen itself is solid; blocked on 0024

**Verified good — `StaffSosScreen` itself:** exactly zero backend
changes (confirmed via `git status` — only `mobile/src/api/sos.ts` client
additions), hitting precisely the existing `GET /sos/tenants/:tenantId`
and `PATCH /sos/:id/resolve` endpoints. `isChairman` correctly hides both
resolve/false-alarm action buttons and shows a read-only notice banner —
mirrors the web dashboard's rule exactly, not relaxed. Socket
connect/reconnect/join/leave lifecycle matches the established pattern
from Task 0020/0024 (no polling, one reconciliation fetch on
connect/reconnect, dedup-by-id on both `sos:alert:triggered` and
`sos:alert:updated`, `sos:leave` emitted and socket disconnected on
blur/unmount). Call-resident (`tel:`) and open-in-maps links are a
sensible, in-scope addition for the "on patrol" use case this task was
built for. `tsc --noEmit` clean, i18n parity confirmed as part of
Task 0024's combined check.

**Not independently acceptable right now:** this task is built entirely
on top of [Task 0024](0024-mobile-staff-mode-foundation.md)'s
`StaffMainTabs`/`isStaffRole`/socket-helper foundation, and that task's
addendum found a CRITICAL unscoped Expo/React Native/React major-version
upgrade bundled into the same diff. Until that's reverted or explicitly
justified, this screen's real-world safety can't be signed off — a
native-level regression from that upgrade could affect this screen (or
any other) in ways `tsc --noEmit` cannot reveal. Nothing needs to change
in `StaffSosScreen.tsx`/`mobile/src/api/sos.ts` themselves — re-review
this task once 0024 is fixed and confirm it still works unchanged on top
of the corrected dependency set.

**Unblocked and verified (2026-09-10):** Task 0024's dependency set is
confirmed fully reverted to the pre-task Expo 51/React 18/RN 0.74
baseline, with only `socket.io-client` added cleanly. Re-ran `tsc
--noEmit` in `mobile/` on the corrected dependency set — clean.
`StaffSosScreen.tsx` and `mobile/src/api/sos.ts` required no changes of
their own. Task fully accepted.
