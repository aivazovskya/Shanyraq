# Task 0050: Per-resident activity CSV export

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature. **Researched, not guessed — why this isn't just "add
an export button to the existing activity analytics."**
[Task 0032](0032-finance-analytics-csv-export.md)'s own decision #1
explicitly ruled out exporting `getActivityAnalytics`
([analytics.service.ts](../backend/src/modules/analytics/analytics.service.ts))
because it's "almost entirely scalar summary numbers, not naturally
row-shaped" (`totalRegisteredResidentsCount`, `adoptionRatePercent`,
`votesCast`, `requestsCreated`, etc. — one number each, for the whole
ЖК). That reasoning still holds — this task does **not** export that
method's output. Instead, it adds a genuinely row-shaped report: **the
same six activity counters, broken down per resident** instead of
summed for the whole ЖК. This is the natural, useful form of "resident
activity export" — identifying which residents are engaged (worth
inviting to be building representatives, ОСС organizers) versus which
have never voted or submitted a reading (worth a personal follow-up) —
and it's a new query, not a reuse of the existing aggregate method.

**Researched, not guessed — the "who did this" field on each activity
table**, confirmed directly in `schema.prisma`: `Vote.userId`,
`ServiceRequest.creatorId`, `Booking.bookedById`,
`CommunityListing.authorId`, `ChatMessage.senderId`,
`MeterReading.submittedById`.

### Architecture decisions already made — do not re-litigate

1. **New method, new query — not a reuse of `getActivityAnalytics`.**
   Per the context above; this task adds
   `exportResidentActivityCsv`, it doesn't touch or export the existing
   aggregate method.
2. **Same role gate as the existing activity analytics endpoint — no
   new authorization decision.** `assertStaffAccess`
   (`SUPERADMIN`/`HOA_ADMIN`/`HOA_CHAIRMAN`, `DISPATCHER` excluded), the
   same check `getActivityAnalytics` already uses — unlike
   [Task 0049](0049-sos-statistics-and-trends.md)'s SOS statistics,
   there's no role-set tension here: resident-engagement tracking is
   genuinely an HOA_ADMIN/HOA_CHAIRMAN concern, not a dispatcher one, so
   reusing the analytics module's existing restrictive gate is correct
   this time, not a risk to route around.
3. **Aggregate via `groupBy` per activity type, merged onto the resident
   list in memory — not a per-resident loop.** Same "no N+1" discipline
   [Task 0035](0035-superadmin-platform-overview.md) established for
   its platform overview: six `groupBy(['<userIdField>'])` queries (one
   per activity table, each scoped to the tenant and the date range),
   not `residents.length × 6` individual count queries.
4. **Same resident population as `getActivityAnalytics`'s
   `totalRegisteredResidentsCount`** — every `User` with role
   `RESIDENT_OWNER`/`RESIDENT_TENANT` and `tenantId` matching the
   target tenant, not just verified ones (matches the existing method's
   own population definition, don't narrow or widen it independently).
5. **Same date-range convention as the rest of the analytics
   module** — `from`/`to` query params, default last 30 days, matching
   `getActivityAnalytics`'s own default.
6. **Sorted by total activity (sum of all six counters) descending** —
   the most-engaged residents first, so a board member skimming the
   file immediately sees who's active versus scrolling to find them.

---

## Subtask A — Backend: export endpoint

In [analytics.service.ts](../backend/src/modules/analytics/analytics.service.ts),
add `exportResidentActivityCsv(tenantId, user, query?: { from?: string; to?: string })`:

- `assertStaffAccess` (decision #2), resolve `from`/`to` (decision #5).
- Fetch the resident population (decision #4): `id`, `firstName`,
  `lastName`, `phone`.
- Six `groupBy` queries scoped to `tenantId` + date range (decision #3):
  - `vote.groupBy(['userId'])` — join path: `agendaItem.meeting.tenantId`.
  - `serviceRequest.groupBy(['creatorId'])` — `tenantId` direct.
  - `booking.groupBy(['bookedById'])` — join path: `resource.tenantId`.
  - `communityListing.groupBy(['authorId'])` — `tenantId` direct.
  - `chatMessage.groupBy(['senderId'])` — join path:
    `conversation.tenantId`.
  - `meterReading.groupBy(['submittedById'])` — join path:
    `meter.unit.building.tenantId`.
  - Note: `groupBy` can't traverse relations directly for the ones with
    a join path — same situation
    [Task 0035](0035-superadmin-platform-overview.md) hit for its debt
    aggregation; either a raw query or fetching the relevant rows with
    the join field selected and reducing in memory is fine, just don't
    do it in a per-resident loop.
- Merge each `groupBy` result onto the resident list by user id,
  defaulting any resident absent from a given result to `0` (same
  zero-fill requirement Task 0035's review verified).
- Build CSV via `buildCsv`: columns ФИО, телефон, голосов подано,
  заявок создано, бронирований, объявлений, сообщений в чате, показаний
  счётчиков, итого, sorted per decision #6. Header row with ЖК name and
  period.
- Filename `resident-activity-${tenantId}-${fromDateStr}_${toDateStr}.csv`.

In [analytics.controller.ts](../backend/src/modules/analytics/analytics.controller.ts):

- `GET /analytics/tenants/:tenantId/activity/export?from=&to=`, inherits
  the class-level `@Roles` (already `SUPERADMIN, HOA_ADMIN, HOA_CHAIRMAN`
  — decision #2, no override needed here since that's the correct set
  for once), `@Res()` streaming with `Content-Disposition`.

**Tests:** extend `analytics.service.spec.ts` —
- A resident with activity in multiple tables (e.g. 2 votes + 1 request)
  shows both counts correctly attributed, not conflated.
- A resident with zero activity in the period appears with explicit
  `0`s across all six columns, not omitted.
- Each `groupBy`/equivalent query is called exactly once regardless of
  resident count (seed 10+ mock residents, assert call counts) — the
  direct proof against the N+1 pattern decision #3 warns about.
- Sort order is descending by total activity.
- `DISPATCHER` is rejected (matches `getActivityAnalytics`'s existing
  behavior — proves decision #2 didn't accidentally loosen anything).
- Raw CSV bytes start with the UTF-8 BOM.

## Subtask B — Web: download button

- Add a "Скачать CSV" button to the activity section of
  [analytics/page.tsx](../frontend-web/src/app/dashboard/analytics/page.tsx),
  using `apiDownload`, reflecting whatever date range the page's
  activity section is currently showing.
- Full kk/ru/en i18n parity for the new button label.

---

## Acceptance criteria

- The export is genuinely per-resident (row-shaped), not a repackaging
  of the existing aggregate `getActivityAnalytics` numbers.
- No N+1 query pattern — verified by the exactly-once `groupBy`-call
  assertions.
- A resident with zero activity in the period appears with explicit
  zeros, not omitted from the file.
- `DISPATCHER` cannot access this export, matching the existing activity
  analytics endpoint's role gate exactly.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in `backend/`
  and `frontend-web/`; full kk/ru/en i18n parity maintained.

## Explicitly out of scope

- Exporting `getActivityAnalytics`'s existing aggregate numbers — not
  what this task does, per the context section.
- Mobile UI — analytics management has stayed web-only throughout this
  project.
- Per-activity-type drill-down (e.g. clicking a resident's vote count to
  see which specific meetings) — a distinct, larger feature.

---

## Review addendum (2026-09-11) — accepted, no issues found

**Verified good:** all six `groupBy` queries (`vote`/`serviceRequest`/
`booking`/`communityListing`/`chatMessage`/`meterReading`) run
concurrently in one `Promise.all`, each with the exact join path
specified (`agendaItem.meeting.tenantId`, `resource.tenantId`,
`conversation.tenantId`, `meter.unit.building.tenantId`) — no N+1, and
a dedicated test proves each is called exactly once regardless of
resident count. Zero-fill via `Map.get(id) || 0` correctly gives every
resident explicit zeros rather than omitting inactive ones. Sort order
(descending `totalActivity`, name as tiebreak) is tested directly.
`DISPATCHER` rejection is tested, confirming the class-level
`@Roles` gate was correctly left untouched rather than loosened.
UTF-8 BOM verified.

**Verified independently:** 478/478 backend tests pass (6 new),
`tsc --noEmit` clean in `backend/` and `frontend-web/`, full kk/ru/en
parity (1044/1044/1044 web keys). Task accepted, no fixes required.

## Deliverable

- Backend and web can ship as separate commits.
- PR description confirms the exactly-once-per-groupBy test result
  explicitly — this is the property most worth calling out given
  decision #3.
