# 🏢 Shanyraq (Шаңырақ)

[![CI Pipeline](https://github.com/shanyraq-kz/shanyraq/actions/workflows/ci.yml/badge.svg)](https://github.com/shanyraq-kz/shanyraq/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10.3-red?logo=nestjs)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14.1-black?logo=next.js)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-darkblue?logo=prisma)](https://www.prisma.io/)

> **Единая цифровая экосистема для жильцов, объединений собственников имущества (ОСИ) и управляющих компаний (УК) в Республике Казахстан.**

---

## 🌟 Ключевые возможности

### 🗳️ Легитимные голосования ОСС (Общие собрания собственников)
* **Точный расчет по Закону РК «О жилищных отношениях»**: Вес каждого голоса строго пропорционален полезной площади квартиры ($м^2$) к общей площади ЖК.
* **Кворум в реальном времени**: Автоматический мониторинг преодоления 50% порога участия собственников.
* **Криптографическая защита волеизъявления**: Каждый голос подписывается SHA-256 цифровым отпечатком и заверяется через SMS-OTP / eGov QR.
* **Автоматические протоколы**: Генерация юридически значимого протокола по итогам голосования с разбивкой по площадям.

### 🚧 Управление доступом (СКУД) и Видеонаблюдение
* **Умный шлагбаум**: Открытие шлагбаума и ворот с мобильного приложения (интеграция с Pal-ES, GSM/IP-реле и MQTT).
* **Камеры ЖК онлайн**: Прямая трансляция с камер двора и подъездов с ультранизкой задержкой через WebRTC шлюз (`go2rtc`).
* **Гостевые пропуска**: Генерация временных PIN-кодов и QR-пропусков для гостей и курьеров.
* **Неизменяемый журнал**: Полный аудит всех открытий и проездов с фиксацией времени и квартиры.

### 🛠️ Service Desk (Заявки на ремонт и обслуживание)
* Прием обращений (сантехника, электрика, лифты, домофоны, уборка) с прикреплением фото и видео.
* Координация мастеров и контроль сроков исполнения (SLA) диспетчерской службой.
* Чат по заявке и система оценки качества (1–5 звезд) от собственника.

### 👥 Реестр жилого фонда и верификация прав
* База данных домов, блоков, квартир и нежилых помещений с кадастровыми номерами.
* Верификация собственников по выпискам из реестра eGov и договорам купли-продажи/ДДУ.
* Ролевая модель доступа: Собственник, Арендатор, Председатель ОСИ, Диспетчер, Охрана, Администратор УК.

---

## 🏗️ Архитектура системы

Подробное описание архитектуры, схемы C4 и Sequence диаграммы бизнес-процессов доступны в документе [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

```
Shanyraq/
├── backend/               # Серверное ядро (NestJS 10, TypeScript, Prisma ORM)
│   ├── src/modules/       # Модули: auth, votings, properties, service-requests, access-control
│   └── prisma/            # Схема БД (schema.prisma) и тестовый сидер (seed.ts)
├── frontend-web/          # Веб-панель УК / ОСИ / Диспетчера / Охраны (Next.js 14, Tailwind CSS)
├── docs/                  # Техническая документация, ТЗ и диаграммы архитектуры
├── infra/                 # Конфигурация медиасервера камер (go2rtc)
├── .github/workflows/     # CI/CD автоматизация тестирования и сборки
└── docker-compose.yml     # PostgreSQL 16, Redis 7, MinIO S3, go2rtc шлюз
```

---

## ⚡ Быстрый старт для разработки

### 1. Системные требования
* Node.js v20+ (рекомендуется v22 / v24)
* Docker & Docker Compose
* Git

### 2. Клонирование репозитория
```bash
git clone https://github.com/<your-org>/shanyraq.git
cd shanyraq
```

### 3. Запуск инфраструктуры
```bash
docker compose up -d
```
Запустит:
* **PostgreSQL** (`localhost:5432`)
* **Redis** (`localhost:6379`)
* **MinIO S3** (`localhost:9000`, консоль: `localhost:9001`)
* **go2rtc WebRTC Gateway** (`localhost:1984`)

### 4. Запуск Backend (Shanyraq Core API)
```bash
cd backend
npm install
npx prisma generate
npm run test           # Запуск юнит-тестов кворума и голосований
npm run start:dev      # Запуск API сервера в watch-режиме
```
* **API эндпоинты**: `http://localhost:4000/api/v1`
* **Swagger API Документация**: `http://localhost:4000/api/docs`

### 5. Запуск Веб-панели (Next.js)
```bash
cd ../frontend-web
npm install
npm run dev
```
* Веб-интерфейс доступен по адресу: `http://localhost:3000`

---

## 🧪 Запуск тестов

В проекте реализованы строгие тесты проверки бизнес-логики:
```bash
cd backend
npm test
```
Тесты проверяют:
* Блокировку голосования не-собственникам и неавторизованным жильцам.
* Корректный расчет веса голоса пропорционально площади квартиры ($м^2$).
* Защиту от повторного голосования одной квартирой.
* Алгоритм признания кворума состоявшимся при преодолении порога 50% полезной площади дома.

---

## 📜 Лицензия

Проект распространяется под лицензией **MIT**. Подробности в файле [LICENSE](./LICENSE).
