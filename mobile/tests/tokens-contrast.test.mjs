import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tokensPath = path.resolve(here, '../src/theme/tokens.ts');
const tokensSource = fs.readFileSync(tokensPath, 'utf8');

function extractColorMap(varName) {
  const start = tokensSource.indexOf(varName);
  assert.ok(start !== -1, `Could not find ${varName} in tokens.ts`);
  const brace = tokensSource.indexOf('{', start);
  const end = tokensSource.indexOf('};', brace);
  const body = tokensSource.substring(brace + 1, end);
  const obj = {};
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*([a-zA-Z0-9_]+)\s*:\s*['"]([^'"]+)['"]/);
    if (m) obj[m[1]] = m[2];
  }
  return obj;
}

const lightColors = extractColorMap('export const lightColors');
const darkColors = extractColorMap('export const darkColors');

function luminance(r, g, b) {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const num = parseInt(hex, 16);
  return [num >> 16, (num >> 8) & 255, num & 255];
}

function contrast(hex1, hex2) {
  const l1 = luminance(...hexToRgb(hex1));
  const l2 = luminance(...hexToRgb(hex2));
  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (brighter + 0.05) / (darker + 0.05);
}

test('WCAG AA contrast: light theme key color pairs meet AA (>= 4.5:1)', () => {
  const pairs = [
    { name: 'text / background', fg: lightColors.text, bg: lightColors.background },
    { name: 'textMuted / surface', fg: lightColors.textMuted, bg: lightColors.surface },
    { name: 'onPrimary / primary', fg: lightColors.onPrimary, bg: lightColors.primary },
    { name: 'success / successBg (subtle)', fg: lightColors.success, bg: lightColors.successBg },
    { name: 'onSuccess / success (solid)', fg: lightColors.onSuccess, bg: lightColors.success },
    { name: 'warning / warningBg (subtle)', fg: lightColors.warning, bg: lightColors.warningBg },
    { name: 'onWarning / warning (solid)', fg: lightColors.onWarning, bg: lightColors.warning },
    { name: 'danger / dangerBg (subtle)', fg: lightColors.danger, bg: lightColors.dangerBg },
    { name: 'onDanger / danger (solid)', fg: lightColors.onDanger, bg: lightColors.danger },
    { name: 'info / infoBg (subtle)', fg: lightColors.info, bg: lightColors.infoBg },
    { name: 'onInfo / info (solid)', fg: lightColors.onInfo, bg: lightColors.info },
  ];

  const failures = [];
  for (const pair of pairs) {
    assert.ok(pair.fg && pair.bg, `Missing color token in pair ${pair.name}`);
    const ratio = contrast(pair.fg, pair.bg);
    if (ratio < 4.5) {
      failures.push(`${pair.name} (${pair.fg} on ${pair.bg}): ${ratio.toFixed(2)}:1 < 4.5:1`);
    }
  }

  assert.deepEqual(failures, [], `Light theme contrast failures:\n${failures.join('\n')}`);
});

test('WCAG AA contrast: dark theme key color pairs meet AA (>= 4.5:1)', () => {
  const pairs = [
    { name: 'text / background', fg: darkColors.text, bg: darkColors.background },
    { name: 'textMuted / surface', fg: darkColors.textMuted, bg: darkColors.surface },
    { name: 'onPrimary / primary', fg: darkColors.onPrimary, bg: darkColors.primary },
    { name: 'success / successBg (subtle)', fg: darkColors.success, bg: darkColors.successBg },
    { name: 'onSuccess / success (solid)', fg: darkColors.onSuccess, bg: darkColors.success },
    { name: 'warning / warningBg (subtle)', fg: darkColors.warning, bg: darkColors.warningBg },
    { name: 'onWarning / warning (solid)', fg: darkColors.onWarning, bg: darkColors.warning },
    { name: 'danger / dangerBg (subtle)', fg: darkColors.danger, bg: darkColors.dangerBg },
    { name: 'onDanger / danger (solid)', fg: darkColors.onDanger, bg: darkColors.danger },
    { name: 'info / infoBg (subtle)', fg: darkColors.info, bg: darkColors.infoBg },
    { name: 'onInfo / info (solid)', fg: darkColors.onInfo, bg: darkColors.info },
  ];

  const failures = [];
  for (const pair of pairs) {
    assert.ok(pair.fg && pair.bg, `Missing color token in pair ${pair.name}`);
    const ratio = contrast(pair.fg, pair.bg);
    if (ratio < 4.5) {
      failures.push(`${pair.name} (${pair.fg} on ${pair.bg}): ${ratio.toFixed(2)}:1 < 4.5:1`);
    }
  }

  assert.deepEqual(failures, [], `Dark theme contrast failures:\n${failures.join('\n')}`);
});
