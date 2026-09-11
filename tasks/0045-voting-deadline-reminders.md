# Task 0045: Push reminders for owners who haven't voted before a meeting closes

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature. **Researched, not guessed** — grepped every call site
of `NotificationsService`'s fan-out methods across the backend: `votings`
sends **zero** push notifications today. A meeting opens, residents get
no nudge, and if quorum isn't reached by `Meeting.endDate` the vote
simply fails silently for whoever forgot. This task adds a reminder for
verified owners who haven't finished voting as a meeting's deadline
approaches — the same shape as
[Task 0021](0021-scheduled-charge-generation.md)'s overdue-balance
reminder cron, applied to voting instead of finance.

**Researched, not guessed — who is actually eligible to vote.**
`castVote` in
[votings.service.ts:203-227](../backend/src/modules/votings/votings.service.ts)
only allows a verified ownership with `ownershipType: OWNER` — verified
`TENANT`-type occupants are explicitly barred from voting under RK law
(the code's own comment: "Арендаторы и неподтвержденные пользователи
голосовать не могут"). The reminder must only target verified `OWNER`
ownerships — reminding a `TENANT`-type occupant to "go vote" would be
actively misleading, not just imprecise.

**Researched, not guessed — voting is per-unit, not per-owner.**
`Vote` has `@@unique([agendaItemId, unitId])` — one vote per unit per
agenda item, not one per user. A unit with multiple verified owners
(co-owners splitting `sharePercent`) has its vote satisfied by *any one*
of them casting it; the reminder can't know which co-owner intends to,
so when a unit's vote is incomplete, remind **every** verified owner of
that unit, not just one.

### Architecture decisions already made — do not re-litigate

1. **A separate `VotingsSchedulerService`, not new methods on
   `VotingsService` — mirrors [Task 0021](0021-scheduled-charge-generation.md)'s
   own separation of `FinanceService` (business logic) from
   `FinanceSchedulerService` (cron jobs).** Same reasoning applies here:
   keep scheduled-job orchestration out of the request-serving service
   class.
2. **"Hasn't finished voting" = the unit hasn't cast a vote on *every*
   agenda item of the meeting, not "hasn't voted on anything."** A
   partial voter (voted on item 1, not item 2) still needs a reminder —
   compare the count of distinct agenda items that unit has a `Vote`
   row for against the meeting's total agenda item count.
3. **Daily cron, 48-hour reminder window, once per (meeting, user) —
   not a fixed calendar day like the finance crons.** Meetings have
   arbitrary `startDate`/`endDate`, unlike finance's fixed monthly
   cycle, so this can't reuse a "1st of the month" schedule. Run once
   daily (`0 9 * * *`, Asia/Almaty — a distinct time from the existing
   `0 3 1 * *`/`0 10 5 * *` finance crons, avoid clashing) and consider
   any `ACTIVE` meeting whose `endDate` falls within the next 48 hours.
   Debounce via `RedisService` exactly like
   [finance-scheduler.service.ts](../backend/src/modules/finance/finance-scheduler.service.ts)'s
   `finance:reminder:${account.id}:${year}-${month}` pattern — key by
   `voting:reminder:${meetingId}:${userId}`, TTL long enough to outlast
   the meeting (e.g. 30 days) so a resident gets exactly one reminder
   per meeting regardless of how many days the daily cron sees it inside
   the 48-hour window.
4. **`data.type: 'VOTING_REMINDER'` — deliberately left unmapped in
   [Task 0038](0038-notification-preferences.md)'s category system, not
   added to it.** That task's `resolveCategory` already fail-opens
   (always delivers) for any `type` not in its `CATEGORY_MAP` — this is
   exactly the scenario that fail-open design was built for: a new
   notification type introduced later without a dedicated preference
   toggle. Don't extend `NOTIFICATION_CATEGORIES`/`CATEGORY_MAP` as part
   of this task — that's a separate, deliberate decision about whether
   voting reminders should ever be mutable, not a default to reach for
   here.
5. **Skip meetings that already have quorum, but still remind
   non-voters.** Even if `isQuorumAchieved` is already `true`, an
   individual owner's vote can still matter for a specific agenda item's
   outcome (`SIMPLE_MAJORITY`/`QUALIFIED_MAJORITY` are computed per
   question, quorum is meeting-wide) — don't skip reminding just because
   the meeting-wide quorum threshold is met.

---

## Subtask A — Backend: `VotingsSchedulerService`

New `backend/src/modules/votings/votings-scheduler.service.ts`:

- `@Cron('0 9 * * *', { timeZone: 'Asia/Almaty' })
  handleVotingDeadlineReminders()`:
  - Find `Meeting` rows with `status: ACTIVE` and `endDate` between now
    and now+48h, including `agendaItems` (for the total count) and the
    tenant's buildings/units/verified-`OWNER`-ownerships (decision #2's
    comparison needs both the agenda item count and each unit's actual
    `Vote` rows).
  - For each such meeting, for each unit with at least one verified
    `OWNER` ownership: count distinct `agendaItemId`s that unit has a
    `Vote` for; if that count is less than the meeting's total agenda
    item count, the unit hasn't finished voting.
  - For each incomplete unit, for each verified `OWNER` ownership on it
    (decision on multi-owner units above): check the
    `voting:reminder:${meetingId}:${userId}` Redis key; if not already
    set, send via `NotificationsService.sendToUser` (title referencing
    the meeting, body naming how many hours/days remain until
    `endDate`, `data: { type: 'VOTING_REMINDER', meetingId }`), then set
    the Redis key (30-day TTL).
  - Wrap each meeting/unit/user in try/catch, matching
    `FinanceSchedulerService`'s per-record isolation — one failure must
    not abort the whole run.
  - Return a summary object (`meetingsChecked`, `unitsIncomplete`,
    `remindersSent`, `skippedAlreadyReminded`) matching the return-shape
    convention `FinanceSchedulerService`'s two cron methods already use.
- Register `VotingsSchedulerService` in `votings.module.ts`'s providers
  (needs `PrismaService`, `NotificationsService`, `RedisService` —
  check `votings.module.ts`'s current imports before assuming they're
  already available; wire whichever modules are missing, same as
  `finance.module.ts` already does for its scheduler).

**Tests:** new `votings-scheduler.service.spec.ts` —
- A meeting with `endDate` 72 hours out (outside the 48h window) is not
  considered.
- A unit that voted on all agenda items is not reminded; a unit that
  voted on only some is reminded.
- A verified `TENANT`-type occupant of an otherwise-incomplete unit is
  never reminded (decision context — eligibility check).
- A unit with two verified `OWNER` co-owners produces a reminder to
  **both**, not just one.
- Calling the handler twice in a row (simulating two daily cron ticks
  while the same meeting is still inside the window) sends the
  reminder only once per user, proven via the Redis debounce key, not
  by coincidence of mock call counts.
- A `sendToUser` failure for one user doesn't prevent reminders to
  other eligible users in the same run.

---

## Acceptance criteria

- Only verified `OWNER`-type ownerships are ever reminded — never
  `TENANT`-type, never unverified.
- A unit's vote is correctly judged "incomplete" by comparing distinct
  voted-agenda-item count against the meeting's total, not by any
  simpler (and wrong) per-vote-row check.
- Each eligible user gets at most one reminder per meeting, proven by
  the debounce test above.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/`.

## Explicitly out of scope

- Adding `VOTING` to Task 0038's configurable notification categories —
  decision #4.
- Reminding on a schedule other than "48 hours before close" (e.g. a
  reminder right when the meeting opens) — a separate, distinct
  behavior if ever wanted.
- Mobile/web UI changes — this is a backend-only cron, consumed through
  the same existing notification center/bell built in
  [Task 0033](0033-in-app-notification-center.md), no new screen needed.
- Any change to `castVote`'s eligibility logic or quorum calculation —
  this task only reads that data to decide who to remind.

## Deliverable

- One commit.
- PR description confirms the debounce test result explicitly (exactly
  one reminder per user per meeting across multiple cron runs) — this
  is the property most worth calling out, matching how
  [Task 0021](0021-scheduled-charge-generation.md)'s PR called out its
  own debounce guarantee.

---

## Review addendum (2026-09-11) — accepted, no issues found

**Verified good:** `handleVotingDeadlineReminders` filters strictly to
`ownershipType: OWNER` + `isVerified: true` in both the outer unit query
and the inner `ownerships.include`, so a verified `TENANT`-type occupant
sharing a unit with a verified `OWNER` is correctly excluded — proven by
a dedicated test asserting the exact query shape. "Incomplete voting" is
computed by comparing a `Set` of voted `agendaItemId`s against the
meeting's total agenda item count, correctly handling the partial-vote
case (1-of-2 answered still triggers a reminder). Multi-owner units
correctly notify every verified owner, not just one. The debounce test
is genuinely convincing — it uses a real in-memory `Map` behind the
mocked `RedisService.get`/`set` and calls the handler twice in sequence,
proving the second run actually skips because of the stored key rather
than because of a canned mock return value. Per-user and per-meeting
error isolation are both tested. `VotingsSchedulerService`'s three
constructor dependencies (`PrismaService`, `NotificationsService`,
`RedisService`) are all satisfied without new imports in
`votings.module.ts` because `PrismaModule`/`NotificationsModule`/
`RedisModule` are all `@Global()` — confirmed by reading those three
module files directly rather than assuming the DI graph resolves; this
is exactly the kind of wiring gap `tsc`/unit tests can't catch (the spec
file manually provides all three mocks, bypassing real module
resolution entirely), so it was worth checking independently rather than
trusting a clean compile.

**Verified independently:** 454/454 backend tests pass (30 new),
`tsc --noEmit` clean. Task accepted, no fixes required.
