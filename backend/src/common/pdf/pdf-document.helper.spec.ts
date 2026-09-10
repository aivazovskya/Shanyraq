import * as fs from 'fs';
import * as path from 'path';
import {
  createPdfBuffer,
  resolveFontPath,
  drawHeader,
  drawSectionTitle,
  drawTable,
  drawFooter,
} from './pdf-document.helper';

describe('pdf-document.helper (Кириллица, таблицы и макет документов)', () => {
  it('находит файлы шрифтов DejaVuSans и DejaVuSans-Bold', () => {
    const regular = resolveFontPath('DejaVuSans.ttf');
    const bold = resolveFontPath('DejaVuSans-Bold.ttf');

    expect(fs.existsSync(regular)).toBe(true);
    expect(fs.existsSync(bold)).toBe(true);
  });

  it('создает валидный PDF-буфер с кириллицей и корректным заголовком %PDF-', async () => {
    const buffer = await createPdfBuffer((doc) => {
      const headerY = drawHeader(doc, {
        title: 'ТЕСТОВЫЙ ДОКУМЕНТ',
        subtitle: 'Проверка рендеринга кириллицы',
        meta: [
          { label: 'ЖК', value: '«Шаңырақ»' },
          { label: 'Город', value: 'Алматы' },
        ],
      });

      drawSectionTitle(doc, '1. Таблица данных', headerY);

      drawTable(doc, {
        columns: [
          { header: '№', width: 30, align: 'center' },
          { header: 'Наименование', width: 250, align: 'left' },
          { header: 'Сумма', width: 150, align: 'right' },
        ],
        rows: [
          [1, 'Услуга управления кондоминиумом', '15 000.00 ₸'],
          [2, 'Холодное водоснабжение', '3 450.50 ₸'],
        ],
      });

      drawFooter(doc, 'Тестовая страница');
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.slice(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(2000);
  });

  it('создает и визуально валидирует образец протокола ОСС', async () => {
    const buffer = await createPdfBuffer((doc) => {
      const headerY = drawHeader(doc, {
        title: 'ПРОТОКОЛ ОБЩЕГО СОБРАНИЯ СОБСТВЕННИКОВ',
        subtitle: '№ ОСС-2026/01 от 09.09.2026',
        meta: [
          { label: 'Жилой комплекс', value: '«Шаңырақ Премиум»' },
          { label: 'Адрес', value: 'г. Алматы, пр. Достык, 100' },
          { label: 'Тема собрания', value: 'Годовое общее собрание собственников' },
          { label: 'Период проведения', value: '01.09.2026 — 08.09.2026' },
        ],
      });

      drawSectionTitle(doc, '1. Сведения о кворуме и правомочности собрания', headerY);
      const quorumText =
        'Общая площадь помещений ЖК: 12 500.0 м²\n' +
        'Площадь помещений участников, принявших участие: 9 125.5 м² (73.0%)\n' +
        'Количество принявших участие помещений (квартир/паркингов): 85\n' +
        'ИТОГ КВОРУМА: КВОРУМ ИМЕЕТСЯ. Собрание правомочно принимать решения.';
      doc.font('DejaVuSans').fontSize(9).fillColor('#1E293B').text(quorumText, { lineGap: 3 });

      doc.moveDown(0.8);
      drawSectionTitle(doc, '2. Повестка дня и принятые решения');

      const columns = [
        { header: '№', width: 25, align: 'center' as const },
        { header: 'Вопрос повестки дня', width: 215, align: 'left' as const },
        { header: 'Тип решения', width: 95, align: 'center' as const },
        { header: 'Итоги голосования', width: 100, align: 'left' as const },
        { header: 'Решение', width: 80, align: 'center' as const },
      ];

      const rows = [
        [
          1,
          'Утверждение годового отчета управляющей компании ТОО «Шаңырақ Сервис» за 2025 год.',
          'Простое (>50% голосов)',
          'За: 82.4%\nПротив: 1100 м²\nВоздерж.: 500 м²',
          'ПРИНЯТО',
        ],
        [
          2,
          'Утверждение тарифа на управление объектом кондоминиума на 2027 год в размере 140 ₸/м².',
          'Квалиф. (≥2/3 от ЖК)',
          'За: 68.2%\nПротив: 2100 м²\nВоздерж.: 800 м²',
          'ПРИНЯТО',
        ],
      ];

      drawTable(doc, { columns, rows });

      drawSectionTitle(doc, '3. Заключительные положения и подписи');
      doc.font('DejaVuSans').fontSize(8.5).fillColor('#475569').text(
        'Голоса собственников зафиксированы в электронном виде, верифицированы посредством SMS-OTP ' +
        'и защищены криптографическими сигнатурами HMAC-SHA256 в соответствии с регламентом платформы Shanyraq.',
        { lineGap: 2 },
      );

      doc.moveDown(1.2);
      const signY = doc.y;
      const colW = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2 - 10;
      doc.font('DejaVuSans-Bold').fontSize(9).fillColor('#1E293B').text('Председатель собрания:', doc.page.margins.left, signY);
      doc.font('DejaVuSans').fontSize(9).text('____________________ / Смагулов А. Б.', doc.page.margins.left, signY + 16);

      const rightX = doc.page.margins.left + colW + 20;
      doc.font('DejaVuSans-Bold').fontSize(9).fillColor('#1E293B').text('Секретарь собрания:', rightX, signY);
      doc.font('DejaVuSans').fontSize(9).text('____________________ / Бекетова Д. М.', rightX, signY + 16);

      drawFooter(doc, 'Протокол № ОСС-2026/01 | Документ имеет юридическую силу в системе Shanyraq');
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.slice(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(2000);
  });

  it('создает и визуально валидирует образец выписки по лицевому счету', async () => {
    const buffer = await createPdfBuffer((doc) => {
      const headerY = drawHeader(doc, {
        title: 'ВЫПИСКА ПО ЛИЦЕВОМУ СЧЕТУ',
        subtitle: 'Лицевой счет № ACC-БЛОКА-42-A1B2C3',
        meta: [
          { label: 'Жилой комплекс', value: '«Шаңырақ Премиум»' },
          { label: 'Адрес', value: 'г. Алматы, пр. Достык, 100' },
          { label: 'Помещение', value: 'кв. 42, Блок А (75.5 м²)' },
          { label: 'Собственник(и)', value: 'Касымов Азамат Ерланович' },
          { label: 'Период выписки', value: 'Сентябрь 2026 г.' },
          { label: 'Текущий баланс', value: '-15 000.00 ₸ (Задолженность)' },
        ],
      });

      drawSectionTitle(doc, '1. Начисления за период', headerY);
      const chargeCols = [
        { header: '№', width: 25, align: 'center' as const },
        { header: 'Период', width: 75, align: 'center' as const },
        { header: 'Статья начисления / Тариф', width: 200, align: 'left' as const },
        { header: 'Метод расчета', width: 110, align: 'center' as const },
        { header: 'Сумма', width: 100, align: 'right' as const },
      ];
      const chargeRows = [
        [1, '09.2026', 'Эксплуатационные расходы (содержание жилья)', 'За площадь (м²)', '9 060.00 ₸'],
        [2, '09.2026', 'Видеонаблюдение и охрана периметра', 'Фиксированный', '2 500.00 ₸'],
        [3, '09.2026', 'Обслуживание домофонной системы', 'Фиксированный', '1 200.00 ₸'],
        [4, '09.2026', 'Холодная вода (счетчик)', 'По счетчику', '4 240.00 ₸'],
      ];
      drawTable(doc, { columns: chargeCols, rows: chargeRows });
      doc.font('DejaVuSans-Bold').fontSize(9).fillColor('#1E293B').text('Итого начислено: 17 000.00 ₸', { align: 'right' });

      doc.moveDown(0.8);
      drawSectionTitle(doc, '2. Поступившие оплаты');
      const paymentCols = [
        { header: '№', width: 25, align: 'center' as const },
        { header: 'Дата оплаты', width: 80, align: 'center' as const },
        { header: 'Способ', width: 85, align: 'center' as const },
        { header: 'Зафиксировал сотрудник', width: 200, align: 'left' as const },
        { header: 'Сумма', width: 120, align: 'right' as const },
      ];
      const paymentRows = [
        [1, '05.09.2026', 'Вручную (касса)', 'Иванов Иван (Диспетчер)', '2 000.00 ₸'],
      ];
      drawTable(doc, { columns: paymentCols, rows: paymentRows });
      doc.font('DejaVuSans-Bold').fontSize(9).fillColor('#1E293B').text('Итого оплачено: 2 000.00 ₸', { align: 'right' });

      doc.moveDown(0.8);
      drawSectionTitle(doc, '3. Сводный итог по выписке');
      doc.font('DejaVuSans').fontSize(9).fillColor('#334155').text(
        'Начислено за период: 17 000.00 ₸\n' +
        'Оплачено за период: 2 000.00 ₸\n' +
        'Разница за период: -15 000.00 ₸\n' +
        'Итоговое сальдо (с учетом предыдущих периодов): -15 000.00 ₸ (Имеется задолженность к оплате)',
        { lineGap: 3 },
      );

      drawFooter(doc, 'Лицевой счет: ACC-БЛОКА-42-A1B2C3 | Документ сформирован автоматически в системе Shanyraq');
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.slice(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(2000);
  });
});
