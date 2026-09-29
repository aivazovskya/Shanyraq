import * as crypto from 'crypto';
import {
  encryptPii,
  decryptPii,
  hashIin,
  maskIin,
  validatePiiCryptoConfig,
  sanitizeAuditMetadata,
} from './pii-crypto.helper';

describe('pii-crypto.helper (AES-256-GCM, HMAC-SHA256, Masking & Audit)', () => {
  const originalEnv = process.env;
  const validKeyBase64 = crypto.randomBytes(32).toString('base64');
  const validHashKeyBase64 = crypto.randomBytes(32).toString('base64');

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      PII_ENCRYPTION_KEY: validKeyBase64,
      PII_HASH_KEY: validHashKeyBase64,
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('validatePiiCryptoConfig (fail-fast startup check)', () => {
    it('успешно проходит при корректном 32-байтном base64-ключе', () => {
      expect(() => validatePiiCryptoConfig()).not.toThrow();
    });

    it('выбрасывает ошибку, если PII_ENCRYPTION_KEY отсутствует', () => {
      delete process.env.PII_ENCRYPTION_KEY;
      expect(() => validatePiiCryptoConfig()).toThrow(
        /PII_ENCRYPTION_KEY environment variable is required/,
      );
    });

    it('выбрасывает ошибку, если ключ декодируется не в 32 байта (например, 16 байт)', () => {
      process.env.PII_ENCRYPTION_KEY = crypto.randomBytes(16).toString('base64');
      expect(() => validatePiiCryptoConfig()).toThrow(
        /must decode to exactly 32 bytes/,
      );
    });
  });

  describe('encryptPii & decryptPii (AES-256-GCM)', () => {
    const testIin = '900101300123';

    it('корректно выполняет encrypt/decrypt round-trip', () => {
      const encrypted = encryptPii(testIin);
      expect(encrypted).toBeDefined();
      expect(encrypted).toMatch(/^v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);

      const decrypted = decryptPii(encrypted);
      expect(decrypted).toBe(testIin);
    });

    it('генерирует разные IV и шифротексты для одного и того же открытого текста', () => {
      const encrypted1 = encryptPii(testIin);
      const encrypted2 = encryptPii(testIin);

      expect(encrypted1).not.toBe(encrypted2);

      const iv1 = encrypted1!.split(':')[1];
      const iv2 = encrypted2!.split(':')[1];
      expect(iv1).not.toBe(iv2);

      expect(decryptPii(encrypted1)).toBe(testIin);
      expect(decryptPii(encrypted2)).toBe(testIin);
    });

    it('выбрасывает ошибку при подделке или повреждении auth tag (AEAD защита)', () => {
      const encrypted = encryptPii(testIin)!;
      const parts = encrypted.split(':');
      // Модифицируем tag
      parts[2] = '0'.repeat(32);
      const tampered = parts.join(':');

      expect(() => decryptPii(tampered)).toThrow(/PII decryption failed/);
    });

    it('выбрасывает ошибку при повреждении шифротекста', () => {
      const encrypted = encryptPii(testIin)!;
      const parts = encrypted.split(':');
      // Модифицируем ciphertext
      parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith('00') ? 'ff' : '00');
      const tampered = parts.join(':');

      expect(() => decryptPii(tampered)).toThrow(/PII decryption failed/);
    });

    it('возвращает legacy plaintext без изменений, если строка не начинается с v1:', () => {
      const legacyPlaintext = '850101300111';
      expect(decryptPii(legacyPlaintext)).toBe(legacyPlaintext);
    });

    it('возвращает null для null, undefined или пустой строки', () => {
      expect(encryptPii(null)).toBeNull();
      expect(encryptPii(undefined)).toBeNull();
      expect(encryptPii('')).toBeNull();

      expect(decryptPii(null)).toBeNull();
      expect(decryptPii(undefined)).toBeNull();
      expect(decryptPii('')).toBeNull();
    });
  });

  describe('hashIin (HMAC-SHA256)', () => {
    it('детерминирован: один и тот же ИИН даёт одинаковый хеш', () => {
      const iin = '920620300444';
      const hash1 = hashIin(iin);
      const hash2 = hashIin(iin);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('чувствителен к значению: разные ИИН дают разные хеши', () => {
      const hash1 = hashIin('920620300444');
      const hash2 = hashIin('940812400555');

      expect(hash1).not.toBe(hash2);
    });

    it('нормализует пробелы перед вычислением хеша', () => {
      expect(hashIin(' 920620300444 ')).toBe(hashIin('920620300444'));
    });

    it('возвращает null для пустого ввода', () => {
      expect(hashIin(null)).toBeNull();
      expect(hashIin(undefined)).toBeNull();
      expect(hashIin('')).toBeNull();
    });
  });

  describe('maskIin', () => {
    it('маскирует открытый ИИН, оставляя последние 4 цифры (******1234)', () => {
      expect(maskIin('900101300123')).toBe('******0123');
      expect(maskIin('850101300111')).toBe('******0111');
    });

    it('маскирует зашифрованный ИИН v1:... расшифровывая его перед маскированием', () => {
      const encrypted = encryptPii('950202400567');
      expect(maskIin(encrypted)).toBe('******0567');
    });

    it('возвращает строку без изменений, если она уже замаскирована', () => {
      expect(maskIin('******0123')).toBe('******0123');
    });

    it('возвращает null для null или undefined', () => {
      expect(maskIin(null)).toBeNull();
      expect(maskIin(undefined)).toBeNull();
      expect(maskIin('')).toBeNull();
    });
  });

  describe('sanitizeAuditMetadata', () => {
    it('маскирует поля с именем iin на любом уровне вложенности', () => {
      const metadata = {
        userId: 'user-1',
        iin: '900101300123',
        residentIin: '850101300111',
        profile: {
          iin: '920620300444',
          city: 'Almaty',
        },
        items: [
          { iin: '940812400555', status: 'OK' },
        ],
      };

      const sanitized = sanitizeAuditMetadata(metadata);

      expect(sanitized?.iin).toBe('******0123');
      expect(sanitized?.residentIin).toBe('******0111');
      expect(sanitized?.profile.iin).toBe('******0444');
      expect(sanitized?.profile.city).toBe('Almaty');
      expect(sanitized?.items[0].iin).toBe('******0555');
      expect(sanitized?.userId).toBe('user-1');
    });

    it('безопасно обрабатывает undefined и не-объектные значения', () => {
      expect(sanitizeAuditMetadata(undefined)).toBeUndefined();
      expect(sanitizeAuditMetadata(null as any)).toBeNull();
    });
  });
});
