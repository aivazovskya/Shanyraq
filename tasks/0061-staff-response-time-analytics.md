# Task 0061: Per-staff response time analytics

**Status:** Completed
**Assignee:** Team lead (implementing directly while Antigravity is
out of quota, per the user's explicit instruction)
**Reviewer:** N/A for this task while implemented directly — an
independent review can be requested separately if desired.

## Context

Beyond-ТЗ feature. **Researched, not guessed — confirmed directly in
[schema.prisma](../backend/prisma/schema.prisma):** both
`ServiceRequest` (`assigneeId`, `status`, `createdAt`, `updatedAt`,
`tenantId` direct — no join needed) and `SosAlert` (`resolvedById`,
`resolvedAt`, `createdAt`, `tenantId` direct) already carry a
per-record actor and timestamps sufficient to compute a
per-staff-member resolution time. Right now
[`getRequestsAnalytics`](../backend/src/modules/analytics/analytics.service.ts#L364-L464)
and
[`getSosStatistics`](../backend/src/modules/sos/sos.service.ts#L218-L314)
already compute this exact duration formula (`updatedAt - createdAt`
for requests, `resolvedAt - createdAt` for SOS) but only as one
ЖК-wide average — there is no breakdown by *which* staff member is
fast or slow. This task adds that breakdown as a new cross-domain
analytics report.

### Architecture decisions already made — do not re-litigate

1. **New method on `AnalyticsService`, not on `service-requests` or
   `sos`.** This combines two domains' data into one report — same
   shape as every other cross-domain report in this module
   (`getActivityAnalytics`, [Task 0053](0053-booking-resource-utilization-analytics.md)) —
   not a change to either domain's own service.
2. **Reuse `assertStaffAccess` (`SUPERADMIN`/`HOA_ADMIN`/
   `HOA_CHAIRMAN`, `DISPATCHER` excluded) — the analytics module's own
   established gate, not `sos`'s `assertStaffOrChairmanRole` (which
   includes `SECURITY`/`DISPATCHER`) or `service-requests`' own
   `isStaff` set.** This is intentionally the stricter, management-only
   gate even though the report is *about* `DISPATCHER`/`SECURITY`
   performance — it's an evaluative report for ЖК management to review
   their team, not a self-service view for staff to see their own
   ranking (same reasoning `analytics` has excluded `DISPATCHER`
   from every report in this module since [Task 0013](0013-analytics.md)).
3. **Two independent metrics per staff member, not one blended
   "score."** A `ServiceRequest` resolution (hours) and an `SosAlert`
   response (minutes) are different units measuring different kinds of
   work — inventing a combined ranking formula would be arbitrary and
   unrequested. Report both numbers side by side per staff member;
   sort by total items handled (`requestsResolvedCount +
   sosResolvedCount`, descending) as the one sensible default ordering
   that doesn't privilege either metric.
4. **No zero-fill roster.** Unlike
   [Task 0050](0050-resident-activity-csv-export.md)'s resident
   activity export (where "every resident" is a well-defined
   population — `RESIDENT_OWNER`/`RESIDENT_TENANT` users of the
   tenant), there is no equivalent canonical "roster of staff eligible
   to resolve requests/SOS" — `assigneeId`/`resolvedById` can point to
   any `User`. Only staff who appear in at least one of the two
   datasets for the period are included; a staff member with zero
   activity in both simply doesn't appear (there's no defined
   population to zero-fill against).
5. **No `groupBy` for the duration averages — same reasoning as
   [Task 0053](0053-booking-resource-utilization-analytics.md)
   decision #5.** Prisma can't average `updatedAt - createdAt` or
   `resolvedAt - createdAt` in an aggregate. Fetch matching
   `ServiceRequest` rows (`assigneeId` not null, `status: {in:
   [RESOLVED, CLOSED]}`, date-range filtered) in **one** `findMany`,
   and matching `SosAlert` rows (`resolvedById` not null, `resolvedAt`
   not null, date-range filtered) in **one** `findMany`, then reduce
   each into a `Map<staffId, {count, totalHours/Minutes}>` in memory —
   not a per-staff-member loop.
6. **One more `findMany` on `User` for the names/roles of whichever
   staff ids actually appear** (`where: { id: { in: [...] } }`) — a
   single batch lookup, not `staffIds.length` individual queries.
7. **Same date-range convention as the rest of the module** —
   `DateRangeAnalyticsQueryDto`'s `from`/`to`, default last 30 days,
   filtered on each source table's own `createdAt` (matching how
   `getRequestsAnalytics`/`getSosStatistics` already scope their own
   date ranges).
8. **JSON endpoint + web table only — no CSV export in this task**,
   matching how [Task 0053](0053-booking-resource-utilization-analytics.md)
   also shipped display-only; an export can follow separately if ever
   needed.

---

## Subtask A — Backend: staff response time endpoint

In [analytics.service.ts](../backend/src/modules/analytics/analytics.service.ts),
add `getStaffResponseTimeAnalytics(tenantId, user, query?:
DateRangeAnalyticsQueryDto)`:

- `assertStaffAccess`, resolve `from`/`to` (decision #7).
- Fetch resolved `ServiceRequest` rows (decision #5): `select:
  {assigneeId, createdAt, updatedAt}`, `where: {tenantId, assigneeId:
  {not: null}, status: {in: [RESOLVED, CLOSED]}, createdAt: {gte:
  from, lte: to}}`. Reduce into
  `Map<staffId, {count, totalHours}>` using the exact duration formula
  `getRequestsAnalytics` already uses.
- Fetch resolved `SosAlert` rows: `select: {resolvedById, createdAt,
  resolvedAt}`, `where: {tenantId, resolvedById: {not: null},
  resolvedAt: {not: null}, createdAt: {gte: from, lte: to}}`. Reduce
  into `Map<staffId, {count, totalMinutes}>` using the exact duration
  formula `getSosStatistics` already uses.
- Union of both maps' keys = the staff ids to report on (decision #4).
  Batch-fetch `User` rows for those ids (decision #6): `id`,
  `firstName`, `lastName`, `role`.
- Build the response rows: `staffId`, `staffName`, `staffRole`,
  `requestsResolvedCount`, `avgRequestResolutionHours` (0 if the staff
  member has no entries in the requests map), `sosResolvedCount`,
  `avgSosResponseMinutes` (0 if none in the SOS map).
- Sort per decision #3.
- Return `{ from, to, staff: [...] }`.

In [analytics.controller.ts](../backend/src/modules/analytics/analytics.controller.ts):

- `GET /analytics/tenants/:tenantId/staff-performance?from=&to=`,
  inherits the class-level `@Roles` (decision #2, no override needed).

**Tests:** extend `analytics.service.spec.ts` —
- A staff member who resolved 3 requests (known individual durations)
  and 0 SOS alerts shows the correct `avgRequestResolutionHours` and
  `sosResolvedCount: 0`, `avgSosResponseMinutes: 0` — not omitted for
  having zero SOS activity.
- A `ServiceRequest` still `PENDING`/`ASSIGNED`/`IN_PROGRESS` (not yet
  resolved) is excluded from the request-duration calculation, even if
  it has an `assigneeId`.
- An `SosAlert` with `status: ACTIVE` (`resolvedAt: null`) is excluded
  from the SOS calculation.
- A staff member with activity in both requests and SOS shows both
  metrics correctly, attributed to the same `staffId` row (not two
  separate rows).
- Sort order matches decision #3 (total handled count, descending).
- `DISPATCHER`/cross-tenant/resident access is rejected (matches every
  other `assertStaffAccess`-gated endpoint in this module).

## Subtask B — Web: staff performance tab

In [analytics/page.tsx](../frontend-web/src/app/dashboard/analytics/page.tsx):

- Add a fifth tab (`'finance' | 'requests' | 'activity' | 'bookings' |
  'staff'`), reusing the existing `PeriodPreset`/`getPresetDates`
  pattern.
- Render a table: staff name, role, requests resolved, avg request
  resolution time, SOS resolved, avg SOS response time — sorted as the
  API already returns it.
- Full kk/ru/en i18n parity for every new label.

---

## Acceptance criteria

- Both metrics (request resolution, SOS response) are computed
  correctly and independently per staff member — proven by the
  dual-activity test.
- Non-terminal requests and unresolved SOS alerts never contribute to
  the averages — proven by the two exclusion tests.
- `DISPATCHER` cannot access this endpoint, matching every other
  analytics endpoint's role gate.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/` and `frontend-web/`; full kk/ru/en i18n parity maintained.

## Explicitly out of scope

- A single blended "speed score" combining both metrics — per decision
  #3.
- CSV export — per decision #8.
- Mobile UI — analytics management has stayed web-only throughout this
  project.
- Any change to `getRequestsAnalytics`/`getSosStatistics`'s own
  ЖК-wide averages — this task adds a new, separate breakdown, it
  doesn't touch those.

---

## Deliverable

- Backend and web can ship as separate commits.
- PR description states both duration formulas explicitly and
  confirms the dual-activity (both metrics on one row) test result —
  that's the property most worth calling out given decision #5's
  two-independent-map merge.

---

## Implementation notes (2026-09-12)

Implemented exactly per the spec above.

**Backend:** `getStaffResponseTimeAnalytics` added to
[analytics.service.ts](../backend/src/modules/analytics/analytics.service.ts) —
`assertStaffAccess`, one `serviceRequest.findMany`
(`assigneeId: {not:null}`, `status: {in:[RESOLVED,CLOSED]}`,
date-ranged) reduced into a `Map`, one `sosAlert.findMany`
(`resolvedById: {not:null}`, `resolvedAt: {not:null}`, date-ranged)
reduced into a second `Map`, union of both maps' keys, one batched
`user.findMany` for names/roles, sorted by total handled count
descending. `GET /analytics/tenants/:tenantId/staff-performance` added
to
[analytics.controller.ts](../backend/src/modules/analytics/analytics.controller.ts),
inheriting the class-level `@Roles` (no override).

**Web:** fifth `'staff'` tab added to
[analytics/page.tsx](../frontend-web/src/app/dashboard/analytics/page.tsx)
with the `PeriodPreset`/`getPresetDates` pattern reused, a table of
staff/role/counts/avg-times. **Role labels reuse the exact
`getRoleLabel` switch already used by the dashboard sidebar**
([layout.tsx:89-102](../frontend-web/src/app/dashboard/layout.tsx#L89-L102))
rather than a mechanical string transform — this was a deliberate fix
made *during* this implementation, having learned from the review
finding on Task 0053 (where a mechanical enum→i18n-key transform broke
for values that didn't match the actual key naming). `HOA_ADMIN`
specifically has no dedicated `roles.*` key and correctly falls
through to `roles.management_company`, matching the sidebar's own
`default` case exactly — not a raw enum string.

Tests added to `analytics.service.spec.ts` (6 new): zero-fill-free
correct averaging for a requests-only staff member, exclusion of
non-terminal requests and unresolved SOS alerts (via `where`-clause
assertions), a dual-activity staff member showing both metrics on one
row, the total-count sort order, and the standard
role/cross-tenant rejection suite.

**Verified:** new backend tests 38/38 (32 prior + 6 new), full backend
suite 541/541 (31 suites, 0 regressions), `tsc --noEmit` clean in both
`backend/` and `frontend-web/`, i18n parity 1075/1075/1075 across
ru/kk/en (+14 keys).

**Not verified:** no live dev server/database in this environment
(same limitation as Task 0057's `prisma db push`), so the new "staff"
tab was not exercised in an actual browser — verification here relies
on `tsc` cleanliness, the reused-not-reinvented role-label logic, and
a full line-by-line read of the new JSX rather than a live render.

**Caveat:** implemented and verified by the same person (the
architect, standing in for Antigravity while it's out of quota) — no
independent second-pass review, same as Tasks 0056-0060. Ask
separately if one is wanted.
