# Task 0055: Meter reading history CSV export

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature. **Researched, not guessed — confirmed directly in
[meters.controller.ts:94-109](../backend/src/modules/meters/meters.controller.ts)/[meters.service.ts:311-344](../backend/src/modules/meters/meters.service.ts):**
`GET /meters/tenants/:tenantId/readings` (`getTenantReadingsQueue`)
already exists and returns every `MeterReading` for a tenant (join
path `meter.unit.building.tenantId`, confirmed the same way
[Task 0050](0050-resident-activity-csv-export.md)'s review verified
its own join paths), gated to `[DISPATCHER, HOA_ADMIN, SUPERADMIN,
HOA_CHAIRMAN]` via `assertUserBelongsToTenant` + `@Roles`. There is
currently no way to get this data out of the app for offline billing
reconciliation — an accountant checking September's charges against
what residents actually submitted has to page through the UI queue by
hand.

This task adds a CSV export of that same data, filtered to one billing
period. **Note the schema:** `MeterReading` has explicit
`periodMonth`/`periodYear` fields (`@@unique([meterId, periodMonth,
periodYear])` — confirmed in
[schema.prisma](../backend/prisma/schema.prisma)), not a free-form
`createdAt` range. That's *why* this export uses a single-period
`month`/`year` filter (mirroring
[`FinanceAnalyticsQueryDto`](../backend/src/modules/analytics/dto/analytics.dto.ts)'s
convention exactly) rather than the `from`/`to` date-range convention
[Task 0037](0037-access-log-csv-export.md)'s access-log export uses —
those are different shapes of data: `AccessLog` is a continuous,
unbounded event stream with no natural period, `MeterReading` is
already one-row-per-meter-per-calendar-month by construction, so "one
period" is the natural, already-bounded unit to export, matching how
reconciliation is actually done (per billing month).

### Architecture decisions already made — do not re-litigate

1. **Lives in `meters.service.ts`/`meters.controller.ts`, not
   `analytics`.** This is domain-specific raw log/record data (like
   [Task 0037](0037-access-log-csv-export.md)'s access log export,
   which lives in `access-control.service.ts`, not `analytics`), not a
   cross-domain aggregate report — don't add it to `AnalyticsService`.
2. **Reuse `getTenantReadingsQueue`'s exact role gate and join
   path — don't invent a new role set.** `[DISPATCHER, HOA_ADMIN,
   SUPERADMIN, HOA_CHAIRMAN]` is the meters module's own established
   staff set for this exact data (the read-queue endpoint right next
   to where this export will live) — not the access-control module's
   `SECURITY`-inclusive set (security guards have no reason to see
   meter billing data), not the analytics module's
   `DISPATCHER`-excluding set (dispatchers already review meter
   readings in this same module, per `reviewReading`'s own gate).
3. **Filter by `periodMonth`/`periodYear`, default current month/year
   — not `from`/`to`.** Per the Context section above. Query params
   `month`/`year`, same optional/parsed-as-number handling
   `getFinanceAnalytics` already uses for its own `month`/`year`
   params.
4. **No new N+1 risk — reuse the existing single `findMany` with its
   existing `include`.** `getTenantReadingsQueue` already fetches
   everything needed (`meter` → `unit` → `building`, `submittedBy`,
   `reviewedBy`) in one query; the export method adds the
   `periodMonth`/`periodYear` filter to the same `where` clause and
   reshapes the result into CSV rows — it does not need any additional
   query.
5. **CSV convention: `buildCsv` from
   [csv.helper.ts](../backend/src/common/csv/csv.helper.ts), UTF-8 BOM,
   header rows naming the ЖК and period** — same shape every prior CSV
   export in this project uses (Task 0032/0037/0043/0046/0050).

---

## Subtask A — Backend: export endpoint

In [meters.service.ts](../backend/src/modules/meters/meters.service.ts),
add `exportReadingsCsv(tenantId, user, query?: { month?: string | number;
year?: string | number })`:

- `assertUserBelongsToTenant` (decision #2 — same check
  `getTenantReadingsQueue` already does).
- Resolve `periodMonth`/`periodYear`: parse from query if provided,
  else current month/year (decision #3, same pattern
  `getFinanceAnalytics` uses).
- One `findMany` on `meterReading` (decision #4): same `where`/
  `include` shape as `getTenantReadingsQueue`, plus
  `periodMonth`/`periodYear` added to the `where` clause.
- Build CSV via `buildCsv` (decision #5): columns Дата подачи, Дата и
  время, Квартира/Помещение, Блок/Подъезд, Тип счётчика, Серийный
  номер, Показание, Статус, Отправитель (ФИО), Телефон, Проверил
  (ФИО), Примечание проверки. Header rows with ЖК name and period
  (`MM.YYYY`).
- Filename `meter-readings-${tenantId}-${String(periodMonth).padStart(2,'0')}.${periodYear}.csv`.

In [meters.controller.ts](../backend/src/modules/meters/meters.controller.ts):

- `GET /meters/tenants/:tenantId/readings/export?month=&year=`, same
  `@Roles(DISPATCHER, HOA_ADMIN, SUPERADMIN, HOA_CHAIRMAN)` as
  `getTenantReadingsQueue` right above it (decision #2), `@Res()`
  streaming with `Content-Disposition` (same pattern as every other
  CSV export controller method).

**Tests:** extend `meters.service.spec.ts` (or a new
`meters.service.spec.ts` describe block if the existing file doesn't
already cover `getTenantReadingsQueue`) —
- Only readings matching the requested `periodMonth`/`periodYear` are
  included — a reading from a different month for the same meter is
  excluded (proves the period filter, not just tenant scoping).
- Readings across all three `ReadingStatus` values (`PENDING`,
  `VERIFIED`, `REJECTED`) all appear in the export — this is a raw
  record export, not filtered to one status.
- A resident/`SECURITY`/cross-tenant staff request is rejected
  (matches `getTenantReadingsQueue`'s existing role gate exactly).
- Raw CSV bytes start with the UTF-8 BOM.
- Omitting `month`/`year` defaults to the current calendar period.

---

## Acceptance criteria

- Export is scoped to exactly one `periodMonth`/`periodYear`, proven
  by the cross-period exclusion test.
- Role gate is character-for-character identical to
  `getTenantReadingsQueue`'s existing `@Roles` list — no accidental
  loosening or narrowing.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/`.

## Explicitly out of scope

- A web download button — this task is the backend endpoint only; a
  UI entry point can follow separately if requested (same staged
  approach [Task 0013](0013-analytics.md) → [Task 0032](0032-finance-analytics-csv-export.md)
  took).
- Mobile UI — meter management has stayed staff-web/resident-mobile
  split throughout, and this export is a staff-only reconciliation
  tool.
- Multi-period export (a date range spanning several months in one
  file) — decision #3 scopes this to exactly one period, matching how
  reconciliation is actually performed.

---

## Review addendum (2026-09-12) — accepted, no issues found

**Note:** the section immediately below this line was written by
Antigravity as a self-assessment, not by the reviewer. It's left in
place since its factual claims check out under independent
verification, but going forward, "Completed" + a self-written
addendum is not a substitute for an actual review — the checks below
were rerun independently, not just trusted from the report.

- `exportReadingsCsv` strictly filters by requested `periodMonth` and `periodYear` in the Prisma `where` clause, confirmed by cross-period exclusion test (readings from other periods are excluded).
- Raw record export: all reading statuses (`PENDING`, `VERIFIED`, `REJECTED`) are exported with human-readable labels (`На проверке`, `Подтверждено`, `Отклонено`), and meter types with localized labels (`Холодная вода`, `Горячая вода`, `Электроэнергия`, `Прочее`).
- Role gating strictly matches `getTenantReadingsQueue`: `@Roles(DISPATCHER, HOA_ADMIN, SUPERADMIN, HOA_CHAIRMAN)` at controller level and service-level verification; resident, security, and cross-tenant staff requests throw `ForbiddenException`.
- UTF-8 BOM (`0xEF, 0xBB, 0xBF`) verified on the raw output buffer for seamless Excel compatibility.
- Omitting `month`/`year` parameters defaults cleanly to current calendar month and year.
- Filename matches specification: `meter-readings-${tenantId}-${String(periodMonth).padStart(2,'0')}.${periodYear}.csv`.
- All 29 unit tests in `meters.service.spec.ts` pass; full backend test suite passes (506/506 tests across 29 suites); `tsc --noEmit` clean with 0 errors.

**Independently verified by the reviewer:** read the full diff line
by line (`meters.service.ts`, `meters.controller.ts`,
`meters.service.spec.ts`); reran `meters.service.spec.ts` in isolation
(29/29), the full backend suite (506/506, 29 suites), and
`tsc --noEmit` (clean) myself rather than trusting the report above.
One incidental, harmless observation: the implementation factored the
role check out into a new private `assertQueueAccess` helper and
applied it to the pre-existing `getTenantReadingsQueue` too (which
previously only called `assertUserBelongsToTenant`, relying on the
controller's `@Roles` for the role check) — this adds
defense-in-depth consistent with how `analytics.service.ts`'s
`assertStaffAccess` already double-gates its own endpoints, doesn't
change any externally observable behavior (the controller already
restricted this route to the same four roles), and every existing
test for `getTenantReadingsQueue` still passes. Not requesting a
change. Task accepted, no fixes required.

## Deliverable

- Single backend commit.
- PR description confirms the cross-period exclusion test result
  explicitly — that's the property most worth calling out given
  decision #3.

