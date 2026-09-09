# Task 0014: Backend error codes — foundation + auth/votings migration

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Since [Task 0004](0004-i18n-foundation.md), architecture decision #3 has
stood as an accepted, temporary gap: every hand-thrown exception across the
NestJS backend is a hardcoded Russian string, shown to users verbatim via
`getApiErrorMessage()` (mobile) / the web's error handling in
[lib/api.ts](../frontend-web/src/lib/api.ts). UI chrome is now fully
multilingual across 13 feature modules, but the moment something goes
wrong — wrong PIN, expired OTP, booking conflict, whatever — the message is
Russian regardless of the user's chosen language. This task closes that
gap, following the same **foundation-then-rest** split already used
successfully for the original i18n rollout (Task 0004 built the
infrastructure and migrated one reference slice; [Task 0005](0005-i18n-remaining-screens.md)
did the rest). This task builds the mechanism and migrates two reference
modules (`auth`, `votings`); every other module's exceptions are explicitly
tracked as follow-up, not done here — see "Explicitly out of scope."

### Architecture decisions already made — do not re-litigate

1. **Error codes, not server-side translation.** Don't add a backend i18n
   library (e.g. `nestjs-i18n`) — that would be a second, parallel i18n
   system alongside the client-side i18next already established twice over
   (mobile + web), which Task 0004 explicitly chose over any
   server-rendering approach. Instead: the backend attaches a stable,
   machine-readable `code` (plus `params` for interpolated values) to each
   exception; the **client** resolves `code` → localized string using its
   own existing i18next instance, in a new `errors` namespace. This reuses
   infrastructure that already exists on both clients instead of building
   a third translation mechanism.
2. **No new package needed.** NestJS's built-in `HttpException` (and its
   subclasses — `BadRequestException`, `ForbiddenException`, etc.) already
   accept an object instead of a string as their first constructor
   argument: `throw new BadRequestException({ code: 'AUTH.OTP_EXPIRED',
   message: 'Срок действия SMS-кода истек...' })`. NestJS serializes that
   object directly as the JSON response body (merging in `statusCode`).
   This is a mechanical, additive change to existing `throw` statements —
   not a new subsystem.
3. **The Russian `message` field stays, always.** It's not being replaced
   — it remains the fallback for any error whose `code` the client doesn't
   yet recognize (i.e. every not-yet-migrated exception in modules outside
   this task's scope), what appears in server logs and Swagger docs, and
   what keeps this a **non-breaking, incremental** migration. A client that
   sees no `code` field, or an unrecognized one, behaves exactly as today.
4. **This is very likely backward-compatible with existing tests almost
   for free.** NestJS's `HttpException` derives its own `.message` from an
   object argument's `message` property, so `expect(...).rejects.toThrow('Неверный SMS-код')`-style
   assertions (substring-matched against `error.message`) should keep
   passing unchanged once a throw site is converted to the object form,
   as long as the `message` text itself doesn't change. **Verify this
   assumption first** by converting one exception and running the existing
   suite before mechanically converting the rest — if it doesn't hold for
   some reason, stop and flag it rather than rewriting all existing
   assertions blind.
5. **DTO/`class-validator` validation messages are a different mechanism
   and explicitly out of scope here.** Messages set via decorators like
   `@Matches(..., { message: '...' })` flow through NestJS's
   `ValidationPipe` into an array of strings, not through a single
   exception object this task's pattern can easily attach a `code` to.
   Localizing those is a distinct problem for a future task — don't try to
   solve it here, and don't be surprised that validation errors (e.g.
   "PIN-код должен состоять ровно из 4 или 6 цифр") stay Russian-only after
   this task.

---

## Subtask A — Client-side error resolution (do this first — it's what
## makes any backend change actually visible)

**Mobile:** update `getApiErrorMessage()` in
[client.ts](../mobile/src/api/client.ts):
```ts
export function getApiErrorMessage(error: any): string {
  const code = error?.response?.data?.code;
  const params = error?.response?.data?.params;
  if (code && i18n.exists(`errors.${code}`)) {
    return i18n.t(`errors.${code}`, params);
  }
  if (error?.response?.data?.message) { /* existing behavior unchanged */ }
  ...
}
```
(exact shape is illustrative — match this file's existing style; `i18n` is
the instance from [mobile/src/i18n/index.ts](../mobile/src/i18n/index.ts)).
Add an `errors` namespace, empty for now, to all three mobile locale files.

**Web:** [lib/api.ts](../frontend-web/src/lib/api.ts)'s `apiRequest`
currently reads `errData.message` and discards everything else in the
error body. Capture `errData.code`/`errData.params` onto the thrown
`Error` object (e.g. `(err as any).code = errData.code; (err as any).params = errData.params;`)
so calling code can resolve it. This codebase's pages all currently do
`err.message || t('...')`-style fallback handling inline per-page (see any
page from Task 0005 onward) — rather than touching every page in this
task, add a small shared helper (e.g. `getApiErrorMessage(err, t)` exported
from `lib/api.ts` itself) that pages **can** adopt, and adopt it in the two
pages most relevant to this task's scope (the login page, since
`loginWithPassword` errors surface there) — don't do a sweep of every page
in this task, that's the same kind of scope creep Task 0005 deliberately
avoided by splitting foundation from full migration.

## Subtask B — Backend: migrate `auth.service.ts`

Convert every hand-thrown exception in
[auth.service.ts](../backend/src/modules/auth/auth.service.ts) to the
`{ code, message, params? }` shape. Suggested codes (namespace `AUTH.*`,
adjust as needed once you're looking at the real call sites — this is a
starting reference, not a rigid spec to copy blindly):
- `AUTH.PHONE_LOCKED` — "Номер временно заблокирован..."
- `AUTH.OTP_RATE_LIMITED` — "Слишком частый запрос кода..."
- `AUTH.OTP_EXPIRED` — "Срок действия SMS-кода истек..."
- `AUTH.OTP_INVALID` — "Неверный SMS-код. Осталось попыток: N" — carries
  `params: { remaining: N }`, message stays interpolated for the fallback
  text, the `errors.AUTH.OTP_INVALID` locale string uses `{{remaining}}`
  the same way every other interpolated key in this codebase already does.
- `AUTH.OTP_MAX_ATTEMPTS` — "Превышено максимальное количество попыток..."
- `AUTH.INVALID_CREDENTIALS` — "Неверный логин или пароль"
- `AUTH.REFRESH_TOKEN_INVALID` — "Недействительный или истекший
  refresh-токен"
- `AUTH.SESSION_REVOKED` — "Сессия завершена (токен отозван)..."

Add matching `errors.AUTH.*` keys with full kk/ru/en translations to
**both** apps' locale files (login-with-password errors can surface on
web; OTP errors mostly surface on mobile, but keep both apps' `errors`
namespace consistent rather than splitting which app gets which keys).

## Subtask C — Backend: migrate `votings.service.ts`

Same treatment for
[votings.service.ts](../backend/src/modules/votings/votings.service.ts).
Reference codes (`VOTINGS.*`):
- `VOTINGS.MEETING_NOT_FOUND`, `VOTINGS.ZERO_TOTAL_AREA`,
  `VOTINGS.CROSS_TENANT_FORBIDDEN`, `VOTINGS.MEETING_NOT_ACTIVE`,
  `VOTINGS.OUTSIDE_VOTING_PERIOD`, `VOTINGS.NOT_ELIGIBLE_VOTER`,
  `VOTINGS.UNIT_TENANT_MISMATCH`, `VOTINGS.ALREADY_VOTED`.

**Tests:** extend both modules' existing spec files to assert on `.code`
for at least the cases above (in addition to, not instead of, whatever
existing message-based assertions still pass per decision #4).

---

## Acceptance criteria

- Every hand-thrown exception in `auth.service.ts` and `votings.service.ts`
  carries a `code` (and `params` where the message is interpolated).
- The `message` field is unchanged Russian text in every case (no wording
  changes as a side effect of this refactor).
- Mobile's `getApiErrorMessage()` and the web's new shared helper correctly
  resolve a known `code` to the user's selected language, and fall back to
  `message` for any code they don't recognize.
- All existing backend tests for these two modules still pass; new
  assertions added for `.code`.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in all three
  apps; full kk/ru/en key parity in the new `errors` namespace on both
  mobile and web.

## Explicitly out of scope

- Every other backend module's exceptions (properties, finance, meters,
  bookings, access-control, sos, community-board, chat, service-requests,
  announcements, analytics, uploads, notifications) — tracked in
  [PROGRESS.md](PROGRESS.md) as follow-up work once this pattern is
  validated, same relationship Task 0005 had to Task 0004.
- `class-validator` DTO validation messages — see decision #5.
- A sweep of every frontend-web page to adopt the new shared error helper
  — see Subtask A's note.
- Any change to exception types, HTTP status codes, or existing message
  wording.

## Deliverable

- PR description should confirm: the `toThrow` backward-compatibility
  assumption (decision #4) was verified early, not assumed throughout: `message`
  text is byte-for-byte unchanged from before this task everywhere it's
  used, and the list of modules NOT migrated in this pass is stated
  explicitly so it can become the next task directly.
