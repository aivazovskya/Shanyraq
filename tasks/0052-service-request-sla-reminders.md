# Task 0052: SLA reminders for stuck service requests

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature. **Researched, not guessed — confirmed directly in
[schema.prisma](../backend/prisma/schema.prisma)'s `ServiceRequest`
model:** `status` (`PENDING`/`ASSIGNED`/`IN_PROGRESS`/`RESOLVED`/
`REJECTED`/`CLOSED`), `priority` (`LOW`/`MEDIUM`/`HIGH`/`EMERGENCY`),
`assigneeId` (nullable — set via `updateStatus`), and `updatedAt`
(auto-bumped by Prisma on every field change, including every status/
assignee change made through
[service-requests.service.ts](../backend/src/modules/service-requests/service-requests.service.ts)'s
`updateStatus`).

Right now nothing alerts staff when a request goes stale — the only
way to notice a forgotten `PENDING` request or a `HIGH`-priority job
nobody has touched in days is to manually scroll the requests list.
This task adds an automated cron sweep that reminds staff about
requests that have sat too long in an open state without any status
change, with the reminder cadence itself scaled to priority (an
`EMERGENCY` request going quiet is a very different problem than a
`LOW` one).

### Architecture decisions already made — do not re-litigate

1. **"Stuck" = open status + stale `updatedAt`, no new schema field.**
   Open statuses are `PENDING`, `ASSIGNED`, `IN_PROGRESS` — `RESOLVED`,
   `REJECTED`, `CLOSED` are terminal and excluded. `updatedAt` is
   already bumped by every `updateStatus` call (Prisma's
   `@updatedAt`), so "no status change in N hours" is exactly
   `now - updatedAt > threshold`. Do not add a new
   `lastStaffActionAt`-style column — it would just duplicate
   `updatedAt`'s existing semantics for this model.
2. **Per-priority thresholds, not one fixed number.** An `EMERGENCY`
   request stuck 4 hours is a bigger problem than a `LOW` one stuck 4
   hours. Hardcode a threshold map (mirrors the hardcoded
   `METER_TYPE_NAMES`-style const map in
   [meters-scheduler.service.ts](../backend/src/modules/meters/meters-scheduler.service.ts)) —
   **no new tenant-configurable settings**, that's a separate feature
   if ever needed:
   ```ts
   const SLA_THRESHOLD_HOURS: Record<RequestPriority, number> = {
     EMERGENCY: 4,
     HIGH: 24,
     MEDIUM: 72,
     LOW: 168,
   };
   ```
3. **Recipient: the assignee if one is set, otherwise all tenant
   staff.** If `assigneeId` is set, the reminder goes to that one
   person via `notificationsService.sendToUser` — they're the one who
   dropped it. If `assigneeId` is `null` (still unassigned, i.e. stuck
   in `PENDING`), broadcast via
   `notificationsService.sendToTenantRoles(tenantId, [HOA_ADMIN,
   HOA_CHAIRMAN, DISPATCHER], ...)` — the same three roles
   [service-requests.service.ts](../backend/src/modules/service-requests/service-requests.service.ts)
   already treats as "staff" throughout (`isStaff` checks in
   `getRequestById`/`updateStatus`/`addComment`). **`DISPATCHER` is
   included here** — unlike the `analytics` module's
   `assertStaffAccess` (which deliberately excludes `DISPATCHER`),
   service-requests has always treated `DISPATCHER` as core staff
   (same reasoning [Task 0049](0049-sos-statistics-and-trends.md)
   documented for SOS). Do not reuse `assertStaffAccess` here — reuse
   the role list from *this* module's own convention instead.
4. **Debounce TTL = the priority's own threshold, not a fixed
   value.** So an `EMERGENCY` request still stuck gets re-reminded
   every 4 hours, a `LOW` one every 7 days — the reminder repeats at
   the same cadence as the threshold itself, escalating naturally by
   staying noisy for urgent stuck requests and quiet for low-priority
   ones. Same Redis debounce mechanism as
   [Task 0045](0045-voting-deadline-reminders.md)/[Task 0047](0047-meter-reading-reminders.md)
   (key per request, `redisService.set(key, '1', ttlSeconds)`), just
   with a per-priority TTL instead of one fixed TTL.
5. **Cron runs hourly, not daily.** The shortest threshold is 4 hours
   (`EMERGENCY`) — a daily cron (like the meter/voting reminder jobs)
   would be far too coarse to catch that case meaningfully. Use
   `@Cron(CronExpression.EVERY_HOUR)`. No timezone conversion is
   needed for this job (unlike the finance/meter schedulers, which key
   off calendar month/day in Asia/Almaty) — this job only compares
   `now - updatedAt` in absolute elapsed time, so plain UTC `Date` math
   is correct and simpler; don't import `getAlmatyCurrentPeriod` here,
   it isn't relevant to this job.
6. **Fail-open notification categorization — do not touch
   `NOTIFICATION_CATEGORIES`/`CATEGORY_MAP`.** Same decision as
   [Task 0045](0045-voting-deadline-reminders.md)/[Task 0047](0047-meter-reading-reminders.md):
   `resolveCategory` in
   [notifications.service.ts](../backend/src/modules/notifications/notifications.service.ts)
   returns `null` (always-deliver) for any unmapped `data.type`, so
   the new `SERVICE_REQUEST_SLA_BREACH` type needs no entry anywhere
   to be delivered.
7. **No new module wiring needed for `PrismaService`/`RedisService`/
   `NotificationsService`** — `PrismaModule`, `RedisModule`, and
   `NotificationsModule` are all `@Global()` (confirmed by reading
   each module file), so
   [service-requests.module.ts](../backend/src/modules/service-requests/service-requests.module.ts)
   only needs the new scheduler class added to its own `providers`
   array, no new `imports` entries. `ScheduleModule.forRoot()` is
   already registered globally in
   [app.module.ts](../backend/src/app.module.ts) — don't re-register
   it.

---

## Subtask A — Backend: SLA scheduler

Create `backend/src/modules/service-requests/service-requests-sla-scheduler.service.ts`,
mirroring the shape of
[meters-scheduler.service.ts](../backend/src/modules/meters/meters-scheduler.service.ts):

- `@Cron(CronExpression.EVERY_HOUR)` method
  `handleServiceRequestSlaCheck()`.
- Fetch all `ServiceRequest` rows with `status: { in: [PENDING,
  ASSIGNED, IN_PROGRESS] }`, including `unit` (for the unit number in
  the message) and `assignee` (`id` only needed).
- For each request: look up its threshold from `SLA_THRESHOLD_HOURS`
  by `priority` (decision #2); if `now - updatedAt` (in hours) hasn't
  exceeded the threshold, skip.
- For requests past threshold: Redis debounce key
  `service-requests:sla:${request.id}`, TTL =
  `SLA_THRESHOLD_HOURS[priority] * 3600` seconds (decision #4). Skip
  silently if the key is already set.
- Build the notification (decision #3): title along the lines of
  `⏰ Заявка №{id.slice(0,8)} требует внимания`, body naming the unit
  number, category, priority, and how long it's been stuck (in hours
  or days, whichever reads naturally), `data: { type:
  'SERVICE_REQUEST_SLA_BREACH', requestId, priority }`.
  - If `assigneeId` is set: `notificationsService.sendToUser(assigneeId, ...)`.
  - Else: `notificationsService.sendToTenantRoles(tenantId,
    [HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER], ...)`.
- Per-record `try/catch` isolation (one request's notification failure
  must not abort the sweep) — same discipline as
  [Task 0047](0047-meter-reading-reminders.md).
- Return a summary object (`requestsChecked`, `requestsOverdue`,
  `remindersSent`, `skippedAlreadyReminded`) like the meter/voting
  scheduler methods do, for testability.

Register `ServiceRequestsSlaSchedulerService` in
[service-requests.module.ts](../backend/src/modules/service-requests/service-requests.module.ts)'s
`providers` array (decision #7).

**Tests:** new
`backend/src/modules/service-requests/service-requests-sla-scheduler.service.spec.ts` —
- A `PENDING` request older than its priority's threshold triggers a
  reminder; one younger than the threshold does not.
- `RESOLVED`/`REJECTED`/`CLOSED` requests are never checked, regardless
  of how stale `updatedAt` is.
- An assigned request's reminder goes to the assignee via
  `sendToUser`, not a tenant-wide broadcast.
- An unassigned (`PENDING`) request's reminder goes via
  `sendToTenantRoles` with exactly `[HOA_ADMIN, HOA_CHAIRMAN,
  DISPATCHER]` — not `SECURITY`, not the `analytics` module's
  DISPATCHER-excluding set.
- The per-priority threshold is actually respected: seed one
  `EMERGENCY` request 5 hours stale and one `LOW` request 5 hours
  stale in the same run — only the `EMERGENCY` one reminds.
- Debounce: calling the sweep twice in a row for the same still-stuck
  request sends exactly one reminder, not two.
- One request's notification throwing does not prevent the others in
  the same sweep from being processed (per-record isolation).

---

## Acceptance criteria

- Requests in a terminal status (`RESOLVED`/`REJECTED`/`CLOSED`) are
  never flagged, no matter how old.
- Threshold is priority-specific, proven by the mixed-priority test.
- Assigned requests notify only the assignee; unassigned requests
  broadcast to `HOA_ADMIN`/`HOA_CHAIRMAN`/`DISPATCHER` only.
- No duplicate reminders within one debounce window (per-priority TTL
  proven by the two-sweeps test).
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/`.

## Explicitly out of scope

- Any new database column or tenant-configurable SLA settings —
  thresholds are a hardcoded const map per decision #2.
- Web or mobile UI changes (a "days overdue" badge on the requests
  list, a dedicated SLA dashboard) — this task is the notification
  sweep only, matching the backend-only scope of
  [Task 0045](0045-voting-deadline-reminders.md)/[Task 0047](0047-meter-reading-reminders.md).
- Escalation chains (e.g. re-notifying a higher role after N missed
  reminders) — the flat per-priority repeat cadence from decision #4
  is the whole mechanism for this task.
- Analytics/reporting on SLA breach history — a distinct, separate
  feature if ever needed.

---

## Review addendum (2026-09-12) — accepted, no issues found

**Verified good:**
- `ServiceRequestsSlaSchedulerService` checks active service requests (`PENDING`, `ASSIGNED`, `IN_PROGRESS`) and correctly ignores terminal states (`RESOLVED`, `REJECTED`, `CLOSED`) at the query level.
- Priority-specific SLA thresholds strictly observed: `EMERGENCY` (4h), `HIGH` (24h), `MEDIUM` (72h), `LOW` (168h).
- Notification routing matches decisions: assigned requests dispatched directly to `assigneeId` via `sendToUser`, unassigned requests dispatched to tenant staff `[HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER]` via `sendToTenantRoles`.
- Redis debouncing keys off `service-requests:sla:${request.id}` with per-priority TTL (`thresholdHours * 3600`), preventing duplicates within each threshold window.
- Per-record error isolation verified: FCM/network failure on one notification does not stop execution of remaining requests.
- All 8 dedicated unit tests pass in `service-requests-sla-scheduler.service.spec.ts`.
- Full backend suite: 486/486 tests pass (28/28 suites), `tsc --noEmit` clean.

## Deliverable

- Single backend commit.
- PR description states the per-priority threshold table and confirms
  the mixed-priority test result explicitly — that's the property
  most worth calling out given decision #2.

---

## Review addendum (2026-09-12) — accepted, no issues found

**Verified good:** `SLA_THRESHOLD_HOURS` matches decision #2 exactly;
the Prisma query filters to `PENDING`/`ASSIGNED`/`IN_PROGRESS` at the
DB level (terminal statuses never fetched, let alone flagged);
per-record elapsed-time check against the request's own priority
threshold, proven directly by the mixed-priority test (`EMERGENCY` 5h
stale reminds, `LOW` 5h stale does not, same run); assignee routing
(`sendToUser`) vs. unassigned broadcast
(`sendToTenantRoles(tenantId, [HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER],
...)`) both verified with exact-role-array assertions; Redis debounce
TTL = `thresholdHours * 3600` confirmed via a direct
`toHaveBeenCalledWith` assertion, and the two-sweep test proves
exactly one reminder is sent across two runs of the same stuck
request; per-record `try/catch` isolation proven by a test where the
first request's `sendToUser` rejects and the second still succeeds;
`NOTIFICATION_CATEGORIES`/`CATEGORY_MAP` correctly left untouched
(fail-open delivery per decision #6); no new `imports` added to
`service-requests.module.ts` beyond the new provider (decision #7
respected — `PrismaModule`/`RedisModule`/`NotificationsModule`
globality wasn't second-guessed). Minor, harmless deviation: the new
scheduler is also added to the module's `exports` array, which the
spec didn't ask for and nothing currently imports — not a defect,
just unused surface area.

**Verified independently:** ran the new spec in isolation (8/8
passed — the two intentional-failure tests print expected `[CRON]
ERROR` log lines to stderr, not a real failure), full backend suite
486/486 (28 suites, 0 regressions), `tsc --noEmit` clean.

Task accepted, no fixes required.
