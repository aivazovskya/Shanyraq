# Task 0087: Cross-tenant BOLA via unverified ownership claim + permanent grant after rejection

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Found during a full security audit of `backend/src/modules/**` (2026-09-21),
using the same methodology that found [Task 0086](0086-auth-me-password-hash-leak.md).
Two related, confirmed bugs in the ownership-claim flow.

### Bug A — `User.tenantId` is granted before HOA verification, and 3 resident-facing
endpoints trust it instead of checking verified ownership

**Confirmed by reading
[properties.service.ts:402-471](../backend/src/modules/properties/properties.service.ts#L402-L471)**,
`claimOwnership()`:

```ts
// Attach tenant to user if not yet attached
await this.prisma.user.update({
  where: { id: userId },
  data: { tenantId: unit.building.tenantId },
});

return this.prisma.unitOwnership.create({
  data: {
    userId,
    unitId: dto.unitId,
    ...
    isVerified: false, // Requires HOA admin / dispatcher approval
  },
});
```

`User.tenantId` is set **immediately on claim submission** — before any
HOA/dispatcher review. `UnitOwnershipDto.unitId` is just a string the client
supplies (see
[properties.dto.ts:51-72](../backend/src/modules/properties/dto/properties.dto.ts#L51-L72)) —
no proof of residency is checked at claim time, only at verification time.
`GET /properties/tenants` and `GET /properties/tenants/:id/structure` are
intentionally open to any authenticated user (needed for onboarding — picking
your building/unit before you have a tenant), so any self-registered resident
(registration itself needs only a phone number via SMS-OTP, see
[Task 0001](0001-security-hardening.md)) can enumerate a real `unitId` in
**any** HOA complex on the platform and claim it.

Because
[jwt.strategy.ts:36-76](../backend/src/modules/auth/jwt.strategy.ts#L36-L76)
does a **live Prisma lookup of `User` on every request**, the new `tenantId`
is visible to every subsequent API call immediately — no re-login needed.

This alone would be fine if every tenant-scoped read the resident could then
reach required *verified* ownership. Most do, via
`assertAccessToTenant()` ([tenant.guard.ts:37-82](../backend/src/common/guards/tenant.guard.ts#L37-L82)),
which for non-staff roles requires a `UnitOwnership` row with `isVerified: true`
before returning `true`/allowing the request. But three resident-reachable
endpoints instead use the weaker `assertUserBelongsToTenant()`
([tenant.guard.ts:8-23](../backend/src/common/guards/tenant.guard.ts#L8-L23)),
which only compares the raw `user.tenantId` column — **no verified-ownership
check at all**:

1. [votings.controller.ts:21-27](../backend/src/modules/votings/votings.controller.ts#L21-L27) —
   `GET /votings/tenant/:tenantId` (no `@Roles`, reachable by any
   authenticated role that passes `RolesGuard`, i.e. residents too).
2. [announcements.controller.ts:18-26](../backend/src/modules/announcements/announcements.controller.ts#L18-L26) —
   `GET /announcements/tenant/:tenantId` (same — no `@Roles`).
3. [search.service.ts:44-49](../backend/src/modules/search/search.service.ts#L44-L49) —
   `GET /search/tenants/:tenantId`, and note
   [search.controller.ts](../backend/src/modules/search/search.controller.ts)
   has **no `RolesGuard`/`@Roles` at all**, only `JwtAuthGuard`. The account
   sub-search is separately gated to staff roles inside the service
   (`canViewAccounts`, line 122), but the **resident/request search is not** —
   any authenticated user whose raw `tenantId` matches gets residents'
   full names + phone numbers and service-request titles for that
   whole complex.

**Concrete exploit**: attacker registers an account, claims a unit in a
target HOA they have no relationship to, and immediately (before any HOA
staff looks at the claim):
- `GET /votings/tenant/:targetTenantId` → reads OSS meeting agendas and
  live quorum for a complex they don't live in.
- `GET /search/tenants/:targetTenantId?q=а` → reads real residents' full
  names + phone numbers, and service-request titles, for that complex.

Not exploitable for **write** actions — `castVote()`
([votings.service.ts](../backend/src/modules/votings/votings.service.ts))
independently re-checks verified `RESIDENT_OWNER` ownership before accepting
a vote, so this is information disclosure, not vote forgery.

### Bug B — rejecting a claim never revokes the `tenantId` grant

**Confirmed by reading
[properties.service.ts:530-549](../backend/src/modules/properties/properties.service.ts#L530-L549)**,
`verifyOwnership()` on rejection:

```ts
if (!dto.isVerified) {
  // При отклонении заявки удаляем ее из очереди, освобождая возможность повторной подачи
  await this.prisma.unitOwnership.delete({
    where: { id: ownershipId },
  });
  ...
  return { id: ownershipId, isVerified: false, status: 'REJECTED' };
}
```

The `UnitOwnership` row is deleted, but `User.tenantId` (set by Bug A) is
**never reset**. An HOA admin explicitly rejecting a bogus claim does not
revoke the access it granted — the attacker keeps `tenantId` (and therefore
keeps hitting Bug A's endpoints) indefinitely, even after the human review
that was supposed to be the actual gate.

## Architecture decisions — do not re-litigate

1. **Do not remove the early `tenantId` assignment in `claimOwnership`.**
   The mobile onboarding flow
   ([ClaimUnitScreen.tsx:79-102](../mobile/src/screens/onboarding/ClaimUnitScreen.tsx#L79-L102))
   calls `refreshProfile()` right after submitting a claim and expects the
   profile to already reflect the pending tenant so the "Pending
   Verification" screen can render. Reworking that into a separate
   "pending tenant" field is a bigger refactor than this bug needs — fix
   the endpoints that read `tenantId` without checking verification
   instead (narrower blast radius, matches this codebase's established
   "explicit, not magic" convention — see [Task 0041](0041-staff-audit-trail.md)
   decision #5 and [Task 0086](0086-auth-me-password-hash-leak.md) for the
   same reasoning applied elsewhere).
2. **Fix the 3 call sites, not `assertUserBelongsToTenant` itself.**
   `assertUserBelongsToTenant` is also used by staff-only endpoints
   (finance, audit-log, shift-handover) where it's safe today because
   staff `tenantId` isn't attacker-controllable the way a resident's is
   via Bug A. Changing its semantics globally would be a much larger
   change for no benefit — switch the three resident-reachable call sites
   to `assertAccessToTenant` instead, matching what `bookings.service.ts`,
   `community-board.service.ts`, and `chat.service.ts` already do.

## Subtask A — Close the read-exposure (votings, announcements, search)

- `votings.controller.ts`'s `getMeetingsByTenant` and
  `announcements.controller.ts`'s tenant-list endpoint: switch from
  `assertUserBelongsToTenant(user, tenantId, ...)` to
  `await assertAccessToTenant(this.prisma, user, tenantId, { authRequired,
  staffForbidden, residentForbidden })` — follow the exact call pattern
  already used in `bookings.controller.ts` / `bookings.service.ts` (inject
  `PrismaService` where not already available, define the three
  `TenantAccessErrorCodes` with module-appropriate machine-readable
  `code`/`message`, consistent with this codebase's error-code convention
  from [Task 0014](0014-backend-error-codes.md)).
- `search.service.ts`'s `search()`: same swap, `await assertAccessToTenant(...)`
  in place of the current `assertUserBelongsToTenant(...)` at line 49.
  `SearchController` currently has no `RolesGuard` — leave it without
  `@Roles` (search is meant to be usable by residents too, per its own
  internal `canViewAccounts` staff-only carve-out for the accounts
  sub-result), the fix is entirely in the verified-ownership check.

**Tests**: extend the relevant `*.controller.spec.ts` / `*.service.spec.ts`
for all three — a resident with `tenantId` set but no verified
`UnitOwnership` in that tenant gets `403 Forbidden`; a resident with a
verified `UnitOwnership` still gets `200`; staff and `SUPERADMIN` behavior
unchanged (regression check).

## Subtask B — Revoke the grant on rejection

- In `verifyOwnership()`'s rejection branch
  (`properties.service.ts:530-549`), before/alongside the `unitOwnership.delete`:
  check whether the rejected claim's `userId` has any **other**
  `UnitOwnership` row (verified or still-pending) in the same tenant
  (i.e. any other unit under `record.unit.building.tenantId`). If not,
  reset that user's `tenantId` to `null` in the same operation (wrap in
  `prisma.$transaction` alongside the delete, so a crash between the two
  can't leave the grant standing without a claim to justify it).
  If the user *does* have another ownership row in that same tenant
  (e.g. a second pending/verified claim on a different unit), leave
  `tenantId` untouched — it's still justified.

**Tests**: extend `properties.service.spec.ts` — rejecting a resident's
only claim in a tenant resets `user.tenantId` to `null`; rejecting one of
two claims in the same tenant (the other still pending/verified) leaves
`tenantId` unchanged; approving a claim behaves exactly as before
(no regression).

## Acceptance criteria

- A resident whose only ownership claim was rejected (or never verified)
  cannot read `GET /votings/tenant/:id`, `GET /announcements/tenant/:id`,
  or `GET /search/tenants/:id` for that tenant — `403`, proven by a test
  asserting the actual status code/error code, not just a manual check.
- A resident with a *verified* `UnitOwnership` continues to see all three
  exactly as today — no regression for the legitimate path.
- Rejecting a claim resets `tenantId` to `null` when it was the user's
  only claim in that tenant, proven by a dedicated test.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in `backend/`.

## Explicitly out of scope

- Removing the early `tenantId` assignment in `claimOwnership` itself —
  see architecture decision #1.
- Changing `assertUserBelongsToTenant`'s semantics or its staff-only call
  sites (finance, audit-log, shift-handover, etc.) — see decision #2.
- Any change to `castVote`'s existing independent verified-ownership
  check — it's already correct and out of scope.
- Adding a global cross-cutting "verified tenant" guard/decorator to
  replace per-endpoint checks — the two fixes here are narrow and
  targeted, matching this codebase's established convention (see
  [Task 0086](0086-auth-me-password-hash-leak.md)'s identical reasoning
  for not introducing a global `ClassSerializerInterceptor`).

## Deliverable

- Single backend commit covering Subtasks A and B.
- PR description confirms: (1) the three endpoints now 403 for
  tenant-attached-but-unverified residents, with the exact test names;
  (2) rejection now resets `tenantId` when appropriate, with the exact
  test name; (3) no regression for verified residents or staff/SUPERADMIN.
