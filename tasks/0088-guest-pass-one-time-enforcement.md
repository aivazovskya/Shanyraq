# Task 0088: Guest pass "one-time use" is unenforced — no redemption endpoint exists

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Found during a full audit sweep cross-checking [PRODUCT_SPEC.md](PRODUCT_SPEC.md)
section 3.3 ("временный QR-код или временный код для шлагбаума/домофона —
**с ограничением по времени действия**") against the actual guest-pass
implementation. [PROGRESS.md](PROGRESS.md) currently claims this row is
fully "✅ уже реализовано" — that's overstated.

**Confirmed by reading the schema and every call site of the relevant
field:**

[schema.prisma:436-447](../backend/prisma/schema.prisma#L436-L447):

```prisma
model GuestPass {
  ...
  accessCode       String            // Одноразовый 6-значный PIN или UUID для QR-кода
  qrCodeUrl        String?           // Ссылка на QR-код пропуска
  validFrom        DateTime
  validTo          DateTime
  isUsed           Boolean           @default(false)
  isRevoked        Boolean           @default(false)
  ...
}
```

The schema's own comment calls `accessCode` "Одноразовый" (one-time-use),
and there's an `isUsed` field to back that up. But **`isUsed` is never set
to `true` anywhere in the codebase outside of test fixtures** — confirmed
by grepping every reference to `isUsed` in `backend/src`: the only
production write to a `GuestPass` row is
[`revokeGuestPass`](../backend/src/modules/access-control/access-control.service.ts#L949-L1005),
which sets `isRevoked`/`revokedAt`/`revokedById`, never `isUsed`. Every
other hit is either the read in
[`computeGuestPassStatus`](../backend/src/modules/access-control/access-control.service.ts#L837-L852)
(display-only status: `EXPIRED` if `validTo` has passed, `USED` if
`isUsed`, `REVOKED` if `isRevoked`, else `ACTIVE`) or a hardcoded value in
`access-control.service.spec.ts` test mocks.

**There is no redemption/validation endpoint at all.**
[access-control.controller.ts](../backend/src/modules/access-control/access-control.controller.ts)
only exposes `POST /access/guest-pass` (create),
`GET /access/units/:unitId/guest-passes` and
`GET /access/tenant/:tenantId/guest-passes` (list),
`GET .../guest-passes/export` (CSV), and
`PATCH /access/guest-passes/:id/revoke` (revoke). Nothing accepts an
`accessCode` and checks it against `validFrom`/`validTo`/`isRevoked`/
`isUsed`, and nothing marks a pass as consumed.
[`openBarrier()`](../backend/src/modules/access-control/access-control.service.ts#L542)
takes no guest-pass parameter either — it's resident/staff-JWT-only, by
design (confirmed correct and unrelated — see decision #2 below).
`mobile/src/api/access.ts` mirrors the same 4 operations (create, list,
revoke) — no redeem call exists client-side either.

**Practical effect**: once a guest pass is created and shared (the mobile
`StaffGuestPassScreen.tsx` builds a share message containing the raw
`accessCode`, line 220), it stays `ACTIVE`-status forever until
`validTo` — it can be shown and reused an unlimited number of times within
that window, by anyone who has the code (not just the intended one-time
guest), and no one (staff or system) has a way to mark it consumed after
the first legitimate use. The `validTo` time-box is enforced only as a
*display* status for staff eyeballing the list in
`StaffGuestPassScreen`/the web guest-pass viewer — nothing prevents use
past that point either, since there's no gate that ever checks the code.

## Architecture decisions — do not re-litigate

1. **Scope this to a staff-side manual redemption action, not automated
   barrier/domofon integration.** Per [PRODUCT_SPEC.md](PRODUCT_SPEC.md)
   section 5.4, the actual СКУД/domofon hardware integration is
   "уточняется индивидуально по каждому ЖК" — there's no generic device
   API to hook a guest-code check into yet (the only working adapter is
   `HikvisionIsapiAdapter` for the resident door, unrelated to gate/guest
   flow). The realistic, buildable fix for this pilot is: security staff
   sees the guest at the gate, opens `StaffGuestPassScreen`/the web
   equivalent, taps "confirm entry" (which validates the code server-side
   and marks it used), then manually operates the barrier as they already
   do today. This matches how `revokeGuestPass` already works (a manual
   staff action, not a hardware trigger) — same pattern, new action.
2. **Do not touch `openBarrier()` or PIN/2FA flows** — guest entry is a
   separate, staff-mediated path by design (guests don't have app
   accounts), unrelated to the resident 2FA/PIN barrier-open flow from
   [Task 0002](0002-barrier-2fa-pin.md).
3. **One redemption per pass**, matching the schema's existing "Одноразовый"
   intent — once `isUsed` is set, redeeming again returns a clear
   "already used" error, same pattern as `revokeGuestPass`'s existing
   `GUEST_PASS_ALREADY_REVOKED` check.

## Subtask A — Backend: redemption endpoint

- New method in `access-control.service.ts`, e.g. `redeemGuestPass(passId,
  accessCode, user)`:
  - Look up the pass by `passId` (or by `accessCode` if that's a better
    fit for a QR-scan flow — pick whichever the staff UI in Subtask B
    actually needs and justify the choice in the PR description).
  - Reject with a machine-readable error (matching the
    [Task 0014](0014-backend-error-codes.md) `{ code, message }` convention,
    consistent with `GUEST_PASS_NOT_FOUND`/`GUEST_PASS_ALREADY_REVOKED`
    already in this file) if: not found, `isRevoked`, `isUsed`,
    `now < validFrom`, or `now > validTo` — one distinct code per reason,
    e.g. `GUEST_PASS_EXPIRED`, `GUEST_PASS_ALREADY_USED`,
    `GUEST_PASS_NOT_YET_VALID`, `GUEST_PASS_REVOKED`.
  - Authorization: same `isAuthorizedStaff` check already used in
    `revokeGuestPass` (staff of the pass's own tenant, or SUPERADMIN) —
    reuse that logic rather than duplicating it (extract a small shared
    helper if that's cleaner, but don't over-engineer a generic
    permission framework for one reuse).
  - On success: `prisma.guestPass.update({ isUsed: true, usedAt: new
    Date() })` — add a `usedAt DateTime?` column to `GuestPass` in
    `schema.prisma` (mirrors `revokedAt`) and a migration, so there's an
    audit trail of *when* entry happened, not just a boolean flip.
  - Write an `AuditLogService.log()` entry (`action: 'GUEST_PASS_REDEEMED'`)
    matching the existing pattern for `createGuestPass`/`revokeGuestPass`
    in this same file.
- New controller route, e.g. `PATCH /access/guest-passes/:id/redeem`,
  same guard/role setup as the existing `revoke` route.

**Tests:** extend `access-control.service.spec.ts` — successful redemption
sets `isUsed`/`usedAt` and writes an audit log; redeeming an already-used,
revoked, expired, or not-yet-valid pass throws the correct specific error
code and does not mutate the row; cross-tenant staff gets `403`, matching
`revokeGuestPass`'s existing authorization tests as a template.

## Subtask B — Staff UI (mobile + web)

- Mobile: `StaffGuestPassScreen.tsx` — add a "подтвердить вход"/confirm-entry
  action per listed pass (next to the existing revoke action), calling the
  new API method (add `redeemGuestPass` to `mobile/src/api/access.ts`
  alongside `revokeGuestPass`). Reflect the resulting `USED` status via
  the existing `computeGuestPassStatus`-driven badge — no new status enum
  needed, it already has a `USED` case, it just never gets set today.
- Web: locate the equivalent guest-pass viewer under `frontend-web/src/app`
  (used by [Task 0028](0028-guest-pass-staff-issuance.md)/
  [Task 0029](0029-mobile-access-log-and-guest-pass.md)) and add the same
  action there for parity, matching this codebase's established practice
  of shipping staff actions to both clients (see every prior guest-pass
  task).
- i18n: add the new action's strings to all three locales (ru/kk/en),
  maintaining 100% key parity per this project's established convention
  ([Task 0004](0004-i18n-foundation.md)/[Task 0005](0005-i18n-remaining-screens.md)).

## Acceptance criteria

- A guest pass can be redeemed exactly once by authorized staff; a second
  redemption attempt fails with a distinct "already used" error, proven
  by a test.
- Redeeming an expired, not-yet-valid, or revoked pass fails with the
  correct specific error code, proven by tests for each case.
- Redemption is tenant-isolated (cross-tenant staff gets 403), proven by
  a test mirroring `revokeGuestPass`'s existing coverage.
- Staff can trigger redemption from both the mobile and web guest-pass
  views, with the resulting `USED` status visible immediately.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in `backend/`,
  `frontend-web/`, and `mobile/`; i18n key parity maintained across
  ru/kk/en in both clients.

## Explicitly out of scope

- Any automated hardware/barrier integration triggered by guest-code
  entry — see architecture decision #1; this is a manual staff
  confirmation action, matching how `revokeGuestPass` already works.
- QR-code scanning UI/camera integration — if `qrCodeUrl` scanning is
  wanted as the redemption trigger (vs. staff tapping a list row), that's
  a separate, larger UI task; this task only needs the redemption to be
  *possible* from the existing list view.
- Changing `openBarrier()`/resident 2FA-PIN flow — unrelated, see decision #2.

## Deliverable

- Single backend commit (schema migration + service + controller + tests)
  and one commit per frontend client (mobile, web), or a combined PR if
  the team prefers — follow this project's existing convention from
  similar full-stack guest-pass tasks (0028/0029).
- PR description confirms: exact new error codes, the redemption test
  names, and that both staff UIs were manually verified to show `USED`
  status immediately after redemption.
