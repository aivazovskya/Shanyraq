const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Test the dependency-free TypeScript model using the project's existing compiler.
const filename = path.resolve(__dirname, '../src/lib/dashboard-model.ts');
const compiled = new Module(filename, module);
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { getDashboardPlan, getWorkspace, getRequestQueues, overdueSince } = compiled.exports;
const now = Date.parse('2026-10-16T12:00:00Z');
const request = (changes = {}) => ({ id: 'r1', tenantId: 't1', title: 'Leak', status: 'PENDING', priority: 'HIGH',
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-16T11:00:00Z', ...changes });

test('security requests only SOS/access; dispatcher never calls analytics', () => {
  assert.deepEqual(getDashboardPlan('SECURITY', 't1').map((item) => item.key), ['sos', 'points']);
  assert.deepEqual(getDashboardPlan('DISPATCHER', 't1').map((item) => item.key), ['requests']);
  assert.equal(getWorkspace('SECURITY'), 'security');
  assert.equal(getWorkspace('DISPATCHER'), 'dispatcher');
});
test('all leadership roles receive finance, housing and voting summaries', () => {
  for (const role of ['HOA_ADMIN', 'HOA_CHAIRMAN', 'SUPERADMIN']) {
    assert.equal(getWorkspace(role), 'management');
    assert.deepEqual(getDashboardPlan(role, 't1').map((item) => item.key), ['requests', 'finance', 'meetings', 'structure']);
  }
});
test('missing complex and non-staff roles produce no API calls', () => {
  for (const role of ['RESIDENT_OWNER', 'RESIDENT_TENANT', 'UNKNOWN', undefined]) {
    assert.equal(getWorkspace(role), 'unsupported');
    assert.deepEqual(getDashboardPlan(role, 't1'), []);
  }
  assert.deepEqual(getDashboardPlan('HOA_ADMIN', null), []);
  assert.deepEqual(getDashboardPlan('SUPERADMIN', ''), []);
});
test('SLA uses last update rather than creation, inclusive at each priority boundary', () => {
  for (const [priority, hours] of Object.entries({ EMERGENCY: 4, HIGH: 24, MEDIUM: 72, LOW: 168 })) {
    const boundary = request({ priority, updatedAt: new Date(now - hours * 3600000).toISOString() });
    assert.equal(overdueSince(boundary), now);
    assert.equal(getRequestQueues([boundary], 't1', now).overdue.length, 1);
    const recentUpdate = request({ priority, updatedAt: new Date(now - hours * 3600000 + 1).toISOString() });
    assert.equal(getRequestQueues([recentUpdate], 't1', now).overdue.length, 0);
  }
});
test('assigned requests count as open; resolved/rejected/closed never become urgent or overdue', () => {
  const items = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'CLOSED'].map((status) =>
    request({ id: status, status, updatedAt: '2026-10-01T00:00:00Z' }));
  const result = getRequestQueues(items, 't1', now);
  for (const key of ['open', 'urgent', 'overdue']) assert.deepEqual(result[key].map((item) => item.id).sort(), ['ASSIGNED', 'IN_PROGRESS', 'PENDING']);
});
test('queues never mix complexes, including global superadmin responses', () => {
  const result = getRequestQueues([request(), request({ id: 'other', tenantId: 't2' })], 't1', now);
  assert.deepEqual(result.open.map((item) => item.id), ['r1']);
  assert.equal(getRequestQueues([request()], '', now).open.length, 0);
});
test('urgent list excludes normal priorities and orders emergencies before high, oldest first', () => {
  const items = [request({ id: 'high' }), request({ id: 'new', priority: 'EMERGENCY', createdAt: '2026-10-15T00:00:00Z' }),
    request({ id: 'old', priority: 'EMERGENCY' }), request({ id: 'medium', priority: 'MEDIUM' })];
  assert.deepEqual(getRequestQueues(items, 't1', now).urgent.map((item) => item.id), ['old', 'new', 'high']);
  assert.equal(items[0].id, 'high'); // Rendering a queue must not reorder the source response.
});
test('overdue list orders by missed deadline and assignment works with ID or embedded assignee', () => {
  const items = [request({ id: 'later', updatedAt: '2026-10-14T00:00:00Z', assigneeId: 'staff' }),
    request({ id: 'earlier', updatedAt: '2026-10-13T00:00:00Z', assignee: {firstName:'A',lastName:'B'} }),
    request({ id: 'unassigned', priority: 'LOW' })];
  const result = getRequestQueues(items, 't1', now);
  assert.deepEqual(result.overdue.map((item) => item.id), ['earlier', 'later']);
  assert.deepEqual(result.unassigned.map((item) => item.id), ['unassigned']);
});
