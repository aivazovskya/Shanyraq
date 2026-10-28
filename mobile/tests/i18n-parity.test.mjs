import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ruPath = path.resolve(__dirname, '../src/i18n/locales/ru.json');
const kkPath = path.resolve(__dirname, '../src/i18n/locales/kk.json');
const enPath = path.resolve(__dirname, '../src/i18n/locales/en.json');

const ru = JSON.parse(fs.readFileSync(ruPath, 'utf8'));
const kk = JSON.parse(fs.readFileSync(kkPath, 'utf8'));
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

function extractKeys(obj, prefix = '') {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...extractKeys(value, fullPath));
    } else {
      keys.push(fullPath);
    }
  }
  return keys;
}

test('i18n key parity between ru, kk, and en', () => {
  const ruKeys = new Set(extractKeys(ru));
  const kkKeys = new Set(extractKeys(kk));
  const enKeys = new Set(extractKeys(en));

  assert.equal(ruKeys.size > 0, true, 'ru.json should have keys');

  const missingInKk = [...ruKeys].filter((k) => !kkKeys.has(k));
  const missingInEn = [...ruKeys].filter((k) => !enKeys.has(k));
  const extraInKk = [...kkKeys].filter((k) => !ruKeys.has(k));
  const extraInEn = [...enKeys].filter((k) => !ruKeys.has(k));

  assert.deepEqual(missingInKk, [], `Missing keys in kk.json: ${missingInKk.join(', ')}`);
  assert.deepEqual(missingInEn, [], `Missing keys in en.json: ${missingInEn.join(', ')}`);
  assert.deepEqual(extraInKk, [], `Extra keys in kk.json: ${extraInKk.join(', ')}`);
  assert.deepEqual(extraInEn, [], `Extra keys in en.json: ${extraInEn.join(', ')}`);
});

test('Kazakh Cyrillic specific characters are present in kk.json', () => {
  const kkContent = fs.readFileSync(kkPath, 'utf8');
  // Казахские буквы: Ә, І, Ң, Ғ, Ү, Ұ, Қ, Ө, Һ (и строчные ә, і, ң, ғ, ү, ұ, қ, ө, һ)
  const kazakhLetters = ['ә', 'і', 'ң', 'ғ', 'ү', 'ұ', 'қ', 'ө', 'һ'];
  for (const letter of kazakhLetters) {
    const regex = new RegExp(letter, 'i');
    assert.equal(
      regex.test(kkContent),
      true,
      `Letter "${letter}" should be present in kk.json`,
    );
  }
});
