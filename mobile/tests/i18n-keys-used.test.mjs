// Every literal t('some.key') used in mobile/src must exist in all three locales.
// (i18n-parity only compares the locale files with each other; it cannot see keys that
// are used in code but missing everywhere, which would render as raw "common.search".)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(here, '../src');
const locales = ['ru', 'kk', 'en'].map((lang) => ({
  lang,
  json: JSON.parse(fs.readFileSync(path.join(srcDir, 'i18n/locales', `${lang}.json`), 'utf8').replace(/^﻿/, '')),
}));

const lookup = (obj, key) =>
  key.split('.').reduce((o, part) => (o && typeof o === 'object' ? o[part] : undefined), obj);

const files = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(name)) files.push(full);
  }
})(srcDir);

test('every literal t() key used in code exists in ru, kk and en', () => {
  const used = new Map();
  const re = /\bt\(\s*['"`]([A-Za-z0-9_.]+)['"`]/g;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = re.exec(text))) {
      const set = used.get(match[1]) ?? new Set();
      set.add(path.relative(srcDir, file).replace(/\\/g, '/'));
      used.set(match[1], set);
    }
  }
  const problems = [];
  for (const [key, where] of used) {
    for (const { lang, json } of locales) {
      if (lookup(json, key) === undefined) problems.push(`${lang}: ${key} (used in ${[...where].slice(0, 2).join(', ')})`);
    }
  }
  assert.deepEqual(problems, [], `Missing translation keys:\n${problems.join('\n')}`);
});

test('no hardcoded Cyrillic or Latin text strings in JSX outside t()', () => {
  const tsxFiles = files.filter((f) => f.endsWith('.tsx'));
  const violations = [];

  for (const file of tsxFiles) {
    const rel = path.relative(srcDir, file).replace(/\\/g, '/');
    const text = fs.readFileSync(file, 'utf8');

    // Strip comments
    const clean = text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    const lines = clean.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip imports, type/interface declarations, generic brackets, and arrow functions
      if (/^\s*(import|export\s+(type|interface)|type\s+|interface\s+)/.test(line)) continue;
      if (/React\.FC<|Record<|Array<|Promise<|SegmentedControl</.test(line)) continue;
      if (/=>/.test(line)) continue;

      let match;
      const lineRe = />\s*([А-Яа-яA-Za-z]{3,}[^<{]*)</g;
      while ((match = lineRe.exec(line))) {
        const content = match[1].trim();
        if (content.startsWith('Date.') || content.startsWith('Math.')) continue;
        violations.push(`${rel}:${i + 1} -> "${content}"`);
      }
    }
  }

  assert.deepEqual(violations, [], `Hardcoded strings in JSX:\n${violations.join('\n')}`);
});
