/**
 * RFC 4180 compliant CSV generator with mandatory UTF-8 BOM prefix.
 * The UTF-8 BOM (\uFEFF -> 0xEF, 0xBB, 0xBF) is required for Microsoft Excel
 * on Windows to properly display Cyrillic characters without mojibake.
 */
export const UTF8_BOM = '\uFEFF';

const DANGEROUS_FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Escapes a single CSV field per RFC 4180 with CSV/Excel formula injection mitigation:
 * - null/undefined become an empty string
 * - Numbers, booleans and Dates are preserved without formula mitigation prefix (e.g. number -5 remains -5)
 * - String values starting with '=', '@', tab or CR are neutralized with a leading apostrophe (')
 * - String values starting with '+' are neutralized with an apostrophe UNLESS they are pure international phone numbers (e.g. +77011112233)
 * - String values starting with '-' are neutralized with an apostrophe (including '-5' as text) UNLESS they are formatted currency amounts (e.g. -15000 ₸)
 * - Fields containing commas, double quotes, or newlines are enclosed in double quotes
 * - Internal double quotes are doubled ("" -> ")
 */
export function escapeCsvField(field: unknown): string {
  if (field === null || field === undefined) {
    return '';
  }

  if (typeof field === 'number' || typeof field === 'boolean') {
    return String(field);
  }

  if (field instanceof Date) {
    return field.toISOString();
  }

  let str = String(field);

  // Neutralize CSV/Excel formula injection only for strings
  if (typeof field === 'string' && str.length > 0 && DANGEROUS_FORMULA_PREFIXES.includes(str[0])) {
    const isPhoneNumber = str[0] === '+' && /^\+\d{7,15}$/.test(str);
    const isFormattedCurrency = str[0] === '-' && /^-\d+(\.\d+)?\s*[₸$€₽]/.test(str);

    if (!isPhoneNumber && !isFormattedCurrency) {
      str = `'${str}`;
    }
  }

  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Builds a UTF-8 Buffer containing the complete CSV document with UTF-8 BOM
 * and RFC 4180 CRLF line endings.
 */
export function buildCsv(rows: unknown[][]): Buffer {
  const csvContent = rows
    .map((row) => row.map(escapeCsvField).join(','))
    .join('\r\n');

  return Buffer.from(UTF8_BOM + csvContent, 'utf-8');
}
