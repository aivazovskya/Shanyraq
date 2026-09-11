# Task 0037: CSV export of the access control log (AccessLog)

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature, same CSV pattern as
[Task 0032](0032-finance-analytics-csv-export.md). `AccessLog`
([schema.prisma:408-423](../backend/prisma/schema.prisma)) records every
barrier/gate/domofon open and camera view, and is already surfaced via
`GET /access/tenant/:tenantId/logs`
([access-control.controller.ts:88-95](../backend/src/modules/access-control/access-control.controller.ts)) —
but only to the mobile app's `StaffAccessLogScreen.tsx`
([Task 0029](0029-mobile-access-log-and-guest-pass.md)). The web
dashboard's [access/page.tsx](../frontend-web/src/app/dashboard/access/page.tsx)
has no access-log view at all today (grepped — confirmed zero
references to `logs`/`AccessLog` in `frontend-web/src`), only the
access-point registration/health-check UI. This task gives
security/accounting staff a downloadable log for handoff or audit
purposes, and — since no on-screen log view exists on web yet — adds a
minimal one alongside the export button (unlike Task 0032, which added
its export button next to an *already-existing* on-screen table).

### Architecture decisions already made — do not re-litigate

1. **Bounded by date range, not simply "uncapped" like Task 0032's
   debtor list — this is the one place this task must NOT copy that
   precedent.** Task 0032's debtor list is naturally bounded (the
   number of accounts currently in debt for one ЖК), so removing its
   `take: 10` cap was safe. `AccessLog` is a continuously-growing event
   log — every barrier open, every camera view, forever — so an
   "uncapped, no date filter" export could mean fetching years of rows
   into memory and building a multi-hundred-MB CSV. The export endpoint
   must require a bounded date range (`from`/`to`), defaulting to the
   **last 30 days** when not provided — matching the exact convention
   `analytics.service.ts`'s `getRequestsAnalytics`/`getActivityAnalytics`
   already use for `DateRangeAnalyticsQueryDto`. Within that bounded
   range, no additional row cap is needed (that part *does* match
   Task 0032's spirit — don't silently truncate a real report).
2. **Same role gate as the existing (non-export) logs endpoint — no new
   authorization decision.** `getAccessLogs` is already
   `@Roles(SECURITY, HOA_ADMIN, SUPERADMIN)` with
   `assertUserBelongsToTenant` tenant-scoping — note this is **not**
   the same set as the page's existing `canManage` check
   (`HOA_ADMIN`/`SUPERADMIN` only, used for point registration). The new
   on-screen log section and export button must be visible to `SECURITY`
   too, gated separately from `canManage` — confirmed `SECURITY` already
   has web dashboard access (this page's nav entry carries no `roles`
   restriction, and `SECURITY` has its own case in
   [layout.tsx](../frontend-web/src/app/dashboard/layout.tsx)'s role
   handling).
3. **Reuse `buildCsv`/`escapeCsvField` from
   [csv.helper.ts](../backend/src/common/csv/csv.helper.ts) — same
   RFC 4180 escaping and mandatory UTF-8 BOM as Task 0032, don't
   reimplement.**
4. **Reuse the web `apiDownload` helper from
   [api.ts](../frontend-web/src/lib/api.ts) — same fetch+blob+
   `<a download>` pattern as Task 0032, don't reimplement.**
5. **Minimal on-screen preview table is in scope, unlike Task 0032.**
   Task 0032 only added a download button because the finance analytics
   page already showed the data on screen. Here there's nothing to
   attach the button to yet, and a page with only a date picker and a
   button with no visible content would be a confusing addition. Add a
   small "Журнал доступа" section showing the existing capped
   `GET /access/tenant/:tenantId/logs` result (already `take: 100`,
   no backend change needed for this part) as a simple table, with the
   CSV export button next to it for the full bounded-by-date-range
   report. Don't add pagination or filtering UI beyond the date range —
   that's a bigger feature than this task.
6. **Content mirrors what the mobile `StaffAccessLogScreen.tsx` already
   shows, not a redesign.** Columns: timestamp, access point name/type,
   action, status (SUCCESS/DENIED), the acting user's name+phone (or
   guest/unit info when `userId` is null — e.g. a guest-pass entry),
   unit/block, note. Same fields already returned by `getAccessLogs`'s
   `include`, just formatted as CSV rows instead of JSON.

---

## Subtask A — Backend: export endpoint

In [access-control.service.ts](../backend/src/modules/access-control/access-control.service.ts),
add `exportAccessLogsCsv(tenantId: string, user: any, query: { from?: string; to?: string })`:

- Tenant/role check identical to `getAccessLogs` (reuse
  `assertUserBelongsToTenant` the same way).
- Resolve `from`/`to`: default `to` = now, default `from` = 30 days
  before `to` when not provided (decision #1) — same date-range
  resolution pattern already used in `analytics.service.ts`.
- Query `accessLog.findMany` scoped to `accessPoint: { tenantId }` and
  `createdAt: { gte: from, lte: to }`, same `include` shape as
  `getAccessLogs`, ordered `createdAt: 'desc'`, **no `take`** (bounded by
  the date range instead, per decision #1).
- Build CSV via `buildCsv` (decision #3): a header row (ЖК name, period
  `from`–`to`), then a data table with the columns from decision #6.
- Return `{ buffer, filename }` — filename like
  `access-log-${tenantId}-${fromDateStr}_${toDateStr}.csv`.

In [access-control.controller.ts](../backend/src/modules/access-control/access-control.controller.ts):

- `GET /access/tenant/:tenantId/logs/export?from=&to=`, same
  `@Roles(SECURITY, HOA_ADMIN, SUPERADMIN)` as `getAccessLogs`
  (decision #2), `@Res()` streaming with `Content-Disposition` header,
  matching the exact pattern
  [analytics.controller.ts](../backend/src/modules/analytics/analytics.controller.ts)'s
  `exportFinanceAnalyticsCsv` endpoint uses.

**Tests:** extend `access-control.service.spec.ts` —
- Default date range (no `from`/`to` given) resolves to the last 30
  days.
- The export query has no `take` limit — construct a test with more
  than 100 mock log rows (more than the on-screen endpoint's cap) and
  assert all of them appear in the generated CSV, proving this is a
  genuinely separate, uncapped-within-range query rather than a relabel
  of `getAccessLogs`.
- A `SECURITY` role can call the export (matches decision #2 — this is
  the role most likely to actually need this export, don't let it
  regress).
- A raw CSV byte check for the UTF-8 BOM, same standard as Task 0032.
- Cross-tenant rejection: a staff user from tenant A requesting tenant
  B's export is rejected (same `assertUserBelongsToTenant` check
  already proven for `getAccessLogs`, now applied to the new method).

## Subtask B — Web: log table + export button

In [access/page.tsx](../frontend-web/src/app/dashboard/access/page.tsx):

- Add a `canViewLogs` check (`SECURITY`/`HOA_ADMIN`/`SUPERADMIN`,
  distinct from the existing `canManage`, per decision #2).
- When `canViewLogs`, render a new "Журнал доступа" section: two date
  inputs (`from`/`to`, defaulting to the last 7 days for the on-screen
  view — a shorter default than the export's 30 days, since this is a
  quick on-screen glance, not the report itself), a simple table of the
  existing `GET /access/tenant/:tenantId/logs` result (decision #5, no
  backend change for this call), and a "Скачать CSV" button using
  `apiDownload` against the new export endpoint with the same `from`/`to`
  values as query params.
- Full kk/ru/en i18n parity for all new text (extend the existing
  `access` namespace).

---

## Acceptance criteria

- `GET /access/tenant/:tenantId/logs/export` requires/defaults a bounded
  date range — never fetches the entire unbounded table.
- Role gating matches the existing `getAccessLogs` endpoint exactly
  (`SECURITY`/`HOA_ADMIN`/`SUPERADMIN`) — no regression for `SECURITY`.
- Cross-tenant access is rejected, matching every other tenant-scoped
  endpoint in this module.
- The web page shows a log table + working CSV download for the roles
  above, without touching the existing point-registration UI's
  `canManage` gating.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in `backend/`
  and `frontend-web/`; full kk/ru/en i18n parity maintained.

## Explicitly out of scope

- Filtering by access point, action type, or status in the UI — date
  range only, for this first version.
- Mobile export — `StaffAccessLogScreen.tsx` already shows this data
  on-device; CSV export is a desktop/accounting-handoff use case,
  consistent with Task 0032 staying web-only.
- Pagination of the on-screen table beyond the existing 100-row cap —
  the export is the tool for anything larger.
- Changing `getAccessLogs`'s existing behavior or its consumer in
  `StaffAccessLogScreen.tsx` — this task only adds a new export method
  and endpoint alongside it.

## Deliverable

- Backend and web can ship as separate commits.
- PR description states the chosen default date range (30 days) and
  confirms the UTF-8 BOM/Cyrillic verification, same expectation
  Task 0032 set.

---

## Review addendum (2026-09-11) — accepted, no issues found

**Verified good:** `exportAccessLogsCsv` correctly defaults to a 30-day
bounded range when `from`/`to` are omitted (asserted directly on the
resolved `Date` objects, not just trusted), issues **no `take`** on the
`accessLog.findMany` call, and a dedicated test with 150 mock rows (more
than the on-screen endpoint's `take: 100`) proves every single row
survives into the CSV output — a genuine, uncapped-within-range query,
not a relabeled `getAccessLogs`. Role gating matches
(`SECURITY`/`HOA_ADMIN`/`SUPERADMIN`) with a dedicated test proving
`SECURITY` specifically can export (the role most likely to need it,
per the task's own reasoning), cross-tenant access is rejected via
`assertUserBelongsToTenant` before any query runs, and `SUPERADMIN`
bypasses the tenant check as expected. UTF-8 BOM verified at the byte
level (`0xEF 0xBB 0xBF`). Filename format matches spec
(`access-log-<tenantId>-<from>_<to>.csv`). The web page adds a
`canViewLogs` check correctly distinct from the existing `canManage`
(confirmed `SECURITY` is included in the former, excluded from the
latter, matching decision #2), and — as a genuine improvement beyond
what the task asked for — replaced a pre-existing hardcoded `sampleLogs`
mock array that was rendering fake data in this table with the real
`GET /access/tenant/:tenantId/logs` response.

**Noted, not a bug:** the on-screen table's date-range inputs filter
client-side over the single capped (`take: 100`) fetch — they don't
trigger a new server request. This matches the spec's explicit "no
backend change needed for this part" instruction, so it's working as
designed, but it does mean a wide on-screen date selection can show
fewer rows than actually exist for that range if the ЖК has more than
100 events total (the CSV export is unaffected — it always queries the
full range independently). Worth keeping in mind for a future
pagination follow-up, not a defect in this task.

**Verified independently:** re-ran the full suite (357/357 pass,
6 new tests), `tsc --noEmit` clean in `backend/` and `frontend-web/`,
full kk/ru/en parity (972/972/972 web keys). Task accepted, no fixes
required.
