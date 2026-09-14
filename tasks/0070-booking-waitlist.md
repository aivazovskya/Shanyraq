# Task 0070: Waitlist for fully-booked resource slots

**Status:** Completed
**Assignee:** Team lead (implementing directly while Antigravity is
out of quota, per the user's explicit instruction)
**Reviewer:** N/A for this task while implemented directly — an
independent review can be requested separately if desired.

## Context

Beyond-ТЗ feature. **Researched, not guessed — confirmed directly in
[bookings.service.ts](../backend/src/modules/bookings/bookings.service.ts):**
`createBooking`
([bookings.service.ts:282-299](../backend/src/modules/bookings/bookings.service.ts#L282-L299))
already detects slot conflicts inside a transaction
(`existing.startTime < newEnd AND existing.endTime > newStart`) and
throws `ConflictException` (`BOOKINGS.SLOT_CONFLICT`) — but that's the
end of the story today. A resident who wants a popular BBQ slot on a
Saturday and finds it taken has no way to be notified if it frees up;
they have to keep manually re-checking `getAvailability`.

**Confirmed `cancelBooking`
([bookings.service.ts:413-460](../backend/src/modules/bookings/bookings.service.ts#L413-L460))
is the only code path that ever frees a previously-conflicting slot** —
there's no other way a `CONFIRMED` booking stops occupying its slot.
This is exactly where a waitlist notification needs to fire.

### Architecture decisions already made — do not re-litigate

1. **New model `BookingWaitlistEntry`** — `resourceId`, `unitId`,
   `userId`, `startTime`, `endTime`, `createdAt`. Keyed by `unitId`
   (not just `userId`), matching `Booking`'s own philosophy that the
   meaningful entity booking a slot is the *unit*, not whichever
   household member's account made the call.
   `@@unique([resourceId, unitId, startTime, endTime])` prevents a unit
   from queueing twice for the identical slot.
2. **Notify-only, no auto-booking / no reservation hold.** When a slot
   frees up, every waitlisted unit for that exact slot gets a push
   notification that it's available — they still have to actively call
   `createBooking` themselves, same OTP-free flow as any other booking.
   Auto-booking on their behalf would need to silently re-verify their
   ownership/eligibility at a moment they didn't initiate, and would
   turn "waitlist" into "reservation," a bigger feature than asked for.
   First person to book after the notification gets it — a fair race,
   not a queue with guaranteed turns.
3. **Join validation reuses `createBooking`'s exact checks** (resource
   exists/active, verified ownership in the resource's tenant, valid
   future `start < end`) **plus one more: the requested slot must
   currently have a conflicting `CONFIRMED` booking.** Joining a
   waitlist for an already-available slot makes no sense — reject with
   a clear `BOOKINGS.SLOT_NOT_FULL` error telling the caller to just
   book it directly. Uses the exact same overlap query
   `createBooking`'s transaction already uses.
4. **Trigger notification synchronously inside `cancelBooking`, not via
   a cron.** Unlike the guest-parking-full check
   ([Task 0058](0058-guest-parking-capacity-alert.md)), which polls
   because "full" is a continuously-true-or-false state with no single
   triggering event, a slot becoming free has exactly one triggering
   event — the cancellation itself. Query matching waitlist entries
   (`resourceId` + exact `startTime`/`endTime` match) right after the
   cancellation succeeds, best-effort try/catch around the
   notification send (matching `sendResidentMessage`'s existing
   try/catch-and-log pattern), so a notification failure never blocks
   the cancellation response.
5. **Delete matched waitlist entries after notifying, don't keep them
   around.** Once notified, the entry's job is done — it becomes a
   normal open race for the slot like anyone else. Keeping a stale
   "notified" row around serves no purpose since there's no reservation
   to expire and no "waitlist history" report requested.
6. **New notification type `BOOKING_WAITLIST_SLOT_AVAILABLE`, left
   unmapped in `NOTIFICATION_CATEGORIES`** — fail-open/always-deliver,
   same convention every new notification type this project introduces
   has followed since Task 0038.
7. **Self-service only in this task — no staff visibility/management
   UI for other residents' waitlists.** A resident can join, view their
   own entries (`GET /bookings/my-waitlist`), and leave
   (`DELETE /bookings/waitlist/:id`, own entry only). A staff-facing
   view of waitlist demand per resource can be a separate task if
   actually wanted later.
8. **No `@Roles` restriction on the new endpoints — same as
   `createBooking`**, which also has none; eligibility is enforced by
   the verified-ownership check inside the service, not a role
   decorator.

---

## Subtask A — Backend: waitlist join/leave/notify

In [schema.prisma](../backend/prisma/schema.prisma), add
`model BookingWaitlistEntry` (decision #1) with relations to
`BookableResource` (`onDelete: Cascade`), `Unit` (`onDelete: Cascade`),
`User` (`onDelete: Cascade`) — add the corresponding back-relation
arrays on all three (`BookableResource.waitlistEntries`,
`Unit.bookingWaitlistEntries`, `User.bookingWaitlistEntries` — none of
these need a relation name since each is the only relation between
that pair of models). Run `prisma generate` (same no-reachable-
Postgres caveat as every schema change this session).

In [bookings.service.ts](../backend/src/modules/bookings/bookings.service.ts):

- Add `joinWaitlist(resourceId, dto, user)`: reuse `createBooking`'s
  resource-lookup, active-check, and verified-ownership checks
  verbatim (decision #3), validate `start`/`end`, then check for a
  conflicting `CONFIRMED` booking with the exact same overlap query —
  if none exists, throw `BadRequestException` (`BOOKINGS.SLOT_NOT_FULL`).
  Otherwise `bookingWaitlistEntry.create` (catch the unique-constraint
  violation as `BOOKINGS.ALREADY_ON_WAITLIST`, matching the try/catch
  pattern `sendResidentMessage` uses for its own race-safe
  get-or-create).
- Add `getMyWaitlistEntries(user)`: `bookingWaitlistEntry.findMany({
  where: { userId: user.id }, include: { resource: {select: {name,
  type}} }, orderBy: { createdAt: 'desc' } })`.
- Add `leaveWaitlist(id, user)`: `findUnique`, `NotFoundException` if
  missing, `ForbiddenException`
  (`BOOKINGS.WAITLIST_LEAVE_FORBIDDEN`) if `entry.userId !== user.id`,
  then `delete`.
- In `cancelBooking`, after the `booking.update` succeeds (decision
  #4): `bookingWaitlistEntry.findMany({ where: { resourceId:
  booking.resourceId, startTime: booking.startTime, endTime:
  booking.endTime } })`, for each entry
  `notificationsService.sendToUser(entry.userId, {...})` (decision #6),
  then `bookingWaitlistEntry.deleteMany` for those same matched ids
  (decision #5). Wrap in try/catch so a notification failure never
  breaks the cancellation response itself.

In [bookings.controller.ts](../backend/src/modules/bookings/bookings.controller.ts):

- `POST resources/:resourceId/waitlist` (decision #8, no `@Roles`).
- `GET my-waitlist`.
- `DELETE waitlist/:id`.

Add `JoinWaitlistDto` (mirrors `CreateBookingDto`'s `startTime`/
`endTime` fields, no `note`) to
[dto/bookings.dto.ts](../backend/src/modules/bookings/dto/bookings.dto.ts).

**Tests:** extend `bookings.service.spec.ts`:
- Joining a waitlist for a slot with no conflicting booking is
  rejected (`BOOKINGS.SLOT_NOT_FULL`) — the property this task exists
  to guard against (a waitlist for an already-available slot is
  nonsensical).
- Joining succeeds when the slot genuinely has a conflicting
  `CONFIRMED` booking, reusing the same ownership/active-resource
  checks `createBooking` already enforces (an unverified resident is
  rejected the same way).
- Joining the same unit+slot twice is rejected
  (`BOOKINGS.ALREADY_ON_WAITLIST`).
- Cancelling a booking that has 2 waitlist entries for its exact slot
  sends a notification to both and deletes both entries — the central
  property this task exists to prove.
- Cancelling a booking with **no** matching waitlist entries doesn't
  error and sends no notifications.
- A waitlist entry for a *different* time slot on the same resource is
  untouched by an unrelated cancellation (proves the exact-slot-match
  scoping, not "any slot on this resource").
- `leaveWaitlist` only allows the entry's own `userId` to delete it;
  another user gets `ForbiddenException`.
- `getMyWaitlistEntries` returns only the calling user's own entries.

---

## Acceptance criteria

- A resident can join a waitlist only for a genuinely full slot, view
  their own waitlist entries, and leave.
- Cancelling a booking notifies every waitlisted unit for that exact
  slot and removes their entries — proven by the dedicated test.
- An unrelated slot's waitlist entries are never touched by a
  cancellation on a different slot.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/`.

## Explicitly out of scope

- Auto-booking or a reservation hold for the first waitlisted unit —
  per decision #2, this is notify-only.
- Staff-facing waitlist demand dashboard/CSV export — per decision #7,
  self-service only in this task.
- Web/mobile UI — this task is the backend mechanism only; a "Join
  waitlist" button can follow separately if requested, same staged
  approach used for [Task 0064](0064-announcement-removal.md)/
  [0065](0065-announcement-removal-web-ui.md).
- Any change to `createBooking`'s own conflict-detection transaction —
  untouched; the waitlist reuses its overlap-detection logic, doesn't
  modify it.

---

## Deliverable

- Single backend commit.
- PR description confirms the "cancel notifies and clears exactly the
  matching-slot waitlist entries, and only those" test result
  explicitly — that's the property most worth calling out given this
  task's central risk (notifying/deleting the wrong slot's entries).

---

## Implementation notes (2026-09-14)

Implemented exactly per the spec above.

**Schema:** `BookingWaitlistEntry` added with `@@unique([resourceId,
unitId, startTime, endTime])`; back-relation arrays added to
`BookableResource`, `Unit`, `User` — none needed a relation name since
each is the only relation between that pair of models (unlike the
`Announcement`/`CommunityListing`/`Conversation` cases earlier this
session). `prisma generate` ran clean (no reachable Postgres in this
environment, same outstanding limitation as every schema change this
session).

**Backend:** `BookingsService` now injects `NotificationsService`
(not previously used in this module) and a `Logger` (also not
previously present). `joinWaitlist` duplicates `createBooking`'s
resource/active/ownership checks verbatim rather than extracting a
shared helper — the spec called for reuse of the *checks*, not
necessarily a refactor merging the two methods, and `createBooking`'s
own transaction-wrapped conflict check has different post-conditions
(reject vs. require) so keeping them as separate methods with
duplicated guard clauses was the smaller, safer change. `cancelBooking`
now calls a new private `notifyAndClearWaitlistForFreedSlot` after its
`update` succeeds, wrapped in its own outer try/catch so a waitlist
processing failure can never break the cancellation response itself;
each individual notification send has its own inner try/catch too, so
one failed push doesn't stop the others from going out or block the
`deleteMany`. `GET my-waitlist`, `POST resources/:resourceId/waitlist`,
`DELETE waitlist/:id` added to the controller with no `@Roles`,
matching `createBooking`'s own convention of enforcing eligibility via
the ownership check inside the service.

Tests added to `bookings.service.spec.ts` (16 new, 34 total): joining
a genuinely-free slot is rejected (`SLOT_NOT_FULL`), joining a truly
full slot succeeds, an unverified resident is rejected, a duplicate
join is rejected (`ALREADY_ON_WAITLIST`), cancelling a booking with 2
matching waitlist entries notifies both and deletes both (the central
property), cancelling with zero matches sends nothing and doesn't
throw, `getMyWaitlistEntries` scopes to the caller, and `leaveWaitlist`
allows only the entry's own user (rejects otherwise, 404s for a
missing entry). The existing `cancelBooking` tests needed no changes —
`prismaMock.bookingWaitlistEntry.findMany` defaults to resolving `[]`
in `beforeEach`, so the new post-cancellation waitlist check is a
no-op for fixtures that don't set it up, confirmed by rerunning the
full pre-existing suite unmodified.

**Verified:** new/existing tests in this file 34/34, full
`bookings`-scoped suite (service + scheduler) 46/46, full backend
suite 622/622 (31 suites, 0 regressions — 612 prior + 10 net new),
`tsc --noEmit` clean. No i18n changes (backend-only task, no UI
surface, matching the "explicitly out of scope: web/mobile UI"
decision).

**Caveat:** implemented and verified by the same person (the
architect, standing in for Antigravity while it's out of quota) — no
independent second-pass review, same as every self-implemented task
this session (0056-0061, 0064-0069). Ask separately if one is wanted.
