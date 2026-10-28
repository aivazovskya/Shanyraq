import test from 'node:test';
import assert from 'node:assert/strict';

function simulateConfig({ envUrl, isDev, hostUri, platform = 'ios' }) {
  const rawEnvApiUrl = envUrl ? envUrl.trim() : undefined;
  const getDevApiHost = () => {
    if (hostUri) {
      const ip = hostUri.split(':')[0];
      return `http://${ip}:4000`;
    }
    return platform === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
  };

  const hasEnvUrl = Boolean(rawEnvApiUrl);
  let resolvedApiUrl = '';
  let resolvedSocketUrl = '';
  let isMisconfigured = false;

  if (hasEnvUrl) {
    const normalized = rawEnvApiUrl.replace(/\/+$/, '');
    resolvedApiUrl = normalized.endsWith('/api/v1') ? normalized : `${normalized}/api/v1`;
    resolvedSocketUrl = normalized.replace(/\/api\/v1\/?$/, '').replace(/\/api\/?$/, '');
  } else if (isDev) {
    const devHost = getDevApiHost();
    resolvedApiUrl = `${devHost}/api/v1`;
    resolvedSocketUrl = devHost;
  } else {
    isMisconfigured = true;
    resolvedApiUrl = '';
    resolvedSocketUrl = '';
  }

  return { API_URL: resolvedApiUrl, SOCKET_URL: resolvedSocketUrl, isMisconfigured };
}

test('Config: EXPO_PUBLIC_API_URL takes priority in all environments', () => {
  const res = simulateConfig({
    envUrl: 'https://api.example.kz/api/v1',
    isDev: true,
    hostUri: '192.168.1.50:8081',
  });
  assert.equal(res.API_URL, 'https://api.example.kz/api/v1');
  assert.equal(res.SOCKET_URL, 'https://api.example.kz');
  assert.equal(res.isMisconfigured, false);
});

test('Config: Normalizes EXPO_PUBLIC_API_URL without trailing slash and appends /api/v1 if missing', () => {
  const res = simulateConfig({
    envUrl: 'https://api.example.kz/',
    isDev: false,
  });
  assert.equal(res.API_URL, 'https://api.example.kz/api/v1');
  assert.equal(res.SOCKET_URL, 'https://api.example.kz');
  assert.equal(res.isMisconfigured, false);
});

test('Config: In dev without EXPO_PUBLIC_API_URL, uses hostUri or platform fallback', () => {
  const resWithHost = simulateConfig({
    envUrl: undefined,
    isDev: true,
    hostUri: '192.168.1.100:8081',
  });
  assert.equal(resWithHost.API_URL, 'http://192.168.1.100:4000/api/v1');
  assert.equal(resWithHost.SOCKET_URL, 'http://192.168.1.100:4000');
  assert.equal(resWithHost.isMisconfigured, false);

  const resAndroid = simulateConfig({
    envUrl: undefined,
    isDev: true,
    platform: 'android',
  });
  assert.equal(resAndroid.API_URL, 'http://10.0.2.2:4000/api/v1');
  assert.equal(resAndroid.SOCKET_URL, 'http://10.0.2.2:4000');
  assert.equal(resAndroid.isMisconfigured, false);
});

test('Config: In production (!__DEV__) without EXPO_PUBLIC_API_URL, flags isMisconfigured and does not hit localhost', () => {
  const resProd = simulateConfig({
    envUrl: undefined,
    isDev: false,
  });
  assert.equal(resProd.isMisconfigured, true);
  assert.equal(resProd.API_URL, '');
  assert.equal(resProd.SOCKET_URL, '');
});
