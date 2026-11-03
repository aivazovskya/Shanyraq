const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/utils/booking-time.ts');
const compiled = new Module(filename, module);
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { parseBookingTime, getBookingRange } = compiled.exports;
const day = new Date(2030, 0, 15, 12, 34, 56, 123);
const now = new Date(2030, 0, 15, 8).getTime();

test('clock values accept day boundaries without normalizing invalid hours or minutes', () => {
  assert.equal(parseBookingTime('00:00'), 0);
  assert.equal(parseBookingTime('23:59'), 1439);
  for (const value of ['24:00', '25:99', '10:60', '12:', '9:30', ' 10:00', '10:00 ', '-1:00', 'hello']) {
    assert.equal(parseBookingTime(value), null, value);
  }
});
test('booking range uses the selected local calendar day without mutating it', () => {
  const before = day.getTime();
  const range = getBookingRange(day, '10:15', '11:45', now);
  assert.equal(range.error, undefined);
  assert.equal(range.start.getDate(), 15);
  assert.equal(range.start.getHours(), 10);
  assert.equal(range.start.getMinutes(), 15);
  assert.equal(range.start.getSeconds(), 0);
  assert.equal(range.end.getTime() - range.start.getTime(), 90 * 60000);
  assert.equal(day.getTime(), before);
});
test('equal and reversed time ranges are rejected', () => {
  for (const end of ['10:00', '09:59']) assert.equal(getBookingRange(day, '10:00', end, now).error, 'timeOrder');
});
test('start at the current instant or in the past is rejected', () => {
  assert.equal(getBookingRange(day, '08:00', '10:00', now).error, 'timePast');
  assert.equal(getBookingRange(day, '07:59', '10:00', now).error, 'timePast');
});
test('tomorrow can use an earlier clock time than today', () => {
  const tomorrow = new Date(2030, 0, 16);
  assert.equal(getBookingRange(tomorrow, '01:00', '02:00', now).error, undefined);
});
test('an invalid date or malformed time never becomes a booking', () => {
  assert.equal(getBookingRange(new Date(NaN), '10:00', '11:00', now).error, 'invalidTime');
  assert.equal(getBookingRange(day, '25:00', '26:00', now).error, 'invalidTime');
});
