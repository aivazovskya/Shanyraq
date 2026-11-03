const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/utils/hold-confirmation.ts');
const compiled = new Module(filename, module);
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { createHoldConfirmation } = compiled.exports;
const flush = () => new Promise(setImmediate);
function fixture(onConfirm = () => {}) {
  let now = 0, nextId = 0, enabled = true, calls = 0, failures = 0;
  const tasks = new Map();
  const control = createHoldConfirmation({
    duration: 1200, canConfirm: () => enabled,
    onConfirm: () => { calls++; return onConfirm(); },
    onHolding: () => {}, onError: () => { failures++; },
    timer: {
      schedule: (callback, delay) => { const id = ++nextId; tasks.set(id, { callback, at: now + delay }); return id; },
      cancel: (id) => tasks.delete(id),
    },
  });
  return { control, disable: () => { enabled = false; }, calls: () => calls, failures: () => failures,
    advance: (duration) => { now += duration; for (const [id, task] of [...tasks]) if (task.at <= now) { tasks.delete(id); task.callback(); } } };
}
test('releasing before the hold threshold never confirms', () => {
  const f = fixture(); f.control.start(); f.advance(1199); f.control.cancel(); f.advance(10000);
  assert.equal(f.calls(), 0);
});
test('one complete hold confirms exactly once despite repeated start events', async () => {
  const f = fixture(); f.control.start(); f.control.start(); f.advance(1200); f.advance(10000); await flush();
  assert.equal(f.calls(), 1);
});
test('disposing the screen cancels an unfinished hold', () => {
  const f = fixture(); f.control.start(); f.advance(700); f.control.dispose(); f.advance(10000); f.control.start();
  assert.equal(f.calls(), 0);
});
test('disabled controls cannot begin or complete confirmation', () => {
  const f = fixture(); f.control.start(); f.disable(); f.advance(1200); f.control.start(); f.advance(1200);
  assert.equal(f.calls(), 0);
});
test('an in-flight request blocks a second hold until it finishes', async () => {
  let finish;
  const f = fixture(() => new Promise((resolve) => { finish = resolve; }));
  f.control.start(); f.advance(1200); f.control.start(); f.advance(1200);
  assert.equal(f.calls(), 1);
  finish(); await flush();
  f.control.start(); f.advance(1200);
  assert.equal(f.calls(), 2);
  finish(); await flush();
});
test('synchronous and asynchronous failures produce feedback without unhandled rejection', async () => {
  for (const callback of [() => { throw Error('failed'); }, async () => { throw Error('failed'); }]) {
    const f = fixture(callback); f.control.start(); f.advance(1200); await flush();
    assert.equal(f.calls(), 1); assert.equal(f.failures(), 1);
  }
});
test('a failure after screen disposal does not update the closed screen', async () => {
  let fail;
  const f = fixture(() => new Promise((_, reject) => { fail = reject; }));
  f.control.start(); f.advance(1200); f.control.dispose(); fail(Error('failed')); await flush();
  assert.equal(f.failures(), 0);
});
