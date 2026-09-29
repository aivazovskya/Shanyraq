import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // 96 bits standard for AES-GCM
const VERSION_PREFIX = 'v1';
/**
 * Валидация конфигурации шифрования ПДн при старте приложения (fail-fast).
 * Выбрасывает исключение, если PII_ENCRYPTION_KEY отсутствует или не равен 32 байтам,
 * либо если PII_HASH_KEY задан, но не равен 32 байтам.
 */
export function validatePiiCryptoConfig(): void {
  const keyBase64 = process.env.PII_ENCRYPTION_KEY;
  if (!keyBase64) {
    throw new Error('FATAL: PII_ENCRYPTION_KEY environment variable is required');
  }

  const keyBuffer = Buffer.from(keyBase64, 'base64');
  if (keyBuffer.length !== 32) {
    throw new Error(
      `FATAL: PII_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${keyBuffer.length} bytes)`,
    );
  }

  const hashKeyBase64 = process.env.PII_HASH_KEY;
  if (hashKeyBase64) {
    const hashKeyBuffer = Buffer.from(hashKeyBase64, 'base64');
    if (hashKeyBuffer.length !== 32) {
      throw new Error(
        `FATAL: PII_HASH_KEY must decode to exactly 32 bytes (got ${hashKeyBuffer.length} bytes)`,
      );
    }
  }
}

/**
 * Получение 32-байтного ключа шифрования AES-256 из переменной окружения PII_ENCRYPTION_KEY.
 */
export function getPiiEncryptionKey(): Buffer {
  const keyBase64 = process.env.PII_ENCRYPTION_KEY;
  if (!keyBase64) {
    throw new Error('PII_ENCRYPTION_KEY environment variable is required');
  }

  const keyBuffer = Buffer.from(keyBase64, 'base64');
  if (keyBuffer.length !== 32) {
    throw new Error(
      `PII_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${keyBuffer.length} bytes)`,
    );
  }

  return keyBuffer;
}

/**
 * Получение ключа для вычисления HMAC-SHA256 хеша ИИН.
 * Использует PII_HASH_KEY, если он задан (строго 32 байта), иначе PII_ENCRYPTION_KEY.
 */
export function getPiiHashKey(): Buffer {
  const hashKeyBase64 = process.env.PII_HASH_KEY;
  if (hashKeyBase64 !== undefined && hashKeyBase64 !== null && hashKeyBase64 !== '') {
    const keyBuffer = Buffer.from(hashKeyBase64, 'base64');
    if (keyBuffer.length !== 32) {
      throw new Error(
        `PII_HASH_KEY must decode to exactly 32 bytes (got ${keyBuffer.length} bytes)`,
      );
    }
    return keyBuffer;
  }
  return getPiiEncryptionKey();
}

/**
 * Шифрование персональных данных алгоритмом AES-256-GCM.
 * Формат результата: "v1:iv:tag:ciphertext" (всё в hex).
 */
export function encryptPii(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined || plaintext === '') {
    return null;
  }

  const key = getPiiEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${VERSION_PREFIX}:${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Расшифровка персональных данных.
 * Если строка не начинается с версии "v1:", возвращает её без изменений
 * (поддержка незашифрованных данных до миграции).
 */
export function decryptPii(ciphertext: string | null | undefined): string | null {
  if (ciphertext === null || ciphertext === undefined || ciphertext === '') {
    return null;
  }

  // Если данные ещё не зашифрованы (legacy plaintext)
  if (!ciphertext.startsWith(`${VERSION_PREFIX}:`)) {
    return ciphertext;
  }

  const parts = ciphertext.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted PII format: expected v1:iv:tag:ciphertext');
  }

  const [, ivHex, tagHex, dataHex] = parts;
  const key = getPiiEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encryptedData = Buffer.from(dataHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (err: any) {
    throw new Error(`PII decryption failed: ${err?.message || 'authentication failed'}`);
  }
}

/**
 * Вычисление детерминированного HMAC-SHA256 хеша для поиска и проверки уникальности ИИН.
 */
export function hashIin(iin: string | null | undefined): string | null {
  if (iin === null || iin === undefined || iin === '') {
    return null;
  }

  const normalized = iin.trim();
  const key = getPiiHashKey();
  return crypto.createHmac('sha256', key).update(normalized).digest('hex');
}

/**
 * Маскирование ИИН в ответах API: оставляет последние 4 цифры (******1234).
 */
export function maskIin(iin: string | null | undefined): string | null {
  if (!iin) {
    return null;
  }

  // Если уже замаскирован
  if (iin.startsWith('*')) {
    return iin;
  }

  // Если ИИН зашифрован, сначала расшифруем его перед маскированием
  const plain = iin.startsWith(`${VERSION_PREFIX}:`) ? decryptPii(iin) : iin;
  if (!plain) {
    return null;
  }

  if (plain.length >= 4) {
    return '******' + plain.slice(-4);
  }

  return '******';
}

/**
 * Очистка метаданных логов/аудита от открытого ИИН.
 */
export function sanitizeAuditMetadata(metadata?: Record<string, any>): Record<string, any> | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return metadata;
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (key.toLowerCase().includes('iin')) {
      sanitized[key] = typeof value === 'string' ? maskIin(value) : '******';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeAuditMetadata(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        item && typeof item === 'object' ? sanitizeAuditMetadata(item) : item,
      );
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
