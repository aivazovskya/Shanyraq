# Task 0092: PII (IIN) Encryption at-rest — Backend

**Status:** Completed
**Assignee:** Antigravity
**Reviewer:** Team lead (architecture review only, no direct code changes)

## Context

Пункт 5.1 [PRODUCT_SPEC.md](PRODUCT_SPEC.md) («Безопасность») требует:
*"Шифрование персональных данных и данных о доступе (соответствие законодательству РК о персональных данных)"*.

До выполнения данной задачи поле `User.iin` (`backend/prisma/schema.prisma:172`) хранилось в открытом виде (plaintext). Индивидуальный идентификационный номер (ИИН) гражданина РК является критическими персональными данными (ПДн), подлежащими обязательной защите at-rest в соответствии с Законом РК «О персональных данных и их защите».

## Architecture decisions — do not re-litigate

1. **AES-256-GCM шифрование ключом из `PII_ENCRYPTION_KEY`.**
   Ключ передаётся через переменную окружения `PII_ENCRYPTION_KEY` (32 байта, base64-encoded). Переменная добавлена в `.env.example` и `.env`. Без ключа приложение не запускается (fail-fast валидация при старте в `main.ts`, аналогично критическим секретам аутентификации).
2. **Единый криптографический хелпер `backend/src/common/crypto/pii-crypto.helper.ts`.**
   Функции `encryptPii(plaintext)`, `decryptPii(ciphertext)`, `hashIin(iin)`, `maskIin(iin)`, `validatePiiCryptoConfig()`.
   Формат зашифрованной строки: `"v1:iv:tag:ciphertext"`, где:
   - `v1` — версия схемы шифрования (заложена под будущую ротацию ключей без простоя);
   - `iv` — случайный вектор инициализации (12 байт / 96 бит GCM, hex-encoded);
   - `tag` — аутентификационный тег GCM (16 байт / 128 бит, hex-encoded) для защиты от подделки и подмены (AEAD);
   - `ciphertext` — зашифрованные данные (hex-encoded).
3. **Хеширование для поиска и проверки уникальности через `iinHash`.**
   В схему БД (`User`) добавлено поле `iinHash String?` с индексом `@@index([iinHash])`. Хеш вычисляется с помощью HMAC-SHA256 (`PII_HASH_KEY` или `PII_ENCRYPTION_KEY`). Любой поиск по ИИН (например, в реестре жильцов) выполняется строго по детерминированному `iinHash`.
4. **Идемпотентный скрипт миграции существующих данных `scripts/encrypt-existing-iin.ts`.**
   Скрипт читает всех пользователей с непустым `iin`, шифрует открытый текст, рассчитывает `iinHash` и сохраняет в БД. Значения, уже начинающиеся с `"v1:"`, пропускаются без повторного шифрования.
5. **Маскирование в API-ответах (`******1234`).**
   ИИН отдаётся в маскированном виде везде, кроме авторизованного персонала УК/ОСИ в реестре жильцов (`getConfirmedResidents`, `exportConfirmedResidentsCsv`, `getResidentDetail`), где он необходим для юридической проверки собственников. В профиле жильца (`GET /auth/me`) ИИН возвращается маскированным.
6. **Санитарная очистка логов и AuditLog.**
   Логи и метаданные `AuditLogService` не должны содержать открытый ИИН (автоматическое маскирование ключей `iin` в метаданных событий аудита).

## Acceptance criteria

1. **Crypto Helper (`pii-crypto.helper.ts`)**:
   - Корректный round-trip `decryptPii(encryptPii(iin)) === iin`.
   - Разные IV на одинаковый вход (`encryptPii(x) !== encryptPii(x)`).
   - Ошибка аутентификации при модификации tag или ciphertext.
   - Детерминированный `hashIin(iin)`.
   - Корректное маскирование `maskIin(iin)` -> `******1234`.
2. **Fail-Fast Startup**:
   - Функция `validatePiiCryptoConfig()` выбрасывает фатальную ошибку при отсутствии или неверной длине `PII_ENCRYPTION_KEY`.
   - `main.ts` вызывает валидацию при bootstrap.
3. **Prisma Schema & Migrations**:
   - `User.iinHash String?` добавлено с индексом.
   - `prisma generate` выполнен успешно.
4. **Seed & Migration**:
   - `seed.ts` заполняет `iin` зашифрованным значением и рассчитывает `iinHash`.
   - `scripts/encrypt-existing-iin.ts` шифрует существующие незашифрованные ИИН и идемпотентен.
5. **Endpoints & Masking**:
   - `GET /auth/me` возвращает маскированный `iin`.
   - `getConfirmedResidents` и `getResidentDetail` возвращают расшифрованный ИИН персоналу.
   - Поиск в реестре по 12-значному ИИН работает через `iinHash`.
6. **Audit Logs**:
   - `AuditLogService` маскирует ИИН в метаданных перед записью в БД.
7. **Тесты и качество**:
   - Написаны исчерпывающие тесты для крипто-хелпера, сервисов, аудита и скрипта миграции.
   - `npm test` в `backend/` проходит без ошибок.
   - `tsc --noEmit` в `backend/`, `mobile/` и `frontend-web/` чистые.

## Out of scope

- Шифрование других персональных полей (ФИО, телефон остаются в текущем виде).
- Механизм ротации ключей в рантайме (архитектурно заложена версия схемы `v1:`).
