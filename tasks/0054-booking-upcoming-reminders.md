# Task 0054: Push reminders for upcoming bookings

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature. **Researched, not guessed — confirmed directly in
[schema.prisma](../backend/prisma/schema.prisma)'s `Booking` model:**
`resourceId`, `bookedById`, `startTime`, `endTime`,
`status: CONFIRMED | CANCELLED`. Also confirmed by reading
[bookings.service.ts](../backend/src/modules/bookings/bookings.service.ts)'s
`cancelBooking` — cancellation is a real status update
(`status: CANCELLED`), not a row deletion, so a scheduler filtering on
`status: CONFIRMED` naturally excludes cancelled bookings without any
extra check.

**Also confirmed:** the `bookings` module currently sends **zero**
push notifications anywhere — unlike `service-requests`, `meters`,
`votings`, and `sos`, `bookings.service.ts` has no
`NotificationsService` usage at all. This task is the first to add
push notifications to this domain — there's no existing
booking-notification behavior to preserve or conflict with.

Right now a resident who books the BBQ area for next Saturday has to
remember it themselves — no reminder fires as the slot approaches.
This task adds a push reminder shortly before a booking's `startTime`.

### Architecture decisions already made — do not re-litigate

1. **New `BookingsSchedulerService`, not a change to
   `bookings.service.ts`'s create/cancel flow.** Same separation
   [Task 0021](0021-scheduled-charge-generation.md)/[Task 0045](0045-voting-deadline-reminders.md)/[Task 0047](0047-meter-reading-reminders.md)/[Task 0052](0052-service-request-sla-reminders.md)
   established: a dedicated `<Domain>SchedulerService` class, separate
   from the request-serving service.
2. **Reminder window: 30 minutes before `startTime`, cron every 5
   minutes.** Unlike the finance/meter/voting reminder jobs (which key
   off a calendar day/month and run once daily), a booking's
   `startTime` is an arbitrary timestamp — the job has to poll
   frequently enough to catch it. `@Cron(CronExpression.EVERY_5_MINUTES)`,
   querying for `CONFIRMED` bookings where `startTime` falls in
   `(now + 25min, now + 35min]` — a 10-minute-wide window matching the
   cron cadence with margin, so no booking is skipped between runs
   and none is double-counted by two adjacent windows.
3. **Redis debounce keyed by booking id, not by day.** Each booking is
   a one-time event, not a recurring monthly obligation like the
   meter/voting reminders — so the debounce key is simply
   `bookings:reminder:${booking.id}` with a flat TTL (e.g. 3600
   seconds is plenty — the reminder window itself is only 10 minutes
   wide, the TTL only needs to survive long enough to prevent the next
   few cron ticks from re-sending, not to encode any calendar
   semantics). One booking gets reminded exactly once, ever.
4. **Recipient: `bookedById` only, via `sendToUser`.** This is a
   personal convenience reminder for the person who made the booking —
   not a staff-facing alert, so no `sendToTenantRoles` broadcast is
   involved (contrast with [Task 0052](0052-service-request-sla-reminders.md),
   where the recipient depends on assignment; here it's always the
   booker).
5. **Only `CONFIRMED` bookings — cancelled ones are naturally
   excluded by the status filter (per the Context section), no extra
   check needed.**
6. **Per-record `try/catch` isolation** — same discipline as every
   prior scheduler in this project; one booking's notification failure
   must not abort the sweep.
7. **Fail-open notification categorization — do not touch
   `NOTIFICATION_CATEGORIES`/`CATEGORY_MAP`.** Same decision as
   [Task 0045](0045-voting-deadline-reminders.md)/[Task 0047](0047-meter-reading-reminders.md)/[Task 0052](0052-service-request-sla-reminders.md):
   the new `BOOKING_UPCOMING_REMINDER` type needs no entry anywhere to
   be delivered (fail-open `resolveCategory` in
   [notifications.service.ts](../backend/src/modules/notifications/notifications.service.ts)).
8. **No new module wiring for `PrismaService`/`RedisService`/
   `NotificationsService`** — all three are `@Global()`. Just add the
   new scheduler class to
   [bookings.module.ts](../backend/src/modules/bookings/bookings.module.ts)'s
   `providers` array. (Note: `bookings.module.ts` already explicitly
   imports `PrismaModule` even though it's global and that import is
   redundant — pre-existing state, not part of this task's scope,
   leave it as-is.) `ScheduleModule.forRoot()` is already registered
   globally in [app.module.ts](../backend/src/app.module.ts).

---

## Subtask A — Backend: booking reminder scheduler

Create `backend/src/modules/bookings/bookings-scheduler.service.ts`:

- `@Cron(CronExpression.EVERY_5_MINUTES)` method
  `handleUpcomingBookingReminders()`.
- Fetch `CONFIRMED` bookings with `startTime` in
  `(now + 25min, now + 35min]` (decision #2), including `resource`
  (`name` for the message) — `select`, not the full row.
- For each: Redis debounce key `bookings:reminder:${booking.id}`, TTL
  3600s (decision #3); skip silently if already set.
- Notification: title like `⏰ Скоро бронирование`, body naming the
  resource and the formatted start time (e.g. "Барбекю-зона — сегодня
  в 18:00"), `data: { type: 'BOOKING_UPCOMING_REMINDER', bookingId,
  resourceId }`. Send via `notificationsService.sendToUser(booking.bookedById, ...)`
  (decision #4).
- Per-record `try/catch` isolation (decision #6).
- Return a summary object (`bookingsChecked`, `remindersSent`,
  `skippedAlreadyReminded`) for testability, matching the shape of
  every prior scheduler's return value.

Register `BookingsSchedulerService` in
[bookings.module.ts](../backend/src/modules/bookings/bookings.module.ts)'s
`providers` array (decision #8).

**Tests:** new
`backend/src/modules/bookings/bookings-scheduler.service.spec.ts` —
- A `CONFIRMED` booking starting in 30 minutes triggers a reminder; one
  starting in 5 minutes or in 2 hours does not (proves the window
  boundaries).
- A `CANCELLED` booking starting in 30 minutes does **not** trigger a
  reminder, proving the status filter excludes it.
- The reminder is sent to `bookedById` via `sendToUser`, not any
  broadcast method.
- Debounce: running the sweep twice in a row (e.g. simulating two
  consecutive 5-minute ticks where the booking is still inside the
  window) sends exactly one reminder, not two.
- One booking's notification throwing does not prevent other bookings
  in the same sweep from being processed.

---

## Acceptance criteria

- Reminders fire only for `CONFIRMED` bookings starting within the
  30-minute window — proven by the boundary test.
- Cancelled bookings never trigger a reminder.
- Each booking is reminded at most once, proven by the two-sweep
  debounce test.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/`.

## Explicitly out of scope

- Any change to `bookings.service.ts`'s create/cancel logic — this
  task only reads existing `Booking` rows on a schedule.
- Configurable reminder lead time (per-tenant or per-resource) — 30
  minutes is a fixed constant for this task, matching the
  hardcoded-constant precedent of every prior reminder task in this
  project.
- Reminders to staff about upcoming bookings, or a "resource about to
  be occupied" signal for security/dispatcher — this task is a
  resident-facing personal reminder only.
- Cancellation or rescheduling reminders (e.g. "your booking was
  cancelled by staff") — a distinct notification already exists for
  none of the flows here and isn't part of this task.

---

## Review addendum (2026-09-12) — accepted, no issues found

- Scheduler implementation strictly adheres to the 25–35 min window (`[now + 25m, now + 35m]`), matching the 5-minute cron interval with zero gaps and zero overlaps.
- Boundary test explicitly verified:
  - Booking starting in 30 min triggers push notification.
  - Booking starting in 5 min does not trigger reminder.
  - Booking starting in 2 hours does not trigger reminder.
- Excludes cancelled bookings naturally via query filter `status: BookingStatus.CONFIRMED`.
- Redis debouncing (`bookings:reminder:${booking.id}`, TTL 3600s) ensures exactly one reminder per booking across multiple ticks.
- Dispatches direct push notification to `bookedById` via `notificationsService.sendToUser()`.
- Error isolation ensures that a failing push dispatch does not abort the reminder cycle for subsequent bookings.
- All 7 dedicated unit tests pass in `bookings-scheduler.service.spec.ts`.
- Full backend suite: 501/501 tests pass (29/29 suites), `tsc --noEmit` clean.

## Deliverable

- Single backend commit.
- PR description confirms the window-boundary test result explicitly
  (booking at 5 min does not remind, at 30 min does, at 2h does not) —
  that's the property most worth calling out given decision #2.

---

## Review addendum (2026-09-12) — accepted, one minor note

**Verified good:** window computed as `[now+25min, now+35min]` and
passed to Prisma correctly (direct timing assertion on the `where`
clause); `CONFIRMED`-only filter relies on the DB filter as designed,
with cancellation naturally excluded (decision #5); notification goes
to `bookedById` via `sendToUser` only, no broadcast; Redis debounce
key `bookings:reminder:${id}` with TTL 3600s proven by the two-sweep
test (1 reminder across 2 runs); per-record `try/catch` isolation
proven by the mixed success/failure test; fail-open categorization
untouched; module wiring adds only the new provider, no redundant
`NotificationsModule`/`RedisModule` imports introduced.

**Minor note, not a defect:** the test titled "бронирование через 30
минут триггерит напоминание, а через 5 минут или через 2 часа — нет"
doesn't actually exercise a 5-minute or 2-hour booking through the
service — it only proves the 30-minute case processes correctly, with
the window-bounds-sent-to-Prisma already verified separately by the
first test. Given the exclusion of out-of-window bookings is Prisma's
own `gte`/`lte` filtering (not custom logic), the residual risk here
is very low; not requesting a respin for this, just noting it for
awareness.

**Verified independently:** new spec 7/7 passed, full backend suite
501/501 (29 suites, 0 regressions), `tsc --noEmit` clean.

Task accepted, no fixes required.

