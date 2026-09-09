# Task 0019: Security hardening — audit remediation

**Status:** Completed (addendum fixes applied for B4 and B1; all 12 findings verified)
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

With the full ТЗ implemented and the backend error-code migration complete
([Task 0018](0018-error-codes-remaining-modules.md)), a full security audit
was run across the entire platform (OWASP Top 10 lens) looking specifically
for issues the prior 18 feature-scoped reviews wouldn't have caught — cross-
module inconsistencies and code paths nobody was specifically auditing.
Every finding below was independently re-verified by reading the actual
code before being written into this task — these are confirmed, not
speculative.

This task fixes 12 findings across 4 severity tiers. **Subtask A (Critical)
must ship even if nothing else in this task does** — it's a live
cross-tenant data-integrity hole in the ОСС voting flow. The rest are
grouped by severity; do them in order, but all 12 are in scope for one
task since none require large refactors.

### Architecture decisions already made — do not re-litigate

1. This is a hardening pass, not a rewrite. Every fix below is a targeted
   change (add a check, add a config, tighten a default) — don't use this
   task as a excuse to refactor surrounding code.
2. Keep using the existing `{ code, message, params? }` exception shape
   (Tasks 0014/0016/0017/0018) for any new exception thrown as part of a
   fix — add matching `errors.<MODULE>.*` i18n keys with full kk/ru/en
   parity, same as every prior task.
3. For the web token-storage fix (Subtask D3): the web app currently has
   **no refresh-token flow at all** — it only stores a 15-minute access
   token and presumably requires re-login after expiry (confirmed by
   grepping `frontend-web/src/lib/api.ts` for "refresh" — no matches).
   Given that, **do not build a cookie/BFF architecture for this** — that
   would be a disproportionate response to a 15-minute exposure window.
   The fix is simply: keep the token in memory (e.g. a module-level
   variable or React context) instead of `localStorage`, so a page reload
   requires re-login. This is a smaller, lower-risk change that still
   closes the XSS-exfiltration path. If you find this makes the UX
   noticeably worse than expected (e.g. losing session on every tab
   refresh in normal use), flag it in the PR rather than silently
   building the bigger cookie solution instead.

---

## Subtask A — CRITICAL: cross-tenant ОСС meeting creation

**File:** [votings.service.ts:32-33](../backend/src/modules/votings/votings.service.ts)

`VotingsController.createMeeting` ([votings.controller.ts:38-42](../backend/src/modules/votings/votings.controller.ts))
already correctly computes `targetTenantId = user.role === SUPERADMIN ?
(dto.tenantId || user.tenantId) : user.tenantId` and passes it to the
service as `creatorTenantId`. But `VotingsService.createMeeting` then does
`const targetTenantId = dto.tenantId || creatorTenantId;` — re-reading the
raw, client-controlled `dto.tenantId` a second time. Since
`CreateMeetingDto.tenantId` is a real, whitelisted, optional `@IsString()`
field, a `HOA_CHAIRMAN` or `HOA_ADMIN` of Tenant A can pass
`{ "tenantId": "<tenant-B-id>", ... }` in the request body and the service
will silently create the meeting (with quorum thresholds, HMAC-signed
votes, protocol generation) inside Tenant B instead of their own tenant.

**Fix:** In `VotingsService.createMeeting`, stop re-reading `dto.tenantId`
— accept and trust only the `creatorTenantId` the controller already
resolved and authorized. The controller is the only place that should ever
look at `dto.tenantId`, exactly like `announcements.controller.ts` already
does it correctly.

**Test:** add a case verifying that a `HOA_CHAIRMAN`/`HOA_ADMIN` of Tenant
A who passes `dto.tenantId = <tenant-B>` still gets a meeting created in
Tenant A, not Tenant B (and that SUPERADMIN's explicit-tenant-targeting
behavior is unaffected).

---

## Subtask B — HIGH severity (4 findings)

### B1. No brute-force protection on password login

**File:** [auth.service.ts:411](../backend/src/modules/auth/auth.service.ts)
(`loginWithPassword`)

Unlike the OTP flow (3-attempt lockout, 10-minute Redis cooldown via
`LOCKOUT_KEY_PREFIX`), `loginWithPassword` has no attempt tracking at all
— an attacker can script unlimited password guesses against any
УК/ОСИ/dispatcher/security account.

**Fix:** Reuse the existing Redis-backed lockout pattern from the OTP flow
(same `LOCKOUT_KEY_PREFIX`-style key, e.g. `login:lockout:<login>`,
3 attempts / 10-minute cooldown) inside `loginWithPassword`. New code
`AUTH.PHONE_LOCKED`-equivalent for password login (or reuse
`AUTH.PHONE_LOCKED` if the message stays accurate — your call).

### B2. Default S3/MinIO credentials shipped as real values, not placeholders

**Files:** [uploads.service.ts:29-30](../backend/src/modules/uploads/uploads.service.ts),
[.env.example:29-30](../.env.example)

`S3_ACCESS_KEY`/`S3_SECRET_KEY` default to the literal values
`'shanyraq_minio'` / `'shanyraq_minio_secret_key'` both in code (config
fallback) and in `.env.example` — unlike `JWT_ACCESS_SECRET` etc. in the
same file, which are explicitly marked `CHANGE_ME_IN_PRODUCTION`. A
deployer copying `.env.example` to `.env` ships a production MinIO
instance with publicly-known credentials, exposing the bucket that holds
ownership-verification documents.

**Fix:** Remove the hardcoded fallback defaults in `uploads.service.ts` —
fail fast at startup if `S3_ACCESS_KEY`/`S3_SECRET_KEY` are unset (same
pattern as the JWT/VOTE_SIGNING_KEY checks already do in this codebase).
Update `.env.example` to mark both `CHANGE_ME_IN_PRODUCTION`, matching the
convention already used for the other secrets in that file.

### B3. `addUnit` has no tenant-ownership check

**File:** [properties.service.ts:154-186](../backend/src/modules/properties/properties.service.ts)

`addUnit(buildingId, dto)` is gated by `@Roles(HOA_ADMIN, SUPERADMIN)` only
— it never verifies `building.tenantId === user.tenantId`. A `HOA_ADMIN`
of Tenant A can inject unit records into Tenant B's building, corrupting
Tenant B's `totalArea`/`totalUnitsCount` (which feed ОСС quorum
calculations).

**Fix:** After loading `building`, call `assertUserBelongsToTenant(user,
building.tenantId, 'квартир')` before creating the unit — the exact
pattern already used correctly in `meters.service.ts`'s `createMeter`.
This requires threading `user` into `addUnit` and its controller call site
(currently the controller doesn't even pass `@CurrentUser()` — add it).

### B4. No server-side file-type validation on uploads; presigned path has no size limit

**Files:** [uploads.controller.ts:39-57](../backend/src/modules/uploads/uploads.controller.ts),
[uploads.service.ts:81-139](../backend/src/modules/uploads/uploads.service.ts),
[dto/uploads.dto.ts:15-18](../backend/src/modules/uploads/dto/uploads.dto.ts)

Neither the direct-upload endpoint nor `PresignUploadDto.mimeType`
restrict content type to an allowlist — the client-supplied mimetype is
trusted verbatim. This is a stored-content risk (e.g. an uploaded `.svg`
or `.html` "photo" attachment containing a script, later opened directly
from its public MinIO URL). Separately, `getPresignedUploadUrl` hands out
a presigned PUT URL with no size constraint, bypassing the 15 MB Multer
limit that only applies to the direct-upload path.

**Fix:**
- Add a server-side mimetype allowlist (e.g. `image/jpeg`, `image/png`,
  `image/webp`, `application/pdf` — adjust to whatever categories this
  app's upload UI actually offers) enforced in both the Multer
  `fileFilter` (direct upload) and as `@IsIn([...])` validation on
  `PresignUploadDto.mimeType`.
- For the presigned-URL path, cap size by setting S3
  `content-length-range` conditions on the presigned request (or switch to
  a presigned POST policy if the current SDK call doesn't support
  conditions on a presigned PUT) rather than leaving it unbounded.

---

## Subtask C — MEDIUM severity (5 findings)

### C1. `GET /properties/tenants/:id` has no authorization at all

**File:** [properties.controller.ts:38-42](../backend/src/modules/properties/properties.controller.ts)
(`getTenantById`)

No `@Roles`, no tenant check — any authenticated user of any role/tenant
can fetch another tenant's full building/unit inventory including
`cadastralNumber` and internal resource counts.

**Fix:** This endpoint's Swagger summary ("Информация о ЖК с домами и
квартирами") suggests it's meant for staff management use, distinct from
the already-public `getTenantStructure` (used for onboarding). Add
`assertUserBelongsToTenant(user, id, 'жилого комплекса')` (SUPERADMIN
exempt, per the helper's existing behavior) so only staff of the matching
tenant (or SUPERADMIN) can call it. If it turns out some other part of the
app relies on cross-tenant access to this exact endpoint, flag it instead
of guessing — but nothing found in this audit suggested that's the case.

### C2. `service-requests.createRequest` has no ownership check on the target unit

**File:** [service-requests.service.ts:14-56](../backend/src/modules/service-requests/service-requests.service.ts)

Any authenticated resident can submit a service request tagged to an
arbitrary `unitId`, including one they have no relationship to — the
service derives `tenantId` from the unit and creates the request without
checking the caller owns/rents it.

**Fix:** Before creating, verify the caller has a `unitOwnership` record
for `dto.unitId` (mirror the check already present in
`meters.service.ts`'s `submitReading`). Note this is a **write-path** gap,
distinct from the already-fixed read-path IDOR on this same module.

### C3. No application-level rate limiting anywhere

**Files:** `backend/src/app.module.ts` (no `ThrottlerModule` registered),
`backend/package.json` (no `@nestjs/throttler` dependency)

Beyond the already-fixed OTP/PIN lockouts, nothing throttles repeated
calls. Concretely exploitable: spamming
`chat.service.ts`'s `sendResidentMessage`, re-triggering `sos.service.ts`'s
`trigger` to repeatedly push "🚨 EMERGENCY" notifications to on-duty staff
(dedup only prevents duplicate DB rows, not duplicate pushes), and minting
unlimited guest passes via `access-control.service.ts`'s
`createGuestPass`.

**Fix:** Add `@nestjs/throttler`, register it globally in `app.module.ts`
with a conservative default (e.g. 60 req/min per IP), then add stricter
per-route `@Throttle(...)` limits on: chat message send, SOS trigger, and
guest-pass creation. Don't touch the existing Redis-based OTP/PIN lockouts
— those solve a different problem (attempt counting tied to a specific
resource, not generic rate limiting) and should stay as-is alongside the
new throttler.

### C4. Overly permissive CORS

**File:** [main.ts:10-14](../backend/src/main.ts)

`app.enableCors({ origin: true, credentials: true, ... })` reflects any
request's `Origin` header and allows credentialed cross-origin requests
from any website.

**Fix:** Replace `origin: true` with an explicit, env-driven allowlist
(e.g. a `CORS_ALLOWED_ORIGINS` comma-separated env var parsed into an
array) covering the known web-admin origin(s). Keep `credentials: true`
only if something actually depends on cookies being sent cross-origin —
audit whether it does; if nothing does (auth is Bearer-token-based per
this codebase's convention), it's safe to drop.

### C5. Web dashboard stores the access token in `localStorage`

**File:** [lib/api.ts:20,29-48](../frontend-web/src/lib/api.ts)

See decision #3 above for the scoped fix — this app has no refresh-token
flow, so the exposure window is the 15-minute access-token lifetime, not a
long-lived session. Move `saveSession`/`getStoredSession`/`clearSession`
to an in-memory store instead of `localStorage`.

---

## Subtask D — LOW severity (2 findings)

### D1. Internal infrastructure details leaked in error responses

**Files:** [access-control.service.ts:110-116,166-172](../backend/src/modules/access-control/access-control.service.ts)
(Hikvision connection/timeout errors), [uploads.service.ts:101-107](../backend/src/modules/uploads/uploads.service.ts)
(`UPLOADS.STORAGE_ERROR`)

Raw `err.message` (potentially containing internal hostnames, ports, or
network topology) is interpolated directly into exception messages
returned to the API caller.

**Fix:** Log the raw error server-side (`this.logger.error(...)`) and
return a generic, code-only message to the client — drop `err.message`
from the user-facing `message`/`params`. This changes existing message
text, which is normally against this migration's "byte-for-byte unchanged"
rule from Tasks 0014-0018 — that rule was about not breaking things
*during* the code→i18n migration; here the message itself is the bug, so
update any test asserting on the old interpolated text along with the fix.

### D2. Swagger fully exposed in all environments; no security headers

**File:** [main.ts:28-44](../backend/src/main.ts) (Swagger setup, whole
file for the missing `helmet()` call — confirmed absent from
`package.json`)

**Fix:** Gate `SwaggerModule.setup(...)` behind `if
(process.env.NODE_ENV !== 'production')`. Add the `helmet` package and
`app.use(helmet())` in `main.ts` (before the CORS/pipe setup).

---

## Acceptance criteria

- Subtask A's fix verified with a test proving cross-tenant `dto.tenantId`
  injection no longer works for non-SUPERADMIN roles.
- Every fix above has at least one new or updated test demonstrating the
  vulnerable path is closed (not just that the happy path still works).
- All existing backend tests still pass; `npm test` green in `backend/`.
- `npx tsc --noEmit` clean in all three apps.
- New i18n keys (if any new exceptions were introduced, e.g. for B1's
  login lockout) have full kk/ru/en parity.
- No functional regression in normal (non-attack) usage — e.g. legitimate
  SUPERADMIN cross-tenant meeting creation (Subtask A), legitimate staff
  fetching their own tenant's data (Subtask C1), legitimate file uploads
  of allowed types (Subtask B4) must all keep working exactly as before.

## Explicitly out of scope

- Refresh-token rotation/reuse-detection (the audit noted the current
  refresh flow re-issues both tokens without invalidating the prior
  refresh token — flagged as a design observation, not a numbered finding;
  worth a future task if you want it formalized, not bundled into this
  one).
- The `tokenVersion === undefined` fail-open pattern in `jwt.strategy.ts`
  — noted by the audit as defense-in-depth-only, no live exploit path
  found; not required for this task.
- Building a cookie/BFF architecture for web auth — see decision #3.
- Any new feature work — this task only closes the 12 findings listed
  above.

## Deliverable

- Can ship as multiple commits (e.g. one per subtask) or one PR — your
  call, but Subtask A should be clearly identifiable as its own commit
  given its severity, in case it needs to be cherry-picked/hotfixed
  separately.
- PR description lists all 12 findings by ID (A, B1-B4, C1-C5, D1-D2) and
  confirms which test proves each one is closed.

---

## Review addendum (2026-09-09) — 10/12 accepted outright, 2 need a follow-up fix

**Verified good — accepted, no further action:**

- **Subtask A (Critical):** confirmed correct by reading both the
  controller (still resolves `dto.tenantId` only for SUPERADMIN, exactly
  as before) and the service (now trusts only `creatorTenantId`, full
  stop). The new test explicitly attempts the injection
  (`tenantId: 'tenant-malicious-target'`) and verifies the meeting still
  lands in `tenant-authorized`. This was already committed separately as
  `eade85e` — good call keeping it isolated given the severity.
- **B2** (S3 default creds): fail-fast constructor check added, matches
  the existing `VOTE_SIGNING_KEY` pattern exactly. Verified via a
  constructor-throws test.
- **B3** (`addUnit` tenant check) + **C1** (`getTenantById` auth): both
  fixed via `assertUserBelongsToTenant`, `user` correctly threaded through
  the controller. Positive and negative test cases both present and
  passing.
- **C2** (`service-requests.createRequest` ownership check): correctly
  allows either a verified owner of the target unit OR staff of the
  matching tenant — matches how the rest of this module already
  distinguishes resident vs. staff callers.
- **C3** (rate limiting): `@nestjs/throttler` wired globally (60/min) via
  `APP_GUARD`, *plus* the specific per-route limits I asked for — chat
  send (15/min), SOS trigger (5/min), guest-pass creation (10/min). Exactly
  as scoped, nothing more, nothing less.
- **C4** (CORS): explicit env-driven allowlist, and `credentials: true`
  was dropped entirely after confirming nothing in this codebase relies on
  cookie-based auth — correct call, not just left in defensively.
- **C5** (web token storage): moved to an in-memory module-level variable,
  no cookie/BFF over-engineering — matches the scoped decision exactly.
- **D1** (error message leakage): fixed for both `uploads.service.ts` and
  the two `access-control.service.ts` Hikvision connection-error sites —
  raw `err.message`/URL removed from the client-facing message, logged
  server-side instead via `this.logger.error(..., err.stack)`. The new
  uploads test explicitly asserts the internal hostname
  (`minio.internal.lan`) never reaches the client — good, concrete
  regression protection rather than just checking a code.
- **D2** (Swagger gating + helmet): both done correctly.
- Full suite: 244/244 backend tests pass (up from 229), `tsc --noEmit`
  clean, i18n parity confirmed at 875/875/875 (web) and 634/634/634
  (mobile), the 3 new codes' translations (`AUTH.LOGIN_LOCKED`,
  `SERVICE_REQUESTS.UNIT_ACCESS_FORBIDDEN`, `UPLOADS.INVALID_MIME_TYPE`)
  checked in ru/en/kk and all factually consistent with the actual 10-minute
  lockout duration.

**B4 — incomplete: allowlist added, but no content verification, exactly
the gap the finding warned about**

The fix adds a real, well-tested mimetype allowlist (Multer `fileFilter`
+ `PresignUploadDto` `@IsIn` + a presigned-POST `content-length-range`/
`Content-Type` condition replacing the old unbounded presigned PUT) — this
part is good and closes the DoS/unbounded-size half of the finding
completely. But the original finding's XSS concern was specifically that
`file.mimetype` is **client-declared, not server-verified** — the fix
only allowlists the declared value, it never checks the actual file
bytes. A malicious upload of real HTML/SVG content with the
multipart `Content-Type` header simply lied to say `image/jpeg` sails
through both the `fileFilter` check and the service-level check
unchanged, because both only ever look at `file.mimetype`.

**Required fix:** for the direct-upload path (`uploadFile` in
`uploads.service.ts`, where `file.buffer` is already available server-side),
add real content verification via magic-byte sniffing — the `file-type`
npm package (`await fileTypeFromBuffer(file.buffer)`) is the standard tool
for this — and reject if the sniffed type isn't in `ALLOWED_MIME_TYPES` or
doesn't match `file.mimetype`. For the presigned-POST path
(`getPresignedUploadUrl`), the backend never sees the bytes before they
land in S3, so byte-level sniffing isn't possible there by construction —
that's a structural limitation, not something to force a fix for, and
it's a low-severity residual risk today since grep confirms **no web or
mobile client calls this endpoint at all yet**. Just say so explicitly in
the PR rather than leaving it unaddressed silently.

**B1 — functionally correct but untested on one path, and fragile control
flow**

`registerFailedAttempt()` is called without a `return` in both call sites
(`if (!user || !user.passwordHash) { await registerFailedAttempt(); }` and
the `isMatch` check) — this works today only because
`registerFailedAttempt` is written to *always* throw in every branch
(either `AUTH.LOGIN_LOCKED` or, falling through, `AUTH.INVALID_CREDENTIALS`),
so `bcrypt.compare(password, user.passwordHash)` on the next line never
actually executes when `user` is null. I traced every branch by hand to
confirm this is correct as-written. But it's an implicit invariant with no
enforcement — if `registerFailedAttempt` is ever refactored to add an
early return in some new branch, this silently starts crashing on
`Cannot read property 'passwordHash' of null` instead of rejecting
cleanly. There is also **no test at all for a login attempt against a
phone/email that doesn't exist** — every new test in this task uses
`mockUser`, so this exact path (the one relying on the fragile invariant)
has zero coverage.

**Required fix:** add `return` before both `await registerFailedAttempt();`
calls (no behavior change, just makes the control flow explicit and safe
against future refactors), and add one test case: `loginWithPassword`
with a `login` that doesn't match any user (`findFirst` resolves `null`)
should throw `AUTH.INVALID_CREDENTIALS` without touching `bcrypt.compare`.

**Everything else in this task stays accepted** — only B4 and B1 need
another pass before this task is fully closed.

### Addendum resolution (2026-09-09) — Both fixes applied & verified:

1. **B4 (Magic-byte sniffing / real content verification)**:
   - Installed `file-type` and integrated `FileType.fromBuffer(file.buffer)` into `uploads.service.ts` direct-upload path.
   - Files are rejected with `UPLOADS.INVALID_MIME_TYPE` if the sniffed type is not in `ALLOWED_MIME_TYPES` or does not match `file.mimetype`.
   - Added automated test in `uploads.service.spec.ts` asserting that spoofed uploads (declared `image/jpeg` with HTML/SVG bytes) are rejected with `UPLOADS.INVALID_MIME_TYPE`.
   - Structural limitation on presigned-POST noted: backend never receives bytes directly on presigned path; risk is low as no client invokes this endpoint currently.

2. **B1 (Explicit control flow & missing user test)**:
   - Added explicit `return` statements before both `await registerFailedAttempt();` calls in `loginWithPassword`.
   - Added automated test in `auth.service.spec.ts` asserting that an unknown user (`findFirst` -> `null`) throws `AUTH.INVALID_CREDENTIALS` without calling `bcrypt.compare`.

