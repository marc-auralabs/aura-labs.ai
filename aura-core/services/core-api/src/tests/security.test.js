/**
 * Security Tests for Core API
 *
 * TDD approach: These tests define expected secure behavior.
 * Many will FAIL until security fixes are implemented.
 *
 * Run with: node --test src/tests/security.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { request, fixtures } from './setup.js';

// =============================================================================
// CRITICAL: SQL Injection Prevention
// =============================================================================

describe('SQL Injection Prevention', () => {
  test('should reject SQL injection in session ID parameter', async () => {
    const maliciousId = fixtures.sqlInjection.basic;
    const res = await request(`/sessions/${encodeURIComponent(maliciousId)}`);

    // Should return 400 Bad Request, not 500 (which indicates SQL error)
    assert.notStrictEqual(res.status, 500, 'Server error suggests SQL injection vulnerability');
    assert.strictEqual(res.status, 400, 'Should reject invalid session ID format');
    assert.ok(res.json?.error, 'Should return error message');
  });

  test('should reject SQL injection in beacon ID parameter', async () => {
    const maliciousId = fixtures.sqlInjection.union;
    const res = await request(`/beacons/${encodeURIComponent(maliciousId)}`);

    assert.notStrictEqual(res.status, 500, 'Server error suggests SQL injection vulnerability');
    assert.strictEqual(res.status, 400, 'Should reject invalid beacon ID format');
  });

  test('should reject SQL injection in scout ID parameter', async () => {
    const maliciousId = fixtures.sqlInjection.blind;
    const res = await request(`/scouts/${encodeURIComponent(maliciousId)}`);

    assert.notStrictEqual(res.status, 500, 'Server error suggests SQL injection vulnerability');
    assert.strictEqual(res.status, 400, 'Should reject invalid scout ID format');
  });

  test('should reject SQL injection in offer submission', async () => {
    const sessionId = fixtures.sessionId();
    const res = await request(`/sessions/${sessionId}/offers`, {
      method: 'POST',
      body: {
        beaconId: fixtures.sqlInjection.basic,
        product: { name: 'Test' },
        unitPrice: 100,
        quantity: 1,
      },
    });

    assert.notStrictEqual(res.status, 500, 'Server error suggests SQL injection vulnerability');
  });

  test('should only accept valid UUID format for IDs', async () => {
    const invalidIds = ['not-a-uuid', '12345', 'abc', ''];

    for (const id of invalidIds) {
      const res = await request(`/sessions/${id}`);
      assert.strictEqual(res.status, 400, `Should reject invalid ID: ${id}`);
    }
  });
});

// =============================================================================
// CRITICAL: Authentication & Authorization
// =============================================================================

describe('Authentication', () => {
  test('should require authentication for session creation', async () => {
    const res = await request('/sessions', {
      method: 'POST',
      body: fixtures.validIntent(),
      // No auth header
    });

    assert.strictEqual(res.status, 401, 'Should require authentication');
    assert.ok(res.json?.error?.includes('auth') || res.json?.error?.includes('unauthorized'),
      'Should indicate authentication required');
  });

  test('should require authentication for offer submission', async () => {
    const res = await request('/sessions/some-id/offers', {
      method: 'POST',
      body: fixtures.validOffer('beacon-id'),
      // No auth header
    });

    assert.strictEqual(res.status, 401, 'Should require authentication');
  });

  test('should require authentication for transaction commit', async () => {
    const res = await request('/sessions/some-id/commit', {
      method: 'POST',
      body: { offerId: 'some-offer' },
      // No auth header
    });

    assert.strictEqual(res.status, 401, 'Should require authentication');
  });

  test('should reject invalid API keys', async () => {
    const res = await request('/sessions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer invalid-key' },
      body: fixtures.validIntent(),
    });

    assert.strictEqual(res.status, 401, 'Should reject invalid API key');
  });

  test('should reject expired tokens', async () => {
    // This would require a real expired token
    const expiredToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJleHAiOjE2MDAwMDAwMDB9.fake';
    const res = await request('/sessions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${expiredToken}` },
      body: fixtures.validIntent(),
    });

    assert.strictEqual(res.status, 401, 'Should reject expired token');
  });
});

describe('Authorization', () => {
  test('should prevent scout from accessing another scout\'s sessions', async () => {
    // This test requires auth implementation
    // Scout A should not be able to see Scout B's session details
    const res = await request('/sessions/other-scouts-session', {
      headers: { 'Authorization': 'Bearer scout-a-token' },
    });

    // Either 404 (hidden) or 403 (forbidden)
    assert.ok([403, 404].includes(res.status), 'Should not expose other scouts sessions');
  });

  test('should prevent beacon from modifying another beacon\'s offers', async () => {
    const res = await request('/sessions/some-session/offers/other-beacons-offer', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer beacon-a-token' },
      body: { unitPrice: 1 }, // Trying to modify price
    });

    assert.ok([403, 404, 405].includes(res.status), 'Should not allow modifying others offers');
  });
});

// =============================================================================
// CRITICAL: Admin Endpoint Protection
// =============================================================================

describe('Admin Endpoint Security', () => {
  test('admin reset endpoint should require authentication', async () => {
    const res = await request('/admin/reset-database', {
      method: 'POST',
      body: { confirm: 'yes-delete-everything' },
      // No auth
    });

    assert.strictEqual(res.status, 401, 'Admin endpoint should require authentication');
  });

  test('admin reset endpoint should require admin role', async () => {
    const res = await request('/admin/reset-database', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer regular-user-token' },
      body: { confirm: 'yes-delete-everything' },
    });

    assert.strictEqual(res.status, 403, 'Admin endpoint should require admin role');
  });

  test('admin endpoint should not be accessible in production', async () => {
    // In production (NODE_ENV=production), admin endpoints should be disabled
    const res = await request('/admin/reset-database', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer admin-token' },
      body: { confirm: 'yes-delete-everything' },
    });

    // Should either be 404 (endpoint removed) or 403 (disabled)
    assert.ok([403, 404].includes(res.status), 'Admin endpoint should be disabled in production');
  });
});

// =============================================================================
// HIGH: Rate Limiting
// =============================================================================

describe('Rate Limiting', () => {
  test('should rate limit repeated requests', async () => {
    const results = [];

    // Send many requests quickly
    for (let i = 0; i < 20; i++) {
      const res = await request('/health');
      results.push(res.status);
    }

    // At least some should be rate limited (429)
    const rateLimited = results.filter(s => s === 429).length;
    assert.ok(rateLimited > 0, 'Should rate limit excessive requests');
  });

  test('should include rate limit headers', async () => {
    const res = await request('/health');

    assert.ok(
      res.headers.get('x-ratelimit-limit') ||
      res.headers.get('ratelimit-limit'),
      'Should include rate limit header'
    );
  });

  test('should rate limit authentication attempts', async () => {
    const results = [];

    // Simulate brute force
    for (let i = 0; i < 10; i++) {
      const res = await request('/scouts/register', {
        method: 'POST',
        body: { apiKey: `wrong-key-${i}` },
      });
      results.push(res.status);
    }

    const rateLimited = results.filter(s => s === 429).length;
    assert.ok(rateLimited > 0, 'Should rate limit auth attempts');
  });
});

// =============================================================================
// HIGH: Input Validation
// =============================================================================

describe('Input Validation', () => {
  test('should reject oversized request bodies', async () => {
    const res = await request('/sessions', {
      method: 'POST',
      body: {
        intent: fixtures.oversizedPayloads.largeString,
      },
    });

    assert.ok([400, 413].includes(res.status), 'Should reject oversized payload');
  });

  test('should reject deeply nested JSON', async () => {
    const res = await request('/sessions', {
      method: 'POST',
      body: {
        intent: 'test',
        constraints: fixtures.oversizedPayloads.deepNesting,
      },
    });

    assert.ok([400, 413].includes(res.status), 'Should reject deeply nested JSON');
  });

  test('should sanitize XSS in intent field', async () => {
    const res = await request('/sessions', {
      method: 'POST',
      body: {
        intent: fixtures.xssPayloads.basic,
      },
    });

    // If stored, should be sanitized
    if (res.json?.intent?.raw) {
      assert.ok(
        !res.json.intent.raw.includes('<script>'),
        'Should sanitize script tags'
      );
    }
  });

  test('should validate required fields', async () => {
    const res = await request('/sessions', {
      method: 'POST',
      body: {}, // Missing intent
    });

    assert.strictEqual(res.status, 400, 'Should require intent field');
    assert.ok(res.json?.error, 'Should return validation error');
  });

  test('should validate offer price is positive', async () => {
    const res = await request('/sessions/valid-session/offers', {
      method: 'POST',
      body: {
        beaconId: fixtures.beaconId(),
        product: { name: 'Test' },
        unitPrice: -100, // Negative price
        quantity: 1,
      },
    });

    assert.strictEqual(res.status, 400, 'Should reject negative price');
  });

  test('should validate offer quantity is positive integer', async () => {
    const res = await request('/sessions/valid-session/offers', {
      method: 'POST',
      body: {
        beaconId: fixtures.beaconId(),
        product: { name: 'Test' },
        unitPrice: 100,
        quantity: -5, // Negative quantity
      },
    });

    assert.strictEqual(res.status, 400, 'Should reject negative quantity');
  });
});

// =============================================================================
// HIGH: CORS Configuration
// =============================================================================

describe('CORS Security', () => {
  test('should not allow unrestricted origins', async () => {
    const res = await request('/health', {
      headers: {
        'Origin': 'https://malicious-site.com',
      },
    });

    const allowedOrigin = res.headers.get('access-control-allow-origin');
    assert.notStrictEqual(allowedOrigin, '*', 'Should not allow all origins');
    assert.notStrictEqual(
      allowedOrigin,
      'https://malicious-site.com',
      'Should not reflect arbitrary origins'
    );
  });

  test('should restrict allowed methods', async () => {
    const res = await request('/sessions', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://aura-labs.ai',
        'Access-Control-Request-Method': 'DELETE',
      },
    });

    const allowedMethods = res.headers.get('access-control-allow-methods') || '';
    // DELETE should not be allowed on /sessions
    assert.ok(
      !allowedMethods.includes('DELETE') || res.status === 405,
      'Should restrict dangerous methods'
    );
  });
});

// =============================================================================
// MEDIUM: Information Disclosure
// =============================================================================

describe('Information Disclosure Prevention', () => {
  test('should not expose stack traces in errors', async () => {
    const res = await request('/sessions/invalid');

    assert.ok(
      !res.text.includes('at ') && !res.text.includes('.js:'),
      'Should not expose stack traces'
    );
  });

  test('should not expose database errors', async () => {
    const res = await request(`/sessions/${fixtures.sqlInjection.basic}`);

    assert.ok(
      !res.text.toLowerCase().includes('postgres') &&
      !res.text.toLowerCase().includes('sql') &&
      !res.text.toLowerCase().includes('syntax error'),
      'Should not expose database errors'
    );
  });

  test('should not expose internal paths', async () => {
    const res = await request('/nonexistent');

    assert.ok(
      !res.text.includes('/usr/') &&
      !res.text.includes('/home/') &&
      !res.text.includes('node_modules'),
      'Should not expose internal paths'
    );
  });

  test('should not expose version numbers in errors', async () => {
    const res = await request('/error');

    assert.ok(
      !res.text.includes('fastify') &&
      !res.text.includes('node'),
      'Should not expose software versions'
    );
  });
});

// =============================================================================
// MEDIUM: Session Security
// =============================================================================

describe('Session Security', () => {
  test('should enforce session expiration', async () => {
    // Create a session, then check it respects expiration
    // This requires checking that expired sessions return appropriate errors
    const expiredSessionId = 'expired-session-id';
    const res = await request(`/sessions/${expiredSessionId}`);

    // Should either be 404 or 410 Gone for expired sessions
    assert.ok(
      [404, 410].includes(res.status),
      'Should not return data for expired sessions'
    );
  });

  test('should prevent session hijacking via ID guessing', async () => {
    // UUIDs should be cryptographically random
    // This is more of a design verification
    const res = await request('/sessions', {
      method: 'POST',
      body: fixtures.validIntent(),
    });

    if (res.json?.sessionId) {
      assert.ok(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(res.json.sessionId),
        'Session IDs should be valid UUIDs'
      );
    }
  });
});

// =============================================================================
// Run all tests
// =============================================================================

console.log('\n🔐 Running Security Tests...\n');
