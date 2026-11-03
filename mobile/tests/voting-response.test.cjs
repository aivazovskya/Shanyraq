const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/api/voting-response.ts');
const compiled = new Module(filename, module);
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { normalizeMeeting, normalizeVoteReceipt } = compiled.exports;
function fixture() {
  return { id: 'meeting-1', tenantId: 'complex-1', title: 'Meeting', status: 'ACTIVE', startDate: '2030-01-01', endDate: '2030-01-31',
    quorum: { totalEligibleArea: 100, totalVotedArea: 42, quorumPercent: 42, isQuorumAchieved: true },
    agendaItems: [{ id: 'question-1', orderIndex: 1, question: 'Repair the entrance?', decisionType: 'SIMPLE_MAJORITY',
      results: { areaFor: 6, areaAgainst: 3, areaAbstain: 1, totalItemVotedArea: 10, forPercentFromVoted: 60 },
      myVote: { choice: 'FOR', areaWeight: 6, voteHash: 'signed-vote-hash', createdAt: '2030-01-02T10:00:00Z' } }] };
}
test('the mobile model reads the nested quorum and trusts the reported quorum status', () => {
  const meeting = normalizeMeeting(fixture());
  assert.equal(meeting.quorumPercent, 42);
  assert.equal(meeting.isQuorumReached, true);
  assert.equal(meeting.totalTenantArea, 100);
  assert.equal(meeting.participatedArea, 42);
});
test('agenda text, result shares and the existing vote survive adaptation', () => {
  const item = normalizeMeeting(fixture()).agendaItems[0];
  assert.equal(item.title, 'Repair the entrance?');
  assert.deepEqual([item.votesSummary.forPercent, item.votesSummary.againstPercent, item.votesSummary.abstainPercent], [60, 30, 10]);
  assert.equal(item.myVote.signatureHash, 'signed-vote-hash');
  assert.equal(item.myVote.votedAt, '2030-01-02T10:00:00Z');
});
test('an empty tally never renders NaN and does not invent a personal vote', () => {
  const source = fixture();
  source.agendaItems[0].results = { areaFor: 0, areaAgainst: 0, areaAbstain: 0, totalItemVotedArea: 0, forPercentFromVoted: 0 };
  delete source.agendaItems[0].myVote;
  const item = normalizeMeeting(source).agendaItems[0];
  assert.deepEqual([item.votesSummary.forPercent, item.votesSummary.againstPercent, item.votesSummary.abstainPercent], [0, 0, 0]);
  assert.equal(item.myVote, null);
});
test('a successful vote receipt exposes the nested hash to the confirmation screen', () => {
  const receipt = normalizeVoteReceipt({ success: true, message: 'Accepted', vote: { voteHash: 'receipt-hash', areaWeight: 6, createdAt: '2030-01-02T10:00:00Z' } });
  assert.equal(receipt.signatureHash.slice(0, 16), 'receipt-hash');
  assert.equal(receipt.areaWeight, 6);
  assert.equal(receipt.votedAt, '2030-01-02T10:00:00Z');
});
