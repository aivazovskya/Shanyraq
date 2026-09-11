# Task 0041: Staff action audit trail (tariffs, resident status, moderation, ownership verification)

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature. Today there is no way for a `HOA_CHAIRMAN` (an elected
resident overseeing the УК, per §2 of the ТЗ's role model) or a
`SUPERADMIN` to answer "who changed this tariff / deactivated this
resident / removed this listing / approved this ownership claim, and
when" — every one of these actions happens silently, with no durable
record beyond whatever the current DB row looks like right now. This
task adds a persistent, queryable audit trail for exactly four
high-consequence staff action categories:

1. **Tariff changes** — `createTariff`/`updateTariff` in
   [finance.service.ts](../backend/src/modules/finance/finance.service.ts).
2. **Resident activation/deactivation** — `updateResidentStatus` in
   [properties.service.ts](../backend/src/modules/properties/properties.service.ts).
3. **Community-board moderation** — `moderateListing` in
   [community-board.service.ts](../backend/src/modules/community-board/community-board.service.ts).
4. **Ownership verification/rejection** — `verifyOwnership` in
   [properties.service.ts](../backend/src/modules/properties/properties.service.ts)
   (the approve-or-reject decision itself; [Task 0040](0040-ownership-and-meters-test-coverage.md)
   just added test coverage proving this method's share-invariant math
   is correct — this task adds a record of *who* approved/rejected
   *which* claim, not a change to that logic).

**Researched, not guessed — `createTariff` doesn't receive the acting
user today.** Checked
[finance.controller.ts:54-61](../backend/src/modules/finance/finance.controller.ts):
`@CurrentUser() user` is already fetched in the controller for
`createTariff` but never passed to the service (only `updateTariff`
receives `user`, for its `assertUserBelongsToTenant` tenant check).
This task needs to thread `user` through to `createTariff` as well —
a small, safe signature change, not a new dependency.

### Architecture decisions already made — do not re-litigate

1. **Scope is exactly these four action categories — not every staff
   mutation in the app.** `unlinkOwnership`, guest-pass issuance, access
   point registration, and every other staff write action are real
   candidates for a future audit-trail expansion, but adding all of them
   in one task risks a shallow, rushed implementation of each. These
   four were chosen because they're the ones most likely to be disputed
   between a УК and residents (money, account access, public listings,
   property rights) — the same reasoning ТЗ's ОСС/ОСИ oversight model is
   built around.
2. **A new `AuditLog` model, not reusing `AccessLog`.**
   [AccessLog](../backend/prisma/schema.prisma) is purpose-built for
   physical access events (`accessPointId` is a required FK) — forcing
   tariff/moderation/ownership events through it would mean a fake or
   nullable `accessPointId` on rows that have nothing to do with a
   physical access point. A new table with a generic
   `targetType`/`targetId` pair (no FK — it references different tables
   depending on the action) is the right shape here, the same way most
   generic audit-log designs work.
3. **`actorId` is nullable with `onDelete: SetNull`, not `Cascade` —
   this is the #1 way this task goes wrong.** If a staff account is
   later deactivated or (hypothetically) removed, the audit trail must
   *not* disappear with it — that would defeat the entire purpose of an
   audit trail for a disputed action ("the admin who approved this got
   fired and now there's no record they ever did it"). This matches the
   already-established cautious precedent for "who did this" fields
   elsewhere (`AccessLog.userId`/`SosAlert.resolvedById` are both
   nullable `SetNull`), even though one other similar field in this
   codebase (`SosAlert.triggeredById`) uses `Cascade` — `SetNull` is the
   correct choice specifically *because* this is a compliance record,
   not an operational one.
4. **Best-effort logging — wrap the write in try/catch, never let it
   block the actual staff action.** Same reasoning as
   [Task 0033](0033-in-app-notification-center.md)'s
   `persistNotifications`: a transient DB hiccup while writing an audit
   row must not prevent a tariff update or resident deactivation from
   completing. Log a warning on failure and continue.
5. **A small shared `AuditLogService.log(...)` method, called from the
   four existing services above — not a generic decorator/interceptor.**
   This project has no AOP/decorator-based cross-cutting infrastructure
   today, and building one just for four call sites is over-engineering.
   A plain injectable service with one method, called explicitly at the
   end of each of the four methods (after the actual DB write succeeds),
   is simpler and matches how this codebase already does everything
   else (explicit calls, not magic).
6. **Same role gate as the existing analytics endpoints for reading the
   trail — no new authorization decision.** `@Roles(SUPERADMIN,
   HOA_ADMIN, HOA_CHAIRMAN)` — this is deliberately the same set
   [analytics.controller.ts](../backend/src/modules/analytics/analytics.controller.ts)
   already uses, since "who did what" oversight is conceptually the
   same audience as the analytics dashboard (`HOA_CHAIRMAN` in
   particular needs read access here — that's the whole point of an
   elected resident-overseer role).
7. **New web nav entry — this is the one place in this project's recent
   task history where that's actually warranted.** Every prior
   dashboard-extension task ([0035](0035-superadmin-platform-overview.md),
   [0037](0037-access-log-csv-export.md),
   [0038](0038-notification-preferences.md)) found an existing page or
   panel to extend because the feature was a natural extension of
   something already there. An audit trail isn't a natural extension of
   any single existing page — it's a new, freestanding concern — so a
   new `/dashboard/audit-log` page and sidebar entry is the right call
   here, not a forced fit into an unrelated page.
8. **CSV export ships in the same task, reusing the established
   pattern.** Given how cheap this now is
   ([csv.helper.ts](../backend/src/common/csv/csv.helper.ts) +
   [apiDownload](../frontend-web/src/lib/api.ts), used identically in
   [Task 0032](0032-finance-analytics-csv-export.md)/
   [Task 0037](0037-access-log-csv-export.md)) and how directly it
   serves this feature's stated purpose (handing a printed/exportable
   record to an ОСС meeting or a dispute review), it's not worth a
   separate follow-up task — bounded by date range, defaulting to the
   last 30 days, same convention as Task 0037.

---

## Subtask A — Backend: schema + `AuditLogService`

- Add to `schema.prisma`:
  ```prisma
  model AuditLog {
    id         String   @id @default(uuid())
    tenantId   String
    actorId    String?
    action     String   // TARIFF_CREATED | TARIFF_UPDATED | RESIDENT_ACTIVATED | RESIDENT_DEACTIVATED | LISTING_MODERATED | OWNERSHIP_VERIFIED | OWNERSHIP_REJECTED
    targetType String   // TariffItem | User | CommunityListing | UnitOwnership
    targetId   String
    metadata   Json?
    createdAt  DateTime @default(now())

    tenant     Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
    actor      User?    @relation(fields: [actorId], references: [id], onDelete: SetNull)

    @@index([tenantId, createdAt])
    @@map("audit_logs")
  }
  ```
  Add `auditLogs AuditLog[]` to both `Tenant` and `User` models.
- New `backend/src/modules/audit-log/audit-log.service.ts`:
  `log(params: { tenantId: string; actorId?: string; action: string; targetType: string; targetId: string; metadata?: Record<string, any> })`
  — wraps `prisma.auditLog.create` in try/catch (decision #4), logs a
  warning on failure, never throws.
- New `backend/src/modules/audit-log/audit-log.module.ts` exporting the
  service, imported by `finance`, `properties`, and `community-board`
  modules (whichever import graph avoids a circular dependency — check
  existing module wiring before assuming).

## Subtask B — Wire the four call sites

- **`finance.service.ts`**: thread `user` through to `createTariff`
  (update its signature and the controller call site to pass
  `@CurrentUser() user`, per the researched gap above). After a
  successful create: `action: 'TARIFF_CREATED'`, `metadata: { name,
  calculationMethod, rate }`. After a successful update: `action:
  'TARIFF_UPDATED'`, `metadata: { before: { name, calculationMethod,
  rate, isActive }, after: { ...only the fields actually changed by
  dto... } }` — capture the pre-update `tariff` values already fetched
  by the existing not-found check, don't re-query.
- **`properties.service.ts`'s `updateResidentStatus`**: after the
  update, `action: dto.isActive ? 'RESIDENT_ACTIVATED' :
  'RESIDENT_DEACTIVATED'`, `targetType: 'User'`, `targetId: userId`,
  `metadata: { residentName: ..., previousStatus: targetUser.isActive }`.
- **`community-board.service.ts`'s `moderateListing`**: after the
  update, `action: 'LISTING_MODERATED'`, `targetType:
  'CommunityListing'`, `targetId: id`, `metadata: { previousStatus:
  listing.status, newStatus: dto.status, reason: dto.reason }`.
- **`properties.service.ts`'s `verifyOwnership`**: after either the
  approve or reject branch, `action: dto.isVerified ?
  'OWNERSHIP_VERIFIED' : 'OWNERSHIP_REJECTED'`, `targetType:
  'UnitOwnership'`, `targetId: ownershipId`, `metadata: { residentId:
  record.userId, unitId: record.unitId, sharePercent: ... }`.
- In every case, `tenantId` comes from the resource being acted on
  (the tariff's tenant, the resident's/ownership's unit's tenant, the
  listing's tenant) — not from the acting staff member's own `tenantId`,
  so a `SUPERADMIN` acting cross-tenant still logs against the correct
  tenant.

**Tests:** extend each of the four services' existing spec files (don't
create one giant cross-cutting spec file) — mock `AuditLogService.log`
and assert it's called once per successful action with the correct
`action`/`targetType`/`targetId`, and **not called** when the action
throws before completing (e.g. a rejected tariff update due to
`METER_TYPE_REQUIRED` must not log a false `TARIFF_UPDATED` entry). Also
add `audit-log.service.spec.ts`: a failed `prisma.auditLog.create` logs
a warning and does not throw (decision #4).

## Subtask C — Backend: read + export endpoints

New `backend/src/modules/audit-log/audit-log.controller.ts`:
- `GET /audit-log/tenants/:tenantId?from=&to=&action=` —
  `@Roles(SUPERADMIN, HOA_ADMIN, HOA_CHAIRMAN)` (decision #6), same
  `assertUserBelongsToTenant` tenant check every other tenant-scoped
  endpoint in this codebase uses. Returns audit rows with the actor's
  name resolved (`include: { actor: { select: { firstName, lastName,
  role } } }`), newest first, bounded by date range (default last 30
  days, same convention as Task 0037's access-log endpoint).
- `GET /audit-log/tenants/:tenantId/export?from=&to=&action=` — same
  auth, same `buildCsv`/UTF-8 BOM pattern as Task 0032/0037, columns:
  timestamp, actor name, action, target type, target ID, a
  human-readable summary of `metadata`.

## Subtask D — Web: new `/dashboard/audit-log` page

- New sidebar nav entry (`roles: ['SUPERADMIN', 'HOA_ADMIN', 'HOA_CHAIRMAN']`,
  matching decision #6) in
  [layout.tsx](../frontend-web/src/app/dashboard/layout.tsx).
- New page: date-range filter, an action-type filter (dropdown of the 7
  action values), a table (timestamp, actor, action label, target,
  summary), and a "Скачать CSV" button using `apiDownload`, same
  patterns as [access/page.tsx](../frontend-web/src/app/dashboard/access/page.tsx)'s
  Task 0037 log section.
- Full kk/ru/en i18n parity for all new text (new `auditLog` namespace).

---

## Acceptance criteria

- All four action categories produce exactly one audit row on success
  and zero rows when the underlying action is rejected/throws.
- A deactivated/deleted actor's historical audit rows remain visible
  with `actor: null` rather than disappearing (decision #3) — worth a
  direct test (mock a `null` actor relation result and confirm the read
  endpoint doesn't crash on it).
- `HOA_CHAIRMAN` can read the trail for their own tenant; cross-tenant
  access is rejected for non-SUPERADMIN staff.
- CSV export mirrors the on-screen filtered view (same date range/action
  filter applied server-side, not just client-side truncation).
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in `backend/`
  and `frontend-web/`; full kk/ru/en i18n parity maintained.

## Explicitly out of scope

- `unlinkOwnership`, guest-pass issuance, access-point CRUD, SOS
  resolution, service-request status changes, and every other staff
  mutation not named in the four categories above — candidates for a
  follow-up expansion of this same `AuditLogService`, not this task.
- Mobile UI — platform/oversight tooling has stayed web-only throughout
  this project ([Task 0023](0023-platform-tenant-onboarding.md),
  [Task 0035](0035-superadmin-platform-overview.md)), consistent with
  the established mobile-vs-web staff split.
- Retention/archival of old audit rows — accumulates unbounded for now,
  same accepted tradeoff [Task 0033](0033-in-app-notification-center.md)
  made for notifications.
- Diffing/highlighting exactly which tariff fields changed in the UI
  (beyond showing the `before`/`after` metadata as-is) — a nice-to-have,
  not required for a first version.

## Deliverable

- Backend (schema + service + four call sites + endpoints) and web can
  ship as separate commits.
- PR description explicitly confirms: (a) the actor-deletion/SetNull
  behavior was tested, not just assumed from the schema, and (b) which
  of the four action categories' tests prove a rejected/failed action
  does *not* produce a false audit entry.

---

## Review addendum (2026-09-11) — needs fix: SUPERADMIN cannot use the page it's granted access to

**Verified good — backend:** schema matches decision #2/#3 exactly
(`actorId` nullable, `onDelete: SetNull`, generic `targetType`/`targetId`).
`AuditLogService.log` is genuinely best-effort — a rejected DB write is
caught and logged, never thrown (decision #4), and this is proven with
a real rejected-promise test, not just read from the code. All four call
sites (`createTariff`, `updateTariff`, `updateResidentStatus`,
`moderateListing`, `verifyOwnership`'s approve/reject branches) place
the log call only after the underlying mutation succeeds, and every one
of the four services' spec files has a matching pair of assertions
(`toHaveBeenCalledWith` on success, `not.toHaveBeenCalled` on a
rejected/thrown path) — exactly what the deliverable asked to be called
out. `createTariff` was correctly threaded with `user` end-to-end
(controller → service). Cross-tenant access to `GET /audit-log/tenants/:id`
is rejected via the standard `assertUserBelongsToTenant`, and CSV export
reuses `getAuditLogs` internally so the exported file always matches the
same date-range/action filter as the screen — no drift between the two,
as required. The null-actor case (deleted/deactivated staff) is directly
tested for both the list endpoint and the CSV export, rendering "Удаленный
сотрудник" instead of crashing — this was explicitly called out as the
task's central risk and it's genuinely proven, not assumed. 416/416
backend tests pass, `tsc --noEmit` clean, full kk/ru/en parity
(1010/1010/1010 web keys).

**Found — real bug on web:** the nav entry in
[layout.tsx](../frontend-web/src/app/dashboard/layout.tsx) grants
`SUPERADMIN` access to `/dashboard/audit-log`, but
[audit-log/page.tsx](../frontend-web/src/app/dashboard/audit-log/page.tsx)
unconditionally reads `session?.user?.tenantId` for the API calls — and
a `SUPERADMIN` account has no `tenantId` of its own (confirmed: it's
platform-wide, per Task 0023's onboarding flow). `fetchLogs()`'s guard
`if (!tenantId) { setLoading(false); return; }` means a SUPERADMIN who
opens this page gets a silent, permanent "no records" empty state with
no indication that a tenant was never selected — they cannot view *any*
ЖК's audit trail from the web despite the backend correctly supporting
`SUPERADMIN` access to any tenant (proven by this task's own
`audit-log.service.spec.ts` test "должен разрешать доступ SUPERADMIN к
любому ЖК"). This is the exact same class of bug
[Task 0011](0011-community-board.md) already found and fixed once in
this codebase — [community-board/page.tsx](../frontend-web/src/app/dashboard/community-board/page.tsx)
and [sos/page.tsx](../frontend-web/src/app/dashboard/sos/page.tsx) both
solve it with an `isSuper` branch that fetches `/properties/tenants` and
renders a `<select>` to pick an active tenant — `audit-log/page.tsx` is
the one new page in this task that didn't reuse that established
pattern.

**Required fix:** add the same SUPERADMIN tenant-selector pattern from
`community-board/page.tsx` to `audit-log/page.tsx` — fetch
`/properties/tenants` when `session.user.role === 'SUPERADMIN'`, render
a `<select>`, and use the selected tenant id (falling back to
`session.user.tenantId` for non-SUPERADMIN staff) as the `tenantId` used
in both `fetchLogs` and `handleExportCsv`.

**Fix verified (2026-09-11):** `audit-log/page.tsx` now fetches
`/properties/tenants` for `SUPERADMIN` and renders a `<select>`,
matching the `community-board`/`sos` precedent exactly. A distinct
"select a ЖК" prompt state is shown separately from the loading/empty
states, so a `SUPERADMIN` who hasn't picked a tenant yet gets a clear
call to action instead of a silent empty table. `tsc --noEmit` clean in
`frontend-web/`, full kk/ru/en parity (1013/1013/1013 keys, new
`selectTenantPlaceholder`/`selectTenantPromptTitle`/`selectTenantPromptSub`
keys present in all three locales). No backend files touched by this
fix, as expected. Task accepted.
