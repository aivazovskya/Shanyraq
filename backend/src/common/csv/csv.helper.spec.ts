import { buildCsv, escapeCsvField } from './csv.helper';

describe('CSV Helper', () => {
  describe('escapeCsvField', () => {
    it('должен возвращать пустую строку для null и undefined', () => {
      expect(escapeCsvField(null)).toBe('');
      expect(escapeCsvField(undefined)).toBe('');
    });

    it('должен возвращать простые строки и числа без изменений', () => {
      expect(escapeCsvField('ОСИ Сарыарка')).toBe('ОСИ Сарыарка');
      expect(escapeCsvField(12500)).toBe('12500');
      expect(escapeCsvField(0)).toBe('0');
      expect(escapeCsvField(-350.5)).toBe('-350.5');
    });

    it('должен экранировать строки с запятыми', () => {
      expect(escapeCsvField('Тариф 1, базовый')).toBe('"Тариф 1, базовый"');
    });

    it('должен удваивать двойные кавычки и оборачивать в кавычки', () => {
      expect(escapeCsvField('Тариф "Люкс"')).toBe('"Тариф ""Люкс"""');
    });

    it('должен экранировать строки с переносами строк', () => {
      expect(escapeCsvField("Строка 1\nСтрока 2")).toBe('"Строка 1\nСтрока 2"');
      expect(escapeCsvField("Строка 1\r\nСтрока 2")).toBe('"Строка 1\r\nСтрока 2"');
    });
  });

  describe('buildCsv', () => {
    it('должен начинаться строго с UTF-8 BOM байтов (0xEF, 0xBB, 0xBF)', () => {
      const buffer = buildCsv([['Тест']]);
      expect(buffer[0]).toBe(0xef);
      expect(buffer[1]).toBe(0xbb);
      expect(buffer[2]).toBe(0xbf);
    });

    it('должен корректно формировать структуру с CRLF и экранированием', () => {
      const rows = [
        ['Заголовок', 'Сумма'],
        ['Тариф, базовый', 1000],
        ['Тариф "Премиум"', 2000],
      ];
      const buffer = buildCsv(rows);
      const text = buffer.toString('utf-8');

      // First character is BOM
      expect(text.charCodeAt(0)).toBe(0xfeff);

      const content = text.slice(1);
      const lines = content.split('\r\n');
      expect(lines).toEqual([
        'Заголовок,Сумма',
        '"Тариф, базовый",1000',
        '"Тариф ""Премиум""",2000',
      ]);
    });

    it('должен сохранять кириллицу в исходном виде без искажений', () => {
      const buffer = buildCsv([['Начисления по тарифам', 'Должники']]);
      const text = buffer.toString('utf-8');
      expect(text).toContain('Начисления по тарифам');
      expect(text).toContain('Должники');
    });
  });
});
