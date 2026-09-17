# Task 0082: Staff account list/edit/deactivate + self-service password reset

**Status:** Done
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ feature, direct follow-up to
[Task 0023](0023-platform-tenant-onboarding.md), which built
`SUPERADMIN`-only staff **creation** (`POST
/properties/tenants/:tenantId/staff`) and explicitly listed both of
this task's halves as future work: "A general 'forgot password' /
self-service reset flow for staff... a reasonable follow-up if wanted
later" and "Editing/deactivating existing staff accounts, changing a
staff member's role after creation, or removing a tenant — this task
is scoped to *creation* only." Today, once a staff account exists,
there is genuinely no way to see it again from the web (`GET
/properties/tenants/:tenantId/staff` doesn't exist), no way to
deactivate one (unlike residents, which got this in
[Task 0003](0003-residents-registry.md)), and no way for a staff
member who forgot their password to get back in — the only path back
in after losing a password is a `SUPERADMIN` manually doing something
at the database level.

**Important security finding, discovered while researching this task
— read before designing the reset flow:** `AuthService.verifyOtp`
([auth.service.ts:138-...](../backend/src/modules/auth/auth.service.ts#L138))
is **role-agnostic** — it looks up `where: { phone }` with no role
filter, and on a correct code, **finds-or-creates a resident user and
issues full login tokens**, for *any* phone number, staff included.
This means the existing public `/auth/request-otp` +
`/auth/verify-otp` pair, intended for resident login, can *already*
fully authenticate as an existing staff account today if someone can
receive an SMS sent to that staff member's phone — a de facto
password bypass that predates this task and isn't part of what this
task is fixing. **Do not reuse `verifyOtp` for this task's staff
password reset** — it would compound the exact same problem (route a
staff phone through a path that also auto-issues session tokens). This
finding is flagged separately as its own follow-up; this task's own
new endpoints must be designed to *not* have this property (decision
#4 below).

### Architecture decisions already made — do not re-litigate

1. **Staff account read/edit/deactivate stays `SUPERADMIN`-only**,
   matching Task 0023's own creation endpoint's role gate exactly — no
   new authorization model, no `HOA_ADMIN`-manages-their-own-staff
   tier introduced here. If that's wanted later, it's a deliberate,
   separate authorization decision.
2. **New `GET /properties/tenants/:tenantId/staff`** — lists
   `HOA_ADMIN`/`HOA_CHAIRMAN`/`DISPATCHER`/`SECURITY` users for that
   tenant (`role: { in: [...] }`, `tenantId`), returning `id,
   firstName, lastName, phone, email, role, isActive, mustChangePassword,
   createdAt` — no password/hash fields, obviously.
3. **New `PATCH /properties/tenants/:tenantId/staff/:userId`** —
   edits `firstName`/`lastName`/`email` and toggles `isActive`, on an
   existing staff user only (reject if the target isn't one of the
   four staff roles or belongs to a different tenant, mirroring
   `updateResidentStatus`'s existing `PROPERTIES.STATUS_MANAGEMENT_RESIDENTS_ONLY`-style
   guard but inverted — this endpoint is staff-only, reject residents).
   **Role changes are explicitly out of scope for this endpoint** (see
   "Explicitly out of scope") — don't let `PATCH` silently accept a
   `role` field.
4. **Self-service reset is a dedicated two-step flow that never issues
   session tokens itself** — `POST /auth/staff/forgot-password { phone
   }` then `POST /auth/staff/reset-password { phone, code, newPassword
   }`. After a successful reset, the response is `{ success: true }`
   only; the staff member must then log in normally with
   `loginWithPassword` using the new password. This is the key
   difference from `verifyOtp`'s resident behavior (per the Context
   section's finding) and from
   [Task 0023](0023-platform-tenant-onboarding.md)'s
   `set-initial-password` (which *does* return tokens, because that
   flow starts from an already-issued `password_change`-typed token
   handed out by a real login attempt — this flow starts from nothing
   but a phone number, a materially different trust level that
   shouldn't end in an active session).
5. **OTP verification logic is extracted into a shared private
   helper, not duplicated.** `verifyOtp`'s lockout-check /ratelimit-respecting
   /timing-safe-compare/attempt-counting logic (roughly the first
   two-thirds of that method, before it starts touching `User` rows)
   is generic OTP verification that has nothing to do with residents
   specifically. Extract it into a private `verifyOtpCode(phone: string,
   code: string): Promise<void>` (throws the same `AUTH.OTP_*` errors
   on failure, returns normally on success, clears the Redis entry) and
   have both the existing `verifyOtp` and this task's new
   `resetStaffPassword` call it — don't copy-paste the lockout/attempt
   logic a second time.
6. **`forgotPassword` sends the exact same SMS-OTP the resident flow
   already sends (`requestOtp`'s existing rate-limit/lockout
   behavior), but only after confirming the phone belongs to an active
   staff account** — if the phone doesn't exist or belongs to a
   resident/`SUPERADMIN`, reject with a clear error before ever calling
   `requestOtp` (don't send an SMS for a phone that can't complete this
   flow). This project doesn't otherwise harden against account-
   existence enumeration anywhere (`requestOtp`'s resident flow doesn't
   either — it silently registers new residents), so a plain rejection
   here (not a deliberately vague "if this phone exists..." response)
   is consistent with the rest of the codebase's existing style, not a
   new, inconsistent hardening decision.
7. **On successful reset: hash+set the new password, `mustChangePassword:
   false`, and bump `tokenVersion`** — the same
   session-invalidation-on-credential-change pattern
   [Task 0023](0023-platform-tenant-onboarding.md)'s
   `set-initial-password` already established, so any session issued
   before the reset (however it was obtained) stops working.
8. **Web: extend
   [tenants/page.tsx](../frontend-web/src/app/dashboard/tenants/page.tsx),
   don't build a new page.** It already has the per-tenant "Добавить
   сотрудника" form (Task 0023); add a staff list section per tenant
   (using the new `GET .../staff` endpoint) with an "Активен/Деактивирован"
   toggle and a simple edit form, right next to where staff are
   created — this is a natural extension of an existing page, not a
   new freestanding concern (unlike Task 0041's audit log, which
   correctly *did* get its own new page for a different reason).
9. **No forgot-password UI on the web staff-management page** — that
   flow is for a staff member who is locked out, not for the
   `SUPERADMIN` managing them; it needs its own entry point on the
   **login page** (wherever `frontend-web`'s staff/admin login form
   currently lives), not on `tenants/page.tsx`.

---

## Subtask A — Backend: list/edit/deactivate staff

- `GET /properties/tenants/:tenantId/staff` — `@Roles(SUPERADMIN)`,
  per decision #2.
- `PATCH /properties/tenants/:tenantId/staff/:userId` — `@Roles(SUPERADMIN)`,
  per decision #3. New `UpdateStaffDto` (`firstName?`, `lastName?`,
  `email?`, `isActive?` — no `role` field).
- Consider whether this warrants an `AuditLogService` call (this
  project's own precedent from [Task 0041](0041-staff-audit-trail.md)/
  [Task 0081](0081-audit-log-expansion.md) treats "who deactivated
  whom" as exactly the kind of high-consequence action worth logging)
  — if `Task 0081` has already landed by the time this task is
  implemented, add a `STAFF_ACCOUNT_UPDATED` action following that
  same pattern; if not, it's fine to skip and let a future audit-log
  expansion pick it up, your call, but state which you did in the PR
  description.

**Tests:** extend `properties.service.spec.ts` — listing returns only
the four staff roles for the given tenant, not residents; a non-
`SUPERADMIN` caller is rejected; editing a resident's user id through
this endpoint is rejected; deactivating a staff account sets
`isActive: false` and (if a real login-blocking check exists elsewhere
for `isActive`, confirm it — check `loginWithPassword`'s existing
`isActive` handling rather than assuming) actually blocks their next
login attempt.

## Subtask B — Backend: OTP verification extraction + staff reset flow

- Extract `verifyOtpCode(phone, code): Promise<void>` from `verifyOtp`
  per decision #5; refactor `verifyOtp` to call it, confirming its
  existing behavior/tests are unchanged (this is a refactor of already-
  shipped, already-tested code — don't change resident login behavior).
- `AuthService.forgotStaffPassword(phone)`: look up the user by phone;
  reject (`AUTH.STAFF_ACCOUNT_NOT_FOUND` or similar) if not found, not
  active, or not one of the four staff roles (decision #6); otherwise
  call the existing `requestOtp` and return its result as-is.
- `AuthService.resetStaffPassword(phone, code, newPassword)`: call
  `verifyOtpCode(phone, code)` (decision #5); re-fetch and re-validate
  the same staff-role/active checks as `forgotStaffPassword` (the
  account's state could have changed between the two calls); validate
  `newPassword` with the same minimum-strength rule
  [Task 0023](0023-platform-tenant-onboarding.md)'s
  `set-initial-password` already uses (don't invent a second policy);
  hash, update `passwordHash`, `mustChangePassword: false`, bump
  `tokenVersion` (decision #7); return `{ success: true }` only
  (decision #4 — no tokens).
- `AuthController`: `POST /auth/staff/forgot-password` and `POST
  /auth/staff/reset-password`, no `JwtAuthGuard` (unauthenticated by
  necessity, same as `/auth/request-otp`/`/auth/verify-otp`).

**Tests:** extend `auth.service.spec.ts` — `forgotStaffPassword`
rejects a resident phone, a nonexistent phone, and a deactivated staff
phone, all with a clear error and **without** calling `requestOtp` in
the rejected cases (proving the "don't send an SMS for a phone that
can't complete this flow" property from decision #6); `resetStaffPassword`
with a valid code succeeds, sets `mustChangePassword: false`, bumps
`tokenVersion`, and the response contains no tokens; an old token
minted before the reset is rejected afterward (`tokenVersion` mismatch,
mirroring Task 0023's own test for the same property); the shared
`verifyOtpCode` extraction didn't change any existing `verifyOtp`
test's outcome (rerun that suite, don't just eyeball the diff).

## Subtask C — Web

- [tenants/page.tsx](../frontend-web/src/app/dashboard/tenants/page.tsx):
  per-tenant staff list (name, role, phone, active/inactive badge),
  edit modal (name/email), and an activate/deactivate toggle with a
  confirmation dialog for deactivation (matching
  [Task 0003](0003-residents-registry.md)'s resident-deactivation
  confirmation UX, not a bare unconfirmed toggle).
- Staff login page: add a "Забыли пароль?" link/flow implementing
  decision #9's phone → OTP → new-password steps, calling the two new
  endpoints. Check what the current staff/admin login page component
  is named before assuming a path.
- Full kk/ru/en i18n parity for all new text.

---

## Acceptance criteria

- A `SUPERADMIN` can list, edit, and deactivate any tenant's staff
  accounts from the web; no other role can.
- A deactivated staff account cannot log in (verify against whatever
  `loginWithPassword` already does with `isActive`, don't assume).
- A staff member who forgot their password can reset it via phone +
  SMS code and log in with the new password afterward — but the reset
  flow itself never returns a usable session token.
- `resetStaffPassword` rejects a resident's phone number with a clear
  error and never sends that phone an SMS.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/` and `frontend-web/`; full kk/ru/en i18n parity maintained.

## Explicitly out of scope

- Changing a staff member's `role` after creation — decision #3, a
  separate, more disputable authorization decision (role escalation
  risk) if ever wanted.
- `HOA_ADMIN` managing their own tenant's staff — decision #1, stays
  `SUPERADMIN`-only for now.
- Fixing `verifyOtp`'s pre-existing role-agnostic auto-login behavior
  described in the Context section — that's a separate, already-
  existing issue this task deliberately works around rather than
  fixes; raise it as its own task if a fix is wanted.
- Mobile UI — staff provisioning/management has stayed web-only since
  Task 0023.
- Removing a tenant — never in scope for any task in this sequence.

## Deliverable

- Backend (list/edit/deactivate, OTP extraction, reset flow) and web
  can ship as separate commits.
- PR description explicitly confirms: (a) the `verifyOtpCode`
  extraction didn't change `verifyOtp`'s existing resident-login test
  outcomes, and (b) `resetStaffPassword`'s response never contains a
  token — the two properties this task's design most depends on.
