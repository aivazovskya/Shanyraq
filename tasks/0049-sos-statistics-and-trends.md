# Task 0049: SOS statistics and trends (frequency, status breakdown, response time)

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature. Today's `sos/page.tsx` and
[sos.controller.ts](../backend/src/modules/sos/sos.controller.ts)'s
`getTenantAlerts` only show the live/historical **list** of individual
alerts — there's no aggregate view answering "how many SOS calls did we
get this month," "how quickly does staff typically respond," or "is
this trending up." This task adds that aggregate view.

**Researched, not guessed — why this can't just live in the `analytics`
module.** [analytics.controller.ts](../backend/src/modules/analytics/analytics.controller.ts)'s
class-level role gate is `@Roles(SUPERADMIN, HOA_ADMIN, HOA_CHAIRMAN)` —
`DISPATCHER` is **deliberately excluded there** (per
[PROGRESS.md](PROGRESS.md): "DISPATCHER строго исключён" from the
existing finance/requests/activity analytics). But
`sos.controller.ts`'s own `getTenantAlerts` is gated to `SECURITY,
DISPATCHER, HOA_ADMIN, HOA_CHAIRMAN, SUPERADMIN` — `DISPATCHER` and
`SECURITY` are core SOS responders (per
[Task 0010](0010-sos-button.md)) and already see every individual SOS
event today. Adding SOS statistics as a new `AnalyticsController`
method would silently regress their access to a metric they already
have finer-grained access to (individual alerts) unless every such
method remembered to override the class-level `@Roles` — exactly the
kind of mistake [Task 0035](0035-superadmin-platform-overview.md)'s
review had to catch for a different endpoint. Avoid the risk entirely
by **not touching the `analytics` module** — add this to `sos.service.ts`/
`sos.controller.ts` instead, inheriting `getTenantAlerts`'s own correct
role set directly.

### Architecture decisions already made — do not re-litigate

1. **Lives in the `sos` module, not `analytics` — decision context
   above.** Same role gate as `getTenantAlerts`:
   `SECURITY`/`DISPATCHER`/`HOA_ADMIN`/`HOA_CHAIRMAN`/`SUPERADMIN`, no
   new authorization decision.
2. **Extend the existing `sos/page.tsx`, don't build a new page.** It
   already has no tabs (a flat alert list) and is accessed by exactly
   the audience this task's stats are for — add a stats summary section
   above the existing list, matching the "extend what's already there
   for the right audience" precedent from
   [Task 0035](0035-superadmin-platform-overview.md)/
   [Task 0048](0048-voting-protocol-archive-search.md).
3. **Reuse `recharts` for the trend chart — already a dependency via the
   existing analytics page, don't add a new charting library** for one
   more chart.
4. **Four metrics, not an open-ended dashboard**: total alert count in
   the selected date range, breakdown by `status`
   (`ACTIVE`/`RESOLVED`/`FALSE_ALARM`), average response time
   (`resolvedAt - createdAt`, only over alerts that actually have a
   `resolvedAt` — an `ACTIVE` alert has none and must not be averaged in
   as a zero or skew the calculation), and a daily-count trend series
   for the chart. No "top offending units" breakdown or per-resident
   drill-down — the four metrics above are what "statistics and trends"
   actually asked for; a repeat-caller breakdown is a distinct feature
   with its own privacy framing worth its own explicit decision, not a
   default to add here.
5. **Date range, same convention as every other analytics/export
   feature in this codebase**: `from`/`to` query params, default last
   30 days.

---

## Subtask A — Backend: statistics endpoint

In [sos.service.ts](../backend/src/modules/sos/sos.service.ts), add
`getSosStatistics(tenantId, user, query?: { from?: string; to?: string })`:

- Reuse whatever tenant/role check `getTenantAlerts` already applies
  (`assertUserBelongsToTenant` or equivalent — check its current
  implementation rather than assuming) — don't re-derive it.
- Resolve `from`/`to` with the same default-last-30-days pattern
  [analytics.service.ts](../backend/src/modules/analytics/analytics.service.ts)'s
  `getRequestsAnalytics`/`getActivityAnalytics` already use.
- Query `sosAlert` rows for the tenant within the range; compute:
  - `totalAlerts`.
  - `byStatus: { ACTIVE, RESOLVED, FALSE_ALARM }` counts.
  - `averageResponseTimeMinutes` — mean of `(resolvedAt - createdAt)`
    in minutes across alerts that have a non-null `resolvedAt`
    (decision #4 — exclude still-`ACTIVE` alerts from this average
    entirely, don't treat their missing `resolvedAt` as zero).
  - `dailyTrend: Array<{ date: string; count: number }>` — one entry per
    calendar day in the range with at least one alert (or every day in
    the range, implementer's call, but state which in the PR
    description) for the chart.

In [sos.controller.ts](../backend/src/modules/sos/sos.controller.ts):

- `GET /sos/tenants/:tenantId/statistics?from=&to=`, same `@Roles` as
  `getTenantAlerts` (decision #1).

**Tests:** extend `sos.service.spec.ts` —
- `averageResponseTimeMinutes` is computed only over resolved/
  false-alarm alerts — construct a fixture with one still-`ACTIVE` alert
  (no `resolvedAt`) mixed with resolved ones and assert the `ACTIVE` one
  doesn't skew the average (e.g. isn't treated as an instant/zero
  response).
- `byStatus` counts match a fixture with a mix of all three statuses.
- Default date range (no `from`/`to`) resolves to the last 30 days.
- `DISPATCHER` and `SECURITY` can both call this successfully (the
  direct regression test for this task's central "don't lose their
  access" concern); cross-tenant access is rejected the same way
  `getTenantAlerts` already rejects it.

## Subtask B — Web: stats summary + trend chart

In [sos/page.tsx](../frontend-web/src/app/dashboard/sos/page.tsx):

- Add a stats section above the existing alert list: 3-4 compact stat
  cards (total alerts, average response time, active-now count sourced
  from the existing live list rather than the stats endpoint since
  that's already real-time) and a simple line/bar chart (recharts) of
  the daily trend, with a `from`/`to` date-range control (default last
  30 days, decision #5).
- Full kk/ru/en i18n parity for all new text.

---

## Acceptance criteria

- `DISPATCHER` and `SECURITY` can access SOS statistics exactly as they
  can already access the alert list — no access regression relative to
  today.
- Average response time excludes still-active (unresolved) alerts
  entirely rather than treating them as instant or zero-duration.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in `backend/`
  and `frontend-web/`; full kk/ru/en i18n parity maintained.

## Explicitly out of scope

- Any change to the `analytics` module — decision context above.
- Per-unit/per-resident "repeat caller" breakdowns — decision #4, a
  distinct feature with its own privacy framing if ever wanted.
- Mobile UI. **Checked, not assumed:**
  [Task 0025](0025-mobile-sos-dashboard.md) already built
  `mobile/src/screens/staff/StaffSosScreen.tsx` — mobile *does* have a
  staff SOS dashboard, so this isn't a case of "the feature never
  existed there" the way some other web-only decisions in this project
  have been. Staying web-only here is a deliberate scope call anyway:
  a chart plus a date-range picker is a better fit for the web
  dashboard's screen real estate than `StaffSosScreen.tsx`'s compact
  mobile layout, and security/dispatch staff already have the
  time-sensitive part (the live alert feed) on mobile — the aggregate/
  trend view is the part that benefits from a desk, not a phone. A
  simple stats summary on `StaffSosScreen.tsx` is a reasonable fast
  follow-up if wanted, not bundled into this task.
- CSV export of SOS statistics — a natural future addition given this
  project's established CSV pattern, not bundled into this task.

## Deliverable

- Backend and web can ship as separate commits.
- PR description confirms the `DISPATCHER`/`SECURITY` access test result
  explicitly — this is the property most worth calling out given this
  task's central risk.

---

## Review addendum (2026-09-11) — accepted, no issues found

**Verified good:** `getSosStatistics` reuses the pre-existing
`assertStaffOrChairmanRole` method — the exact same check
`getTenantAlerts` already uses (confirmed by reading it directly, line
442) — so the `analytics` module's more restrictive role gate was never
at risk of leaking in. `DISPATCHER`/`SECURITY` access,
cross-tenant rejection, and resident rejection are all directly tested.
The average-response-time exclusion of `ACTIVE` alerts is proven with
an unambiguous fixture and an explicit inline comment confirming the
expected math ((10+20)/2=15, not (10+20+0)/3=10) — this is exactly the
kind of test that can't pass by accident. `dailyTrend` correctly
zero-fills days with no alerts within the range. Web reuses the
already-present `recharts` dependency (confirmed via `git diff` on
`package.json` — no changes), no new package introduced.

**Verified independently:** 472/472 backend tests pass (4 new),
`tsc --noEmit` clean in `backend/` and `frontend-web/`, full kk/ru/en
parity (1042/1042/1042 web keys). Task accepted, no fixes required.
