const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Mock localStorage and sessionStorage
class MemoryStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

const mockLocalStorage = new MemoryStorage();
const mockSessionStorage = new MemoryStorage();
const mockWindow = {
  localStorage: mockLocalStorage,
  sessionStorage: mockSessionStorage,
  location: { href: '' },
};

global.window = mockWindow;

function loadApiModule() {
  const filename = path.resolve(__dirname, '../src/lib/api.ts');
  const compiled = new Module(filename, module);
  compiled._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText,
    filename,
  );
  return compiled.exports;
}

test('api-session: saveSession with remember=true stores in localStorage and clears sessionStorage', () => {
  mockLocalStorage.clear();
  mockSessionStorage.clear();
  const api = loadApiModule();

  const user = { id: 'u-1', phone: '+77011112233', firstName: 'Тест', lastName: 'Пользователь', role: 'HOA_ADMIN', tenantId: 't-1' };
  api.saveSession({ token: 'acc-1', refreshToken: 'ref-1', user, remember: true });

  assert.ok(mockLocalStorage.getItem(api.SESSION_STORAGE_KEY), 'Must be in localStorage');
  assert.equal(mockSessionStorage.getItem(api.SESSION_STORAGE_KEY), null, 'Must NOT be in sessionStorage');

  const stored = JSON.parse(mockLocalStorage.getItem(api.SESSION_STORAGE_KEY));
  assert.equal(stored.token, 'acc-1');
  assert.equal(stored.refreshToken, 'ref-1');
  assert.equal(stored.remember, true);
});

test('api-session: saveSession with remember=false stores in sessionStorage and clears localStorage', () => {
  mockLocalStorage.clear();
  mockSessionStorage.clear();
  const api = loadApiModule();

  const user = { id: 'u-2', phone: '+77011112234', firstName: 'Тест', lastName: 'Пользователь', role: 'RESIDENT_OWNER', tenantId: 't-1' };
  api.saveSession({ token: 'acc-2', refreshToken: 'ref-2', user, remember: false });

  assert.ok(mockSessionStorage.getItem(api.SESSION_STORAGE_KEY), 'Must be in sessionStorage');
  assert.equal(mockLocalStorage.getItem(api.SESSION_STORAGE_KEY), null, 'Must NOT be in localStorage');

  const stored = JSON.parse(mockSessionStorage.getItem(api.SESSION_STORAGE_KEY));
  assert.equal(stored.token, 'acc-2');
  assert.equal(stored.refreshToken, 'ref-2');
  assert.equal(stored.remember, false);
});

test('api-session: getStoredSession restores session from storage when memory is empty', () => {
  mockLocalStorage.clear();
  mockSessionStorage.clear();
  const api1 = loadApiModule();
  const user = { id: 'u-3', phone: '+77011112235', firstName: 'Иван', lastName: 'Иванов', role: 'DISPATCHER', tenantId: 't-1' };
  api1.saveSession({ token: 'acc-3', refreshToken: 'ref-3', user, remember: true });

  // Simulate new page load: freshly loaded module with empty in-memory state
  const api2 = loadApiModule();
  const session = api2.getStoredSession();
  assert.ok(session, 'Session must be restored from localStorage');
  assert.equal(session.token, 'acc-3');
  assert.equal(session.refreshToken, 'ref-3');
  assert.equal(session.user.id, 'u-3');
});

test('api-session: clearSession removes from memory and both storages', () => {
  mockLocalStorage.clear();
  mockSessionStorage.clear();
  const api = loadApiModule();
  const user = { id: 'u-4', phone: '+77011112236', firstName: 'Асан', lastName: 'Омаров', role: 'HOA_ADMIN', tenantId: 't-1' };

  api.saveSession({ token: 'acc-4', refreshToken: 'ref-4', user, remember: true });
  assert.ok(mockLocalStorage.getItem(api.SESSION_STORAGE_KEY));

  api.clearSession();
  assert.equal(api.getStoredSession(), null);
  assert.equal(mockLocalStorage.getItem(api.SESSION_STORAGE_KEY), null);
  assert.equal(mockSessionStorage.getItem(api.SESSION_STORAGE_KEY), null);
});

test('api-session: apiRequest on 401 quietly refreshes token and retries request', async () => {
  mockLocalStorage.clear();
  mockSessionStorage.clear();
  mockWindow.location.href = '';
  const api = loadApiModule();

  const user = { id: 'u-5', phone: '+77011112237', firstName: 'Серик', lastName: 'Болатов', role: 'HOA_CHAIRMAN', tenantId: 't-1' };
  api.saveSession({ token: 'expired-acc', refreshToken: 'valid-refresh', user, remember: true });

  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/auth/refresh')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ accessToken: 'new-acc-token', refreshToken: 'valid-refresh' }),
      };
    }
    if (options.headers?.Authorization === 'Bearer expired-acc') {
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ code: 'AUTH.TOKEN_EXPIRED', message: 'Token expired' }),
      };
    }
    if (options.headers?.Authorization === 'Bearer new-acc-token') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: 'secure-data' }),
      };
    }
    throw new Error('Unexpected fetch call');
  };

  const res = await api.apiRequest('/data/protected');
  assert.deepEqual(res, { success: true, data: 'secure-data' });
  assert.equal(api.getStoredSession().token, 'new-acc-token');
  assert.equal(calls.length, 3, 'Initial call (401), Refresh call, Retry call (200)');
  assert.equal(mockWindow.location.href, '', 'Must NOT redirect on successful refresh');
});

test('api-session: apiRequest deduplicates parallel 401 refreshes to a single POST /auth/refresh call', async () => {
  mockLocalStorage.clear();
  mockSessionStorage.clear();
  const api = loadApiModule();

  const user = { id: 'u-6', phone: '+77011112238', firstName: 'Берик', lastName: 'Алиев', role: 'HOA_ADMIN', tenantId: 't-1' };
  api.saveSession({ token: 'expired-acc-parallel', refreshToken: 'valid-refresh-parallel', user, remember: true });

  let refreshCallCount = 0;
  global.fetch = async (url, options = {}) => {
    if (url.includes('/auth/refresh')) {
      refreshCallCount++;
      // Simulate network latency
      await new Promise((r) => setTimeout(r, 20));
      return {
        ok: true,
        status: 200,
        json: async () => ({ accessToken: 'parallel-new-acc', refreshToken: 'valid-refresh-parallel' }),
      };
    }
    if (options.headers?.Authorization === 'Bearer expired-acc-parallel') {
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ code: 'AUTH.TOKEN_EXPIRED', message: 'Token expired' }),
      };
    }
    if (options.headers?.Authorization === 'Bearer parallel-new-acc') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ endpoint: url }),
      };
    }
    throw new Error('Unexpected fetch call: ' + url);
  };

  // Launch 3 requests in parallel
  const [res1, res2, res3] = await Promise.all([
    api.apiRequest('/endpoint1'),
    api.apiRequest('/endpoint2'),
    api.apiRequest('/endpoint3'),
  ]);

  assert.ok(res1 && res2 && res3);
  assert.equal(refreshCallCount, 1, 'Only 1 refresh request must be sent across parallel 401s');
  assert.equal(api.getStoredSession().token, 'parallel-new-acc');
});

test('api-session: apiRequest on 401 with rejected refresh (401) clears session and redirects', async () => {
  mockLocalStorage.clear();
  mockSessionStorage.clear();
  mockWindow.location.href = '';
  const api = loadApiModule();

  const user = { id: 'u-7', phone: '+77011112239', firstName: 'Дидар', lastName: 'Омаров', role: 'RESIDENT_OWNER', tenantId: 't-1' };
  api.saveSession({ token: 'bad-acc', refreshToken: 'revoked-refresh', user, remember: true });

  global.fetch = async (url) => {
    if (url.includes('/auth/refresh')) {
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ code: 'AUTH.INVALID_REFRESH_TOKEN', message: 'Revoked' }),
      };
    }
    return {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ code: 'AUTH.TOKEN_EXPIRED', message: 'Expired' }),
    };
  };

  await assert.rejects(
    async () => {
      await api.apiRequest('/test/resource');
    },
    (err) => err.name === 'NoSessionError',
  );

  assert.equal(api.getStoredSession(), null, 'Session must be cleared');
  assert.equal(mockWindow.location.href, '/', 'Must redirect to /');
});
