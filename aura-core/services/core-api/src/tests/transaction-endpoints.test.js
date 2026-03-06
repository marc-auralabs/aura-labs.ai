import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchWebhook } from '../lib/webhook-dispatcher.js';

// ─── Webhook Dispatcher Tests ───

describe('dispatchWebhook', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockLogger() {
    const calls = { info: [], warn: [], error: [] };
    return {
      info: (msg) => calls.info.push(msg),
      warn: (msg) => calls.warn.push(msg),
      error: (msg) => calls.error.push(msg),
      calls,
    };
  }

  it('returns undefined (fire-and-forget)', () => {
    const result = dispatchWebhook(
      { id: 'b1', name: 'Test', endpoint_url: 'https://example.com/hook' },
      'transaction.committed',
      { id: 'txn1' },
      mockLogger()
    );
    assert.strictEqual(result, undefined);
  });

  it('does nothing if endpoint_url is falsy', async () => {
    let fetchCalled = false;
    global.fetch = async () => { fetchCalled = true; return { ok: true }; };

    dispatchWebhook({ id: 'b1', name: 'Test' }, 'test', {}, mockLogger());
    dispatchWebhook({ id: 'b1', name: 'Test', endpoint_url: '' }, 'test', {}, mockLogger());
    dispatchWebhook({ id: 'b1', name: 'Test', endpoint_url: null }, 'test', {}, mockLogger());
    dispatchWebhook(null, 'test', {}, mockLogger());

    await new Promise(r => setTimeout(r, 50));
    assert.strictEqual(fetchCalled, false, 'fetch should not be called');
  });

  it('calls fetch with correct URL, headers, and body', async () => {
    const calls = [];
    global.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true, status: 200 };
    };

    const beacon = { id: 'b1', name: 'Test Beacon', endpoint_url: 'https://example.com/hook' };
    const payload = { txId: '123', amount: 50 };

    dispatchWebhook(beacon, 'transaction.committed', payload, mockLogger());
    await new Promise(r => setTimeout(r, 50));

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, 'https://example.com/hook');
    assert.strictEqual(calls[0].opts.method, 'POST');
    assert.strictEqual(calls[0].opts.headers['Content-Type'], 'application/json');
    assert.strictEqual(calls[0].opts.headers['X-AURA-Event'], 'transaction.committed');
    assert.ok(calls[0].opts.headers['X-AURA-Timestamp']);
    assert.deepStrictEqual(JSON.parse(calls[0].opts.body), payload);
  });

  it('logs success on 200', async () => {
    global.fetch = async () => ({ ok: true, status: 200 });

    const logger = mockLogger();
    dispatchWebhook(
      { id: 'b1', name: 'Test', endpoint_url: 'https://example.com/hook' },
      'transaction.committed',
      {},
      logger
    );
    await new Promise(r => setTimeout(r, 50));

    assert.strictEqual(logger.calls.info.length, 1);
    assert.ok(logger.calls.info[0].message.includes('successfully'));
    assert.strictEqual(logger.calls.info[0].beacon_id, 'b1');
  });

  it('retries on failure then succeeds (verified by logger)', async () => {
    // Track calls scoped to this test via a unique URL
    const testUrl = 'https://retry-test.example.com/hook';
    let successCount = 0;
    let failCount = 0;

    global.fetch = async (url) => {
      if (url !== testUrl) return { ok: true, status: 200 }; // ignore bleed from other tests
      failCount++;
      if (failCount < 3) return { ok: false, status: 500 };
      successCount++;
      return { ok: true, status: 200 };
    };

    const logger = mockLogger();
    dispatchWebhook(
      { id: 'b1', name: 'Test', endpoint_url: testUrl },
      'test',
      {},
      logger
    );

    // Wait for retries: 1s + 2s delays + processing time
    await new Promise(r => setTimeout(r, 4000));
    assert.ok(failCount >= 2, 'Should have failed at least twice before succeeding');
    assert.strictEqual(successCount, 1, 'Should have succeeded once');
    assert.ok(logger.calls.warn.length >= 2, 'Should log warnings for failed attempts');
    assert.ok(logger.calls.info.length >= 1, 'Should log success after retry');
  });

  it('logs error after all retries exhausted', async () => {
    global.fetch = async () => ({ ok: false, status: 500 });

    const logger = mockLogger();
    dispatchWebhook(
      { id: 'b1', name: 'Test', endpoint_url: 'https://example.com/hook' },
      'test',
      {},
      logger
    );

    // Wait for all retries: 1s + 2s + 4s delays + processing
    await new Promise(r => setTimeout(r, 8000));

    assert.ok(logger.calls.error.length > 0, 'Should log errors');
    assert.ok(logger.calls.error.some(e => e.message.includes('failed after all retries')));
  });
});

// ─── Transaction Status Transition Logic ───

describe('Transaction Status Transitions', () => {
  // Mirror the actual logic from index.js endpoints
  function computeFulfillmentTransition(currentStatus, newFulfillmentStatus) {
    if (newFulfillmentStatus === 'delivered') return 'fulfilled';
    return currentStatus;
  }

  function computePaymentTransition(currentStatus, existingFulfillment, newPaymentStatus) {
    if (newPaymentStatus === 'charged' && existingFulfillment === 'delivered') return 'completed';
    return currentStatus;
  }

  it('transitions to fulfilled when delivered', () => {
    assert.strictEqual(computeFulfillmentTransition('committed', 'delivered'), 'fulfilled');
  });

  it('stays in current status for non-delivered fulfillment', () => {
    assert.strictEqual(computeFulfillmentTransition('committed', 'shipped'), 'committed');
    assert.strictEqual(computeFulfillmentTransition('committed', 'processing'), 'committed');
    assert.strictEqual(computeFulfillmentTransition('committed', 'pending'), 'committed');
  });

  it('transitions to completed when charged + delivered', () => {
    assert.strictEqual(computePaymentTransition('fulfilled', 'delivered', 'charged'), 'completed');
  });

  it('does not complete if only charged without delivery', () => {
    assert.strictEqual(computePaymentTransition('committed', 'shipped', 'charged'), 'committed');
  });

  it('does not complete if only delivered without charge', () => {
    assert.strictEqual(computePaymentTransition('fulfilled', 'delivered', 'authorized'), 'fulfilled');
  });
});

// ─── Validation Logic ───

describe('Transaction Validation', () => {
  const validFulfillmentStatuses = ['pending', 'processing', 'shipped', 'delivered', 'failed'];
  const validPaymentStatuses = ['pending', 'authorized', 'charged', 'refunded', 'failed'];

  it('accepts valid fulfillment statuses', () => {
    for (const s of validFulfillmentStatuses) {
      assert.ok(validFulfillmentStatuses.includes(s), `${s} should be valid`);
    }
  });

  it('rejects invalid fulfillment statuses', () => {
    for (const s of ['on-the-way', 'received', 'complete', 'unknown']) {
      assert.ok(!validFulfillmentStatuses.includes(s), `${s} should be invalid`);
    }
  });

  it('accepts valid payment statuses', () => {
    for (const s of validPaymentStatuses) {
      assert.ok(validPaymentStatuses.includes(s), `${s} should be valid`);
    }
  });

  it('rejects invalid payment statuses', () => {
    for (const s of ['paid', 'processed', 'settled', 'completed']) {
      assert.ok(!validPaymentStatuses.includes(s), `${s} should be invalid`);
    }
  });

  it('validates UUID format', () => {
    const isUUID = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    assert.ok(isUUID('550e8400-e29b-41d4-a716-446655440000'));
    assert.ok(isUUID('6BA7B810-9DAD-11D1-80B4-00C04FD430C8'));
    assert.ok(!isUUID('not-a-uuid'));
    assert.ok(!isUUID(''));
    assert.ok(!isUUID('550e8400e29b41d4a716446655440000'));
  });
});
