# Task 0036: Direct test coverage for RolesGuard + RedisService, remove dead TenantGuard class

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Coverage-quality pass, not a new feature. Ran
`npx jest --coverage` in `backend/` (2026-09-10): overall 60.78%
statements, but the aggregate number hides where the real risk is — every
`*.controller.ts` in the codebase shows 0% coverage (expected: this
project has no controller-level/e2e tests, only mocked-Prisma service
unit tests, and that's an accepted, much larger gap not worth closing in
one task). Two specific files stood out as **security-critical code with
literally zero direct tests**, not just "thin controller glue":

1. **[roles.guard.ts](../backend/src/common/guards/roles.guard.ts) — 33%
   line, 0% branch coverage.** `RolesGuard` is wired via `@UseGuards` in
   12 controllers (confirmed by grep) and is the exact mechanism
   [Task 0035](0035-superadmin-platform-overview.md) relied on for its
   entire security model — a method-level `@Roles(SUPERADMIN)`
   correctly *overriding* a broader class-level `@Roles(...)` via
   `Reflector.getAllAndOverride`. That override behavior, the SUPERADMIN
   universal-bypass branch, and the plain reject-if-role-not-in-list
   branch have **never been exercised by any test** — the 33%/0% comes
   from the class merely being instantiated somewhere, not from
   `canActivate()` actually running. If this guard ever regresses (e.g.
   someone "simplifies" it and accidentally drops the SUPERADMIN bypass
   or breaks the override semantics), nothing in the suite would catch
   it.
2. **[redis.service.ts](../backend/src/redis/redis.service.ts) — 15%
   line, 0% function coverage, no spec file exists at all.**
   [PROGRESS.md](PROGRESS.md) touts OTP's "fail-closed поведение при
   сбоях Redis" as a completed, verified guarantee — but that guarantee
   is only exercised indirectly through `auth.service.spec.ts` mocking
   `RedisService` entirely. `RedisService`'s own logic (retry/backoff
   strategy, TTL-vs-no-TTL `set()` branching, the `onModuleDestroy`
   quit-then-disconnect-on-failure fallback) has no test of its own.

Also found while investigating: **`TenantGuard` (the `CanActivate`
class in the same `tenant.guard.ts` file) is dead code** — grepped the
entire `backend/src` for `TenantGuard` usage: it's only ever
*defined*, never passed to `@UseGuards(...)` on any controller, and
`app.module.ts`'s only `APP_GUARD` binding is `ThrottlerGuard`. The two
*exported functions* in the same file, `assertUserBelongsToTenant` and
`assertAccessToTenant`, are genuinely used everywhere (that's the real
tenant-isolation mechanism, already well-covered by
`tenant-access.spec.ts` from [Task 0031](0031-tenant-isolation-consolidation.md))
— but the class itself is unreachable code nobody has wired up. Don't
write tests for it; delete it (this project's standing convention is to
remove confirmed-dead code rather than test or preserve it).

### Architecture decisions already made — do not re-litigate

1. **Scope is exactly these two files' direct tests, plus deleting the
   dead class. Not a general coverage sweep.** Controllers being 0%
   covered is a much bigger, separate problem (would mean introducing
   e2e/supertest infrastructure that doesn't exist in this project at
   all) — out of scope here, don't start it as a drive-by. This task is
   about the two specific pieces of security-critical logic identified
   above.
2. **Test `RolesGuard` with a real `Reflector`, not a hand-mocked one.**
   The whole point is proving the method-level-overrides-class-level
   behavior, which is `Reflector.getAllAndOverride`'s actual semantics —
   mocking `Reflector.getAllAndOverride` to return a canned value would
   only prove the mock works, not that the real override logic holds.
   Use `new Reflector()` (real instance) with actual `@Roles(...)`
   decorator applications on dummy test classes/handlers (`SetMetadata`
   under the hood, same as
   [roles.decorator.ts](../backend/src/common/decorators/roles.decorator.ts))
   so `context.getHandler()`/`context.getClass()` reflect real metadata.
   Only mock the `ExecutionContext`'s `switchToHttp().getRequest()` part
   (to inject a fake `user`).
3. **Test `RedisService` with `ioredis` mocked at the module level**
   (`jest.mock('ioredis')`), not a real Redis connection — this project
   has no Redis test-container setup, and introducing one is out of
   scope for a coverage task. Assert `RedisService`'s methods call the
   mocked client with the right arguments and that its own branching
   logic (retry backoff, TTL set variant, destroy fallback) behaves
   correctly — that's what's actually untested today, not
   whether `ioredis` itself works.
4. **Delete the dead `TenantGuard` class, not just leave it alongside
   new tests.** Confirmed unused via grep across `backend/src` and
   `app.module.ts`'s `APP_GUARD` binding. Keep
   `assertUserBelongsToTenant`/`assertAccessToTenant` and their existing
   test file completely untouched — only the unused class goes.

---

## Subtask A — `RolesGuard` direct tests

New `backend/src/common/guards/roles.guard.spec.ts`:

- No `@Roles(...)` on either handler or class → `canActivate` returns
  `true` (matches the existing `if (!requiredRoles || requiredRoles.length === 0) return true` branch).
- No `user` on the request → throws `ForbiddenException`.
- `user.role === SUPERADMIN` → returns `true` even when the required
  roles list is `[HOA_ADMIN]` and does **not** include `SUPERADMIN` —
  this is the universal-bypass branch every other role-gated feature in
  this codebase (including Task 0035) depends on implicitly.
- `user.role` is in the required roles list → returns `true`.
- `user.role` is not in the required roles list → throws
  `ForbiddenException`.
- **Method-level `@Roles(...)` overrides class-level `@Roles(...)`**:
  build two dummy classes/handlers, one with only a class-level
  `@Roles(HOA_ADMIN, HOA_CHAIRMAN)` decorator and a method carrying its
  own `@Roles(SUPERADMIN)`, run both through a real `Reflector`, and
  assert the guard enforces the **method-level** set (rejects an
  `HOA_ADMIN` user even though the class-level decorator would have
  allowed them) — this is a direct regression test for exactly the
  property [Task 0035](0035-superadmin-platform-overview.md) needed and
  manually verified during review; it should never again require a
  manual trace to confirm.

## Subtask B — `RedisService` direct tests

New `backend/src/redis/redis.service.spec.ts`, with `jest.mock('ioredis')`:

- Constructor: `ConfigService.get` mocked to return specific
  host/port/password (and separately, to return the documented
  defaults `'localhost'`/`'6379'` and `undefined` password) — assert the
  `Redis` constructor mock was called with the expected options object,
  including `password: undefined` (not an empty string) when unset.
- `retryStrategy` (the function passed to the `Redis` constructor's
  options): extract it from the mock call args and assert directly —
  `times <= 3` returns `Math.min(times * 100, 1000)`, `times > 3`
  returns `null` (stop retrying). This is pure logic with no I/O, easy
  to test in isolation once extracted from the mock call.
- `get`/`del`/`incr`/`expire` each delegate to the corresponding mocked
  client method with the right key argument and return its result.
- `set(key, value)` with no `ttlSeconds` calls `client.set(key, value)`
  (2 args); `set(key, value, ttlSeconds)` calls
  `client.set(key, value, 'EX', ttlSeconds)` (4 args) — both branches of
  the `if (ttlSeconds && ttlSeconds > 0)` check, including the edge case
  `ttlSeconds === 0` (falsy, should take the no-TTL branch — worth an
  explicit assertion since `0` is an easy off-by-one to get wrong here).
- `onModuleDestroy`: mocked `client.quit()` resolving → asserts `quit`
  was called and `disconnect` was **not**; mocked `client.quit()`
  rejecting → asserts the `catch` branch calls `client.disconnect()`
  instead (this branch is currently 0%-covered).

## Subtask C — Remove dead `TenantGuard` class

In [tenant.guard.ts](../backend/src/common/guards/tenant.guard.ts):

- Delete the `TenantGuard` class (lines 1-34, the `@Injectable()
  export class TenantGuard implements CanActivate` block) and its now-
  unused imports (`CanActivate`, `ExecutionContext` — keep
  `Injectable`/`ForbiddenException`/`UserRole` if still used by the
  remaining functions).
- Leave `assertUserBelongsToTenant`, `assertAccessToTenant`,
  `TenantAccessErrorCodes`, and `tenant-access.spec.ts` completely
  unchanged.
- Grep the repo once more after deleting to confirm nothing imports
  `TenantGuard` by name (should already be zero per this task's own
  investigation, but confirm rather than assume after editing).

---

## Acceptance criteria

- `roles.guard.spec.ts` and `redis.service.spec.ts` exist and pass.
- `npx jest --coverage` on just these two files shows both at or near
  100% line/branch coverage (a guard and a thin service wrapper are
  small enough that near-total coverage is a reasonable bar here,
  unlike a large service class).
- The method-level-overrides-class-level test in Subtask A uses a real
  `Reflector`, not a mocked one.
- `TenantGuard` class no longer exists anywhere in the codebase; the two
  exported helper functions and their existing tests are untouched.
- `npm test` passes in `backend/` (existing 327 tests + new ones);
  `npx tsc --noEmit` clean.

## Explicitly out of scope

- Any other file's coverage (controllers, `meters.service.ts`,
  `properties.service.ts`, `bookings.service.ts`, etc. all have room to
  improve but aren't security primitives in the same sense — a separate
  task if pursued).
- Introducing e2e/supertest-based controller tests — a much larger,
  separate infrastructure decision.
- A real Redis or a testcontainer-based integration test for
  `RedisService` — mocked `ioredis` is sufficient for this task's goal
  (testing `RedisService`'s own branching logic, not `ioredis` itself).
- Any behavior change to `RolesGuard` or `RedisService` — this task adds
  tests and deletes dead code, it doesn't change how either class
  behaves.

## Deliverable

- One commit is fine (tests + dead-code removal are small and related).
- PR description states the before/after coverage numbers for
  `roles.guard.ts` and `redis.service.ts` specifically (not just the
  overall project percentage, which will barely move given how small
  these two files are relative to the whole codebase).

---

## Review addendum (2026-09-11) — accepted, no issues found

**Verified good:** `roles.guard.spec.ts` uses a real `Reflector`
instance (not a mock) with genuine `@Roles(...)`-decorated dummy classes
and handlers — the override test builds a class carrying
`@Roles(HOA_ADMIN, HOA_CHAIRMAN)` with one plain handler (inherits the
class-level set, HOA_ADMIN allowed) and one handler carrying its own
`@Roles(SUPERADMIN)` (HOA_ADMIN correctly rejected, SUPERADMIN allowed)
— this is exactly the property Task 0035 depended on, now locked in by
a real reflection-based test rather than a manual trace. SUPERADMIN
universal-bypass, no-user, no-roles-required, and in/out of the required
list are all covered. `redis.service.spec.ts` mocks `ioredis` at the
module level and independently verifies the constructor's default vs.
custom config (including `password: undefined`, not an empty string),
the error listener not throwing, the `retryStrategy` backoff/cutoff
function extracted directly from the mock call args (correctly tests
the boundary at `times === 3` → 300 vs. `times === 4` → `null`),
`get`/`set`/`del`/`incr`/`expire` delegation, both `set()` TTL branches
plus the `ttlSeconds === 0` and negative-TTL edge cases beyond what the
spec asked for, and `onModuleDestroy`'s quit-success vs.
quit-throws-then-disconnect-fallback branches. `TenantGuard`'s dead
class is fully removed from `tenant.guard.ts` — confirmed via a repo-wide
grep for `TenantGuard` returning zero matches — while
`assertUserBelongsToTenant`/`assertAccessToTenant` and their existing
test file are untouched.

**Independently verified, not just trusted:** ran
`npx jest roles.guard.spec.ts redis.service.spec.ts --coverage` myself —
both files show **100% statements/branches/functions/lines**, exceeding
the "near-total" bar the spec asked for. Ran the full suite: 351/351
tests pass (327 existing + 24 new). `tsc --noEmit` clean. Task accepted,
no fixes required.
