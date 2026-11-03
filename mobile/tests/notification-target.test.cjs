const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/navigation/notification-target.ts');
const compiled = new Module(filename, module);
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { getNotificationTarget: target } = compiled.exports;
const resident = { staff: false, chat: true, requests: true };
const dispatcher = { staff: true, chat: true, requests: true };
const security = { staff: true, chat: false, requests: false };

test('staff SOS opens the staff tab rather than an unmounted resident screen', () => {
  assert.deepEqual(target({ type: 'SOS_ALERT' }, dispatcher), { name: 'StaffMain', params: { screen: 'SosTab' } });
  assert.equal(target({ alertId: 'alert-1' }, resident).name, 'SosHistory');
});
test('staff chat uses its thread or inbox; security has no chat destination', () => {
  assert.deepEqual(target({ conversationId: 'chat-1' }, dispatcher), { name: 'StaffChatThread', params: { conversationId: 'chat-1', residentName: undefined, unitInfo: undefined } });
  assert.deepEqual(target({ type: 'CHAT_MESSAGE' }, dispatcher), { name: 'StaffMain', params: { screen: 'ChatInboxTab' } });
  assert.equal(target({ conversationId: 'chat-1' }, security), null);
});
test('missing request identifiers open the list instead of invalid detail params', () => {
  assert.deepEqual(target({ type: 'SERVICE_REQUEST', requestId: ' ' }, resident), { name: 'Main', params: { screen: 'RequestsTab' } });
  assert.deepEqual(target({ requestId: 'request-1' }, dispatcher), { name: 'RequestDetail', params: { requestId: 'request-1' } });
  assert.equal(target({ requestId: 'request-1' }, security), null);
});
test('resident-only destinations are never emitted for staff', () => {
  for (const type of ['VOTING', 'ANNOUNCEMENT', 'BOOKING', 'PAYMENT']) assert.equal(target({ type }, dispatcher), null);
});
test('voting without a meeting identifier opens the voting list', () => {
  assert.deepEqual(target({ type: 'VOTING' }, resident), { name: 'Main', params: { screen: 'VotingsTab' } });
  assert.deepEqual(target({ meetingId: 'meeting-1' }, resident), { name: 'VotingDetails', params: { meetingId: 'meeting-1' } });
});
test('absent, unknown and malformed notification data are harmless', () => {
  for (const data of [null, undefined, {}, { type: 42 }, { type: 'UNKNOWN', requestId: {} }]) assert.equal(target(data, resident), null);
});
