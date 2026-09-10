/**
 * RFC 4180 compliant CSV generator with mandatory UTF-8 BOM prefix.
 * The UTF-8 BOM (\uFEFF -> 0xEF, 0xBB, 0xBF) is required for Microsoft Excel
 * on Windows to properly display Cyrillic characters without mojibake.
 */
export const UTF8_BOM = '\uFEFF';

/**
 * Escapes a single CSV field per RFC 4180:
 * - null/undefined become an empty string
 * - Fields containing commas, double quotes, or newlines are enclosed in double quotes
 * - Internal double quotes are doubled ("" -> ")
 */
export function escapeCsvField(field: unknown): string {
  if (field === null || field === undefined) {
    return '';
  }

  const str = String(field);
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
