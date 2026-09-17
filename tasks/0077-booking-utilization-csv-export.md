# Task 0077: CSV export of booking resource utilization analytics

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature, direct follow-up to
[Task 0053](0053-booking-resource-utilization-analytics.md), which
shipped `getBookingUtilizationAnalytics` (JSON + web table only) and
explicitly deferred this in decision #8: "A CSV export can be a
follow-up task later if actually needed, same as
[Task 0032](0032-finance-analytics-csv-export.md) followed
[Task 0013](0013-analytics.md) by weeks." That pattern has since
repeated for the exact same analytics module ([Task 0032](0032-finance-analytics-csv-export.md)'s
finance export, [Task 0050](0050-resident-activity-csv-export.md)'s
activity export) — this task is the third instance of the same
"analytics report shipped screen-only, CSV export added later,"
pattern, this time for the booking utilization report.

**Confirmed by reading
[analytics.service.ts](../backend/src/modules/analytics/analytics.service.ts):**
- `getBookingUtilizationAnalytics` (line 949) already does everything
  a CSV export needs: `assertStaffAccess` + tenant check, `from`/`to`
  resolution (default last 30 days), the per-resource operating-hours/
  zero-fill/sort math, returning `{ from, to, resources:
  ResourceUtilizationItem[] }` where each item is `{ resourceId,
  resourceName, resourceType, bookingsCount, totalBookedHours,
  availableHours, utilizationPercent }`
  ([analytics.dto.ts:108-122](../backend/src/modules/analytics/dto/analytics.dto.ts#L108-L122)).
- **Unlike `exportFinanceAnalyticsCsv`/`exportResidentActivityCsv`**
  (lines 211, 729), which each independently re-resolve `from`/`to`
  and re-run their own queries rather than calling the existing JSON
  method — this task deliberately does **not** copy that duplication.
  `getBookingUtilizationAnalytics`'s computation (operating-hours
  parsing, the 24h fallback, the in-memory `Map` reduction, the
  zero-fill, the sort) is meaningfully more involved than the simpler
  groupBy-based finance/activity reports, so re-deriving it a second
  time in an export method would be a real risk of the two silently
  drifting apart later. This task's export method **calls
  `getBookingUtilizationAnalytics` directly** and formats its already-
  computed `resources` array into CSV rows — see decision #1.
- The resource-type-label bug
  [Task 0053](0053-booking-resource-utilization-analytics.md)'s review
  addendum caught (a mechanical `charAt(0).toUpperCase()` transform
  producing wrong i18n keys for 3 of 5 enum values) was a **web-only**
  bug in `analytics/page.tsx`'s display code — the backend's raw
  `resourceType` enum value was never wrong. This task's CSV, being
  backend-only Russian output (matching every prior CSV export's
  no-i18n precedent), needs its own small inline Russian label map —
  see decision #3 — not a reuse of any frontend i18n key.
- `analytics.controller.ts:30` sets the class-level `@Roles(SUPERADMIN,
  HOA_ADMIN, HOA_CHAIRMAN)`; the existing `GET
  tenants/:tenantId/bookings` route (line 133) has no method-level
  override, so it inherits that gate — `DISPATCHER` is excluded from
  this report exactly as it's excluded from every other analytics
  endpoint in this module. The new export route inherits the same
  class-level gate the same way.

### Architecture decisions already made — do not re-litigate

1. **`exportBookingUtilizationCsv` calls `getBookingUtilizationAnalytics`
   internally, not a second hand-written query.** `async
   exportBookingUtilizationCsv(tenantId, user, query?:
   DateRangeAnalyticsQueryDto)` starts with `const { from, to,
   resources } = await this.getBookingUtilizationAnalytics(tenantId,
   user, query)` — this single call already performs the role/tenant
   check and the date resolution, so nothing about auth or date
   parsing needs to be duplicated (per the Context section's explicit
   deviation from the finance/activity export precedent).
2. **CSV via the existing `buildCsv` helper**
   ([csv.helper.ts](../backend/src/common/csv/csv.helper.ts)), already
   imported in this file — same UTF-8-BOM-prefixed, RFC-4180-escaped
   shape every prior CSV export in this project uses. No new helper
   needed.
3. **Small inline Russian resource-type label map for the CSV only**
   — `BBQ_AREA` → "Барбекю-зона", `COWORKING` → "Коворкинг",
   `GUEST_PARKING` → "Гостевой паркинг", `KIDS_ROOM` → "Детская
   комната", default → "Другое" (copied verbatim from the existing
   `ru.json` values at
   [bookings/resources/page.tsx:154-167](../frontend-web/src/app/dashboard/bookings/resources/page.tsx#L154-L167)'s
   `getTypeLabel`, for consistency with what staff already see
   on-screen) — a closed 5-value enum, safe to hardcode inline exactly
   like [Task 0067](0067-voting-results-csv-export.md) decision #5 did
   for `VoteChoice`.
4. **One row per resource** (this report is already small and
   aggregate — typically a handful of resources per ЖК, not hundreds
   of transactional rows), columns: Ресурс, Тип, Кол-во бронирований,
   Забронировано часов, Доступно часов, Утилизация (%). A header
   section above the table states the ЖК name and the `from`–`to`
   period (reusing the response's own `from`/`to`, already resolved
   by `getBookingUtilizationAnalytics` — decision #1), matching every
   prior analytics CSV export's header-then-table shape.
5. **Same role gate as the existing endpoint — no new decision.**
   `@Roles` inherited from the controller class exactly as the
   existing `GET tenants/:tenantId/bookings` route already does; the
   new export route needs no method-level `@Roles` override either.
6. **Web download button reuses the fetch-blob-download pattern**
   [Task 0032](0032-finance-analytics-csv-export.md) decision #7
   established (`fetch` with the authenticated request helper +
   `URL.createObjectURL` + a programmatic `<a download>` click) — this
   is now the third CSV download button in `analytics/page.tsx`
   ([Task 0032](0032-finance-analytics-csv-export.md)'s finance export,
   [Task 0050](0050-resident-activity-csv-export.md)'s activity
   export), copy the existing button's handler rather than writing a
   fourth variant of the same download logic.

---

## Subtask A — Backend: CSV export endpoint

In [analytics.service.ts](../backend/src/modules/analytics/analytics.service.ts):

- `exportBookingUtilizationCsv(tenantId, user, query?:
  DateRangeAnalyticsQueryDto): Promise<{ buffer: Buffer; filename:
  string }>` per decisions #1/#3/#4. Filename
  `booking-utilization-${tenantId}-${fromDateStr}-${toDateStr}.csv`
  (matching the existing export methods' filename shape — check
  `exportFinanceAnalyticsCsv`/`exportResidentActivityCsv`'s exact
  filename construction and mirror it, don't invent a new naming
  convention).

In [analytics.controller.ts](../backend/src/modules/analytics/analytics.controller.ts):

- `GET tenants/:tenantId/bookings/export`, placed next to the existing
  `GET tenants/:tenantId/bookings` route, same `from`/`to`
  `@ApiQuery` params, `@Res()` streaming with `Content-Type: text/csv;
  charset=utf-8` and `Content-Disposition: attachment;
  filename="..."` — identical shape to
  `exportFinanceAnalyticsCsv`'s/`exportResidentActivityCsv`'s
  controller methods (lines 59-79, 111-131), no new streaming pattern.

**Tests:** extend `analytics.service.spec.ts`:
- `DISPATCHER` and a resident are rejected (matches every other
  analytics endpoint's existing role-gate tests — this export inherits
  the same gate, so the same test shape applies).
- The exported CSV's resource rows exactly match what
  `getBookingUtilizationAnalytics` would return for the same
  `tenantId`/`query` — proves decision #1's "single source of
  computation" property, not just "the export doesn't crash."
- All 5 `BookableResource` type enum values render their correct
  Russian label (decision #3) — the property most worth testing given
  [Task 0053](0053-booking-resource-utilization-analytics.md)'s prior
  bug in this exact area (even though that bug was web-only, this test
  guards the CSV's own independent label map from ever developing the
  same class of mistake).
- Raw CSV bytes start with the UTF-8 BOM.
- A resource with a zero-filled (idle) row still appears in the CSV —
  proves the export didn't silently drop what
  `getBookingUtilizationAnalytics`'s zero-fill (Task 0053 decision #7)
  guarantees in the JSON path.

## Subtask B — Web: download button

In [analytics/page.tsx](../frontend-web/src/app/dashboard/analytics/page.tsx):

- Add a "Скачать CSV" button to the `bookings` tab, next to its
  existing period-preset selector, using the identical fetch-blob-
  download handler already used for the finance/activity export
  buttons (decision #6) — pointed at `GET
  /analytics/tenants/:tenantId/bookings/export?from=&to=` with
  whatever `from`/`to` the tab's current preset resolves to, so the
  downloaded file matches what's currently on screen.
- Full kk/ru/en i18n parity for the new button label (likely already
  exists as a shared `analytics.downloadCsvBtn`-style key from the
  finance/activity buttons — reuse it if so, don't add a third
  near-duplicate key for the same button text).

---

## Acceptance criteria

- The exported CSV's data exactly matches the on-screen utilization
  table for the same date range (proven by the dedicated test in
  Subtask A).
- `DISPATCHER` cannot access the export endpoint, matching the
  existing JSON endpoint's role gate exactly.
- All 5 resource type enum values produce a correct Russian label in
  the CSV, not a raw enum string.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/` and `frontend-web/`; full kk/ru/en i18n parity maintained.

## Explicitly out of scope

- Any change to `getBookingUtilizationAnalytics`'s own computation or
  response shape — this task only adds a CSV-formatting wrapper around
  it, per decision #1.
- Mobile UI — analytics has stayed web-only throughout this project
  (matches Task 0053's own out-of-scope note).
- A per-day/per-hour breakdown in the CSV — same aggregate shape as
  the existing JSON report, no new level of detail.

## Deliverable

- Backend and web can ship as separate commits.
- PR description confirms the "CSV matches on-screen data exactly"
  test result explicitly — that's the property this task's whole
  architecture (decision #1) exists to guarantee.

---

## Implementation Summary

1. **Backend (`analytics.service.ts` & `analytics.controller.ts`):**
   - Added `exportBookingUtilizationCsv(tenantId, user, query)` in `analytics.service.ts`. Internally calls `getBookingUtilizationAnalytics(tenantId, user, query)` to ensure 100% data consistency with the on-screen report.
   - Formats UTF-8 BOM-prefixed CSV using `buildCsv` with residential complex header, period range, and columns: `Ресурс, Тип, Кол-во бронирований, Забронировано часов, Доступно часов, Утилизация (%)`.
   - Translated all 5 `BookableResourceType` enum values to Russian labels (`BBQ_AREA` → "Барбекю-зона", `COWORKING` → "Коворкинг", `GUEST_PARKING` → "Гостевой паркинг", `KIDS_ROOM` → "Детская комната", `OTHER` → "Другое").
   - Added `GET tenants/:tenantId/bookings/export` endpoint in `analytics.controller.ts`, inheriting class-level `@Roles(SUPERADMIN, HOA_ADMIN, HOA_CHAIRMAN)`.
2. **Backend Tests (`analytics.service.spec.ts`):**
   - Added 5 unit tests in a dedicated describe block:
     - Rejection of `DISPATCHER`, resident, foreign HOA admin, and acceptance of HOA chairman and superadmin.
     - Verification that CSV data rows strictly match `getBookingUtilizationAnalytics` calculation.
     - Proper Russian translation for all 5 `BookableResourceType` values.
     - Buffer begins with UTF-8 BOM (`\uFEFF`) and filename follows `booking-utilization-${tenantId}-${from}-${to}.csv`.
     - Zero-filled idle resources appear correctly with 0 bookings and 0% utilization.
   - All 48 test cases in the suite passed.
3. **Frontend Web (`analytics/page.tsx` & i18n):**
   - Added "Скачать CSV" button in the bookings tab controls bar with `exportingBookingsCsv` loading state and `apiDownload`.
   - Added `exportCsv` and `exporting` i18n keys to `analytics.bookings` in `ru.json`, `kk.json`, and `en.json`, maintaining strict 1:1 key parity (1137 keys in each file).
4. **Verification:**
   - `npm test -- src/modules/analytics/analytics.service.spec.ts`: 48/48 passed.
   - `tsc --noEmit` in `backend/` and `frontend-web/`: clean (0 errors).
