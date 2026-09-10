/**
 * Task 0034: Export kk/en translations for native-speaker review.
 *
 * Reads all locale JSON files across frontend-web and mobile,
 * flattens nested keys, tags high-risk domain terminology with priority flags,
 * and generates a combined UTF-8 BOM CSV for translator review.
 *
 * Usage:
 *   node scripts/export-translations-for-review.js
 */

const fs = require('fs');
const path = require('path');

// Domain keywords in Russian source text that indicate condo/property-management
// terms requiring legally and contextually precise native translation.
const PRIORITY_KEYWORDS = [
  'осс',
  'оси',
  'скуд',
  'иин',
  'жсн',
  'домофон',
  'шлагбаум',
  'кворум',
  'тариф',
  'лицевой счет',
  'лицевой счёт',
  'эцп',
  'протокол',
];

const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.join(REPO_ROOT, 'i18n-review-kk-en.csv');

const APP_CONFIGS = [
  {
    name: 'mobile',
    dir: path.join(REPO_ROOT, 'mobile', 'src', 'i18n', 'locales'),
  },
  {
    name: 'web',
    dir: path.join(REPO_ROOT, 'frontend-web', 'src', 'i18n', 'locales'),
  },
];

/**
 * Flattens a nested object into dot-notated paths.
 */
function flattenObject(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, fullKey));
    } else {
      result[fullKey] = value != null ? String(value) : '';
    }
  }
  return result;
}

/**
 * Escapes a single cell value according to RFC 4180 rules.
 */
function escapeCsvField(val) {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Checks whether a Russian text value contains any priority domain keywords.
 */
function isPriorityRow(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return PRIORITY_KEYWORDS.some((kw) => lower.includes(kw));
}

function main() {
  console.log('=== Exporting Translations for Native Speaker Review ===\n');

  const warnings = [];
  const rows = [];
  let totalPriorityCount = 0;

  for (const app of APP_CONFIGS) {
    const ruPath = path.join(app.dir, 'ru.json');
    const kkPath = path.join(app.dir, 'kk.json');
    const enPath = path.join(app.dir, 'en.json');

    if (!fs.existsSync(ruPath)) {
      console.error(`[ERROR] RU locale file not found: ${ruPath}`);
      process.exit(1);
    }
    if (!fs.existsSync(kkPath)) {
      console.error(`[ERROR] KK locale file not found: ${kkPath}`);
      process.exit(1);
    }
    if (!fs.existsSync(enPath)) {
      console.error(`[ERROR] EN locale file not found: ${enPath}`);
      process.exit(1);
    }

    const ruRaw = JSON.parse(fs.readFileSync(ruPath, 'utf8'));
    const kkRaw = JSON.parse(fs.readFileSync(kkPath, 'utf8'));
    const enRaw = JSON.parse(fs.readFileSync(enPath, 'utf8'));

    const ruFlat = flattenObject(ruRaw);
    const kkFlat = flattenObject(kkRaw);
    const enFlat = flattenObject(enRaw);

    const ruKeys = Object.keys(ruFlat).sort();
    let appPriorityCount = 0;

    for (const key of ruKeys) {
      const ruVal = ruFlat[key];
      let kkVal = kkFlat[key];
      let enVal = enFlat[key];

      if (kkVal === undefined) {
        warnings.push(`[WARN] Missing KK translation in ${app.name} for key: ${key}`);
        kkVal = '';
      }
      if (enVal === undefined) {
        warnings.push(`[WARN] Missing EN translation in ${app.name} for key: ${key}`);
        enVal = '';
      }

      const priority = isPriorityRow(ruVal) ? '⚠' : '';
      if (priority) {
        appPriorityCount++;
      }

      rows.push({
        app: app.name,
        key,
        ru: ruVal,
        kk: kkVal,
        en: enVal,
        priority,
        comment: '',
      });
    }

    // Check for orphan keys in KK or EN not in RU
    for (const k of Object.keys(kkFlat)) {
      if (!(k in ruFlat)) {
        warnings.push(`[WARN] Orphan KK key in ${app.name} not present in RU: ${k}`);
      }
    }
    for (const k of Object.keys(enFlat)) {
      if (!(k in ruFlat)) {
        warnings.push(`[WARN] Orphan EN key in ${app.name} not present in RU: ${k}`);
      }
    }

    console.log(`- ${app.name.toUpperCase()}: ${ruKeys.length} keys processed (${appPriorityCount} flagged priority)`);
    totalPriorityCount += appPriorityCount;
  }

  // Sort rows by App (mobile first, then web), then by Key alphabetically
  rows.sort((a, b) => {
    if (a.app !== b.app) {
      return a.app.localeCompare(b.app); // 'mobile' comes before 'web'
    }
    return a.key.localeCompare(b.key);
  });

  // Build CSV content
  const headers = ['App', 'Key', 'RU', 'KK', 'EN', 'Priority', 'Comment'];
  const csvLines = [];
  csvLines.push(headers.map(escapeCsvField).join(','));

  for (const r of rows) {
    const line = [
      escapeCsvField(r.app),
      escapeCsvField(r.key),
      escapeCsvField(r.ru),
      escapeCsvField(r.kk),
      escapeCsvField(r.en),
      escapeCsvField(r.priority),
      escapeCsvField(r.comment),
    ].join(',');
    csvLines.push(line);
  }

  // UTF-8 BOM prefix + CRLF line endings
  const UTF8_BOM = '\uFEFF';
  const csvContent = UTF8_BOM + csvLines.join('\r\n') + '\r\n';

  fs.writeFileSync(OUTPUT_FILE, csvContent, 'utf8');

  console.log(`\nExport complete:`);
  console.log(`- Output file: ${OUTPUT_FILE}`);
  console.log(`- Total rows: ${rows.length}`);
  console.log(`- Priority flagged rows (⚠): ${totalPriorityCount}`);

  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length}):`);
    warnings.forEach((w) => console.warn(`  ${w}`));
  } else {
    console.log(`- Parity status: 100% matched across RU, KK, and EN (0 missing / 0 orphan keys)`);
  }
}

main();
