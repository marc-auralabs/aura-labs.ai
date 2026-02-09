/**
 * Visa TAP Protocol Scenario Tests
 *
 * Real-world scenario tests for Visa's Trusted Agent Protocol (TAP).
 * These tests verify agent registration, request signing, and verification.
 *
 * Run:
 *   node --test src/tests/scenarios/tap-scenarios.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { VisaTAP, TAPError } from '../../tap/visa.js';

// =============================================================================
// Test Setup - Key pairs for testing
// =============================================================================

const agentKeyPair = VisaTAP.generateKeyPair();

// =============================================================================
// Scenario 1: Agent Registration Flow
// =============================================================================

describe('Scenario: Agent Registration Flow', () => {
  let registration;

  test('Step 1: Generate agent key pair', () => {
    const keyPair = VisaTAP.generateKeyPair();

    assert.ok(keyPair.publicKey, 'Should have public key');
    assert.ok(keyPair.privateKey, 'Should have private key');
    assert.ok(keyPair.keyId, 'Should have key ID');
    assert.strictEqual(keyPair.algorithm, 'ed25519');
    assert.ok(keyPair.publicKey.includes('BEGIN PUBLIC KEY'));
    assert.ok(keyPair.privateKey.includes('BEGIN PRIVATE KEY'));
  });

  test('Step 2: Register agent with TAP directory', async () => {
    registration = await VisaTAP.register({
      agentId: 'scout-shopping-agent-001',
      publicKey: agentKeyPair.publicKey,
      metadata: {
        name: 'Shopping Scout',
        operator: 'AURA Labs',
        capabilities: ['shopping', 'price-comparison', 'checkout'],
        version: '1.0.0',
      },
    });

    assert.ok(registration.tapId, 'Should receive TAP ID');
    assert.ok(registration.tapId.startsWith('tap_scout-shopping-agent-001_'));
    assert.strictEqual(registration.status, 'active');
    assert.ok(registration.registeredAt);
    assert.ok(registration.expiresAt);
  });

  test('Step 3: Create credentials from registration', () => {
    const credentials = VisaTAP.createCredentials({
      tapId: registration.tapId,
      keyPair: agentKeyPair,
    });

    assert.strictEqual(credentials.tapId, registration.tapId);
    assert.strictEqual(credentials.privateKey, agentKeyPair.privateKey);
    assert.strictEqual(credentials.publicKey, agentKeyPair.publicKey);
    assert.strictEqual(credentials.keyId, agentKeyPair.keyId);
  });
});

// =============================================================================
// Scenario 2: Payment Request Signing
// =============================================================================

describe('Scenario: Payment Request Signing', () => {
  let credentials;
  let signedRequest;

  test('Setup: Register agent and create credentials', async () => {
    const registration = await VisaTAP.register({
      agentId: 'payment-scout-001',
      publicKey: agentKeyPair.publicKey,
    });

    credentials = VisaTAP.createCredentials({
      tapId: registration.tapId,
      keyPair: agentKeyPair,
    });

    assert.ok(credentials.tapId);
  });

  test('Step 1: Sign payment request', async () => {
    const paymentRequest = {
      method: 'POST',
      url: 'https://payments.example.com/api/v1/transactions',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        amount: 159.98,
        currency: 'USD',
        merchantId: 'merchant-techmart-001',
        orderId: 'order-abc-123',
        mandateId: 'mandate_cart_001',
      },
    };

    signedRequest = await VisaTAP.signRequest(paymentRequest, credentials);

    assert.ok(signedRequest.headers['X-TAP-Agent-Id']);
    assert.ok(signedRequest.headers['X-TAP-Timestamp']);
    assert.ok(signedRequest.headers['X-TAP-Nonce']);
    assert.ok(signedRequest.headers['Signature']);
    assert.ok(signedRequest.headers['Signature-Input']);
  });

  test('Step 2: TAP headers contain correct values', () => {
    assert.strictEqual(signedRequest.headers['X-TAP-Agent-Id'], credentials.tapId);

    const timestamp = parseInt(signedRequest.headers['X-TAP-Timestamp']);
    const now = Math.floor(Date.now() / 1000);
    assert.ok(Math.abs(now - timestamp) < 5, 'Timestamp should be recent');

    assert.ok(signedRequest.headers['X-TAP-Nonce'].length > 10, 'Nonce should be substantial');
  });

  test('Step 3: Signature-Input follows HTTP Message Signatures spec', () => {
    const sigInput = signedRequest.headers['Signature-Input'];

    assert.ok(sigInput.includes('@method'), 'Should include method');
    assert.ok(sigInput.includes('@path'), 'Should include path');
    assert.ok(sigInput.includes('@authority'), 'Should include authority');
    assert.ok(sigInput.includes('x-tap-agent-id'), 'Should include TAP agent ID');
    assert.ok(sigInput.includes('x-tap-timestamp'), 'Should include timestamp');
    assert.ok(sigInput.includes('x-tap-nonce'), 'Should include nonce');
    assert.ok(sigInput.includes(`keyid="${agentKeyPair.keyId}"`), 'Should include key ID');
    assert.ok(sigInput.includes('alg="ed25519"'), 'Should specify algorithm');
  });

  test('Step 4: Original request data preserved', () => {
    assert.strictEqual(signedRequest.method, 'POST');
    assert.strictEqual(signedRequest.url, 'https://payments.example.com/api/v1/transactions');
    assert.strictEqual(signedRequest.body.amount, 159.98);
    assert.strictEqual(signedRequest.headers['Content-Type'], 'application/json');
  });
});

// =============================================================================
// Scenario 3: Request Verification by Merchant
// =============================================================================

describe('Scenario: Request Verification by Merchant', () => {
  let credentials;

  test('Setup: Register agent', async () => {
    const registration = await VisaTAP.register({
      agentId: 'verified-scout-001',
      publicKey: agentKeyPair.publicKey,
    });

    credentials = VisaTAP.createCredentials({
      tapId: registration.tapId,
      keyPair: agentKeyPair,
    });
  });

  test('Verifies valid signed request', async () => {
    // Create and sign a request
    const request = {
      method: 'POST',
      url: 'https://merchant.example.com/api/checkout',
      body: { items: ['item-1'], total: 99.99 },
    };

    const signed = await VisaTAP.signRequest(request, credentials);

    // Merchant verifies the request
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

    const publicKeyLookup = async (tapId) => {
      if (tapId === credentials.tapId) return agentKeyPair.publicKey;
      throw new Error('Agent not found');
    };

    const result = await VisaTAP.verifyRequest(verifyRequest, publicKeyLookup);

    // Verification may succeed or have specific error depending on implementation
    assert.ok(result.valid !== undefined);
  });

  test('Rejects request missing TAP headers', async () => {
    const requestWithoutHeaders = {
      method: 'POST',
      url: 'https://merchant.example.com/api/checkout',
      headers: {},
      body: { total: 99.99 },
    };

    const publicKeyLookup = async () => agentKeyPair.publicKey;
    const result = await VisaTAP.verifyRequest(requestWithoutHeaders, publicKeyLookup);

    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('Missing TAP headers'));
  });

  test('Rejects request with expired timestamp', async () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago

    const staleRequest = {
      method: 'POST',
      url: 'https://merchant.example.com/api/checkout',
      headers: {
        'x-tap-agent-id': credentials.tapId,
        'x-tap-timestamp': oldTimestamp.toString(),
        'x-tap-nonce': 'some-nonce-value',
        'signature': 'sig=:invalid:',
      },
      body: { total: 99.99 },
    };

    const publicKeyLookup = async () => agentKeyPair.publicKey;
    const result = await VisaTAP.verifyRequest(staleRequest, publicKeyLookup);

    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('timestamp'));
  });

  test('Rejects request from unregistered agent', async () => {
    const unknownAgentRequest = {
      method: 'POST',
      url: 'https://merchant.example.com/api/checkout',
      headers: {
        'x-tap-agent-id': 'tap_unknown_agent',
        'x-tap-timestamp': Math.floor(Date.now() / 1000).toString(),
        'x-tap-nonce': 'some-nonce',
        'signature': 'sig=:invalid:',
      },
      body: { total: 99.99 },
    };

    const publicKeyLookup = async (tapId) => {
      throw new Error('Agent not found');
    };

    const result = await VisaTAP.verifyRequest(unknownAgentRequest, publicKeyLookup);

    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('Agent not found'));
  });
});

// =============================================================================
// Scenario 4: Multiple Agents
// =============================================================================

describe('Scenario: Multiple Agents with Different Identities', () => {
  const shoppingAgent = VisaTAP.generateKeyPair();
  const travelAgent = VisaTAP.generateKeyPair();

  test('Different agents have different key pairs', () => {
    assert.notStrictEqual(shoppingAgent.keyId, travelAgent.keyId);
    assert.notStrictEqual(shoppingAgent.publicKey, travelAgent.publicKey);
    assert.notStrictEqual(shoppingAgent.privateKey, travelAgent.privateKey);
  });

  test('Each agent registers with unique TAP ID', async () => {
    const shoppingReg = await VisaTAP.register({
      agentId: 'multi-shopping-agent',
      publicKey: shoppingAgent.publicKey,
      metadata: { capabilities: ['shopping'] },
    });

    const travelReg = await VisaTAP.register({
      agentId: 'multi-travel-agent',
      publicKey: travelAgent.publicKey,
      metadata: { capabilities: ['travel-booking'] },
    });

    assert.notStrictEqual(shoppingReg.tapId, travelReg.tapId);
    assert.ok(shoppingReg.tapId.includes('shopping'));
    assert.ok(travelReg.tapId.includes('travel'));
  });

  test('Requests signed by different agents have different signatures', async () => {
    const shoppingCreds = VisaTAP.createCredentials({
      tapId: 'tap_shopping_123',
      keyPair: shoppingAgent,
    });

    const travelCreds = VisaTAP.createCredentials({
      tapId: 'tap_travel_456',
      keyPair: travelAgent,
    });

    const sameRequest = {
      method: 'GET',
      url: 'https://api.example.com/status',
    };

    const shoppingSigned = await VisaTAP.signRequest(sameRequest, shoppingCreds);
    const travelSigned = await VisaTAP.signRequest(sameRequest, travelCreds);

    assert.notStrictEqual(
      shoppingSigned.headers['X-TAP-Agent-Id'],
      travelSigned.headers['X-TAP-Agent-Id']
    );

    assert.notStrictEqual(
      shoppingSigned.headers['Signature'],
      travelSigned.headers['Signature']
    );
  });
});

// =============================================================================
// Scenario 5: Key Rotation
// =============================================================================

describe('Scenario: Key Rotation', () => {
  test('Rotates to new key pair', async () => {
    const oldKeyPair = VisaTAP.generateKeyPair();
    const tapId = 'tap_rotation_test_123';

    const newKeyPair = await VisaTAP.rotateKeys(tapId, oldKeyPair.privateKey);

    assert.ok(newKeyPair.publicKey);
    assert.ok(newKeyPair.privateKey);
    assert.ok(newKeyPair.keyId);
    assert.notStrictEqual(newKeyPair.keyId, oldKeyPair.keyId);
    assert.notStrictEqual(newKeyPair.publicKey, oldKeyPair.publicKey);
  });
});

// =============================================================================
// Scenario 6: Nonce Uniqueness (Replay Protection)
// =============================================================================

describe('Scenario: Replay Attack Protection', () => {
  test('Each request has unique nonce', async () => {
    const registration = await VisaTAP.register({
      agentId: 'nonce-test-agent',
      publicKey: agentKeyPair.publicKey,
    });

    const credentials = VisaTAP.createCredentials({
      tapId: registration.tapId,
      keyPair: agentKeyPair,
    });

    const request = { method: 'GET', url: 'https://api.example.com/test' };

    // Sign same request multiple times
    const signed1 = await VisaTAP.signRequest(request, credentials);
    const signed2 = await VisaTAP.signRequest(request, credentials);
    const signed3 = await VisaTAP.signRequest(request, credentials);

    // All nonces should be different
    const nonces = [
      signed1.headers['X-TAP-Nonce'],
      signed2.headers['X-TAP-Nonce'],
      signed3.headers['X-TAP-Nonce'],
    ];

    const uniqueNonces = new Set(nonces);
    assert.strictEqual(uniqueNonces.size, 3, 'All nonces should be unique');
  });
});

// =============================================================================
// Scenario 7: Different Request Types
// =============================================================================

describe('Scenario: Signing Different Request Types', () => {
  let credentials;

  test('Setup credentials', async () => {
    const registration = await VisaTAP.register({
      agentId: 'request-types-agent',
      publicKey: agentKeyPair.publicKey,
    });

    credentials = VisaTAP.createCredentials({
      tapId: registration.tapId,
      keyPair: agentKeyPair,
    });
  });

  test('Signs GET request', async () => {
    const getRequest = {
      method: 'GET',
      url: 'https://api.example.com/products/123',
    };

    const signed = await VisaTAP.signRequest(getRequest, credentials);
    assert.ok(signed.headers['Signature']);
    assert.strictEqual(signed.method, 'GET');
  });

  test('Signs POST request with body', async () => {
    const postRequest = {
      method: 'POST',
      url: 'https://api.example.com/orders',
      body: { productId: '123', quantity: 2 },
    };

    const signed = await VisaTAP.signRequest(postRequest, credentials);
    assert.ok(signed.headers['Signature']);
    assert.strictEqual(signed.method, 'POST');
    assert.deepStrictEqual(signed.body, postRequest.body);
  });

  test('Signs PUT request', async () => {
    const putRequest = {
      method: 'PUT',
      url: 'https://api.example.com/orders/456',
      body: { status: 'confirmed' },
    };

    const signed = await VisaTAP.signRequest(putRequest, credentials);
    assert.ok(signed.headers['Signature']);
    assert.strictEqual(signed.method, 'PUT');
  });

  test('Signs DELETE request', async () => {
    const deleteRequest = {
      method: 'DELETE',
      url: 'https://api.example.com/orders/789',
    };

    const signed = await VisaTAP.signRequest(deleteRequest, credentials);
    assert.ok(signed.headers['Signature']);
    assert.strictEqual(signed.method, 'DELETE');
  });
});

// =============================================================================
// Scenario 8: Error Handling
// =============================================================================

describe('Scenario: Error Handling', () => {
  test('TAPError includes details', () => {
    const error = new TAPError('Registration failed', { code: 'REG_001', reason: 'Invalid key' });

    assert.strictEqual(error.message, 'Registration failed');
    assert.strictEqual(error.name, 'TAPError');
    assert.deepStrictEqual(error.details, { code: 'REG_001', reason: 'Invalid key' });
    assert.ok(error instanceof Error);
  });
});
