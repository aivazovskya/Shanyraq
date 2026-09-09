# Task 0016: Backend error codes — properties/finance/meters migration

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

[Task 0014](0014-backend-error-codes.md) built the `{code, message, params?}`
exception mechanism and migrated `auth`/`votings` as the reference slice.
This task is the first follow-up wave, migrating three more modules:
[properties.service.ts](../backend/src/modules/properties/properties.service.ts)
(18 throw sites), [finance.service.ts](../backend/src/modules/finance/finance.service.ts)
(9 throw sites), [meters.service.ts](../backend/src/modules/meters/meters.service.ts)
(12 throw sites). **Do not re-read Task 0014's Subtask A** (client-side
resolution) — it's already done and working; this task is backend-only.

### Architecture decisions already made — do not re-litigate

1. Same mechanism as Task 0014: convert `throw new XException('Russian
   string')` to `throw new XException({ code: 'MODULE.CASE', message:
   'ровно тот же русский текст, без изменений' })`. **The `message` text
   must stay byte-for-byte identical to what it replaces** — this is a
   backward-compatibility requirement (existing `.rejects.toThrow('...')`
   test assertions match against it), not a style preference.
2. No client-side changes needed — `getApiErrorMessage()` (mobile) and
   `lib/api.ts` (web) already resolve any `code` present in an error
   response against the `errors` i18n namespace; this task only adds new
   keys under `errors.PROPERTIES.*`, `errors.FINANCE.*`, `errors.METERS.*`
   to both apps' locale files.
3. `class-validator` DTO messages are still out of scope (same as Task
   0014 decision #5) — only hand-thrown `XException(...)` calls in the
   three `.service.ts` files listed above.
4. Interpolated messages (the ones with a template literal, e.g. finance's
   "Суммарная доля... {previous}% + {new}% = {total}%"-style messages in
   properties.service.ts) need a `params` object, same pattern as Task
   0014's `AUTH.OTP_INVALID` (`params: { remaining: N }`) — the interpolated
   values go in `params`, and the locale string uses `{{placeholder}}`
   interpolation the same way every other interpolated key in this
   codebase already does.

---

## Subtask A — `properties.service.ts` (18 throw sites)

Convert every exception below (line numbers as of this task's writing —
verify against the current file since line numbers shift). Suggested
codes (`PROPERTIES.*`, adjust freely if a case is actually two distinct
situations sharing one line today):

- `PROPERTIES.COMPLEX_NOT_FOUND` — "Жилой комплекс не найден" (appears
  twice, lines ~91, ~132 — same code, same message, both fine to share it)
- `PROPERTIES.BLOCK_NOT_FOUND` — "Блок/дом не найден"
- `PROPERTIES.UNIT_NOT_FOUND` — "Квартира/помещение не найдено"
- `PROPERTIES.OWNERSHIP_REQUEST_EXISTS` — "Заявка на привязку этого
  объекта уже существует"
- `PROPERTIES.INVALID_SHARE_RANGE` — "Доля собственности должна быть в
  диапазоне от 0.01% до 100%"
- `PROPERTIES.SHARE_EXCEEDS_TOTAL` — the "Суммарная доля собственности...
  не может превышать 100%" message (line ~214) — carries `params` for
  whatever values are interpolated into it
- `PROPERTIES.OWNERSHIP_NOT_FOUND` — "Запись о праве собственности не
  найдена"
- `PROPERTIES.CROSS_TENANT_VERIFY_FORBIDDEN` — the "Доступ запрещен: вы
  не можете верифицировать права собственности в другом жилом комплексе"
  message
- `PROPERTIES.CONFIRMED_SHARE_EXCEEDS_TOTAL` — the "Невозможно
  подтвердить долю..." message (line ~281), `params` for interpolated
  values
- `PROPERTIES.RESIDENT_NOT_FOUND` — "Жилец не найден" (line ~483)
- `PROPERTIES.RESIDENT_NOT_IN_COMPLEX` — "Жилец не найден в данном жилом
  комплексе" (line ~488 — distinct from the previous one, don't merge)
- `PROPERTIES.USER_NOT_FOUND` — "Пользователь не найден"
- `PROPERTIES.STATUS_MANAGEMENT_RESIDENTS_ONLY` — "Управление статусом
  через данный раздел доступно только для учетных записей жильцов"
- `PROPERTIES.CROSS_TENANT_USER_FORBIDDEN` — "Доступ запрещен:
  пользователь не относится к вашему жилому комплексу"
- `PROPERTIES.OWNERSHIP_LINK_NOT_FOUND` — "Право владения не найдено"
- `PROPERTIES.ONLY_CONFIRMED_UNLINK` — "Отвязать можно только
  подтвержденное право владения..."
- `PROPERTIES.CROSS_TENANT_MANAGE_FORBIDDEN` — "Доступ запрещен: вы не
  можете управлять помещениями в другом жилом комплексе"

## Subtask B — `finance.service.ts` (9 throw sites)

- `FINANCE.COMPLEX_NOT_FOUND` — "Жилой комплекс не найден"
- `FINANCE.METER_TYPE_REQUIRED` — "Для тарифа по потреблению
  (PER_CONSUMPTION) необходимо указать тип счётчика (meterType)" (appears
  twice, lines ~47, ~78 — same code)
- `FINANCE.TARIFF_NOT_FOUND` — "Тариф не найден" (appears twice, lines
  ~70, ~101 — same code)
- `FINANCE.NO_ACTIVE_TARIFFS` — "В данном ЖК нет активных тарифов для
  начисления"
- `FINANCE.ACCOUNT_NOT_FOUND` — "Лицевой счет не найден" (appears twice,
  lines ~273, ~329 — same code)
- `FINANCE.ACCOUNT_ACCESS_CONFIRMED_ONLY` — "Доступ к лицевому счету
  разрешен только подтвержденным собственникам помещения"

## Subtask C — `meters.service.ts` (12 throw sites)

- `METERS.UNIT_NOT_FOUND` — "Квартира/помещение не найдено" (appears
  twice, lines ~45, ~91 — same code)
- `METERS.FOREIGN_UNIT_FORBIDDEN` — "Доступ к счётчикам чужого помещения
  запрещён"
- `METERS.METER_NOT_FOUND` — "Счётчик не найден" (appears three times,
  lines ~117, ~149, ~238 — same code)
- `METERS.METER_DEACTIVATED` — "Данный счётчик деактивирован"
- `METERS.SUBMIT_CONFIRMED_RESIDENTS_ONLY` — "Подача показаний доступна
  только подтверждённым жителям данной квартиры"
- `METERS.VALUE_BELOW_BASELINE` — the "Новое показание (...) не может
  быть меньше предыдущего подтверждённого (...)" message — `params` for
  the two interpolated values
- `METERS.PERIOD_ALREADY_SUBMITTED` — "Показания за указанный период уже
  поданы и находятся на рассмотрении или подтверждены"
- `METERS.FOREIGN_READINGS_FORBIDDEN` — "Доступ к показаниям чужой
  квартиры запрещён"
- `METERS.READING_NOT_FOUND` — "Показание счётчика не найдено"

---

## Acceptance criteria

- Every throw site listed above (and any this task's author finds that
  isn't listed — the list above was generated by grepping for `throw new
  \w+Exception\(` in these three files; if the file has grown since, use
  the same code/message-preserving conversion for anything found) carries
  a `code`, with `params` on every interpolated message.
- `message` text is byte-for-byte unchanged everywhere — verify by running
  the existing test suite before and after and confirming no assertion
  needed to change.
- All existing backend tests for `properties`, `finance`, `meters` still
  pass unmodified; add new `.getResponse().code` assertions alongside them
  for at least one case per module (matching Task 0014's approach — augment,
  don't replace).
- `npm test` passes in `backend/`.
- Full kk/ru/en key parity for the new `errors.PROPERTIES.*`,
  `errors.FINANCE.*`, `errors.METERS.*` keys in both mobile and web locale
  files.
- `npx tsc --noEmit` clean in `backend/` (and mobile/web, though this task
  makes no client code changes — only locale JSON).

## Explicitly out of scope

- Client-side resolution code — already built in Task 0014, don't touch
  `client.ts` / `lib/api.ts` again unless you find an actual bug in them.
- Every module beyond these three — `bookings`, `access-control`, `sos`,
  `community-board`, `chat`, `service-requests`, `announcements`,
  `analytics`, `uploads` remain follow-up work, tracked in
  [PROGRESS.md](PROGRESS.md).
- `class-validator` DTO validation messages.
- Any change to exception types, HTTP status codes, or message wording.

## Deliverable

- One commit or PR covering all three modules (they're small and
  mechanically identical in treatment — no need to split further).
- PR description confirms `message` text was verified unchanged (not just
  assumed) and lists the exact modules still remaining after this task.

---

## Review addendum (2026-09-09) — one factual error in the new locale text

**Verified good:** all 39 throw sites across the three files converted
correctly, backend `message` text confirmed byte-for-byte unchanged
against `git diff` (no wording changes), `params` correctly attached on
every interpolated message (`SHARE_EXCEEDS_TOTAL`,
`CONFIRMED_SHARE_EXCEEDS_TOTAL`, `VALUE_BELOW_BASELINE` — including a
`.getResponse().params` assertion added for the latter). All 227 backend
tests pass (54 in the three touched suites), `npx tsc --noEmit` clean.
i18n key parity verified: web ru/kk/en all at 786 keys, mobile ru/kk/en
all at 545 keys — no drift between languages within either app.

**Found:** `errors.PROPERTIES.INVALID_SHARE_RANGE` states the wrong
numeric boundary in **all six locale files** (web + mobile ×
ru/kk/en) — it reads "от 1% до 100%" / "between 1% and 100%" / "1%-дан
100%-ға дейін", but the actual validation in
[properties.service.ts:205](../backend/src/modules/properties/properties.service.ts)
is `requestedShare <= 0 || requestedShare > 100.0`, i.e. the real floor is
0.01% (matching `@Min(0.01)` in
[properties.dto.ts:64](../backend/src/modules/properties/dto/properties.dto.ts)
and the `min="0.01"` on the verification form in
[verifications/page.tsx:375](../frontend-web/src/app/dashboard/verifications/page.tsx)).
The backend's own `message` field for this exception still correctly says
"от 0.01% до 100%" — only the new translated `errors.*` strings got this
wrong, likely rounded during translation rather than copied from the
source message. This is a factual bug, not a wording nitpick: a user
shown this text would believe fractional shares under 1% (e.g. 0.5%) are
rejected, when they are not.

**Required fix:** correct `INVALID_SHARE_RANGE` in all six locale files
to state 0.01% as the floor (matching the backend message's own wording
convention), e.g.:
- ru: "Доля собственности должна быть в диапазоне от 0.01% до 100%"
- en: "Ownership share must be between 0.01% and 100%"
- kk: use the correct decimal form for 0.01% in Kazakh (comma as decimal
  separator per this codebase's existing kk.json conventions — check how
  other decimal values are already formatted in kk.json rather than
  guessing).

**Fix verified (2026-09-09):** all six locale files now correctly read
"0.01%" (kk uses a period as the decimal separator, matching this file's
existing convention — e.g. `quorumThreshold: "Кворум шегі: 50.0%"`).
Change is isolated to the one string per file, no other regressions.
54/54 tests still pass in the three touched suites. Task accepted.
