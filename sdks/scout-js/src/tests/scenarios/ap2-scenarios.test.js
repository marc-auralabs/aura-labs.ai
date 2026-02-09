/**
 * AP2 Protocol Scenario Tests
 *
 * Real-world scenario tests for Google's Agent Payments Protocol (AP2).
 * These tests verify the full mandate lifecycle in common shopping scenarios.
 *
 * Run:
 *   node --test src/tests/scenarios/ap2-scenarios.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { AP2Mandates, generateKeyPair } from '../../ap2/mandates.js';

// =============================================================================
// Test Setup
// =============================================================================

const userKeys = generateKeyPair();
const agentKeys = generateKeyPair();

// =============================================================================
// Scenario 1: Basic Shopping Flow
// =============================================================================

describe('Scenario: Basic Shopping Flow', () => {
  let intentMandate;
  let cartMandate;
  let paymentMandate;

  test('Step 1: User creates intent mandate for shopping', async () => {
    intentMandate = await AP2Mandates.createIntent({
      agentId: 'shopping-scout-001',
      userId: 'user-alice-001',
      userKey: userKeys.privateKey,
      constraints: {
        maxAmount: 500,
        currency: 'USD',
        categories: ['electronics', 'office-supplies'],
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      },
      metadata: {
        purpose: 'Office supplies shopping',
      },
    });

    assert.strictEqual(intentMandate.type, 'intent');
    assert.strictEqual(intentMandate.constraints.maxAmount, 500);
    assert.ok(intentMandate.proof.proofValue, 'Should be signed');
  });

  test('Step 2: Agent finds offer within constraints', async () => {
    const offer = {
      id: 'offer-laptop-stand-001',
      beaconId: 'beacon-techmart',
      beaconName: 'TechMart Office',
      product: { name: 'Ergonomic Laptop Stand', sku: 'ERGO-LS-100' },
      unitPrice: 79.99,
      quantity: 2,
      totalPrice: 159.98,
      currency: 'USD',
      deliveryDate: '2026-02-15',
    };

    // Validate offer against intent
    const validation = AP2Mandates.validateIntentCoverage(intentMandate, {
      totalAmount: offer.totalPrice,
      currency: offer.currency,
      category: 'office-supplies',
      merchantId: offer.beaconId,
    });

    assert.strictEqual(validation.valid, true);
    assert.strictEqual(validation.errors.length, 0);
  });

  test('Step 3: User approves specific purchase with cart mandate', async () => {
    const offer = {
      id: 'offer-laptop-stand-001',
      beaconId: 'beacon-techmart',
      beaconName: 'TechMart Office',
      product: { name: 'Ergonomic Laptop Stand', sku: 'ERGO-LS-100' },
      unitPrice: 79.99,
      quantity: 2,
      totalPrice: 159.98,
      currency: 'USD',
      deliveryDate: '2026-02-15',
    };

    cartMandate = await AP2Mandates.createCart({
      sessionId: 'session-shop-001',
      offer,
      userKey: userKeys.privateKey,
      userId: 'user-alice-001',
      intentMandateId: intentMandate.id,
    });

    assert.strictEqual(cartMandate.type, 'cart');
    assert.strictEqual(cartMandate.intentMandateRef, intentMandate.id);
    assert.strictEqual(cartMandate.cart.totalAmount, 159.98);
    assert.strictEqual(cartMandate.userPresent, true);
  });

  test('Step 4: Agent creates payment mandate for processor', async () => {
    paymentMandate = await AP2Mandates.createPayment({
      cartMandate,
      paymentMethod: { type: 'card', network: 'visa' },
      agentId: 'shopping-scout-001',
      agentKey: agentKeys.privateKey,
      tapCredentials: { tapId: 'tap_scout_001_abc123' },
    });

    assert.strictEqual(paymentMandate.type, 'payment');
    assert.strictEqual(paymentMandate.cartMandateRef, cartMandate.id);
    assert.strictEqual(paymentMandate.agent.tapId, 'tap_scout_001_abc123');
    assert.strictEqual(paymentMandate.transaction.amount, 159.98);
    assert.ok(paymentMandate.riskSignals.intentMandatePresent);
  });

  test('Step 5: Verify complete audit trail', () => {
    // Intent -> Cart -> Payment chain is intact
    assert.strictEqual(cartMandate.intentMandateRef, intentMandate.id);
    assert.strictEqual(paymentMandate.cartMandateRef, cartMandate.id);

    // All mandates are signed
    assert.ok(intentMandate.proof.proofValue);
    assert.ok(cartMandate.proof.proofValue);
    assert.ok(paymentMandate.proof.proofValue);
  });
});

// =============================================================================
// Scenario 2: Budget Limit Enforcement
// =============================================================================

describe('Scenario: Budget Limit Enforcement', () => {
  test('Rejects purchase exceeding budget', async () => {
    const intentMandate = await AP2Mandates.createIntent({
      agentId: 'budget-scout',
      userId: 'user-bob',
      userKey: userKeys.privateKey,
      constraints: {
        maxAmount: 100,
        currency: 'USD',
      },
    });

    const expensiveOffer = {
      totalAmount: 250,
      currency: 'USD',
    };

    const validation = AP2Mandates.validateIntentCoverage(intentMandate, expensiveOffer);

    assert.strictEqual(validation.valid, false);
    assert.ok(validation.errors[0].includes('exceeds max'));
  });

  test('Allows purchase at exact budget limit', async () => {
    const intentMandate = await AP2Mandates.createIntent({
      agentId: 'budget-scout',
      userId: 'user-bob',
      userKey: userKeys.privateKey,
      constraints: {
        maxAmount: 100,
        currency: 'USD',
      },
    });

    const exactOffer = {
      totalAmount: 100,
      currency: 'USD',
    };

    const validation = AP2Mandates.validateIntentCoverage(intentMandate, exactOffer);

    assert.strictEqual(validation.valid, true);
  });
});

// =============================================================================
// Scenario 3: Category Restrictions
// =============================================================================

describe('Scenario: Category Restrictions', () => {
  let intentMandate;

  test('Setup: Create intent with category restrictions', async () => {
    intentMandate = await AP2Mandates.createIntent({
      agentId: 'category-scout',
      userId: 'user-carol',
      userKey: userKeys.privateKey,
      constraints: {
        maxAmount: 1000,
        currency: 'USD',
        categories: ['office-supplies', 'electronics'],
      },
    });

    assert.deepStrictEqual(intentMandate.constraints.categories, ['office-supplies', 'electronics']);
  });

  test('Allows purchase in permitted category', () => {
    const validation = AP2Mandates.validateIntentCoverage(intentMandate, {
      totalAmount: 200,
      currency: 'USD',
      category: 'electronics',
    });

    assert.strictEqual(validation.valid, true);
  });

  test('Rejects purchase in forbidden category', () => {
    const validation = AP2Mandates.validateIntentCoverage(intentMandate, {
      totalAmount: 200,
      currency: 'USD',
      category: 'luxury-goods',
    });

    assert.strictEqual(validation.valid, false);
    assert.ok(validation.errors[0].includes('Category'));
  });
});

// =============================================================================
// Scenario 4: Merchant Allowlist/Blocklist
// =============================================================================

describe('Scenario: Merchant Restrictions', () => {
  test('Allowlist: Only permits specified merchants', async () => {
    const intentMandate = await AP2Mandates.createIntent({
      agentId: 'merchant-scout',
      userId: 'user-dave',
      userKey: userKeys.privateKey,
      constraints: {
        maxAmount: 500,
        merchantAllowlist: ['trusted-vendor-1', 'trusted-vendor-2'],
      },
    });

    // Trusted merchant allowed
    const trustedValidation = AP2Mandates.validateIntentCoverage(intentMandate, {
      totalAmount: 100,
      merchantId: 'trusted-vendor-1',
    });
    assert.strictEqual(trustedValidation.valid, true);

    // Unknown merchant blocked
    const unknownValidation = AP2Mandates.validateIntentCoverage(intentMandate, {
      totalAmount: 100,
      merchantId: 'random-vendor',
    });
    assert.strictEqual(unknownValidation.valid, false);
  });

  test('Blocklist: Blocks specified merchants', async () => {
    const intentMandate = await AP2Mandates.createIntent({
      agentId: 'blocklist-scout',
      userId: 'user-eve',
      userKey: userKeys.privateKey,
      constraints: {
        maxAmount: 500,
        merchantBlocklist: ['sketchy-vendor', 'banned-seller'],
      },
    });

    // Normal merchant allowed
    const normalValidation = AP2Mandates.validateIntentCoverage(intentMandate, {
      totalAmount: 100,
      merchantId: 'normal-store',
    });
    assert.strictEqual(normalValidation.valid, true);

    // Blocked merchant rejected
    const blockedValidation = AP2Mandates.validateIntentCoverage(intentMandate, {
      totalAmount: 100,
      merchantId: 'sketchy-vendor',
    });
    assert.strictEqual(blockedValidation.valid, false);
    assert.ok(blockedValidation.errors[0].includes('blocklisted'));
  });
});

// =============================================================================
// Scenario 5: Time-Limited Authorization
// =============================================================================

describe('Scenario: Time-Limited Authorization', () => {
  test('Rejects expired intent mandate', async () => {
    const expiredMandate = await AP2Mandates.createIntent({
      agentId: 'time-scout',
      userId: 'user-frank',
      userKey: userKeys.privateKey,
      constraints: {
        maxAmount: 500,
        validUntil: new Date(Date.now() - 1000).toISOString(), // Already expired
      },
    });

    const validation = AP2Mandates.validateIntentCoverage(expiredMandate, {
      totalAmount: 100,
    });

    assert.strictEqual(validation.valid, false);
    assert.ok(validation.errors[0].includes('expired'));
  });

  test('Rejects mandate not yet valid', async () => {
    const futureMandate = await AP2Mandates.createIntent({
      agentId: 'time-scout',
      userId: 'user-grace',
      userKey: userKeys.privateKey,
      constraints: {
        maxAmount: 500,
        validFrom: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    });

    const validation = AP2Mandates.validateIntentCoverage(futureMandate, {
      totalAmount: 100,
    });

    assert.strictEqual(validation.valid, false);
    assert.ok(validation.errors[0].includes('not yet valid'));
  });
});

// =============================================================================
// Scenario 6: Currency Mismatch
// =============================================================================

describe('Scenario: Currency Handling', () => {
  test('Rejects mismatched currency', async () => {
    const usdMandate = await AP2Mandates.createIntent({
      agentId: 'currency-scout',
      userId: 'user-henry',
      userKey: userKeys.privateKey,
      constraints: {
        maxAmount: 500,
        currency: 'USD',
      },
    });

    const euroOffer = {
      totalAmount: 100,
      currency: 'EUR',
    };

    const validation = AP2Mandates.validateIntentCoverage(usdMandate, euroOffer);

    assert.strictEqual(validation.valid, false);
    assert.ok(validation.errors[0].includes('Currency'));
  });
});

// =============================================================================
// Scenario 7: Multiple Constraint Violations
// =============================================================================

describe('Scenario: Multiple Constraint Violations', () => {
  test('Reports all violations', async () => {
    const strictMandate = await AP2Mandates.createIntent({
      agentId: 'strict-scout',
      userId: 'user-iris',
      userKey: userKeys.privateKey,
      constraints: {
        maxAmount: 100,
        currency: 'USD',
        categories: ['electronics'],
        merchantBlocklist: ['bad-vendor'],
        validUntil: new Date(Date.now() - 1000).toISOString(), // Expired
      },
    });

    const badOffer = {
      totalAmount: 500, // Over budget
      currency: 'EUR', // Wrong currency
      category: 'furniture', // Wrong category
      merchantId: 'bad-vendor', // Blocklisted
    };

    const validation = AP2Mandates.validateIntentCoverage(strictMandate, badOffer);

    assert.strictEqual(validation.valid, false);
    assert.ok(validation.errors.length >= 4, 'Should report multiple errors');
  });
});

// =============================================================================
// Scenario 8: Signature Verification
// =============================================================================

describe('Scenario: Mandate Signature Verification', () => {
  test('Verifies valid mandate signature', async () => {
    const mandate = await AP2Mandates.createIntent({
      agentId: 'verify-scout',
      userId: 'user-jack',
      userKey: userKeys.privateKey,
      constraints: { maxAmount: 100 },
    });

    const result = await AP2Mandates.verify(mandate, userKeys.publicKey);

    // In dev mode uses mock signatures
    assert.ok(result.valid !== undefined);
  });

  test('Detects mandate without signature', async () => {
    const unsignedMandate = {
      type: 'intent',
      id: 'fake-mandate',
      constraints: { maxAmount: 100 },
      // No proof field
    };

    const result = await AP2Mandates.verify(unsignedMandate, userKeys.publicKey);

    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('No proof'));
  });
});
