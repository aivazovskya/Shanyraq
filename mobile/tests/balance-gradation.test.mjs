import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

function loadBalanceModule() {
  const filePath = path.resolve(__dirname, '../src/utils/balance.ts');
  const source = fs.readFileSync(filePath, 'utf8');

  try {
    const ts = require('../../frontend-web/node_modules/typescript');
    const js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const m = { exports: {} };
    new Function('exports', 'module', js)(m.exports, m);
    return m.exports;
  } catch {
    const thresholdMatch = source.match(/BALANCE_THRESHOLD_RATIO\s*=\s*([0-9.]+)/);
    const fnMatch = source.match(/export function getBalanceGradation\([^)]*\)[^{]*\{([\s\S]*?)\}/);
    assert.ok(fnMatch, 'getBalanceGradation function not found in mobile/src/utils/balance.ts');
    const ratio = thresholdMatch ? parseFloat(thresholdMatch[1]) : 0.03;
    const fn = new Function('netBalance', 'totalExpenses', `
      const BALANCE_THRESHOLD_RATIO = ${ratio};
      ${fnMatch[1]}
    `);
    return {
      BALANCE_THRESHOLD_RATIO: ratio,
      getBalanceGradation: fn,
    };
  }
}

const { getBalanceGradation, BALANCE_THRESHOLD_RATIO } = loadBalanceModule();

test('mobile balance-gradation: threshold ratio is exactly 3%', () => {
  assert.equal(BALANCE_THRESHOLD_RATIO, 0.03);
});

test('mobile balance-gradation: surplus greater than 3% returns surplus', () => {
  // 50 000 on 1 000 000 expenses is 5% (> 3%)
  assert.equal(getBalanceGradation(50000, 1000000), 'surplus');
  // 100 000 on 1 200 000 expenses is 8.33% (> 3%)
  assert.equal(getBalanceGradation(100000, 1200000), 'surplus');
});

test('mobile balance-gradation: balance within 3% on positive side returns balanced', () => {
  // Real August 2026 data: +28 725 on 1 226 900 expenses (2.34% <= 3%)
  assert.equal(getBalanceGradation(28725, 1226900), 'balanced');
  // Exactly 3% boundary
  assert.equal(getBalanceGradation(30000, 1000000), 'balanced');
  // Small positive balance
  assert.equal(getBalanceGradation(5000, 1000000), 'balanced');
});

test('mobile balance-gradation: exactly zero balance returns balanced', () => {
  assert.equal(getBalanceGradation(0, 1000000), 'balanced');
});

test('mobile balance-gradation: balance within 3% on negative side returns balanced', () => {
  // Real October 2026 data: -12 190 on 1 304 300 expenses (0.93% <= 3%)
  assert.equal(getBalanceGradation(-12190, 1304300), 'balanced');
  // Exactly -3% boundary
  assert.equal(getBalanceGradation(-30000, 1000000), 'balanced');
  // Small negative balance
  assert.equal(getBalanceGradation(-5000, 1000000), 'balanced');
});

test('mobile balance-gradation: deficit greater than 3% returns deficit', () => {
  // Real September 2026 data: -60 075 on 1 364 700 expenses (4.40% > 3%)
  assert.equal(getBalanceGradation(-60075, 1364700), 'deficit');
  // Large deficit
  assert.equal(getBalanceGradation(-50000, 1000000), 'deficit');
});

test('mobile balance-gradation: handles zero expenses without division by zero', () => {
  // Zero balance, zero expenses -> balanced
  assert.equal(getBalanceGradation(0, 0), 'balanced');
  // Positive balance, zero expenses -> surplus
  assert.equal(getBalanceGradation(5000, 0), 'surplus');
  // Negative balance, zero expenses -> deficit
  assert.equal(getBalanceGradation(-5000, 0), 'deficit');
});

test('mobile balance-gradation: handles null, undefined, or invalid inputs safely', () => {
  assert.equal(getBalanceGradation(null, null), 'balanced');
  assert.equal(getBalanceGradation(undefined, undefined), 'balanced');
  assert.equal(getBalanceGradation(null, 1000000), 'balanced');
  assert.equal(getBalanceGradation(undefined, 1000000), 'balanced');
});
