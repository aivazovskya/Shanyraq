# Task 0029: Mobile access log + staff guest-pass issuance

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Fourth staff feature on [Task 0024](0024-mobile-staff-mode-foundation.md)'s
foundation — **do not start until 0024/0025/0026/0027 are merged, and
[Task 0028](0028-guest-pass-staff-issuance.md) (the backend fix enabling
staff to issue guest passes at all) is merged and accepted** — this task
is only possible because that fix landed. Brings the two access-control
capabilities that are actually staff-appropriate on mobile: viewing the
entry/exit log (for `SECURITY` on patrol) and issuing a guest pass on
behalf of a resident (front-desk workflow). Device CRUD and camera
viewing are explicitly excluded — see decisions #1 and #2.

### Architecture decisions already made — do not re-litigate

1. **No device management (create/update access points, Hikvision
   health-check) on mobile.** `POST/PATCH /access/.../points`,
   `GET /access/points/:id/health-check` are `HOA_ADMIN`/`SUPERADMIN`-only,
   infrequent, config-heavy admin work (IP addresses, controller types) —
   the same reasoning that already kept tariffs/residents/analytics
   management off mobile. Stays web-only.
2. **No camera viewing on mobile for staff either — there's nothing
   working to extend.** The resident `AccessScreen.tsx`'s camera modal
   is a **mock placeholder** today (`streamMockPlaceholder` — a static
   icon and text, no real WebRTC/HLS player exists anywhere in this
   codebase). Building a real video player is a separate, much larger
   task or that would need to happen for residents and staff alike, not
   something to bolt onto this one. Don't touch camera viewing here.
3. **Two different role gates — read them off the actual backend
   `@Roles`, don't assume one blanket "staff" set covers both:**
   - Access log (`GET /access/tenant/:tenantId/logs`): `SECURITY`,
     `HOA_ADMIN`, `SUPERADMIN` only — `HOA_CHAIRMAN`/`DISPATCHER` get
     **no** access, per
     [access-control.controller.ts:88-95](../backend/src/modules/access-control/access-control.controller.ts).
     On mobile (SUPERADMIN excluded per Task 0024): `SECURITY` and
     `HOA_ADMIN` only.
   - Guest-pass issuance (`POST /access/guest-pass`, now fixed by
     Task 0028): all four staff roles (`HOA_ADMIN`, `HOA_CHAIRMAN`,
     `DISPATCHER`, `SECURITY`) can issue one for any unit in their own
     tenant — confirmed by Task 0028's own test matrix. Don't narrow this
     to match the access-log role set; they're genuinely different
     capabilities with different backend authorization.
4. **Both are separate stack screens reachable from `StaffHomeScreen`
   quick-access cards, not new tabs.** `StaffMainTabs` already has up to
   5 conditional tabs (`Home`, `Sos`, `ChatInbox`, `Requests`, `Profile`)
   for a `DISPATCHER`; adding two more tabs for this task would overcrowd
   the bottom bar for roles that qualify for everything. Register
   `StaffAccessLog` and `StaffGuestPass` in `RootStackParamList` (same
   pattern as `StaffChatThread`/`RequestDetail`), each reachable via its
   own role-gated quick-access card on `StaffHomeScreen` (decision #3's
   role sets apply per-card).
5. **Unit picker for guest-pass issuance reuses the existing tenant
   structure endpoint — no new backend needed.** Staff don't have a
   `primaryUnitId` the way residents do
   (`mobile/src/screens/access/AccessScreen.tsx`'s `handleCreateGuestPass`
   hardcodes the resident's own unit). Reuse
   `PropertiesApi.getTenantStructure(tenantId)`
   ([mobile/src/api/properties.ts](../mobile/src/api/properties.ts),
   already used by `ClaimUnitScreen.tsx` for exactly this kind of
   building/unit browsing) to let staff search/pick a
   block + unit number, then pass that unit's id to
   `AccessApi.createGuestPass`.
6. **Reuse the existing QR-result UI, don't rebuild it.** Once a pass is
   created, `AccessScreen.tsx`'s QR-code display block (the
   `react-native-qrcode-svg` result view, share button, code display) is
   generic and not resident-specific — reuse that presentation pattern
   for the staff flow rather than inventing a new one.
7. **No real-time, no polling.** Same as Task 0027's module — the access
   log has no `RealtimeGateway` room. Fetch on mount/focus with
   pull-to-refresh; don't add new socket infrastructure for this task.

---

## Subtask A — `mobile/src/api/access.ts` additions

Add `getAccessLogs(tenantId: string): Promise<AccessLogItem[]>` calling
`GET /access/tenant/:tenantId/logs`, typed against the real response
shape from `AccessControlService.getAccessLogs` (`accessPoint`,
`user` (nullable — some log entries have no associated user), `unit`
with nested `building`, `action`, `status`, `note`, `createdAt`) — check
the actual fields rather than guessing.

## Subtask B — `StaffAccessLogScreen`

- List entries for `user.tenantId`, newest first (already the case
  server-side). Each row: action type (translate `OPEN_BARRIER` /
  `VIEW_CAMERA` / `GUEST_CODE_ENTRY` etc. into readable labels), which
  access point, who (user name, or the unit if no user — e.g. a guest
  code entry), status (`SUCCESS`/`DENIED` — visually distinguish denied
  entries), timestamp.
- Reachable only for `SECURITY`/`HOA_ADMIN` (decision #3) via a
  `StaffHomeScreen` quick-access card.
- Pull-to-refresh; no socket (decision #7).

## Subtask C — `StaffGuestPassScreen`

- Reachable for all four staff roles (decision #3) via its own
  `StaffHomeScreen` quick-access card.
- Unit picker: search/select a building + unit via
  `PropertiesApi.getTenantStructure` (decision #5) — a simple searchable
  list is enough, don't over-build this into a full address-book UI.
- Guest name, optional plate number, validity window (reuse the
  resident flow's 12-hour default from
  `AccessScreen.tsx`'s `handleCreateGuestPass` unless you have a good
  reason for staff to need a custom window — note this if you deviate).
- On success, show the QR/code result using the reused presentation from
  decision #6.

---

## Acceptance criteria

- `SECURITY`/`HOA_ADMIN` can view their tenant's access log from mobile.
- `HOA_CHAIRMAN`/`DISPATCHER` see no access-log entry point.
- All four staff roles can search for any unit in their tenant and issue
  a guest pass on its behalf, ending in the same QR/code result view
  residents already get.
- Neither new screen is a tab — both are stack screens reached via
  role-gated quick-access cards on `StaffHomeScreen`.
- The resident `AccessScreen.tsx` flow (own-unit guest pass, barrier
  open, camera mock) is completely unchanged.
- No further backend changes — this task only consumes
  [Task 0028](0028-guest-pass-staff-issuance.md)'s already-fixed endpoint
  and the pre-existing `getAccessLogs`/`getTenantStructure` endpoints.
- `npx tsc --noEmit` clean in `mobile/`.
- Full kk/ru/en i18n parity for any new strings.

## Explicitly out of scope

- Device/access-point CRUD, Hikvision health-check — decision #1.
- Real camera video playback — decision #2 (pre-existing gap, not this
  task's problem to solve).
- Any further backend changes.
- A tab-bar redesign — decision #4 handles the "too many tabs" concern by
  not adding tabs at all for this task, not by restructuring existing
  tabs.

## Deliverable

- One commit or PR.
- PR description confirms manual verification: a `DISPATCHER` issuing a
  pass for a unit they don't own, and a `SECURITY` user viewing the
  tenant's access log, both from the mobile app.

---

## Review addendum (2026-09-10) — accepted, no issues found

**Verified good:** the two role gates match the backend exactly — access
log restricted to `SECURITY`/`HOA_ADMIN` (`canAccessLogs`), guest-pass
issuance open to all four staff roles (`isStaff`), each screen also adds
its own defense-in-depth unauthorized guard rather than relying solely on
the entry-point card being hidden. Neither screen became a tab — both
registered in `RootStackParamList` only, `StaffMainTabs`/`StaffTabsParamList`
confirmed untouched, avoiding the tab-bar overcrowding decision #4 was
meant to prevent. Guest-pass screen reuses `PropertiesApi.getTenantStructure`
for the unit picker (searchable by unit number/block, no new backend
endpoint), the same 12-hour validity window as the resident flow, and a
QR-result presentation closely mirroring `AccessScreen.tsx`'s existing
modal. `createGuestPass` call correctly passes the *selected* unit's id,
exercising Task 0028's fix as intended. No camera-viewing or
access-point-CRUD work was added, per decisions #1/#2. Resident
`AccessScreen.tsx` and `StaffMainTabs.tsx` both confirmed untouched via
diff; zero backend changes. `tsc --noEmit` clean, full kk/ru/en parity
(757/757/757 mobile keys). Task accepted, no fixes required.

This closes the planned mobile staff-parity sequence
(0024→0025→0026→0027→0028→0029) — SOS, dispatcher chat, service
requests, and now access log + guest-pass issuance are all available to
staff on mobile, each scoped to genuinely "on-the-go" operational work
and explicitly leaving desk-bound admin CRUD (tariffs, residents,
analytics, device management) on web.
