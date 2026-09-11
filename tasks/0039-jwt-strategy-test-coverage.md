# Task 0039: Direct test coverage for JwtStrategy

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Continuation of [Task 0036](0036-guard-and-redis-test-coverage.md)'s
coverage-quality pass — same discipline (scope tightly to one
security-critical file, not a general sweep), different target. Ran
`npx jest --coverage` in `backend/` (2026-09-11):
[jwt.strategy.ts](../backend/src/modules/auth/jwt.strategy.ts) shows
**0% statements/branches/functions/lines** — no spec file exists for it
at all (confirmed via glob — the only `auth/*.spec.ts` is
`auth.service.spec.ts`, which mocks JWT verification entirely rather
than exercising this class).

This is arguably a bigger gap than Task 0036's `RolesGuard` — every
single authenticated request in the entire app passes through
`JwtStrategy.validate()` (it's the Passport strategy behind
`JwtAuthGuard`, used everywhere `@UseGuards(JwtAuthGuard)` appears).
Untested logic inside it currently includes:

1. **Token-type confusion defense** (`payload.type !== 'access'` →
   reject) — this is the exact mechanism
   [Task 0023](0023-platform-tenant-onboarding.md) relied on for its
   `password_change`-typed token to be automatically rejected by every
   normal endpoint "for free," described in that task's own review as
   working correctly — but never verified by a test of this class
   itself, only inferred from reading the code.
2. **Blocked/deleted-user rejection** (`!user || !user.isActive` →
   reject).
3. **Session-revocation via `tokenVersion` mismatch** (`payload.tokenVersion
   !== undefined && user.tokenVersion !== payload.tokenVersion` →
   reject) — the mechanism behind every "this session is no longer
   valid" flow in the app: password change
   ([Task 0023](0023-platform-tenant-onboarding.md)), PIN reset, and any
   future logout-everywhere feature all work by incrementing
   `User.tokenVersion` (confirmed live call sites in
   [auth.service.ts:597,673](../backend/src/modules/auth/auth.service.ts)) —
   if this comparison ever regresses (e.g. an accidental `||` instead of
   `&&`, or a dropped `undefined` check), revoked sessions would either
   silently stay valid (security hole) or every legitimate session would
   start failing (outage), and nothing today would catch either.
4. **Constructor fail-fast** if `JWT_ACCESS_SECRET` is unset — a
   deliberate crash-on-boot safeguard, currently unverified.

### Architecture decisions already made — do not re-litigate

1. **Scope is exactly this one file's direct tests — not a general
   coverage sweep, same as Task 0036's own scoping decision.**
   `properties.service.ts`/`bookings.service.ts`/`meters.service.ts`
   also have real branch-coverage gaps (54%/47%/43% respectively as of
   this task's own coverage run) but those are business-logic accuracy
   gaps, not "every request in the app passes through this" gaps — a
   separate task if pursued, don't fold them in here as a drive-by.
2. **Test `validate()` directly, not through a full HTTP request.**
   This project has no e2e/supertest infrastructure (confirmed in
   Task 0036) — call `strategy.validate(payload)` directly with a mocked
   `PrismaService`, the same unit-level approach every other spec file
   in this codebase already uses.
3. **Test the constructor's fail-fast behavior too, not just
   `validate()`.** The `JWT_ACCESS_SECRET`-missing throw happens at
   construction time, before `validate()` is ever called — it needs its
   own test constructing the class with a `ConfigService` mock returning
   `undefined`.
4. **Don't change `JwtStrategy`'s behavior.** This task adds tests for
   existing logic — if a test reveals what looks like a real bug while
   writing it, stop and flag it in the PR description rather than
   silently "fixing" security-critical auth code as a side effect of a
   coverage task.

---

## Subtask A — `JwtStrategy` direct tests

New `backend/src/modules/auth/jwt.strategy.spec.ts`:

- **Constructor**: throws synchronously when `ConfigService.get('JWT_ACCESS_SECRET')`
  returns `undefined`; constructs successfully when a secret is
  provided (assert no throw, and that the underlying Passport
  `Strategy` was configured — e.g. via `ExtractJwt`/`ignoreExpiration`
  options if straightforwardly inspectable, otherwise a successful
  construction with a valid secret is sufficient).
- **`validate()` — token-type confusion (decision context #1)**: a
  payload with `type: 'refresh'` or `type: 'password_change'` is
  rejected with `UnauthorizedException` carrying `code:
  'AUTH.INVALID_TOKEN_TYPE'`, **before** any Prisma call is made (assert
  `prisma.user.findUnique` was not called for this case — proves the
  type check short-circuits first, matching the code's actual order).
  A payload with `type: 'access'` proceeds past this check.
- **`validate()` — blocked/missing user (decision context #2)**: mocked
  `findUnique` returning `null` → `UnauthorizedException` with `code:
  'AUTH.USER_BLOCKED_OR_NOT_FOUND'`; mocked `findUnique` returning a
  user with `isActive: false` → the same rejection.
- **`validate()` — session revocation (decision context #3, the most
  important case in this file)**: a payload with `tokenVersion: 1`
  against a mocked user with `tokenVersion: 2` → `UnauthorizedException`
  with `code: 'AUTH.SESSION_REVOKED'`. A payload with `tokenVersion: 2`
  against a user with `tokenVersion: 2` → succeeds. A payload with
  `tokenVersion: undefined` (older tokens minted before this field
  existed, if any, or any payload shape that omits it) → succeeds
  regardless of the user's actual `tokenVersion` — this is the exact
  `!== undefined` guard's purpose, worth its own explicit test rather
  than assuming the mismatch test alone covers it.
- **`validate()` — success path**: valid `type: 'access'` payload,
  active user with matching `tokenVersion`, `findUnique` called with
  `include: { tenant: true, ownerships: { include: { unit: { include: { building: true } } } } }`
  (assert the actual include shape, not just that `findUnique` was
  called with *some* argument) → returns the full user object unchanged.

---

## Acceptance criteria

- `jwt.strategy.spec.ts` exists and passes.
- `npx jest --coverage` on just this file shows at or near 100%
  statements/branches/functions/lines — same bar Task 0036 set for
  `roles.guard.ts`/`redis.service.ts`.
- No behavior change to `JwtStrategy` itself (decision #4) — if a real
  bug is found, it's flagged in the PR description, not silently patched.
- `npm test` passes in `backend/` (existing tests + new ones);
  `npx tsc --noEmit` clean.

## Explicitly out of scope

- `properties.service.ts`/`bookings.service.ts`/`meters.service.ts`
  branch coverage — a separate, lower-urgency task (decision #1).
- e2e/supertest-based tests exercising the full HTTP pipeline
  (`JwtAuthGuard` → `JwtStrategy` → controller) — out of scope, same
  reasoning as Task 0036.
- Any change to token minting (`generateTokens` in `auth.service.ts`) —
  this task only tests the verification side.

## Deliverable

- One commit.
- PR description states the before/after coverage numbers for
  `jwt.strategy.ts` specifically, and explicitly confirms whether
  writing these tests turned up any actual behavioral surprise (per
  decision #4) — even if the answer is "no, it matched the code
  exactly," say so.

---

## Review addendum (2026-09-11) — accepted, no issues found

**Verified good:** `jwt.strategy.spec.ts` covers every branch called out
in the spec — token-type confusion for `refresh`/`password_change`/
`undefined` payloads, each asserting `prisma.user.findUnique` was never
called (proving the type check short-circuits before any DB round
trip); blocked/missing-user rejection for both `null` and
`isActive: false`; session revocation with a stale `tokenVersion`
rejected and a matching one accepted; the `tokenVersion: undefined`
backward-compatibility case explicitly tested on its own rather than
assumed covered by the mismatch test; the success path asserts the
exact `include` shape (`tenant`, `ownerships.unit.building`), not just
that `findUnique` was called with something; and the constructor's
fail-fast is tested for both `undefined` and empty-string secrets.
`jwt.strategy.ts` itself is untouched — no behavior change, as required.

**Verified independently:** re-ran `jwt.strategy.spec.ts` with coverage
myself — **100% statements/branches/functions/lines** (20/20 lines,
10/10 branches). Full suite: 380/380 tests pass across 23 suites.
`tsc --noEmit` clean. Task accepted, no fixes required.
