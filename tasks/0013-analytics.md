# Task 0013: Extended analytics for УК (расширенная аналитика)

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

[PRODUCT_SPEC.md](PRODUCT_SPEC.md) §4.8 requires: *"Собираемость платежей,
статистика по заявкам, активность жильцов в приложении"*. Per §2/§6's role
table, this is explicitly an `HOA_ADMIN` ("Полный доступ: ... аналитика")
and `HOA_CHAIRMAN` ("просмотр отчётов") capability — `DISPATCHER` is not
named for analytics access in the ТЗ, unlike the operational modules
(meters, bookings, community board) where it was. See
[PROGRESS.md](PROGRESS.md) — not started.

**This is different in shape from every prior Phase 2/3 task**: there's no
new user-facing workflow, no resident-facing side, and almost no new
domain model — it's **read-only aggregation over data that already exists**
across `finance`, `service-requests`, `votings`, `bookings`,
`community-board`, `chat`, and `meters`. Web-only; the ТЗ places this
squarely under §4 (веб-панель), not §3 (mobile).

**Don't confuse this with the existing basic dashboard.** §4.1
("Дашборд" — already built, see
[dashboard/page.tsx](../frontend-web/src/app/dashboard/page.tsx)) is a
top-line summary with some demo/sample data still in it. §4.8 is a
separate, more detailed reporting page. **Do not touch the existing
dashboard page in this task** — that's a distinct, smaller cleanup that
can be its own future task if wanted. This task adds a new page.

### Architecture decisions already made — do not re-litigate

1. **"Активность жильцов" means aggregate interaction counts, not
   session/login tracking.** This codebase has no login/session/last-seen
   instrumentation anywhere, and adding it (middleware on every
   authenticated request, a new log table) is a much bigger, separate
   concern than this ticket. Define resident activity as counts of
   existing, already-logged interactions over a period: votes cast,
   service requests created, bookings made, community listings posted,
   chat messages sent, meter readings submitted — plus the
   verified-vs-total-registered resident ratio (adoption, not engagement,
   but cheap and useful). If the business later wants true DAU/MAU from
   actual app opens, that's a distinct future instrumentation project.
2. **Three focused read endpoints, not one giant blob.** Finance, request,
   and activity analytics are naturally different shapes (finance is
   monthly per the existing `Charge.periodMonth/periodYear` convention;
   requests/activity are better queried by an arbitrary date range on
   `createdAt`). Keep them as three separate service methods/endpoints so
   the web page can fetch them independently and in parallel, rather than
   one method doing everything.
3. **A charting library is justified here, unlike prior tasks.** Every
   previous web page in this codebase used tables/lists because that's
   what the data needed. This is the first genuinely chart-shaped feature
   (trends over time, category breakdowns) — add `recharts` to
   `frontend-web/package.json` (a common, well-documented React charting
   library) rather than hand-rolling SVG. Don't add a charting library to
   `mobile/` — this task has no mobile subtask at all.
4. **Access: `HOA_ADMIN`, `HOA_CHAIRMAN`, `SUPERADMIN` — no `DISPATCHER`.**
   Matches the ТЗ role table precisely (see Context above), a deliberate
   departure from the broader staff-role sets used in the operational
   modules (meters review, bookings moderation, etc.).

---

## Subtask A — Backend: analytics module

New module `backend/src/modules/analytics/`, `@Roles(HOA_ADMIN,
HOA_CHAIRMAN, SUPERADMIN)` on every endpoint, tenant-scoped via
`assertUserBelongsToTenant` (import from
[tenant.guard.ts](../backend/src/common/guards/tenant.guard.ts), the
original helper already used by `properties.controller.ts` — this module
is pure read/reporting with no resident-facing branch at all, so it
doesn't need the `assertAccessToTenant`-style helper from bookings/
community-board/chat; that pattern exists specifically for endpoints with
a resident-access branch, which this module has none of).

**`GET /analytics/tenants/:tenantId/finance?month=&year=`** (default to
the current month/year if omitted):
- `totalCharged`, `totalCollected`, `collectionRatePercent` for that
  period, computed from `Charge`/`Payment` the same way
  [finance.service.ts](../backend/src/modules/finance/finance.service.ts)
  already aggregates (`prisma.charge.aggregate`/`payment.aggregate` scoped
  to accounts in this tenant and, for charges, this period).
- `byTariff`: amount charged per `TariffItem` for the period (for a
  breakdown chart).
- `topDebtors`: the N (e.g. 10) `PersonalAccount`s with the most negative
  `balance` in this tenant, with unit number for identification.

**`GET /analytics/tenants/:tenantId/requests?from=&to=`** (default: last
30 days):
- Counts of `ServiceRequest` by `status` and by `category` in the period.
- Average resolution time in hours for requests that reached `RESOLVED`
  or `CLOSED` within the period (`updatedAt - createdAt`).
- Average `rating` (excluding nulls).

**`GET /analytics/tenants/:tenantId/activity?from=&to=`** (default: last
30 days):
- `verifiedResidentsCount` / `totalRegisteredResidentsCount` for the
  tenant (all-time, not period-bound — this is a snapshot ratio, not a
  period count).
- Within the period: `votesCast`, `requestsCreated`, `bookingsCreated`,
  `listingsCreated`, `chatMessagesSent`, `meterReadingsSubmitted` — one
  count query per model, all scoped to this tenant and the date range.

**Tests:** new `analytics.service.spec.ts` covering: tenant isolation on
all three endpoints (BOLA test matching this codebase's standard —
foreign tenant's staff rejected, `SUPERADMIN` unrestricted), `DISPATCHER`
rejected (per decision #4), collection rate math is correct against a
known set of mocked charges/payments, resolution-time average excludes
requests still open, activity counts are correctly scoped to the given
date range (a request created just outside `from`/`to` isn't counted).

## Subtask B — Web: analytics page

New page `frontend-web/src/app/dashboard/analytics/page.tsx`
(`HOA_ADMIN`, `HOA_CHAIRMAN`, `SUPERADMIN`), same conventions as every
prior page (`apiRequest`/`getStoredSession`, i18n `t()` from the start,
new `analytics` namespace in all three locale files):

- Finance section: collection-rate stat card, a bar or pie chart for the
  per-tariff breakdown (via `recharts`), a top-debtors table.
- Requests section: status/category breakdown charts, average resolution
  time and rating as stat cards.
- Activity section: adoption ratio stat card, a simple bar chart or stat
  grid for the six interaction counts.
- A month/year picker for the finance section, a date-range picker (or
  simple preset buttons — "7 дней" / "30 дней" / "90 дней" — a full custom
  date-range picker component is more than this needs) for
  requests/activity.
- Add an "Аналитика" nav entry in
  [dashboard/layout.tsx](../frontend-web/src/app/dashboard/layout.tsx),
  visible only to the roles above.

---

## Acceptance criteria

- All three endpoints are tenant-isolated (foreign tenant's staff
  rejected, `SUPERADMIN` unrestricted) and reject `DISPATCHER`.
- Collection rate, resolution time, and activity counts match a
  hand-computed expectation against known test data.
- The analytics page renders all three sections with at least one real
  chart (not just stat-card numbers) using `recharts`.
- The existing basic dashboard page is untouched by this task.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in `backend/`
  and `frontend-web/` (no mobile changes, so no mobile typecheck concern
  here); full kk/ru/en key parity in `frontend-web`'s locale files.

## Explicitly out of scope

- Login/session/DAU-MAU tracking — see decision #1.
- Touching or "fixing" the existing basic dashboard's sample data — a
  separate, smaller task if wanted later.
- Mobile — this is a web-panel-only feature per the ТЗ.
- Exporting reports (PDF/Excel) — not asked for in §4.8, a reasonable
  future addition once this base reporting view is validated.

## Deliverable

- Subtask A and B can ship together or separately, reviewer's call.
- PR description should confirm: `DISPATCHER` is excluded (matches the ТЗ
  role table, not the broader operational-role pattern used elsewhere),
  and no login/session tracking was added anywhere.

---

## Review addendum (2026-09-09) — solid backend, a full pass of i18n leftovers on the web page

**Verified good:** all three aggregation endpoints are correct against the
spec — finance's charged/collected split (billed-in-period vs. paid-in-
calendar-month, a standard simple collection-rate framing), per-tariff
breakdown, top-10 debtors; requests' status/category grouping, resolution
time correctly excludes still-open requests, rating average excludes
nulls; activity's adoption ratio as an all-time snapshot plus six
correctly-tenant-scoped interaction counts (each traced through the right
relation chain — `agendaItem.meeting.tenantId` for votes,
`resource.tenantId` for bookings, `conversation.tenantId` for chat,
`meter.unit.building.tenantId` for readings). `DISPATCHER` correctly
excluded at the controller level. No schema change, no mobile changes,
existing dashboard page untouched — all as specified. `recharts` is
genuinely used for real charts, not just added and ignored. 227/227
backend tests, `tsc --noEmit` clean, 655/655/655 key parity.

**Found:** more of the same class of leftover hardcoded Russian strings
caught in every prior task's review, this time a fuller batch on one page
— [frontend-web/src/app/dashboard/analytics/page.tsx](../frontend-web/src/app/dashboard/analytics/page.tsx):
- Lines 186, 207, 228 — `err.message || 'Ошибка загрузки ...'` fallbacks
  for each of the three sections.
- Line 496-497 — `` `${...}% от начислений` `` / `'Нет начислений'`.
- Line 604, 782 — `'Период анализа:'` label (appears twice, once per
  section's date-range control).
- Line 658 — `'для решённых и закрытых заявок'` (a caption under the
  resolution-time stat).
- Line 675 — `'Нет оценок за период'`.
- Lines 818, 828, 839 — `'зарегистрировано в приложении'`,
  `'подтверждённые собственники/арендаторы'`,
  `'доля верификации от всех зарегистрированных'` (captions under the
  activity stat cards).

**Required fix:** migrate all of the above to `t()` calls in the
`analytics` namespace, keeping full kk/ru/en parity. No other files need
touching — the backend and the rest of this task's scope are confirmed
clean.
