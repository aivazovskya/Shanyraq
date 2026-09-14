# Task 0072: Shift handover notes for security/dispatch staff

**Status:** Completed
**Assignee:** Team lead (implementing directly while Antigravity is
out of quota, per the user's explicit instruction)
**Reviewer:** N/A for this task while implemented directly — an
independent review can be requested separately if desired.

## Context

Beyond-ТЗ feature, a brand-new domain — **confirmed by searching the
whole backend for any existing "handover"/"shift" concept: none
exists.** `SECURITY` and `DISPATCHER` staff work in shifts, but there
is currently no way for one shift to leave context for the next
("guest waiting at Block A entrance", "elevator in Block B out of
service until tomorrow", "resident in unit 42 asked to be called back
about a leak"). Today this information either lives in a private chat
outside the app or gets lost between shifts entirely.

**This is deliberately not a ticket system and not another chat
thread** — it's a simple chronological logbook any on-duty staff
member can post a short note to and the next shift reads at the start
of theirs. `ServiceRequest` already exists for anything that needs
tracked resolution; this is for informal situational context that
doesn't need a status lifecycle.

### Architecture decisions already made — do not re-litigate

1. **New module `shift-handover`**, not folded into `sos`, `chat`, or
   `access-control` — this is its own domain (a logbook), not a
   sub-feature of an existing one, same reasoning every other
   standalone domain in this project got its own module
   (`audit-log`, `community-board`, `announcements`).
2. **Role shape copied directly from
   [Task 0010](0010-sos-button.md)'s SOS precedent — the closest
   analogous "operational staff, chairman included but view-only"
   case in this codebase**: `SECURITY`, `DISPATCHER`, `HOA_ADMIN`,
   `SUPERADMIN` can post and read; `HOA_CHAIRMAN` can read only (no
   posting — a chairman isn't working the shift). Not `chat`'s
   dispatcher-only role set (which excludes `SECURITY` entirely — wrong
   for a *physical* shift handover) and not `access-control`'s guest-
   pass set (which doesn't distinguish read vs. write access for
   `HOA_CHAIRMAN` at all).
3. **New model `ShiftHandoverNote`** — `tenantId`, `authorId`,
   `content`, `createdAt`. No status/acknowledgment field, no title,
   no attachments — deliberately as simple as a logbook entry gets.
4. **No date-range filtering — return the most recent 50 notes,
   `createdAt desc`.** Unlike this project's CSV-export-shaped logs
   (access log, SOS, guest passes — all bounded by a mandatory
   date range because they're compliance/audit artifacts meant to be
   exported and kept), a shift handover note's value decays fast: a
   new security guard needs "what happened in the last day or two,"
   not a paginated archive. A flat recent-N cap is the right shape for
   this use case, not a `from`/`to` query.
5. **No push notification on a new note.** Unlike announcements
   (broadcast-to-everyone, urgent-capable) or chat (a direct
   conversation), a handover note is read passively at shift start —
   pushing every note to every on-duty staff member's phone in
   real time would be noisy for something that isn't urgent by nature.
   Can be reconsidered later if actually requested.
6. **No edit/delete in this task.** A logbook entry is a timestamped
   record of what someone observed/communicated at the time — allowing
   silent edits after the fact undermines that. If a correction is
   needed, the simplest fix is posting a new note, same as any other
   log in this project (`AuditLog` also has no edit/delete). Can add a
   staff-moderation removal later, mirroring
   [Task 0064](0064-announcement-removal.md)'s pattern, if actually
   needed.
7. **Content: non-empty, max 2000 characters** — generous enough for a
   real handover note, short enough to keep this a logbook and not a
   document store.

---

## Subtask A — Backend: post + list

In [schema.prisma](../backend/prisma/schema.prisma), add
`model ShiftHandoverNote` (decision #3) with relations to `Tenant`
(`onDelete: Cascade`) and `User` (`onDelete: Cascade`); add the
corresponding back-relation arrays (`Tenant.shiftHandoverNotes`,
`User.shiftHandoverNotesAuthored` — no relation name needed on either
side since each is the only relation between that pair of models). Run
`prisma generate` (same no-reachable-Postgres caveat as every schema
change this session).

New module `backend/src/modules/shift-handover/`:

- `shift-handover.service.ts`:
  - `createNote(tenantId, user, dto)`: role check against decision
    #2's post-capable set (`ForbiddenException`
    `SHIFT_HANDOVER.POST_FORBIDDEN` otherwise),
    `assertUserBelongsToTenant`, validate non-empty/≤2000-char content
    (`BadRequestException` `SHIFT_HANDOVER.CONTENT_REQUIRED` /
    `SHIFT_HANDOVER.CONTENT_TOO_LONG`), `create` with `include: {
    author: { select: firstName, lastName, role } }`.
  - `getNotes(tenantId, user)`: role check against decision #2's full
    set (post-capable roles + `HOA_CHAIRMAN`),
    `assertUserBelongsToTenant`, `findMany({ where: { tenantId },
    take: 50, orderBy: { createdAt: 'desc' }, include: { author: {...}
    } })` (decision #4).
- `shift-handover.controller.ts`: `POST tenants/:tenantId/notes`
  (`@Roles(SECURITY, DISPATCHER, HOA_ADMIN, SUPERADMIN)`),
  `GET tenants/:tenantId/notes` (`@Roles(SECURITY, DISPATCHER,
  HOA_ADMIN, HOA_CHAIRMAN, SUPERADMIN)`).
- `dto/shift-handover.dto.ts`: `CreateShiftHandoverNoteDto` (`content:
  string`, `@IsNotEmpty() @MaxLength(2000)`).
- `shift-handover.module.ts`: standard module wiring (`PrismaModule`
  import — `@Global()` so technically optional, but match this
  project's existing convention of still listing it explicitly where
  other modules do, e.g. `community-board.module.ts`).
- Register `ShiftHandoverModule` in `app.module.ts`.

**Tests:** new `shift-handover.service.spec.ts`:
- Each of `SECURITY`/`DISPATCHER`/`HOA_ADMIN`/`SUPERADMIN` can post a
  note; `HOA_CHAIRMAN` is rejected from posting
  (`ForbiddenException`) — the property this task's role design exists
  to enforce (decision #2's read-vs-write split).
- `HOA_CHAIRMAN` CAN read the notes list (view-only, matching SOS's
  precedent) — proves the split isn't "chairman excluded entirely."
- A resident is rejected from both posting and reading.
- Cross-tenant staff rejected from both.
- Empty/whitespace-only content rejected; content over 2000 characters
  rejected.
- `getNotes` returns at most 50 notes ordered newest-first (mock more
  than 50 in the `findMany` call assertion — verify `take: 50` is
  passed, not that 50 real rows exist).

---

## Acceptance criteria

- `SECURITY`/`DISPATCHER`/`HOA_ADMIN`/`SUPERADMIN` can post and read
  notes; `HOA_CHAIRMAN` can read but not post; residents can do
  neither.
- Notes are tenant-isolated.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/`.

## Explicitly out of scope

- Edit/delete — per decision #6.
- Push notifications on new notes — per decision #5.
- Read/acknowledgment tracking per staff member — not requested; the
  feed is passively read, not a per-user inbox.
- Web/mobile UI — this task is the backend mechanism only; a simple
  feed + post box can follow separately if requested, same staged
  approach used for [Task 0064](0064-announcement-removal.md)/
  [0065](0065-announcement-removal-web-ui.md).

---

## Deliverable

- Single backend commit.
- PR description confirms the `HOA_CHAIRMAN` read-yes/write-no split
  explicitly — that's the property most worth calling out since it's
  the one non-obvious role design decision in this task.

---

## Implementation notes (2026-09-14)

Implemented exactly per the spec above.

**Schema:** `ShiftHandoverNote` added (`tenantId`, `authorId`,
`content`, `createdAt`, `@@index([tenantId, createdAt])` matching
`AuditLog`'s own indexing shape since both are append-only,
tenant-scoped, time-ordered logs). Back-relations added to `Tenant`
and `User`, neither needing a relation name (only relation between
each pair). `prisma generate` ran clean (no reachable Postgres in this
environment, same outstanding limitation as every schema change this
session).

**Backend:** new `shift-handover` module — `ShiftHandoverService` with
`createNote`/`getNotes`, both built around two module-level role
constants (`SHIFT_HANDOVER_POST_ROLES` and `SHIFT_HANDOVER_READ_ROLES
= [...POST_ROLES, HOA_CHAIRMAN]`) so the read-superset-of-write
relationship is structural, not two independently-maintained arrays
that could drift. Content emptiness is checked server-side after
`.trim()` (the DTO's `@IsNotEmpty()` alone doesn't catch
whitespace-only input, matching the exact pattern `removeAnnouncement`
already established for its own `reason` field); `@MaxLength(2000)`
on the DTO is enforced automatically by the project's existing global
`ValidationPipe`, no service-level length check needed.
`ShiftHandoverModule` registered in `app.module.ts` alongside every
other domain module.

Tests added: new `shift-handover.service.spec.ts` (16 tests) — all
four post-capable roles succeed, `HOA_CHAIRMAN` is rejected from
posting but explicitly confirmed able to read (the one property this
task's role design exists to prove), a resident and cross-tenant staff
rejected from both actions, empty/whitespace content rejected,
content is trimmed before storage, and `getNotes`'s `findMany` call is
asserted to pass `take: 50` / `orderBy: { createdAt: 'desc' }`
verbatim.

**Verified:** new suite 16/16, full backend suite 639/639 (32 suites,
0 regressions — 623 prior + 16 new), `tsc --noEmit` clean. No i18n
changes (backend-only task, no UI surface, matching the "explicitly
out of scope: web/mobile UI" decision).

**Caveat:** implemented and verified by the same person (the
architect, standing in for Antigravity while it's out of quota) — no
independent second-pass review, same as every self-implemented task
this session (0056-0061, 0064-0071). Ask separately if one is wanted.
