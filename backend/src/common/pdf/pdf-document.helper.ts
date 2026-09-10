import * as fs from 'fs';
import * as path from 'path';
const PDFDocument = require('pdfkit');

/**
 * Resolves font path across dev (ts-node/jest) and production (dist).
 */
export function resolveFontPath(filename: string): string {
  const candidates = [
    path.join(__dirname, '../../assets/fonts', filename),
    path.join(__dirname, '../../../src/assets/fonts', filename),
    path.join(process.cwd(), 'src/assets/fonts', filename),
    path.join(process.cwd(), 'backend/src/assets/fonts', filename),
    path.join(process.cwd(), 'dist/src/assets/fonts', filename),
    path.join(process.cwd(), 'dist/assets/fonts', filename),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `[PDF] Font file "${filename}" not found in any candidate paths:\n` +
      candidates.map((c) => ` - ${c}`).join('\n'),
  );
}

/**
 * Initializes a PDFDocument instance with standard styling and Cyrillic fonts.
 */
export function createPdfDocument(options?: PDFKit.PDFDocumentOptions): typeof PDFDocument {
  const regularPath = resolveFontPath('DejaVuSans.ttf');
  const boldPath = resolveFontPath('DejaVuSans-Bold.ttf');

  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    info: {
      Producer: 'Shanyraq Platform',
      Creator: 'Shanyraq Document Generator',
    },
    ...options,
  });

  doc.registerFont('DejaVuSans', regularPath);
  doc.registerFont('DejaVuSans-Bold', boldPath);
  doc.font('DejaVuSans');

  return doc;
}

/**
 * Executes a PDF builder function and resolves to a Buffer.
 */
export async function createPdfBuffer(
  builder: (doc: typeof PDFDocument) => void | Promise<void>,
  options?: PDFKit.PDFDocumentOptions,
): Promise<Buffer> {
  const doc = createPdfDocument(options);

  return new Promise(async (resolve, reject) => {
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err: Error) => reject(err));

    try {
      await builder(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export interface MetaItem {
  label: string;
  value: string;
}

export interface HeaderOptions {
  title: string;
  subtitle?: string;
  meta?: MetaItem[];
}

/**
 * Draws a standardized document header.
 */
export function drawHeader(doc: typeof PDFDocument, options: HeaderOptions): number {
  const startX = doc.page.margins.left;
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // Platform brand tag
  doc.font('DejaVuSans').fontSize(8).fillColor('#64748B').text('ПЛАТФОРМА УПРАВЛЕНИЯ ЖК «SHANYRAQ»', startX, 35, {
    align: 'right',
    width: contentWidth,
  });

  // Main Title
  doc.font('DejaVuSans-Bold').fontSize(16).fillColor('#0F172A').text(options.title, startX, 55, {
    align: 'center',
    width: contentWidth,
  });

  // Subtitle
  let currentY = doc.y + 4;
  if (options.subtitle) {
    doc.font('DejaVuSans').fontSize(11).fillColor('#334155').text(options.subtitle, startX, currentY, {
      align: 'center',
      width: contentWidth,
    });
    currentY = doc.y + 6;
  }

  // Divider line
  currentY += 4;
  doc
    .strokeColor('#CBD5E1')
    .lineWidth(1)
    .moveTo(startX, currentY)
    .lineTo(startX + contentWidth, currentY)
    .stroke();

  currentY += 10;

  // Meta items grid (2 columns)
  if (options.meta && options.meta.length > 0) {
    const colWidth = contentWidth / 2 - 10;
    const metaStartY = currentY;
    let leftY = metaStartY;
    let rightY = metaStartY;

    options.meta.forEach((item, index) => {
      const isLeft = index % 2 === 0;
      const x = isLeft ? startX : startX + colWidth + 20;
      const y = isLeft ? leftY : rightY;

      doc.font('DejaVuSans-Bold').fontSize(9).fillColor('#475569').text(`${item.label}: `, x, y, {
        continued: true,
        width: colWidth,
      });
      doc.font('DejaVuSans').fontSize(9).fillColor('#0F172A').text(item.value);

      if (isLeft) {
        leftY = doc.y + 3;
      } else {
        rightY = doc.y + 3;
      }
    });

    currentY = Math.max(leftY, rightY) + 6;

    // Second subtle divider
    doc
      .strokeColor('#E2E8F0')
      .lineWidth(0.5)
      .moveTo(startX, currentY)
      .lineTo(startX + contentWidth, currentY)
      .stroke();

    currentY += 10;
  }

  return currentY;
}

/**
 * Draws a clean section title with spacing.
 */
export function drawSectionTitle(doc: typeof PDFDocument, title: string, y?: number): number {
  const startX = doc.page.margins.left;
  const targetY = y !== undefined ? y : doc.y + 8;

  doc.font('DejaVuSans-Bold').fontSize(12).fillColor('#1E293B').text(title, startX, targetY);

  return doc.y + 6;
}

export interface TableColumn {
  header: string;
  width: number;
  align?: 'left' | 'center' | 'right';
}

export interface TableOptions {
  columns: TableColumn[];
  rows: (string | number)[][];
  startY?: number;
}

/**
 * Draws a bordered, aligned table with header fill.
 */
export function drawTable(doc: typeof PDFDocument, options: TableOptions): number {
  const startX = doc.page.margins.left;
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let currentY = options.startY !== undefined ? options.startY : doc.y;

  const headerHeight = 22;

  // Header background fill
  doc.rect(startX, currentY, contentWidth, headerHeight).fill('#F1F5F9');

  // Header text
  let currentX = startX;
  options.columns.forEach((col) => {
    doc
      .font('DejaVuSans-Bold')
      .fontSize(9)
      .fillColor('#334155')
      .text(col.header, currentX + 4, currentY + 6, {
        width: col.width - 8,
        align: col.align || 'left',
      });
    currentX += col.width;
  });

  // Header border
  doc.rect(startX, currentY, contentWidth, headerHeight).strokeColor('#CBD5E1').lineWidth(0.75).stroke();
  currentY += headerHeight;

  // Rows
  if (options.rows.length === 0) {
    const emptyHeight = 22;
    doc
      .font('DejaVuSans')
      .fontSize(9)
      .fillColor('#94A3B8')
      .text('Нет записей за указанный период', startX + 10, currentY + 6, {
        width: contentWidth - 20,
        align: 'center',
      });
    doc.rect(startX, currentY, contentWidth, emptyHeight).strokeColor('#E2E8F0').lineWidth(0.5).stroke();
    return currentY + emptyHeight + 10;
  }

  options.rows.forEach((row, rowIndex) => {
    // Check if new page needed
    if (currentY > doc.page.height - doc.page.margins.bottom - 40) {
      doc.addPage();
      currentY = doc.page.margins.top;
    }

    // Measure max row height based on text content
    let maxCellHeight = 20;
    options.columns.forEach((col, colIndex) => {
      const cellText = String(row[colIndex] ?? '');
      const textHeight = doc.heightOfString(cellText, {
        width: col.width - 8,
      });
      if (textHeight + 10 > maxCellHeight) {
        maxCellHeight = textHeight + 10;
      }
    });

    // Alternate row background
    if (rowIndex % 2 === 1) {
      doc.rect(startX, currentY, contentWidth, maxCellHeight).fill('#F8FAFC');
    }

    // Cell text
    let cellX = startX;
    options.columns.forEach((col, colIndex) => {
      const cellText = String(row[colIndex] ?? '');
      doc
        .font('DejaVuSans')
        .fontSize(8.5)
        .fillColor('#1E293B')
        .text(cellText, cellX + 4, currentY + 5, {
          width: col.width - 8,
          align: col.align || 'left',
        });
      cellX += col.width;
    });

    // Cell borders
    doc.rect(startX, currentY, contentWidth, maxCellHeight).strokeColor('#E2E8F0').lineWidth(0.5).stroke();

    currentY += maxCellHeight;
  });

  doc.y = currentY + 6;
  return doc.y;
}

/**
 * Draws a standardized footer at the bottom of the page without triggering auto-pagebreak.
 */
export function drawFooter(doc: typeof PDFDocument, note?: string) {
  const startX = doc.page.margins.left;
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const footerY = doc.page.height - 30;

  // Temporarily zero out bottom margin so PDFKit does not trigger a page break
  const prevMarginBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  doc
    .strokeColor('#E2E8F0')
    .lineWidth(0.5)
    .moveTo(startX, footerY - 5)
    .lineTo(startX + contentWidth, footerY - 5)
    .stroke();

  const leftWidth = contentWidth * 0.6;
  const rightWidth = contentWidth * 0.4;
  const rightX = startX + leftWidth;

  if (note) {
    doc.font('DejaVuSans').fontSize(7.5).fillColor('#64748B').text(note, startX, footerY, {
      width: leftWidth,
      align: 'left',
      lineBreak: false,
    });
  }

  doc
    .font('DejaVuSans')
    .fontSize(7.5)
    .fillColor('#94A3B8')
    .text('Сформировано системой Shanyraq', rightX, footerY, {
      width: rightWidth,
      align: 'right',
      lineBreak: false,
    });

  doc.page.margins.bottom = prevMarginBottom;
}
