# Task 0056: SOS alert log CSV export

**Status:** Completed
**Assignee:** Team lead (implemented directly — Antigravity was out of
quota for this task; per the user's explicit instruction, the
architect temporarily took the implementer role for this one task
only)
**Reviewer:** N/A for this task — implemented and verified by the same
person per the user's request; an independent review pass can be
requested separately if desired.

## Context

Beyond-ТЗ feature. **Researched, not guessed — why this isn't just
"add an export button to `getSosStatistics`."**
[Task 0049](0049-sos-statistics-and-trends.md)'s `getSosStatistics`
(confirmed in
[sos.service.ts:218-314](../backend/src/modules/sos/sos.service.ts))
returns aggregate numbers — `totalAlerts`, a `byStatus` breakdown,
`averageResponseTimeMinutes`, a `dailyTrend` array — not individual
incidents. That's the same "scalar summary, not row-shaped" situation
[Task 0032](0032-finance-analytics-csv-export.md)'s decision #1 and
[Task 0050](0050-resident-activity-csv-export.md)'s context section
already ran into for other analytics methods, and the fix is the same
kind: this task does **not** export `getSosStatistics`'s numbers.
Instead, it exports the genuinely row-shaped data that already exists
one level down — the individual alert log
[`getTenantAlerts`](../backend/src/modules/sos/sos.service.ts#L177-L212)
already serves to the SOS dashboard (one row per emergency call), for
external incident reporting/audit (e.g. handing a UK's board a record
of every SOS call in a quarter, who responded, and how fast).

**Also confirmed:** `SosAlert` (in
[schema.prisma](../backend/prisma/schema.prisma)) has no natural
calendar period the way `MeterReading` does — `createdAt` is an
arbitrary timestamp on a continuous, unbounded event stream, the same
shape as `AccessLog`. This is why this export uses the `from`/`to`
date-range convention
[Task 0037](0037-access-log-csv-export.md)'s access-log export (and
`getSosStatistics` itself) already use — **not** the single
calendar-period `month`/`year` convention
[Task 0055](0055-meter-readings-csv-export.md)'s meter-reading export
just established for a genuinely different (already-periodic) shape
of data. Match the right precedent to the right data shape; don't
copy the most recent task's convention just because it's the most
recent.

### Architecture decisions already made — do not re-litigate

1. **New method on `SosService`, not `AnalyticsService`.** Same
   reasoning [Task 0037](0037-access-log-csv-export.md)'s access-log
   export and [Task 0055](0055-meter-readings-csv-export.md)'s
   meter-reading export already established: domain-specific raw log
   data belongs in its own module, not `analytics`.
2. **Reuse `getTenantAlerts`'s exact query shape and
   `assertStaffOrChairmanRole`'s exact role gate — don't invent a new
   one.** `assertStaffOrChairmanRole` (public method already on
   `SosService`) is `[SECURITY, DISPATCHER, HOA_ADMIN, HOA_CHAIRMAN]`
   + `SUPERADMIN` bypass — the SOS module's own established staff set
   for this exact data, deliberately including `SECURITY` (who
   dispatch to these alerts) unlike the `analytics` module's
   `DISPATCHER`-excluding set. Don't reuse `assertStaffAccess` from
   `analytics.service.ts` here.
3. **Bounded by mandatory-by-default `from`/`to`, same default as
   `getSosStatistics` (last 30 days).** Per the Context section — this
   is an ever-growing log, not a bounded snapshot, so it needs the
   same date-range discipline
   [Task 0037](0037-access-log-csv-export.md)'s access-log export
   established for exactly this reason.
4. **No new query needed — reuse `getTenantAlerts`'s existing
   `include` shape**, adding the date-range filter to its `where`
   clause. It already fetches `unit`+`building`, `triggeredBy`,
   `resolvedBy` in one `findMany` — no N+1 risk to introduce.
5. **Response time computed per-row in memory
   (`resolvedAt - createdAt`), same formula `getSosStatistics` already
   uses** — not a new calculation, just applied per-alert instead of
   averaged.
6. **CSV convention: `buildCsv`, UTF-8 BOM, header rows naming the ЖК
   and period** — same shape every prior CSV export in this project
   uses.

---

## Subtask A — Backend: export endpoint

In [sos.service.ts](../backend/src/modules/sos/sos.service.ts), add
`exportAlertsCsv(tenantId, user, query?: { from?: string; to?: string })`:

- `assertStaffOrChairmanRole` (decision #2), resolve `from`/`to`
  (decision #3, same default-last-30-days logic `getSosStatistics`
  already uses, including its 10-character-date-string UTC
  start/end-of-day handling).
- One `findMany` on `sosAlert` (decision #4): `tenantId` +
  `createdAt: { gte: from, lte: to }`, same `include` as
  `getTenantAlerts` (`unit.building`, `triggeredBy`, `resolvedBy`).
- Build CSV via `buildCsv`: columns Дата и время, Статус, ФИО жильца,
  Телефон, Квартира/Помещение, Блок/Подъезд, Широта, Долгота, Время
  реагирования (мин), Кем разрешено (ФИО), Примечание разрешения.
  Response time per row uses decision #5's formula, blank if
  `resolvedAt` is null (still-active or false-alarm-without-timestamp
  cases). Header rows with ЖК name and period.
- Filename `sos-alerts-${tenantId}-${fromDateStr}_${toDateStr}.csv`.

In [sos.controller.ts](../backend/src/modules/sos/sos.controller.ts):

- `GET /sos/tenants/:tenantId/alerts/export?from=&to=`, same
  `@Roles(SECURITY, DISPATCHER, HOA_ADMIN, HOA_CHAIRMAN, SUPERADMIN)`
  as `getTenantAlerts`/`getSosStatistics` right above it (decision
  #2), `@Res()` streaming with `Content-Disposition`.

**Tests:** extend `sos.service.spec.ts` —
- An alert outside the `from`/`to` range is excluded, one inside is
  included (proves the date filter).
- A `RESOLVED` alert's row shows a computed response time in minutes
  matching `resolvedAt - createdAt`; an `ACTIVE` alert (no
  `resolvedAt`) shows a blank response-time field, not a crash or a
  negative number.
- A resident and a cross-tenant staff request are rejected (matches
  `assertStaffOrChairmanRole`'s existing behavior); `SECURITY` and
  `SUPERADMIN` are both allowed (proves this reused the SOS module's
  own role set, not `analytics`'s `DISPATCHER`-excluding one — the
  presence of `SECURITY` access is the distinguishing check).
- Raw CSV bytes start with the UTF-8 BOM.
- Omitting `from`/`to` defaults to the last 30 days.

---

## Acceptance criteria

- Export is genuinely row-shaped (one row per SOS alert), not a
  repackaging of `getSosStatistics`'s aggregate numbers.
- Bounded by a mandatory-by-default date range — no unbounded query
  against an ever-growing log.
- Role gate matches `getTenantAlerts`/`getSosStatistics` exactly,
  including `SECURITY` access — proven by the dedicated test.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/`.

## Explicitly out of scope

- Exporting `getSosStatistics`'s existing aggregate/trend numbers —
  not what this task does, per the Context section.
- A web download button — backend endpoint only, matching the staged
  approach of prior CSV export tasks; a UI entry point can follow
  separately if requested.
- Mobile UI — SOS management has stayed staff-web-only for anything
  beyond the resident's own trigger button and `/sos/my`.

---

## Deliverable

- Single backend commit.
- PR description confirms the "includes `SECURITY`, matches
  `getTenantAlerts`'s role set" test result explicitly — that's the
  property most worth calling out given decision #2.

---

## Implementation notes (2026-09-12)

Implemented exactly per the spec above:
`SosService.exportAlertsCsv` (in
[sos.service.ts](../backend/src/modules/sos/sos.service.ts)) reuses
`assertStaffOrChairmanRole` and the same `from`/`to`
default-last-30-days resolution (including the 10-char-date UTC
start/end-of-day handling) as `getSosStatistics`, does one
`sosAlert.findMany` with the same `include` shape as
`getTenantAlerts`, computes response time per row the same way
`getSosStatistics` averages it, and builds the CSV via `buildCsv`.
Controller endpoint `GET /sos/tenants/:tenantId/alerts/export` added
to
[sos.controller.ts](../backend/src/modules/sos/sos.controller.ts)
with the identical `@Roles(SECURITY, DISPATCHER, HOA_ADMIN,
HOA_CHAIRMAN, SUPERADMIN)` used by its sibling endpoints.

Tests added to `sos.service.spec.ts` (5 new, reusing the file's
existing user fixtures): date-range filtering (exact `gte`/`lte`
assertion), response-time-in-minutes for a `RESOLVED` alert vs. a
blank field for an `ACTIVE` one, role gate (resident and cross-tenant
staff rejected; `SECURITY` and `SUPERADMIN` allowed), UTF-8 BOM, and
default-30-days-when-omitted.

**Verified:** `sos.service.spec.ts` 23/23 (18 prior + 5 new), full
backend suite 511/511 (29 suites, 0 regressions), `tsc --noEmit`
clean.

**Caveat:** this was implemented and verified by the same person (the
architect, standing in for Antigravity while it was out of quota) —
there was no independent second-pass review as with every other task
in this project. If an independent review is wanted, ask for one
separately.
