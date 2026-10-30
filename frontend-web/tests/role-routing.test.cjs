const { test } = require('node:test');
const assert = require('node:assert/strict');

function isResidentRole(role) {
  if (!role) return false;
  return ['RESIDENT_OWNER', 'RESIDENT_TENANT'].includes(role);
}

function isStaffRole(role) {
  if (!role) return false;
  return !isResidentRole(role);
}

function getHomeRouteForRole(role) {
  if (isResidentRole(role)) {
    return '/cabinet';
  }
  return '/dashboard';
}

test('role-routing: correctly identifies resident roles and routes to /cabinet', () => {
  assert.equal(isResidentRole('RESIDENT_OWNER'), true);
  assert.equal(isResidentRole('RESIDENT_TENANT'), true);
  assert.equal(getHomeRouteForRole('RESIDENT_OWNER'), '/cabinet');
  assert.equal(getHomeRouteForRole('RESIDENT_TENANT'), '/cabinet');
});

test('role-routing: correctly identifies staff roles and routes to /dashboard', () => {
  const staff = ['SUPERADMIN', 'HOA_ADMIN', 'HOA_CHAIRMAN', 'DISPATCHER', 'SECURITY', 'MANAGEMENT_COMPANY'];
  for (const role of staff) {
    assert.equal(isResidentRole(role), false);
    assert.equal(isStaffRole(role), true);
    assert.equal(getHomeRouteForRole(role), '/dashboard');
  }
});

test('role-routing: handles null, undefined, or unknown roles safely', () => {
  assert.equal(isResidentRole(null), false);
  assert.equal(isResidentRole(undefined), false);
  assert.equal(isResidentRole(''), false);
  assert.equal(getHomeRouteForRole(null), '/dashboard');
  assert.equal(getHomeRouteForRole(undefined), '/dashboard');
  assert.equal(getHomeRouteForRole('UNKNOWN_ROLE'), '/dashboard');
});

test('role-routing: /dashboard/chat route permissions include HOA_CHAIRMAN', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const layoutPath = path.resolve(__dirname, '../src/app/dashboard/layout.tsx');
  const content = fs.readFileSync(layoutPath, 'utf8');

  // Verify chat navigation item in layout contains HOA_CHAIRMAN
  const chatNavMatch = content.match(/href:\s*['"]\/dashboard\/chat['"][^}]+roles:\s*\[([^\]]+)\]/);
  assert.ok(chatNavMatch, 'Could not find chat navigation config in layout.tsx');
  const roles = chatNavMatch[1].split(',').map((r) => r.trim().replace(/['"]/g, ''));
  assert.ok(roles.includes('HOA_CHAIRMAN'), 'HOA_CHAIRMAN must be allowed to access /dashboard/chat');
  assert.ok(roles.includes('DISPATCHER'), 'DISPATCHER must be allowed to access /dashboard/chat');
  assert.ok(roles.includes('HOA_ADMIN'), 'HOA_ADMIN must be allowed to access /dashboard/chat');
  assert.ok(roles.includes('SUPERADMIN'), 'SUPERADMIN must be allowed to access /dashboard/chat');
});
