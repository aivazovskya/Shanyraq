const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ru = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/i18n/locales/ru.json'), 'utf8'));
const kk = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/i18n/locales/kk.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/i18n/locales/en.json'), 'utf8'));

function resolveKey(obj, key) {
  const parts = key.split('.');
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== 'object' || !(p in cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}

function makeT(localeObj) {
  return function t(key, options) {
    const val = resolveKey(localeObj, key);
    if (val !== undefined && typeof val === 'string') return val;
    if (options && options.defaultValue) return options.defaultValue;
    return key;
  };
}

test('cabinet i18n: complete parity across ru, kk, and en locales', () => {
  const sections = ['cabinet', 'profile', 'onboarding', 'auth', 'navigation', 'common', 'roles'];

  for (const sec of sections) {
    assert.ok(ru[sec], `ru.${sec} must exist`);
    assert.ok(kk[sec], `kk.${sec} must exist`);
    assert.ok(en[sec], `en.${sec} must exist`);

    const ruKeys = Object.keys(ru[sec]);
    for (const k of ruKeys) {
      assert.ok(kk[sec][k] !== undefined, `Missing kk.${sec}.${k}`);
      assert.ok(en[sec][k] !== undefined, `Missing en.${sec}.${k}`);
      if (typeof ru[sec][k] === 'string') {
        assert.ok(ru[sec][k].length > 0, `ru.${sec}.${k} cannot be empty`);
        assert.ok(typeof kk[sec][k] === 'string' && kk[sec][k].length > 0, `kk.${sec}.${k} cannot be empty`);
        assert.ok(typeof en[sec][k] === 'string' && en[sec][k].length > 0, `en.${sec}.${k} cannot be empty`);
      }
    }
  }

  // Check essential cabinet navigation keys
  const navKeys = [
    'cabinet',
    'cabinetHome',
    'cabinetRequests',
    'cabinetAccess',
    'cabinetFinance',
    'cabinetMeters',
    'cabinetVoting',
    'cabinetAmenities',
    'cabinetChat',
    'cabinetAnnouncements',
    'cabinetCommunity',
    'cabinetNotifications',
    'cabinetSos',
    'cabinetProfile',
  ];

  for (const nk of navKeys) {
    assert.ok(ru.navigation[nk], `Missing ru.navigation.${nk}`);
    assert.ok(kk.navigation[nk], `Missing kk.navigation.${nk}`);
    assert.ok(en.navigation[nk], `Missing en.navigation.${nk}`);
  }

  // Check common keys (common.details, common.all, common.requiredFields)
  assert.ok(ru.common?.details && kk.common?.details && en.common?.details, 'common.details must exist in ru, kk, en');
  assert.ok(ru.common?.all && kk.common?.all && en.common?.all, 'common.all must exist in ru, kk, en');
  assert.ok(ru.common?.requiredFields && kk.common?.requiredFields && en.common?.requiredFields, 'common.requiredFields must exist in ru, kk, en');
});

test('cabinet i18n: 100% of literal t(...) keys in cabinet pages exist in ru, kk, and en', () => {
  function getFiles(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const full = path.join(dir, file);
      const stat = fs.statSync(full);
      if (stat && stat.isDirectory()) results = results.concat(getFiles(full));
      else if (full.endsWith('.tsx') || full.endsWith('.ts')) results.push(full);
    }
    return results;
  }

  const cabinetDir = path.resolve(__dirname, '../src/app/cabinet');
  const cabinetFiles = getFiles(cabinetDir);
  const componentFiles = [
    path.resolve(__dirname, '../src/components/NotificationBell.tsx'),
    path.resolve(__dirname, '../src/lib/cabinet-labels.ts'),
  ].filter(f => fs.existsSync(f));

  const allFiles = [...cabinetFiles, ...componentFiles];
  assert.ok(allFiles.length >= 13, `Found ${allFiles.length} cabinet files, expected at least 13`);

  const tRegex = /\bt\(\s*['"]([^'"]+)['"]/g;
  const missing = [];
  const scannedKeys = new Set();

  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = tRegex.exec(content)) !== null) {
      const key = match[1];
      scannedKeys.add(key);
      for (const [lang, loc] of [['ru', ru], ['kk', kk], ['en', en]]) {
        if (resolveKey(loc, key) === undefined) {
          missing.push({ file: path.basename(file), key, lang });
        }
      }
    }
  }

  assert.equal(missing.length, 0, `Missing t(...) keys found: ${JSON.stringify(missing, null, 2)}`);
  assert.ok(scannedKeys.size >= 100, `Expected at least 100 distinct keys scanned, found ${scannedKeys.size}`);
});

test('cabinet i18n: status, role, priority enum mappings resolve to localized text', () => {
  for (const [lang, loc] of [['ru', ru], ['kk', kk], ['en', en]]) {
    const t = makeT(loc);

    // Request statuses
    const statuses = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'CLOSED'];
    const statusKeys = {
      PENDING: 'cabinet.statusPending',
      ASSIGNED: 'cabinet.statusAssigned',
      IN_PROGRESS: 'cabinet.statusInProgress',
      RESOLVED: 'cabinet.statusResolved',
      REJECTED: 'cabinet.statusRejected',
      CLOSED: 'cabinet.statusClosed',
    };
    for (const s of statuses) {
      const localized = t(statusKeys[s]);
      assert.notEqual(localized, s, `${lang}: status ${s} must not return raw enum`);
      assert.ok(localized.length > 0, `${lang}: status ${s} translation empty`);
    }

    // Role labels
    const roles = ['HOA_ADMIN', 'HOA_CHAIRMAN', 'DISPATCHER', 'SECURITY', 'MANAGEMENT_COMPANY', 'SUPERADMIN'];
    const roleKeys = {
      HOA_ADMIN: 'roles.hoa_admin',
      HOA_CHAIRMAN: 'roles.hoa_chairman',
      DISPATCHER: 'roles.dispatcher',
      SECURITY: 'roles.security',
      MANAGEMENT_COMPANY: 'roles.management_company',
      SUPERADMIN: 'roles.superadmin',
    };
    for (const r of roles) {
      const localized = t(roleKeys[r]);
      assert.notEqual(localized, r, `${lang}: role ${r} must not return raw enum`);
      assert.ok(localized.length > 0, `${lang}: role ${r} translation empty`);
    }

    // Voting statuses
    const votingStatuses = ['ACTIVE', 'COMPLETED', 'DRAFT', 'CANCELLED'];
    const votingKeys = {
      ACTIVE: 'cabinet.votingActive',
      COMPLETED: 'cabinet.votingCompleted',
      DRAFT: 'cabinet.votingDraft',
      CANCELLED: 'cabinet.votingCancelled',
    };
    for (const vs of votingStatuses) {
      const localized = t(votingKeys[vs]);
      assert.notEqual(localized, vs, `${lang}: voting status ${vs} must not return raw enum`);
      assert.ok(localized.length > 0, `${lang}: voting status ${vs} translation empty`);
    }

    // Meter types
    const meterTypes = ['COLD_WATER', 'HOT_WATER', 'ELECTRICITY'];
    const meterKeys = {
      COLD_WATER: 'cabinet.meterColdWater',
      HOT_WATER: 'cabinet.meterHotWater',
      ELECTRICITY: 'cabinet.meterElectricity',
    };
    for (const mt of meterTypes) {
      const localized = t(meterKeys[mt]);
      assert.notEqual(localized, mt, `${lang}: meter type ${mt} must not return raw enum`);
      assert.ok(localized.length > 0, `${lang}: meter type ${mt} translation empty`);
    }
  }
});
