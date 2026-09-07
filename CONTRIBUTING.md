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
npm run start:dev
```

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
