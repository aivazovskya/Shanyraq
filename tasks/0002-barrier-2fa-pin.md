# Task 0002: 2FA (PIN) before physical access actions

**Status:** Ready for implementation
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)
**Depends on:** [0001-security-hardening.md](0001-security-hardening.md) Subtask 3
(Redis-backed OTP/lockout storage) — not a hard blocker, see note in Subtask B.

## Context

[PRODUCT_SPEC.md](PRODUCT_SPEC.md) §5.1 requires: *"Управление шлагбаумом/дверьми
— критичная зона: обязательна двухфакторная защита действия (например,
подтверждение через биометрию/PIN в приложении перед открытием)"*.

This is currently **not implemented at all** — see [PROGRESS.md](PROGRESS.md).
Today, `openBarrier()` in
[access-control.service.ts](../backend/src/modules/access-control/access-control.service.ts)
only checks: valid JWT (first factor) + verified unit ownership (authorization).
There is no second factor at the moment of the physical action itself.

### Architecture decision (already made — do not re-litigate)

The spec's "biometry OR PIN" wording describes two options of very different
strength: a PIN can be verified **server-side** (hashed, rate-limited, audited
— same pattern already used for SMS-OTP in
[auth.service.ts](../backend/src/modules/auth/auth.service.ts)). Device
biometrics (Face ID/Touch ID/fingerprint) can only be verified **on-device** —
the server has no way to confirm it actually happened, it just trusts the
client's word.

**Decision: server-verified PIN is the mandatory second factor.** Biometrics
may be added later purely as a *local convenience* to unlock entering the PIN
faster on-device — that is Subtask D below, explicitly optional/deferred, and
must never replace the server-side check.

---

## Subtask A — Backend: PIN data model + management endpoints (MANDATORY)

**Schema change** in [schema.prisma](../backend/prisma/schema.prisma), on the
`User` model:
```prisma
accessPinHash   String?   // bcrypt hash of the 4-6 digit access PIN, null until set
accessPinSetAt  DateTime?
```
Run a migration (`prisma db push` / migration file per existing project
convention — check whether the repo already uses `prisma migrate` anywhere
before deciding push vs migrate).

**New endpoints** in the `auth` module (reuse `AuthController`/`AuthService` —
this is identity/credential material, same home as OTP and password logic):

- `GET /auth/pin/status` (authenticated) → `{ isPinSet: boolean }`. Mobile uses
  this to decide whether to show "set up your PIN" onboarding before letting
  the resident use barrier/gate actions.
- `POST /auth/pin/set` (authenticated), body `{ newPin: string, currentPin?: string }`:
  - PIN must be exactly 4 or 6 digits (`^\d{4}$|^\d{6}$`), reject anything else
    with a clear validation error.
  - Reject trivially weak PINs: all-same-digit (`0000`, `111111`) and simple
    sequences (`1234`, `123456`, `4321`, `654321`). Small hardcoded blocklist
    is fine, no need for anything elaborate.
  - If the user already has `accessPinHash` set, `currentPin` is **required**
    and must match (bcrypt.compare) before allowing the change — same
    "prove you still control this credential before changing it" principle
    already used implicitly elsewhere in the codebase.
  - If no PIN is set yet (first-time setup), `currentPin` is not required.
  - Hash with `bcrypt` (already a dependency), store in `accessPinHash`, set
    `accessPinSetAt = now()`.
- `POST /auth/pin/reset-request` (authenticated) → triggers a new SMS-OTP to
  the user's own phone (reuse `AuthService.requestOtp` logic/rate-limits — do
  not build a second parallel OTP mechanism).
- `POST /auth/pin/reset-confirm` (authenticated), body `{ otpCode: string, newPin: string }`:
  - Verifies the OTP against the user's own phone (reuse the existing OTP
    verification path — the one currently named `verifyVoteOtp` in
    `auth.service.ts` is generic enough to reuse as-is, or rename it to
    something like `verifyOtpForAction` if that reads better; either is fine,
    just don't duplicate the constant-time-compare/lockout logic a second
    time).
  - Applies the same PIN format/weak-PIN validation as `/auth/pin/set`.
  - Overwrites `accessPinHash` unconditionally (this *is* the "forgot my PIN"
    path, so no `currentPin` check here — OTP possession is the proof).

**Acceptance criteria:**
- A resident/staff user with no PIN gets `isPinSet: false` and can set one.
- Setting a PIN requires the current one once already set.
- Weak PINs are rejected with a clear, user-facing message.
- Forgotten-PIN flow works end-to-end via OTP.
- New tests in `auth.service.spec.ts` covering: first-time set, change with
  correct/incorrect current PIN, weak-PIN rejection, reset-via-OTP happy path
  and wrong-OTP path.

---

## Subtask B — Backend: enforce PIN check in `openBarrier` (MANDATORY)

**Scope:** applies to `AccessControlService.openBarrier()` only — i.e. actions
on `AccessPointType.BARRIER` and `AccessPointType.GATE`. Does **not** apply to
`getCameraStream()` (viewing isn't a physical actuation) or `createGuestPass()`
(guest passes already carry their own time-limited one-time code — out of
scope here). Applies uniformly to **every role** that can call this endpoint
today (residents and staff alike) — the spec frames the barrier/door zone
itself as critical, not just resident access to it.

**Required changes** in
[access-control.service.ts](../backend/src/modules/access-control/access-control.service.ts)
and [access-control.dto.ts](../backend/src/modules/access-control/dto/access-control.dto.ts):

- Add `pin: string` (required) to `OpenBarrierDto`.
- In `openBarrier()`, after the existing ownership/tenant checks and **before**
  calling `barrierAdapter.triggerOpen()`:
  1. Load the user's `accessPinHash`. If null, throw a distinguishable error
     (e.g. a specific error code/message like `PIN_NOT_SET`, not just a
     generic 400) so the mobile app can redirect to PIN setup instead of
     showing a confusing failure.
  2. `bcrypt.compare(dto.pin, user.accessPinHash)`. On mismatch:
     - Log an `AccessLog` entry with `status: 'DENIED'`,
       `note: 'Неверный PIN при открытии'` (same pattern as the existing
       tenant-mismatch/no-ownership denial logs already in this file).
     - Track failed attempts per user with a lockout after 3 consecutive
       failures (10 minutes), same thresholds as OTP in `auth.service.ts` —
       for consistency of user-facing behavior across the app. Storage
       mechanism: if Task 0001 Subtask 3's Redis-backed store has already
       landed, use it (key by `userId`, not phone); if not yet landed, an
       in-memory `Map` on the service is acceptable for now, following the
       exact same shape as `AuthService`'s `lockoutStorage` — just flag in the
       PR description that it should move to Redis alongside the OTP storage
       once that lands, so it doesn't get forgotten.
     - Return a clear "неверный PIN, осталось попыток: N" error.
  3. On match, proceed exactly as today (trigger relay, write `SUCCESS`
     `AccessLog`).

**Acceptance criteria:**
- Opening a barrier without a PIN set fails with a clear "set up your PIN
  first" error, no relay signal is sent.
- Wrong PIN fails, does not trigger the relay, and is logged as `DENIED` in
  `AccessLog` (auditable, matches existing denial-logging pattern).
- 3 consecutive wrong PINs locks barrier-opening for that user for 10 minutes,
  independent of their OTP/login lockout state.
- Correct PIN opens the barrier exactly as before.
- Extend `access-control.service.spec.ts` with cases for: no PIN set, wrong
  PIN, lockout after 3 attempts, correct PIN success — for both a resident and
  a staff user.

---

## Subtask C — Mobile: PIN setup + PIN entry before opening (MANDATORY)

Reference existing screens: [AccessScreen.tsx](../mobile/src/screens/access/AccessScreen.tsx),
[HoldToOpenButton.tsx](../mobile/src/components/access/HoldToOpenButton.tsx),
[ProfileScreen.tsx](../mobile/src/screens/profile/ProfileScreen.tsx).

- **PIN setup:** add a "Установить PIN-код доступа" entry in
  `ProfileScreen.tsx`, and a numeric-keypad setup screen (enter PIN, confirm
  PIN) calling `POST /auth/pin/set`. Also handle "Забыли PIN?" → OTP-based
  reset flow (calls `/auth/pin/reset-request` then `/auth/pin/reset-confirm`),
  reusing the existing OTP-input UI pattern from
  [OtpVerifyScreen.tsx](../mobile/src/screens/auth/OtpVerifyScreen.tsx) rather
  than building a new one from scratch.
- **Gating:** if `GET /auth/pin/status` returns `isPinSet: false`, the
  `AccessScreen`'s open-barrier action should redirect to PIN setup instead of
  attempting to open (mirrors the existing pattern in
  [ClaimUnitScreen.tsx](../mobile/src/screens/onboarding/ClaimUnitScreen.tsx)
  where an unverified state blocks access with an explanatory message).
- **Entry at the moment of action:** modify the open-barrier flow
  (`HoldToOpenButton.tsx` / wherever it currently calls the access API
  directly) so that, on trigger, it first shows a numeric-keypad PIN entry
  modal/screen, then calls the open-barrier API with `pin` included. Surface
  the backend's `PIN_NOT_SET` / wrong-PIN / lockout errors with clear
  messages (same style as existing `getApiErrorMessage` usage elsewhere in
  the app).
- Add `AuthApi`/`AccessApi` client functions in
  [mobile/src/api/auth.ts](../mobile/src/api/auth.ts) and
  [mobile/src/api/access.ts](../mobile/src/api/access.ts) for the four new
  endpoints.

**Acceptance criteria:**
- A resident without a PIN cannot open a barrier — they're routed to setup
  first.
- A resident with a PIN is prompted for it every time they trigger open, and
  a correct PIN opens the barrier; wrong PIN shows the server's error
  message including remaining attempts.
- PIN can be changed from Profile, and reset via OTP if forgotten.

---

## Subtask D — Mobile: biometric-assisted PIN entry (OPTIONAL / follow-up)

**Not required to close this task.** Deferred so Subtasks A–C can ship
without blocking on this design question. If picked up:

- Use `expo-local-authentication` (not currently a dependency — would need
  adding to `mobile/package.json`) to let the user unlock PIN entry with
  Face ID/Touch ID/fingerprint instead of typing it.
- This must remain a **convenience layer only**: the PIN itself (or a
  securely-stored equivalent retrievable only after a successful biometric
  prompt, via `expo-secure-store` which is already a dependency) still gets
  sent to and verified by the server exactly as in Subtask B. Biometric
  success must never be treated by the server as sufficient on its own — the
  server has no visibility into whether it actually happened.
- Before implementing, flag to the team lead any tradeoff around storing the
  PIN (or a retrievable form of it) in `expo-secure-store` client-side, since
  that's a new attack surface (compromised/rooted device could read it) not
  present in the plain "type your PIN every time" flow.

---

## Out of scope for this task

- Domofon (`DOOR_INTERCOM`) — not yet wired to any open action at all (see
  [PROGRESS.md](PROGRESS.md)); this task does not extend PIN enforcement to
  it since it doesn't exist yet. Will be covered when that module is built.
- `getCameraStream()` and `createGuestPass()` — explicitly excluded, see
  Subtask B scope note.
- Any change to guest-pass access codes beyond what Task 0001 Subtask 2
  already covers (weak RNG fix) — guests are not expected to have app
  accounts/PINs.

## Deliverable

- Subtasks A, B, C in one PR (or separate commits/PRs per subtask, reviewer's
  preference) with passing `npm test` in both `backend/` and `mobile/`
  (`typecheck` script).
- Subtask D as a separate follow-up PR only if/when picked up.
- PR description noting: migration approach used (push vs migrate), where
  PIN lockout state is stored (Redis vs in-memory, per Subtask B note), and
  confirmation that Subtask D was **not** included.
