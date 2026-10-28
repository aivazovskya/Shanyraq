const fs = require('fs');
const path = require('path');

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) results = results.concat(getFiles(full));
    else if (full.endsWith('.tsx')) results.push(full);
  });
  return results;
}

const files = getFiles('./frontend-web/src/app/cabinet');
const cyrillicOutsideT = [];

for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;
    if (trimmed.includes('console.warn') || trimmed.includes('console.error')) return;

    // Remove t('...') occurrences
    const withoutT = line.replace(/t\(\s*['"][^'"]+['"][^)]*\)/g, '');
    const cyrillicMatch = withoutT.match(/[\u0400-\u04FF]{2,}/);
    if (cyrillicMatch) {
      cyrillicOutsideT.push({
        file: path.relative('./frontend-web', file),
        line: idx + 1,
        match: cyrillicMatch[0],
        snippet: trimmed
      });
    }
  });
}

console.log('Lines with hardcoded Cyrillic outside t():', cyrillicOutsideT.length);
cyrillicOutsideT.forEach(c => {
  console.log(`${c.file}:${c.line} [${c.match}] -> ${c.snippet}`);
});
