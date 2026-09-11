# Task 0058: Guest parking full-capacity alert

**Status:** Completed
**Assignee:** Team lead (implementing directly while Antigravity is
out of quota, per the user's explicit instruction)
**Reviewer:** N/A for this task while implemented directly — an
independent review can be requested separately if desired.

## Context

Beyond-ТЗ feature. **Researched, not guessed — confirmed directly in
[schema.prisma](../backend/prisma/schema.prisma):** guest parking is
modeled as one or more separate `BookableResource` rows of
`type: GUEST_PARKING` per tenant (e.g. "Гостевой паркинг №1", "№2",
"№3" — each a fully staff-defined, independently bookable resource,
per the model's own comment). There is no "capacity" field on a
resource — each `BookableResource` is a single bookable unit, and
[Task 0009](0009-amenity-booking.md)'s overbooking protection already
guarantees at most one `CONFIRMED` booking can cover any given moment
on a single resource. So "all guest parking is full right now" means:
every active `GUEST_PARKING` resource in the tenant currently has a
`CONFIRMED` booking covering the present moment — there is currently
no signal for this at all; staff would only discover it by trying (and
failing) to find a free slot themselves.

**Also confirmed:** `BookingsSchedulerService`
([bookings-scheduler.service.ts](../backend/src/modules/bookings/bookings-scheduler.service.ts),
added in [Task 0054](0054-booking-upcoming-reminders.md)) already
exists in this module. This task adds a second `@Cron` handler to that
same class rather than creating a new scheduler file — mirrors how
`FinanceSchedulerService` already holds two unrelated `@Cron` handlers
(monthly charge generation and debt reminders) in one file; one
scheduler service per domain, not one file per job.

### Architecture decisions already made — do not re-litigate

1. **Add a second `@Cron` method to the existing
   `BookingsSchedulerService`** (per the Context section) — don't
   create `guest-parking-scheduler.service.ts`.
2. **"Full" = every active `GUEST_PARKING` resource has a `CONFIRMED`
   booking covering `now`.** Reuse the exact overlap-query shape
   `getAvailability` already uses
   ([bookings.service.ts:153-159](../backend/src/modules/bookings/bookings.service.ts#L153-L159)) —
   `startTime: { lte: now }, endTime: { gt: now }` for "covers this
   instant." **A tenant with zero active `GUEST_PARKING` resources is
   never "full"** — don't let a vacuous "every 0 resources are booked"
   false-positive fire an alert; require `resourceCount > 0`.
3. **One query for resources, one query for currently-active
   bookings, reduced in memory per tenant — no per-resource or
   per-tenant loop querying the DB.** Fetch all active
   `GUEST_PARKING` resources across all tenants in one `findMany`,
   then one `findMany` for `CONFIRMED` bookings on those resource ids
   covering `now`, then group both by `tenantId` in memory. Same
   "single query, reduce in memory" discipline every prior scheduler
   in this project follows.
4. **State-transition debounce, not a TTL — this is different from
   every prior reminder task.** Every earlier scheduler in this
   project debounces "don't remind about the same still-true condition
   again within N time" with a TTL. This condition isn't
   fixed-duration — parking could stay full for 10 minutes or 10
   hours. Instead: track a per-tenant Redis flag
   (`bookings:guest-parking-full:${tenantId}`, no expiry needed beyond
   a generous 24h safety-net TTL in case a clear step is ever missed).
   Alert **only on the transition from not-full to full** (flag absent
   → set it, send the alert); when a later check finds parking is no
   longer full, **clear the flag silently, no notification** — this is
   what allows a *later* full event to alert again, rather than
   staying permanently silenced after the first alert. Explicitly out
   of scope: a "parking freed up" notification — not asked for, adds
   scope without being requested.
5. **Recipients: `SECURITY` and `DISPATCHER` only, via
   `sendToTenantRoles`** — the two roles physically managing gate/
   parking access day-to-day. Not `HOA_ADMIN`/`HOA_CHAIRMAN` (this is
   a front-line operational signal, not a management one — contrast
   with SOS, which is broadcast wider because it's an emergency).
6. **Cron cadence: every 30 minutes** — frequent enough to catch a
   same-day capacity crunch while it's still actionable, without
   needing the 5-minute precision
   [Task 0054](0054-booking-upcoming-reminders.md)'s booking reminder
   needed (that one had to hit a narrow intraday window; this one only
   needs to notice a state change reasonably promptly).
7. **Fail-open notification categorization** — same decision as every
   prior scheduler task; the new `GUEST_PARKING_FULL` type needs no
   entry in `NOTIFICATION_CATEGORIES`/`CATEGORY_MAP`.

---

## Subtask A — Backend: capacity check

In
[bookings-scheduler.service.ts](../backend/src/modules/bookings/bookings-scheduler.service.ts),
add `@Cron(CronExpression.EVERY_30_MINUTES) handleGuestParkingCapacityCheck()`:

- Fetch active `GUEST_PARKING` resources across all tenants:
  `bookableResource.findMany({ where: { type: GUEST_PARKING, isActive:
  true }, select: { id, tenantId } })`.
- If none exist anywhere, return early.
- Fetch `CONFIRMED` bookings on those resource ids covering `now`
  (decision #2): `booking.findMany({ where: { resourceId: { in: [...]
  }, status: CONFIRMED, startTime: { lte: now }, endTime: { gt: now }
  }, select: { resourceId: true } })`.
- Group resources by `tenantId` (decision #3); for each tenant with
  `resourceCount > 0`, compute whether every one of that tenant's
  resource ids appears in the occupied-resource-id set.
- For each **full** tenant: check the Redis flag (decision #4); if
  absent, set it and send the alert via `sendToTenantRoles(tenantId,
  [SECURITY, DISPATCHER], ...)` — title `🅿️ Гостевой паркинг заполнен`,
  body naming how many guest parking spots are full (e.g. "Все N мест
  для гостевого паркинга сейчас заняты."), `data: { type:
  'GUEST_PARKING_FULL', tenantId }`.
- For each **not-full** tenant with active guest parking resources:
  if the Redis flag is set, clear it (no notification).
- Per-tenant `try/catch` isolation, same discipline as every prior
  scheduler.
- Return a summary object (`tenantsChecked`, `tenantsFull`,
  `alertsSent`) for testability.

**Tests:** new describe block in
`bookings-scheduler.service.spec.ts` —
- A tenant where every active `GUEST_PARKING` resource has a
  `CONFIRMED` booking covering `now` triggers an alert; one where at
  least one resource is free does not.
- A tenant with zero active `GUEST_PARKING` resources never triggers
  an alert (proves decision #2's vacuous-truth guard).
- The alert is sent via `sendToTenantRoles` with exactly `[SECURITY,
  DISPATCHER]` — not `HOA_ADMIN`, not `HOA_CHAIRMAN`.
- State-transition debounce: two consecutive checks while still full
  send exactly one alert (the flag prevents the second); after the
  flag is cleared by an intervening not-full check, a subsequent full
  check alerts again.
- A `CONFIRMED` booking that has already ended (`endTime <= now`) or
  hasn't started yet (`startTime > now`) does not count as occupying
  the resource — proves the "covers this instant" filter, not just
  "any confirmed booking exists."

---

## Acceptance criteria

- Only tenants where 100% of active `GUEST_PARKING` resources are
  currently occupied trigger an alert — proven by the mixed-occupancy
  test.
- A tenant with no guest parking resources is never alerted.
- Alert recipients are exactly `SECURITY`+`DISPATCHER`.
- The same full period generates exactly one alert (state-transition
  debounce), and a later full period after recovering generates a new
  one.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/`.

## Explicitly out of scope

- A "parking freed up" notification — per decision #4.
- Any change to `bookings.service.ts`'s booking/availability logic —
  this task only reads existing data on a schedule.
- Web/mobile UI (a live "spots available" counter) — this task is the
  alert only.
- Per-tenant configurable thresholds (e.g. alert at 90% instead of
  100%) — binary full/not-full for this task.

---

## Deliverable

- Single backend commit.
- PR description confirms the state-transition debounce test result
  explicitly (full → alert → still full → no second alert → recovers
  → full again → alerts again) — that's the property most worth
  calling out given decision #4, since it's a different debounce shape
  from every prior scheduler task in this project.

---

## Implementation notes (2026-09-12)

Implemented exactly per the spec above: `handleGuestParkingCapacityCheck`
added as a second `@Cron` method on the existing
`BookingsSchedulerService`
([bookings-scheduler.service.ts](../backend/src/modules/bookings/bookings-scheduler.service.ts)) —
one `bookableResource.findMany` (active `GUEST_PARKING` across all
tenants), one `booking.findMany` (`CONFIRMED`, `startTime: { lte: now
}, endTime: { gt: now }`), grouped by tenant in memory, vacuous-truth
guard for tenants with zero resources, state-transition Redis flag
(`bookings:guest-parking-full:${tenantId}`, 24h safety-net TTL, no
notification on the not-full transition, only `del`), alert via
`sendToTenantRoles(tenantId, [SECURITY, DISPATCHER], ...)`. No new
module wiring needed (`BookingsSchedulerService` already registered
from Task 0054).

Tests added to `bookings-scheduler.service.spec.ts` (5 new): mixed
full/not-full tenants in one run, zero-resource tenant never alerts,
exact `[SECURITY, DISPATCHER]` role check, the full four-step
state-transition sequence (full → alert, still full → no alert,
recovered → flag cleared silently, full again → alerts again), and the
"covers this instant" query-shape assertion.

**Verified:** new tests 12/12 (7 prior + 5 new), full backend suite
522/522 (30 suites, 0 regressions), `tsc --noEmit` clean.

**Caveat:** implemented and verified by the same person (the
architect, standing in for Antigravity while it's out of quota) — no
independent second-pass review, same as Tasks 0056/0057. Ask
separately if one is wanted.
