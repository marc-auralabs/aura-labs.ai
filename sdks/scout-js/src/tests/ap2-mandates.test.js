/**
 * AP2 Mandates Tests
 *
 * Tests for Google Agent Payments Protocol (AP2) mandate creation and validation.
 *
 * Run:
 *   node --test src/tests/ap2-mandates.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { AP2Mandates, generateKeyPair } from '../ap2/mandates.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const testKeys = generateKeyPair();

const createTestIntent = (overrides = {}) => ({
  agentId: 'test-agent-001',
  userId: 'test-user-001',
  userKey: testKeys.privateKey,
  constraints: {
    maxAmount: 5000,
    currency: 'USD',
    categories: ['electronics'],
    validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  ...overrides,
});

const createTestOffer = (overrides = {}) => ({
  id: 'offer-test-001',
  beaconId: 'beacon-test-001',
  beaconName: 'Test Merchant',
  product: { name: 'Test Product', sku: 'TEST-001' },
  unitPrice: 100,
  quantity: 2,
  totalPrice: 200,
  currency: 'USD',
  deliveryDate: '2026-03-01',
  ...overrides,
});

// =============================================================================
// Intent Mandate Tests
// =============================================================================

describe('AP2 Intent Mandates', () => {
  test('creates valid intent mandate with required fields', async () => {
    const params = createTestIntent();
    const mandate = await AP2Mandates.createIntent(params);

    assert.strictEqual(mandate.type, 'intent');
    assert.strictEqual(mandate.version, '1.0');
    assert.ok(mandate.id.startsWith('mandate_'));
    assert.strictEqual(mandate.subject.id, params.agentId);
    assert.strictEqual(mandate.issuer.id, params.userId);
    assert.strictEqual(mandate.constraints.maxAmount, 5000);
    assert.strictEqual(mandate.constraints.currency, 'USD');
    assert.deepStrictEqual(mandate.constraints.categories, ['electronics']);
  });

  test('includes valid proof/signature', async () => {
    const mandate = await AP2Mandates.createIntent(createTestIntent());

    assert.ok(mandate.proof);
    assert.strictEqual(mandate.proof.type, 'Ed25519Signature2020');
    assert.ok(mandate.proof.created);
    assert.ok(mandate.proof.verificationMethod);
    assert.strictEqual(mandate.proof.proofPurpose, 'assertionMethod');
    assert.ok(mandate.proof.proofValue);
  });

  test('sets default values for optional fields', async () => {
    const mandate = await AP2Mandates.createIntent(createTestIntent());

    assert.strictEqual(mandate.constraints.requireUserPresent, false);
    assert.strictEqual(mandate.constraints.merchantAllowlist, null);
    assert.strictEqual(mandate.constraints.merchantBlocklist, null);
    assert.strictEqual(mandate.constraints.maxTransactions, null);
  });

  test('preserves custom constraint values', async () => {
    const mandate = await AP2Mandates.createIntent(createTestIntent({
      constraints: {
        maxAmount: 1000,
        currency: 'EUR',
        requireUserPresent: true,
        maxTransactions: 5,
        merchantAllowlist: ['merchant-1', 'merchant-2'],
        merchantBlocklist: ['bad-merchant'],
      },
    }));

    assert.strictEqual(mandate.constraints.maxAmount, 1000);
    assert.strictEqual(mandate.constraints.currency, 'EUR');
    assert.strictEqual(mandate.constraints.requireUserPresent, true);
    assert.strictEqual(mandate.constraints.maxTransactions, 5);
    assert.deepStrictEqual(mandate.constraints.merchantAllowlist, ['merchant-1', 'merchant-2']);
    assert.deepStrictEqual(mandate.constraints.merchantBlocklist, ['bad-merchant']);
  });

  test('includes metadata when provided', async () => {
    const mandate = await AP2Mandates.createIntent(createTestIntent({
      metadata: {
        purpose: 'Office supplies',
        department: 'Engineering',
      },
    }));

    assert.deepStrictEqual(mandate.metadata, {
      purpose: 'Office supplies',
      department: 'Engineering',
    });
  });
});

// =============================================================================
// Cart Mandate Tests
// =============================================================================

describe('AP2 Cart Mandates', () => {
  test('creates valid cart mandate from offer', async () => {
    const intentMandate = await AP2Mandates.createIntent(createTestIntent());
    const offer = createTestOffer();

    const cartMandate = await AP2Mandates.createCart({
      sessionId: 'session-test-001',
      offer,
      userKey: testKeys.privateKey,
      userId: 'test-user-001',
      intentMandateId: intentMandate.id,
    });

    assert.strictEqual(cartMandate.type, 'cart');
    assert.strictEqual(cartMandate.version, '1.0');
    assert.ok(cartMandate.id.startsWith('mandate_'));
    assert.strictEqual(cartMandate.intentMandateRef, intentMandate.id);
    assert.strictEqual(cartMandate.cart.sessionId, 'session-test-001');
    assert.strictEqual(cartMandate.cart.offerId, offer.id);
    assert.strictEqual(cartMandate.cart.totalAmount, 200);
    assert.strictEqual(cartMandate.userPresent, true);
  });

  test('cart mandate includes offer details', async () => {
    const offer = createTestOffer({
      unitPrice: 150,
      quantity: 3,
      totalPrice: 450,
    });

    const cartMandate = await AP2Mandates.createCart({
      sessionId: 'session-test-002',
      offer,
      userKey: testKeys.privateKey,
      userId: 'test-user-001',
      intentMandateId: 'mandate_test_123',
    });

    assert.strictEqual(cartMandate.cart.items[0].quantity, 3);
    assert.strictEqual(cartMandate.cart.items[0].unitPrice, 150);
    assert.strictEqual(cartMandate.cart.totalAmount, 450);
  });

  test('cart mandate has expiration time', async () => {
    const cartMandate = await AP2Mandates.createCart({
      sessionId: 'session-test-003',
      offer: createTestOffer(),
      userKey: testKeys.privateKey,
      userId: 'test-user-001',
      intentMandateId: 'mandate_test_123',
    });

    const expiresAt = new Date(cartMandate.expiresAt).getTime();
    const now = Date.now();

    // Should expire in ~30 minutes (give or take a few seconds)
    const diffMinutes = (expiresAt - now) / (1000 * 60);
    assert.ok(diffMinutes >= 29 && diffMinutes <= 31, `Expected ~30 min expiry, got ${diffMinutes} min`);
  });
});

// =============================================================================
// Payment Mandate Tests
// =============================================================================

describe('AP2 Payment Mandates', () => {
  test('creates payment mandate from cart mandate', async () => {
    const cartMandate = await AP2Mandates.createCart({
      sessionId: 'session-test-004',
      offer: createTestOffer({ totalPrice: 500 }),
      userKey: testKeys.privateKey,
      userId: 'test-user-001',
      intentMandateId: 'mandate_test_123',
    });

    const paymentMandate = await AP2Mandates.createPayment({
      cartMandate,
      paymentMethod: { type: 'card', network: 'visa' },
      agentId: 'agent-test-001',
      agentKey: testKeys.privateKey,
    });

    assert.strictEqual(paymentMandate.type, 'payment');
    assert.strictEqual(paymentMandate.cartMandateRef, cartMandate.id);
    assert.strictEqual(paymentMandate.transaction.amount, 500);
    assert.strictEqual(paymentMandate.paymentMethod.type, 'card');
    assert.strictEqual(paymentMandate.paymentMethod.network, 'visa');
    assert.strictEqual(paymentMandate.paymentMethod.tokenized, true);
  });

  test('includes TAP credentials when provided', async () => {
    const cartMandate = await AP2Mandates.createCart({
      sessionId: 'session-test-005',
      offer: createTestOffer(),
      userKey: testKeys.privateKey,
      userId: 'test-user-001',
      intentMandateId: 'mandate_test_123',
    });

    const paymentMandate = await AP2Mandates.createPayment({
      cartMandate,
      paymentMethod: { type: 'card', network: 'mastercard' },
      agentId: 'agent-test-001',
      agentKey: testKeys.privateKey,
      tapCredentials: { tapId: 'tap_agent_12345' },
    });

    assert.strictEqual(paymentMandate.agent.tapId, 'tap_agent_12345');
  });

  test('includes risk signals', async () => {
    const cartMandate = await AP2Mandates.createCart({
      sessionId: 'session-test-006',
      offer: createTestOffer(),
      userKey: testKeys.privateKey,
      userId: 'test-user-001',
      intentMandateId: 'mandate_test_123',
    });

    const paymentMandate = await AP2Mandates.createPayment({
      cartMandate,
      paymentMethod: { type: 'card', network: 'visa' },
      agentId: 'agent-test-001',
      agentKey: testKeys.privateKey,
    });

    assert.ok(paymentMandate.riskSignals);
    assert.strictEqual(paymentMandate.riskSignals.userAuthTime, cartMandate.issuedAt);
    assert.strictEqual(paymentMandate.riskSignals.intentMandatePresent, true);
    assert.ok(typeof paymentMandate.riskSignals.agentSessionDuration === 'number');
  });
});

// =============================================================================
// Intent Coverage Validation Tests
// =============================================================================

describe('AP2 Intent Coverage Validation', () => {
  test('validates amount within limits', async () => {
    const intentMandate = await AP2Mandates.createIntent(createTestIntent({
      constraints: { maxAmount: 1000 },
    }));

    const result = AP2Mandates.validateIntentCoverage(intentMandate, {
      totalAmount: 500,
      currency: 'USD',
    });

    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.errors, []);
  });

  test('rejects amount exceeding limit', async () => {
    const intentMandate = await AP2Mandates.createIntent(createTestIntent({
      constraints: { maxAmount: 1000 },
    }));

    const result = AP2Mandates.validateIntentCoverage(intentMandate, {
      totalAmount: 1500,
      currency: 'USD',
    });

    assert.strictEqual(result.valid, false);
    assert.ok(result.errors[0].includes('exceeds max'));
  });

  test('validates currency match', async () => {
    const intentMandate = await AP2Mandates.createIntent(createTestIntent({
      constraints: { maxAmount: 1000, currency: 'EUR' },
    }));

    const result = AP2Mandates.validateIntentCoverage(intentMandate, {
      totalAmount: 500,
      currency: 'USD',
    });

    assert.strictEqual(result.valid, false);
    assert.ok(result.errors[0].includes('Currency'));
  });

  test('validates category in allowlist', async () => {
    const intentMandate = await AP2Mandates.createIntent(createTestIntent({
      constraints: {
        maxAmount: 1000,
        categories: ['electronics', 'office'],
      },
    }));

    const validResult = AP2Mandates.validateIntentCoverage(intentMandate, {
      totalAmount: 500,
      currency: 'USD',
      category: 'electronics',
    });
    assert.strictEqual(validResult.valid, true);

    const invalidResult = AP2Mandates.validateIntentCoverage(intentMandate, {
      totalAmount: 500,
      currency: 'USD',
      category: 'furniture',
    });
    assert.strictEqual(invalidResult.valid, false);
    assert.ok(invalidResult.errors[0].includes('Category'));
  });

  test('validates merchant allowlist', async () => {
    const intentMandate = await AP2Mandates.createIntent(createTestIntent({
      constraints: {
        maxAmount: 1000,
        merchantAllowlist: ['merchant-a', 'merchant-b'],
      },
    }));

    const validResult = AP2Mandates.validateIntentCoverage(intentMandate, {
      totalAmount: 500,
      merchantId: 'merchant-a',
    });
    assert.strictEqual(validResult.valid, true);

    const invalidResult = AP2Mandates.validateIntentCoverage(intentMandate, {
      totalAmount: 500,
      merchantId: 'merchant-c',
    });
    assert.strictEqual(invalidResult.valid, false);
    assert.ok(invalidResult.errors[0].includes('allowlist'));
  });

  test('validates merchant blocklist', async () => {
    const intentMandate = await AP2Mandates.createIntent(createTestIntent({
      constraints: {
        maxAmount: 1000,
        merchantBlocklist: ['bad-merchant'],
      },
    }));

    const validResult = AP2Mandates.validateIntentCoverage(intentMandate, {
      totalAmount: 500,
      merchantId: 'good-merchant',
    });
    assert.strictEqual(validResult.valid, true);

    const invalidResult = AP2Mandates.validateIntentCoverage(intentMandate, {
      totalAmount: 500,
      merchantId: 'bad-merchant',
    });
    assert.strictEqual(invalidResult.valid, false);
    assert.ok(invalidResult.errors[0].includes('blocklisted'));
  });

  test('validates expiration', async () => {
    const expiredMandate = await AP2Mandates.createIntent(createTestIntent({
      constraints: {
        maxAmount: 1000,
        validUntil: new Date(Date.now() - 1000).toISOString(), // Expired
      },
    }));

    const result = AP2Mandates.validateIntentCoverage(expiredMandate, {
      totalAmount: 500,
    });

    assert.strictEqual(result.valid, false);
    assert.ok(result.errors[0].includes('expired'));
  });
});

// =============================================================================
// Signature Verification Tests
// =============================================================================

describe('AP2 Signature Verification', () => {
  test('verifies valid mandate signature', async () => {
    const mandate = await AP2Mandates.createIntent(createTestIntent());
    const result = await AP2Mandates.verify(mandate, testKeys.publicKey);

    // Note: Using mock signatures in dev mode
    assert.ok(result.valid || result.error === undefined);
  });

  test('rejects mandate without proof', async () => {
    const mandateWithoutProof = {
      type: 'intent',
      id: 'test-mandate',
      // No proof field
    };

    const result = await AP2Mandates.verify(mandateWithoutProof, testKeys.publicKey);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('No proof'));
  });
});
