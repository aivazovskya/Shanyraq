# Task 0028: Backend fix — staff can't issue guest passes at all

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Discovered while scoping the mobile access-control task (originally
planned as "Task 0028: mobile points/cameras/guest passes"): a real
backend bug blocks a natural front-desk workflow, on **every platform**,
not just mobile. `AccessControlService.createGuestPass`
([access-control.service.ts:699](../backend/src/modules/access-control/access-control.service.ts))
requires a verified `UnitOwnership` on the target `unitId` for **every
role except `SUPERADMIN`**:

```ts
if (user.role !== UserRole.SUPERADMIN) {
  const ownership = await this.prisma.unitOwnership.findFirst({
    where: { userId: user.id, unitId: dto.unitId, isVerified: true },
  });
  if (!ownership) throw ACCESS_CONTROL.GUEST_PASS_OWN_UNIT_ONLY;
}
```

Staff accounts (`HOA_ADMIN`, `HOA_CHAIRMAN`, `DISPATCHER`, `SECURITY`)
never have a `UnitOwnership` — they're employees, not residents — so this
check makes it **structurally impossible** for any staff member to ever
successfully call this endpoint on behalf of a resident. A very ordinary
workflow — a resident calls the front desk and asks reception/security to
print a guest pass for a visitor — currently cannot be done by anyone
except a resident issuing their own pass, or `SUPERADMIN`. This isn't a
missing UI anywhere; the API itself rejects it. Fix the authorization
logic; no UI work in this task (mobile UI for this becomes possible after,
as a follow-up task once this is fixed).

### Architecture decisions already made — do not re-litigate

1. **Resident behavior is unchanged — this is additive, not a
   loosening of the existing IDOR protection.** The existing check
   (`ACCESS_CONTROL.GUEST_PASS_OWN_UNIT_ONLY`, a verified-ownership
   requirement) stays exactly as-is for `RESIDENT_OWNER`/`RESIDENT_TENANT`
   callers. Don't touch that branch.
2. **Staff of the target unit's own tenant can issue a pass for any unit
   in that tenant — no ownership check for them, a tenant-match check
   instead.** Treat `HOA_ADMIN`, `HOA_CHAIRMAN`, `DISPATCHER`, `SECURITY`
   as "staff" here (the same four-role grouping already used for general
   tenant-scoped access-control reads elsewhere in this service) — a
   staff member doesn't own the unit, so replace the ownership check for
   them with: look up the unit's `building.tenantId` and require it to
   match `user.tenantId` (SUPERADMIN still bypasses entirely, unchanged).
3. **New, distinct error code for the staff cross-tenant case — don't
   reuse `GUEST_PASS_OWN_UNIT_ONLY` for it.** That code's message talks
   about "your own confirmed apartment," which is the wrong message for a
   staff member who was rejected for a *tenant* mismatch, not an
   ownership mismatch. Add `ACCESS_CONTROL.GUEST_PASS_CROSS_TENANT_FORBIDDEN`
   with its own accurate message, following the `{ code, message }`
   convention from Tasks 0014–0018.

---

## Subtask A — Fix `createGuestPass`

- Branch on role: `RESIDENT_OWNER`/`RESIDENT_TENANT` keep the existing
  ownership check unchanged. `SUPERADMIN` keeps its existing bypass
  unchanged. For the four staff roles (decision #2): fetch the unit with
  its building's `tenantId`, throw `ACCESS_CONTROL.GUEST_PASS_CROSS_TENANT_FORBIDDEN`
  (decision #3) if it doesn't match `user.tenantId`, otherwise proceed.
- If `dto.unitId` doesn't resolve to a real unit at all, that should 404
  with a sensible existing-style code (check whether one already exists
  for "unit not found" in this module's error surface, or introduce
  `ACCESS_CONTROL.UNIT_NOT_FOUND` matching the `{ code, message }`
  convention if none exists) rather than falling through to a confusing
  ownership/tenant error.
- Add matching `errors.ACCESS_CONTROL.*` i18n keys (kk/ru/en, both apps)
  for the new code(s), same as every prior error-code task.

**Test:** a `DISPATCHER`/`HOA_ADMIN`/`SECURITY`/`HOA_CHAIRMAN` of Tenant A
can successfully create a guest pass for a unit in Tenant A they have no
ownership of; the same staff member attempting a unit in Tenant B is
rejected with the new cross-tenant code; a resident's existing
behavior (own-unit-only) is unchanged — re-run the existing tests for
this method and confirm none needed to change; `SUPERADMIN` unaffected.

---

## Acceptance criteria

- Staff of a tenant can issue a guest pass for any unit in that tenant.
- Staff attempting a different tenant's unit gets a clear, correctly-coded
  rejection, not the resident-oriented "own apartment" message.
- All existing tests for `createGuestPass` (resident own-unit success,
  resident foreign-unit rejection, SUPERADMIN bypass) still pass
  unmodified.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean.
- Full kk/ru/en i18n parity for the new error code(s).

## Explicitly out of scope

- Any mobile or web UI for staff-issued guest passes — this task is the
  backend fix only. A follow-up task (mobile access-control screen) can
  now build on this once it's confirmed working.
- Changing `openBarrier`, camera viewing, or access-point CRUD — none of
  those are affected by or related to this bug.
- Rate-limiting changes — the existing `@Throttle` on `POST
  /access/guest-pass` (10/min) already applies to everyone calling this
  endpoint, staff included, and doesn't need adjusting.

## Deliverable

- One commit or PR.
- PR description states the exact before/after behavior for a staff
  caller (currently: always rejected; after: allowed within their own
  tenant, rejected with a clear message for a different tenant).

---

## Review addendum (2026-09-10) — accepted, no issues found

**Verified good:** the resident (`else`) branch is confirmed byte-for-byte
unchanged — the existing `ACCESS_CONTROL.GUEST_PASS_OWN_UNIT_ONLY` check
and message untouched. `SUPERADMIN` branch unchanged (now an explicit
no-op branch with a comment rather than an implicit skip, which is
clearer, not just equivalent). The new staff branch correctly uses a
tenant-match check (not an ownership check) against all four staff roles,
with a genuinely distinct error code and message
(`GUEST_PASS_CROSS_TENANT_FORBIDDEN` — "for units in their own property
complex," not the resident-oriented "own confirmed apartment" text) —
confirmed accurately translated in both ru and en. A new
`ACCESS_CONTROL.UNIT_NOT_FOUND` 404 handles the previously-unhandled
case of a nonexistent `unitId`. Test suite (all new, since this method
had no prior coverage) exercises exactly the required matrix: 404 on
missing unit, all four staff roles succeeding within their own tenant,
staff rejected across tenants with the correct code, resident success
and rejection paths unchanged, SUPERADMIN bypass. 294/294 backend tests
pass, `tsc --noEmit` clean, full kk/ru/en parity (930/930/930 web,
718/718/718 mobile). Task accepted, no fixes required.
