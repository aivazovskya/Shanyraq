# Task 0083: Localize class-validator DTO validation error messages

**Status:** Done
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Beyond-ТЗ cleanup, closing a gap [Task 0014](0014-backend-error-codes.md)
decision #5 explicitly deferred and every one of its three follow-up
waves ([Task 0016](0016-error-codes-properties-finance-meters.md),
[0017](0017-error-codes-bookings-access-control.md),
[0018](0018-error-codes-remaining-modules.md)) explicitly repeated as
still-out-of-scope: **`class-validator` DTO validation error messages
(`@IsString`, `@MinLength`, `@Matches`, etc.) remain un-migrated to the
`{ code, message, params? }` error-code convention every other
exception in this backend already uses.** Today, submitting an invalid
value to almost any endpoint (missing required field, wrong format,
string too short/long, invalid enum value) returns NestJS's default
`ValidationPipe` shape — `{ statusCode: 400, message: string[], error:
'Bad Request' }`, where each string is the hardcoded Russian text
already written inline in that field's decorator (e.g. `@Matches(...,
{ message: 'Номер телефона должен быть в формате +7XXXXXXXXXX' })`).
There is no `code` field at all, so `kk`/`en` users hit any form
validation error and see raw Russian text — the one remaining place in
the entire backend where this happens, confirmed by three separate
prior tasks all noting the same gap and choosing not to fix it inline.

**Researched, not guessed — the actual scope, confirmed by grepping
every `*.dto.ts` file in `backend/src/modules/**/dto/`:** exactly 18
unique `class-validator` decorators are used across the whole backend
(`@IsString` ×98, `@IsOptional` ×85, `@IsNotEmpty` ×58, `@IsNumber`
×22, `@IsEnum` ×17, `@Min` ×16, `@IsBoolean` ×12, `@Matches` ×11,
`@Max` ×6, `@MinLength` ×6, `@IsISO8601` ×8, `@MaxLength` ×4, `@IsIn`
×4, `@IsInt` ×3, `@Length` ×3, `@IsDateString` ×2, `@IsEmail` ×2,
`@IsArray` ×2). **No custom `ValidatorConstraint` classes exist
anywhere in the backend** — every single validation rule in this
project is a stock `class-validator` decorator. `main.ts`'s
`app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform:
true, forbidNonWhitelisted: false }))` has no `exceptionFactory` —
confirmed directly, it's the one and only place validation errors get
turned into an HTTP response.

### Architecture decisions already made — do not re-litigate

1. **One `exceptionFactory` on the global `ValidationPipe`, not
   touching any of the ~16 individual `*.dto.ts` files.** This is the
   single highest-leverage fix available: every validation error in
   the entire backend already funnels through this one `ValidationPipe`
   instance. Adding an `exceptionFactory` there converts every field's
   error, in every DTO, in one place — versus hand-editing dozens of
   files to add `code`s to every individual `{ message: '...' }`,
   which would be slow, error-prone, and exactly the kind of "touch
   everything" change this project's own history (three prior tasks
   punting on this) shows is worth avoiding in favor of a single
   surgical fix point.
2. **A small, fixed set of ~9 generic `VALIDATION.*` codes, mapped
   from `class-validator`'s constraint-key names — not one code per
   DTO field.** A field-per-code scheme would need hundreds of codes
   (one per field across ~16 DTO files) and doesn't scale; a
   constraint-per-code scheme needs exactly as many codes as there are
   *kinds* of validation failure, which is small and closed (the 18
   decorators above collapse into far fewer distinct failure
   *categories*). Mapping (verify each `class-validator` constraint
   key's exact spelling empirically — e.g. by logging a caught
   `ValidationError[]`'s `.constraints` object during manual testing —
   rather than assuming; class-validator's key naming isn't always the
   literal lowercased decorator name):
   - `isNotEmpty` → `VALIDATION.REQUIRED`
   - `isString` / `isNumber` / `isBoolean` / `isInt` / `isArray` →
     `VALIDATION.INVALID_TYPE`
   - `matches` / `isEmail` / `isISO8601` / `isDateString` →
     `VALIDATION.INVALID_FORMAT`
   - `isEnum` / `isIn` → `VALIDATION.INVALID_VALUE`
   - `minLength` / the `@Length` decorator's constraint key (verify
     its exact name) → `VALIDATION.TOO_SHORT`
   - `maxLength` → `VALIDATION.TOO_LONG`
   - `min` → `VALIDATION.MIN_VALUE`
   - `max` → `VALIDATION.MAX_VALUE`
   - anything not in this map → `VALIDATION.INVALID_FIELD` (a
     deliberate catch-all fallback, per decision #6, so a decorator
     added later without updating this map degrades to a generic-but-
     still-translated message instead of crashing or silently losing
     its `code`).
3. **`params: { field: <property name> }`, using the raw DTO property
   name as-is (e.g. `phone`, `guestPlateNumber`) — no field-name
   translation table.** Building and maintaining a translated label for
   every field across every DTO in the app (potentially hundreds) is
   real, ongoing maintenance burden for a cosmetic improvement;
   showing the technical field name inside an otherwise-translated
   sentence (`"Поле «phone» обязательно для заполнения"` /
   `"«phone» field is required"`) is a common, accepted pattern for
   generic validation messages and is the pragmatic tradeoff here — a
   deliberate simplification, not an oversight, and one that keeps
   this task from silently ballooning into a much bigger one.
4. **Only the *first* validation error is turned into the structured
   `code`/`params`, matching every other exception in this codebase's
   "one specific problem" shape.** `class-validator` can report
   multiple simultaneously-invalid fields in one response; every
   *other* exception in this app (custom `{ code, message }` throws)
   describes exactly one problem, and the frontend error helpers
   (`getApiErrorMessage` in both `frontend-web/src/lib/api.ts` and
   `mobile/src/api/client.ts`) are built around a single `code`+
   `params` pair, not an array. Don't redesign that contract for this
   task — take the first `ValidationError`'s first constraint, ignore
   the rest for the structured fields (the full original message list
   can still go in the `message` field, see decision #5, for
   debugging/Swagger visibility).
5. **`message` stays a human-readable string (not an array), built
   from the *existing* custom Russian text already on that decorator**
   (`error.constraints[key]`) — this is a pure additive change to the
   response shape, not a rewrite of any DTO's existing `{ message:
   '...' }` text. Both frontend error helpers already defensively
   handle `Array.isArray(msg) ? msg.join(', ') : msg` for the `message`
   field, so switching it from an array to a single string is
   backward-compatible with existing consumers, not a breaking change.
6. **New `errors.VALIDATION.*` keys added to both frontend
   dictionaries (`frontend-web/src/i18n/locales/{ru,kk,en}.json` and
   `mobile/src/i18n/locales/{ru,kk,en}.json`)** — the 9 codes from
   decision #2, each written fresh in all three languages (this is a
   deliberate, acknowledged precision tradeoff vs. today's Russian-only
   text: the new `ru` version will be a *generic* templated message
   like `"Поле «{{field}}» обязательно для заполнения"` rather than
   today's per-field bespoke wording like `"Номер телефона должен быть
   в формате +7XXXXXXXXXX"` — full 3-language parity is the goal here,
   not preserving every existing message's exact specificity. State
   this tradeoff explicitly in the PR description so it isn't mistaken
   for an unintentional wording regression.
7. **No changes to any `*.dto.ts` file's existing decorators or
   messages** — every existing custom `{ message: '...' }` string
   stays exactly as it is; it's still used as this new response
   shape's `message` field (decision #5), just no longer the *only*
   thing the frontend has to display.

---

## Subtask A — Backend: global exceptionFactory

- In [main.ts](../backend/src/main.ts), add an `exceptionFactory` to
  the existing `ValidationPipe` config:
  - Take `errors: ValidationError[]` (Nest's `exceptionFactory`
    signature), find the first error with a non-empty `constraints`
    object.
  - Map its first constraint key to one of the 9 `VALIDATION.*` codes
    per decision #2 (a plain object/`Map` lookup, fallback to
    `VALIDATION.INVALID_FIELD`).
  - Build `message` from that constraint's existing rendered string
    (`error.constraints[key]`) per decision #5.
  - Return (throw) a `BadRequestException({ code, message, params: {
    field: error.property } })` — same exception type Nest's default
    behavior already throws, just with this project's own body shape
    instead of the default one.
  - If `errors` is somehow empty (shouldn't happen, but don't let it
    crash), fall back to a generic `VALIDATION.INVALID_FIELD` with no
    `field` param rather than throwing an unrelated error.

**Tests:** add `main.spec.ts` or extend an existing e2e/pipe-level test
(check what test infrastructure, if any, already exercises the
`ValidationPipe` directly — if none exists, a small standalone unit
test constructing a `ValidationError[]` fixture and calling the
extracted `exceptionFactory` function directly is fine, doesn't need a
full Nest app bootstrap):
- Each of the 9 mapped constraint keys produces its corresponding
  code.
- An unmapped/unknown constraint key falls back to
  `VALIDATION.INVALID_FIELD` rather than throwing or returning
  `undefined`.
- `params.field` matches the actual invalid property's name.
- `message` is a single string (not an array), preserving the
  decorator's existing custom text.
- Spot-check a handful of *real* endpoints end-to-end (e.g. `POST
  /auth/staff/reset-password` with a short password, `POST
  /properties/tenants/:id/staff` with a malformed phone) to confirm
  the actual HTTP response now has `code`/`params`, not just the unit
  test in isolation — a global pipe change is exactly the kind of
  thing that can look right in isolation and still not wire up
  correctly against real routes.

## Subtask B — Frontend i18n

- Add `errors.VALIDATION.REQUIRED` / `INVALID_TYPE` / `INVALID_FORMAT`
  / `INVALID_VALUE` / `TOO_SHORT` / `TOO_LONG` / `MIN_VALUE` /
  `MAX_VALUE` / `INVALID_FIELD` to
  `frontend-web/src/i18n/locales/{ru,kk,en}.json` and
  `mobile/src/i18n/locales/{ru,kk,en}.json`, each interpolating
  `{{field}}` (and `{{min}}`/`{{max}}` are **not** available as params
  per decision #3 — don't write a template that expects them; a
  generic "too short/too long" wording without the exact limit number
  is the correct, achievable message here, not a bug).
- No code changes needed in either app's `getApiErrorMessage` — both
  already prefer `code`+`params` translation over raw `message` when a
  `code` is present (confirmed in both `frontend-web/src/lib/api.ts`
  and `mobile/src/api/client.ts`); these new codes just need to *exist*
  in the dictionaries to be picked up automatically.

---

## Acceptance criteria

- Any `class-validator` validation failure on any endpoint now returns
  `{ code: 'VALIDATION.*', message: string, params: { field: string }
  }` instead of the default `{ message: string[] }` shape.
- All 9 codes are reachable (proven by the mapped-constraint tests) and
  an unmapped constraint degrades to `VALIDATION.INVALID_FIELD` instead
  of breaking.
- A `kk`/`en` user submitting an invalid form now sees a translated
  message instead of raw Russian text, for at least the two spot-
  checked real endpoints in Subtask A's tests.
- `npm test` passes in `backend/`; `npx tsc --noEmit` clean in
  `backend/`, `frontend-web/`, and `mobile/`; full kk/ru/en i18n parity
  maintained in both frontend dictionaries.

## Explicitly out of scope

- Rewriting any individual DTO's existing custom validation message
  text — decision #7, those stay untouched and are reused as the new
  `message` field.
- Translated field-name labels — decision #3, a deliberate
  simplification.
- Reporting more than one simultaneously-invalid field in a single
  structured response — decision #4; the existing single-`code`
  frontend contract stays as-is.
- Any change to how *non*-validation exceptions are shaped — this task
  touches only the `ValidationPipe`'s `exceptionFactory`, nothing about
  the existing `{ code, message, params? }` convention every other
  hand-thrown exception already follows correctly.

## Deliverable

- Backend and both frontend i18n additions can ship as separate
  commits.
- PR description explicitly states the decision #6 tradeoff (generic
  templated `ru` wording replacing today's bespoke per-field Russian
  text) so it reads as an intentional decision, not a wording
  regression, and confirms the two real-endpoint spot-checks' actual
  HTTP response bodies.
