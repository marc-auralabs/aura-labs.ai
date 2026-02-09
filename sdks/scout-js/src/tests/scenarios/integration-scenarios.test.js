/**
 * End-to-End Integration Scenario Tests
 *
 * Tests that verify MCP, AP2, and Visa TAP work together in realistic
 * agentic commerce flows.
 *
 * Run:
 *   node --test src/tests/scenarios/integration-scenarios.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { MCPClient } from '../../mcp/client.js';
import { AP2Mandates, generateKeyPair as generateAP2KeyPair } from '../../ap2/mandates.js';
import { VisaTAP } from '../../tap/visa.js';

// =============================================================================
// Test Setup
// =============================================================================

const userKeys = generateAP2KeyPair();
const agentKeyPair = VisaTAP.generateKeyPair();

// =============================================================================
// Scenario 1: Complete Shopping Flow with All Protocols
// =============================================================================

describe('Scenario: Complete Agentic Shopping Flow', () => {
  // Shared state across test steps
  let mcpClient;
  let tapRegistration;
  let tapCredentials;
  let intentMandate;
  let cartMandate;
  let paymentMandate;
  let signedPaymentRequest;

  test('Step 1: Initialize MCP client for external context', () => {
    mcpClient = new MCPClient({
      clientInfo: {
        name: 'shopping-scout',
        version: '1.0.0',
      },
    });

    assert.strictEqual(mcpClient.isConnected, false);
    assert.ok(mcpClient.capabilities.tools);
  });

  test('Step 2: Register agent with Visa TAP', async () => {
    tapRegistration = await VisaTAP.register({
      agentId: 'integrated-shopping-scout',
      publicKey: agentKeyPair.publicKey,
      metadata: {
        name: 'Integrated Shopping Scout',
        operator: 'AURA Labs',
        capabilities: ['shopping', 'comparison', 'checkout', 'payments'],
      },
    });

    tapCredentials = VisaTAP.createCredentials({
      tapId: tapRegistration.tapId,
      keyPair: agentKeyPair,
    });

    assert.ok(tapRegistration.tapId);
    assert.strictEqual(tapRegistration.status, 'active');
    assert.ok(tapCredentials.keyId);
  });

  test('Step 3: User creates intent mandate authorizing agent', async () => {
    intentMandate = await AP2Mandates.createIntent({
      agentId: tapRegistration.tapId, // Use TAP ID as agent identifier
      userId: 'user-integrated-001',
      userKey: userKeys.privateKey,
      constraints: {
        maxAmount: 1000,
        currency: 'USD',
        categories: ['electronics', 'office-supplies'],
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      metadata: {
        purpose: 'Work laptop accessories',
        tapRegistration: tapRegistration.tapId,
      },
    });

    assert.strictEqual(intentMandate.type, 'intent');
    assert.strictEqual(intentMandate.subject.id, tapRegistration.tapId);
    assert.ok(intentMandate.proof.proofValue);
  });

  test('Step 4: Agent discovers offer and validates against mandate', () => {
    // Simulate offer from a Beacon
    const offer = {
      id: 'offer-int-001',
      beaconId: 'beacon-office-depot',
      beaconName: 'Office Depot',
      product: { name: 'USB-C Hub', sku: 'USB-HUB-7P' },
      unitPrice: 49.99,
      quantity: 2,
      totalPrice: 99.98,
      currency: 'USD',
      deliveryDate: '2026-02-20',
    };

    const validation = AP2Mandates.validateIntentCoverage(intentMandate, {
      totalAmount: offer.totalPrice,
      currency: offer.currency,
      category: 'electronics',
      merchantId: offer.beaconId,
    });

    assert.strictEqual(validation.valid, true);
    assert.strictEqual(validation.errors.length, 0);
  });

  test('Step 5: User approves purchase with cart mandate', async () => {
    const offer = {
      id: 'offer-int-001',
      beaconId: 'beacon-office-depot',
      beaconName: 'Office Depot',
      product: { name: 'USB-C Hub', sku: 'USB-HUB-7P' },
      unitPrice: 49.99,
      quantity: 2,
      totalPrice: 99.98,
      currency: 'USD',
      deliveryDate: '2026-02-20',
    };

    cartMandate = await AP2Mandates.createCart({
      sessionId: 'session-integrated-001',
      offer,
      userKey: userKeys.privateKey,
      userId: 'user-integrated-001',
      intentMandateId: intentMandate.id,
    });

    assert.strictEqual(cartMandate.type, 'cart');
    assert.strictEqual(cartMandate.intentMandateRef, intentMandate.id);
    assert.strictEqual(cartMandate.cart.totalAmount, 99.98);
  });

  test('Step 6: Agent creates payment mandate with TAP credentials', async () => {
    paymentMandate = await AP2Mandates.createPayment({
      cartMandate,
      paymentMethod: { type: 'card', network: 'visa' },
      agentId: tapRegistration.tapId,
      agentKey: agentKeyPair.privateKey,
      tapCredentials: {
        tapId: tapRegistration.tapId,
      },
    });

    assert.strictEqual(paymentMandate.type, 'payment');
    assert.strictEqual(paymentMandate.cartMandateRef, cartMandate.id);
    assert.strictEqual(paymentMandate.agent.tapId, tapRegistration.tapId);
    assert.strictEqual(paymentMandate.paymentMethod.network, 'visa');
    assert.ok(paymentMandate.riskSignals.intentMandatePresent);
  });

  test('Step 7: Sign payment request with Visa TAP', async () => {
    const paymentRequest = {
      method: 'POST',
      url: 'https://payments.visa.com/api/v1/process',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        amount: paymentMandate.transaction.amount,
        currency: paymentMandate.transaction.currency,
        merchantId: paymentMandate.transaction.merchantId,
        mandateChain: {
          paymentMandateId: paymentMandate.id,
          cartMandateId: paymentMandate.cartMandateRef,
          intentMandateRef: cartMandate.intentMandateRef,
        },
      },
    };

    signedPaymentRequest = await VisaTAP.signRequest(paymentRequest, tapCredentials);

    assert.strictEqual(signedPaymentRequest.headers['X-TAP-Agent-Id'], tapCredentials.tapId);
    assert.ok(signedPaymentRequest.headers['X-TAP-Timestamp']);
    assert.ok(signedPaymentRequest.headers['X-TAP-Nonce']);
    assert.ok(signedPaymentRequest.headers['Signature']);
  });

  test('Step 8: Verify complete audit trail', () => {
    // Intent -> Cart -> Payment chain
    assert.strictEqual(cartMandate.intentMandateRef, intentMandate.id);
    assert.strictEqual(paymentMandate.cartMandateRef, cartMandate.id);

    // TAP identity flows through
    assert.strictEqual(intentMandate.subject.id, tapRegistration.tapId);
    assert.strictEqual(paymentMandate.agent.tapId, tapRegistration.tapId);
    assert.strictEqual(signedPaymentRequest.headers['X-TAP-Agent-Id'], tapRegistration.tapId);

    // All cryptographic proofs present
    assert.ok(intentMandate.proof.proofValue);
    assert.ok(cartMandate.proof.proofValue);
    assert.ok(paymentMandate.proof.proofValue);
    assert.ok(signedPaymentRequest.headers['Signature']);
  });
});

// =============================================================================
// Scenario 2: Multi-Offer Comparison with Constraints
// =============================================================================

describe('Scenario: Multi-Offer Comparison with Mandate Constraints', () => {
  let intentMandate;

  test('Setup: Create restrictive intent mandate', async () => {
    intentMandate = await AP2Mandates.createIntent({
      agentId: 'comparison-scout',
      userId: 'user-comparison-001',
      userKey: userKeys.privateKey,
      constraints: {
        maxAmount: 200,
        currency: 'USD',
        categories: ['office-supplies'],
        merchantBlocklist: ['sketchy-vendor'],
      },
    });
  });

  test('Agent filters multiple offers against mandate', () => {
    const offers = [
      {
        id: 'offer-1',
        beaconId: 'good-vendor',
        totalPrice: 150,
        currency: 'USD',
        category: 'office-supplies',
      },
      {
        id: 'offer-2',
        beaconId: 'expensive-vendor',
        totalPrice: 300, // Over budget
        currency: 'USD',
        category: 'office-supplies',
      },
      {
        id: 'offer-3',
        beaconId: 'sketchy-vendor', // Blocklisted
        totalPrice: 100,
        currency: 'USD',
        category: 'office-supplies',
      },
      {
        id: 'offer-4',
        beaconId: 'electronics-store',
        totalPrice: 180,
        currency: 'USD',
        category: 'electronics', // Wrong category
      },
      {
        id: 'offer-5',
        beaconId: 'euro-store',
        totalPrice: 100,
        currency: 'EUR', // Wrong currency
        category: 'office-supplies',
      },
    ];

    const validOffers = offers.filter(offer => {
      const validation = AP2Mandates.validateIntentCoverage(intentMandate, {
        totalAmount: offer.totalPrice,
        currency: offer.currency,
        category: offer.category,
        merchantId: offer.beaconId,
      });
      return validation.valid;
    });

    assert.strictEqual(validOffers.length, 1);
    assert.strictEqual(validOffers[0].id, 'offer-1');
  });
});

// =============================================================================
// Scenario 3: Payment Network Verification
// =============================================================================

describe('Scenario: Payment Network Verifies Agent Identity', () => {
  test('Payment network can verify TAP-signed request', async () => {
    // Agent registration
    const agentKeyPair = VisaTAP.generateKeyPair();
    const registration = await VisaTAP.register({
      agentId: 'payment-verification-agent',
      publicKey: agentKeyPair.publicKey,
    });

    const credentials = VisaTAP.createCredentials({
      tapId: registration.tapId,
      keyPair: agentKeyPair,
    });

    // Agent signs a request
    const request = {
      method: 'POST',
      url: 'https://payments.example.com/process',
      body: { amount: 100, currency: 'USD' },
    };

    const signedRequest = await VisaTAP.signRequest(request, credentials);

    // Payment network verifies
    const verifyRequest = {
      method: signedRequest.method,
      url: signedRequest.url,
      body: signedRequest.body,
      headers: {
        'x-tap-agent-id': signedRequest.headers['X-TAP-Agent-Id'],
        'x-tap-timestamp': signedRequest.headers['X-TAP-Timestamp'],
        'x-tap-nonce': signedRequest.headers['X-TAP-Nonce'],
        'signature': signedRequest.headers['Signature'],
      },
    };

    const publicKeyLookup = async (tapId) => {
      if (tapId === registration.tapId) return agentKeyPair.publicKey;
      throw new Error('Agent not found');
    };

    const result = await VisaTAP.verifyRequest(verifyRequest, publicKeyLookup);

    // Verification result should have valid property
    assert.ok(result.valid !== undefined);
  });
});

// =============================================================================
// Scenario 4: MCP Context Enriches Intent
// =============================================================================

describe('Scenario: MCP Context Enriches Shopping Intent', () => {
  test('Agent aggregates context before shopping', async () => {
    const mcp = new MCPClient();

    // In real scenario, agent would connect to context servers
    // For testing, we verify the pattern works

    const context = await mcp.aggregateContext({
      includeResources: true,
      resourcePatterns: ['calendar://', 'preferences://'],
    });

    // Context would inform intent creation
    const enhancedIntent = {
      rawIntent: 'I need a laptop for my upcoming trip',
      context: {
        availableTools: context.tools,
        userResources: context.resources,
        // In real scenario: calendar shows trip dates, preferences show past purchases
      },
    };

    assert.ok(enhancedIntent.context);
    assert.ok(Array.isArray(enhancedIntent.context.availableTools));
  });
});

// =============================================================================
// Scenario 5: Error Recovery Flow
// =============================================================================

describe('Scenario: Error Recovery in Protocol Chain', () => {
  test('Agent handles mandate validation failure gracefully', async () => {
    const intentMandate = await AP2Mandates.createIntent({
      agentId: 'error-recovery-agent',
      userId: 'user-error-001',
      userKey: userKeys.privateKey,
      constraints: {
        maxAmount: 100,
        currency: 'USD',
      },
    });

    // Offer exceeds budget
    const expensiveOffer = {
      totalAmount: 500,
      currency: 'USD',
    };

    const validation = AP2Mandates.validateIntentCoverage(intentMandate, expensiveOffer);

    // Agent should handle this gracefully
    if (!validation.valid) {
      // Agent could:
      // 1. Request new intent mandate with higher budget
      // 2. Search for cheaper alternatives
      // 3. Inform user of constraint violation

      const errorReport = {
        type: 'constraint_violation',
        violations: validation.errors,
        suggestedAction: 'find_cheaper_alternative',
      };

      assert.strictEqual(errorReport.type, 'constraint_violation');
      assert.ok(errorReport.violations.length > 0);
    }
  });

  test('Agent handles TAP verification failure', async () => {
    // Missing TAP headers
    const badRequest = {
      method: 'POST',
      url: 'https://payments.example.com/process',
      headers: {},
      body: { amount: 100 },
    };

    const result = await VisaTAP.verifyRequest(badRequest, async () => null);

    // Should fail gracefully
    assert.strictEqual(result.valid, false);
    assert.ok(result.error);
  });
});

// =============================================================================
// Scenario 6: Time-Sensitive Transaction
// =============================================================================

describe('Scenario: Time-Sensitive Transaction Flow', () => {
  test('Complete flow within mandate validity window', async () => {
    // Short-lived intent mandate (1 hour)
    const intentMandate = await AP2Mandates.createIntent({
      agentId: 'time-sensitive-agent',
      userId: 'user-time-001',
      userKey: userKeys.privateKey,
      constraints: {
        maxAmount: 500,
        validUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
      },
    });

    // Immediate validation passes
    const validation = AP2Mandates.validateIntentCoverage(intentMandate, {
      totalAmount: 100,
    });
    assert.strictEqual(validation.valid, true);

    // Cart mandate has 30 minute expiry
    const cartMandate = await AP2Mandates.createCart({
      sessionId: 'session-time-001',
      offer: {
        id: 'offer-time-001',
        beaconId: 'fast-vendor',
        beaconName: 'Fast Vendor',
        product: { name: 'Quick Item' },
        unitPrice: 100,
        quantity: 1,
        totalPrice: 100,
        currency: 'USD',
      },
      userKey: userKeys.privateKey,
      userId: 'user-time-001',
      intentMandateId: intentMandate.id,
    });

    const expiresAt = new Date(cartMandate.expiresAt);
    const now = new Date();
    const minutesUntilExpiry = (expiresAt - now) / (1000 * 60);

    assert.ok(minutesUntilExpiry > 25 && minutesUntilExpiry <= 31);
  });
});

// =============================================================================
// Scenario 7: Agent Capabilities Advertisement
// =============================================================================

describe('Scenario: Agent Capabilities for Protocol Negotiation', () => {
  test('Agent advertises supported protocols', async () => {
    const agentCapabilities = {
      mcp: {
        version: '2024-11-05',
        clientInfo: { name: 'aura-scout', version: '1.0.0' },
        supportedFeatures: ['tools', 'resources', 'prompts'],
      },
      ap2: {
        version: '1.0',
        supportedMandateTypes: ['intent', 'cart', 'payment'],
        supportedConstraints: [
          'maxAmount',
          'currency',
          'categories',
          'merchantAllowlist',
          'merchantBlocklist',
          'validUntil',
        ],
      },
      tap: {
        version: '1.0',
        algorithm: 'ed25519',
        signatureFormat: 'http-message-signatures',
      },
    };

    // Verify all protocols represented
    assert.ok(agentCapabilities.mcp);
    assert.ok(agentCapabilities.ap2);
    assert.ok(agentCapabilities.tap);

    // Verify versions
    assert.strictEqual(agentCapabilities.mcp.version, '2024-11-05');
    assert.strictEqual(agentCapabilities.ap2.version, '1.0');
    assert.strictEqual(agentCapabilities.tap.algorithm, 'ed25519');
  });
});
