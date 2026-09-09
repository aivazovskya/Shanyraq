# Task 0017: Backend error codes — bookings/access-control migration

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Second follow-up wave after [Task 0014](0014-backend-error-codes.md) and
[Task 0016](0016-error-codes-properties-finance-meters.md). Migrates
[bookings.service.ts](../backend/src/modules/bookings/bookings.service.ts)
(23 throw sites) and
[access-control.service.ts](../backend/src/modules/access-control/access-control.service.ts)
(28 throw sites) — the largest and most complex remaining module. Same
mechanism, same rules as both prior tasks: **do not re-read them for the
mechanism itself**, this file only lists what's specific to these two
modules.

### Architecture decisions already made — do not re-litigate

1. Same conversion as Tasks 0014/0016: `throw new XException('...')` →
   `throw new XException({ code: 'MODULE.CASE', message: '...unchanged...',
   params? })`. **`message` text must stay byte-for-byte identical** —
   verified by running the existing suite before/after.
2. No client-side changes — the `errors` namespace resolution already
   works; this task only adds `errors.BOOKINGS.*` and
   `errors.ACCESS_CONTROL.*` keys to both apps' locale files.
3. `class-validator` DTO messages remain out of scope.

### A wrinkle specific to this module — read before starting

`access-control.service.ts`'s Hikvision adapter methods (`triggerOpen`,
`checkHealth` on `HikvisionIsapiAdapter`) already bake a poor-man's error
code into the message string itself, e.g. `` `HIKVISION_CONNECTION_ERROR:
Ошибка связи с домофоном (${cleanUrl}): ${err.message}` ``. **Existing
tests assert on these embedded prefixes directly** — e.g.
[access-control.service.spec.ts:681](../backend/src/modules/access-control/access-control.service.spec.ts)
does `.rejects.toThrow('HIKVISION_CREDENTIALS_MISSING')` and line 760
does `.rejects.toThrow('HIKVISION_DEVICE_ERROR')`. This means:
- The `message` text (including the `HIKVISION_XXX:` prefix) must stay
  completely unchanged, same as every other message in this migration —
  the existing prefix-matching tests must keep passing unmodified.
- For the real `code` field, mirror the embedded prefix as the suffix,
  e.g. `code: 'ACCESS_CONTROL.HIKVISION_CREDENTIALS_MISSING'` — don't
  invent unrelated naming, reuse what's already there.
- `triggerOpen` and `checkHealth` each throw their own
  connection-error/device-error variant with slightly different Russian
  wording for the same underlying failure category (one is about opening
  the barrier, the other about a standalone health-check ping). It's fine
  to give them the same `code` (e.g. both use
  `ACCESS_CONTROL.HIKVISION_CONNECTION_ERROR`) since they represent the
  same failure to the end user — don't feel obligated to invent a second
  code just because the wording differs slightly; use your judgment if a
  case genuinely feels distinct enough to warrant its own code instead.
- `PIN_NOT_SET` (line ~540) and the two Hikvision `BadRequestException`s
  above already have their own embedded prefix in the string
  (`PIN_NOT_SET: ...`) — same treatment: keep the message, add a matching
  `code`.

---

## Subtask A — `bookings.service.ts` (23 throw sites)

Suggested codes (`BOOKINGS.*` — several messages repeat verbatim at
multiple call sites; share one code across those, don't invent per-site
variants):

- `BOOKINGS.RESOURCE_NOT_FOUND` — "Пространство не найдено" (4 sites)
- `BOOKINGS.INVALID_OPERATING_HOURS` — "Время начала работы должно быть
  раньше времени окончания" (2 sites)
- `BOOKINGS.INVALID_DATE_RANGE_FORMAT` — "Некорректный формат диапазона
  дат"
- `BOOKINGS.DATE_RANGE_INVERTED` — "Дата начала должна быть раньше даты
  окончания"
- `BOOKINGS.RESOURCE_INACTIVE` — "Данное пространство временно
  недоступно для бронирования"
- `BOOKINGS.OWNERSHIP_REQUIRED` — "Для бронирования общих пространств
  требуется подтвержденное право владения или проживания в данном ЖК"
- `BOOKINGS.INVALID_TIME_FORMAT` — "Некорректный формат времени"
- `BOOKINGS.START_TIME_MUST_BE_FUTURE` — "Время начала бронирования
  должно быть в будущем"
- `BOOKINGS.END_BEFORE_START` — "Время окончания бронирования должно
  быть позже времени начала"
- `BOOKINGS.DURATION_EXCEEDS_LIMIT` — the "Длительность бронирования
  (...) превышает установленный лимит (...)" message, `params:
  { durationMinutes, maxDurationMinutes }`
- `BOOKINGS.SLOT_CONFLICT` — "Выбранный временной слот уже занят"
  (`ConflictException`, not `BadRequestException` — keep the exception
  type unchanged, only the constructor argument shape changes)
- `BOOKINGS.BOOKING_NOT_FOUND` — "Бронирование не найдено"
- `BOOKINGS.ALREADY_CANCELLED` — "Бронирование уже было отменено"
- `BOOKINGS.CANCEL_FORBIDDEN` — "У вас нет прав на отмену этого
  бронирования"
- `BOOKINGS.AUTH_REQUIRED` — "Требуется авторизация"
- `BOOKINGS.STAFF_CROSS_TENANT_FORBIDDEN` — "Персонал имеет доступ
  только к ресурсам своего жилого комплекса"
- `BOOKINGS.RESIDENT_ACCESS_FORBIDDEN` — "У вас нет подтвержденного
  доступа к общим пространствам данного жилого комплекса"
- `BOOKINGS.MANAGE_FORBIDDEN` — "Недостаточно прав для управления
  бронированиями данного ЖК"
- `BOOKINGS.OUTSIDE_OPERATING_HOURS` — the "Бронирование возможно только
  в часы работы пространства (с ... до ...)" message, `params: { opStart,
  opEnd }`

## Subtask B — `access-control.service.ts` (28 throw sites)

Suggested codes (`ACCESS_CONTROL.*`), in addition to the Hikvision-prefix
notes above:

- `ACCESS_CONTROL.HIKVISION_CREDENTIALS_MISSING` — the
  "HIKVISION_CREDENTIALS_MISSING: ..." message (2 sites, identical)
- `ACCESS_CONTROL.HIKVISION_CONNECTION_ERROR` — both connection-error
  variants (triggerOpen's and checkHealth's), `params` for whatever's
  interpolated (url, err message)
- `ACCESS_CONTROL.HIKVISION_DEVICE_ERROR` — both device-error variants
  (open-command-rejected and health-check HTTP-status), `params` as
  applicable
- `ACCESS_CONTROL.HIKVISION_TIMEOUT` — "HIKVISION_TIMEOUT: Превышено
  время ожидания ответа (5 сек)" (2 sites, identical)
- `ACCESS_CONTROL.ADMIN_ONLY_CREATE` — "Только администраторы могут
  создавать точки доступа"
- `ACCESS_CONTROL.ADMIN_ONLY_UPDATE` — "Только администраторы могут
  изменять точки доступа"
- `ACCESS_CONTROL.ACCESS_POINT_NOT_FOUND` — "Точка доступа не найдена"
  (3 sites)
- `ACCESS_CONTROL.ADMIN_ONLY_HEALTH_CHECK` — "Только администраторы
  могут выполнять проверку связи с оборудованием"
- `ACCESS_CONTROL.HEALTH_CHECK_ISAPI_ONLY` — "Проверка связи по
  протоколу ISAPI доступна только для контроллеров HIKVISION_ISAPI"
- `ACCESS_CONTROL.ENDPOINT_URL_MISSING` — "У точки доступа не указан
  endpointUrl (IP-адрес прибора)"
- `ACCESS_CONTROL.CAMERA_NOT_FOUND` — "Камера не найдена или отключена"
- `ACCESS_CONTROL.NOT_A_CAMERA` — "Указанная точка доступа не является
  видеокамерой"
- `ACCESS_CONTROL.STAFF_CAMERA_CROSS_TENANT_FORBIDDEN` — "Персонал имеет
  доступ к видеокамерам только своего жилого комплекса"
- `ACCESS_CONTROL.RESIDENT_CAMERA_ACCESS_FORBIDDEN` — "У вас нет
  подтвержденного доступа к видеокамерам данного жилого комплекса"
- `ACCESS_CONTROL.NOT_A_BARRIER` — "Указанная точка доступа не является
  шлагбаумом, воротами или домофоном"
- `ACCESS_CONTROL.STAFF_MANAGE_CROSS_TENANT_FORBIDDEN` — "Сотрудник
  имеет доступ к управлению точками доступа только своего жилого
  комплекса"
- `ACCESS_CONTROL.RESIDENT_NO_ACTIVE_ACCESS` — "У вас нет активного
  права доступа к точке доступа данного жилого комплекса"
- `ACCESS_CONTROL.PIN_NOT_SET` — the "PIN_NOT_SET: ..." message
- `ACCESS_CONTROL.PIN_LOCKED` — "Доступ временно заблокирован на 10
  минут из-за превышения попыток ввода PIN-кода"
- `ACCESS_CONTROL.PIN_MAX_ATTEMPTS` — "Неверный PIN-код. Превышено
  максимальное число попыток. Доступ заблокирован на 10 минут."
- `ACCESS_CONTROL.PIN_INVALID` — "Неверный PIN-код. Осталось попыток:
  {remaining}", `params: { remaining }`
- `ACCESS_CONTROL.GUEST_PASS_OWN_UNIT_ONLY` — "IDOR защита: вы можете
  оформлять гостевой пропуск только для своей подтвержденной квартиры"

**Tests:** extend both modules' existing spec files with `.getResponse().code`
assertions for at least a handful of representative cases each (not
necessarily all 47 unique codes — follow Task 0014/0016's precedent of
augmenting a meaningful sample, not exhaustively duplicating every case),
including explicit verification that the Hikvision prefix-matching tests
noted above still pass completely unmodified.

---

## Acceptance criteria

- Every throw site in both files carries a `code`; interpolated messages
  carry matching `params`.
- `message` text is byte-for-byte unchanged everywhere, including the
  `HIKVISION_XXX:`/`PIN_NOT_SET:`-prefixed ones — run the existing suite
  before and after and confirm no assertion needed to change, especially
  the prefix-matching ones called out above.
- `BOOKINGS.SLOT_CONFLICT` stays a `ConflictException`, not a
  `BadRequestException` — only the constructor argument changes shape,
  never the exception class.
- All existing backend tests for `bookings` and `access-control` pass
  unmodified; new `.code` assertions added alongside them.
- `npm test` passes in `backend/`.
- Full kk/ru/en key parity for the new `errors.BOOKINGS.*` and
  `errors.ACCESS_CONTROL.*` keys in both mobile and web locale files —
  and, per the addendum lesson from Task 0016, **double-check any
  translated string that restates a specific number, threshold, or limit
  against the actual code logic** (e.g. the 5-second timeout, the 10-minute
  PIN lockout, `maxDurationMinutes`) rather than translating loosely —
  Task 0016's review caught a locale string that stated the wrong
  percentage threshold, don't repeat that class of mistake here.
- `npx tsc --noEmit` clean in `backend/`.

## Explicitly out of scope

- Every module beyond these two — `sos`, `community-board`, `chat`,
  `service-requests`, `announcements`, `analytics`, `uploads` remain
  follow-up work, tracked in [PROGRESS.md](PROGRESS.md).
- `class-validator` DTO validation messages.
- Any change to exception types, HTTP status codes, or message wording —
  including the Hikvision/PIN prefix strings, which stay exactly as-is.
- Reworking the Hikvision adapter's error-handling structure — this task
  only adds a `code` alongside the existing `message`, it doesn't refactor
  how those errors are constructed.

## Deliverable

- One commit or PR covering both modules.
- PR description confirms `message` text was verified unchanged (the
  Hikvision/PIN prefix tests specifically) and lists the exact modules
  still remaining after this task (`sos`, `community-board`, `chat`,
  `service-requests`, `announcements`, `analytics`, `uploads`).

---

## Review addendum (2026-09-09) — accepted, no issues found

**Verified good:** all 51 throw sites across both files converted
correctly; `message` text confirmed byte-for-byte unchanged via diff,
including every `HIKVISION_XXX:`/`PIN_NOT_SET:`-prefixed string — the
existing prefix-matching tests (`toThrow('HIKVISION_CREDENTIALS_MISSING')`,
`toThrow('HIKVISION_DEVICE_ERROR')`) were left untouched and still pass,
with new `.getResponse().code`/`.params` assertions added alongside them
rather than replacing them. `BOOKINGS.SLOT_CONFLICT` correctly stayed a
`ConflictException`. The two Hikvision connection/device-error variants
(triggerOpen vs checkHealth) were sensibly given shared codes per the
task's explicit judgment call. All 227 backend tests pass, `tsc --noEmit`
clean. i18n parity confirmed: web ru/kk/en all at 827 keys, mobile ru/kk/en
all at 586 keys. Spot-checked every numeric threshold restated in the new
locale strings (5-second Hikvision timeout, 10-minute PIN lockout,
`durationMinutes`/`maxDurationMinutes` interpolation) against the actual
service logic in all three languages — no repeat of Task 0016's
percentage-mismatch mistake. Task accepted, no fixes required.
