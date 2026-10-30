const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('dashboard/layout.tsx contains dark variants for root container and header', () => {
  const layoutPath = path.resolve(__dirname, '../src/app/dashboard/layout.tsx');
  const content = fs.readFileSync(layoutPath, 'utf8');

  // Root container check: must include dark:bg-slate-950 and dark:text-slate-100
  assert.ok(
    content.includes('dark:bg-slate-950'),
    'dashboard/layout.tsx root container must include dark:bg-slate-950'
  );
  assert.ok(
    content.includes('dark:text-slate-100'),
    'dashboard/layout.tsx root container must include dark:text-slate-100'
  );

  // Header check: must include dark:border-slate-800 and dark:bg-slate-900/95
  assert.ok(
    content.includes('dark:border-slate-800'),
    'dashboard/layout.tsx header must include dark:border-slate-800'
  );
  assert.ok(
    content.includes('dark:bg-slate-900/95'),
    'dashboard/layout.tsx header must include dark:bg-slate-900/95'
  );
});

test('shared ThemeToggle component is used in both cabinet/layout.tsx and dashboard/layout.tsx', () => {
  const cabinetPath = path.resolve(__dirname, '../src/app/cabinet/layout.tsx');
  const dashboardPath = path.resolve(__dirname, '../src/app/dashboard/layout.tsx');

  const cabinetContent = fs.readFileSync(cabinetPath, 'utf8');
  const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

  // Both layouts must import ThemeToggle
  assert.ok(
    cabinetContent.includes("import { ThemeToggle } from '@/components/ThemeToggle'") ||
    cabinetContent.includes('ThemeToggle'),
    'cabinet/layout.tsx must import and use ThemeToggle'
  );
  assert.ok(
    dashboardContent.includes("import { ThemeToggle } from '@/components/ThemeToggle'") ||
    dashboardContent.includes('ThemeToggle'),
    'dashboard/layout.tsx must import and use ThemeToggle'
  );

  // Both layouts must render <ThemeToggle
  assert.ok(
    /<ThemeToggle\b/.test(cabinetContent),
    'cabinet/layout.tsx must render <ThemeToggle />'
  );
  assert.ok(
    /<ThemeToggle\b/.test(dashboardContent),
    'dashboard/layout.tsx must render <ThemeToggle />'
  );
});

test('lib/theme.ts provides theme retrieval, application, and toggling with multi-key support', () => {
  const themePath = path.resolve(__dirname, '../src/lib/theme.ts');
  const content = fs.readFileSync(themePath, 'utf8');

  assert.ok(
    content.includes('shanyraq_theme'),
    'theme.ts must manage shanyraq_theme key'
  );
  assert.ok(
    content.includes('shanyraq_theme_preference'),
    'theme.ts must synchronize shanyraq_theme_preference key'
  );
  assert.ok(
    content.includes('export function getStoredTheme'),
    'theme.ts must export getStoredTheme'
  );
  assert.ok(
    content.includes('export function applyTheme'),
    'theme.ts must export applyTheme'
  );
  assert.ok(
    content.includes('export function toggleTheme'),
    'theme.ts must export toggleTheme'
  );
});
