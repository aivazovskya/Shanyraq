import express = require('express');
import request = require('supertest');

export function parseTrustProxyConfig(envValue?: string): number | boolean {
  const trustProxyEnv = envValue ?? '0';
  const trustProxyHops = parseInt(trustProxyEnv, 10);
  return !isNaN(trustProxyHops)
    ? trustProxyHops
    : trustProxyEnv.toLowerCase() === 'true';
}

describe('Trust Proxy Configuration', () => {
  describe('parseTrustProxyConfig', () => {
    it('should default to 0 when envValue is undefined', () => {
      expect(parseTrustProxyConfig(undefined)).toBe(0);
    });

    it('should parse numeric string values correctly', () => {
      expect(parseTrustProxyConfig('0')).toBe(0);
      expect(parseTrustProxyConfig('1')).toBe(1);
      expect(parseTrustProxyConfig('2')).toBe(2);
    });

    it('should parse boolean string values correctly', () => {
      expect(parseTrustProxyConfig('true')).toBe(true);
      expect(parseTrustProxyConfig('TRUE')).toBe(true);
      expect(parseTrustProxyConfig('false')).toBe(false);
    });
  });

  describe('Express req.ip resolution with trust proxy', () => {
    it('should resolve req.ip from X-Forwarded-For when trust proxy is 1', async () => {
      const app = express();
      app.set('trust proxy', 1);

      app.get('/ip-test', (req, res) => {
        res.json({ ip: req.ip });
      });

      const response = await request(app)
        .get('/ip-test')
        .set('X-Forwarded-For', '203.0.113.195');

      expect(response.status).toBe(200);
      expect(response.body.ip).toBe('203.0.113.195');
    });

    it('should ignore X-Forwarded-For when trust proxy is 0 (preventing IP spoofing)', async () => {
      const app = express();
      app.set('trust proxy', 0);

      app.get('/ip-test', (req, res) => {
        res.json({ ip: req.ip });
      });

      const response = await request(app)
        .get('/ip-test')
        .set('X-Forwarded-For', '203.0.113.195');

      expect(response.status).toBe(200);
      expect(response.body.ip).not.toBe('203.0.113.195');
      // Express default socket addresses are loopback (::ffff:127.0.0.1 or 127.0.0.1)
      expect(['::ffff:127.0.0.1', '127.0.0.1', '::1']).toContain(response.body.ip);
    });
  });
});
