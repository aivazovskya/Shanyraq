import express = require('express');
import request = require('supertest');

import { parseTrustProxy } from '../../main';

describe('Trust Proxy Configuration', () => {
  describe('parseTrustProxy', () => {
    it('should default to 0 when envValue is undefined', () => {
      expect(parseTrustProxy(undefined)).toBe(0);
    });

    it('should parse non-negative integer string values correctly', () => {
      expect(parseTrustProxy('0')).toBe(0);
      expect(parseTrustProxy('1')).toBe(1);
      expect(parseTrustProxy('2')).toBe(2);
      expect(parseTrustProxy(' 3 ')).toBe(3);
    });

    it('should throw an error on startup for boolean or non-numeric values', () => {
      expect(() => parseTrustProxy('true')).toThrow(/Invalid TRUST_PROXY configuration/);
      expect(() => parseTrustProxy('false')).toThrow(/Invalid TRUST_PROXY configuration/);
      expect(() => parseTrustProxy('abc')).toThrow(/Invalid TRUST_PROXY configuration/);
      expect(() => parseTrustProxy('-1')).toThrow(/Invalid TRUST_PROXY configuration/);
      expect(() => parseTrustProxy('1.5')).toThrow(/Invalid TRUST_PROXY configuration/);
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
