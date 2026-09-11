# Task 0044: Guest pass history and revocation (mobile)

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature. [Task 0002](0002-barrier-2fa-pin.md) gave residents a
way to issue a guest pass, and [Task 0028](0028-guest-pass-staff-issuance.md)
fixed staff issuance — but **researched, not guessed**: grepped the
entire backend for `isUsed`/`accessCode`/any redemption logic and
`mobile/src/api/access.ts` for any list method — there is no
`getGuestPasses` anywhere, no history/list endpoint, and no revoke
endpoint. Once a pass is created, nobody — not the resident who created
it, not staff, not `SUPERADMIN` — can see it again or cancel it. This
task adds both.

**Important, honestly-stated limitation to carry into this task's
framing:** grepped further — `GuestPass.isUsed`/`accessCode` are **never
read or validated anywhere** in this codebase today. There is no
gate-side "redeem this code" flow yet (opening a barrier via
`openBarrier` doesn't touch `GuestPass` at all). This means today,
"revoking" a pass is a **record-keeping/audit safety net for when
redemption eventually gets built**, not something that currently blocks
a guest's physical entry — there is no physical entry check to block.
State this plainly in the PR description; don't imply this task adds a
live security control it doesn't yet have a consumer for.

### Architecture decisions already made — do not re-litigate

1. **Mobile only, matching where this entire feature already lives.**
   Guest-pass issuance has been mobile-only since Task 0002 (resident)
   and Task 0029 (staff) — no web page for guest passes exists at all
   (confirmed via grep). History and revocation extend the same two
   existing mobile screens
   ([AccessScreen.tsx](../mobile/src/screens/access/AccessScreen.tsx)
   for residents,
   [StaffGuestPassScreen.tsx](../mobile/src/screens/staff/StaffGuestPassScreen.tsx)
   for staff) rather than introducing a new web surface for a feature
   that has never had one.
2. **Same four staff roles that can issue a pass can revoke any pass in
   their tenant.** [Task 0028](0028-guest-pass-staff-issuance.md)
   already established `HOA_ADMIN`/`HOA_CHAIRMAN`/`DISPATCHER`/`SECURITY`
   as the staff roles that can issue a guest pass for any unit in their
   ЖК — reuse that exact set for revocation instead of inventing a
   narrower or different one. A resident can additionally revoke **their
   own** created passes (not other residents' passes for the same unit,
   if co-owners each issue their own).
3. **A derived `status` field, computed server-side, not re-derived per
   client.** Both mobile screens need the same "is this pass still
   good" logic (`REVOKED` > `USED` > `EXPIRED` (`validTo` in the past)
   > `ACTIVE`, in that precedence). Compute this once in the service
   layer and return it as a `status` field on every guest-pass response,
   the same reasoning
   [Task 0030](0030-code-quality-cleanup-low-risk.md)'s
   `requestLabels.ts` extraction already applied to service-request
   status/category labels — don't make two client screens re-derive the
   same precedence logic independently.
4. **`revokedById` is nullable with `onDelete: SetNull`, matching
   [Task 0041](0041-staff-audit-trail.md)'s established convention for
   "who did this" compliance-adjacent fields** — losing the record of
   *that a pass was revoked* just because the staff account that revoked
   it was later deactivated would be the same class of bug Task 0041
   was written to avoid.
5. **No `AuditLogService` integration in this task.** Task 0041's own
   "Explicitly out of scope" section named guest-pass issuance as a
   candidate for a *future* expansion of that service — revocation is
   arguably the more disputable half of that ("staff cancelled my
   guest's access without telling me"), but pulling `AuditLogService`
   into the `access-control` module is a separate, deliberate coupling
   decision that deserves its own task, not a drive-by addition here.
   If wanted later, it's a small follow-up once this task's `revoke`
   method exists to hang a `log()` call off of.
6. **Revoking an already-revoked pass is rejected (idempotency guard),
   matching this codebase's established pattern for "already in that
   state" actions** (e.g. `BOOKINGS.ALREADY_CANCELLED` in
   [bookings.service.ts](../backend/src/modules/bookings/bookings.service.ts)).
   Revoking an already-expired-but-not-yet-revoked pass is allowed (it's
   a harmless no-op state transition, not worth a special error).

---

## Subtask A — Backend: schema + list/revoke methods

- Add to the `GuestPass` model in `schema.prisma`: `isRevoked Boolean
  @default(false)`, `revokedAt DateTime?`, `revokedById String?` with
  `revokedBy User? @relation(fields: [revokedById], references: [id],
  onDelete: SetNull)` (decision #4). Add the inverse relation field on
  `User`.
- In [access-control.service.ts](../backend/src/modules/access-control/access-control.service.ts):
  - A private `computeGuestPassStatus(pass)` helper (decision #3):
    `'REVOKED'` if `isRevoked`, else `'USED'` if `isUsed`, else
    `'EXPIRED'` if `validTo < now`, else `'ACTIVE'`.
  - `getGuestPassesForUnit(unitId, user)`: resident-only, reuse
    `createGuestPass`'s existing verified-ownership IDOR check for
    `unitId` (don't re-derive it) — returns that unit's guest passes,
    newest first, each with the computed `status`.
  - `getGuestPassesForTenant(tenantId, user)`: staff-only
    (`HOA_ADMIN`/`HOA_CHAIRMAN`/`DISPATCHER`/`SECURITY`/`SUPERADMIN`),
    `assertUserBelongsToTenant`-scoped, all guest passes for units in
    that tenant, newest first, with `status`, plus the creator's
    name/role and the unit's number/block for display.
  - `revokeGuestPass(passId, user)`: load the pass with its unit's
    building; reject if not found; reject if already `isRevoked`
    (decision #6); authorize if `user.id === pass.creatorId` **or**
    `user.role` is `SUPERADMIN` **or** (`user.role` is one of the four
    staff roles **and** `user.tenantId === pass.unit.building.tenantId`)
    (decision #2) — otherwise `ForbiddenException`; then set
    `isRevoked: true, revokedAt: now, revokedById: user.id`.
- In [access-control.controller.ts](../backend/src/modules/access-control/access-control.controller.ts):
  - `GET /access/units/:unitId/guest-passes`.
  - `GET /access/tenant/:tenantId/guest-passes`, `@Roles(HOA_ADMIN,
    HOA_CHAIRMAN, DISPATCHER, SECURITY, SUPERADMIN)`.
  - `PATCH /access/guest-passes/:id/revoke` — no `@Roles` restriction at
    the controller level (a resident revoking their own pass is a valid
    caller too) — all authorization happens inside `revokeGuestPass`
    itself, same pattern this module already uses for `openBarrier`.

**Tests:** extend `access-control.service.spec.ts` —
- `computeGuestPassStatus` precedence: a revoked-and-expired pass
  reports `REVOKED` (not `EXPIRED`) — proves the precedence order, not
  just that each state works in isolation.
- A resident can list/see only their own unit's passes; a resident with
  no verified ownership on the target unit is rejected (IDOR).
- Staff can revoke any pass in their tenant; a staff member from a
  different tenant is rejected; a resident can revoke their own pass but
  not another resident's pass for the same unit.
- Revoking an already-revoked pass throws (idempotency).
- `revokedById` surviving a `null` actor (deleted/deactivated revoker)
  doesn't crash the list query — same class of test
  [Task 0041](0041-staff-audit-trail.md) ran for its own nullable actor
  field.

## Subtask B — Mobile: history + revoke UI

- `mobile/src/api/access.ts`: add `getUnitGuestPasses(unitId)`,
  `getTenantGuestPasses(tenantId)`, `revokeGuestPass(id)`.
- [AccessScreen.tsx](../mobile/src/screens/access/AccessScreen.tsx):
  below the existing guest-pass issuance form, add a compact history
  list for the resident's own unit — status badge (color per status),
  guest name/plate, valid-from/to, and a "Отозвать" button on `ACTIVE`
  passes only (calls the new revoke endpoint, refetches the list).
- [StaffGuestPassScreen.tsx](../mobile/src/screens/staff/StaffGuestPassScreen.tsx):
  same list treatment, tenant-wide, with the creator's name/role and
  unit shown per row, revoke available on any `ACTIVE` pass per
  decision #2.
- Full kk/ru/en i18n parity for all new text (status labels, revoke
  button/confirmation, empty state).

---

## Acceptance criteria

- `status` precedence (`REVOKED` > `USED` > `EXPIRED` > `ACTIVE`) is
  computed once server-side and consumed as-is by both mobile screens.
- A resident can only see/revoke their own unit's/own-created passes;
  staff can see/revoke any pass in their own tenant; cross-tenant staff
  access is rejected.
- Revoking an already-revoked pass is rejected, not silently accepted.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in `backend/`
  and `mobile/`; full kk/ru/en i18n parity maintained.

## Explicitly out of scope

- Actually validating/redeeming a guest pass at a physical access point
  — per this task's own context section, that consumer doesn't exist
  yet; this task only adds record-keeping and cancellation around the
  existing issuance flow.
- `AuditLogService` integration for revocation — decision #5, a
  deliberate, separate follow-up.
- Any web UI — decision #1.
- Changing `createGuestPass`'s existing issuance behavior, role checks,
  or access-code generation — untouched by this task.

## Deliverable

- Backend and mobile can ship as separate commits.
- PR description states plainly (per the context section) that this
  task adds history/cancellation record-keeping, not a live
  entry-blocking control, since no redemption flow exists yet to block.

---

## Review addendum (2026-09-11) — accepted, no issues found

**Verified good:** `computeGuestPassStatus`'s precedence is directly
proven by tests covering every overlap (revoked+expired → `REVOKED`,
revoked+used → `REVOKED`, used+expired → `USED`), not just the four
states in isolation. `revokeGuestPass`'s authorization exactly matches
decision #2 (`isCreator || isSuperAdmin || (isStaff && sameTenant)`),
with dedicated tests for a co-resident being rejected and a
cross-tenant staff member being rejected. The already-revoked
idempotency guard and not-found case are both tested. The nullable
`revokedBy` relation is verified not to crash the tenant-history query
when null — same discipline Task 0041 established for its own nullable
actor field. Schema correctly disambiguates the two `User`↔`GuestPass`
relations with named relations. Mobile: both screens gate the revoke
button to `ACTIVE` passes only, wrap the action in a destructive-styled
confirmation dialog before calling the API, and refetch the list on
success — a reasonable, safe UX for an irreversible action.
  task adds history/cancellation record-keeping, not a live
  entry-blocking control, since no redemption flow exists yet to block.
