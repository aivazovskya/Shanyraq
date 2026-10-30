import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import canAccessChat logic from AuthContext.tsx
function parseCanAccessChatFromSource() {
  const authContextPath = path.resolve(__dirname, '../src/context/AuthContext.tsx');
  const source = fs.readFileSync(authContextPath, 'utf8');
  const match = source.match(/export function canAccessChat\([^)]*\)[^{]*\{([\s\S]*?)\}/);
  assert.ok(match, 'canAccessChat function not found in AuthContext.tsx');
  const fnBody = match[1];
  return new Function('role', fnBody);
}

test('Staff Chat Role: canAccessChat returns true for HOA_CHAIRMAN, DISPATCHER, HOA_ADMIN', () => {
  const canAccessChat = parseCanAccessChatFromSource();

  assert.equal(canAccessChat('HOA_CHAIRMAN'), true);
  assert.equal(canAccessChat('DISPATCHER'), true);
  assert.equal(canAccessChat('HOA_ADMIN'), true);

  assert.equal(canAccessChat('SECURITY'), false);
  assert.equal(canAccessChat('RESIDENT_OWNER'), false);
  assert.equal(canAccessChat('RESIDENT_TENANT'), false);
  assert.equal(canAccessChat('SUPERADMIN'), false);
  assert.equal(canAccessChat(null), false);
  assert.equal(canAccessChat(undefined), false);
});

test('Staff Chat Role: StaffHomeScreen provides actionChat for HOA_CHAIRMAN', () => {
  const homeScreenPath = path.resolve(__dirname, '../src/screens/staff/StaffHomeScreen.tsx');
  const source = fs.readFileSync(homeScreenPath, 'utf8');

  // Verify Chairman actions block contains ChatInboxTab navigation
  const chairmanSection = source.match(/\{isChairman && \([\s\S]*?<\/>/);
  assert.ok(chairmanSection, 'HOA_CHAIRMAN actions section not found in StaffHomeScreen');
  assert.ok(
    chairmanSection[0].includes("navigation.navigate('ChatInboxTab')"),
    'HOA_CHAIRMAN must have actionChat navigating to ChatInboxTab',
  );
});

test('Staff Chat Role: StaffChatThreadScreen allows HOA_CHAIRMAN to resolve conversations', () => {
  const threadScreenPath = path.resolve(__dirname, '../src/screens/staff/StaffChatThreadScreen.tsx');
  const source = fs.readFileSync(threadScreenPath, 'utf8');

  const match = source.match(/const canResolve = \[([^\]]+)\]\.includes/);
  assert.ok(match, 'canResolve array not found in StaffChatThreadScreen');
  const roles = match[1].split(',').map((r) => r.trim().replace(/['"]/g, ''));
  assert.ok(roles.includes('HOA_CHAIRMAN'), 'HOA_CHAIRMAN must be allowed to resolve conversations');
});
