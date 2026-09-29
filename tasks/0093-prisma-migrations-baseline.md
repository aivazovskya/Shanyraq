# Task 0093: Prisma-миграции вместо db push (baseline) — Backend/Infra

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

До выполнения данной задачи схема базы данных (`backend/prisma/schema.prisma`, 34 модели, PostgreSQL) применялась исключительно через `prisma db push` (`backend/package.json: prisma:push`). Каталог `backend/prisma/migrations` в репозитории отсутствовал.

Использование `db push` на продакшене и в тестовых средах несёт критические риски:
1. Отсутствует версионирование и аудит истории изменений схемы данных.
2. Невозможен предсказуемый откат или аудит изменений.
3. `db push` может молча удалить или исказить данные при переименовании или изменении типов колонок.
4. В [Task 0092](0092-pii-iin-encryption.md) поле `iinHash` было переведено в `@unique`. При наличии дублей на существующей БД наложение уникального индекса завершится ошибкой.

Необходимо зафиксировать baseline-миграцию, внедрить строгий регламент миграций через Prisma Migrate (`migrate dev`, `migrate deploy`, `migrate status`), настроить CI-проверку дрифта схемы, подготовить скрипт проверки дубликатов `iinHash` перед миграцией и обновить документацию проекта.

## Architecture decisions — do not re-litigate

1. **Baseline-миграция `0_init`**:
   - Начальный SQL-дамп генерируется строго командой:
     `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`
   - Сохраняется в `backend/prisma/migrations/0_init/migration.sql`.
   - В `backend/prisma/migrations/migration_lock.toml` фиксируется `provider = "postgresql"`.
   - Ручные правки в сгенерированный SQL запрещены.
2. **Маркировка существующих БД без повторного выполнения (Baseline existing DB)**:
   - Существующие базы данных (dev, staging, пилот) помечаются как уже применившие базовую схему через:
     `npx prisma migrate resolve --applied 0_init`
3. **Регламент скриптов в `backend/package.json`**:
   - `prisma:migrate:dev` (`prisma migrate dev`) — для локальной разработки и генерации новых миграций.
   - `prisma:migrate:deploy` (`prisma migrate deploy`) — для применения накопленных миграций в CI, staging и prod.
   - `prisma:migrate:status` (`prisma migrate status`) — для проверки состояния примененных миграций.
   - `prisma:push` (`prisma db push`) — остаётся исключительно для локального прототипирования (dev-only, запрещён на проде).
4. **Предмиграционный скрипт проверки дубликатов `iinHash`**:
   - Скрипт `backend/scripts/check-iin-hash-duplicates.ts` (команда `npm run db:check-iin-duplicates` в `backend/`): запускается на существующей БД, где колонка `iinHash` уже присутствует, перед применением миграции, накладывающей уникальный индекс `@unique`.
   - Выводит ID пользователей, ID ЖК (`tenantId`), роли и дату создания **строго без раскрытия значений ИИН или шифротекстов**.
   - Возвращает ненулевой код выхода (`exit 1`) при обнаружении дубликатов, предотвращая сбой при накатывании миграции на проде.
5. **CI проверка дрифта схемы (Schema Drift Check)**:
   - В `.github/workflows/ci.yml` в джобе `backend-test` поднимается сервис `postgres:16`.
   - Выполняется `prisma migrate deploy` на чистой БД.
   - Выполняется `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL" --exit-code`.
   - Шаг падает с ошибкой (`exit 2`), если `schema.prisma` изменена разработчиком без генерации соответствующей миграции.
6. **Документация и регламент**:
   - В `README.md` и `CONTRIBUTING.md` добавлен раздел «Миграции базы данных».
   - Зафиксирован запрет `db push` на проде и описана процедура отката миграций (forward migration: новая миграция вперёд).
7. **Сидер (`seed.ts`)**:
   - Файл `seed.ts` остаётся без изменений.

## Subtasks

- [x] **Subtask 1**: Генерация baseline-миграции `backend/prisma/migrations/0_init/migration.sql` и `migration_lock.toml`.
- [x] **Subtask 2**: Обновление скриптов в `backend/package.json` (`prisma:migrate:dev`, `prisma:migrate:deploy`, `prisma:migrate:status`, `db:check-iin-duplicates`, `db:encrypt-iin`).
- [x] **Subtask 3**: Реализация предмиграционной проверки `backend/scripts/check-iin-hash-duplicates.ts` и модуля `iin-duplicates-checker.helper.ts` с тестами.
- [x] **Subtask 4**: Настройка CI (`.github/workflows/ci.yml`) с сервисом `postgres:16`, `migrate deploy` и drift check.
- [x] **Subtask 5**: Документирование регламента миграций в `CONTRIBUTING.md` и `README.md`.
- [x] **Subtask 6**: Верификация: проверка чистой БД, проверка скрипта дубликатов, запуск тестов и typecheck.

## Acceptance criteria

1. В репозитории присутствует каталог `backend/prisma/migrations/0_init/` с валидным `migration.sql` и файл `migration_lock.toml`.
2. Команда `prisma migrate diff` между директорией миграций и текущей `schema.prisma` при наличии shadow DB не выявляет расхождений.
3. В `backend/package.json` присутствуют команды `prisma:migrate:dev`, `prisma:migrate:deploy`, `prisma:migrate:status`, `db:check-iin-duplicates`, `db:encrypt-iin`.
4. Скрипт `backend/scripts/check-iin-hash-duplicates.ts` (`npm run db:check-iin-duplicates`):
   - Запускается на базе данных, где колонка `iinHash` уже создана, перед наложением `@unique`.
   - Находит дубликаты `iinHash` без утечки персональных данных (не печатает значения ИИН).
   - Завершается с кодом 1 при дубликатах и с кодом 0 при их отсутствии.
   - Покрыт тестами.
5. GitHub Actions workflow (`.github/workflows/ci.yml`) содержит шаги запуска PostgreSQL, деплоя миграций и проверки drift check с флагом `--exit-code`.
6. Документация в `README.md` и `CONTRIBUTING.md` содержит исчерпывающее руководство по работе с миграциями, baseline существующей БД и запрет `db push` на проде.
7. `npm test` и `tsc --noEmit` в `backend` проходят без единой ошибки.

## Out of scope

- Изменение существующей схемы данных или добавление новых моделей (схема заморожена на текущем состоянии).
- Шифрование других персональных полей (выполнено в Task 0092).
- Dockerfile и эндпоинты `/health` (выделены в Task 0094).
- Автоматический rollback (Prisma Migrate не имеет rollback; откат регламентирован как миграция вперёд).

## Deliverable

- `backend/prisma/migrations/0_init/migration.sql`
- `backend/prisma/migrations/migration_lock.toml`
- `backend/src/common/db/iin-duplicates-checker.helper.ts` & `iin-duplicates-checker.helper.spec.ts`
- `scripts/check-iin-hash-duplicates.ts`
- `backend/package.json`
- `.github/workflows/ci.yml`
- `README.md`
- `CONTRIBUTING.md`
- `tasks/0093-prisma-migrations-baseline.md`
