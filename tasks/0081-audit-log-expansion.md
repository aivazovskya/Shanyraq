# Task 0081: Expand audit trail to ownership unlink, access points, guest passes, SOS resolution

**Status:** Done
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature, direct follow-up to
[Task 0041](0041-staff-audit-trail.md), which built `AuditLogService`
and wired exactly four action categories (tariff changes, resident
activation, community-board moderation, ownership verification),
explicitly naming the rest as future-expansion candidates: "`unlinkOwnership`,
guest-pass issuance, access-point CRUD, SOS resolution, service-request
status changes, and every other staff mutation not named in the four
categories above — candidates for a follow-up expansion of this same
`AuditLogService`, not this task." This task picks up exactly four of
those named candidates — **not** service-request status changes or
"every other staff mutation," matching Task 0041's own discipline of
scoping to a bounded, deliberately chosen set rather than every
possible mutation at once.

**Confirmed by reading the actual methods, not guessing:**
- `unlinkOwnership` —
  [properties.service.ts:810-848](../backend/src/modules/properties/properties.service.ts#L810-L848).
  Already receives `staffUser`, already resolves the ownership's
  `unit.building.tenantId`, already has the exact cross-tenant check
  shape every other audited method uses.
- `createAccessPoint`/`updateAccessPoint` —
  [access-control.service.ts:314-378](../backend/src/modules/access-control/access-control.service.ts#L314-L378).
  Both already receive `user` and resolve/verify `tenantId`.
- `createGuestPass`/`revokeGuestPass` —
  [access-control.service.ts:700](../backend/src/modules/access-control/access-control.service.ts#L700)
  and
  [:874](../backend/src/modules/access-control/access-control.service.ts#L874)
  (the latter added by [Task 0044](0044-guest-pass-history-and-revocation.md)).
  Both already receive the acting `user` and resolve the pass's unit's
  tenant.
- `resolve` (SOS alert resolution) —
  [sos.service.ts:451-...](../backend/src/modules/sos/sos.service.ts#L451).
  Already receives `user` and the fetched `alert` (which has
  `tenantId` directly — `SosAlert` isn't nested under a unit/building
  the way ownership/guest-pass rows are).
- `AuditLogModule` ([audit-log.module.ts](../backend/src/modules/audit-log/audit-log.module.ts))
  only imports `PrismaModule` — it's a leaf module with no dependency
  on `properties`/`access-control`/`sos`, so importing it into those
  three modules' own `*.module.ts` files (alongside `finance`/
  `properties`/`community-board`, which already do this per Task 0041)
  carries **zero circular-dependency risk** — confirmed by reading
  `audit-log.module.ts` directly, not assumed.

### Architecture decisions already made — do not re-litigate

1. **Scope is exactly these four categories, six action values** —
   `OWNERSHIP_UNLINKED`, `ACCESS_POINT_CREATED`, `ACCESS_POINT_UPDATED`,
   `GUEST_PASS_ISSUED`, `GUEST_PASS_REVOKED`, `SOS_RESOLVED`. Service-
   request status changes and any other mutation not listed here stay
   out of scope for this task too, per Task 0041's own reasoning about
   not rushing every candidate into one task.
2. **Same `AuditLogService.log(...)` call shape Task 0041 already
   established** — inject `AuditLogService` into `PropertiesService`,
   `AccessControlService`, `SosService` (matching how `FinanceService`/
   `CommunityBoardService` already consume it), call `.log(...)` only
   **after** the underlying Prisma write succeeds, wrapped in nothing
   extra on the call site's part — `AuditLogService.log` is already
   internally best-effort (try/catch, never throws, per Task 0041
   decision #4), so call sites don't need their own try/catch around
   it.
3. **`tenantId` resolution per action, following each method's own
   already-available data — no new queries needed:**
   - `OWNERSHIP_UNLINKED`: `ownership.unit.building.tenantId` (already
     fetched by `unlinkOwnership`'s existing `include`).
   - `ACCESS_POINT_CREATED`: the `tenantId` parameter already passed
     into `createAccessPoint`.
   - `ACCESS_POINT_UPDATED`: `accessPoint.tenantId` (already fetched by
     the existing not-found check).
   - `GUEST_PASS_ISSUED`/`GUEST_PASS_REVOKED`: the guest pass's
     `unit.building.tenantId` — check exactly what `createGuestPass`/
     `revokeGuestPass` already fetch and reuse it, don't add a second
     query for data already in scope.
   - `SOS_RESOLVED`: `alert.tenantId` directly (no unit/building hop
     needed for this one).
4. **`actorId: user.id` / `staffUser.id` in every case** — the acting
   staff member, matching every existing call site's pattern.
5. **Metadata per action:**
   - `OWNERSHIP_UNLINKED`: `{ residentId: ownership.userId, unitId:
     ownership.unitId, unitNumber: ownership.unit.unitNumber }`.
   - `ACCESS_POINT_CREATED`: `{ name: dto.name, type: dto.type }`.
   - `ACCESS_POINT_UPDATED`: `{ before: { name: accessPoint.name, type:
     accessPoint.type, isActive: accessPoint.isActive }, after: { ...only
     the fields actually present in dto... } }` — same before/after
     shape Task 0041 already used for `TARIFF_UPDATED`, not a new
     convention.
   - `GUEST_PASS_ISSUED`: `{ guestName: dto.guestName, unitId:
     dto.unitId }`.
   - `GUEST_PASS_REVOKED`: `{ guestName: pass.guestName, unitId:
     pass.unitId }`.
   - `SOS_RESOLVED`: `{ status: dto.status, resolutionNote:
     dto.resolutionNote }`.
6. **`targetType`/`targetId`:** `UnitOwnership`/`ownershipId`,
   `AccessPoint`/`accessPointId` (both create and update), `GuestPass`/
   `passId` (both issue and revoke), `SosAlert`/`alertId`.
7. **No new read/export endpoint or role decision** — the existing
   `GET /audit-log/tenants/:tenantId` and its CSV export
   ([Task 0041](0041-staff-audit-trail.md) Subtask C) already return
   *any* `AuditLog` row for the tenant regardless of `action` value;
   these six new action values show up automatically once written. The
   only web change needed is display polish (decision #8) — no backend
   route changes.
8. **Web display: extend the existing switch/dropdown, don't rebuild
   it.** [audit-log/page.tsx](../frontend-web/src/app/dashboard/audit-log/page.tsx)'s
   `getActionBadge` (a `switch` on `action` returning a colored badge)
   and the action-type filter `<select>` (a flat list of `<option>`s)
   both currently list exactly the seven values Task 0041 shipped —
   add six more `case`s / `<option>`s for this task's new actions,
   picking colors/icons that don't collide with the existing seven
   (e.g. don't reuse `emerald` for something unrelated to tariffs).
   Also extend `formatSummary`'s metadata-to-text rendering to handle
   this task's new metadata shapes (`guestName`, `unitNumber`, `status`
   for SOS resolution, etc.) alongside the fields it already knows
   about.

---

## Subtask A — Wire the four new call sites

- `unlinkOwnership` (properties.service.ts): inject `AuditLogService`
  (if not already injected in this service — check first, `finance`/
  `community-board` already needed it per Task 0041, `properties`
  itself already has it for `updateResidentStatus`/`verifyOwnership`,
  so this is likely already available on `this.auditLogService`, not a
  new injection).
- `createAccessPoint`/`updateAccessPoint` (access-control.service.ts):
  inject `AuditLogService` into `AccessControlModule` (new for this
  module — verify no circular import per the Context section, then
  add it).
- `createGuestPass`/`revokeGuestPass` (access-control.service.ts): same
  injection as above, reused.
- `resolve` (sos.service.ts): inject `AuditLogService` into `SosModule`
  (new for this module).

**Tests:** extend each of the four services' existing spec files (not
one new cross-cutting file, matching Task 0041's own precedent) —
mock `AuditLogService.log` and assert it's called exactly once with
the correct `action`/`targetType`/`targetId`/`tenantId` on success, and
**not called** when the underlying action throws before completing
(e.g. `unlinkOwnership` on an unverified ownership, `createAccessPoint`
by a non-privileged role, `resolve` on an already-resolved alert) —
same "success vs. rejected-path" test pairing Task 0041 established.

## Subtask B — Web display polish

- [audit-log/page.tsx](../frontend-web/src/app/dashboard/audit-log/page.tsx):
  extend `getActionBadge`, the filter `<select>`, and `formatSummary`
  per decision #8.
- Add `auditLog.actions.OWNERSHIP_UNLINKED` /
  `auditLog.actions.ACCESS_POINT_CREATED` /
  `auditLog.actions.ACCESS_POINT_UPDATED` /
  `auditLog.actions.GUEST_PASS_ISSUED` /
  `auditLog.actions.GUEST_PASS_REVOKED` /
  `auditLog.actions.SOS_RESOLVED` to all three locale files, full
  kk/ru/en parity.

---

## Acceptance criteria

- Each of the six new actions produces exactly one audit row on
  success and zero rows on a rejected/failed underlying action —
  proven by dedicated tests per action, matching Task 0041's own bar.
- All six new action values render a real, non-default badge (not the
  generic fallback badge) and a real i18n label (not the raw action
  string) on `/dashboard/audit-log`.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/` and `frontend-web/`; full kk/ru/en i18n parity maintained.

## Explicitly out of scope

- Service-request status changes and any other staff mutation not
  named in decision #1 — still candidates for a *further* follow-up,
  per Task 0041's own ongoing reasoning.
- Any change to the read/export endpoints themselves — decision #7,
  they already work generically for any action value.
- Mobile UI — audit trail has stayed web-only since Task 0041, no
  reason to change that here.

## Deliverable

- Can ship as one commit or split by module (properties / access-
  control / sos / web) — your call.
- PR description confirms, for each of the six actions, the
  "success logs one row, rejected path logs zero rows" test result —
  the same property Task 0041's own deliverable asked to be called out
  explicitly, extended to this task's six new actions.
