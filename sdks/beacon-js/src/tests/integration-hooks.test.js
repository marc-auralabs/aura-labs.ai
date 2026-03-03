/**
 * Tests for AURA Beacon SDK integration hooks
 *
 * Tests beforeOffer validators, onOfferAccepted handlers, registerPolicies,
 * updateFulfillment, and getTransaction methods.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createBeacon, ValidationError, RegistrationError } from '../index.js';

// ─── Helpers ───

/**
 * Create a mock fetch that captures requests and returns canned responses
 */
function createMockFetch() {
  const requests = [];

  const mockFetch = async (url, options) => {
    requests.push({ url, options });

    // Extract path from URL
    const path = new URL(url).pathname;

    // Handle beacon registration
    if (path === '/beacons/register' && options.method === 'POST') {
      return {
        ok: true,
        json: async () => ({
          beaconId: 'beacon-123',
          externalId: 'test-beacon',
          name: 'Test Beacon',
          status: 'active',
        }),
      };
    }

    // Handle sessions fetch
    if (path === '/beacons/sessions' && options.method === 'GET') {
      return {
        ok: true,
        json: async () => ({
          sessions: [
            {
              sessionId: 'session-456',
              intent: { raw: 'I need widgets' },
              region: 'US',
            },
          ],
        }),
      };
    }

    // Handle offer submission
    if (path.match(/\/sessions\/.*\/offers$/) && options.method === 'POST') {
      const body = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          offerId: 'offer-789',
          sessionId: path.split('/')[2],
          totalPrice: body.totalPrice || body.unitPrice * body.quantity,
          status: 'submitted',
        }),
      };
    }

    // Handle fulfillment updates
    if (path.match(/\/transactions\/.*\/fulfillment$/) && options.method === 'PUT') {
      const transactionId = path.split('/')[2];
      const body = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          transactionId,
          fulfillmentStatus: body.fulfillmentStatus,
          updatedAt: new Date().toISOString(),
        }),
      };
    }

    // Handle transaction fetch
    if (path.match(/\/transactions\/[^/]+$/) && options.method === 'GET') {
      const transactionId = path.split('/')[2];
      return {
        ok: true,
        json: async () => ({
          transactionId,
          status: 'confirmed',
          amount: 5000,
          currency: 'USD',
        }),
      };
    }

    // Default 404
    return {
      ok: false,
      json: async () => ({ message: 'Not found', code: 'NOT_FOUND' }),
    };
  };

  mockFetch.requests = requests;
  return mockFetch;
}

/**
 * Create a beacon with mocked fetch for testing
 */
function createTestBeacon(mockFetch) {
  // Temporarily replace global fetch
  const originalFetch = global.fetch;
  global.fetch = mockFetch;

  const beacon = createBeacon({
    externalId: 'test-beacon',
    name: 'Test Beacon',
    coreUrl: 'http://localhost:3000',
  });

  // Restore original fetch but keep reference to beacon
  global.fetch = originalFetch;
  beacon._mockFetch = mockFetch;

  return beacon;
}

/**
 * Register a beacon and set up mock fetch
 */
async function registerBeacon(beacon, mockFetch) {
  const originalFetch = global.fetch;
  global.fetch = mockFetch;

  try {
    await beacon.register();
  } finally {
    global.fetch = originalFetch;
  }
}

// ─── beforeOffer tests ───

describe('beforeOffer', () => {
  let beacon;
  let mockFetch;

  beforeEach(() => {
    mockFetch = createMockFetch();
    beacon = createTestBeacon(mockFetch);
  });

  it('allows submitOffer to proceed when validator returns undefined', async () => {
    beacon.beforeOffer(async (session, offer) => {
      // Validator approves by returning nothing
      return undefined;
    });

    await registerBeacon(beacon, mockFetch);

    // Simulate a session being set for testing
    const testSession = { sessionId: 'session-456', intent: { raw: 'test' } };
    beacon._currentSession = testSession;

    const originalFetch = global.fetch;
    global.fetch = mockFetch;

    try {
      const result = await beacon.submitOffer('session-456', {
        product: { name: 'Widget', sku: 'WDG-001' },
        unitPrice: 100,
        quantity: 10,
        deliveryDate: '2026-03-15',
      });

      assert.strictEqual(result.status, 'submitted');
    } finally {
      global.fetch = originalFetch;
      beacon._currentSession = null;
    }
  });

  it('merges modifications from validator into offer', async () => {
    beacon.beforeOffer(async (session, offer) => {
      // Validator modifies the offer
      return {
        unitPrice: 150, // Increase price
      };
    });

    await registerBeacon(beacon, mockFetch);

    const testSession = { sessionId: 'session-456', intent: { raw: 'test' } };
    beacon._currentSession = testSession;

    const originalFetch = global.fetch;
    global.fetch = mockFetch;

    try {
      // We need to capture the actual request to verify the price was modified
      const initialRequestCount = mockFetch.requests.length;

      await beacon.submitOffer('session-456', {
        product: { name: 'Widget', sku: 'WDG-001' },
        unitPrice: 100,
        quantity: 10,
        deliveryDate: '2026-03-15',
      });

      // Find the offer submission request
      const offerRequest = mockFetch.requests
        .slice(initialRequestCount)
        .find(req => req.url.includes('/offers'));

      assert.ok(offerRequest, 'Offer request was made');

      const body = JSON.parse(offerRequest.options.body);
      assert.strictEqual(body.unitPrice, 150, 'Price was modified by validator');
    } finally {
      global.fetch = originalFetch;
      beacon._currentSession = null;
    }
  });

  it('throws ValidationError when validator throws', async () => {
    beacon.beforeOffer(async (session, offer) => {
      throw new Error('Offer does not meet criteria');
    });

    await registerBeacon(beacon, mockFetch);

    const testSession = { sessionId: 'session-456', intent: { raw: 'test' } };
    beacon._currentSession = testSession;

    const originalFetch = global.fetch;
    global.fetch = mockFetch;

    try {
      await assert.rejects(
        () =>
          beacon.submitOffer('session-456', {
            product: { name: 'Widget', sku: 'WDG-001' },
            unitPrice: 100,
            quantity: 10,
            deliveryDate: '2026-03-15',
          }),
        ValidationError,
        'Should throw ValidationError'
      );
    } finally {
      global.fetch = originalFetch;
      beacon._currentSession = null;
    }
  });

  it('executes multiple validators sequentially', async () => {
    const executionOrder = [];

    beacon.beforeOffer(async (session, offer) => {
      executionOrder.push('validator1');
      return { metadata: { ...offer.metadata, step1: true } };
    });

    beacon.beforeOffer(async (session, offer) => {
      executionOrder.push('validator2');
      return { metadata: { ...offer.metadata, step2: true } };
    });

    beacon.beforeOffer(async (session, offer) => {
      executionOrder.push('validator3');
      // Verify previous validators' changes were applied
      assert.ok(offer.metadata?.step1, 'Step 1 should be applied');
      assert.ok(offer.metadata?.step2, 'Step 2 should be applied');
      return undefined;
    });

    await registerBeacon(beacon, mockFetch);

    const testSession = { sessionId: 'session-456', intent: { raw: 'test' } };
    beacon._currentSession = testSession;

    const originalFetch = global.fetch;
    global.fetch = mockFetch;

    try {
      await beacon.submitOffer('session-456', {
        product: { name: 'Widget', sku: 'WDG-001' },
        unitPrice: 100,
        quantity: 10,
        deliveryDate: '2026-03-15',
        metadata: {},
      });

      assert.deepStrictEqual(executionOrder, ['validator1', 'validator2', 'validator3']);
    } finally {
      global.fetch = originalFetch;
      beacon._currentSession = null;
    }
  });

  it('passes null session to validator when called outside polling', async () => {
    // #currentSession is a private field only set during poll()
    // When submitOffer is called directly (not from a session handler),
    // validators receive null — which is correct behaviour
    let receivedSession = 'NOT_SET';

    beacon.beforeOffer(async (session, offer) => {
      receivedSession = session;
      return undefined;
    });

    await registerBeacon(beacon, mockFetch);

    const originalFetch = global.fetch;
    global.fetch = mockFetch;

    try {
      await beacon.submitOffer('session-456', {
        product: { name: 'Widget', sku: 'WDG-001' },
        unitPrice: 100,
        quantity: 10,
        deliveryDate: '2026-03-15',
      });

      assert.strictEqual(receivedSession, null, 'session should be null when not called from poll handler');
    } finally {
      global.fetch = originalFetch;
    }
  });
});

// ─── onOfferAccepted tests ───

describe('onOfferAccepted', () => {
  let beacon;
  let mockFetch;

  beforeEach(() => {
    mockFetch = createMockFetch();
    beacon = createTestBeacon(mockFetch);
  });

  it('calls handler with correct transaction data via _notifyOfferAccepted', () => {
    let receivedData;

    beacon.onOfferAccepted((transactionData) => {
      receivedData = transactionData;
    });

    const transactionData = {
      transactionId: 'txn-123',
      sessionId: 'session-456',
      offerId: 'offer-789',
      amount: 5000,
      currency: 'USD',
      status: 'accepted',
    };

    beacon._notifyOfferAccepted(transactionData);

    assert.deepStrictEqual(receivedData, transactionData);
  });

  it('executes all handlers when multiple are registered', () => {
    const executionOrder = [];

    beacon.onOfferAccepted(() => {
      executionOrder.push('handler1');
    });

    beacon.onOfferAccepted(() => {
      executionOrder.push('handler2');
    });

    beacon.onOfferAccepted(() => {
      executionOrder.push('handler3');
    });

    const transactionData = { transactionId: 'txn-123' };
    beacon._notifyOfferAccepted(transactionData);

    assert.deepStrictEqual(executionOrder, ['handler1', 'handler2', 'handler3']);
  });

  it('continues executing other handlers even if one throws', () => {
    const executionOrder = [];

    beacon.onOfferAccepted(() => {
      executionOrder.push('handler1');
    });

    beacon.onOfferAccepted(() => {
      executionOrder.push('handler2');
      throw new Error('Handler error');
    });

    beacon.onOfferAccepted(() => {
      executionOrder.push('handler3');
    });

    const transactionData = { transactionId: 'txn-123' };

    // Should not throw even though handler2 throws
    beacon._notifyOfferAccepted(transactionData);

    assert.deepStrictEqual(executionOrder, ['handler1', 'handler2', 'handler3']);
  });
});

// ─── registerPolicies tests ───

describe('registerPolicies', () => {
  let beacon;
  let mockFetch;

  beforeEach(() => {
    mockFetch = createMockFetch();
    beacon = createTestBeacon(mockFetch);
  });

  it('rejects offer when unitPrice is below minPrice policy', async () => {
    beacon.registerPolicies({
      minPrice: 100,
    });

    await registerBeacon(beacon, mockFetch);

    const testSession = { sessionId: 'session-456', intent: { raw: 'test' } };
    beacon._currentSession = testSession;

    const originalFetch = global.fetch;
    global.fetch = mockFetch;

    try {
      await assert.rejects(
        () =>
          beacon.submitOffer('session-456', {
            product: { name: 'Widget', sku: 'WDG-001' },
            unitPrice: 50, // Below minPrice of 100
            quantity: 10,
            deliveryDate: '2026-03-15',
          }),
        ValidationError,
        'Should reject offer below minPrice'
      );
    } finally {
      global.fetch = originalFetch;
      beacon._currentSession = null;
    }
  });

  it('rejects offer when quantity exceeds maxQuantityPerOrder policy', async () => {
    beacon.registerPolicies({
      maxQuantityPerOrder: 100,
    });

    await registerBeacon(beacon, mockFetch);

    const testSession = { sessionId: 'session-456', intent: { raw: 'test' } };
    beacon._currentSession = testSession;

    const originalFetch = global.fetch;
    global.fetch = mockFetch;

    try {
      await assert.rejects(
        () =>
          beacon.submitOffer('session-456', {
            product: { name: 'Widget', sku: 'WDG-001' },
            unitPrice: 50,
            quantity: 500, // Exceeds maxQuantityPerOrder of 100
            deliveryDate: '2026-03-15',
          }),
        ValidationError,
        'Should reject offer exceeding maxQuantityPerOrder'
      );
    } finally {
      global.fetch = originalFetch;
      beacon._currentSession = null;
    }
  });

  it('allows offer when within policy bounds', async () => {
    beacon.registerPolicies({
      minPrice: 50,
      maxQuantityPerOrder: 500,
    });

    await registerBeacon(beacon, mockFetch);

    const testSession = { sessionId: 'session-456', intent: { raw: 'test' } };
    beacon._currentSession = testSession;

    const originalFetch = global.fetch;
    global.fetch = mockFetch;

    try {
      const result = await beacon.submitOffer('session-456', {
        product: { name: 'Widget', sku: 'WDG-001' },
        unitPrice: 100, // Within minPrice of 50
        quantity: 200, // Within maxQuantityPerOrder of 500
        deliveryDate: '2026-03-15',
      });

      assert.strictEqual(result.status, 'submitted');
    } finally {
      global.fetch = originalFetch;
      beacon._currentSession = null;
    }
  });

  it('returns this for method chaining', () => {
    const result = beacon.registerPolicies({
      minPrice: 100,
    });

    assert.strictEqual(result, beacon, 'registerPolicies should return this for chaining');
  });

  it('chains method calls', () => {
    const result = beacon
      .registerPolicies({ minPrice: 100 })
      .beforeOffer(async () => undefined)
      .onOfferAccepted(() => {});

    assert.strictEqual(result, beacon, 'Should support method chaining');
  });
});

// ─── updateFulfillment tests ───

describe('updateFulfillment', () => {
  let beacon;
  let mockFetch;

  beforeEach(() => {
    mockFetch = createMockFetch();
    beacon = createTestBeacon(mockFetch);
  });

  it('calls PUT on correct endpoint', async () => {
    await registerBeacon(beacon, mockFetch);

    const originalFetch = global.fetch;
    global.fetch = mockFetch;

    try {
      const result = await beacon.updateFulfillment('txn-123', {
        fulfillmentStatus: 'shipped',
        fulfillmentReference: 'TRACK-ABC123',
        metadata: { carrier: 'FedEx' },
      });

      // Verify the request was made to the correct endpoint
      const updateRequest = mockFetch.requests.find(req =>
        req.url.includes('/transactions/txn-123/fulfillment')
      );

      assert.ok(updateRequest, 'PUT request to fulfillment endpoint should be made');
      assert.strictEqual(updateRequest.options.method, 'PUT');

      const body = JSON.parse(updateRequest.options.body);
      assert.strictEqual(body.fulfillmentStatus, 'shipped');
      assert.strictEqual(body.fulfillmentReference, 'TRACK-ABC123');

      // Verify response
      assert.strictEqual(result.fulfillmentStatus, 'shipped');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('throws RegistrationError if not registered', async () => {
    const unregisteredBeacon = createTestBeacon(mockFetch);

    await assert.rejects(
      () =>
        unregisteredBeacon.updateFulfillment('txn-123', {
          fulfillmentStatus: 'shipped',
        }),
      RegistrationError,
      'Should throw RegistrationError when not registered'
    );
  });
});

// ─── getTransaction tests ───

describe('getTransaction', () => {
  let beacon;
  let mockFetch;

  beforeEach(() => {
    mockFetch = createMockFetch();
    beacon = createTestBeacon(mockFetch);
  });

  it('calls GET on correct endpoint', async () => {
    await registerBeacon(beacon, mockFetch);

    const originalFetch = global.fetch;
    global.fetch = mockFetch;

    try {
      const result = await beacon.getTransaction('txn-123');

      // Verify the request was made to the correct endpoint
      const getRequest = mockFetch.requests.find(req =>
        req.url.includes('/transactions/txn-123')
      );

      assert.ok(getRequest, 'GET request to transaction endpoint should be made');
      assert.strictEqual(getRequest.options.method, 'GET');

      // Verify response
      assert.strictEqual(result.transactionId, 'txn-123');
      assert.strictEqual(result.status, 'confirmed');
      assert.strictEqual(result.amount, 5000);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('throws RegistrationError if not registered', async () => {
    const unregisteredBeacon = createTestBeacon(mockFetch);

    await assert.rejects(
      () => unregisteredBeacon.getTransaction('txn-123'),
      RegistrationError,
      'Should throw RegistrationError when not registered'
    );
  });
});
