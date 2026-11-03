const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/api/client.ts');
const compiled = new Module(filename, module);
compiled.require = name => {
  if (name === 'axios') return { create: () => ({ interceptors: { request: { use() {} }, response: { use() {} } } }) };
  if (name === '../constants/config') return { Config: {} };
  if (name === '../storage/token-storage') return { TokenStorage: {} };
  if (name === '../i18n') return { exists: key => key === 'errors.KNOWN', t: key => key };
  throw new Error(`Unexpected dependency: ${name}`);
};
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename);
const { getApiErrorMessage: message } = compiled.exports;

test('offline and timeout failures have distinct actionable messages', () => {
  assert.equal(message({ code: 'ERR_NETWORK', message: 'Network Error' }), 'common.networkUnavailable');
  for (const code of ['ECONNABORTED', 'ETIMEDOUT']) assert.equal(message({ code }), 'common.requestTimedOut');
});
test('HTTP responses retain localized server codes and validation details', () => {
  assert.equal(message({ code: 'ERR_NETWORK', response: { data: { code: 'KNOWN', message: 'raw' } } }), 'errors.KNOWN');
  assert.equal(message({ response: { data: { message: ['First', 'Second'] } } }), 'First, Second');
  assert.equal(message({ code: 'ECONNABORTED', response: { data: { message: 'Access denied' } } }), 'Access denied');
});
test('local errors retain their message and unknown failures use a localized fallback', () => {
  assert.equal(message(new Error('Local failure')), 'Local failure');
  assert.equal(message(null), 'common.unexpectedError');
});
