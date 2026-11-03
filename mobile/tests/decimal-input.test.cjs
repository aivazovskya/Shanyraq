const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/utils/decimal-input.ts');
const compiled = new Module(filename, module);
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { parseDecimalInput: parse } = compiled.exports;
test('decimal comma and decimal point preserve the same meter reading', () => {
  assert.equal(parse('124,5'), 124.5);
  assert.equal(parse('124.5'), 124.5);
  assert.equal(parse(' 124,50 '), 124.5);
});
test('valid zero and small fractional shares do not become a default 100', () => {
  assert.equal(parse('0'), 0);
  assert.equal(parse('0,01'), 0.01);
  assert.equal(parse('.5'), 0.5);
});
test('invalid suffixes and ambiguous separators are rejected in full', () => {
  for (const value of ['', ' ', '12abc', '1,2,3', '1.2.3', '-1', '1e3', 'Infinity', 'NaN']) assert.equal(parse(value), null, value);
});
test('numeric overflow is rejected', () => assert.equal(parse('9'.repeat(400)), null));
