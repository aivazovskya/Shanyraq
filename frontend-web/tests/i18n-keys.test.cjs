const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function getNested(obj, keyPath) {
  const parts = keyPath.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur === undefined || cur === null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

test('all t(...) keys in finance imports and expenses pages exist in ru, kk, en locales', () => {
  const locales = {
    ru: JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/i18n/locales/ru.json'), 'utf8')),
    kk: JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/i18n/locales/kk.json'), 'utf8')),
    en: JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/i18n/locales/en.json'), 'utf8')),
  };

  const files = [
    path.resolve(__dirname, '../src/app/dashboard/finance/imports/page.tsx'),
    path.resolve(__dirname, '../src/app/dashboard/finance/expenses/page.tsx'),
    path.resolve(__dirname, '../src/app/dashboard/finance/budget/page.tsx'),
    path.resolve(__dirname, '../src/app/dashboard/finance/audit/page.tsx'),
  ];

  const regex = /\bt\(\s*['"]([^'"]+)['"]/g;
  const missing = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      let m;
      while ((m = regex.exec(line)) !== null) {
        const k = m[1];
        for (const [lang, dict] of Object.entries(locales)) {
          if (getNested(dict, k) === undefined) {
            missing.push({
              file: path.basename(file),
              line: idx + 1,
              key: k,
              lang,
            });
          }
        }
      }
    });
  }

  assert.deepEqual(missing, [], `Missing i18n keys: ${JSON.stringify(missing, null, 2)}`);
});

test('no raw untranslated text in JSX tags for budget and audit pages', () => {
  const newPages = [
    path.resolve(__dirname, '../src/app/dashboard/finance/budget/page.tsx'),
    path.resolve(__dirname, '../src/app/dashboard/finance/audit/page.tsx'),
  ];

  const leaks = [];

  for (const file of newPages) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      const cleaned = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
      const matches = cleaned.match(/>([^<>{}\r\n]+)</g);
      if (matches) {
        for (const m of matches) {
          const text = m.slice(1, -1).trim();
          if (!text) continue;
          // Ignore numbers, punctuation, currency symbols, math signs, bullets, dashes
          if (/^[0-9\s₸$€₽%+\-—•/\\(),.:;=><!?'"|]+$/.test(text)) continue;
          // Ignore technical file extension badges
          if (/^\.?(xlsx|xls|csv)(\s*,\s*\.?(xlsx|xls|csv))*$/i.test(text)) continue;

          leaks.push({
            file: path.basename(file),
            line: idx + 1,
            text,
          });
        }
      }
    });
  }

  assert.deepEqual(leaks, [], `Raw untranslated text detected in JSX: ${JSON.stringify(leaks, null, 2)}`);
});
