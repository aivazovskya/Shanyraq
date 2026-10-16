const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/lib/request-workflow.ts');
const compiled = new Module(filename, module);
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { getRequestActions } = compiled.exports;

test('new and assigned work cannot be closed before completion', () => {
  for (const status of ['PENDING', 'ASSIGNED']) {
    assert.ok(getRequestActions(status).includes('IN_PROGRESS'));
    assert.ok(!getRequestActions(status).includes('CLOSED'));
    assert.ok(!getRequestActions(status).includes('RESOLVED'));
  }
});
test('work can be completed, then closed or returned for more work', () => {
  assert.ok(getRequestActions('IN_PROGRESS').includes('RESOLVED'));
  assert.ok(getRequestActions('RESOLVED').includes('CLOSED'));
  assert.ok(getRequestActions('RESOLVED').includes('IN_PROGRESS'));
});
test('terminal requests offer reopening instead of direct completion', () => {
  for (const status of ['CLOSED', 'REJECTED']) assert.deepEqual(getRequestActions(status), ['PENDING']);
});
