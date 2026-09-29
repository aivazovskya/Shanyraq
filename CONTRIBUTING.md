# Руководство по участию в разработке «Shanyraq» (Contributing Guide)

Благодарим за интерес к проекту **Shanyraq**! Мы приветствуем вклад в развитие первой открытой платформы для ОСИ и управляющих компаний в Казахстане.

---

## 🌿 Модель ветвления (Git Flow)

* `main` — стабильная рабочая ветка, готовая к деплою в продакшн.
* `develop` — основная ветка разработки следующего релиза.
* `feature/<feature-name>` — ветка для новой функциональности.
* `fix/<bug-name>` — ветка для исправления ошибок.
* `hotfix/<issue>` — срочные исправления критических багов в `main`.

---

## 🚀 Локальная разработка

### 1. Клонирование и установка
```bash
git clone https://github.com/<your-org>/shanyraq.git
cd shanyraq
```

### 2. Запуск локальной инфраструктуры (Docker)
```bash
docker compose up -d
```

### 3. Запуск Backend
```bash
cd backend
npm install
npx prisma generate
npm run prisma:migrate:deploy  # Применение миграций БД
npm run start:dev
```

### 3.1. Миграции базы данных (Prisma Migrate)

В проекте используется версионирование схемы БД через Prisma Migrate (`backend/prisma/migrations`).

* **Создание новой миграции при разработке**:
  ```bash
  cd backend
  npm run prisma:migrate:dev -- --name <migration_name>
  ```
* **Применение миграций (CI / Staging / Production)**:
  ```bash
  cd backend
  npm run prisma:migrate:deploy
  ```
* **Проверка статуса миграций**:
  ```bash
  cd backend
  npm run prisma:migrate:status
  ```
* **Baseline для существующей БД (dev / пилот)**:
  Если база данных уже содержит таблицы, начальная baseline-миграция `0_init` помечается как выполненная без повторного выполнения SQL:
  ```bash
  cd backend
  npx prisma migrate resolve --applied 0_init
  ```
* **Предмиграционная проверка дубликатов ИИН**:
  Перед применением миграций на существующей базе с данными (где колонка `iinHash` уже присутствует) обязательно выполните проверку перед наложением индекса `@unique`:
  ```bash
  cd backend
  npm run db:check-iin-duplicates
  ```
  Скрипт проверяет отсутствие дублей по хешу `iinHash` перед наложением индекса `@unique` (завершается с ошибкой при дублях, без раскрытия значений ИИН).
* **Миграция шифрования существующих ИИН**:
  ```bash
  cd backend
  npm run db:encrypt-iin
  ```
* ⚠️ **Запрет `prisma db push` на продакшене**:
  Команда `npm run prisma:push` предназначена **исключительно для быстрого локального прототипирования (dev-only)** и категорически запрещена в production / staging окружениях. Она не ведёт историю изменений, не позволяет версионировать схему и может привести к безвозвратной потере данных.
* **Откат миграций (Rollback)**:
  Prisma Migrate не поддерживает автоматический rollback. Откат выполняется в виде **новой миграции вперёд** (forward migration), восстанавливающей прежнюю структуру схемы.

### 4. Запуск Web Admin
```bash
cd frontend-web
npm install
npm run dev
```

---

## 🧪 Тестирование и качество кода

Перед созданием Pull Request обязательно убедитесь, что тесты и сборка проходят успешно:
```bash
cd backend
npm test
npm run build
```

---

## 💬 Соглашение о коммитах (Conventional Commits)

Мы используем формат [Conventional Commits](https://www.conventionalcommits.org/):
* `feat: ...` — добавление новой функциональности (например, `feat: add biometric barrier unlock`)
* `fix: ...` — исправление бага (например, `fix: correct quorum area rounding`)
* `docs: ...` — обновление документации
* `refactor: ...` — рефакторинг без изменения внешнего поведения
* `test: ...` — добавление или правка тестов
