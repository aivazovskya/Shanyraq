const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Compile the TypeScript parser module using the project's TypeScript compiler
const filename = path.resolve(__dirname, '../src/lib/budget-parser.ts');
const compiled = new Module(filename, module);
compiled._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText,
  filename,
);

const {
  parseBudgetResponse,
  isFutureMonth,
  isFutureQuarter,
  formatDeltaPercentDisplay,
  resolvePeriodMonth,
} = compiled.exports;

test('GET budget API contract: correctly parses object { tenantId, year, lines }', () => {
  const realApiPayload = {
    tenantId: 'tenant-demo-1',
    year: 2026,
    lines: [
      {
        id: 'bl-1',
        tenantId: 'tenant-demo-1',
        year: 2026,
        month: 1,
        category: 'Тест-UI Ремонт',
        plannedAmount: 125000,
        note: 'Закуп материалов',
        importBatchId: null,
        createdById: 'admin-1',
        createdAt: '2026-10-22T10:00:00.000Z',
        updatedAt: '2026-10-22T10:00:00.000Z',
      },
      {
        id: 'bl-2',
        tenantId: 'tenant-demo-1',
        year: 2026,
        month: 2,
        category: 'Тест-UI Ремонт',
        plannedAmount: 130000,
        note: null,
        importBatchId: null,
        createdById: 'admin-1',
        createdAt: '2026-10-22T10:00:00.000Z',
        updatedAt: '2026-10-22T10:00:00.000Z',
      },
      {
        id: 'bl-3',
        tenantId: 'tenant-demo-1',
        year: 2026,
        month: 1,
        category: 'Охрана и СКУД',
        plannedAmount: 90000,
        note: null,
        importBatchId: null,
        createdById: 'admin-1',
        createdAt: '2026-10-22T10:00:00.000Z',
        updatedAt: '2026-10-22T10:00:00.000Z',
      },
    ],
  };

  const parsed = parseBudgetResponse(realApiPayload);

  // Must not throw "data is not iterable"
  assert.equal(parsed.lines.length, 3);
  assert.deepEqual(parsed.categories, ['Охрана и СКУД', 'Тест-UI Ремонт']);
  assert.equal(parsed.cellValues['Тест-UI Ремонт__1'], 125000);
  assert.equal(parsed.cellValues['Тест-UI Ремонт__2'], 130000);
  assert.equal(parsed.cellValues['Охрана и СКУД__1'], 90000);
  assert.equal(parsed.cellValues['Охрана и СКУД__2'], undefined);
});

test('GET budget API contract: falls back to raw array without error', () => {
  const rawArrayPayload = [
    {
      id: 'bl-1',
      tenantId: 'tenant-demo-1',
      year: 2026,
      month: 5,
      category: 'Клининг',
      plannedAmount: 45000,
    },
  ];

  const parsed = parseBudgetResponse(rawArrayPayload);
  assert.equal(parsed.lines.length, 1);
  assert.deepEqual(parsed.categories, ['Клининг']);
  assert.equal(parsed.cellValues['Клининг__5'], 45000);
});

test('GET budget API contract: handles null, undefined, and empty objects safely', () => {
  assert.deepEqual(parseBudgetResponse(null), { lines: [], categories: [], cellValues: {} });
  assert.deepEqual(parseBudgetResponse(undefined), { lines: [], categories: [], cellValues: {} });
  assert.deepEqual(parseBudgetResponse({}), { lines: [], categories: [], cellValues: {} });
  assert.deepEqual(parseBudgetResponse({ lines: null }), { lines: [], categories: [], cellValues: {} });
});

test('GET budget-vs-actual contract: resolvePeriodMonth extracts month from month or periodLabel', () => {
  assert.equal(resolvePeriodMonth({ month: 4, period: '4 мес.' }), 4);
  assert.equal(resolvePeriodMonth({ period: '4 мес.' }), 4);
  assert.equal(resolvePeriodMonth({ period: '12 мес.' }), 12);
  assert.equal(resolvePeriodMonth({ period: 'Q1' }), null);
  assert.equal(resolvePeriodMonth({}), null);
});

test('UX future month & zero actual formatting: returns "—" instead of "-100%"', () => {
  const refDate = new Date('2026-10-22T12:00:00Z'); // October 2026

  // Past / current month with actual spending
  assert.equal(isFutureMonth(2026, 1, refDate), false);
  assert.equal(isFutureMonth(2026, 10, refDate), false);
  assert.equal(formatDeltaPercentDisplay(20, 150000, false), '+20%');

  // Past month with 0 actual (e.g. planned but not spent)
  assert.equal(formatDeltaPercentDisplay(-100, 0, false, false), '-100%');

  // Future month (November, December 2026) with 0 actual
  assert.equal(isFutureMonth(2026, 11, refDate), true);
  assert.equal(isFutureMonth(2026, 12, refDate), true);
  assert.equal(formatDeltaPercentDisplay(-100, 0, true, false), '—');

  // Any month where category has no actual spending at all (hasNoActual = true)
  assert.equal(formatDeltaPercentDisplay(-100, 0, false, true), '—');

  // Quarters
  assert.equal(isFutureQuarter(2026, 1, refDate), false); // Q1 is past
  assert.equal(isFutureQuarter(2026, 4, refDate), false); // Q4 is current
  assert.equal(isFutureQuarter(2027, 1, refDate), true);  // 2027 Q1 is future
});
