const fs = require('fs');
const path = require('path');

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) results = results.concat(getFiles(full));
    else if (full.endsWith('.tsx') || full.endsWith('.ts')) results.push(full);
  });
  return results;
}

const cabinetFiles = getFiles('./frontend-web/src/app/cabinet');
const componentFiles = [
  './frontend-web/src/components/NotificationBell.tsx',
  './frontend-web/src/components/LocaleSync.tsx',
  './frontend-web/src/lib/cabinet-api.ts',
  './frontend-web/src/lib/role-routing.ts'
].filter(f => fs.existsSync(f));

const allFiles = [...cabinetFiles, ...componentFiles];

const ru = require('../src/i18n/locales/ru.json');
const kk = require('../src/i18n/locales/kk.json');
const en = require('../src/i18n/locales/en.json');

function resolveKey(obj, key) {
  const parts = key.split('.');
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== 'object' || !(p in cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}

const tRegex = /\bt\(\s*['"]([^'"]+)['"]/g;
const missing = [];
const allKeys = new Set();

for (const file of allFiles) {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = tRegex.exec(content)) !== null) {
    const key = match[1];
    allKeys.add(key);
    for (const [lang, loc] of [['ru', ru], ['kk', kk], ['en', en]]) {
      if (resolveKey(loc, key) === undefined) {
        missing.push({ file: path.relative('./frontend-web', file), key, lang });
      }
    }
  }
}

console.log('Total unique t() keys found:', allKeys.size);
console.log('Missing keys count:', missing.length);
if (missing.length > 0) {
  console.log(JSON.stringify(missing, null, 2));
}
