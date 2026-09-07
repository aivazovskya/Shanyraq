# Task 0001: Security Hardening (backend)

**Status:** Ready for implementation
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Follow-up from a codebase security pass. The project already went through several
security-hardening rounds (see git history: `fix(security): resolve all 12
vulnerabilities from security audit`, `enforce staff tenant isolation`, `remove
default JWT secret`). This task closes four remaining gaps found in that pass.

Do not restructure unrelated code, do not rename things "while you're in there",
and do not touch frontend-web or mobile UI beyond what's explicitly required by
Subtask 4. Keep changes minimal and scoped to what's listed below.

---

## Subtask 1 — IDOR/BOLA on Service Requests endpoints (HIGH PRIORITY)

**Problem:** [service-requests.controller.ts](../backend/src/modules/service-requests/service-requests.controller.ts)
exposes `GET /service-requests/:id`, `PATCH /service-requests/:id/status`,
`POST /service-requests/:id/comments`, and `POST /service-requests/:id/rate`
with no ownership or tenant check. Any authenticated user can read, comment on,
change the status of, or rate a service request that does not belong to them or
to their tenant, just by guessing/enumerating a UUID.

Compare with [votings.service.ts](../backend/src/modules/votings/votings.service.ts)
`getMeetingDetails()`, which does the correct check:
```ts
if (requestingUser && requestingUser.role !== UserRole.SUPERADMIN) {
  if (!requestingUser.tenantId || requestingUser.tenantId !== meeting.tenantId) {
    throw new ForbiddenException(...)
  }
}
```
and [access-control.service.ts](../backend/src/modules/access-control/access-control.service.ts)
`openBarrier()`/`getCameraStream()`, which verify the resident has a verified
ownership on a unit belonging to the tenant.

**Required fix**, in [service-requests.service.ts](../backend/src/modules/service-requests/service-requests.service.ts):

- `getRequestById(requestId, ...)`: add a `requestingUser: { id, role, tenantId }`
  param. If the user is SUPERADMIN, allow. If the user is staff
  (HOA_ADMIN/HOA_CHAIRMAN/DISPATCHER), require `request.tenantId === user.tenantId`,
  throw `ForbiddenException` otherwise. If the user is a resident
  (RESIDENT_OWNER/RESIDENT_TENANT), require `request.creatorId === user.id`,
  throw `ForbiddenException` otherwise.
- `updateStatus(requestId, dto, ...)`: add the same `requestingUser` param and
  the same staff tenant check (residents can't hit this endpoint — already
  blocked by `@Roles` — but a DISPATCHER from tenant A must not be able to
  update a request belonging to tenant B).
- `addComment(requestId, authorId, dto, ...)`: allow if requester is the
  request's creator, OR staff of the request's tenant, OR SUPERADMIN. Reject
  everyone else.
- `rateRequest`: already checks `request.creatorId !== userId` — no change
  needed here, just keep as reference for the pattern.
- Update [service-requests.controller.ts](../backend/src/modules/service-requests/service-requests.controller.ts)
  to pass `@CurrentUser()` (full user, or the specific fields needed:
  `id`, `role`, `tenantId`) into each of the above service calls.

**Acceptance criteria:**
- A resident cannot fetch, comment on, or have visibility into a service
  request they did not create.
- A DISPATCHER/HOA_ADMIN from tenant A gets `403 ForbiddenException` when
  hitting any of these endpoints for a request belonging to tenant B.
- SUPERADMIN retains cross-tenant access.
- Existing legitimate flows (resident viewing/commenting on own request,
  dispatcher managing requests in their own tenant) keep working.
- Add/extend `service-requests.service.spec.ts` (this module currently has
  **no** spec file at all, unlike every sibling module — see Subtask note
  below) covering: resident accessing own vs. others' request, staff accessing
  own-tenant vs. cross-tenant request, SUPERADMIN cross-tenant access.

---

## Subtask 2 — Weak RNG for guest pass access codes

**Problem:** [access-control.service.ts:235](../backend/src/modules/access-control/access-control.service.ts#L235)
generates the 6-digit `GuestPass.accessCode` with `Math.random()`:
```ts
const accessCode = Math.floor(100000 + Math.random() * 900000).toString();
```
This code grants physical access (guest QR/PIN for barrier/gate). `Math.random()`
is not cryptographically secure and is predictable. Contrast with
[auth.service.ts:70](../backend/src/modules/auth/auth.service.ts#L70), which
correctly uses `crypto.randomInt(100000, 1000000)` for SMS-OTP codes.

**Required fix:** Replace `Math.random()` with `crypto.randomInt(100000, 1000000)`
(same pattern as `auth.service.ts`), importing `crypto` in
`access-control.service.ts`.

**Acceptance criteria:**
- `createGuestPass` produces codes via `crypto.randomInt`.
- Existing `access-control.service.spec.ts` still passes; add a test asserting
  the code is a 6-digit numeric string.

---

## Subtask 3 — OTP storage is in-memory and won't survive restarts/scaling

**Problem:** [auth.service.ts](../backend/src/modules/auth/auth.service.ts) keeps
`otpStorage` and `lockoutStorage` as in-process `Map`s. This means:
- An app restart wipes all pending OTPs and lockouts (lockout bypass).
- Running more than one backend instance (any horizontal scaling) breaks OTP
  verification, since state isn't shared across instances.

`docker-compose.yml` already provisions Redis, but nothing in `backend/`
currently connects to it.

**Required fix:**
- Add a Redis client to the backend (`ioredis` is fine — check for an existing
  NestJS Redis module convention first; if none exists, a small
  `RedisService` wrapping `ioredis` in `backend/src/redis/` is acceptable).
- Move `otpStorage` and `lockoutStorage` to Redis-backed storage keyed by
  phone number, with TTLs matching current in-memory expirations (5 min for
  OTP code, 10 min for lockout). Use Redis `SET key value EX <ttl>` /
  `GET` / `DEL` — no need for a full ORM/abstraction layer.
- Preserve all existing behavior exactly: rate limit (1 SMS/60s), 3-attempt
  lockout, constant-time comparison of the code (keep
  `crypto.timingSafeEqual`), 5-minute OTP TTL, 10-minute lockout TTL.
- `REDIS_HOST` / `REDIS_PORT` env vars already exist in `.env.example` — reuse
  them; add `REDIS_PASSWORD` only if actually needed by the docker-compose
  Redis config (check first, don't add unused config).

**Acceptance criteria:**
- `auth.service.spec.ts` still passes (mock the Redis client in tests the same
  way Prisma is currently mocked).
- OTP/lockout state survives a process restart when Redis is used (manual
  verification is fine — no need for a new e2e test unless one already exists
  for auth).
- No behavior change from the caller's (mobile app's) perspective.

---

## Subtask 4 — Access token lifetime is too long for a SCUD-integrated app

**Problem:** [auth.service.ts:349](../backend/src/modules/auth/auth.service.ts#L349)
issues access tokens with `expiresIn: '7d'`. This app can open physical
barriers/gates ([access-control.service.ts](../backend/src/modules/access-control/access-control.service.ts)),
so a stolen/leaked access token is valid for a week. The refresh token flow is
already fully implemented on the mobile client
([client.ts](../mobile/src/api/client.ts) — silent refresh on 401, request
queueing, single-flight refresh), so shortening the access token TTL is safe
and requires no mobile-side changes.

**Required fix:**
- Change access token `expiresIn` to `15m` in `generateTokens()`.
- Update the `expiresIn: 604800` value in the returned payload
  (`auth.service.ts` return object) to match (900 seconds), or better,
  compute it from a single source of truth (e.g. a constant) instead of two
  hardcoded numbers that can drift.
- Leave the refresh token TTL (`30d`) unchanged.
- Update `.env.example` comment / `JWT_ACCESS_EXPIRES_IN="7d"` value to `15m`
  for consistency (check whether this env var is actually read anywhere — if
  it's currently unused/dead config, note that in the PR description instead
  of wiring it up as a new feature; wiring it up is out of scope for this
  task unless it's a one-line fix).

**Acceptance criteria:**
- New tokens expire in 15 minutes.
- `auth.service.spec.ts` assertions on token expiry (if any) updated
  accordingly.
- Manual/mobile sanity check: app stays logged in across a >15min session via
  silent refresh (no forced logout).

---

## Out of scope for this task

- Any UI/UX changes beyond what Subtask 4 requires (none expected).
- Redis-backing anything other than OTP/lockout state (e.g. sessions, caching)
  — not requested here.
- Rotating/regenerating `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
  `VOTE_SIGNING_KEY` values themselves — infra/ops concern, not code.
- The `seed.ts` compromised-password warning already documented in
  [README.md](../README.md) — no action needed, already flagged.

---

## Review addendum (2026-09-07) — Subtask 3 revision required before this task closes

**Status of the four subtasks:** 1, 2, 4 verified correct (`npm test` passes,
64/64, tests cover the intended cases). **Subtask 3 needs one more pass.**

**Finding:** [redis.service.ts](../backend/src/redis/redis.service.ts)
`get()`/`set()`/`del()` catch every Redis error and return `null`/`0`
(fail-open), logging only at `warn` level. Combined with `maxRetriesPerRequest: 1`,
this means a transient Redis blip silently disables the brute-force controls
Subtask 3 exists to protect:

- The lockout check in `requestOtp`/`verifyOtp`/`verifyVoteOtp` reads
  `lockoutVal` via `get()`. If that `get()` fails, `lockoutVal` comes back
  falsy → the code proceeds as "not locked out", even if the phone genuinely
  is locked. A locked-out attacker regains unlimited guesses for the duration
  of any Redis hiccup.
- The `attempts` counter is persisted via `set()` after each wrong code. If
  that `set()` silently fails, the incremented count never lands, so the next
  `get()` sees the old (lower) attempt count — effectively resetting the
  brute-force counter with no visible error anywhere except a `warn` log line.

This is a regression relative to the property Subtask 3 was supposed to
strengthen. The in-memory `Map` it replaced didn't have this specific failure
mode (it just had the restart/scaling problems this task fixed).

**Required fix:**
- In `RedisService`, distinguish "key doesn't exist" (legitimate `null`) from
  "the Redis call itself failed" (should not be treated the same as "key
  absent"). One reasonable approach: let `get`/`set`/`del` throw on actual
  connection/command errors instead of swallowing them, and handle that
  explicitly at the call sites in `auth.service.ts` that enforce
  lockout/attempt-counting — those specific checks should **fail closed**
  (reject the request with a clear "временно недоступно, попробуйте позже"
  error) rather than silently proceeding as if no lockout/attempt record
  existed.
- The OTP-code lookup itself (`verifyOtp` checking whether an OTP was ever
  requested) can reasonably stay as today — a missing/unreadable OTP record
  already correctly fails closed ("код истёк, запросите новый").
- Add a test simulating a Redis error on the lockout-check path and assert
  the request is rejected rather than silently allowed through.

## Deliverable

- A single PR (or four commits, one per subtask — reviewer's preference) with:
  - Code changes per subtask above.
  - Passing `npm test` in `backend/`.
  - Short PR description listing which subtasks are included and any
    deviations from this spec (with reasoning).
