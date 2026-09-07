# ТЗ: мобильное приложение жильцов «Shanyraq»

Второй фронтенд к уже существующему backend. Ниже — не абстрактный список фич, а прямая привязка каждого экрана к реальным эндпоинтам, которые уже есть и проверены аудитом. Там, где backend чего-то не хватает для экрана — это отдельно помечено в разделе «Пробелы на backend», без них экран не собрать.

**Стек:** React Native + TypeScript. Обоснование: весь backend и веб-панель уже на TS (NestJS/Next.js) — общий язык, при желании можно расшарить DTO-типы между репозиториями.

**Роли в скоупе мобильного приложения:** `RESIDENT_OWNER`, `RESIDENT_TENANT` (собственник и арендатор — жители). Роли персонала (`SECURITY`, `DISPATCHER`, `HOA_ADMIN`, `HOA_CHAIRMAN`) — не в этом приложении, у них веб-панель.

---

## 1. Авторизация
Экран входа по телефону + SMS-OTP.
- `POST /auth/request-otp`: Лимит 1 SMS/60 сек, обратный отсчет на экране.
- `POST /auth/verify-otp`: 3 попытки, блокировка на 10 мин (`BadRequestException`).
- Хранение сессии: `expo-secure-store` (`accessToken` 7 дней, `refreshToken` 30 дней).
- `POST /auth/refresh`: Автоматический тихий рефреш при 401.
- `GET /auth/me`: Автовход при старте. Если `ownerships: []`, редирект на экран привязки.

---

## 2. Привязка квартиры
- `POST /properties/ownerships/claim`: ЖК, квартира, тип владения (`OWNER`/`TENANT`), доля, скан документа.
- Три состояния: не подано / на рассмотрении / подтверждено (`PATCH /properties/ownerships/:id/verify`).

---

## 3. Главный экран (Дашборд)
Параллельные запросы:
- `GET /votings/tenant/:tenantId` (активные голосования)
- `GET /service-requests?tenantId=...` (открытые заявки)
- `GET /announcements/tenant/:tenantId` (последние новости)

---

## 4. Голосования (ОСС)
- `GET /votings/tenant/:tenantId`: Список собраний
- `GET /votings/:meetingId`: Детали, кворум, повестка, `myVote`
- `POST /votings/vote`: Юридически подтвержденный голос с SMS-OTP (`POST /auth/request-otp` перед отправкой)

---

## 5. Доступ: шлагбаум и гостевые пропуска
- `GET /access/tenant/:tenantId/points`: Список точек доступа
- `POST /access/open-barrier`: Свайп / long-press для открытия
- `POST /access/guest-pass`: Выпуск гостевого пропуска с QR (`accessCode`, `qrCodeUrl`) и шерингом

---

## 6. Камеры
- `GET /access/points/:id/stream`: HLS поток (с фолбэком на webPlayer WebView)

---

## 7. Заявки на обслуживание (Service Desk)
- `GET /service-requests`: Список заявок
- `GET /service-requests/:id`: Детали и чат
- `POST /service-requests`: Создание заявки
- `POST /service-requests/:id/comments`: Добавление комментария
- `POST /service-requests/:id/rate`: Оценка 1–5 звезд

---

## 8. Новости и оповещения
- `GET /announcements/tenant/:tenantId`: Лента объявлений

---

## 9. Профиль
- `GET /auth/me`: Данные жильца, список квартир и площадей, выход (очистка токенов)

---

## Пробелы на backend
1. Загрузка файлов (MinIO presigned URLs / direct upload) для документов и фото заявок.
2. Push-уведомления (хранение токенов устройств, интеграция с Expo Push / FCM / APNs).
3. Поиск ЖК / код приглашения от УК при регистрации.
4. Отзыв refresh-токена (бэкенд-логаут).
