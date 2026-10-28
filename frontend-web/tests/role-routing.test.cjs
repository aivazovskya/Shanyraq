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
