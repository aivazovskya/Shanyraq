const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/utils/phone-input.ts');
const compiled = new Module(filename, module);
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { normalizePhoneInput: normalize, isCompletePhone: complete } = compiled.exports;

test('international, trunk and ten-digit pasted numbers identify the same phone', () => {
  for (const input of ['+7 (701) 234-56-78', '8 (701) 234-56-78', '77012345678', '7012345678']) {
    assert.equal(normalize(input), '+77012345678', input);
  }
});
test('clearing the field retains its country prefix and incomplete numbers stay incomplete', () => {
  assert.equal(normalize(''), '+7');
  assert.equal(normalize('+7'), '+7');
  assert.equal(complete(normalize('+7 701')), false);
});
test('embedded plus signs cannot pass validation by matching the field length', () => {
  assert.equal(complete('+7++++++++++'), false);
  assert.equal(complete(normalize('+7++++++++++')), false);
  assert.equal(normalize('+7 701+234+56+78'), '+77012345678');
});
test('the field keeps at most ten national digits without truncating the country prefix', () => {
  assert.equal(normalize('+7 7012345678999'), '+77012345678');
  assert.equal(complete('+77012345678'), true);
});
