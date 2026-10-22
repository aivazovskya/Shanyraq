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

    it('должен нейтрализовать формульные инъекции Excel для строк, не трогая числа', () => {
      // Строка с =cmd должна быть экранирована префиксом апострофа
      expect(escapeCsvField('=cmd')).toBe("'=cmd");
      expect(escapeCsvField('=HYPERLINK("http://evil.com")')).toBe('"\'=HYPERLINK(""http://evil.com"")"');

      // Строка "-5" как текст должна быть нейтрализована
      expect(escapeCsvField('-5')).toBe("'-5");

      // Число -5 должно остаться числовой строкой без апострофа
      expect(escapeCsvField(-5)).toBe('-5');

      // Другие опасные формульные префиксы (+, @, \t, \r)
      expect(escapeCsvField('+cmd|calc')).toBe("'+cmd|calc");
      expect(escapeCsvField('+1+1')).toBe("'+1+1");
      expect(escapeCsvField('@SUM(1,2)')).toBe('"\'@SUM(1,2)"');
      expect(escapeCsvField('\tВкладка')).toBe("'\tВкладка");
      expect(escapeCsvField('\rВозврат')).toBe('"\'\rВозврат"');
    });

    it('сохраняет телефонные номера формата E.164 и валютные суммы без искажений', () => {
      // Телефонные номера вида +77011112233 не должны получать апостроф
      expect(escapeCsvField('+77011112233')).toBe('+77011112233');
      expect(escapeCsvField('+77022223344')).toBe('+77022223344');

      // Валютные балансы вида -15000 ₸ сохраняются для отчетов выписок
      expect(escapeCsvField('-15000 ₸')).toBe('-15000 ₸');
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
