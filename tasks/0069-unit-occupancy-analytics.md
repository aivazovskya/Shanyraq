# Task 0069: Unit occupancy/vacancy overview analytics

**Status:** Completed
**Assignee:** Team lead (implementing directly while Antigravity is
out of quota, per the user's explicit instruction)
**Reviewer:** N/A for this task while implemented directly — an
independent review can be requested separately if desired.

## Context

Beyond-ТЗ feature. **Researched, not guessed — confirmed directly in
[schema.prisma](../backend/prisma/schema.prisma):** `Unit` (line 131)
has no occupancy flag of its own — whether a unit is "occupied" can
only be derived by checking whether it has any `UnitOwnership` row
([schema.prisma:242](../backend/prisma/schema.prisma#L242)) with
`isVerified: true` and `ownershipType: OWNER`. There is currently no
report anywhere in the app answering "how many units in this ЖК have
never been claimed/verified by an owner" — a УК planning outreach or
preparing for an ОСС (which needs an accurate `totalEligibleArea`, per
[votings.service.ts](../backend/src/modules/votings/votings.service.ts))
has no visibility into this at all today.

**Important scope clarification — this is "claimed in the platform,"
not "physically occupied."** The app has no way to know whether anyone
actually lives in a unit; it only knows whether a verified ownership
record exists. "Vacant" in this report means "no verified `OWNER`
ownership on file," matching the exact same OWNER+`isVerified` gate
this platform already relies on everywhere ownership legitimacy
matters (voting eligibility in `castVote`, the residents registry).
This must be stated plainly in the UI copy so a УК doesn't
misinterpret "vacant" as "definitely empty."

### Architecture decisions already made — do not re-litigate

1. **New method on `AnalyticsService`, not on `properties`.** This
   report is properties data (`Unit`/`Building`) interpreted through an
   ownership lens (`UnitOwnership`) — same "combines domains into one
   report" shape as every other cross-domain report in this module
   ([Task 0053](0053-booking-resource-utilization-analytics.md),
   [Task 0061](0061-staff-response-time-analytics.md)), not a change
   to `properties.service.ts`'s own `getTenantStructure` (which serves
   a different purpose — the raw building/unit tree for staff
   browsing/adding units — and is left untouched).
2. **Role gate: reuse `AnalyticsService.assertStaffAccess` exactly**
   — `SUPERADMIN`/`HOA_ADMIN`/`HOA_CHAIRMAN`, `DISPATCHER` excluded
   ([analytics.service.ts:38-62](../backend/src/modules/analytics/analytics.service.ts#L38-L62)) —
   this module's own established gate for every report, reused without
   modification, same reasoning already applied in
   [Task 0061](0061-staff-response-time-analytics.md): a
   planning/evaluative report for ЖК management, not an operational
   tool.
3. **"Occupied" = has ≥1 `UnitOwnership` with `isVerified: true AND
   ownershipType: OWNER`.** Deliberately *not* "has any ownership row
   at all" — an unverified claim in progress, or a `TENANT`/
   `FAMILY_MEMBER`-only link with no verified owner behind it, must
   still count as vacant, since verification is this platform's entire
   ownership-legitimacy gate everywhere else it matters.
4. **Single `building.findMany` with nested `units.ownerships`
   filtered inline (`where: { isVerified: true, ownershipType: OWNER }`)
   — no N+1.** One query returns everything needed; occupancy is then
   computed in memory per unit (`ownerships.length > 0`) and reduced
   into per-building and tenant-wide totals — matching this project's
   established no-N+1 discipline.
5. **Response includes a flat list of vacant units
   (`unitId`/`unitNumber`/`floor`/`blockName`), not just percentages.**
   A bare "73% occupied" number isn't actionable; a УК needs to know
   *which* units to chase. Matches
   [Task 0032](0032-finance-analytics-csv-export.md)'s `topDebtors`
   reasoning — the genuinely useful export target is the row-level
   list, not only the aggregate.
6. **Ship backend + web together in one task**, matching this
   module's own established precedent
   ([Task 0053](0053-booking-resource-utilization-analytics.md),
   [Task 0061](0061-staff-response-time-analytics.md) both shipped
   backend and a new dashboard tab in the same task) — unlike the
   moderation-style features elsewhere this session that were staged
   backend-first. Analytics tasks in this specific module have
   consistently shipped both halves together; no reason to deviate
   here.
7. **No date range — this is a point-in-time snapshot, not a
   historical report.** Unlike every other tab on this page (which all
   take a `from`/`to` period), occupancy has no time dimension: a unit
   either has a verified owner right now or it doesn't. No
   `PeriodPreset` state needed for this tab.
8. **No CSV export in this task** — matching
   [Task 0053](0053-booking-resource-utilization-analytics.md)/
   [0061](0061-staff-response-time-analytics.md)'s own staged choice to
   ship display-only first; can follow separately if actually needed.

---

## Subtask A — Backend: occupancy endpoint

In [analytics.service.ts](../backend/src/modules/analytics/analytics.service.ts),
add `getUnitOccupancyAnalytics(tenantId, user)`:

- `assertStaffAccess` (decision #2).
- `building.findMany({ where: { tenantId }, include: { units: {
  include: { ownerships: { where: { isVerified: true, ownershipType:
  OWNER } } } } }, orderBy: { blockName: 'asc' } })` (decision #4).
- For each unit, `isOccupied = unit.ownerships.length > 0` (decision
  #3). Reduce into per-building `{ buildingId, blockName, totalUnits,
  occupiedUnits, vacantUnits, occupancyPercent }` and tenant-wide
  totals of the same shape.
- Collect `vacantUnitsList` (decision #5): `{ unitId, unitNumber,
  floor, blockName }` for every unit where `isOccupied` is false,
  sorted by `blockName` then `unitNumber`.
- Return `{ tenantId, totalUnits, occupiedUnits, vacantUnits,
  occupancyPercent, byBuilding: [...], vacantUnitsList: [...] }`.

Add response interfaces to
[dto/analytics.dto.ts](../backend/src/modules/analytics/dto/analytics.dto.ts):
`BuildingOccupancyItem`, `VacantUnitItem`, `UnitOccupancyResponse`
(matching the existing pattern of response-shape interfaces already in
this file, e.g. `StaffResponseTimeAnalyticsResponse`).

In [analytics.controller.ts](../backend/src/modules/analytics/analytics.controller.ts):

- `GET /analytics/tenants/:tenantId/occupancy`, inherits the
  class-level `@Roles` (no override needed, matching every other
  method in this controller).

**Tests:** extend `analytics.service.spec.ts`:
- A building with 3 units, 2 with a verified `OWNER` ownership and 1
  with none, reports `occupiedUnits: 2`, `vacantUnits: 1`,
  `occupancyPercent: 66.67` (rounded).
- A unit with only an unverified `OWNER` ownership, or only a verified
  `TENANT`/`FAMILY_MEMBER` ownership (no verified `OWNER`), is counted
  as vacant — the two properties this task exists to get right
  (decision #3).
- `vacantUnitsList` contains exactly the vacant units' identifying
  info, correctly attributed to their building.
- Tenant-wide totals correctly sum across multiple buildings.
- `DISPATCHER`/cross-tenant/resident access is rejected (matches every
  other `assertStaffAccess`-gated endpoint in this module).

## Subtask B — Web: occupancy tab

In [analytics/page.tsx](../frontend-web/src/app/dashboard/analytics/page.tsx):

- Add a sixth tab (`'finance' | 'requests' | 'activity' | 'bookings' |
  'staff' | 'occupancy'`) — no `PeriodPreset` state for it (decision
  #7), fetched once per `tenantId`/tab-select like the other tabs'
  `useCallback` fetchers but without a period param in the URL.
- Render: a tenant-wide summary card (occupied/vacant/percent), a
  per-building breakdown table, and a "vacant units" table listing
  each unlinked unit — reusing this page's existing table styling
  (same classes `staffData`'s table already uses).
- A visible caption near the tab explaining the "claimed in the
  platform, not necessarily physically empty" distinction from the
  Context section — this is the one property most likely to be
  misread by a non-technical УК user if left unstated.
- Full kk/ru/en i18n parity for every new label.

---

## Acceptance criteria

- Occupied/vacant counts are computed correctly per the verified-OWNER
  rule (decision #3), proven by the two dedicated exclusion tests.
- The vacant-units list is actionable (identifies each unit, not just
  a count).
- `DISPATCHER` cannot access this endpoint, matching every other
  analytics endpoint's role gate.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/` and `frontend-web/`; full kk/ru/en i18n parity maintained.

## Explicitly out of scope

- CSV export — per decision #8.
- Any change to `properties.service.ts`'s `getTenantStructure` or the
  building/unit management UI — this is a new read-only report, not a
  change to how units are created/edited.
- Mobile UI — analytics has stayed web-only throughout this project.
- Historical/trend view of occupancy over time — this is a live
  snapshot only, per decision #7.

---

## Deliverable

- Backend and web can ship as separate commits.
- PR description states the exact occupied/vacant definition
  explicitly (verified `OWNER` ownership, not just any ownership row)
  — that's the property most worth calling out given decision #3.

---

## Implementation notes (2026-09-14)

Implemented exactly per the spec above.

**Backend:** `getUnitOccupancyAnalytics(tenantId, user)` added to
`analytics.service.ts` — `assertStaffAccess`, one `building.findMany`
with `units.ownerships` filtered inline to `{ isVerified: true,
ownershipType: OWNER }` (decisions #3/#4 — no N+1, no separate
per-unit query), reduced in memory into per-building totals, a
tenant-wide total, and a sorted `vacantUnitsList`.
`occupancyPercent` rounded to 2 decimals
(`Math.round(x * 10000) / 100`) to get e.g. `66.67` rather than a long
float. Three response interfaces
(`BuildingOccupancyItem`/`VacantUnitItem`/`UnitOccupancyResponse`)
added to `dto/analytics.dto.ts`, matching the file's existing pattern.
`GET /analytics/tenants/:tenantId/occupancy` added to the controller,
inheriting the class-level `@Roles` (no override, matching every
other method here).

**Web:** sixth `'occupancy'` tab added to `analytics/page.tsx` — no
`PeriodPreset` for it (decision #7, this is a point-in-time snapshot),
fetched via a `fetchOccupancy(tenantId)` callback with no date params.
Renders a 3-card summary, a per-building table, and a vacant-units
table, plus a visible disclaimer banner stating the "claimed in the
platform, not necessarily physically empty" distinction (decision #3's
Context reasoning) — this was called out in the spec as the property
most likely to be misread by a non-technical УК user, so it's
surfaced directly in the UI, not just in code comments.

Tests added to `analytics.service.spec.ts` (5 new): the 2-of-3
occupied calculation with the correct rounded percentage, the
`findMany` `where`-clause assertion for the ownerships filter (proves
unverified/non-OWNER ownerships can never count as occupied — the
central risk this task was written to guard against), the vacant-units
list shape, multi-building summation, and the standard
role/cross-tenant rejection suite (`DISPATCHER` excluded,
`HOA_CHAIRMAN`/`SUPERADMIN` allowed, matching this module's own
established gate).

**Verified:** new backend tests 43/43 (38 prior + 5 new), full backend
suite 612/612 (31 suites, 0 regressions), `tsc --noEmit` clean in both
`backend/` and `frontend-web/`, i18n parity 1104/1104/1104 across
ru/kk/en (+18 keys). Started the Next.js dev server and confirmed
`/dashboard/analytics` compiles cleanly (1610 modules) with zero
browser console errors — same compile-level verification approach used
for Task 0065, since this environment has no reachable database for a
full authenticated interactive run.

**Not verified:** the actual rendered table/summary cards were not
visually inspected against real data (no live database in this
environment to log in and view real occupancy numbers) — verification
here relies on the backend test suite's correctness plus the
successful compile/render of the new JSX, not a live visual check.

**Caveat:** implemented and verified by the same person (the
architect, standing in for Antigravity while it's out of quota) — no
independent second-pass review, same as every self-implemented task
this session (0056-0061, 0064-0068). Ask separately if one is wanted.
