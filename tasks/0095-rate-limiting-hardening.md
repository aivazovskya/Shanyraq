# Task 0095: Rate Limiting — Redis Storage, Trust Proxy, Strict Sensitive Endpoints — Backend/Security

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

До выполнения данной задачи глобальный `ThrottlerGuard` (`backend/src/app.module.ts`: 60 req/60s) работал со встроенным in-memory хранилищем (`ThrottlerStorageService`). In-memory хранилище не разделяется между несколькими репликами приложения (Docker, Kubernetes) и сбрасывается при каждом перезапуске контейнера.

Строгие лимиты `@Throttle` были настроены точечно только для `access-control` (10/мин), `chat` (15/мин) и `sos` (5/мин). Чувствительные эндпоинты аутентификации (`request-otp`, `verify-otp`, `login-password`, `set-initial-password`, `staff/forgot-password`, `staff/reset-password`, `pin/set`, `pin/reset-*`, `refresh`) и голосований (`votings/vote`) оставались под общим лимитом 60 req/60s, что создавало риски подбора паролей, спама SMS-шлюза и накрутки голосов на транспортном уровне.

Блокировки по аккаунту (lockout после неверных OTP, паролей и PIN шлагбаума) уже реализованы в бизнес-логике `auth.service.ts` и `access-control.service.ts` через Redis — их логика остаётся неизменной. Задача 0095 закрывает уязвимости на транспортном уровне (HTTP/TCP).

## Architecture decisions — do not re-litigate

1. **Хранилище троттлера — собственный `RedisThrottlerStorage` поверх `RedisService`**:
   - Выбор в пользу собственной реализации `RedisThrottlerStorage` реализующей интерфейс `ThrottlerStorage` из `@nestjs/throttler` (вместо `@nest-lab/throttler-storage-redis`).
   - *Обоснование*:
     1. Отсутствие внешних зависимостей исключает риск версионных конфликтов с `@nestjs/throttler` v6.5.0 и `ioredis`.
     2. Полный контроль над поведением при сбоях Redis: реализация строгого требования ТЗ:
        - **Fail-open** для глобального лимита нечувствительных эндпоинтов (логирование предупреждения, запрос пропускается).
        - **Fail-closed** (HTTP 503 `AUTH.SERVICE_UNAVAILABLE`) для чувствительных эндпоинтов аутентификации и голосований.
     3. Атомарное инкрементирование и блокировка через Redis Lua-скрипт за 1 сетевой round-trip.
2. **Поддержка `trust proxy`**:
   - В `main.ts` включается `app.set('trust proxy', trustProxy)`, где значение берется из переменной окружения `TRUST_PROXY`.
   - Значение по умолчанию: `0` (в dev-режиме, игнорирует заголовки `X-Forwarded-For` для защиты от IP-spoofing).
   - В production-окружении (`docker-compose.prod.yml`): `1` (число доверенных прокси-хопов, например Nginx / ALB, корректно извлекает реальный IP клиента).
3. **Строгие лимиты по IP (константы в `rate-limit.constants.ts`)**:
   - `POST auth/request-otp`: 3 req / 60s
   - `POST auth/verify-otp`: 5 req / 60s
   - `POST auth/login-password`: 5 req / 60s
   - `POST auth/set-initial-password`: 3 req / 60s
   - `POST auth/staff/forgot-password`: 3 req / 60s
   - `POST auth/staff/reset-password`: 3 req / 60s
   - `POST auth/pin/reset-request`: 3 req / 60s
   - `POST auth/pin/reset-confirm`: 3 req / 60s
   - `POST auth/pin/set`: 3 req / 60s
   - `POST auth/refresh`: 20 req / 60s
   - `POST votings/vote`: 10 req / 60s
4. **Лимит `request-otp` по номеру телефона**:
   - Отдельный счетчик в Redis через `PhoneOtpRateLimitGuard`: не более 3 SMS за 10 минут (600 секунд) на номер, независимо от IP.
   - Защита от SMS-бомбинга и исчерпания SMS-бюджета при ротации IP-адресов злоумышленником.
   - Номер телефона **строго хешируется** (SHA-256) перед сохранением в ключ Redis (`ratelimit:phone_otp:<sha256>`), открытый номер телефона в Redis не хранится.
   - При отказе Redis — поведение строго **fail-closed** (HTTP 503 `AUTH.SERVICE_UNAVAILABLE`).
5. **Формат ответа при превышении лимита**:
   - HTTP Status: `429 Too Many Requests`.
   - Заголовок ответа: `Retry-After: <seconds>`.
   - Тело ответа в стандартном формате проекта:
     - Для общих лимитов auth: `{ statusCode: 429, code: "AUTH.RATE_LIMITED", message: "Слишком много запросов. Пожалуйста, повторите позже." }`.
     - Для голосований: `{ statusCode: 429, code: "VOTINGS.RATE_LIMITED", message: "Слишком много попыток голосования. Пожалуйста, повторите позже." }`.
     - Для лимита по номеру: `{ statusCode: 429, code: "AUTH.PHONE_RATE_LIMITED", message: "Превышен лимит запросов SMS для этого номера. Пожалуйста, повторите через 10 минут." }`.
   - Полный паритет переводов в `errors.AUTH` и `errors.VOTINGS` для всех 3 локалей (`ru`, `kk`, `en`) в `mobile` и `frontend-web`.
6. **Health-эндпоинты**:
   - Остаются под `@SkipThrottle()`.

## Subtasks

- [x] **Subtask 1**: Определение констант лимитов в `backend/src/common/constants/rate-limit.constants.ts`.
- [x] **Subtask 2**: Реализация `RedisThrottlerStorage` в `backend/src/redis/redis-throttler.storage.ts` с Lua-скриптом, fail-open для глобального лимита и fail-closed для чувствительных.
- [x] **Subtask 3**: Реализация `AppThrottlerGuard` в `backend/src/common/guards/app-throttler.guard.ts` с возвратом стандартизированных кодов ошибок и заголовка `Retry-After`.
- [x] **Subtask 4**: Реализация `PhoneOtpRateLimitGuard` в `backend/src/common/guards/phone-otp-rate-limit.guard.ts` с хешированием телефона (SHA-256) и fail-closed логикой.
- [x] **Subtask 5**: Подключение `trust proxy` в `backend/src/main.ts` и обновление `docker-compose.prod.yml`, `.env.example`.
- [x] **Subtask 6**: Навешивание `@Throttle` на контроллеры `AuthController` и `VotingsController`.
- [x] **Subtask 7**: Локализация ошибок в словарях `ru.json`, `kk.json`, `en.json` в `frontend-web` и `mobile` (100% паритет).
- [x] **Subtask 8**: Написание unit-тестов (`app-throttler.guard.spec.ts`, `phone-otp-rate-limit.guard.spec.ts`, `redis-throttler.storage.spec.ts`, `trust-proxy.spec.ts`).
- [x] **Subtask 9**: Верификация: `npm test`, `tsc --noEmit` в backend/frontend-web/mobile, ручная проверка 429.

## Acceptance criteria

1. Хранилище ThrottlerModule переведено на Redis (`RedisThrottlerStorage`), счетчики лимитов переживают перезапуск NestJS и разделяются между репликами.
2. При сбое Redis глобальный лимит работает в режиме fail-open (не блокирует пользователей), а чувствительные эндпоинты (auth, voting, phone limit) — в режиме fail-closed (HTTP 503).
3. В `main.ts` работает `trust proxy` с параметризацией через `TRUST_PROXY` (`0` в dev, `1` в prod).
4. Все чувствительные эндпоинты из п.3 ТЗ защищены строгими лимитами `@Throttle`.
5. Эндпоинт `request-otp` защищен дополнительным лимитом по номеру телефона (3 SMS / 10 мин), номер в Redis хранится в виде SHA-256 хеша. Лимит невозможно обойти сменой IP.
6. При превышении лимита возвращается HTTP 429 с кодом ошибки (`AUTH.RATE_LIMITED`, `AUTH.PHONE_RATE_LIMITED`, `VOTINGS.RATE_LIMITED`), заголовком `Retry-After` и локализованными переводами во всех 3 языках.
7. Все unit-тесты и typecheck во всех трех проектах проходят без ошибок.

## Out of scope

- WAF и Cloudflare правила.
- CAPTCHA / Cloudflare Turnstile.
- Лимитирование соединений WebSocket / Socket.io.
- Изменение существующих блокировок по аккаунту в `auth.service.ts` и `access-control.service.ts`.
