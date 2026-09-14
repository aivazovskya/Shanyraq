# Task 0064: Announcement removal/deactivation

**Status:** Completed
**Assignee:** Team lead (implementing directly while Antigravity is
out of quota, per the user's explicit instruction)
**Reviewer:** N/A for this task while implemented directly — an
independent review can be requested separately if desired.

## Context

Beyond-ТЗ feature. **Researched, not guessed — confirmed directly in
[announcements.service.ts](../backend/src/modules/announcements/announcements.service.ts):**
the module only has `getAnnouncements` and `createAnnouncement`. There
is no way to edit or remove a published announcement — once
`HOA_ADMIN`/`HOA_CHAIRMAN`/`DISPATCHER`/`SUPERADMIN` posts one (a typo
in the water-shutoff date, an outdated urgent alert), it stays on the
feed forever with no correction mechanism. `getAnnouncements`
([announcements.service.ts:13-26](../backend/src/modules/announcements/announcements.service.ts#L13-L26))
returns every row for the tenant unconditionally, ordered
`isUrgent desc, createdAt desc`.

**Confirmed in [schema.prisma](../backend/prisma/schema.prisma) —
`model Announcement`** (line 457) currently has no status/removal
columns at all, unlike `CommunityListing`
([Task 0011](0011-community-board.md)), which already solved this
exact "author-posted content needs staff-moderated removal" problem
for a different domain. This task brings the same shape to
announcements.

### Architecture decisions already made — do not re-litigate

1. **Reuse `CommunityListing`'s moderation shape exactly, adapted to
   this model** — a `status` enum (`ACTIVE`/`REMOVED`) plus
   `removedById`/`removedReason` columns, not a hard delete. Staff
   need to see *what* was removed and *why* for accountability (e.g. a
   resident asks "where did the urgent alert about the elevator go?").
2. **New `AnnouncementStatus` enum (`ACTIVE`, `REMOVED`)** on
   `Announcement`, `@default(ACTIVE)`. `removedById String?` (relation
   to `User`, `onDelete: SetNull` — matches `CommunityListing.removedBy`
   exactly), `removedReason String?`.
3. **Schema side-effect to handle carefully:** `Announcement` currently
   has a single, unnamed relation to `User` (`author`). Adding
   `removedBy` makes it a *second* relation to `User`, which Prisma
   requires to be named to disambiguate — same situation
   `CommunityListing` already solved
   ([schema.prisma:722-723](../backend/prisma/schema.prisma#L722-L723)
   — `@relation("ListingsAuthored")` / `@relation("ListingsRemoved")`).
   Concretely:
   - `Announcement.author` gains `@relation("AnnouncementsAuthored", ...)`.
   - New `Announcement.removedBy User? @relation("AnnouncementsRemoved", fields: [removedById], references: [id], onDelete: SetNull)`.
   - On `model User`, the existing unnamed back-relation
     `announcements Announcement[]`
     ([schema.prisma:192](../backend/prisma/schema.prisma#L192)) must
     be renamed to `announcementsAuthored Announcement[] @relation("AnnouncementsAuthored")`
     and a new `announcementsRemoved Announcement[] @relation("AnnouncementsRemoved")`
     added. **Confirmed safe** — grepped the whole backend for
     `.announcements` usage on a `User` object and found none; this
     back-relation is never referenced in application code today, only
     implied by the schema.
   - `Tenant.announcements` ([schema.prisma:104](../backend/prisma/schema.prisma#L104))
     is untouched — that's the single `tenantId` relation, unaffected
     by this change.
4. **Role gate for removal: reuse `createAnnouncement`'s exact role
   set** — `[HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER, SUPERADMIN]`
   ([announcements.controller.ts:28](../backend/src/modules/announcements/announcements.controller.ts#L28)) —
   not `community-board`'s `moderateListing` set (which omits
   `HOA_CHAIRMAN`). The closest sibling method in *this* module is
   `createAnnouncement`, not another module's moderation endpoint —
   whoever can publish can also retract what they or a colleague
   published.
5. **Mandatory removal reason, same as `ModerateListingDto`** — an
   empty/whitespace-only reason is rejected with
   `BadRequestException`. Same accountability reasoning as
   [Task 0011](0011-community-board.md).
6. **`getAnnouncements` filtering: staff (the same role set as
   decision #4) see every status; everyone else (residents, `SECURITY`)
   sees `ACTIVE` only.** `SECURITY` is deliberately treated like a
   resident here — it was never part of the create/remove role set for
   this module, so it has no accountability reason to see removed
   announcements either. No new query-param/DTO for this — unlike
   `community-board`'s `GetListingsQueryDto`, nothing here asks staff
   to filter by status, they just see everything, matching the
   module's existing param-free `getAnnouncements` signature.
7. **No notification is sent on removal** — matches
   `moderateListing`'s own behavior in `community-board` (removal is a
   corrective action, not a push-worthy event); `createAnnouncement`'s
   existing `sendToTenant` push stays untouched.
8. **Add a `ANNOUNCEMENT_REMOVED` case to
   `AuditLogService.exportAuditLogsCsv`'s `formatActionName` switch**
   ([audit-log.service.ts:115-134](../backend/src/modules/audit-log/audit-log.service.ts#L115-L134))
   — every other moderation-style action already has a human-readable
   Russian label there (`LISTING_MODERATED` → "Модерация объявления");
   leaving this one out would silently leak the raw action string into
   a staff-facing CSV export, the same class of bug already caught
   twice in this project (Task 0053's enum leak, just for a backend
   label map instead of an i18n key).

---

## Subtask A — Backend: removal endpoint

In [schema.prisma](../backend/prisma/schema.prisma):

- Add `enum AnnouncementStatus { ACTIVE REMOVED }`.
- On `model Announcement`: add `status AnnouncementStatus @default(ACTIVE)`,
  `removedById String?`, `removedReason String?`; rename the `author`
  relation to `@relation("AnnouncementsAuthored", ...)` (decision #3);
  add `removedBy User? @relation("AnnouncementsRemoved", fields: [removedById], references: [id], onDelete: SetNull)`.
- On `model User`: rename `announcements Announcement[]` to
  `announcementsAuthored Announcement[] @relation("AnnouncementsAuthored")`;
  add `announcementsRemoved Announcement[] @relation("AnnouncementsRemoved")`.
- Run `prisma generate` in `backend/` (note: this environment has no
  reachable Postgres to `db push` against — same outstanding
  limitation flagged since Task 0057; the user runs `prisma db push`
  separately when a database is available).

In [announcements.service.ts](../backend/src/modules/announcements/announcements.service.ts):

- Inject `AuditLogService` (decision #8's sibling requirement — needed
  for the removal action's own audit entry, same as
  `moderateListing`'s `auditLogService.log(...)` call).
- In `getAnnouncements(tenantId, user)` — change signature to take
  `user` — add `whereClause.status = AnnouncementStatus.ACTIVE` unless
  `user.role` is in `[HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER, SUPERADMIN]`
  (decision #6).
- Add `removeAnnouncement(id, user, dto: { reason: string })`:
  - Role check against decision #4's set (`ForbiddenException` with
    code `ANNOUNCEMENTS.REMOVE_FORBIDDEN` otherwise — defense in depth
    alongside the controller's own `@Roles`, matching
    `moderateListing`'s own belt-and-suspenders pattern).
  - `findUnique` the announcement; `NotFoundException`
    (`ANNOUNCEMENTS.NOT_FOUND`) if missing.
  - Cross-tenant check: `user.role !== SUPERADMIN && user.tenantId !==
    announcement.tenantId` → `ForbiddenException`
    (`ANNOUNCEMENTS.REMOVE_CROSS_TENANT_FORBIDDEN`).
  - Already-removed check → `BadRequestException`
    (`ANNOUNCEMENTS.ALREADY_REMOVED`).
  - Empty/whitespace reason → `BadRequestException`
    (`ANNOUNCEMENTS.REMOVAL_REASON_REQUIRED`) (decision #5).
  - `update` to `status: REMOVED, removedById: user.id, removedReason:
    dto.reason.trim()`.
  - `auditLogService.log({ tenantId, actorId: user.id, action:
    'ANNOUNCEMENT_REMOVED', targetType: 'Announcement', targetId: id,
    metadata: { reason } })`.

In [announcements.controller.ts](../backend/src/modules/announcements/announcements.controller.ts):

- `PATCH /announcements/:id/remove`, `@Roles(HOA_ADMIN, HOA_CHAIRMAN,
  DISPATCHER, SUPERADMIN)` (decision #4), body validated by a new
  `RemoveAnnouncementDto` (mirrors `ModerateListingDto` exactly:
  `@IsString() @IsNotEmpty() reason: string`) in
  [dto/announcements.dto.ts](../backend/src/modules/announcements/dto/announcements.dto.ts).
- Pass `user` through to `getAnnouncements` in the existing `GET
  tenant/:tenantId` route (decision #6 needs it).

In [announcements.module.ts](../backend/src/modules/announcements/announcements.module.ts):

- Add `AuditLogModule` to `imports` (not `@Global()` — confirmed by
  reading
  [audit-log.module.ts](../backend/src/modules/audit-log/audit-log.module.ts),
  same reason `community-board.module.ts` already imports it).

In [audit-log.service.ts](../backend/src/modules/audit-log/audit-log.service.ts):

- Add `case 'ANNOUNCEMENT_REMOVED': return 'Удаление объявления/новости';`
  to `formatActionName` (decision #8).

**Tests:** extend `announcements.service.spec.ts` (create this file if
it doesn't already exist — confirm first):
- A `REMOVED` announcement is excluded from `getAnnouncements` for a
  resident/`SECURITY` caller.
- The same `REMOVED` announcement IS included for
  `HOA_ADMIN`/`HOA_CHAIRMAN`/`DISPATCHER`/`SUPERADMIN` callers
  (proves decision #6's staff-sees-everything rule).
- `removeAnnouncement` succeeds for each of the four allowed roles,
  sets `status`/`removedById`/`removedReason` correctly, and writes an
  audit log entry with `action: 'ANNOUNCEMENT_REMOVED'`.
- A resident calling `removeAnnouncement` is rejected
  (`ForbiddenException`) — defense-in-depth check.
- Cross-tenant staff removal is rejected (`ForbiddenException`); a
  `SUPERADMIN` cross-tenant removal succeeds.
- Removing an already-`REMOVED` announcement is rejected
  (`BadRequestException`).
- An empty/whitespace-only `reason` is rejected
  (`BadRequestException`), and no DB update or audit log call happens.
- Non-existent `id` → `NotFoundException`.

---

## Acceptance criteria

- A published announcement can be removed by the same roles allowed to
  publish it, with a mandatory reason.
- Removed announcements disappear from the feed for residents and
  `SECURITY`, but remain visible (with the removal reason) to
  `HOA_ADMIN`/`HOA_CHAIRMAN`/`DISPATCHER`/`SUPERADMIN`.
- The removal is recorded in the audit log with a correctly labeled
  action, verified end-to-end via the CSV export's `formatActionName`.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/`.

## Explicitly out of scope

- Editing an announcement's title/content — this task is removal only,
  matching the specific gap identified (a wrong announcement needs to
  disappear, not necessarily be correctable in place).
- A push/notification on removal — per decision #7.
- Web/mobile UI for the removal button — this task is the backend
  mechanism only; a dashboard "Удалить" button on the existing
  announcements list can follow separately if requested, same staged
  approach as prior beyond-ТЗ backend-first tasks.
- Auto-expiry of old announcements after N days — a different feature
  (time-based archival, like [Task 0057](0057-community-board-auto-archive.md)),
  not requested here.

---

## Deliverable

- Single backend commit.
- Implementation notes must state the exact schema relation-rename
  (decision #3) explicitly, since it's the one change here with a
  side effect beyond the new feature itself.

---

## Implementation notes (2026-09-14)

Implemented exactly per the spec above.

**Schema:** `AnnouncementStatus` enum (`ACTIVE`/`REMOVED`) added;
`Announcement` gained `status @default(ACTIVE)`, `removedById`,
`removedReason`. Per decision #3, `author` was renamed to
`@relation("AnnouncementsAuthored", ...)` and a new
`removedBy User? @relation("AnnouncementsRemoved", ...)` added. On
`User`, the old unnamed `announcements Announcement[]` back-relation
was removed and replaced with the two named back-relations
`announcementsAuthored`/`announcementsRemoved` — confirmed beforehand
via a full-backend grep that no application code referenced
`.announcements` on a `User` object, so this rename has no other
call-site impact. `prisma generate` ran clean (no reachable Postgres
in this environment to `db push` against — the same outstanding
limitation flagged since Task 0057; left for the user to run
separately).

**Backend:** `AnnouncementsService` now injects `AuditLogService`
(module updated to `imports: [AuditLogModule]`, matching
`community-board.module.ts`'s precedent since `AuditLogModule` isn't
`@Global()`). `getAnnouncements(tenantId, user)` forces
`status: ACTIVE` for everyone except
`[HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER, SUPERADMIN]`, who see every
status unfiltered — `SECURITY` is treated like a resident here per
decision #6. `removeAnnouncement(id, user, dto)` added with the exact
validation order from the spec: role check → existence check →
cross-tenant check → already-removed check → empty-reason check →
update + audit log write (`action: 'ANNOUNCEMENT_REMOVED'`).
`PATCH /announcements/:id/remove` added to the controller with
`@Roles(HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER, SUPERADMIN)` — the same
set as `createAnnouncement`, not `community-board`'s narrower
moderation set (decision #4). `AuditLogService.formatActionName`
gained a `'ANNOUNCEMENT_REMOVED'` → `'Удаление объявления/новости'`
case so the CSV export never leaks the raw action string.

Tests added to `announcements.service.spec.ts` (12 new, 18 total —
the pre-existing "resident sees own-tenant announcements" test was
also updated, since it now asserts `status: ACTIVE` is present in the
`where` clause it always implicitly satisfied before this task): staff
sees unfiltered announcements, `SECURITY` sees `ACTIVE`-only, all four
allowed roles can remove (parameterized `it.each`) with a verified
audit log call, a resident is rejected before any DB read, cross-tenant
staff is rejected, `SUPERADMIN` cross-tenant removal succeeds,
double-removal is rejected, empty/whitespace reason is rejected with
no DB write, and non-existent id yields `NotFoundException`.

**Verified:** new/updated tests 18/18 in this file, full backend suite
570/570 (31 suites, 0 regressions — 558 prior + 12 net new), `tsc
--noEmit` clean. No i18n changes (backend-only task, no UI surface).

**Not verified:** no live database in this environment, so
`prisma db push` and an end-to-end run against real Postgres weren't
exercised — same limitation as every other schema-touching task since
Task 0057.

**Caveat:** implemented and verified by the same person (the
architect, standing in for Antigravity while it's out of quota) — no
independent second-pass review, same as Tasks 0056-0061. Ask
separately if one is wanted.
