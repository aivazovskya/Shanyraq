const fs = require('fs');
const path = require('path');

function getNested(obj, keyPath) {
  const parts = keyPath.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur === undefined || cur === null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

const ru = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../frontend-web/src/i18n/locales/ru.json'), 'utf8'));
const kk = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../frontend-web/src/i18n/locales/kk.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../frontend-web/src/i18n/locales/en.json'), 'utf8'));

const files = [
  path.resolve(__dirname, '../frontend-web/src/app/dashboard/finance/imports/page.tsx'),
  path.resolve(__dirname, '../frontend-web/src/app/dashboard/finance/expenses/page.tsx')
];

let hasErrors = false;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const regex = /\bt\(\s*['"]([^'"]+)['"]/g;
  
  lines.forEach((line, lineIdx) => {
    let m;
    while ((m = regex.exec(line)) !== null) {
      const k = m[1];
      const inRu = getNested(ru, k) !== undefined;
      const inKk = getNested(kk, k) !== undefined;
      const inEn = getNested(en, k) !== undefined;
      if (!inRu || !inKk || !inEn) {
        console.log(`${path.basename(file)}:${lineIdx + 1} Missing "${k}":`, { inRu, inKk, inEn }, `| Line: ${line.trim()}`);
        hasErrors = true;
      }
    }
  });

  // Check for dynamic calls to t(...)
  const callRegex = /\bt\(([^)]+)\)/g;
  let cm;
  while ((cm = callRegex.exec(content)) !== null) {
    const raw = cm[1].trim();
    if (!raw.startsWith("'") && !raw.startsWith('"') && !raw.startsWith('`')) {
      console.log(`${path.basename(file)}: Dynamic t(...) call:`, raw);
    }
  }
}

if (!hasErrors) {
  console.log('ALL STATIC KEYS PRESENT IN RU, KK, EN!');
} else {
  console.log('ERRORS FOUND!');
}
