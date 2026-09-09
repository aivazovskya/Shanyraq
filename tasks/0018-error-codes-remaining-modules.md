# Task 0018: Backend error codes — final wave (7 remaining modules)

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Third and final wave after [Task 0014](0014-backend-error-codes.md),
[Task 0016](0016-error-codes-properties-finance-meters.md), and
[Task 0017](0017-error-codes-bookings-access-control.md). Migrates the
remaining 57 throw sites across 7 modules: `sos` (11), `community-board`
(16), `chat` (11), `service-requests` (12), `announcements` (2, split
across its service and controller), `analytics` (2), `uploads` (3, split
across its service and controller). **After this task, every hand-thrown
backend exception in the entire codebase carries a machine-readable
`code`** — this closes the "локализация ошибок" tech-debt item tracked in
[PROGRESS.md](PROGRESS.md) for good.

### Architecture decisions already made — do not re-litigate

1. Same conversion as Tasks 0014/0016/0017: `throw new XException('...')`
   → `throw new XException({ code: 'MODULE.CASE', message:
   '...unchanged...', params? })`. **`message` text must stay
   byte-for-byte identical** — verify by running the existing suite
   before/after.
2. No client-side changes — only new `errors.<MODULE>.*` locale keys in
   both apps.
3. `class-validator` DTO messages remain out of scope.
4. Some of these modules throw from **controllers**, not just services
   (`announcements.controller.ts`, `uploads.controller.ts`) — convert
   those the same way; the mechanism works identically regardless of
   which class throws.
5. Several modules repeat the exact literal `'Требуется авторизация'` at
   multiple call sites (`sos`, `community-board`, `chat` each have their
   own). **Give each module its own namespaced code** (e.g.
   `SOS.AUTH_REQUIRED`, `COMMUNITY_BOARD.AUTH_REQUIRED`,
   `CHAT.AUTH_REQUIRED`) rather than inventing a shared cross-module
   code — this matches the per-module namespacing convention already
   established in every prior task, don't break from it here for the
   sake of deduplication.

---

## Subtask A — `sos.service.ts` (11 throw sites)

- `SOS.AUTH_REQUIRED` — "Требуется авторизация" (3 sites)
- `SOS.TENANT_UNRESOLVED` — "Не удалось определить жилой комплекс
  пользователя для вызова экстренных служб"
- `SOS.CHAIRMAN_VIEW_ONLY` — "Председатель ОСИ имеет доступ только к
  просмотру сигналов SOS"
- `SOS.ALERT_NOT_FOUND` — "Вызов SOS не найден"
- `SOS.CROSS_TENANT_PROCESS_FORBIDDEN` — "Вы не можете обрабатывать
  вызовы другого ЖК"
- `SOS.PROCESS_FORBIDDEN` — "Недостаточно прав для обработки сигнала
  SOS"
- `SOS.ALREADY_PROCESSED` — "Данный вызов SOS уже был обработан ранее"
- `SOS.LOG_ACCESS_FORBIDDEN` — "Недостаточно прав для доступа к журналу
  SOS данного ЖК"
- `SOS.CROSS_TENANT_VIEW_FORBIDDEN` — "Вы не можете просматривать
  сигналы SOS другого ЖК"

## Subtask B — `community-board.service.ts` (16 throw sites)

- `COMMUNITY_BOARD.AUTH_REQUIRED` — "Требуется авторизация" (2 sites)
- `COMMUNITY_BOARD.STAFF_CROSS_TENANT_FORBIDDEN` — "Персонал имеет
  доступ только к ресурсам своего жилого комплекса"
- `COMMUNITY_BOARD.RESIDENT_ACCESS_FORBIDDEN` — "У вас нет
  подтвержденного доступа к доске объявлений данного жилого комплекса"
- `COMMUNITY_BOARD.PUBLISH_VERIFIED_RESIDENTS_ONLY` — "Публикация
  объявлений доступна только верифицированным жителям данного ЖК"
- `COMMUNITY_BOARD.GIVEAWAY_NO_PRICE` — "Для категории "Отдам даром"
  указание цены недопустимо" (2 sites)
- `COMMUNITY_BOARD.LISTING_NOT_FOUND` — "Объявление не найдено" (2
  sites)
- `COMMUNITY_BOARD.EDIT_OWN_ONLY` — "Вы можете редактировать только свои
  объявления"
- `COMMUNITY_BOARD.CANNOT_EDIT_REMOVED` — "Нельзя редактировать
  объявление, снятое модератором"
- `COMMUNITY_BOARD.CANNOT_SELF_ASSIGN_REMOVED_STATUS` — "Автор не может
  присвоить статус снятого модератором"
- `COMMUNITY_BOARD.MODERATE_FORBIDDEN` — "Недостаточно прав для
  модерации объявлений"
- `COMMUNITY_BOARD.MODERATE_CROSS_TENANT_FORBIDDEN` — "Вы можете
  модерировать объявления только своего жилого комплекса"
- `COMMUNITY_BOARD.ALREADY_REMOVED` — "Объявление уже снято с публикации
  модератором"
- `COMMUNITY_BOARD.REMOVAL_REASON_REQUIRED` — "Причина удаления
  обязательна для заполнения"

## Subtask C — `chat.service.ts` (11 throw sites)

- `CHAT.AUTH_REQUIRED` — "Требуется авторизация" (3 sites)
- `CHAT.STAFF_CROSS_TENANT_FORBIDDEN` — "Персонал имеет доступ только к
  ресурсам своего жилого комплекса"
- `CHAT.RESIDENT_ACCESS_FORBIDDEN` — "У вас нет подтвержденного доступа
  к ресурсам данного жилого комплекса"
- `CHAT.DISPATCHER_ACCESS_FORBIDDEN` — "Недостаточно прав для доступа к
  чату диспетчера"
- `CHAT.TENANT_UNRESOLVED` — "Не удалось определить жилой комплекс
  пользователя"
- `CHAT.MESSAGE_TEXT_OR_PHOTO_REQUIRED` — "Сообщение должно содержать
  текст или фото" (2 sites — this is the validation added by
  [Task 0012](0012-dispatcher-chat.md)'s addendum, keep the message
  exactly as-is)
- `CHAT.CONVERSATION_NOT_FOUND` — "Диалог не найден" (2 sites)

## Subtask D — `service-requests.service.ts` (12 throw sites)

- `SERVICE_REQUESTS.UNIT_NOT_FOUND` — "Квартира/помещение не найдено"
- `SERVICE_REQUESTS.REQUEST_NOT_FOUND` — "Заявка не найдена" (4 sites)
- `SERVICE_REQUESTS.CROSS_TENANT_VIEW_FORBIDDEN` — "Доступ к заявке
  другого ЖК запрещен"
- `SERVICE_REQUESTS.FOREIGN_REQUEST_VIEW_FORBIDDEN` — "Доступ к чужой
  заявке запрещен"
- `SERVICE_REQUESTS.STATUS_CHANGE_FORBIDDEN` — "Недостаточно прав для
  изменения статуса заявки"
- `SERVICE_REQUESTS.CROSS_TENANT_EDIT_FORBIDDEN` — "Редактирование
  заявки другого ЖК запрещено"
- `SERVICE_REQUESTS.CROSS_TENANT_COMMENT_FORBIDDEN` — "Добавление
  комментариев к заявкам другого ЖК запрещено"
- `SERVICE_REQUESTS.FOREIGN_REQUEST_COMMENT_FORBIDDEN` — "Добавление
  комментариев к чужой заявке запрещено"
- `SERVICE_REQUESTS.RATING_CREATOR_ONLY` — "Оценить качество выполнения
  может только создатель заявки"

## Subtask E — `announcements` (2 throw sites, service + controller)

- `ANNOUNCEMENTS.COMPLEX_NOT_FOUND` — "Жилой комплекс не найден"
  ([announcements.service.ts:31](../backend/src/modules/announcements/announcements.service.ts))
- `ANNOUNCEMENTS.TENANT_ID_REQUIRED` — "Не указан идентификатор жилого
  комплекса"
  ([announcements.controller.ts:35](../backend/src/modules/announcements/announcements.controller.ts))

## Subtask F — `analytics.service.ts` (2 throw sites)

- `ANALYTICS.ACCESS_FORBIDDEN` — "Доступ к аналитике разрешен только для
  администраторов и председателя ОСИ"
- `ANALYTICS.COMPLEX_NOT_FOUND` — "Жилой комплекс не найден"

## Subtask G — `uploads` (3 throw sites, service + controller)

- `UPLOADS.FILE_EMPTY` — "Файл не предоставлен или имеет нулевой
  размер" ([uploads.service.ts:83](../backend/src/modules/uploads/uploads.service.ts))
- `UPLOADS.STORAGE_ERROR` — the "Ошибка при сохранении файла в
  хранилище: ..." message
  ([uploads.service.ts:100](../backend/src/modules/uploads/uploads.service.ts)),
  `params: { error: error.message }`
- `UPLOADS.FILE_MISSING` — "Файл не передан в поле "file""
  ([uploads.controller.ts:51](../backend/src/modules/uploads/uploads.controller.ts))

**Tests:** extend each module's existing spec file with `.getResponse().code`
assertions for at least a representative sample per module (same
precedent as Tasks 0014/0016/0017 — augment existing assertions, don't
replace them, and don't feel obligated to cover all 57 sites
exhaustively).

---

## Acceptance criteria

- Every throw site across all 7 modules (both controllers and services
  where applicable) carries a `code`; the one interpolated message
  (`UPLOADS.STORAGE_ERROR`) carries `params`.
- `message` text is byte-for-byte unchanged everywhere — verify by
  running the existing suite before and after.
- All existing backend tests for these 7 modules pass unmodified; new
  `.code` assertions added alongside them.
- `npm test` passes in `backend/` (full suite, not just these modules —
  this is the last wave, confirm nothing elsewhere regressed).
- Full kk/ru/en key parity for all seven new `errors.<MODULE>.*`
  namespaces in both mobile and web locale files.
- Per the lesson from Task 0016's addendum: **double-check any translated
  string that restates a specific rule, category name, or limit against
  the actual code/UI** rather than translating loosely (e.g. the "Отдам
  даром" / GIVE_AWAY category name in `COMMUNITY_BOARD.GIVEAWAY_NO_PRICE`
  should match how that category is actually labeled elsewhere in the UI,
  not a paraphrase).
- `npx tsc --noEmit` clean in `backend/`.

## Explicitly out of scope

- `class-validator` DTO validation messages.
- Any change to exception types, HTTP status codes, or message wording.
- Any module not listed above — this task is explicitly the last wave;
  if a grep afterward finds anything missed, that's a bug in this task's
  execution, not a new scope item.

## Deliverable

- One commit or PR covering all 7 modules — they're individually small
  (2-16 sites each) and mechanically identical in treatment.
- PR description confirms `message` text was verified unchanged and
  explicitly states that this closes the backend error-code migration
  entirely (no modules remain) — update
  [PROGRESS.md](PROGRESS.md)'s error-codes row to reflect that, matching
  how Task 0016/0017 each updated it incrementally.

---

## Review addendum (2026-09-09) — accepted, migration fully closed

**Verified good:** all 57 throw sites across all 7 modules (including
both controllers, `announcements.controller.ts` and
`uploads.controller.ts`) converted correctly; `message` text confirmed
byte-for-byte unchanged via diff in every file. Test augmentation used a
cleaner pattern than prior waves — `const promise = service.x(...); await
expect(promise).rejects.toThrow(ExceptionType); await
expect(promise).rejects.toMatchObject({ response: { code: '...' } })` —
which calls the method once instead of twice while still preserving the
original exception-type assertion; two genuinely new test cases were
added (`ANNOUNCEMENTS.COMPLEX_NOT_FOUND`, `UPLOADS.STORAGE_ERROR` with
`params` verification), accounting for the test count going from 227 to
229. `GIVEAWAY_NO_PRICE`'s translated category name ("Отдам даром")
double-checked against the actual UI label
(`typeGiveAway` in the community-board locale keys) — matches exactly, no
repeat of Task 0016's mismatch class. Incidental BOM-stripping in
`uploads.service.ts`/`uploads.controller.ts` (harmless, not flagged as an
issue). All 229 backend tests pass, `tsc --noEmit` clean. i18n parity
confirmed: web ru/kk/en all at 872 keys, mobile ru/kk/en all at 631 keys
— the `errors` namespace itself totals 148 keys, matching
[PROGRESS.md](PROGRESS.md)'s updated count. This closes the entire
backend error-code migration — every hand-thrown exception in the
codebase now carries a machine-readable `code`. Task accepted, no fixes
required.
