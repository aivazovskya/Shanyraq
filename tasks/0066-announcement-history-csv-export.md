# Task 0066: Announcement history CSV export

**Status:** Completed
**Assignee:** Team lead (implementing directly while Antigravity is
out of quota, per the user's explicit instruction)
**Reviewer:** N/A for this task while implemented directly — an
independent review can be requested separately if desired.

## Context

Beyond-ТЗ feature. There is no way to get the ЖК's announcement history
out of the app — `getAnnouncements`
([announcements.service.ts](../backend/src/modules/announcements/announcements.service.ts))
is a JSON feed only. A board (правление) preparing for an ОСС or
reviewing what was communicated to residents over a period has no
export to hand out, unlike guest passes ([Task 0062](0062-guest-pass-history-csv-export.md)),
access logs ([Task 0037](0037-access-log-csv-export.md)), SOS alerts
([Task 0056](0056-sos-alerts-csv-export.md)), and dispatcher chat
transcripts ([Task 0059](0059-dispatcher-chat-transcript-export.md)) —
this project's four prior "history CSV export" tasks, all following
the same shape.

### Architecture decisions already made — do not re-litigate

1. **Same mandatory-by-default 30-day `from`/`to` bound as every prior
   history export in this project** ([Task 0037](0037-access-log-csv-export.md),
   [0056](0056-sos-alerts-csv-export.md), [0059](0059-dispatcher-chat-transcript-export.md),
   [0062](0062-guest-pass-history-csv-export.md)) — reuse
   `exportGuestPassesCsv`'s exact `from`/`to` resolution logic
   ([access-control.service.ts:1069-1073](../backend/src/modules/access-control/access-control.service.ts#L1069-L1073)).
   Announcements publish at a much lower rate than those four logs, but
   this project has consistently chosen the bounded-with-default shape
   for every accumulating-history export regardless of volume, and
   staff can still request a year-long range by passing wide
   `from`/`to` values — no reason to special-case this one.
2. **Role gate: reuse this module's own `ANNOUNCEMENT_STAFF_ROLES`
   exactly** — `[HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER, SUPERADMIN]`
   ([announcements.service.ts](../backend/src/modules/announcements/announcements.service.ts),
   the same set `getAnnouncements` already uses to decide who sees
   `REMOVED` rows and that `removeAnnouncement`/`createAnnouncement`
   already gate on). Not `access-control`'s guest-pass export set
   (which additionally includes `SECURITY` — a different module's own
   convention, not this one's).
3. **The export includes `REMOVED` announcements, unlike the JSON feed
   sent to non-staff callers.** This endpoint is staff-only from the
   start (decision #2), and the entire point of an audit-style export
   is to show what was communicated *and* what was later retracted, with
   the reason — the same reasoning that already justifies exposing
   `removedReason` to staff in the JSON feed
   ([Task 0064](0064-announcement-removal.md)) applies here too.
4. **`updatedAt` doubles as the "дата удаления" column for `REMOVED`
   rows.** `Announcement` has no dedicated removal-timestamp column,
   and [Task 0064](0064-announcement-removal.md) deliberately left
   editing out of scope — meaning `updatedAt` can only ever change from
   `createdAt` as a result of `removeAnnouncement`'s `update` call.
   Confirmed by rereading the service: no other code path calls
   `prisma.announcement.update`. This makes `updatedAt` a reliable
   stand-in for "when was this removed" without a schema change, but
   it's a non-obvious reuse — worth flagging so nobody "fixes" it later
   by wiring it to a real edit feature without also adding a dedicated
   `removedAt` column.
5. **Author role is output as the raw `UserRole` enum string, not
   translated to a Russian label.** Matches `AuditLogService`'s own CSV
   export precedent exactly (`actorRole = item.actor?.role`,
   [audit-log.service.ts:151](../backend/src/modules/audit-log/audit-log.service.ts#L151) —
   no translation layer). Deliberately choosing not to build a
   role-label switch here avoids the exact mechanical
   enum-to-display-string bug class caught twice already in this
   project ([Task 0053](0053-booking-resource-utilization-analytics.md)) —
   simplest correct option is to not transform it at all, same as the
   existing precedent already does.
6. **Endpoint: `GET /announcements/tenant/:tenantId/export?from=&to=`**,
   declared in the controller the same way
   [Task 0062](0062-guest-pass-history-csv-export.md) did — Nest
   matches the literal `export` segment correctly regardless of
   declaration order relative to `GET tenant/:tenantId`, but keep it
   grouped near that route for readability anyway.

---

## Subtask A — Backend: export endpoint

In [announcements.service.ts](../backend/src/modules/announcements/announcements.service.ts),
add `exportAnnouncementsCsv(tenantId, user, query?: { from?: string; to?: string })`:

- Role check against `ANNOUNCEMENT_STAFF_ROLES` (decision #2) —
  `ForbiddenException` (`ANNOUNCEMENTS.EXPORT_FORBIDDEN`) otherwise.
- Resolve `from`/`to` (decision #1, default last 30 days).
- Fetch tenant name for the CSV header.
- `announcement.findMany({ where: { tenantId, createdAt: { gte: from,
  lte: to } }, include: { author: {...}, removedBy: {...} }, orderBy:
  { createdAt: 'desc' } })` — **no `status` filter** (decision #3).
- Build CSV via `buildCsv`: header rows (title, ЖК name, period), then
  columns Дата публикации, Заголовок, Текст сообщения, Срочное
  (Да/Нет), Автор (ФИО), Роль автора (raw enum, decision #5), Статус
  (Активно/Удалено), Кем удалено (ФИО или "—"), Причина удаления (или
  "—"), Дата удаления (`updatedAt` when `REMOVED`, decision #4, else
  "—").
- Filename `announcements-${tenantId}-${fromDateStr}_${toDateStr}.csv`.

In [announcements.controller.ts](../backend/src/modules/announcements/announcements.controller.ts):

- `GET tenant/:tenantId/export` (decision #6), `@Roles(HOA_ADMIN,
  HOA_CHAIRMAN, DISPATCHER, SUPERADMIN)`, `@Query('from')`/`@Query('to')`,
  `@Res()` streaming with `Content-Disposition` — copy
  `exportGuestPassesCsv`'s controller method shape exactly
  ([access-control.controller.ts:106-120](../backend/src/modules/access-control/access-control.controller.ts#L106-L120)).

**Tests:** extend `announcements.service.spec.ts`:
- An announcement created outside the `from`/`to` range is excluded,
  one inside is included (the date-filter property, matching every
  prior history-export task's "must not skip this" test).
- A `REMOVED` announcement IS included in the export (proves decision
  #3 — the opposite of `getAnnouncements`'s own filtering for
  non-staff).
- The `REMOVED` row's "Дата удаления" column uses `updatedAt`, and an
  `ACTIVE` row's uses "—".
- `SECURITY` and residents are rejected (`ForbiddenException`); each of
  the four allowed roles succeeds.
- Cross-tenant staff rejected; `SUPERADMIN` cross-tenant succeeds.
- Raw CSV bytes start with the UTF-8 BOM.
- Omitting `from`/`to` defaults to the last 30 days.

---

## Acceptance criteria

- The export is bounded by a mandatory-by-default date range.
- `REMOVED` announcements appear in the export with their reason and
  remover, unlike the JSON feed's non-staff view.
- Role gate matches this module's own `ANNOUNCEMENT_STAFF_ROLES`
  exactly, not a different module's convention.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/`.

## Explicitly out of scope

- A web download button — backend endpoint only, matching every prior
  CSV export task's staged approach.
- Mobile UI — announcement export is a staff-only reporting tool.
- Any change to `getAnnouncements`'s own JSON feed or its
  staff-sees-everything/resident-sees-`ACTIVE`-only filtering — that
  stays exactly as [Task 0064](0064-announcement-removal.md) left it.

---

## Deliverable

- Single backend commit.
- PR description confirms the date-range exclusion test and the
  `REMOVED`-rows-are-included property explicitly — the second one is
  what most distinguishes this export from the JSON feed it's modeled
  on.

---

## Implementation notes (2026-09-14)

Implemented exactly per the spec above, with one addition beyond the
original spec text: `exportAnnouncementsCsv` also calls
`assertUserBelongsToTenant` itself (not just the controller), matching
`exportGuestPassesCsv`'s own belt-and-suspenders pattern
([access-control.service.ts:1067](../backend/src/modules/access-control/access-control.service.ts#L1067))
so the cross-tenant rejection is directly unit-testable at the service
level rather than only reachable through the controller.

**Backend:** `exportAnnouncementsCsv(tenantId, user, query?)` added to
`announcements.service.ts` — role check against
`ANNOUNCEMENT_STAFF_ROLES`, `assertUserBelongsToTenant`, `from`/`to`
resolution identical to `exportGuestPassesCsv`'s, `announcement.findMany`
with **no `status` filter** (decision #3 — `REMOVED` rows included),
`include: { author, removedBy }`. CSV built via `buildCsv` with the
10 spec'd columns; `updatedAt` used for "Дата удаления" only when
`status === REMOVED` (decision #4), author role output raw (decision
#5, no translation layer, matching `AuditLogService`'s own CSV
precedent). `GET /announcements/tenant/:tenantId/export?from=&to=`
added to the controller, `@Roles(HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER,
SUPERADMIN)`, streamed the same way as `exportGuestPassesCsv`'s
controller method.

Tests added to `announcements.service.spec.ts` (13 new, 31 total):
date-range where-clause assertion, confirmation that no `status` key
is added to the `where` clause (the property distinguishing this from
`getAnnouncements`), a `REMOVED` row's CSV text containing "Удалено",
its reason, and its `updatedAt` ISO string while an `ACTIVE` row shows
"Активно", all four allowed roles succeed (parameterized), `SECURITY`
and residents rejected, cross-tenant staff rejected, `SUPERADMIN`
cross-tenant succeeds, UTF-8 BOM present, and the 30-day default
window.

**Verified:** new tests 31/31 in this file (18 prior + 13 new), full
backend suite 583/583 (31 suites, 0 regressions — 571 prior + 12 net
new after accounting for the file's own growth), `tsc --noEmit` clean.
No i18n changes (backend-only task, no UI surface, matching the
"explicitly out of scope: web download button" decision).

**Caveat:** implemented and verified by the same person (the
architect, standing in for Antigravity while it's out of quota) — no
independent second-pass review, same as Tasks 0056-0061, 0064, 0065.
Ask separately if one is wanted.
