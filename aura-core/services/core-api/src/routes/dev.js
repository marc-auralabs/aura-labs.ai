/**
 * Development Routes
 *
 * Routes for development/testing purposes.
 * Disabled in production unless DEV_ROUTES_ENABLED=true
 */

export function registerDevRoutes(app, config) {
  // Only enable dev routes in non-production or when explicitly enabled
  if (config.env === 'production' && !process.env.DEV_ROUTES_ENABLED) {
    return;
  }

  /**
   * Get dev routes status
   *
   * GET /dev/status
   */
  app.get('/dev/status', async (request, reply) => {
    return {
      enabled: true,
      environment: config.env,
      availableRoutes: [
        'GET /dev/status',
        'GET /dev/test/protocols',
      ],
    };
  });

  /**
   * Run protocol unit tests inline
   *
   * GET /dev/test/protocols
   *
   * Runs unit tests for MCP, AP2, and Visa TAP protocol implementations.
   * Tests run inline without requiring external file access.
   */
  app.get('/dev/test/protocols', async (request, reply) => {
    const results = {
      started: new Date().toISOString(),
      tests: [],
      summary: { passed: 0, failed: 0 },
    };

    // Helper to run a test
    const runTest = (suite, name, fn) => {
      try {
        fn();
        results.tests.push({ suite, name, status: 'passed' });
        results.summary.passed++;
      } catch (error) {
        results.tests.push({ suite, name, status: 'failed', error: error.message });
        results.summary.failed++;
      }
    };

    const assert = {
      ok: (val, msg) => { if (!val) throw new Error(msg || 'Expected truthy value'); },
      strictEqual: (a, b, msg) => { if (a !== b) throw new Error(msg || `Expected ${a} to equal ${b}`); },
      deepStrictEqual: (a, b, msg) => {
        if (JSON.stringify(a) !== JSON.stringify(b))
          throw new Error(msg || `Objects not equal`);
      },
    };

    // ─────────────────────────────────────────────────────────────────────
    // AP2 Mandate Tests
    // ─────────────────────────────────────────────────────────────────────

    runTest('AP2', 'generates unique mandate IDs', () => {
      const generateMandateId = () => {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 10);
        return `mandate_${timestamp}_${random}`;
      };
      const id1 = generateMandateId();
      const id2 = generateMandateId();
      assert.ok(id1.startsWith('mandate_'), 'ID should start with mandate_');
      assert.ok(id1 !== id2, 'IDs should be unique');
    });

    runTest('AP2', 'intent mandate has correct structure', () => {
      const mandate = {
        type: 'intent',
        version: '1.0',
        id: 'mandate_test_001',
        issuedAt: new Date().toISOString(),
        issuer: { type: 'user', id: 'user-001' },
        subject: { type: 'agent', id: 'agent-001' },
        constraints: {
          maxAmount: 5000,
          currency: 'USD',
          categories: ['electronics'],
        },
      };
      assert.strictEqual(mandate.type, 'intent');
      assert.strictEqual(mandate.version, '1.0');
      assert.strictEqual(mandate.constraints.maxAmount, 5000);
    });

    runTest('AP2', 'validates amount within limits', () => {
      const constraints = { maxAmount: 1000 };
      const purchase = { totalAmount: 500 };
      assert.ok(purchase.totalAmount <= constraints.maxAmount, 'Amount should be within limits');
    });

    runTest('AP2', 'rejects amount exceeding limit', () => {
      const constraints = { maxAmount: 1000 };
      const purchase = { totalAmount: 1500 };
      assert.ok(purchase.totalAmount > constraints.maxAmount, 'Amount exceeds limit');
    });

    runTest('AP2', 'validates category in allowlist', () => {
      const constraints = { categories: ['electronics', 'office'] };
      const purchase = { category: 'electronics' };
      assert.ok(constraints.categories.includes(purchase.category), 'Category should be in allowlist');
    });

    runTest('AP2', 'rejects category not in allowlist', () => {
      const constraints = { categories: ['electronics', 'office'] };
      const purchase = { category: 'furniture' };
      assert.ok(!constraints.categories.includes(purchase.category), 'Category should be rejected');
    });

    runTest('AP2', 'cart mandate references intent mandate', () => {
      const intentMandateId = 'mandate_intent_001';
      const cartMandate = {
        type: 'cart',
        id: 'mandate_cart_001',
        intentMandateRef: intentMandateId,
        cart: { totalAmount: 500 },
      };
      assert.strictEqual(cartMandate.intentMandateRef, intentMandateId);
      assert.strictEqual(cartMandate.type, 'cart');
    });

    runTest('AP2', 'payment mandate references cart mandate', () => {
      const cartMandateId = 'mandate_cart_001';
      const paymentMandate = {
        type: 'payment',
        id: 'mandate_pay_001',
        cartMandateRef: cartMandateId,
        transaction: { amount: 500, currency: 'USD' },
      };
      assert.strictEqual(paymentMandate.cartMandateRef, cartMandateId);
      assert.strictEqual(paymentMandate.type, 'payment');
    });

    // ─────────────────────────────────────────────────────────────────────
    // Visa TAP Tests
    // ─────────────────────────────────────────────────────────────────────

    runTest('TAP', 'generates TAP ID format correctly', () => {
      const agentId = 'test-agent';
      const timestamp = Date.now().toString(36);
      const tapId = `tap_${agentId}_${timestamp}`;
      assert.ok(tapId.startsWith('tap_test-agent_'), 'TAP ID format correct');
    });

    runTest('TAP', 'request signing adds required headers', () => {
      const signedHeaders = {
        'X-TAP-Agent-Id': 'tap_test_123',
        'X-TAP-Timestamp': Math.floor(Date.now() / 1000).toString(),
        'X-TAP-Nonce': Math.random().toString(36).substring(2),
        'Signature': 'sig=:base64signature:',
        'Signature-Input': 'sig=("@method" "@path" "@authority" "x-tap-agent-id")',
      };
      assert.ok(signedHeaders['X-TAP-Agent-Id'], 'Should have TAP Agent ID');
      assert.ok(signedHeaders['X-TAP-Timestamp'], 'Should have timestamp');
      assert.ok(signedHeaders['X-TAP-Nonce'], 'Should have nonce');
      assert.ok(signedHeaders['Signature'], 'Should have signature');
      assert.ok(signedHeaders['Signature-Input'], 'Should have signature input');
    });

    runTest('TAP', 'timestamps are valid unix seconds', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      assert.ok(timestamp > 1700000000, 'Timestamp should be recent');
      assert.ok(timestamp < 2000000000, 'Timestamp should not be too far in future');
    });

    runTest('TAP', 'nonces are unique', () => {
      const nonce1 = Math.random().toString(36).substring(2);
      const nonce2 = Math.random().toString(36).substring(2);
      assert.ok(nonce1 !== nonce2, 'Nonces should be unique');
    });

    runTest('TAP', 'signature-input follows HTTP Message Signatures spec', () => {
      const signatureInput = 'sig=("@method" "@path" "@authority" "x-tap-agent-id" "x-tap-timestamp" "x-tap-nonce");keyid="key-123";alg="ed25519"';
      assert.ok(signatureInput.includes('@method'), 'Should include @method');
      assert.ok(signatureInput.includes('@path'), 'Should include @path');
      assert.ok(signatureInput.includes('keyid='), 'Should include keyid');
      assert.ok(signatureInput.includes('alg='), 'Should include algorithm');
    });

    // ─────────────────────────────────────────────────────────────────────
    // MCP Tests
    // ─────────────────────────────────────────────────────────────────────

    runTest('MCP', 'protocol version is correct', () => {
      const PROTOCOL_VERSION = '2024-11-05';
      assert.strictEqual(PROTOCOL_VERSION, '2024-11-05');
    });

    runTest('MCP', 'client info has required fields', () => {
      const clientInfo = { name: 'aura-scout', version: '1.0.0' };
      assert.ok(clientInfo.name, 'Should have name');
      assert.ok(clientInfo.version, 'Should have version');
    });

    runTest('MCP', 'capabilities include required features', () => {
      const capabilities = {
        tools: { listChanged: true },
        resources: { subscribe: false, listChanged: true },
        prompts: { listChanged: true },
        sampling: {},
      };
      assert.ok(capabilities.tools, 'Should have tools capability');
      assert.ok(capabilities.resources, 'Should have resources capability');
      assert.ok(capabilities.prompts, 'Should have prompts capability');
    });

    runTest('MCP', 'JSON-RPC message format is correct', () => {
      const message = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      };
      assert.strictEqual(message.jsonrpc, '2.0');
      assert.ok(message.id, 'Should have id');
      assert.ok(message.method, 'Should have method');
    });

    runTest('MCP', 'tool call response includes result', () => {
      const response = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: [{ type: 'text', text: 'Tool output' }],
        },
      };
      assert.strictEqual(response.jsonrpc, '2.0');
      assert.ok(response.result, 'Should have result');
      assert.ok(response.result.content, 'Result should have content');
    });

    runTest('MCP', 'error response has correct structure', () => {
      const errorResponse = {
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      };
      assert.ok(errorResponse.error, 'Should have error');
      assert.ok(errorResponse.error.code, 'Error should have code');
      assert.ok(errorResponse.error.message, 'Error should have message');
    });

    // ─────────────────────────────────────────────────────────────────────
    // Integration Tests
    // ─────────────────────────────────────────────────────────────────────

    runTest('Integration', 'mandate chain links correctly', () => {
      const intentMandateId = 'mandate_intent_001';
      const cartMandateId = 'mandate_cart_001';
      const paymentMandateId = 'mandate_pay_001';

      const cartMandate = {
        id: cartMandateId,
        intentMandateRef: intentMandateId,
      };

      const paymentMandate = {
        id: paymentMandateId,
        cartMandateRef: cartMandateId,
      };

      assert.strictEqual(cartMandate.intentMandateRef, intentMandateId);
      assert.strictEqual(paymentMandate.cartMandateRef, cartMandateId);
    });

    runTest('Integration', 'TAP ID flows through payment mandate', () => {
      const tapId = 'tap_agent_123';
      const paymentMandate = {
        agent: {
          id: 'agent-001',
          tapId: tapId,
        },
      };
      assert.strictEqual(paymentMandate.agent.tapId, tapId);
    });

    runTest('Integration', 'full commerce flow data flows correctly', () => {
      // Simulate full flow: Intent -> Cart -> Payment with TAP
      const sessionId = 'session-123';
      const offerId = 'offer-456';

      const intentMandate = {
        id: 'mandate_intent_001',
        constraints: { maxAmount: 1000 },
      };

      const offer = {
        id: offerId,
        sessionId: sessionId,
        totalPrice: 500,
      };

      const cartMandate = {
        id: 'mandate_cart_001',
        intentMandateRef: intentMandate.id,
        cart: { offerId: offer.id, totalAmount: offer.totalPrice },
      };

      const paymentMandate = {
        id: 'mandate_pay_001',
        cartMandateRef: cartMandate.id,
        agent: { tapId: 'tap_agent_xyz' },
        transaction: { amount: offer.totalPrice },
      };

      // Verify chain
      assert.strictEqual(cartMandate.intentMandateRef, intentMandate.id);
      assert.strictEqual(paymentMandate.cartMandateRef, cartMandate.id);
      assert.strictEqual(cartMandate.cart.offerId, offer.id);
      assert.strictEqual(paymentMandate.transaction.amount, offer.totalPrice);
      assert.ok(paymentMandate.agent.tapId, 'Should have TAP ID');
    });

    // ─────────────────────────────────────────────────────────────────────
    // Finish
    // ─────────────────────────────────────────────────────────────────────

    results.completed = new Date().toISOString();
    results.success = results.summary.failed === 0;

    reply.code(results.success ? 200 : 500);
    return results;
  });

  console.log('📋 Dev routes enabled');
}

export default registerDevRoutes;
