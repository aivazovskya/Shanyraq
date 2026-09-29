# Task 0094: Контейнеризация backend/web и health-эндпоинты — Infra/Backend

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

В репозитории отсутствовали `Dockerfile` для `backend` (NestJS 10) и `frontend-web` (Next.js 14), отсутствовали health-эндпоинты (liveness / readiness), а существующий `docker-compose.yml` запускал только внешнюю инфраструктуру (PostgreSQL, Redis, MinIO, go2rtc).

Без контейнеризации приложений и проверки жизнеспособности невозможно осуществить развертывание в production/staging окружениях, настроить мониторинг и оркестрацию контейнеров (Docker Compose, Kubernetes).

Данная задача зависит от [Task 0093](0093-prisma-migrations-baseline.md) (Prisma-миграции), так как запуск контейнера бэкенда в проде должен автоматически применять проверенные миграции (`prisma migrate deploy`), исключая `db push`.

## Architecture decisions — do not re-litigate

1. **`backend/Dockerfile`**:
   - Multi-stage сборка: `deps` (установка зависимостей через `npm ci`) -> `build` (`prisma generate`, `nest build`) -> `runtime` (минимальный образ `node:20-alpine`, только production-зависимости, скомпилированный `dist/` и `prisma/` для миграций).
   - Запуск от непривилегированного пользователя (`USER node`).
   - `.dockerignore`: исключены `node_modules`, `dist`, `.env*`, `test`, `coverage`, `.git`.
2. **`frontend-web/Dockerfile`**:
   - Multi-stage сборка на базе `node:20-alpine`: `deps` -> `builder` -> `runner`.
   - Next.js режим `output: 'standalone'` в `next.config.js` для минимизации размера и изоляции runtime-зависимостей.
   - Проброс `NEXT_PUBLIC_*` переменных окружения через `ARG` / `ENV` на этапе сборки.
   - Запуск от непривилегированного пользователя (`USER node`).
   - `.dockerignore`: исключены `node_modules`, `.next`, `.env*`, `.git`.
3. **Entrypoint backend**:
   - Скрипт `docker-entrypoint.sh`: выполняет `npx prisma migrate deploy`, затем `exec node dist/main`.
   - Строгий запрет `db push` на этапе старта контейнера.
4. **Health-эндпоинты (`/health` и `/health/ready`)**:
   - Выбор архитектуры: простой встроенный NestJS контроллер `HealthController` + `HealthService` без добавления тяжелой внешней библиотеки `@nestjs/terminus`.
     *Обоснование*: отсутствие сторонних зависимостей исключает риск версионных конфликтов с NestJS 10 / RxJS 7; даёт прямое, детерминированное управление HTTP-кодами (200 / 503) и проверками базы данных (`SELECT 1`) и Redis (`PING`); легко тестируется юнит-тестами.
   - `GET /health` (liveness probe): всегда возвращает HTTP 200 `{ status: 'ok', timestamp }` без обращений к БД и внешним сервисам.
   - `GET /health/ready` (readiness probe): выполняет `SELECT 1` в PostgreSQL через `PrismaService` и `PING` в Redis через `RedisService`. При успехе возвращает HTTP 200 `{ status: 'ok', details: { database: 'up', redis: 'up' }, timestamp }`. При сбое любого сервиса возвращает HTTP 503 `{ status: 'error', details: { database: 'up'|'down', redis: 'up'|'down' }, timestamp }`.
   - Эндпоинты публичные (без `JwtAuthGuard`), исключены из глобального префикса `/api/v1`, снабжены декоратором `@SkipThrottle()` от rate-limiting.
   - Ответы не содержат секретов, версий пакетов или внутренних стек-трейсов.
5. **`docker-compose.prod.yml`**:
   - Отдельный файл конфигурации для production/staging, не ломающий текущий локальный `docker-compose.yml`.
   - Сервисы: `backend`, `web`, `postgres`, `redis`, `minio`.
   - Сервис `backend` снабжен healthcheck по `GET /health/ready` (интервал 10s, таймаут 5s, 3 попытки).
   - Зависимости `depends_on` с условием `condition: service_healthy` для гарантированного старта после готовности БД/Redis.
   - Все секреты и пароли передаются строго через переменные окружения (.env), без хардкода значений по умолчанию в prod-файле.
6. **CI Pipeline (`.github/workflows/ci.yml`)**:
   - Добавлена джоба `docker-build`, проверяющая успешность сборки Docker-образов `backend` и `frontend-web` без отправки в registry.
7. **Документация**:
   - Раздел «Деплой» в `README.md` с инструкцией по сборке, настройке переменных окружения, порядку запуска и проверке health-эндпоинтов.

## Subtasks

- [x] **Subtask 1**: Добавление метода `ping()` в `backend/src/redis/redis.service.ts`.
- [x] **Subtask 2**: Реализация модуля здоровья `backend/src/modules/health/` (`HealthController`, `HealthService`, `HealthModule`).
- [x] **Subtask 3**: Исключение `/health` из префикса в `main.ts` и подключение в `app.module.ts`.
- [x] **Subtask 4**: Unit-тесты `health.controller.spec.ts` (liveness, readiness 200, readiness 503 при падении DB/Redis, публичность).
- [x] **Subtask 5**: Создание `backend/Dockerfile`, `.dockerignore`, `docker-entrypoint.sh`.
- [x] **Subtask 6**: Настройка `output: 'standalone'` в `frontend-web/next.config.js`, создание `frontend-web/Dockerfile`, `.dockerignore`.
- [x] **Subtask 7**: Создание `docker-compose.prod.yml` и обновление `.env.example`.
- [x] **Subtask 8**: Обновление `.github/workflows/ci.yml` (добавление джобы `docker-build`).
- [x] **Subtask 9**: Документация в `README.md` (раздел «Деплой и контейнеризация»).
- [x] **Subtask 10**: Проверка тестов, сборки и фиксация в `PROGRESS.md`.

## Acceptance criteria

1. `GET /health` отвечает 200 `{ status: 'ok' }` без обращения к БД.
2. `GET /health/ready` отвечает 200 при доступных Postgres и Redis, и 503 при недоступности любого из них.
3. Эндпоинты доступны без авторизации (публичные) и доступны по прямому пути `/health` и `/health/ready` вне префикса `/api/v1`.
4. Написаны исчерпывающие unit-тесты для `HealthController` с моками `PrismaService` и `RedisService`.
5. `backend/Dockerfile` и `frontend-web/Dockerfile` собираются без ошибок, запускаются от `USER node` и минимизируют итоговый размер образов.
6. `backend/docker-entrypoint.sh` выполняет `prisma migrate deploy` перед запуском сервера.
7. `docker-compose.prod.yml` определяет сервисы `backend`, `web`, `postgres`, `redis`, `minio` со строгими `healthcheck` и `depends_on`.
8. GitHub Actions workflow содержит джобу `docker-build`, проверяющую сборку обоих образов.
9. `npm test` и `tsc --noEmit` в `backend`, `frontend-web` и `mobile` чистые.

## Out of scope

- Kubernetes манифесты / Helm-чарты.
- Настройка внешнего TLS reverse-proxy (Nginx / Traefik / Caddy).
- Внешний мониторинг (Prometheus / Grafana).
- Автоматический push образов в Docker Registry / CD.
- Rate limiting для API (Task 0095).

## Deliverable

- `backend/src/modules/health/health.controller.ts`
- `backend/src/modules/health/health.service.ts`
- `backend/src/modules/health/health.module.ts`
- `backend/src/modules/health/health.controller.spec.ts`
- `backend/src/redis/redis.service.ts`
- `backend/src/main.ts`
- `backend/src/app.module.ts`
- `backend/Dockerfile`
- `backend/.dockerignore`
- `backend/docker-entrypoint.sh`
- `frontend-web/next.config.js`
- `frontend-web/Dockerfile`
- `frontend-web/.dockerignore`
- `docker-compose.prod.yml`
- `.env.example`
- `.github/workflows/ci.yml`
- `README.md`
- `tasks/0094-containerization-and-health.md`
