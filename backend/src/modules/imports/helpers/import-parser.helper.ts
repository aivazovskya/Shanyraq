import * as ExcelJS from 'exceljs';
import { Readable } from 'stream';

export const STANDARD_EXPENSE_CATEGORIES: string[] = [
  'Эксплуатационные расходы',
  'Текущий ремонт',
  'Зарплата персонала',
  'Коммунальные услуги',
  'Уборка и клининг',
  'Обслуживание лифтов',
  'Лифтовое хозяйство',
  'Домофон и СКУД',
  'Обслуживание домофонов',
  'Вывоз мусора',
  'Охрана',
  'Охрана и безопасность',
  'Электроэнергия ОДН',
  'Теплоснабжение ОДН',
  'Водоснабжение ОДН',
  'Дезинсекция и дератизация',
  'Банковское обслуживание',
  'Юридические услуги',
  'Юридические и банковские услуги',
  'Прочие расходы',
];

/**
 * Парсинг значения ячейки в дату:
 * - JS Date
 * - Excel serial number (например, 45717 = 01.03.2025)
 * - Строки DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY
 * - Строки YYYY-MM-DD, YYYY/MM/DD
 * - ISO строки
 */
export function parseCellDate(val: any): Date | null {
  if (val === null || val === undefined || val === '') return null;

  // Если это объект формулы или rich text
  if (typeof val === 'object' && val !== null) {
    if (val instanceof Date) {
      return isNaN(val.getTime()) ? null : val;
    }
    if ('result' in val) {
      return parseCellDate((val as any).result);
    }
    if ('text' in val) {
      return parseCellDate((val as any).text);
    }
    if (Array.isArray((val as any).richText)) {
      const text = (val as any).richText.map((t: any) => t.text).join('');
      return parseCellDate(text);
    }
  }

  // Числовой serial-date Excel
  if (typeof val === 'number') {
    if (val < 1) return null;
    // В Excel 1900 год ошибочно считается високосным (day 60 = 29.02.1900)
    const days = val > 60 ? val - 1 : val;
    // 25569 = количество дней между 01.01.1900 и 01.01.1970
    const ms = Math.round((days - 25568) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return null;

    // DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY
    const dmyMatch = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10) - 1;
      const year = parseInt(dmyMatch[3], 10);
      const d = new Date(Date.UTC(year, month, day));
      if (
        d.getUTCFullYear() === year &&
        d.getUTCMonth() === month &&
        d.getUTCDate() === day
      ) {
        return d;
      }
      return null;
    }

    // YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
    const ymdMatch = s.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
    if (ymdMatch) {
      const year = parseInt(ymdMatch[1], 10);
      const month = parseInt(ymdMatch[2], 10) - 1;
      const day = parseInt(ymdMatch[3], 10);
      const d = new Date(Date.UTC(year, month, day));
      if (
        d.getUTCFullYear() === year &&
        d.getUTCMonth() === month &&
        d.getUTCDate() === day
      ) {
        return d;
      }
      return null;
    }

    // Стандартный ISO парсинг
    const isoDate = new Date(s);
    if (!isNaN(isoDate.getTime())) {
      return isoDate;
    }
  }

  return null;
}

/**
 * Парсинг денежной суммы:
 * - Поддерживает '1 234,50', '1234.5', '1 234.50', '1,234.50', '1234,50 ₸'
 * - Обрабатывает неразрывные пробелы (\u00A0, \u202F)
 */
export function parseCellAmount(val: any): { amount: number; raw: string } | null {
  if (val === null || val === undefined || val === '') return null;

  if (typeof val === 'object' && val !== null) {
    if ('result' in val) {
      return parseCellAmount((val as any).result);
    }
    if ('text' in val) {
      return parseCellAmount((val as any).text);
    }
    if (Array.isArray((val as any).richText)) {
      const text = (val as any).richText.map((t: any) => t.text).join('');
      return parseCellAmount(text);
    }
  }

  if (typeof val === 'number') {
    if (!isFinite(val) || val <= 0) {
      return { amount: 0, raw: String(val) };
    }
    return { amount: Math.round(val * 100) / 100, raw: String(val) };
  }

  if (typeof val === 'string') {
    const raw = val;
    const trimmed = val.trim();
    if (!trimmed) return null;

    // Удаляем все пробелы, в т.ч. неразрывные
    let clean = trimmed.replace(/[\s\u00A0\u202F\t]/g, '');
    // Удаляем обозначения валюты: ₸, KZT, тг, тенге
    clean = clean.replace(/[₸kztтгтенге]/gi, '');

    // Обработка разделителей
    if (clean.includes(',') && clean.includes('.')) {
      if (clean.indexOf(',') < clean.indexOf('.')) {
        // "1,234.50" -> удаляем запятую
        clean = clean.replace(/,/g, '');
      } else {
        // "1.234,50" -> удаляем точку, меняем запятую на точку
        clean = clean.replace(/\./g, '').replace(/,/g, '.');
      }
    } else if (clean.includes(',')) {
      // "1234,50" -> "1234.50"
      clean = clean.replace(/,/g, '.');
    }

    const parsed = parseFloat(clean);
    if (isNaN(parsed) || !isFinite(parsed) || parsed <= 0) {
      return { amount: 0, raw };
    }
    return { amount: Math.round(parsed * 100) / 100, raw };
  }

  return null;
}

/**
 * Преобразование значения ячейки в строку
 */
export function cellToString(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object' && val !== null) {
    if (val instanceof Date) return val.toISOString();
    if ('result' in val) return cellToString((val as any).result);
    if ('text' in val) return cellToString((val as any).text);
    if (Array.isArray((val as any).richText)) {
      return (val as any).richText.map((t: any) => t.text).join('');
    }
  }
  return String(val).trim();
}

export interface DetectedColumnMapping {
  date: number; // 0-based column index
  amount: number;
  category: number;
  counterparty: number;
  documentNumber: number;
  description: number;
}

/**
 * Автоопределение индексов колонок по заголовкам (RU, KK, EN)
 */
export function autoDetectColumns(
  headers: string[],
  manualMapping?: Record<string, string | number>,
): DetectedColumnMapping {
  const mapping: DetectedColumnMapping = {
    date: -1,
    amount: -1,
    category: -1,
    counterparty: -1,
    documentNumber: -1,
    description: -1,
  };

  const normHeaders = headers.map((h) => (h || '').toLowerCase().trim());

  // Проверяем ручной маппинг, если передан
  const resolveIndex = (val: string | number | undefined): number => {
    if (val === undefined || val === null) return -1;
    if (typeof val === 'number') {
      return val >= 0 && val < headers.length ? val : -1;
    }
    const idx = normHeaders.indexOf(val.toLowerCase().trim());
    if (idx !== -1) return idx;
    const num = parseInt(val, 10);
    return !isNaN(num) && num >= 0 && num < headers.length ? num : -1;
  };

  if (manualMapping) {
    if (manualMapping.date !== undefined) mapping.date = resolveIndex(manualMapping.date);
    if (manualMapping.amount !== undefined) mapping.amount = resolveIndex(manualMapping.amount);
    if (manualMapping.category !== undefined) mapping.category = resolveIndex(manualMapping.category);
    if (manualMapping.counterparty !== undefined) mapping.counterparty = resolveIndex(manualMapping.counterparty);
    if (manualMapping.documentNumber !== undefined) mapping.documentNumber = resolveIndex(manualMapping.documentNumber);
    if (manualMapping.description !== undefined) mapping.description = resolveIndex(manualMapping.description);
  }

  // Паттерны ключевых слов
  const patterns: Record<keyof DetectedColumnMapping, RegExp> = {
    category: /(статья|статья расходов|категория|санат|бап|бабы|раздел|тақырып|шығыс бабы)/i,
    date: /(дата|күні|date|время|день|период|шығыс күні)/i,
    amount: /(сумма|сомасы|сома|amount|стоимость|итого|к оплате|\bрасход(ы)?\b|\bшығыс\b)/i,
    counterparty: /(контрагент|поставщик|получатель|мердігер|жеткізуші|counterparty|кому|организация|фирма)/i,
    documentNumber: /(номер|документ|құжат|чек|акт|накладная|счет|doc|№|құжат нөмірі)/i,
    description: /(описание|сипаттамасы|мазмұны|description|комментарий|примечание|детали|содержание|наименование)/i,
  };

  const detectionOrder: (keyof DetectedColumnMapping)[] = [
    'category',
    'date',
    'amount',
    'counterparty',
    'documentNumber',
    'description',
  ];

  const assigned = new Set<number>();
  detectionOrder.forEach((key) => {
    if (mapping[key] !== -1) {
      assigned.add(mapping[key]);
    }
  });

  // Автопоиск для еще не назначенных колонок в порядке приоритета
  detectionOrder.forEach((key) => {
    if (mapping[key] === -1) {
      const regex = patterns[key];
      for (let i = 0; i < normHeaders.length; i++) {
        if (assigned.has(i)) continue;

        // Защита от ложного срабатывания "Статья расходов" как amount
        if (
          key === 'amount' &&
          (normHeaders[i].includes('статья') ||
            normHeaders[i].includes('категория') ||
            normHeaders[i].includes('санат') ||
            normHeaders[i].includes('бап'))
        ) {
          continue;
        }

        if (regex.test(normHeaders[i])) {
          mapping[key] = i;
          assigned.add(i);
          break;
        }
      }
    }
  });

  return mapping;
}

export interface ExtractedFileRow {
  rowIndex: number;
  values: any[];
}

/**
 * Чтение книги Excel или CSV из Buffer
 */
export async function readWorkbookFromBuffer(
  buffer: Buffer,
  fileName: string,
): Promise<{ headers: string[]; rows: ExtractedFileRow[] }> {
  const workbook = new ExcelJS.Workbook();
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith('.csv')) {
    // Определение разделителя CSV (; или ,) и BOM
    let text = buffer.toString('utf8');
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }
    const firstLine = text.split(/\r?\n/)[0] || '';
    const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';

    const stream = Readable.from(text);
    await workbook.csv.read(stream, {
      parserOptions: {
        delimiter,
      },
    });
  } else {
    await workbook.xlsx.load(buffer as any);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Файл не содержит листов с данными');
  }

  const headers: string[] = [];
  const rows: ExtractedFileRow[] = [];

  let headerRowIndex = 1;
  const firstRow = worksheet.getRow(1);
  firstRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = cellToString(cell.value);
  });

  // Если первая строка пустая, ищем первую непустую строку как заголовок
  if (headers.filter(Boolean).length === 0) {
    for (let r = 2; r <= Math.min(worksheet.rowCount, 10); r++) {
      const candidateRow = worksheet.getRow(r);
      const candidateHeaders: string[] = [];
      candidateRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        candidateHeaders[colNumber - 1] = cellToString(cell.value);
      });
      if (candidateHeaders.filter(Boolean).length > 0) {
        headerRowIndex = r;
        candidateHeaders.forEach((h, i) => (headers[i] = h));
        break;
      }
    }
  }

  const totalCols = Math.max(headers.length, worksheet.columnCount || 0);

  for (let r = headerRowIndex + 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    // Проверка, что строка не пустая
    let hasContent = false;
    const values: any[] = [];

    for (let c = 1; c <= totalCols; c++) {
      const cell = row.getCell(c);
      values.push(cell.value);
      if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
        hasContent = true;
      }
    }

    if (hasContent) {
      rows.push({
        rowIndex: r - headerRowIndex - 1, // 0-based index среди строк данных
        values,
      });
    }
  }

  return { headers, rows };
}

/**
 * Создание образцового шаблона expenses.xlsx с примером и справочником категорий
 */
export async function createExpensesTemplateBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Shanyraq Platform';
  workbook.created = new Date();

  // Лист 1: Расходы
  const sheetExpenses = workbook.addWorksheet('Расходы', {
    views: [{ showGridLines: true }],
  });

  sheetExpenses.columns = [
    { header: 'Дата', key: 'date', width: 14 },
    { header: 'Сумма', key: 'amount', width: 16 },
    { header: 'Статья расходов', key: 'category', width: 26 },
    { header: 'Контрагент', key: 'counterparty', width: 28 },
    { header: 'Номер документа', key: 'docNumber', width: 18 },
    { header: 'Описание', key: 'description', width: 40 },
  ];

  // Стилизация заголовка
  const headerRow = sheetExpenses.getRow(1);
  headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0284C7' }, // Sky-600
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 26;

  // Пример строк данных (кириллица, реалистичные данные ЖК)
  const sampleData = [
    {
      date: '01.03.2026',
      amount: 150000,
      category: 'Текущий ремонт',
      counterparty: 'ТОО «СтройСервис Астана»',
      docNumber: 'АВР-104',
      description: 'Замена светильников и аварийного освещения в блоках А и Б',
    },
    {
      date: '05.03.2026',
      amount: 85400.5,
      category: 'Обслуживание лифтов',
      counterparty: 'ТОО «Астана Лифт Монтаж»',
      docNumber: 'ЭСФ-2026-089',
      description: 'Плановое ТО пассажирских лифтов за март',
    },
    {
      date: '10.03.2026',
      amount: 45000,
      category: 'Уборка и клининг',
      counterparty: 'ИП «Чистый Дом»',
      docNumber: 'Чек № 12',
      description: 'Закупка моющих средств и инвентаря для уборки подъездов',
    },
    {
      date: '15.03.2026',
      amount: 210000,
      category: 'Коммунальные услуги',
      counterparty: 'АО «Астана-РЭК»',
      docNumber: 'Счет 55412',
      description: 'Оплата общедомового электропотребления за февраль',
    },
  ];

  sampleData.forEach((item) => {
    const row = sheetExpenses.addRow(item);
    row.getCell('amount').numFmt = '#,##0.00';
    row.alignment = { vertical: 'middle' };
  });

  // Лист 2: Справочник категорий
  const sheetCategories = workbook.addWorksheet('Справочник категорий', {
    views: [{ showGridLines: true }],
  });

  sheetCategories.columns = [
    { header: 'Рекомендуемые статьи расходов', key: 'category', width: 34 },
    { header: 'Описание назначения', key: 'desc', width: 50 },
  ];

  const catHeaderRow = sheetCategories.getRow(1);
  catHeaderRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  catHeaderRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF334155' }, // Slate-700
  };
  catHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' };
  catHeaderRow.height = 26;

  const categories = [
    {
      category: 'Эксплуатационные расходы',
      desc: 'Содержание и обслуживание общего имущества ЖК',
    },
    {
      category: 'Текущий ремонт',
      desc: 'Косметический и аварийный ремонт подъездов, кровли, инженерии',
    },
    {
      category: 'Зарплата персонала',
      desc: 'Фонд оплаты труда штатных сотрудников ОСИ (дворники, сантехники)',
    },
    {
      category: 'Коммунальные услуги',
      desc: 'Оплата общедомовых нужд (ОДН электроэнергия, тепло, вода)',
    },
    {
      category: 'Уборка и клининг',
      desc: 'Услуги клининговой службы, бытовая химия и расходники',
    },
    {
      category: 'Обслуживание лифтов',
      desc: 'Ежемесячное сервисное ТО и диспетчеризация лифтового оборудования',
    },
    {
      category: 'Домофон и СКУД',
      desc: 'Техобслуживание домофонных систем, шлагбаумов и камер',
    },
    {
      category: 'Вывоз мусора',
      desc: 'Оплата услуг вывоза ТБО и крупногабаритного мусора',
    },
    {
      category: 'Охрана',
      desc: 'Физическая охрана территории ЖК и консьерж-служба',
    },
    {
      category: 'Юридические и банковские услуги',
      desc: 'Банковские комиссии за ведение счета, юридическое сопровождение',
    },
    {
      category: 'Прочие расходы',
      desc: 'Хозяйственные и непредвиденные операционные траты',
    },
  ];

  categories.forEach((c) => {
    sheetCategories.addRow(c);
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export interface DetectedBudgetColumns {
  category: number;
  months: Map<number, number>;
}

const MONTH_PATTERNS: Array<{ month: number; regex: RegExp }> = [
  { month: 1, regex: /(январ|янв|қаңтар|қаң|january|\bjan\b|\bm0?1\b|^0?1$)/i },
  { month: 2, regex: /(феврал|фев|ақпан|ақп|february|\bfeb\b|\bm0?2\b|^0?2$)/i },
  { month: 3, regex: /(март|мар|наурыз|нау|march|\bmar\b|\bm0?3\b|^0?3$)/i },
  { month: 4, regex: /(апрел|апр|сәуір|сәу|april|\bapr\b|\bm0?4\b|^0?4$)/i },
  { month: 5, regex: /(май|мамыр|мам|may|\bm0?5\b|^0?5$)/i },
  { month: 6, regex: /(июн|маусым|маус|june|\bjun\b|\bm0?6\b|^0?6$)/i },
  { month: 7, regex: /(июл|шілде|шіл|july|\bjul\b|\bm0?7\b|^0?7$)/i },
  { month: 8, regex: /(август|авг|тамыз|там|august|\baug\b|\bm0?8\b|^0?8$)/i },
  { month: 9, regex: /(сентябр|сен|қыркүйек|қыр|september|\bsep\b|\bm0?9\b|^0?9$)/i },
  { month: 10, regex: /(октябр|окт|қазан|қаз|october|\boct\b|\bm10\b|^10$)/i },
  { month: 11, regex: /(ноябр|ноя|қараша|қар|november|\bnov\b|\bm11\b|^11$)/i },
  { month: 12, regex: /(декабр|дек|желтоқсан|жел|december|\bdec\b|\bm12\b|^12$)/i },
];

export function detectBudgetColumns(headers: string[]): DetectedBudgetColumns {
  let categoryCol = -1;
  const months = new Map<number, number>();

  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] || '').trim().toLowerCase();
    if (/(категория|статья|бап|category|item)/i.test(h)) {
      categoryCol = i;
      break;
    }
  }

  for (let i = 0; i < headers.length; i++) {
    if (i === categoryCol) continue;
    const h = (headers[i] || '').trim();
    if (/(итого|всего|total|жарты|қорытынды)/i.test(h)) continue;

    for (const p of MONTH_PATTERNS) {
      if (!months.has(p.month) && p.regex.test(h)) {
        months.set(p.month, i);
        break;
      }
    }
  }

  if (categoryCol === -1) {
    const usedCols = new Set<number>(months.values());
    for (let i = 0; i < headers.length; i++) {
      if (!usedCols.has(i)) {
        categoryCol = i;
        break;
      }
    }
    if (categoryCol === -1) categoryCol = 0;
  }

  return { category: categoryCol, months };
}

export async function createBudgetTemplateBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Shanyraq Platform';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Бюджет', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
  });

  const monthNames = [
    'Январь',
    'Февраль',
    'Март',
    'Апрель',
    'Май',
    'Июнь',
    'Июль',
    'Август',
    'Сентябрь',
    'Октябрь',
    'Ноябрь',
    'Декабрь',
  ];

  const columns: Partial<ExcelJS.Column>[] = [
    { header: 'Категория', key: 'category', width: 32 },
  ];
  for (let i = 0; i < 12; i++) {
    columns.push({
      header: monthNames[i],
      key: `m${i + 1}`,
      width: 15,
      style: { numFmt: '#,##0.00' },
    });
  }
  columns.push({
    header: 'Итого за год',
    key: 'yearTotal',
    width: 18,
    style: { numFmt: '#,##0.00' },
  });
  sheet.columns = columns;

  const headerRow = sheet.getRow(1);
  headerRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 26;

  const sampleRows = [
    { cat: 'Эксплуатационные расходы', base: 350000 },
    { cat: 'Текущий ремонт', base: 200000 },
    { cat: 'Зарплата персонала', base: 850000 },
    { cat: 'Коммунальные услуги', base: 420000 },
    { cat: 'Уборка и клининг', base: 180000 },
    { cat: 'Обслуживание лифтов', base: 140000 },
    { cat: 'Домофон и СКУД', base: 65000 },
    { cat: 'Вывоз мусора', base: 95000 },
    { cat: 'Охрана', base: 300000 },
    { cat: 'Юридические и банковские услуги', base: 45000 },
    { cat: 'Прочие расходы', base: 50000 },
  ];

  sampleRows.forEach((sr, idx) => {
    const rowNum = idx + 2;
    const rowData: Record<string, any> = {
      category: sr.cat,
    };
    for (let m = 1; m <= 12; m++) {
      const factor = sr.cat === 'Коммунальные услуги' && (m <= 3 || m >= 10) ? 1.4 : 1.0;
      rowData[`m${m}`] = Math.round(sr.base * factor);
    }
    rowData['yearTotal'] = { formula: `SUM(B${rowNum}:M${rowNum})` };

    const r = sheet.addRow(rowData);
    r.height = 20;
    r.alignment = { vertical: 'middle' };
  });

  const sheetHelp = workbook.addWorksheet('Инструкция', {
    views: [{ showGridLines: true }],
  });
  sheetHelp.columns = [
    { header: 'Правило заполнения', key: 'rule', width: 30 },
    { header: 'Описание', key: 'desc', width: 60 },
  ];
  const hHelp = sheetHelp.getRow(1);
  hHelp.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  hHelp.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
  hHelp.alignment = { vertical: 'middle', horizontal: 'center' };
  hHelp.height = 24;

  const helpItems = [
    { rule: 'Формат таблицы', desc: 'Категории расположены построчно, месяцы — по колонкам (1–12)' },
    { rule: 'Заголовки месяцев', desc: 'Поддерживаются названия на русском, казахском, английском или цифры 1–12' },
    { rule: 'Суммы', desc: 'Числа в тенге (например 150000, 150 000.50 или 150 000,50)' },
    { rule: 'Пустые ячейки', desc: 'Пустая ячейка считается как 0 тенге планового расхода' },
    { rule: 'Повторная загрузка', desc: 'При повторном импорте обновляются существующие строки без дублирования' },
  ];
  helpItems.forEach((h) => sheetHelp.addRow(h));

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
