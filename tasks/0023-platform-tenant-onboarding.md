# Task 0023: Platform admin — onboard new ЖК + first HOA_ADMIN account

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Confirmed while answering a product question: `SUPERADMIN` (platform
operator, e.g. Shanyraq's own ops team) and `HOA_ADMIN` (a specific ЖК's
management company) are already correctly modeled as distinct roles at
different scopes — `assertUserBelongsToTenant`
([tenant.guard.ts](../backend/src/common/guards/tenant.guard.ts)) and
`TenantGuard` both let `SUPERADMIN` bypass tenant scoping entirely, so
this is not a schema/role redesign. The actual gap: **there is no way,
through the API or the web dashboard, for a SUPERADMIN to onboard a new
ЖК with its first `HOA_ADMIN` account.**
[`createTenant`](../backend/src/modules/properties/properties.service.ts)
(`POST /properties/tenants`) creates only a bare `Tenant` row — no user,
no staff account, nothing else. The *only* place an `HOA_ADMIN` user has
ever been created is
[backend/prisma/seed.ts](../backend/prisma/seed.ts), which writes
`passwordHash` directly to the database with a hardcoded password
(`Shanyraq2026!`) — not reachable through the running application at all.
There is also no web-dashboard page for creating a tenant or a staff
account; `frontend-web` has zero references to `createTenant` anywhere.
This task closes that gap end-to-end: API + minimal SUPERADMIN-only UI.

### Architecture decisions already made — do not re-litigate

1. **No role/schema redesign for `SUPERADMIN`/`HOA_ADMIN` — they're
   already correct.** `SUPERADMIN` stays platform-wide
   (`tenantId: null`), `HOA_ADMIN`/`HOA_CHAIRMAN`/`DISPATCHER`/`SECURITY`
   stay scoped to exactly one `tenantId`. This task only adds the missing
   *provisioning* flow — creating tenants and staff accounts through the
   app instead of a seed script.
2. **Two separate calls, not one mega-endpoint.** Keep `POST
   /properties/tenants` (create the ЖК) as-is, and add a **new**
   endpoint to create a staff member *for an existing tenant* — this
   mirrors normal REST parent/child resource conventions and, more
   importantly, means the same endpoint is reused later whenever a
   SUPERADMIN needs to add a second `HOA_ADMIN`, a `DISPATCHER`, or a
   `SECURITY` account to an already-onboarded ЖК — not just at initial
   setup.
3. **Temporary password, returned once, forced rotation on first
   login.** No email/SMS delivery pipeline for credentials — that's a
   separate infra concern and out of scope. Instead: generate a
   cryptographically random temporary password
   (`crypto.randomBytes(...)`, not `Math.random`), hash it with `bcrypt`
   exactly like existing `passwordHash` usage, and return the **plaintext
   temp password in the SUPERADMIN's API response body, exactly once** —
   it is never logged, never persisted in plaintext, and not retrievable
   again after this response. The SUPERADMIN relays it to the real staff
   member out-of-band (phone call, in person, whatever channel their
   business process already uses) — same pragmatic pattern most admin
   panels use for provisioning an account nobody can self-register into.
4. **Forced password change reuses the existing JWT `type` field, not a
   new guard mechanism.** `JwtPayload.type` already distinguishes
   `'access'`/`'refresh'`
   ([jwt.strategy.ts](../backend/src/modules/auth/jwt.strategy.ts)), and
   `JwtStrategy.validate` already rejects anything that isn't `'access'`
   for normal endpoints. Add a third value, `'password_change'`, minted
   only by the temp-password login path and accepted only by the new
   set-password endpoint — this gets you "this token can only be used for
   one thing" for free, no new guard needed.
5. **`mustChangePassword` is a plain boolean column, not a separate
   table/state machine.** Add `mustChangePassword Boolean @default(false)`
   to `User` via a normal Prisma migration.

---

## Subtask A — Schema + `loginWithPassword` enforcement

- Migration: add `User.mustChangePassword Boolean @default(false)`.
- In `AuthService.loginWithPassword`
  ([auth.service.ts:411](../backend/src/modules/auth/auth.service.ts)),
  after password verification succeeds: if `user.mustChangePassword` is
  `true`, do **not** call the normal `generateTokens` path. Instead mint a
  short-lived (e.g. 10 minutes) single-purpose token with `type:
  'password_change'`, and return `{ mustChangePassword: true,
  changePasswordToken: '...' }` instead of the normal `{ user,
  accessToken, refreshToken }` shape. The existing brute-force lockout
  from [Task 0019](0019-security-hardening.md) still applies before this
  check — don't bypass it.

## Subtask B — `POST /auth/set-initial-password`

- New endpoint, no `JwtAuthGuard` (the caller doesn't have a normal
  access token yet) — instead validate the `changePasswordToken` manually
  inside the service (verify signature + `type === 'password_change'`,
  same secret as access tokens or a dedicated one, your call).
- Body: `{ changePasswordToken, newPassword }`. Validate `newPassword`
  with a real minimum-strength rule (e.g. `@MinLength(8)` plus your
  judgment on whether to require mixed character classes — check if any
  password policy convention already exists elsewhere in this codebase
  before inventing one; if none exists, a straightforward length
  requirement is fine, don't over-engineer this).
- On success: update `passwordHash`, set `mustChangePassword: false`,
  **bump `tokenVersion`** (same revocation mechanism already used
  elsewhere in this codebase — invalidates the temp-password-era token
  family), then issue normal tokens via the existing `generateTokens` and
  return the standard `{ user, accessToken, refreshToken }` shape.

**Tests for A+B:** login with `mustChangePassword: true` returns the
change-password shape, not tokens; the `changePasswordToken` cannot be
used against any normal `JwtAuthGuard`-protected endpoint (proves reuse
of the existing `type !== 'access'` rejection); `set-initial-password`
with a valid token succeeds and subsequent login with the new password
works; an old token minted before the password change is rejected
(`tokenVersion` mismatch) — mirrors the existing `AUTH.SESSION_REVOKED`
test pattern already used for other flows in `auth.service.spec.ts`.

## Subtask C — `POST /properties/tenants/:tenantId/staff`

- New endpoint in `properties.controller.ts`, `@Roles(UserRole.SUPERADMIN)`
  only.
- Body: `firstName`, `lastName`, `phone` (and optionally `email`), `role`
  — validated as one of `HOA_ADMIN | HOA_CHAIRMAN | DISPATCHER |
  SECURITY` only (reject `RESIDENT_OWNER`/`RESIDENT_TENANT`/`SUPERADMIN`
  here with a clear validation error — residents self-register through
  the existing OTP flow, and a second SUPERADMIN, if ever needed, is a
  DB-level operation, not something this tenant-scoped endpoint should
  create).
- Service method: verify the tenant exists
  (`PROPERTIES.COMPLEX_NOT_FOUND` if not, matching existing error-code
  conventions from [Task 0016](0016-error-codes-properties-finance-meters.md)),
  generate the temp password (decision #3), create the `User` with
  `tenantId` set to the target tenant, `mustChangePassword: true`, hashed
  password.
- Response: the created user's non-sensitive fields **plus the plaintext
  temp password, once**.

**Test:** creating a staff member for a tenant that doesn't exist 404s
with the right code; creating one with an invalid `role` value (e.g.
`RESIDENT_OWNER`) is rejected; a successful create returns a temp
password that actually verifies against the stored `bcrypt` hash; the
created user has `tenantId` correctly set and `mustChangePassword: true`.

## Subtask D — Minimal web UI (SUPERADMIN only)

- A new page under `frontend-web/src/app/dashboard/` (e.g. `platform/` or
  `tenants/` — your call on naming, check nothing already claims that
  route) visible only when `user.role === 'SUPERADMIN'`, matching the
  existing role-gating convention (e.g. `canWrite` pattern in
  `finance/tariffs/page.tsx`) — hide the nav entry entirely for every
  other role, don't just disable it.
- List existing tenants (reuse `GET /properties/tenants`, already used
  elsewhere).
- A "Создать ЖК" form calling the existing `createTenant` endpoint.
- Per-tenant, a "Добавить сотрудника" form calling the new Subtask C
  endpoint. On success, show the returned temp password in a clearly
  one-time, dismissible UI element with an explicit warning that it won't
  be shown again — don't silently let it scroll away or get lost in a
  toast that auto-dismisses in 3 seconds.
- Add any new labels via `t()` with full kk/ru/en parity, matching every
  prior task's i18n convention.

---

## Acceptance criteria

- A SUPERADMIN can, entirely through the running application (API or
  UI), create a new ЖК and its first `HOA_ADMIN` account, and that
  account can log in and immediately be forced through a password-change
  step before getting normal access.
- `mustChangePassword` is enforced — a temp-password login cannot reach
  any protected endpoint without first calling `set-initial-password`.
- The new staff-creation endpoint rejects resident/superadmin roles.
- `backend/prisma/seed.ts` can stay as-is for local dev convenience — this
  task doesn't need to remove it, just stop being the *only* way this
  works.
- All existing backend tests pass; new tests cover the flows above.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in all three
  apps (mobile untouched, but still verify).
- Full kk/ru/en i18n parity for any new web UI text.

## Explicitly out of scope

- Email/SMS delivery of the temporary password — see decision #3.
- A general "forgot password" / self-service reset flow for staff — this
  task only covers the *initial* provisioning password, not ongoing
  password recovery. That's a reasonable follow-up if wanted later, but a
  different problem (proving who you are without already having a valid
  session) — don't conflate the two.
- Any mobile-app changes — this is exclusively a SUPERADMIN/staff-facing
  provisioning flow, and per the mobile-vs-web parity gap already noted
  in [PROGRESS.md](PROGRESS.md), staff tooling lives on web only today.
- Editing/deactivating existing staff accounts, changing a staff member's
  role after creation, or removing a tenant — this task is scoped to
  *creation* only.
- Password complexity policy beyond a basic minimum length — see
  Subtask B's note.

## Deliverable

- Can ship as separate commits (backend auth changes, backend tenant/staff
  endpoint, web UI) or one PR — your call.
- PR description should include a short manual walkthrough: create a
  tenant, create its HOA_ADMIN, log in with the temp password, get forced
  through set-initial-password, log in again normally.

---

## Review addendum (2026-09-10) — core flow accepted, one out-of-scope change found

**Verified good — accepted:** `mustChangePassword` schema field, the
`password_change` JWT type reusing `JwtStrategy`'s existing
`type !== 'access'` rejection (confirmed unchanged — this correctly
blocks the change-password token from every normal protected endpoint),
`loginWithPassword`'s branch returning `{ mustChangePassword,
changePasswordToken }` instead of tokens, `setInitialPassword`'s full
verification chain (token validity → type → user active → tokenVersion
match) plus the `tokenVersion: { increment: 1 }` bump that correctly
invalidates the temp-password-era token family. `createStaff` correctly
scopes to the four staff roles only (`@IsIn` at the DTO layer +
server-side re-check), generates the temp password via
`crypto.randomBytes(8)` (not `Math.random`), returns it exactly once,
and a test proves via `bcrypt.compare` that the returned plaintext
actually matches the stored hash — not just that both fields exist. The
web UI (`dashboard/tenants/page.tsx`) is correctly gated both at the page
level and in the nav-item filter (`item.roles.includes(user.role)`,
confirmed this is actually enforced, not just declared), and the
one-time temp-password modal has a persistent warning and no
auto-dismiss, exactly as scoped. 288/288 backend tests pass, `tsc
--noEmit` clean in backend and frontend-web, full kk/ru/en i18n parity
(928/928/928 web keys).

**Found — out of scope, needs a decision:** `auth.service.ts`'s
`requestOtp` had its `devCode` exposure condition changed from
`process.env.NODE_ENV === 'test'` to `process.env.NODE_ENV !== 'production'`,
widening OTP-code exposure in the API response to cover development
(and any unset/staging) environments too, not just automated tests. This
is unrelated to this task's actual scope (temp-password staff
provisioning doesn't touch the OTP flow at all) and isn't mentioned or
justified anywhere in the diff or task notes. Widening this is a real
security-relevant change — if any shared "staging" deployment ever runs
with `NODE_ENV=development` or unset (common), this exposes real
resident phone OTP codes in the login-request response, enabling account
takeover for any phone number someone chooses to target on that
environment.

**Required fix:** revert `devCode` back to `process.env.NODE_ENV === 'test'`
unless there's a genuine, separately-justified reason for the wider
exposure — if so, raise that as its own explicit decision (with the
tradeoff stated) rather than folding it silently into this task's diff.

**Fix verified (2026-09-10):** `devCode` reverted to
`process.env.NODE_ENV === 'test' ? code : undefined` exactly. 288/288
backend tests pass, `tsc --noEmit` clean. Task fully accepted.
