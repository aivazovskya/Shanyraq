# Task 0027: Mobile service-request management (staff)

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Third staff feature on [Task 0024](0024-mobile-staff-mode-foundation.md)'s
foundation — **do not start until 0024/0025/0026 are merged**. Today,
staff can only triage service requests from the web dashboard
([frontend-web/src/app/dashboard/requests/page.tsx](../frontend-web/src/app/dashboard/requests/page.tsx));
this brings status-change/assignment to mobile.

### Architecture decisions already made — do not re-litigate

1. **Access model — read narrower than write, and `SECURITY` has none:**
   confirmed by reading [service-requests.controller.ts](../backend/src/modules/service-requests/service-requests.controller.ts)
   and [service-requests.service.ts](../backend/src/modules/service-requests/service-requests.service.ts):
   - View list/detail: `SUPERADMIN`, `HOA_ADMIN`, `HOA_CHAIRMAN`,
     `DISPATCHER` — `SECURITY` is in **none** of the staff role lists for
     this module, so a `SECURITY` user has zero access to service
     requests (matches them not handling maintenance tickets). Hide the
     requests entry point entirely for `SECURITY` — same pattern as
     hiding chat for `HOA_CHAIRMAN`/`SECURITY` in Task 0026.
   - Change status: `@Roles(DISPATCHER, HOA_ADMIN, SUPERADMIN)` only on
     `PATCH :id/status` — `HOA_CHAIRMAN` can view but not act, the same
     read-only pattern already established for SOS and analytics.
   - Add comment: any authenticated user, no extra role check — both
     residents and staff post into the same comment thread.
2. **Match what the web dashboard actually does today — status only, not
   assignment.** `UpdateRequestStatusDto` technically also accepts an
   `assigneeId`, but the web dashboard's own `handleStatusChange`
   ([requests/page.tsx:125](../frontend-web/src/app/dashboard/requests/page.tsx))
   never sends one — there is no "assign to a technician" UI anywhere in
   this codebase today, on any platform, because there's no source for
   "who can be assigned" (no technician roster/picker exists). Building
   that here would be new scope beyond parity with the existing reference
   implementation. **This task is status-change only** — leave
   `assigneeId` alone. If assignment is wanted later, that's a
   fuller feature (needs a staff/technician picker) worth its own task
   on both platforms, not something to improvise here.
3. **Extend the existing `RequestDetailScreen`, don't fork a separate
   staff screen.** Unlike chat (list vs. single-thread are genuinely
   different shapes) or SOS/profile (resident-only data), viewing a
   request and posting a comment is identical for both audiences — the
   backend itself serves both through the same
   `GET /service-requests/:id` and `POST /service-requests/:id/comments`
   endpoints. Add a staff-only status-change section to
   [RequestDetailScreen.tsx](../mobile/src/screens/requests/RequestDetailScreen.tsx)
   (visible for `DISPATCHER`/`HOA_ADMIN`, hidden — not disabled — for
   everyone else) rather than building `StaffRequestDetailScreen`.
4. **Fix a real bug you'll otherwise inherit:** `RequestDetailScreen`'s
   "rate the master" section currently renders for *anyone* viewing a
   resolved, unrated request (`isResolved && !hasRated`, no ownership
   check) — harmless today because only the request's own creator could
   ever see this screen. Once staff can view the same screen, a
   `DISPATCHER` would see a "rate this request" prompt meant for the
   resident. Gate that section on `request.creatorId === user.id` as
   part of this change.
5. **`RequestDetail` needs registering under the staff navigator
   branch too.** Today it only exists in `RootNavigator`'s resident
   branch. Since decision #3 keeps it as one shared screen, add
   `<Stack.Screen name="RequestDetail" component={RequestDetailScreen} />`
   to the `isStaffRole` branch as well (same component, reused).
6. **No polling — but note this module doesn't have WebSocket rooms of
   its own yet.** Unlike SOS/chat, [Task 0020](0020-realtime-websocket.md)
   never built real-time for service requests. Don't add new
   `RealtimeGateway` rooms/events in this task — that's out of scope
   (real-time for this module, if wanted, is a separate future task).
   Just fetch on mount/focus like every screen in this codebase did
   before Task 0020, with pull-to-refresh — this one module staying on
   the "fetch on focus" model is an accepted, deliberate gap, not an
   oversight.

---

## Subtask A — `mobile/src/api/service-requests.ts` additions

- Add `updateStatus(requestId: string, status: RequestStatus):
  Promise<ServiceRequestItem>` calling `PATCH /service-requests/:id/status`
  with `{ status }` only (decision #2 — no `assigneeId`).
- Optionally extend `getRequests` to accept a `status` filter param if
  you're building filter tabs on the list screen (Subtask B) — check the
  controller's `@Query('status')` support, already there.

## Subtask B — `StaffRequestsListScreen`

- New screen listing the tenant's requests (`ServiceRequestsApi.getRequests()`
  — no `tenantId` needs passing; the backend already scopes by the
  caller's own `tenantId` for staff roles, ignoring any client-supplied
  value, so don't bother threading one through).
- Status filter (tabs or a segmented control) matching the categories
  already shown in `RequestDetailScreen`'s status badge logic
  (`PENDING`/`ASSIGNED`/`IN_PROGRESS`/`RESOLVED`/`REJECTED`/`CLOSED`).
- Each row: title, category/priority, requester unit, status badge,
  timestamp. Tapping navigates to `RequestDetail` with the request id.
- Pull-to-refresh; no socket (decision #6).

## Subtask C — Staff status-change section in `RequestDetailScreen`

- Add a section (visible only when `user.role` is `DISPATCHER` or
  `HOA_ADMIN` — check via `useAuth()`) with buttons/a picker for the
  next status, calling the new `updateStatus` method and refreshing the
  detail view on success.
- Fix the rating-section ownership gate (decision #4) in the same pass —
  it's a one-line condition change, don't skip it because it "was already
  like that."
- `HOA_CHAIRMAN` viewing this screen sees everything except this new
  status-change section — same as before, no new gate needed on the
  read-only parts since they were already accessible to whoever the
  backend already let load `getRequestById`.

## Subtask D — Navigation wiring

- Register `RequestDetail` in `RootNavigator`'s staff branch (decision
  #5).
- Add `RequestsTab` to `StaffTabsParamList`/`StaffMainTabs`, rendered
  only for `DISPATCHER`/`HOA_ADMIN`/`HOA_CHAIRMAN` (not `SECURITY` — 
  decision #1). Add a matching quick-access card on `StaffHomeScreen`
  with the same condition.

---

## Acceptance criteria

- `DISPATCHER`/`HOA_ADMIN` can view their ЖК's requests, open one, change
  its status, and comment — from mobile.
- `HOA_CHAIRMAN` sees the same list/detail but no status-change controls.
- `SECURITY` sees no requests entry point anywhere in the staff UI.
- A staff member viewing a resolved, unrated request does **not** see the
  "rate the master" prompt.
- The resident flow (`CreateRequestScreen`, viewing/commenting on their
  own requests) is unchanged.
- No backend or `RealtimeGateway` changes — confirm explicitly in the PR.
- `npx tsc --noEmit` clean in `mobile/`.
- Full kk/ru/en i18n parity for any new strings.

## Explicitly out of scope

- Assignment/technician picker — see decision #2.
- Real-time updates for this module — see decision #6.
- Any other staff feature (access-control management is the next task in
  this sequence).

## Deliverable

- One commit or PR.
- PR description explicitly calls out the rating-section bug fix
  (decision #4) as a fix, not just incidental, since it's a real
  pre-existing defect this task's changes make user-visible for a new
  audience.

---

## Review addendum (2026-09-10) — accepted, no issues found

**Verified good:** `updateStatus` sends `{ status }` only, no `assigneeId`
— matches decision #2 exactly. The rating-section ownership bug is fixed
precisely as specified: `isResolved && !hasRated && user?.id ===
request.creatorId`. Status-change section correctly gated to
`DISPATCHER`/`HOA_ADMIN` only (matching the backend's `@Roles` on `PATCH
:id/status`, `SUPERADMIN` correctly omitted since it never reaches mobile
staff mode per Task 0024). `RequestDetailScreen` extended in place rather
than forked, exactly as decided — one shared component, no duplication.
`RequestDetail` correctly registered under `RootNavigator`'s staff branch
too (previously resident-only). `RequestsTab` and the `StaffHomeScreen`
quick-access card both correctly include `HOA_CHAIRMAN` (view-only, no
status controls once inside) and both correctly exclude `SECURITY`,
matching the read-list/no-list-at-all split from decision #1. No
WebSocket rooms added (decision #6 respected — this module intentionally
stays fetch-on-focus). `getRequests`'s signature extension is
backward-compatible (still accepts a bare `tenantId` string, adds an
optional `{ status, tenantId }` object form) — confirmed no existing call
site broke. Zero backend changes, resident `CreateRequestScreen.tsx`
confirmed untouched. `tsc --noEmit` clean, full kk/ru/en parity
(716/716/716 mobile keys, +14 new `staff.requests.*`/`staff.requestsTab`
keys). Task accepted, no fixes required.
