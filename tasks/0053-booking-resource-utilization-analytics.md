# Task 0053: Bookable resource utilization analytics

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature. **Researched, not guessed — confirmed directly in
[schema.prisma](../backend/prisma/schema.prisma):** `BookableResource`
(`operatingHoursStart`/`operatingHoursEnd` — optional `"HH:mm"`
strings, `isActive`) and `Booking` (`resourceId`, `startTime`,
`endTime`, `status: CONFIRMED | CANCELLED`). There is currently no
report showing which resources (barbecue area, coworking, guest
parking, etc.) are actually in demand versus sitting idle — an HOA
admin deciding whether to add a second BBQ zone or drop an unused
coworking room has no data to go on beyond eyeballing the raw booking
list.

This task adds a new analytics report: **per-resource utilization**
over a date range — booking count, total booked hours, and percentage
of available operating time actually booked. The percentage is the
useful number here, not the raw count: a resource open only 2 hours/day
with 10 bookings can be *more* saturated than one open 16 hours/day
with 30 bookings, and it's the saturated one that's the actual
capacity-planning signal.

### Architecture decisions already made — do not re-litigate

1. **New method on `AnalyticsService`, not a new module.** This is
   analytics over an existing domain's data (same shape as
   `getRequestsAnalytics`/`getActivityAnalytics`), not new business
   logic for the `bookings` module itself — add
   `getBookingUtilizationAnalytics` to
   [analytics.service.ts](../backend/src/modules/analytics/analytics.service.ts),
   don't touch
   [bookings.service.ts](../backend/src/modules/bookings/bookings.service.ts).
2. **Same role gate, same date-range convention as the rest of the
   module.** `assertStaffAccess` (`SUPERADMIN`/`HOA_ADMIN`/
   `HOA_CHAIRMAN`) and `DateRangeAnalyticsQueryDto`'s `from`/`to` with
   the same default-last-30-days resolution
   `getRequestsAnalytics` already uses — no new authorization or
   date-handling decision needed here.
3. **Only `CONFIRMED` bookings count toward utilization, filtered by
   `startTime` in range — not `CANCELLED`, not `createdAt`.** A
   cancelled booking never actually occupied the resource, so it must
   not count toward "how full is this resource." Filtering on
   `startTime` (when the slot happens) rather than `createdAt` (when
   it was booked) is what makes the date range mean "utilization
   during this period," not "bookings made during this period" —
   those are different questions and this task answers the first one.
4. **Only `isActive: true` resources are included.** A deactivated
   resource is out of service already; it isn't part of a "should we
   expand or retire this" decision going forward.
5. **No groupBy for the hours total — Prisma can't sum
   `endTime - startTime` in an aggregate.** Unlike the count (which
   `groupBy(['resourceId'], _count)` handles fine), total booked hours
   is a per-row computed value. Fetch all matching bookings in **one**
   `findMany` (`resourceId`, `startTime`, `endTime`, scoped by
   `status: CONFIRMED`, `startTime: { gte: from, lte: to }`, and
   `resource: { tenantId, isActive: true }`), then reduce into a
   `Map<resourceId, { count, totalHours }>` in memory — same "one
   query, reduce in memory" discipline
   [Task 0035](0035-superadmin-platform-overview.md)/[Task 0050](0050-resident-activity-csv-export.md)
   established for exactly this kind of "groupBy can't do it
   directly" situation. **Not** a per-resource loop querying bookings
   one resource at a time.
6. **Utilization % needs a computed "available hours" baseline per
   resource — daily operating window × days in range.**
   - Daily window: if both `operatingHoursStart` and
     `operatingHoursEnd` are set, parse the two `"HH:mm"` strings and
     take the difference in hours. If either is missing, treat the
     resource as available 24h/day (e.g. guest parking with no
     posted hours).
   - Days in range: `Math.max(1, Math.ceil((to.getTime() -
     from.getTime()) / (24 * 60 * 60 * 1000)))`.
   - `availableHours = dailyWindowHours * daysInRange`;
     `utilizationPercent = availableHours > 0 ? round((totalBookedHours
     / availableHours) * 100, 1) : 0`.
7. **Zero-fill and sort by utilization descending.** Every active
   resource appears in the response even with zero bookings in the
   period (explicit `0`s — same zero-fill requirement
   [Task 0050](0050-resident-activity-csv-export.md)'s review
   verified, don't omit idle resources, they're exactly what this
   report exists to surface). Sort by `utilizationPercent` descending,
   tiebreak by `totalBookedHours` descending — the most-saturated
   resource first.
8. **JSON endpoint + web table only — no CSV export in this task.**
   Unlike [Task 0050](0050-resident-activity-csv-export.md), this
   report wasn't requested with an export need; keep this task scoped
   to display, matching how
   [Task 0035](0035-superadmin-platform-overview.md)'s platform
   overview also shipped without a CSV export. A CSV export can be a
   follow-up task later if actually needed, same as
   [Task 0032](0032-finance-analytics-csv-export.md) followed
   [Task 0013](0013-analytics.md) by weeks.

---

## Subtask A — Backend: utilization endpoint

In [analytics.service.ts](../backend/src/modules/analytics/analytics.service.ts),
add `getBookingUtilizationAnalytics(tenantId, user, query?:
DateRangeAnalyticsQueryDto)`:

- `assertStaffAccess`, resolve `from`/`to` (decision #2).
- Fetch active resources for the tenant: `id`, `name`, `type`,
  `operatingHoursStart`, `operatingHoursEnd`.
- One `findMany` on `booking` per decision #5, reduce into the
  per-resource map.
- Compute `availableHours`/`utilizationPercent` per decision #6 for
  every resource, zero-fill per decision #7.
- Sort per decision #7.
- Return `{ from, to, resources: [{ resourceId, resourceName,
  resourceType, bookingsCount, totalBookedHours, availableHours,
  utilizationPercent }] }`.

In [analytics.controller.ts](../backend/src/modules/analytics/analytics.controller.ts):

- `GET /analytics/tenants/:tenantId/bookings?from=&to=`, inherits the
  class-level `@Roles` (decision #2, no override needed).

**Tests:** extend `analytics.service.spec.ts` —
- A resource with 3 `CONFIRMED` bookings in range and 1 `CANCELLED`
  one shows a count of 3, not 4 — cancelled bookings excluded.
- A booking whose `startTime` falls outside `from`/`to` is excluded
  even if `createdAt` is inside the range (proves the filter is on
  `startTime`, not `createdAt`).
- Utilization % math: a resource with an explicit 8h/day window over
  a 10-day range (80 available hours) and 40 total booked hours
  across its confirmed bookings reports exactly `50` (or `50.0`).
- A resource with no `operatingHoursStart`/`operatingHoursEnd` treats
  itself as 24h/day available (verify the resulting `availableHours`
  reflects `24 * daysInRange`, not the 8h/day case).
- A resource with zero bookings in the period still appears in the
  response with `bookingsCount: 0`, `totalBookedHours: 0`,
  `utilizationPercent: 0` — not omitted.
- An `isActive: false` resource never appears in the response,
  regardless of its booking history.
- Results are sorted by `utilizationPercent` descending.
- `DISPATCHER`/cross-tenant/resident access is rejected (matches
  every other `assertStaffAccess`-gated endpoint in this module).

## Subtask B — Web: bookings utilization tab

In [analytics/page.tsx](../frontend-web/src/app/dashboard/analytics/page.tsx):

- Add a fourth tab (`'finance' | 'requests' | 'activity' |
  'bookings'`), reusing the existing `PeriodPreset`/`getPresetDates`
  pattern already used by the `activity`/`requests` tabs — don't
  invent a second date-range mechanism.
- Render a table: resource name, type, bookings count, total booked
  hours, available hours, utilization % (sorted as the API already
  returns it — no client-side re-sort needed).
- Full kk/ru/en i18n parity for every new label.

---

## Acceptance criteria

- Only `CONFIRMED` bookings, filtered by `startTime` (not
  `createdAt`), count toward utilization — proven by the two dedicated
  tests.
- Utilization % is computed against each resource's own operating
  window (or 24h/day fallback), not a single global assumption.
- Idle active resources appear with explicit zeros; inactive resources
  never appear.
- `DISPATCHER` cannot access this endpoint, matching every other
  analytics endpoint's role gate.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/` and `frontend-web/`; full kk/ru/en i18n parity maintained.

## Explicitly out of scope

- CSV export of this report — per decision #8, a separate task if
  ever needed.
- Mobile UI — analytics management has stayed web-only throughout this
  project.
- Any change to `bookings.service.ts`'s actual booking/cancellation
  logic — this task only reads existing `Booking`/`BookableResource`
  rows.
- Per-day or per-hour breakdown (a heatmap of *when* a resource is
  busiest) — this task reports one aggregate percentage per resource
  for the whole selected range, not a time-of-day distribution.

---

## Review addendum (2026-09-12) — accepted, no issues found

**Verified good:**
- `getBookingUtilizationAnalytics` in `AnalyticsService` filters `Booking` rows by `status: BookingStatus.CONFIRMED` and `startTime: { gte: from, lte: to }`. Cancelled bookings and bookings outside the range are excluded.
- Single-query aggregation: active resources and matching bookings are queried in individual `findMany` queries without N+1 loops, aggregating duration in memory.
- Utilization % calculation correctly considers daily operating hours (`operatingHoursEnd - operatingHoursStart` in hours) multiplied by `daysInRange`, with a 24h/day fallback when unspecified. Zero-fill guarantees idle active spaces are not omitted.
- Sorting is descending by `utilizationPercent`, with `totalBookedHours` as tiebreaker.
- Inactive resources (`isActive: false`) are excluded.
- Role check enforces `assertStaffAccess` (`SUPERADMIN`, `HOA_ADMIN`, `HOA_CHAIRMAN`), properly rejecting `DISPATCHER`, residents, and cross-tenant users.
- Frontend web includes the `'bookings'` tab with KPI cards, preset period selector (`7d`, `30d`, `90d`), utilization progress bars, and complete parity across `ru.json`, `kk.json`, and `en.json`.
- All 494 backend tests pass (32/32 in `analytics.service.spec.ts`, including 8 new tests for Task 0053); `tsc --noEmit` clean across both backend and frontend-web.

## Deliverable

- Backend and web can ship as separate commits.
- PR description states the utilization-percent formula explicitly and
  confirms the "cancelled bookings excluded" test result — that's the
  property most worth calling out given decision #3.

---

## Review addendum (2026-09-12) — needs fix

**Backend: accepted, no issues.** `getBookingUtilizationAnalytics`
matches every decision exactly — `CONFIRMED`-only + `startTime`-range
filter (decision #3), `isActive: true` on both the resource fetch and
the booking's `resource` relation (decision #4), single `booking.findMany`
reduced in memory via a `Map` (decision #5, no per-resource loop),
correct 8h/24h/12h window math with a sane >0 guard against inverted
`operatingHoursStart`/`End` pairs, zero-fill for idle resources
(decision #7), and `utilizationPercent` desc / `totalBookedHours` desc
tiebreak sort — proven directly by the mixed-tie test (Coworking 90h
before BBQ 60h at the same 75%). Route and role gate correct (no
method-level `@Roles` override, correctly inherits the class-level
`SUPERADMIN`/`HOA_ADMIN`/`HOA_CHAIRMAN`). All 8 required test
scenarios present and passing; independently reran the full backend
suite (494/494, 8 new) and `tsc --noEmit` (clean).

**Web: two real bugs, please fix both before this ships.**

1. **Resource type labels break for 3 of 5 enum values, in all three
   languages.** In the new table's row rendering
   ([analytics/page.tsx](../frontend-web/src/app/dashboard/analytics/page.tsx)),
   `typeLabel` is computed as
   ```ts
   t(`bookings.type${res.resourceType.charAt(0).toUpperCase() + res.resourceType.slice(1).toLowerCase()}`, { defaultValue: res.resourceType })
   ```
   This mechanical transform assumes the i18n key is the enum value
   title-cased, but the actual established keys (see
   `getTypeLabel` in
   [bookings/resources/page.tsx:154-167](../frontend-web/src/app/dashboard/bookings/resources/page.tsx)) don't
   follow that pattern: `BBQ_AREA` → `typeBbQ`, `GUEST_PARKING` →
   `typeParking`, `KIDS_ROOM` → `typeKids` (only `COWORKING` →
   `typeCoworking` and the `OTHER` fallback happen to match by
   coincidence). For the other three, the key lookup misses and falls
   through to `defaultValue: res.resourceType` — meaning staff see the
   raw enum string **`BBQ_AREA`**, **`GUEST_PARKING`**, or
   **`KIDS_ROOM`** literally in the table instead of a translated
   label, in ru/kk/en alike (this isn't a missing-translation gap, the
   keys all exist — it's the transform producing the wrong key name).
   **Fix:** reuse the same `switch` mapping
   `getTypeLabel` in
   [bookings/resources/page.tsx](../frontend-web/src/app/dashboard/bookings/resources/page.tsx)
   already uses (either import/share it or replicate the same
   `switch (resourceType) { case 'BBQ_AREA': return t('bookings.typeBbQ'); ... }`
   locally) instead of the mechanical string transform.
2. **Booked/available hours are suffixed with a hardcoded Russian
   unit, bypassing i18n entirely.** The table cells render
   `{res.totalBookedHours} ч.` and `{res.availableHours} ч.` — literal
   Cyrillic text outside any `t()` call, so kk and en users see "ч."
   mixed into their own language's UI. This is the same class of bug
   [Task 0007](0007-meter-readings.md)'s review addendum already
   caught and fixed once for `unitElectricity`/`unitWater` — a
   measurement unit suffix needs its own i18n key
   (e.g. `analytics.bookings.hoursUnit` = "ч." / "сағ." / "h"), not a
   hardcoded literal. **Fix:** add that key to all three locale files
   and use `{res.totalBookedHours} {t('analytics.bookings.hoursUnit')}`
   (same for `availableHours`).

Neither bug affects the backend response shape or the acceptance
criteria already verified above — both are display-only fixes in
`analytics/page.tsx` plus the one new locale key. Re-run the i18n
parity check after adding the key (was 1060/1060/1060 before this
fix); it should still be exactly equal across ru/kk/en afterward.

### Fix verified (2026-09-12) — accepted

Both items resolved exactly as requested: `getResourceTypeLabel` now
reuses the identical `switch` mapping from
`bookings/resources/page.tsx`'s `getTypeLabel` (`BBQ_AREA` →
`typeBbQ`, `GUEST_PARKING` → `typeParking`, `KIDS_ROOM` → `typeKids`,
`COWORKING` → `typeCoworking`, default → `typeOther`), confirmed by
direct read of
[analytics/page.tsx:384-397](../frontend-web/src/app/dashboard/analytics/page.tsx#L384-L397);
`analytics.bookings.hoursUnit` added to all three locale files
(ru "ч." / kk "сағ." / en "h") and both table cells now render
`{value} {t('analytics.bookings.hoursUnit')}` instead of the hardcoded
Cyrillic literal. Independently reran i18n parity (1061/1061/1061,
exactly +1 key as expected) and `tsc --noEmit` in `frontend-web/`
(clean). Task accepted, no further issues.

**Fix verified (2026-09-12):**
- Replaced mechanical string transform with explicit `getResourceTypeLabel` mapping matching `bookings/resources/page.tsx:154-167` (`BBQ_AREA` → `bookings.typeBbQ`, `GUEST_PARKING` → `bookings.typeParking`, `KIDS_ROOM` → `bookings.typeKids`, `COWORKING` → `bookings.typeCoworking`, fallback → `bookings.typeOther`).
- Replaced hardcoded "ч." with localized `{t('analytics.bookings.hoursUnit')}` for both totalBookedHours and availableHours.
- Added `hoursUnit` key across all three locale files (`ru`: "ч.", `kk`: "сағ.", `en`: "h").
- i18n parity verified: exactly 1061 / 1061 / 1061 keys across all three languages.
- Frontend `tsc --noEmit` clean; 494/494 backend tests pass.

