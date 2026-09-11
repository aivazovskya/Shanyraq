# Task 0057: Auto-archive stale community board listings

**Status:** Completed
**Assignee:** Team lead (implementing directly while Antigravity is out
of quota, per the user's explicit instruction)
**Reviewer:** N/A for this task while implemented directly — an
independent review can be requested separately if desired.

## Context

Beyond-ТЗ feature. **Researched, not guessed — confirmed directly in
[schema.prisma](../backend/prisma/schema.prisma):** `ListingStatus`
currently has exactly three values — `ACTIVE`, `CLOSED` ("author
marked resolved"), `REMOVED` ("moderator took it down"). There is no
value for "the system aged this out" — and reusing either existing one
would misrepresent what happened: `CLOSED` implies the author resolved
it themselves, `REMOVED` implies a moderator acted (and carries
`removedById`/`removedReason` fields specifically for that). This task
adds a fourth value, `ARCHIVED`, for exactly this new case: the system
auto-archiving a listing that's been sitting `ACTIVE` for too long,
keeping the board from filling up with stale posts nobody remembers to
close.

**Also confirmed, and this shrinks the task's real scope
significantly:** [`updateListing`](../backend/src/modules/community-board/community-board.service.ts#L166-L237)
already lets an author freely set `dto.status` to anything except
`REMOVED` (that one specific value is blocked at
[community-board.service.ts:192-197](../backend/src/modules/community-board/community-board.service.ts#L192-L197)).
Once `ARCHIVED` exists as a valid enum value, an author can already
re-activate their own auto-archived listing (`status: 'ACTIVE'`) or
manually archive one themselves through the exact same endpoint that
already handles `CLOSED` today — **no new endpoint, no new
"republish" logic, and no change to `updateListing` is needed.** This
task is the cron job plus the UI/type updates needed so `ARCHIVED`
displays correctly everywhere `ACTIVE`/`CLOSED`/`REMOVED` already do —
not a new moderation feature.

### Architecture decisions already made — do not re-litigate

1. **Add `ARCHIVED` to the `ListingStatus` enum in `schema.prisma`,
   `prisma db push` + `generate`.** No migrations in this project —
   direct schema edits, per established convention.
2. **Residents already never see it — no query change needed in
   `getListings`.** `getListings` already forces `whereClause.status =
   ListingStatus.ACTIVE` for non-staff
   ([community-board.service.ts:64-66](../backend/src/modules/community-board/community-board.service.ts#L64-L66)) —
   an `ARCHIVED` listing is just as invisible to the general feed as a
   `CLOSED` one already is, automatically, with zero code change.
   Staff filtering by `query.status` already accepts any
   `ListingStatus` value, so `ARCHIVED` becomes filterable the moment
   the enum has it — no DTO change needed either (`@IsEnum(ListingStatus)`
   in `GetListingsQueryDto` validates against the Prisma enum
   directly).
3. **90-day threshold, hardcoded constant — no per-tenant
   configuration.** Matches the hardcoded-constant precedent of every
   prior scheduler task in this project (e.g. `SLA_THRESHOLD_HOURS` in
   [Task 0052](0052-service-request-sla-reminders.md)). Applies
   uniformly to all `ListingType`s — no evidence any one category
   needs a different shelf life, don't invent a per-type table.
4. **Only `ACTIVE` listings older than the threshold (by `createdAt`)
   get archived.** `CLOSED` and `REMOVED` listings are already
   invisible to the board and don't need touching — archiving them
   too would just relabel an already-resolved state for no benefit.
5. **New `CommunityBoardSchedulerService`, daily cron — no Redis
   debounce needed.** Unlike every reminder task in this project (which
   need debouncing because the same condition can be true on
   consecutive cron runs), archiving is a one-way terminal state
   change: once a listing's `status` flips to `ARCHIVED`, the next
   run's `where: { status: ACTIVE, ... }` filter naturally excludes it
   — the query itself is the debounce. Don't add a Redis key for this.
   `@Cron('0 4 * * *', { timeZone: 'Asia/Almaty' })` — once daily at
   04:00, a low-traffic hour, matching the daily cadence
   [Task 0021](0021-scheduled-charge-generation.md)/[Task 0045](0045-voting-deadline-reminders.md)/[Task 0047](0047-meter-reading-reminders.md)
   already use for non-time-critical maintenance jobs (contrast with
   [Task 0054](0054-booking-upcoming-reminders.md)'s 5-minute cadence,
   which needed to catch an arbitrary intraday timestamp — a 90-day
   threshold has no such precision requirement).
6. **Notify the author when their listing is archived**, matching the
   established pattern that every scheduler task in this project pairs
   a state change with a push notification. Body should mention the
   listing can be reactivated (since decision above already makes that
   possible via the existing edit flow with no new code). Fail-open
   categorization — don't touch `NOTIFICATION_CATEGORIES`/`CATEGORY_MAP`,
   same decision as every prior reminder task.
7. **No audit log entry.** [Task 0041](0041-staff-audit-trail.md)'s
   audit trail is for staff actions; this is an automated system
   action with no actor, and nothing in this task's scope asked for an
   audit record of it. Don't add one — keep this task's footprint to
   exactly what was asked.
8. **Web and mobile: extend the existing hand-written `ListingStatus`
   type union and `getStatusBadge` switch, don't leave `ARCHIVED`
   unhandled.** Both
   [frontend-web/.../community-board/page.tsx](../frontend-web/src/app/dashboard/community-board/page.tsx)
   and
   [mobile/.../CommunityBoardScreen.tsx](../mobile/src/screens/community-board/CommunityBoardScreen.tsx)
   declare their own `type ListingStatus = 'ACTIVE' | 'CLOSED' |
   'REMOVED'` (not derived from the Prisma enum) with a `getStatusBadge`
   switch over it. The mobile switch has **no `default` case** — it's
   only type-safe today because the union is exhaustively covered;
   adding `'ARCHIVED'` to the type without adding a matching `case`
   will make `tsc --noEmit` in `mobile/` fail on that function
   ("not all code paths return a value"), which is exactly the signal
   telling you the case is missing — use it as the verification, don't
   work around it.

---

## Subtask A — Schema

In [schema.prisma](../backend/prisma/schema.prisma), add `ARCHIVED` to
`enum ListingStatus` (after `REMOVED`, with a short comment mirroring
the existing `ACTIVE`/`CLOSED`/`REMOVED` comment style — "system
auto-archived after N days of inactivity"). Run `prisma db push` and
`prisma generate` in `backend/`.

## Subtask B — Backend: archive scheduler

Create `backend/src/modules/community-board/community-board-scheduler.service.ts`:

- `ARCHIVE_THRESHOLD_DAYS = 90` (decision #3).
- `@Cron('0 4 * * *', { timeZone: 'Asia/Almaty' })` method
  `handleStaleListingArchival()`.
- Fetch `ListingStatus.ACTIVE` listings with `createdAt` older than
  `now - 90 days` (decision #4), selecting `id`, `tenantId`,
  `authorId`, `title`.
- For each: `update` to `status: ARCHIVED`, then
  `notificationsService.sendToUser(authorId, ...)` (decision #6) —
  title like `📦 Объявление перемещено в архив`, body naming the
  listing title and mentioning it can be reactivated by editing it.
  Per-record `try/catch` isolation, same discipline as every prior
  scheduler in this project.
- Return a summary object (`listingsChecked`, `listingsArchived`) for
  testability.

Register `CommunityBoardSchedulerService` in
[community-board.module.ts](../backend/src/modules/community-board/community-board.module.ts)'s
`providers` array. `ScheduleModule.forRoot()` is already global; no new
`imports` needed for `NotificationsService` (also global).

**Tests:** new
`backend/src/modules/community-board/community-board-scheduler.service.spec.ts` —
- An `ACTIVE` listing created 91 days ago is archived; one created 89
  days ago is not (proves the threshold boundary).
- A `CLOSED` or `REMOVED` listing older than 90 days is never touched
  (proves the status filter — decision #4).
- The author receives a notification via `sendToUser` naming the
  listing's own title.
- One listing's notification failure doesn't prevent others in the
  same sweep from being archived (per-record isolation).

## Subtask C — Web: status display

In [community-board/page.tsx](../frontend-web/src/app/dashboard/community-board/page.tsx):

- Extend `type ListingStatus` to include `'ARCHIVED'`.
- Add an `ARCHIVED` case to `getStatusBadge` (a distinct, muted style —
  not reusing `CLOSED`'s exact styling, so staff can visually tell an
  author-resolved listing from a system-archived one at a glance).
- Add an `<option value="ARCHIVED">` to the status filter `<select>`
  alongside the existing `ACTIVE`/`CLOSED`/`REMOVED` options.
- New i18n key `communityBoard.statusArchived` in ru/kk/en.

## Subtask D — Mobile: status display

In
[CommunityBoardScreen.tsx](../mobile/src/screens/community-board/CommunityBoardScreen.tsx)
and
[community-board.ts](../mobile/src/api/community-board.ts):

- Extend `type ListingStatus` (in `community-board.ts`) to include
  `'ARCHIVED'`.
- Add an `ARCHIVED` case to `getStatusBadge` (per decision #8 — this
  is what keeps `tsc --noEmit` passing).
- New i18n key `communityBoard.statusArchived` in ru/kk/en (mobile
  locale files).

---

## Acceptance criteria

- Only `ACTIVE` listings past the 90-day threshold are archived —
  proven by both the boundary test and the status-exclusion test.
- The author is notified per archived listing.
- `getListings`'s existing resident-visibility filter needs no code
  change and continues to hide `ARCHIVED` listings from the general
  feed automatically.
- `tsc --noEmit` clean in `backend/`, `frontend-web/`, and `mobile/`
  (the mobile check specifically proves Subtask D's switch case was
  added, per decision #8).
- `npm test` passes in `backend/`.
- Full kk/ru/en i18n parity maintained in both `frontend-web/` and
  `mobile/`.

## Explicitly out of scope

- Any change to `updateListing` — per the Context section, an author
  can already set/unset `ARCHIVED` on their own listing through the
  existing endpoint with zero new code.
- Per-tenant or per-listing-type configurable thresholds — a fixed
  90-day constant for this task, per decision #3.
- An audit log entry for the automated archival — per decision #7.
- A dedicated "Archived" tab/section in the resident-facing UI beyond
  the existing "My listings" view (which already shows every status
  for the author's own posts with no change needed) — not asked for.

---

## Deliverable

- Schema + backend scheduler can ship as one commit; web and mobile
  display updates as one or two more.
- PR description confirms the 90-day boundary test result explicitly,
  and calls out that no new endpoint was needed for reactivation —
  those are the two properties most worth highlighting given decisions
  #3 and the Context section.

---

## Implementation notes (2026-09-12)

Implemented exactly per the spec above:

- **Schema:** `ARCHIVED` added to `ListingStatus` in
  [schema.prisma](../backend/prisma/schema.prisma). `npx prisma
  generate` run successfully (regenerates the client from the schema
  file alone). **`npx prisma db push` could NOT be run in this
  environment — there is no live PostgreSQL server reachable
  (`P1001: Can't reach database server at localhost:5432`).** This is
  an environment limitation, not a code issue: the schema and
  generated client are correct and consistent, but **the real
  database's enum has not been altered yet.** Someone needs to run
  `npx prisma db push` (or the team's normal deploy step) against the
  actual dev/prod database before this feature works end-to-end — flag
  this to the user explicitly.
- **Backend:** `CommunityBoardSchedulerService`
  ([community-board-scheduler.service.ts](../backend/src/modules/community-board/community-board-scheduler.service.ts))
  — daily cron at 04:00 Asia/Almaty, `ARCHIVE_THRESHOLD_DAYS = 90`
  constant, one `findMany` filtered to `ACTIVE` + `createdAt < cutoff`,
  per-record `update` + `sendToUser` notification with `try/catch`
  isolation. Registered in
  [community-board.module.ts](../backend/src/modules/community-board/community-board.module.ts).
- **Tests:** new
  `community-board-scheduler.service.spec.ts`, 6 tests — cutoff-date
  computation, the 91-day-vs-89-day boundary (using two real candidate
  objects filtered through a mock that replicates the actual Prisma
  `where` clause, not a hand-picked result), `CLOSED`/`REMOVED`
  exclusion, author notification content, per-record error isolation,
  and Prisma-fetch-failure safety.
- **Web:** `ListingStatus` type, `getStatusBadge` (new `Archive`-icon
  slate badge, visually distinct from `CLOSED`'s style per decision
  #8), the status filter `<select>`, and the listing-card dimming
  logic all updated in
  [community-board/page.tsx](../frontend-web/src/app/dashboard/community-board/page.tsx).
  Confirmed the status filter is a real server-side query param (not
  client-only), so the new option works end-to-end.
- **Mobile:** `ListingStatus` type
  ([community-board.ts](../mobile/src/api/community-board.ts)) and
  `getStatusBadge` (new `info`-variant badge, distinct from `CLOSED`'s
  `default` variant) updated in
  [CommunityBoardScreen.tsx](../mobile/src/screens/community-board/CommunityBoardScreen.tsx).
- **i18n:** `statusArchived` added to all three locale files in both
  `frontend-web/` and `mobile/`.

**Verified:**
- Backend: new spec 6/6, full suite 517/517 (30 suites, 0
  regressions), `tsc --noEmit` clean.
- `tsc --noEmit` clean in `frontend-web/` and `mobile/` — the mobile
  result specifically proves the `getStatusBadge` switch case was
  added correctly (per decision #8, that function has no `default`
  case, so a missing case would have failed this exact check).
- i18n parity: web 1062/1062/1062 (+1 key), mobile 793/793/793 (+1
  key) across ru/kk/en.

**Outstanding action for the user:** run `npx prisma db push` (and
`generate` again if needed) against the real database — this
environment has no reachable PostgreSQL instance, so the schema change
is only applied to the Prisma Client's generated types here, not to
any actual database yet.

**Caveat:** implemented and verified by the same person (the
architect, standing in for Antigravity while it's out of quota) — no
independent second-pass review, same as Task 0056. Ask separately if
one is wanted.
