import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('DashboardScreen: no hardcoded numeric balance literals and uses dynamic API', () => {
  const filePath = path.join(__dirname, '..', 'src', 'screens', 'dashboard', 'DashboardScreen.tsx');
  const content = fs.readFileSync(filePath, 'utf8');

  // Must not have hardcoded balance number 12450 or "12 450 ₸"
  assert.doesNotMatch(content, /12450/, 'DashboardScreen must not contain 12450');
  assert.doesNotMatch(content, /12\s*450\s*₸/, 'DashboardScreen must not contain "12 450 ₸"');

  // Must import financeApi
  assert.match(content, /import\s*\{\s*financeApi/, 'DashboardScreen must import financeApi');

  // Must call financeApi.getMyAccounts()
  assert.match(content, /financeApi\.getMyAccounts\(\)/, 'DashboardScreen must call financeApi.getMyAccounts()');

  // Must bind CountUp dynamically
  assert.match(content, /<CountUp[\s\S]*?value=\{totalBalance\}/, 'CountUp must use dynamic totalBalance');

  // Must have Skeleton and fallback dash
  assert.match(content, /<Skeleton[\s\S]*?width=\{140\}/, 'Must show Skeleton when loading balance');
  assert.match(content, />—<\/Text>/, 'Must show "—" when balance is unavailable or on error');
});
