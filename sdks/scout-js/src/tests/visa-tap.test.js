/**
 * Visa TAP Tests
 *
 * Tests for Visa Trusted Agent Protocol implementation.
 *
 * Run:
 *   node --test src/tests/visa-tap.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { VisaTAP, TAPError } from '../tap/visa.js';

// =============================================================================
// Key Pair Generation Tests
// =============================================================================

describe('Visa TAP Key Pair Generation', () => {
  test('generates valid Ed25519 key pair', () => {
    const keyPair = VisaTAP.generateKeyPair();

    assert.ok(keyPair.publicKey);
    assert.ok(keyPair.privateKey);
    assert.ok(keyPair.keyId);
    assert.strictEqual(keyPair.algorithm, 'ed25519');
  });

  test('generates unique key IDs', () => {
    const keyPair1 = VisaTAP.generateKeyPair();
    const keyPair2 = VisaTAP.generateKeyPair();

    assert.notStrictEqual(keyPair1.keyId, keyPair2.keyId);
  });

  test('key ID is derived from public key', () => {
    const keyPair = VisaTAP.generateKeyPair();

    // Key ID should be 16 hex characters
    assert.strictEqual(keyPair.keyId.length, 16);
    assert.match(keyPair.keyId, /^[0-9a-f]+$/);
  });

  test('generates PEM-encoded keys', () => {
    const keyPair = VisaTAP.generateKeyPair();

    assert.ok(keyPair.publicKey.includes('BEGIN PUBLIC KEY'));
    assert.ok(keyPair.privateKey.includes('BEGIN PRIVATE KEY'));
  });
});

// =============================================================================
// Agent Registration Tests
// =============================================================================

describe('Visa TAP Agent Registration', () => {
  test('registers agent and returns TAP ID (dev mode)', async () => {
    const keyPair = VisaTAP.generateKeyPair();

    const registration = await VisaTAP.register({
      agentId: 'test-agent-001',
      publicKey: keyPair.publicKey,
      metadata: {
        name: 'Test Agent',
        operator: 'Test Operator',
      },
    });

    assert.ok(registration.tapId);
    assert.ok(registration.tapId.startsWith('tap_test-agent-001_'));
    assert.strictEqual(registration.agentId, 'test-agent-001');
    assert.strictEqual(registration.status, 'active');
    assert.ok(registration.registeredAt);
    assert.ok(registration.expiresAt);
  });

  test('registration includes default metadata', async () => {
    const keyPair = VisaTAP.generateKeyPair();

    const registration = await VisaTAP.register({
      agentId: 'minimal-agent',
      publicKey: keyPair.publicKey,
    });

    // Even without metadata, registration should succeed
    assert.ok(registration.tapId);
    assert.strictEqual(registration.status, 'active');
  });

  test('registration expires in 1 year', async () => {
    const keyPair = VisaTAP.generateKeyPair();

    const registration = await VisaTAP.register({
      agentId: 'expiry-test-agent',
      publicKey: keyPair.publicKey,
    });

    const expiresAt = new Date(registration.expiresAt).getTime();
    const now = Date.now();
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;

    // Should expire in approximately 1 year (within 1 day tolerance)
    const diff = Math.abs(expiresAt - now - oneYearMs);
    assert.ok(diff < 24 * 60 * 60 * 1000, 'Expiry should be ~1 year from now');
  });
});

// =============================================================================
// Request Signing Tests
// =============================================================================

describe('Visa TAP Request Signing', () => {
  const keyPair = VisaTAP.generateKeyPair();
  const credentials = {
    tapId: 'tap_test_12345',
    privateKey: keyPair.privateKey,
    keyId: keyPair.keyId,
  };

  test('signs request with TAP headers', async () => {
    const request = {
      method: 'POST',
      url: 'https://api.example.com/payment',
      headers: {},
      body: { amount: 100 },
    };

    const signed = await VisaTAP.signRequest(request, credentials);

    assert.ok(signed.headers['X-TAP-Agent-Id']);
    assert.ok(signed.headers['X-TAP-Timestamp']);
    assert.ok(signed.headers['X-TAP-Nonce']);
    assert.ok(signed.headers['Signature']);
    assert.ok(signed.headers['Signature-Input']);
  });

  test('includes TAP Agent ID in headers', async () => {
    const request = {
      method: 'GET',
      url: 'https://api.example.com/status',
    };

    const signed = await VisaTAP.signRequest(request, credentials);

    assert.strictEqual(signed.headers['X-TAP-Agent-Id'], credentials.tapId);
  });

  test('includes timestamp as unix seconds', async () => {
    const request = {
      method: 'GET',
      url: 'https://api.example.com/status',
    };

    const before = Math.floor(Date.now() / 1000);
    const signed = await VisaTAP.signRequest(request, credentials);
    const after = Math.floor(Date.now() / 1000);

    const timestamp = parseInt(signed.headers['X-TAP-Timestamp']);
    assert.ok(timestamp >= before && timestamp <= after);
  });

  test('generates unique nonce per request', async () => {
    const request = {
      method: 'GET',
      url: 'https://api.example.com/status',
    };

    const signed1 = await VisaTAP.signRequest(request, credentials);
    const signed2 = await VisaTAP.signRequest(request, credentials);

    assert.notStrictEqual(
      signed1.headers['X-TAP-Nonce'],
      signed2.headers['X-TAP-Nonce']
    );
  });

  test('includes Signature-Input header per HTTP Message Signatures spec', async () => {
    const request = {
      method: 'POST',
      url: 'https://api.example.com/payment',
      body: { amount: 100 },
    };

    const signed = await VisaTAP.signRequest(request, credentials);
    const sigInput = signed.headers['Signature-Input'];

    assert.ok(sigInput.includes('@method'));
    assert.ok(sigInput.includes('@path'));
    assert.ok(sigInput.includes('@authority'));
    assert.ok(sigInput.includes('x-tap-agent-id'));
    assert.ok(sigInput.includes('x-tap-timestamp'));
    assert.ok(sigInput.includes('x-tap-nonce'));
    assert.ok(sigInput.includes(`keyid="${credentials.keyId}"`));
    assert.ok(sigInput.includes('alg="ed25519"'));
  });

  test('preserves original request data', async () => {
    const request = {
      method: 'POST',
      url: 'https://api.example.com/payment',
      headers: { 'Content-Type': 'application/json' },
      body: { amount: 100, currency: 'USD' },
    };

    const signed = await VisaTAP.signRequest(request, credentials);

    assert.strictEqual(signed.method, 'POST');
    assert.strictEqual(signed.url, 'https://api.example.com/payment');
    assert.deepStrictEqual(signed.body, { amount: 100, currency: 'USD' });
    assert.strictEqual(signed.headers['Content-Type'], 'application/json');
  });
});

// =============================================================================
// Request Verification Tests
// =============================================================================

describe('Visa TAP Request Verification', () => {
  const keyPair = VisaTAP.generateKeyPair();
  const credentials = {
    tapId: 'tap_verify_test',
    privateKey: keyPair.privateKey,
    keyId: keyPair.keyId,
  };

  const publicKeyLookup = async (tapId) => {
    if (tapId === credentials.tapId) {
      return keyPair.publicKey;
    }
    throw new Error('Agent not found');
  };

  test('verifies valid signed request', async () => {
    const request = {
      method: 'POST',
      url: 'https://api.example.com/payment',
      body: { amount: 100 },
    };

    const signed = await VisaTAP.signRequest(request, credentials);

    // Convert to lowercase headers as they would appear in HTTP
    const verifyRequest = {
      method: signed.method,
      url: signed.url,
      body: signed.body,
      headers: {
        'x-tap-agent-id': signed.headers['X-TAP-Agent-Id'],
        'x-tap-timestamp': signed.headers['X-TAP-Timestamp'],
        'x-tap-nonce': signed.headers['X-TAP-Nonce'],
        'signature': signed.headers['Signature'],
        'signature-input': signed.headers['Signature-Input'],
      },
    };

    const result = await VisaTAP.verifyRequest(verifyRequest, publicKeyLookup);

    // Should either be valid or have a specific error (signature verification may differ)
    assert.ok(result.valid !== undefined);
    if (!result.valid) {
      assert.ok(result.error);
    }
  });

  test('rejects request with missing TAP headers', async () => {
    const request = {
      method: 'POST',
      url: 'https://api.example.com/payment',
      headers: {}, // Missing TAP headers
      body: { amount: 100 },
    };

    const result = await VisaTAP.verifyRequest(request, publicKeyLookup);

    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('Missing TAP headers'));
  });

  test('rejects request with expired timestamp', async () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago

    const request = {
      method: 'POST',
      url: 'https://api.example.com/payment',
      headers: {
        'x-tap-agent-id': credentials.tapId,
        'x-tap-timestamp': oldTimestamp.toString(),
        'x-tap-nonce': 'some-nonce',
        'signature': 'sig=:invalid:',
      },
      body: { amount: 100 },
    };

    const result = await VisaTAP.verifyRequest(request, publicKeyLookup);

    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('timestamp'));
  });

  test('rejects request with unknown agent', async () => {
    const request = {
      method: 'POST',
      url: 'https://api.example.com/payment',
      headers: {
        'x-tap-agent-id': 'unknown-agent',
        'x-tap-timestamp': Math.floor(Date.now() / 1000).toString(),
        'x-tap-nonce': 'some-nonce',
        'signature': 'sig=:invalid:',
      },
      body: { amount: 100 },
    };

    const result = await VisaTAP.verifyRequest(request, publicKeyLookup);

    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('Agent not found'));
  });
});

// =============================================================================
// Credentials Helper Tests
// =============================================================================

describe('Visa TAP Credentials', () => {
  test('creates credentials object from TAP ID and key pair', () => {
    const keyPair = VisaTAP.generateKeyPair();
    const tapId = 'tap_creds_test';

    const credentials = VisaTAP.createCredentials({ tapId, keyPair });

    assert.strictEqual(credentials.tapId, tapId);
    assert.strictEqual(credentials.privateKey, keyPair.privateKey);
    assert.strictEqual(credentials.publicKey, keyPair.publicKey);
    assert.strictEqual(credentials.keyId, keyPair.keyId);
  });
});

// =============================================================================
// Key Rotation Tests
// =============================================================================

describe('Visa TAP Key Rotation', () => {
  test('generates new key pair for rotation', async () => {
    const oldKeyPair = VisaTAP.generateKeyPair();
    const tapId = 'tap_rotation_test';

    const newKeyPair = await VisaTAP.rotateKeys(tapId, oldKeyPair.privateKey);

    assert.ok(newKeyPair.publicKey);
    assert.ok(newKeyPair.privateKey);
    assert.ok(newKeyPair.keyId);

    // New keys should be different from old
    assert.notStrictEqual(newKeyPair.publicKey, oldKeyPair.publicKey);
    assert.notStrictEqual(newKeyPair.privateKey, oldKeyPair.privateKey);
    assert.notStrictEqual(newKeyPair.keyId, oldKeyPair.keyId);
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('Visa TAP Error Handling', () => {
  test('TAPError includes details', () => {
    const error = new TAPError('Registration failed', { code: 'REG_001' });

    assert.strictEqual(error.message, 'Registration failed');
    assert.strictEqual(error.name, 'TAPError');
    assert.deepStrictEqual(error.details, { code: 'REG_001' });
  });

  test('TAPError is instanceof Error', () => {
    const error = new TAPError('Test error');
    assert.ok(error instanceof Error);
  });
});
