# Task 0080: Mini SOS statistics summary on mobile StaffSosScreen

**Status:** Done
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature, direct follow-up to
[Task 0049](0049-sos-statistics-and-trends.md), which built
`GET /sos/tenants/:tenantId/statistics` and a web stats-summary-plus-
trend-chart section, but explicitly left this exact addition for later:
"A simple stats summary on `StaffSosScreen.tsx` is a reasonable fast
follow-up if wanted, not bundled into this task." Today
[StaffSosScreen.tsx](../mobile/src/screens/staff/StaffSosScreen.tsx)
shows only the live/historical alert list — no aggregate numbers at
all, even though `SECURITY`/`DISPATCHER` staff spend most of their
time on mobile, not the web dashboard.

**Confirmed by reading
[sos.controller.ts](../backend/src/modules/sos/sos.controller.ts) and
[sos.service.ts](../backend/src/modules/sos/sos.service.ts):**
- `GET /sos/tenants/:tenantId/statistics?from=&to=` already exists,
  same `@Roles` as `getTenantAlerts`
  (`SECURITY`/`DISPATCHER`/`HOA_ADMIN`/`HOA_CHAIRMAN`/`SUPERADMIN`),
  defaults to the last 30 days, returns `{ totalAlerts, byStatus: {
  ACTIVE, RESOLVED, FALSE_ALARM }, averageResponseTimeMinutes,
  dailyTrend: [...] }`. This task adds **zero backend code** — it's a
  new mobile screen section consuming an endpoint that already exists,
  is already tested, and already excludes `ACTIVE` alerts from the
  response-time average correctly (Task 0049 decision #4, and Task
  0071's separate fix for `FALSE_ALARM` exclusion from the *SOS module's
  own* average — confirm which of the two fixes `getSosStatistics`
  actually has by reading the current method body, don't assume it's
  still exactly as Task 0049 shipped it).
- [mobile/src/api/sos.ts](../mobile/src/api/sos.ts) has no
  `getStatistics` method yet — only `triggerSos`/`getMySosAlerts`/
  `getTenantSosAlerts`/`resolveSosAlert`.

**Confirmed by reading
[StaffSosScreen.tsx](../mobile/src/screens/staff/StaffSosScreen.tsx):**
it already computes `now` via a 10-second local timer (decision: no
server polling for elapsed time) and loads the live alert list via
`loadAlerts`. This task adds a **separate, independent** fetch for the
aggregate stats — don't couple it to the existing alert-list refresh
cycle, since the two have different natural refresh cadences (live
list needs to feel real-time via the existing socket/pull-to-refresh;
30-day aggregate stats don't need to refetch every 10 seconds).

### Architecture decisions already made — do not re-litigate

1. **No date-range picker on mobile — fixed "last 30 days," matching
   the endpoint's own default.** [Task 0049](0049-sos-statistics-and-trends.md)'s
   own out-of-scope reasoning for staying web-only was "a chart plus a
   date-range picker is a better fit for the web dashboard... the
   aggregate/trend view is the part that benefits from a desk." This
   task deliberately does **not** try to recreate that full experience
   on mobile — no date picker, no chart, just a compact summary using
   the endpoint's default range. If a staff member wants the full
   trend chart with custom ranges, that's the web page's job.
2. **Three numbers, not a chart.** Total alerts (last 30 days), count
   by status (breakdown of `ACTIVE`/`RESOLVED`/`FALSE_ALARM`), and
   average response time in minutes — rendered as compact stat
   chips/cards above the existing alert list, not a `recharts` trend
   line (mobile has no charting library dependency today and adding
   one for three numbers would be disproportionate).
3. **New `sosApi.getStatistics(tenantId)` in
   [mobile/src/api/sos.ts](../mobile/src/api/sos.ts)**, calling `GET
   /sos/tenants/:tenantId/statistics` with no query params (relying on
   the endpoint's own 30-day default per decision #1).
4. **Independent fetch, on-focus + pull-to-refresh, not tied to the
   live alert list's refresh cycle** (per the Context section) —
   separate `useState`/`useCallback` pair, fetched in the same
   `useFocusEffect` that already loads alerts but as its own call, not
   chained to it.
5. **Fails silently, not a blocking error.** If the stats fetch fails
   (network hiccup, etc.), don't show a blocking error banner over the
   whole screen — the live alert list is the screen's primary job; the
   stats summary is a nice-to-have addition. Log a warning and simply
   omit the summary section (or show a small inline "—" placeholder),
   matching this screen's existing `console.error`-and-continue style
   for its own alert-list fetch failures.

---

## Subtask A — API client

- `mobile/src/api/sos.ts`: add `SosStatistics` interface (`{
  totalAlerts, byStatus: { ACTIVE, RESOLVED, FALSE_ALARM },
  averageResponseTimeMinutes, dailyTrend }` — mirror the exact backend
  response shape, `dailyTrend` can be typed but is unused by this task's
  UI) and `sosApi.getStatistics(tenantId: string): Promise<SosStatistics>`.

## Subtask B — Screen

- [StaffSosScreen.tsx](../mobile/src/screens/staff/StaffSosScreen.tsx):
  add a compact stats summary section above the existing alert list
  (per decisions #2/#4/#5) — three small stat cards/chips (total
  alerts, active-now count **sourced from the already-loaded live
  `alerts` array, not the stats endpoint**, matching Task 0049's own
  web-page precedent of using the real-time list for "active now" and
  the stats endpoint only for the historical aggregate, average
  response time in minutes).
- Full kk/ru/en i18n parity for the new labels, in the existing
  `staff.sos.*` namespace (check what's already there and extend it
  consistently rather than starting a parallel namespace).

---

## Acceptance criteria

- The stats summary renders using the existing statistics endpoint's
  default 30-day range, with no new backend calls beyond the one
  `GET .../statistics` request.
- A failure to load stats doesn't block or error out the rest of the
  screen (decision #5).
- `npx tsc --noEmit` clean in `mobile/`; full kk/ru/en i18n parity
  maintained.

## Explicitly out of scope

- Any backend change — the statistics endpoint already exists and is
  already tested.
- A date-range picker or trend chart on mobile — decision #1, stays a
  web-only capability.
- Per-unit/repeat-caller breakdowns — Task 0049 decision #4 already
  excluded these from the underlying endpoint entirely; nothing to
  surface here either.

## Deliverable

- Single mobile commit.
- PR description confirms a manual check as `SECURITY` or `DISPATCHER`
  that the three numbers match what the web dashboard's equivalent
  stats section shows for the same tenant.
