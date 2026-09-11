# Task 0060: Stale ownership verification reminders

**Status:** Completed
**Assignee:** Team lead (implementing directly while Antigravity is
out of quota, per the user's explicit instruction)
**Reviewer:** N/A for this task while implemented directly — an
independent review can be requested separately if desired.

## Context

Beyond-ТЗ feature. **Researched, not guessed — confirmed directly in
[properties.service.ts:458-478](../backend/src/modules/properties/properties.service.ts#L458-L478):**
`getPendingVerifications(tenantId)` already serves the queue of
`UnitOwnership` rows with `isVerified: false` for a tenant — this is
the manual "resident claims a unit, staff confirms via eGov/ДДУ scan"
flow ([Task 0003](0003-residents-registry.md)'s own verification
queue, resolving open question №4 from the product spec). **Also
confirmed:** `verifyOwnership`
([properties.service.ts:349-456](../backend/src/modules/properties/properties.service.ts#L349-L456))
**deletes** the `UnitOwnership` row on rejection
(`dto.isVerified === false` → `unitOwnership.delete`) — so a row that
still exists with `isVerified: false` is genuinely still awaiting a
decision, never a stale "soft-rejected" row. There is currently no
signal when one of these claims sits unactioned — a resident could
submit a claim and never hear back if staff simply never opens the
queue.

This task adds an automated reminder to staff when a pending
verification has been waiting too long, mirroring the shape of
[Task 0052](0052-service-request-sla-reminders.md)'s SLA reminders for
stuck service requests — but for this queue.

### Architecture decisions already made — do not re-litigate

1. **New `PropertiesSchedulerService`, not a change to
   `properties.service.ts`'s verification logic.** Same separation
   every prior scheduler task in this project follows.
2. **Single flat threshold — no priority tiers.** Unlike
   [Task 0052](0052-service-request-sla-reminders.md)'s
   `ServiceRequest` (which has a real `priority` field driving
   different thresholds), `UnitOwnership` has no such field — one
   constant, `VERIFICATION_STALE_THRESHOLD_DAYS = 5`, applies
   uniformly.
3. **"Stale" = `isVerified: false` and `createdAt` older than the
   threshold.** No separate "last staff action" field exists on this
   model (unlike `ServiceRequest`'s `updatedAt`), and there isn't one
   needed — a `UnitOwnership` row is created once at submission and
   never touched again until it's approved or deleted (rejection), so
   `createdAt` age IS "time since submission with no decision," not an
   approximation of it.
4. **Recipients: tenant staff, via `sendToTenantRoles` with the exact
   same role set `getPendingVerifications`/`verifyOwnership` already
   use — `[HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER]` + `SUPERADMIN`
   bypass everywhere else in this module, but `sendToTenantRoles`
   broadcasts by role within one tenant so `SUPERADMIN` doesn't apply
   here** (mirrors how [Task 0052](0052-service-request-sla-reminders.md)
   handled the unassigned-request broadcast — reuse *this* module's
   own established role list, don't invent one or reuse
   `analytics`'s `DISPATCHER`-excluding set).
5. **Per-record Redis debounce, TTL = the threshold itself** — same
   mechanism [Task 0052](0052-service-request-sla-reminders.md)
   established: re-reminds every 5 days while still pending, not just
   once ever.
6. **Daily cron** — this is a multi-day threshold (not an intraday one
   like [Task 0054](0054-booking-upcoming-reminders.md)'s booking
   reminder), so a once-daily check is precise enough; matches the
   cadence of every other multi-day-threshold scheduler in this
   project.
7. **Fail-open notification categorization** — same decision as every
   prior scheduler task; the new `OWNERSHIP_VERIFICATION_STALE` type
   needs no entry in `NOTIFICATION_CATEGORIES`/`CATEGORY_MAP`.

---

## Subtask A — Backend: stale verification scheduler

Create
`backend/src/modules/properties/properties-scheduler.service.ts`:

- `VERIFICATION_STALE_THRESHOLD_DAYS = 5` (decision #2).
- `@Cron(CronExpression.EVERY_DAY_AT_9AM)` (or an explicit `'0 9 * * *'`
  with `timeZone: 'Asia/Almaty'`, matching this project's existing
  daily-cron style) method `handleStaleVerificationReminders()`.
- Fetch `UnitOwnership` rows with `isVerified: false` and `createdAt`
  older than the threshold (decision #3), including `unit.building`
  (for `tenantId` and a human-readable address in the message) and
  `user` (`firstName`/`lastName` of the claimant, for the message).
- For each: Redis debounce key
  `properties:verification-reminder:${ownership.id}`, TTL =
  `VERIFICATION_STALE_THRESHOLD_DAYS * 24 * 3600` seconds (decision
  #5); skip silently if already set.
- Notification via `sendToTenantRoles(tenantId, [HOA_ADMIN,
  HOA_CHAIRMAN, DISPATCHER], ...)` (decision #4) — title `📋 Заявка на
  верификацию ожидает решения`, body naming the claimant and the unit
  (e.g. "Айбек Нурланов — кв. №15, блок А — ожидает подтверждения
  права собственности N дней."), `data: { type:
  'OWNERSHIP_VERIFICATION_STALE', ownershipId }`.
- Per-record `try/catch` isolation, same discipline as every prior
  scheduler.
- Return a summary object (`pendingChecked`, `staleCount`,
  `remindersSent`, `skippedAlreadyReminded`) for testability.

Register `PropertiesSchedulerService` in
[properties.module.ts](../backend/src/modules/properties/properties.module.ts)'s
`providers` array. No new `imports` needed (`NotificationsModule`/
`RedisModule` are `@Global()`); `ScheduleModule.forRoot()` is already
global.

**Tests:** new
`backend/src/modules/properties/properties-scheduler.service.spec.ts` —
- A pending (`isVerified: false`) ownership row created 6 days ago
  triggers a reminder; one created 4 days ago does not (threshold
  boundary).
- A row with `isVerified: true` is never considered, regardless of
  age (proves this only touches the genuinely-pending queue).
- The reminder is sent via `sendToTenantRoles` with exactly
  `[HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER]`.
- Debounce: two consecutive sweeps for the same still-pending row
  send exactly one reminder.
- One record's notification failure doesn't prevent others in the
  same sweep from being processed.

---

## Acceptance criteria

- Only genuinely pending (`isVerified: false`) rows older than 5 days
  are reminded — proven by both the age-boundary and the
  verified-exclusion tests.
- Recipients match `getPendingVerifications`'s own role set exactly.
- No duplicate reminders within one debounce window.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/`.

## Explicitly out of scope

- Any change to `verifyOwnership`/`getPendingVerifications` — this
  task only reads existing `UnitOwnership` rows on a schedule.
- A resident-facing "your claim is still pending" notification — this
  task reminds staff, not the claimant (matching how
  [Task 0052](0052-service-request-sla-reminders.md) also only
  reminded staff, not the resident who filed the request).
- Escalation beyond the flat repeat cadence (e.g. a second, different
  message after 2 reminders) — one threshold, one repeating message,
  same as decision #5.

---

## Deliverable

- Single backend commit.
- PR description confirms the age-boundary test result explicitly and
  notes the debounce TTL equals the threshold itself — that's the
  property most worth calling out given decision #5.

---

## Implementation notes (2026-09-12)

Implemented exactly per the spec above:
`PropertiesSchedulerService.handleStaleVerificationReminders`
([properties-scheduler.service.ts](../backend/src/modules/properties/properties-scheduler.service.ts)) —
daily cron at 09:00 Asia/Almaty, `VERIFICATION_STALE_THRESHOLD_DAYS =
5` constant, one `unitOwnership.findMany` filtered to `isVerified:
false` + `createdAt < cutoff`, per-record Redis debounce (TTL = the
threshold itself), broadcast via `sendToTenantRoles(tenantId,
[HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER], ...)`, per-record `try/catch`
isolation. Registered in
[properties.module.ts](../backend/src/modules/properties/properties.module.ts).

Tests added: `properties-scheduler.service.spec.ts`, 7 tests — cutoff
computation, the 6-day-vs-4-day boundary (using two real candidate
rows filtered through a mock replicating the actual Prisma `where`
clause), verified-row exclusion, exact role-set assertion, the
debounce two-sweep sequence, per-record error isolation, and
Prisma-fetch-failure safety.

**Verified:** new tests 7/7, full backend suite 535/535 (31 suites, 0
regressions), `tsc --noEmit` clean.

**Caveat:** implemented and verified by the same person (the
architect, standing in for Antigravity while it's out of quota) — no
independent second-pass review, same as Tasks 0056/0057/0058/0059. Ask
separately if one is wanted.
