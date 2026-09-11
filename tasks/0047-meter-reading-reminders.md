# Task 0047: Push reminders for residents who haven't submitted a meter reading

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature, same shape as [Task 0021](0021-scheduled-charge-generation.md)'s
overdue-balance reminders and [Task 0045](0045-voting-deadline-reminders.md)'s
voting-deadline reminders. **Researched, not guessed — why this matters
and to whom.** `generateCharges` in
[finance.service.ts:231-264](../backend/src/modules/finance/finance.service.ts)
resolves a `PER_CONSUMPTION` tariff's charge for a unit by looking for a
`VERIFIED` `MeterReading` for that meter in the **current** billing
period; if none exists, it silently `skippedCount++`s — that unit simply
doesn't get billed for that utility this cycle. This is primarily a
**УК revenue-accuracy problem** (unbilled consumption, not a penalty the
resident faces) — frame the reminder that way, not as "you'll be
punished if you don't submit."

**Researched, not guessed — who is eligible to submit a reading, and it
is *not* the same rule as Task 0045's voting reminders.** `submitReading`
in [meters.service.ts:174-183](../backend/src/modules/meters/meters.service.ts)
checks `unit.ownerships.some((o) => o.userId === user.id && o.isVerified)`
— **any** verified ownership, `OWNER` **or** `TENANT`, not an
`OWNER`-only restriction like voting. Do not copy Task 0045's
`ownershipType: OWNER` filter here — it would wrongly exclude verified
tenants who are perfectly entitled to submit readings today.

### Architecture decisions already made — do not re-litigate

1. **A separate `MetersSchedulerService`**, mirroring
   `FinanceSchedulerService`/`VotingsSchedulerService`'s established
   separation of scheduled-job orchestration from the request-serving
   service class.
2. **Monthly cron, a few days before month-end — not the 1st-of-month
   like the finance crons, since charge generation itself runs on the
   1st.** Run `0 10 25 * *` (Asia/Almaty, 10:00 on the 25th) — a date
   distinct from the existing `0 3 1 * *`/`0 10 5 * *` finance crons and
   [Task 0045](0045-voting-deadline-reminders.md)'s daily `0 9 * * *` —
   targeting `getAlmatyCurrentPeriod()`'s current month/year (reuse that
   exported helper from
   [finance-scheduler.service.ts](../backend/src/modules/finance/finance-scheduler.service.ts)
   directly, don't reimplement Almaty-timezone period derivation).
3. **"Needs a reminder" = no `MeterReading` row for that meter+period at
   all, or the only one present is `REJECTED`.** A `PENDING` reading
   means the resident already submitted and it's awaiting staff review
   — don't nag someone who already did their part. A `VERIFIED` reading
   means it's done. Only "nothing submitted yet" or "submitted and
   rejected, needs resubmission" (the exact flow
   [Task 0007](0007-meter-readings.md) already built) warrant a
   reminder.
4. **Only meters that actually feed an active `PER_CONSUMPTION` tariff
   are checked — not every meter in the system.** Mirror
   `generateCharges`'s own resolution chain exactly: for each tenant's
   active `PER_CONSUMPTION` tariffs with a `meterType` set, find each
   unit's active `Meter` of that type. A meter type nobody bills against
   doesn't need a reminder — reusing the tariff→meterType→meter lookup
   `generateCharges` already does, not inventing a separate "all meters"
   sweep.
5. **Debounce via `RedisService`, same TTL constant
   `finance-scheduler.service.ts` already uses for its own monthly
   reminder (35 days), not a new arbitrary value.** Key by
   `meters:reminder:${meterId}:${year}-${month}`.
6. **Remind every verified ownership on the unit (`OWNER` or `TENANT`),
   not just one** — same reasoning as Task 0045's multi-owner handling,
   applied to the broader OWNER-or-TENANT eligibility rule here: nobody
   knows in advance which verified occupant will actually go take the
   reading.

---

## Subtask A — Backend: `MetersSchedulerService`

New `backend/src/modules/meters/meters-scheduler.service.ts`:

- `@Cron('0 10 25 * *', { timeZone: 'Asia/Almaty' })
  handleMeterReadingReminders()`:
  - `const { year, month } = getAlmatyCurrentPeriod();` (import from
    `finance-scheduler.service.ts`, decision #2).
  - For each tenant, find active `PER_CONSUMPTION` tariffs with a
    `meterType` set (decision #4). For each such tariff, find that
    tenant's units with an active `Meter` of the matching type,
    including that meter's readings for the current period and the
    unit's verified ownerships (any type, decision context).
  - For each unit/meter: if no reading exists for
    (meterId, month, year), or the only one is `REJECTED`
    (decision #3), it needs a reminder.
  - For each verified ownership on that unit (decision #6): check/set
    the Redis debounce key (decision #5); if not already reminded, send
    via `NotificationsService.sendToUser` (title/body naming the meter
    type and the unit, `data: { type: 'METER_READING_REMINDER', meterId
    }`).
  - Same per-tenant/per-unit/per-user try/catch isolation as
    `FinanceSchedulerService`/`VotingsSchedulerService` — one failure
    must not abort the run.
  - Return a summary object (`tenantsChecked`, `metersNeedingReading`,
    `remindersSent`, `skippedAlreadyReminded`), matching the existing
    scheduler return-shape convention.
- Register `MetersSchedulerService` in `meters.module.ts`'s providers
  (check its current imports first — `PrismaService`/
  `NotificationsService`/`RedisService` are all `@Global()`-provided
  per [Task 0045](0045-voting-deadline-reminders.md)'s review, so no new
  module imports should be needed, but verify rather than assume).

**Tests:** new `meters-scheduler.service.spec.ts` —
- A meter with a `VERIFIED` reading for the current period is not
  reminded; one with a `PENDING` reading is not reminded either
  (decision #3 — only missing-or-rejected triggers a reminder).
- A meter with a `REJECTED` reading for the current period **is**
  reminded (resubmission case).
- A meter with no reading at all for the current period is reminded.
- A verified `TENANT`-type occupant **is** reminded (not excluded) —
  the direct regression test for this task's central "don't copy Task
  0045's OWNER-only filter" distinction.
- A unit with two verified occupants (mixed `OWNER`/`TENANT`) gets both
  reminded.
- A `PER_AREA`-only tenant (no `PER_CONSUMPTION` tariff at all) produces
  zero reminders — proves the tariff→meterType resolution chain is
  actually gating the check, not just "remind about every meter."
- Calling the handler twice sends each eligible user exactly one
  reminder (debounce), same proof style as Task 0045's Redis-backed
  double-call test.
- A `sendToUser` failure for one user doesn't block reminders to others.

---

## Acceptance criteria

- Reminders are scoped to meters that actually feed an active
  `PER_CONSUMPTION` tariff, not every meter in the system.
- Both verified `OWNER` and verified `TENANT` occupants are eligible for
  reminders — this must not regress to an `OWNER`-only check.
- A `PENDING` reading suppresses the reminder; a missing or `REJECTED`
  one triggers it.
- Each eligible user is reminded at most once per meter per period.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/`.

## Explicitly out of scope

- Any change to `generateCharges`'s skip-if-no-reading behavior, or to
  `submitReading`'s eligibility/validation logic — this task only reads
  that data to decide who to remind.
- Adding a `METER_READING` category to
  [Task 0038](0038-notification-preferences.md)'s configurable
  notification preferences — same reasoning as Task 0045's decision #4:
  an unmapped `type` already fail-opens to always-delivered, which is
  the right default until/unless this is deliberately made
  user-mutable.
- Mobile/web UI changes — consumed through the existing notification
  center, no new screen needed.
- Reminders for meter types not tied to any active tariff, or for
  inactive meters/tenants.

## Deliverable

- One commit.
- PR description explicitly confirms: (a) the OWNER-or-TENANT
  eligibility test result (proving this didn't copy Task 0045's
  OWNER-only rule), and (b) the debounce test result — these are the two
  properties most worth calling out given this task's context section.

---

## Review addendum (2026-09-11) — accepted, no issues found

**Verified good:** the ownership query has no `ownershipType` filter at
all (only `isVerified: true`), with an explicit inline comment marking
this as deliberate — directly confirmed by a dedicated test where a
verified `TENANT`-only occupant (no `OWNER` on the unit at all) still
receives the reminder, exactly the regression test this task's context
section called for. The reminder condition
(`!currentReading || status === REJECTED`) is proven correct against
all four states individually (`VERIFIED`/`PENDING` suppressed,
`REJECTED`/missing trigger it). The tariff→meterType resolution chain
is proven to actually gate the check, not just be present in the code —
a tenant with only `PER_AREA` tariffs produces zero reminders and never
even calls `meter.findMany`. Multi-occupant units (mixed `OWNER`/
`TENANT`) correctly notify both. The debounce test reuses the same
real-`Map`-behind-mocked-Redis technique Task 0045's review praised,
calling the handler twice and proving the second call is genuinely
skipped via the stored key. Per-user error isolation is tested.
`MetersSchedulerService`'s dependencies resolve without new module
imports since `NotificationsService`/`RedisService` are `@Global()`,
consistent with Task 0045's own finding.

**Verified independently:** 468/468 backend tests pass (9 new),
`tsc --noEmit` clean. Task accepted, no fixes required.
