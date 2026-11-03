const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function setup(platform, dirty = true, busy = false, saved = false) {
  let callback, enabled, dialog;
  const actions = [], visibility = [];
  const filename = path.resolve(__dirname, '../src/components/common/useFormExitGuard.ts');
  const compiled = new Module(filename, module);
  compiled.require = name => {
    if (name === 'react') return { useRef: value => ({ current: value }), useState: value => [value, next => visibility.push(next)] };
    if (name === 'react-native') return { Platform: { OS: platform }, Alert: { alert: (...args) => { dialog = args; } } };
    if (name === 'react-i18next') return { useTranslation: () => ({ t: key => key }) };
    if (name === '@react-navigation/native') return {
      useNavigation: () => ({ dispatch: action => actions.push(action) }),
      UNSTABLE_usePreventRemove: (condition, handler) => { enabled = condition; callback = handler; },
    };
    throw new Error(name);
  };
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
  const props = compiled.exports.useFormExitGuard(dirty, busy, saved);
  return { actions, visibility, props, enabled, leave: () => callback({ data: { action: { type: 'GO_BACK' } } }), dialog: () => dialog };
}

test('clean and saved forms do not block navigation', () => {
  assert.equal(setup('android', false).enabled, false);
  assert.equal(setup('android', true, false, true).enabled, false);
  assert.equal(setup('android', false, true).enabled, true);
});
test('web cancel retains the form and a subsequent discard can leave', () => {
  const guard = setup('web');
  guard.leave();
  assert.deepEqual(guard.visibility, [true]);
  guard.props.onKeepEditing();
  assert.equal(guard.actions.length, 0);
  guard.leave();
  guard.props.onDiscard();
  assert.deepEqual(guard.actions, [{ type: 'GO_BACK' }]);
  assert.deepEqual(guard.visibility, [true, false, true, false]);
});
test('web duplicate back presses share a dialog and busy forms cannot be discarded', () => {
  const guard = setup('web', true, true);
  guard.leave(); guard.leave();
  assert.deepEqual(guard.visibility, [true]);
  guard.props.onDiscard();
  assert.equal(guard.actions.length, 0);
  guard.props.onKeepEditing();
  guard.leave();
  assert.deepEqual(guard.visibility, [true, false, true]);
});
test('native duplicate back presses share a dialog; cancel allows another attempt', () => {
  const guard = setup('android');
  guard.leave();
  const dialog = guard.dialog();
  guard.leave();
  assert.equal(guard.dialog(), dialog);
  dialog[2][0].onPress();
  guard.leave();
  guard.dialog()[2][1].onPress();
  assert.deepEqual(guard.actions, [{ type: 'GO_BACK' }]);
});
