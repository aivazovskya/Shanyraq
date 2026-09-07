# Архитектура платформы «Shanyraq» (Шаңырақ)

Документ описывает техническую и системную архитектуру платформы «Shanyraq», алгоритмы взаимодействия компонентов, структуру базы данных и последовательности бизнес-процессов.

---

## 1. Системная архитектура (C4 Container View)

```mermaid
flowchart TB
    subgraph Clients["Клиентские приложения"]
        Mobile["📱 Мобильное приложение (Flutter)<br/>Жильцы (iOS / Android)"]
        WebAdmin["💻 Веб-панель (Next.js / React)<br/>УК / ОСИ / Диспетчер / Охрана"]
    end

    subgraph Gateway["Инфраструктура доступа"]
        Nginx["Nginx Reverse Proxy / SSL"]
    end

    subgraph CoreBackend["Серверное ядро Shanyraq (NestJS)"]
        AuthMod["Модуль Auth & RBAC<br/>(JWT + SMS OTP)"]
        PropMod["Модуль Жилого фонда<br/>(ЖК, Дома, Квартиры, Площади)"]
        VotingMod["Модуль ОСС Голосований<br/>(Кворум, Вес площадей, Хэш-подпись)"]
        DeskMod["Модуль Service Desk<br/>(Заявки, Статусы, SLA, Чат)"]
        AccessMod["Модуль СКУД & Видео<br/>(Шлагбаумы, Логи, Пропуска)"]
        NewsMod["Модуль Новостей & Push<br/>(Лента, Оповещения)"]
    end

    subgraph Storage["Хранилище данных и очередей"]
        Postgres[("PostgreSQL 16<br/>Реляционная БД")]
        Redis[("Redis 7<br/>Кэш, Сессии, BullMQ")]
        MinIO[("MinIO S3<br/>Документы, Фотоотчеты")]
    end

    subgraph External["Внешние шлюзы и оборудование"]
        IoT["🚧 Контроллеры шлагбаумов<br/>(Pal-ES / Relay / MQTT)"]
        Cameras["🎥 IP-камеры & NVR<br/>(Dahua / Hikvision via go2rtc)"]
        SMS["📨 SMS-шлюз РК<br/>(KazInfoTech / SMS-C)"]
    end

    Mobile -->|HTTPS / WSS| Nginx
    WebAdmin -->|HTTPS / WSS| Nginx
    Nginx --> AuthMod
    Nginx --> PropMod
    Nginx --> VotingMod
    Nginx --> DeskMod
    Nginx --> AccessMod
    Nginx --> NewsMod

    AuthMod & PropMod & VotingMod & DeskMod & AccessMod & NewsMod --> Postgres
    AuthMod & DeskMod --> Redis
    DeskMod & VotingMod --> MinIO

    AccessMod -->|API / MQTT| IoT
    AccessMod -->|RTSP / WebRTC| Cameras
    AuthMod & VotingMod -->|REST API| SMS
```

---

## 2. Диаграмма последовательности: Голосование на общем собрании (ОСС)

В соответствии с Законом РК «О жилищных отношениях», один собственник обладает весом голоса, строго равным полезной площади его квартиры ($м^2$).

```mermaid
sequenceDiagram
    autonumber
    actor Resident as 👤 Собственник (Мобильное приложение)
    participant API as 🚀 Shanyraq Core API
    participant DB as 🗄️ PostgreSQL
    participant SMS as 📨 SMS-шлюз

    Resident->>API: 1. Просмотр активных голосований (GET /votings/tenant/:id)
    API->>DB: Запрос повестки и текущего кворума
    DB-->>API: Собрание, вопросы повестки, процент кворума
    API-->>Resident: Отображение вопросов и документов повестки

    Resident->>API: 2. Выбор варианта ("ЗА") + Запрос подписи (POST /auth/request-otp)
    API->>SMS: Отправка одноразового SMS-кода
    SMS-->>Resident: SMS с кодом: "1234"

    Resident->>API: 3. Отправка голоса + OTP (POST /votings/vote)
    Note over API: Проверка права собственности (isVerified=true)<br/>Проверка отсутствия повторного голоса<br/>Расчет веса: S кв.м * (доля / 100)
    API->>API: Вычисление SHA-256 хэша волеизъявления
    API->>DB: Сохранение голоса в таблицу `votes`
    API->>DB: Пересчет общего кворума собрания (Q %)
    API-->>Resident: 200 OK ("Голос учтен, кворум обновлен")
```

---

## 3. Диаграмма последовательности: Открытие шлагбаума и аудит

```mermaid
sequenceDiagram
    autonumber
    actor Resident as 👤 Житель
    participant Mobile as 📱 Мобильное приложение
    participant API as 🚀 Shanyraq Core API
    participant Controller as 🚧 Контроллер шлагбаума (Pal-ES / Реле)
    participant Audit as 📜 Неизменяемый журнал (AccessLog)

    Resident->>Mobile: Нажатие кнопки «Открыть въездной шлагбаум»
    Mobile->>Mobile: Биометрическая валидация (FaceID/Fingerprint)
    Mobile->>API: POST /access/open-barrier { accessPointId }
    Note over API: Проверка активной привязки к квартире ЖК (RBAC)
    alt Доступ разрешен
        API->>Controller: Импульс открытия (HTTP POST / MQTT trigger)
        Controller-->>API: 200 OK (Шлагбаум открыт)
        API->>Audit: Запись в журнал: SUCCESS (Время, Житель, Квартира)
        API-->>Mobile: 200 OK ("Шлагбаум открыт")
    else Доступ запрещен
        API->>Audit: Запись в журнал: DENIED (Причина отказа)
        API-->>Mobile: 403 Forbidden ("Нет прав доступа к ЖК")
    end
```
