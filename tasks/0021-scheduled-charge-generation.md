# Task 0021: Automated monthly charge generation (cron) + overdue reminders

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature #2, following [Task 0020](0020-realtime-websocket.md)'s
real-time layer. Today, [finance.service.ts](../backend/src/modules/finance/finance.service.ts)'s
`generateCharges(tenantId, dto)` must be triggered manually by an
`HOA_ADMIN`/`SUPERADMIN` via `POST /finance/tenants/:tenantId/generate-charges`
([finance.controller.ts:85](../backend/src/modules/finance/finance.controller.ts))
once a month, per tenant — easy to forget, and doesn't scale as the number
of ЖК on the platform grows. This task automates it and adds a
complementary overdue-balance reminder push.

### Architecture decisions already made — do not re-litigate

1. **`@nestjs/schedule`'s `@Cron()`, nothing fancier.** No external job
   queue (BullMQ/Redis-backed queue) — the workload here is "loop over N
   tenants once a month," which doesn't need a distributed job queue.
   `ScheduleModule.forRoot()` registered once in `app.module.ts`.
2. **`generateCharges` itself needs zero changes — it's already
   idempotent.** It has a real unique constraint
   (`accountId_tariffItemId_periodMonth_periodYear`) checked before every
   `charge.create`, with a `try/catch` around the create as a race-condition
   backstop. Calling it twice for the same tenant/month/year is already
   safe and a no-op on the second call (`skippedCount` increments instead
   of duplicating). The cron job is a thin wrapper that calls this
   existing method per tenant — don't touch its internals.
3. **The manual trigger stays.** Don't remove or hide
   `POST /finance/tenants/:tenantId/generate-charges` — it remains useful
   for a tenant that had no active tariffs yet at month-start, or for
   manually re-running a specific tenant. The cron is additive automation
   for the routine case, not a replacement for the manual path.
4. **Per-tenant error isolation.** Iterate `prisma.tenant.findMany()` (no
   `isActive`/status field exists on `Tenant` — process all of them) and
   wrap each tenant's `generateCharges` call in its own try/catch — one
   tenant's failure (e.g. `FINANCE.NO_ACTIVE_TARIFFS` because that ЖК
   hasn't configured tariffs yet) must not stop the loop from processing
   the rest. Log each failure with the tenant id; don't let the job crash.
5. **Timezone: `Asia/Almaty`, explicit.** This is a Kazakhstan-only
   platform — pass `{ timeZone: 'Asia/Almaty' }` to every `@Cron(...)`
   registration so "1st of the month" means Almaty-local midnight-ish, not
   whatever timezone the server happens to run in.
6. **Single-instance assumption, same as Task 0020.** No distributed lock
   to prevent double-firing across multiple backend instances — this app
   runs single-instance today. If/when it's ever deployed with more than
   one instance, that's the point to add a lock (e.g. a short-lived Redis
   key claimed at job start) — flag this in the PR as a known follow-up,
   don't build it now.
7. **Overdue reminders use a Redis debounce key, not a new DB column.**
   To avoid sending the same resident a reminder every single day once
   their balance goes negative, track "already reminded this month" via a
   Redis key (e.g. `finance:reminder:<accountId>:<year>-<month>`, similar
   in spirit to the existing `otp:lockout:`/`login:lockout:` key
   conventions) with a TTL past month-end, rather than adding a
   `lastReminderSentAt` column to `PersonalAccount` — this avoids a schema
   migration for what's inherently transient, re-derivable state.

---

## Subtask A — Scheduled charge generation

Create `backend/src/modules/finance/finance-scheduler.service.ts` (or
similar — your call on the exact filename, keep it in the `finance`
module) with a `@Cron('0 3 1 * *', { timeZone: 'Asia/Almaty' })` method
that:
- Fetches all tenants.
- For each, calls `this.financeService.generateCharges(tenant.id, { month:
  <current month>, year: <current year> })` using the current
  Almaty-local month/year at execution time.
- Catches and logs per-tenant errors (decision #4) without stopping the
  loop.
- Logs a summary at the end (tenants processed, total charges created,
  total skipped, any failures) via `Logger`.

**Test:** with 3 mock tenants where one throws `FINANCE.NO_ACTIVE_TARIFFS`,
verify the other two still get processed and the method doesn't throw.
Verify the correct `{ month, year }` is derived and passed for "today" in
`Asia/Almaty`.

## Subtask B — Overdue-balance reminder push

Add a second scheduled method (e.g. `@Cron('0 10 5 * *', { timeZone:
'Asia/Almaty' })` — 5th of the month, giving residents a few days' grace
after charges post before nagging them) that:
- Finds every `PersonalAccount` with `balance < 0`.
- For each, finds verified residents (`UnitOwnership.isVerified = true`)
  on that account's unit.
- Checks the Redis debounce key from decision #7; skips if already
  reminded this month.
- Sends a push via the existing
  [NotificationsService.sendToUser](../backend/src/modules/notifications/notifications.service.ts)
  (reuse it — don't build a new push-dispatch mechanism), with a message
  stating the current debt amount.
- Sets the Redis debounce key after a successful send.

**i18n note:** the push notification body text needs to go through the
same mechanism the rest of this app's push payloads already use — check
how existing push messages in `sos.service.ts`/`chat.service.ts` are
worded (likely plain Russian text baked into the payload, matching how
push notification bodies work today, since push payloads aren't currently
resolved client-side through i18n the way REST error `code`s are) and
follow that exact precedent rather than inventing a new localization path
for push bodies in this task.

**Test:** an account with `balance < 0` and a verified resident gets a
push; an account with `balance >= 0` doesn't; an account already reminded
this month (Redis key present) doesn't get a duplicate push.

---

## Acceptance criteria

- `generateCharges` itself is unchanged — only new scheduler code calls
  it.
- The manual `POST /finance/tenants/:tenantId/generate-charges` endpoint
  is untouched and still works exactly as before.
- Cron timezone is explicitly `Asia/Almaty` on both jobs.
- One tenant's failure during scheduled charge generation doesn't stop
  processing of the others (test this explicitly).
- Overdue reminder push is debounced to at most once per account per
  month via the Redis key — test this explicitly.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean.
- No frontend/mobile changes needed for this task — it's entirely
  server-side scheduled automation.

## Explicitly out of scope

- A distributed lock for multi-instance deployments — see decision #6.
- Any UI to configure the cron schedule, view job history, or manually
  disable a tenant from auto-billing — if that's wanted later, it's a
  separate task.
- Changing how `generateCharges` calculates amounts, handles
  `PER_CONSUMPTION` tariffs, or recalculates balances — none of that
  logic is touched.
- SMS reminders or any channel other than the existing Expo push system.

## Deliverable

- One commit or PR for both subtasks (they share the same module and
  Redis-debounce pattern, small enough to ship together).
- PR description states the exact cron expressions and confirms they were
  verified to parse correctly (e.g. via the `cron` package's own
  validation or a quick manual dry run of the handler logic outside the
  schedule), since a typo'd cron expression silently never firing is the
  most likely failure mode for this kind of feature.

---

## Review addendum (2026-09-09) — accepted, no issues found

**Verified good:** `FinanceSchedulerService` is a thin, correct wrapper —
`generateCharges` itself untouched, manual `POST .../generate-charges`
endpoint confirmed untouched. Per-tenant error isolation confirmed via a
3-tenant test where the middle one throws `FINANCE.NO_ACTIVE_TARIFFS` and
the other two still process. `getAlmatyCurrentPeriod()` uses
`Intl.DateTimeFormat` with `timeZone: 'Asia/Almaty'` (no extra
timezone-library dependency needed) and is tested against real UTC/Almaty
midnight-crossing edge cases, including a December→January year rollover
— exactly the kind of edge case this sort of date logic usually gets
wrong. Redis debounce key correctly scoped per `accountId` + `year-month`,
tested for both the send-and-set and skip-if-already-sent paths, plus a
third case (no verified residents) that correctly sends nothing and
leaves the debounce key unset. `RedisModule`/`NotificationsModule` are
both `@Global()`, so `FinanceModule` not explicitly importing them is
correct, not an oversight — verified this before flagging it as a
potential DI bug. `ScheduleModule.forRoot()` registered once in
`app.module.ts`; `@nestjs/schedule@^4.1.2` version-compatible with this
project's `@nestjs/common@^10.3.3`. Cron expressions (`0 3 1 * *` and
`0 10 5 * *`) both parse correctly. Push body text follows the existing
plain-Russian-string precedent from `sos.service.ts`/`chat.service.ts`
rather than inventing a new localization path, as scoped. 271/271 backend
tests pass, `tsc --noEmit` clean. Task accepted, no fixes required.
