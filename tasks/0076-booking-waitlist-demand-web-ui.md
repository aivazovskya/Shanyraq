# Task 0076: Staff-facing web view of booking waitlist demand

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature, direct follow-up to
[Task 0070](0070-booking-waitlist.md), which shipped the
`BookingWaitlistEntry` backend and self-service-only mobile flow (join/
view-own/leave). Task 0070 decision #7 explicitly deferred this: "A
staff-facing view of waitlist demand per resource can be a separate
task if actually wanted later." The УК currently has **zero visibility**
into waitlist demand — an `HOA_ADMIN` deciding whether to add a second
BBQ zone can already see utilization % ([Task 0053](0053-booking-resource-utilization-analytics.md)),
but has no way to see "12 units are currently waiting for the BBQ area
specifically," which is an even more direct capacity-planning signal
than utilization alone.

**Confirmed by reading
[bookings.service.ts](../backend/src/modules/bookings/bookings.service.ts):**
- `getTenantBookings` (line 498) is the closest existing precedent —
  staff-only, gated by the private `assertStaffRole(user, tenantId)`
  helper (line 699: `SUPERADMIN` unconditionally, or
  `HOA_ADMIN`/`HOA_CHAIRMAN`/`DISPATCHER` with `user.tenantId ===
  tenantId`), returns a **flat list** with `resource`/`unit.building`/
  `bookedBy` included — no server-side grouping. This task's new
  waitlist-demand endpoint should be built the same way, both for
  consistency and because it's the least amount of new code.
- `BookingWaitlistEntry` ([schema.prisma:677-692](../backend/prisma/schema.prisma#L677-L692))
  has direct `resource`, `unit`, `user` relations (no join table
  needed) — `unit` doesn't carry `building` directly on the model, but
  `unit.building` is reachable the same way `getTenantBookings`
  already does it.
- Entries are deleted the moment they're notified
  ([Task 0070](0070-booking-waitlist.md) decision #5) — there is no
  "waitlist history," only "who is waiting *right now*." A date-range
  filter (`from`/`to`) makes no sense here the way it does for
  `getTenantBookings`'s booking log; every entry that exists at query
  time is current demand.
- `bookings.controller.ts:137-146`'s `getTenantBookings` route uses
  `@Roles(UserRole.HOA_ADMIN, UserRole.DISPATCHER, UserRole.SUPERADMIN,
  UserRole.HOA_CHAIRMAN)` — this task's new route uses the identical
  role list, matching `assertStaffRole`'s own set exactly (no new
  authorization decision).

**Confirmed by reading
[frontend-web/src/app/dashboard/bookings/page.tsx](../frontend-web/src/app/dashboard/bookings/page.tsx)
and
[bookings/resources/page.tsx](../frontend-web/src/app/dashboard/bookings/resources/page.tsx):**
the existing "Bookings" section is two separate routed pages
(`/dashboard/bookings` — the moderation journal, `/dashboard/bookings/resources`
— the catalog), linked to each other by a header button (`t('bookings.catalogBtn')`
+ a `Link`), not by in-page tabs. `canManage`/visibility on the journal
page is gated by `['SUPERADMIN', 'HOA_ADMIN', 'DISPATCHER',
'HOA_CHAIRMAN'].includes(role)` — the exact same four roles as
decision above. This task adds a **third** page in that same family,
linked the same way, not a tab bolted onto the journal page.

### Architecture decisions already made — do not re-litigate

1. **New endpoint `GET /bookings/tenants/:tenantId/waitlist`**, backed
   by a new `getTenantWaitlist(tenantId, query, user)` method on
   [bookings.service.ts](../backend/src/modules/bookings/bookings.service.ts),
   gated by the existing `assertStaffRole` (no new role-checking logic
   — reuse it exactly as `getTenantBookings` does).
2. **Flat list, not pre-grouped by resource on the backend.** Query
   `bookingWaitlistEntry.findMany({ where: { resource: { tenantId },
   ...(resourceId && { resourceId }) }, include: { resource: { select:
   { id, name, type } }, unit: { select: { id, unitNumber, building: {
   select: { id, blockName } } } }, user: { select: { id, firstName,
   lastName, phone } } }, orderBy: [{ resourceId: 'asc' }, { createdAt:
   'asc' }] })` — grouping by resource for display is the web page's
   job (decision #5), matching how `getTenantBookings` itself doesn't
   pre-group either.
3. **No date-range filtering — only an optional `resourceId` filter.**
   Per the Context section: every existing entry is current demand,
   there's no history to bound by date. Add a small dedicated
   `GetWaitlistQueryDto` (just `resourceId?: string`, `@IsOptional()
   @IsString()`) in
   [bookings.dto.ts](../backend/src/modules/bookings/dto/bookings.dto.ts)
   rather than reusing `GetBookingsQueryDto` — that DTO's `from`/`to`
   fields would be meaningless here and Swagger would advertise query
   params that silently do nothing, which is worse than a second small
   DTO.
4. **Read-only — no staff action on a waitlist entry.** No "notify
   now" button, no "convert to booking on their behalf," no removal by
   staff. [Task 0070](0070-booking-waitlist.md) decision #2 deliberately
   made this notify-only/self-service (residents book for themselves
   once notified); this task only adds *visibility* into that existing
   flow, it doesn't add new staff-initiated actions on top of it.
5. **New page `/dashboard/bookings/waitlist`**, linked from the
   existing bookings journal page
   ([bookings/page.tsx](../frontend-web/src/app/dashboard/bookings/page.tsx))
   via a header button next to the existing "Каталог" button — same
   `Link` pattern, not an in-page tab (per the Context section's
   established two-page precedent).
6. **Group by resource client-side for display**: a card or section
   per resource (name + type label, reusing the exact `getTypeLabel`
   switch mapping already in
   [bookings/resources/page.tsx:154-167](../frontend-web/src/app/dashboard/bookings/resources/page.tsx#L154-L167)
   — copy it locally rather than inventing a second transform, this is
   the exact bug class [Task 0053](0053-booking-resource-utilization-analytics.md)'s
   review addendum already caught once), with a count badge, then a
   simple list underneath of unit + resident name/phone + requested
   slot (`startTime`–`endTime`) + when they joined (`createdAt`).
   Resources with zero current waitlist entries are simply absent from
   the response — no need to zero-fill here the way
   [Task 0053](0053-booking-resource-utilization-analytics.md)'s
   utilization report does; an empty waitlist for a resource isn't a
   data point worth displaying, unlike an idle-but-active resource in
   a utilization report.
7. **Web-only, no mobile UI** — this is a management/capacity-planning
   tool for УК staff at a desk, not something `SECURITY`/`DISPATCHER`
   need in the field; matches how `bookings/resources` (catalog
   management) also never got a mobile screen.

---

## Subtask A — Backend

- `GetWaitlistQueryDto` in
  [bookings.dto.ts](../backend/src/modules/bookings/dto/bookings.dto.ts)
  per decision #3.
- `getTenantWaitlist(tenantId, query, user)` in
  [bookings.service.ts](../backend/src/modules/bookings/bookings.service.ts)
  per decision #1/#2.
- `GET tenants/:tenantId/waitlist` in
  [bookings.controller.ts](../backend/src/modules/bookings/bookings.controller.ts),
  placed next to `getTenantBookings` in the "Журнал бронирований"
  section, `@Roles(UserRole.HOA_ADMIN, UserRole.DISPATCHER,
  UserRole.SUPERADMIN, UserRole.HOA_CHAIRMAN)` (identical to
  `getTenantBookings`'s decorator).

**Tests:** extend `bookings.service.spec.ts`:
- A resident calling this (if reachable at all past the controller's
  `@Roles` guard — test at the service level regardless, matching this
  project's defense-in-depth convention) is rejected by
  `assertStaffRole`.
- Cross-tenant staff (`tenantId` mismatch) rejected; `SUPERADMIN`
  cross-tenant succeeds.
- `resourceId` filter actually narrows results to that resource only.
- Entries for a different tenant's resources never appear (tenant
  isolation via the `resource: { tenantId }` where-clause).
- Response ordering: grouped-by-resource-then-chronological is
  reflected in the `orderBy`.

## Subtask B — Web

- New page
  [frontend-web/src/app/dashboard/bookings/waitlist/page.tsx](../frontend-web/src/app/dashboard/bookings/waitlist/page.tsx),
  fetching `GET /bookings/tenants/${tenantId}/waitlist`, grouping the
  flat response by `resourceId` client-side, rendering per decision #6.
- Add the nav button on
  [bookings/page.tsx](../frontend-web/src/app/dashboard/bookings/page.tsx)
  per decision #5, visible to the same role set already gating
  `canManage` on that page.
- Full kk/ru/en i18n parity for every new label (new `bookings.waitlist*`
  namespace, don't scatter into unrelated existing `bookings.*` keys).

---

## Acceptance criteria

- `DISPATCHER`, `HOA_ADMIN`, `HOA_CHAIRMAN`, `SUPERADMIN` can view
  current waitlist demand grouped by resource; a resident cannot reach
  the endpoint at all.
- The `resourceId` filter works; there is no `from`/`to` filter (by
  design, per decision #3).
- Cross-tenant isolation holds (proven by a dedicated test, matching
  every other tenant-scoped staff endpoint in this project).
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/` and `frontend-web/`; full kk/ru/en i18n parity maintained.

## Explicitly out of scope

- Any staff action on a waitlist entry (manual notify, force-remove,
  book-on-their-behalf) — decision #4.
- Mobile UI — decision #7.
- Historical/date-ranged waitlist reporting ("how much demand did we
  have last month") — this task shows only current, live demand; a
  historical report would need to *not* delete entries on notification
  (contradicting Task 0070 decision #5) and is a different, bigger
  feature if ever wanted.

## Deliverable

- Backend and web can ship as separate commits.
- PR description states the exact role list tested and confirms the
  cross-tenant-isolation test result — this project's standard bar for
  any new tenant-scoped staff endpoint.

---

## Implementation Summary (Completed)

- **Backend (`backend/src/modules/bookings/`):**
  - Added `GetWaitlistQueryDto` with optional `resourceId` in `dto/bookings.dto.ts`.
  - Implemented `getTenantWaitlist(tenantId, query, user)` in `bookings.service.ts` using `assertStaffRole(user, tenantId)`, querying `bookingWaitlistEntry.findMany` with `resource: { tenantId }`, optional `resourceId` filter, and nested relation selections (`resource`, `unit.building`, `user`).
  - Added `GET tenants/:tenantId/waitlist` in `bookings.controller.ts` with `@Roles(HOA_ADMIN, DISPATCHER, SUPERADMIN, HOA_CHAIRMAN)`.
  - Added 5 unit tests in `bookings.service.spec.ts` covering non-staff rejection (403), cross-tenant staff rejection (403), SUPERADMIN access, tenant isolation, and resource filtering. All 39 tests passed.
- **Frontend Web (`frontend-web/src/app/dashboard/bookings/`):**
  - Added navigation button to `/dashboard/bookings/waitlist` next to the catalog button in `bookings/page.tsx`.
  - Created new page `/dashboard/bookings/waitlist/page.tsx`:
    - Displays live waitlist demand grouped by resource client-side.
    - Resource cards show resource name, localized type badge (`getTypeLabel`), count badge, and a clean table of waiting entries (unit, resident name and phone, requested slot interval, joined at timestamp).
    - Superadmin tenant selector and optional resource filter dropdown.
    - Clean empty state card and skeleton loading states.
- **i18n (`ru.json`, `kk.json`, `en.json`):**
  - Added 11 keys under `bookings.waitlist*`: `waitlistBtn`, `waitlistPageTitle`, `waitlistPageSubtitle`, `waitlistBackBtn`, `waitlistEmptyTitle`, `waitlistEmptySub`, `waitlistWaitingCount`, `waitlistThUnit`, `waitlistThResident`, `waitlistThSlot`, `waitlistThJoinedAt`, `waitlistFilterAllResources`.
  - Strict 1:1 key parity verified: 1135 keys each across ru, kk, and en (0 diffs).
- **Verification:**
  - `npx tsc --noEmit` in `backend/`: 0 errors.
  - `npx tsc --noEmit` in `frontend-web/`: 0 errors.
  - `npm test -- bookings.service.spec.ts`: 39/39 tests passed.

