import * as ExcelJS from 'exceljs';
import {
  parseCellDate,
  parseCellAmount,
  autoDetectColumns,
  readWorkbookFromBuffer,
  createExpensesTemplateBuffer,
} from './import-parser.helper';

describe('ImportParserHelper', () => {
  describe('parseCellDate', () => {
    it('parses Russian/Kazakh DD.MM.YYYY formats', () => {
      const d1 = parseCellDate('01.03.2026');
      expect(d1).not.toBeNull();
      expect(d1!.getUTCFullYear()).toBe(2026);
      expect(d1!.getUTCMonth()).toBe(2); // March = 2
      expect(d1!.getUTCDate()).toBe(1);

      const d2 = parseCellDate('15/10/2026');
      expect(d2).not.toBeNull();
      expect(d2!.getUTCFullYear()).toBe(2026);
      expect(d2!.getUTCMonth()).toBe(9); // Oct = 9
      expect(d2!.getUTCDate()).toBe(15);
    });

    it('parses ISO date strings', () => {
      const d1 = parseCellDate('2026-03-01');
      expect(d1).not.toBeNull();
      expect(d1!.getUTCFullYear()).toBe(2026);
      expect(d1!.getUTCMonth()).toBe(2);
      expect(d1!.getUTCDate()).toBe(1);

      const d2 = parseCellDate('2026-03-01T14:30:00.000Z');
      expect(d2).not.toBeNull();
      expect(d2!.getUTCFullYear()).toBe(2026);
    });

    it('parses Excel serial date numbers', () => {
      // 46082 in Excel is 2026-03-01
      const d = parseCellDate(46082);
      expect(d).not.toBeNull();
      expect(d!.getUTCFullYear()).toBe(2026);
      expect(d!.getUTCMonth()).toBe(2);
      expect(d!.getUTCDate()).toBe(1);
    });

    it('parses native Date objects and formula result objects', () => {
      const native = new Date('2026-05-12T00:00:00Z');
      expect(parseCellDate(native)).toEqual(native);

      const formulaObj = { result: '12.05.2026' };
      const d = parseCellDate(formulaObj);
      expect(d).not.toBeNull();
      expect(d!.getUTCFullYear()).toBe(2026);
      expect(d!.getUTCMonth()).toBe(4);
      expect(d!.getUTCDate()).toBe(12);
    });

    it('returns null for invalid dates or garbage', () => {
      expect(parseCellDate('')).toBeNull();
      expect(parseCellDate(null)).toBeNull();
      expect(parseCellDate('не дата')).toBeNull();
      expect(parseCellDate('32.13.2026')).toBeNull();
    });
  });

  describe('parseCellAmount', () => {
    it('parses standard numbers', () => {
      expect(parseCellAmount(1234.5)).toEqual({ amount: 1234.5, raw: '1234.5' });
      expect(parseCellAmount(150000)).toEqual({ amount: 150000, raw: '150000' });
    });

    it('parses Cyrillic-formatted currency strings with spaces and comma', () => {
      const res1 = parseCellAmount('1 234,50');
      expect(res1).toEqual({ amount: 1234.5, raw: '1 234,50' });

      const res2 = parseCellAmount(' 150 000,00 ₸ ');
      expect(res2).toEqual({ amount: 150000, raw: ' 150 000,00 ₸ ' });

      const res3 = parseCellAmount('45 800,75 тг');
      expect(res3).toEqual({ amount: 45800.75, raw: '45 800,75 тг' });
    });

    it('parses strings with dots and commas as thousands separator', () => {
      const res1 = parseCellAmount('1,234.50');
      expect(res1).toEqual({ amount: 1234.5, raw: '1,234.50' });

      const res2 = parseCellAmount('1.234,50');
      expect(res2).toEqual({ amount: 1234.5, raw: '1.234,50' });
    });

    it('returns 0 or null for invalid amounts', () => {
      expect(parseCellAmount(null)).toBeNull();
      expect(parseCellAmount('')).toBeNull();
      expect(parseCellAmount('abc')).toEqual({ amount: 0, raw: 'abc' });
      expect(parseCellAmount(-50)).toEqual({ amount: 0, raw: '-50' });
      expect(parseCellAmount(0)).toEqual({ amount: 0, raw: '0' });
    });
  });

  describe('autoDetectColumns', () => {
    it('auto-detects columns from Russian headers', () => {
      const headers = [
        'Дата платежа',
        'Сумма расхода (₸)',
        'Статья расходов',
        'Контрагент',
        'Номер документа',
        'Описание',
      ];
      const detected = autoDetectColumns(headers);
      expect(detected.date).toBe(0);
      expect(detected.amount).toBe(1);
      expect(detected.category).toBe(2);
      expect(detected.counterparty).toBe(3);
      expect(detected.documentNumber).toBe(4);
      expect(detected.description).toBe(5);
    });

    it('auto-detects columns from Kazakh headers', () => {
      const headers = [
        'Шығыс күні',
        'Сомасы',
        'Шығыс бабы',
        'Мердігер',
        'Құжат нөмірі',
        'Сипаттамасы',
      ];
      const detected = autoDetectColumns(headers);
      expect(detected.date).toBe(0);
      expect(detected.amount).toBe(1);
      expect(detected.category).toBe(2);
      expect(detected.counterparty).toBe(3);
      expect(detected.documentNumber).toBe(4);
      expect(detected.description).toBe(5);
    });

    it('auto-detects columns when category header precedes amount header', () => {
      const headers = [
        'Дата',
        'Статья расходов',
        'Сумма (₸)',
        'Контрагент',
        'Номер документа',
        'Описание',
      ];
      const detected = autoDetectColumns(headers);
      expect(detected.date).toBe(0);
      expect(detected.category).toBe(1);
      expect(detected.amount).toBe(2);
      expect(detected.counterparty).toBe(3);
      expect(detected.documentNumber).toBe(4);
      expect(detected.description).toBe(5);
    });

    it('honors manual column mapping over auto-detection', () => {
      const headers = ['Колонка 1', 'Колонка 2', 'Колонка 3'];
      const manual = {
        date: 2,
        amount: 0,
        category: 1,
      };
      const detected = autoDetectColumns(headers, manual);
      expect(detected.date).toBe(2);
      expect(detected.amount).toBe(0);
      expect(detected.category).toBe(1);
    });
  });

  describe('createExpensesTemplateBuffer and readWorkbookFromBuffer', () => {
    it('generates a valid xlsx template that can be re-opened with preserved Cyrillic', async () => {
      const buffer = await createExpensesTemplateBuffer();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(1000);

      // Re-read with ExcelJS to ensure Cyrillic integrity
      const reopened = new ExcelJS.Workbook();
      await reopened.xlsx.load(buffer as any);

      expect(reopened.worksheets.length).toBe(2);
      const sheet1 = reopened.getWorksheet('Расходы');
      expect(sheet1).toBeDefined();

      const headers = sheet1!.getRow(1).values as any[];
      expect(headers).toContain('Дата');
      expect(headers).toContain('Сумма');
      expect(headers).toContain('Статья расходов');
      expect(headers).toContain('Контрагент');
      expect(headers).toContain('Номер документа');
      expect(headers).toContain('Описание');

      // Check sample row with Cyrillic
      const row2 = sheet1!.getRow(2);
      expect(row2.getCell(3).value).toBe('Текущий ремонт');
      expect(row2.getCell(4).value).toBe('ТОО «СтройСервис Астана»');

      // Check sheet 2 categories
      const sheet2 = reopened.getWorksheet('Справочник категорий');
      expect(sheet2).toBeDefined();
      expect(sheet2!.rowCount).toBeGreaterThan(5);

      // Verify readWorkbookFromBuffer reads it cleanly
      const parsed = await readWorkbookFromBuffer(buffer, 'template.xlsx');
      expect(parsed.headers).toContain('Дата');
      expect(parsed.rows.length).toBe(4);
    });

    it('reads CSV buffer with Cyrillic and semicolon delimiter', async () => {
      const csvContent =
        '\uFEFFДата;Сумма;Статья;Контрагент;Номер документа;Описание\r\n' +
        '01.03.2026;150 000,00;Текущий ремонт;ТОО «СтройСервис»;АВР-1;Замена ламп\r\n' +
        '02.03.2026;25000;Клининг;ИП Чистота;Чек 5;Уборка\r\n';

      const csvBuffer = Buffer.from(csvContent, 'utf8');
      const parsed = await readWorkbookFromBuffer(csvBuffer, 'expenses.csv');

      expect(parsed.headers[0]).toBe('Дата');
      expect(parsed.headers[1]).toBe('Сумма');
      expect(parsed.rows.length).toBe(2);
      expect(parsed.rows[0].values[2]).toBe('Текущий ремонт');
    });
  });
});
