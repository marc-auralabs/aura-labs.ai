/**
 * Test Setup and Utilities
 *
 * Common test infrastructure for Core API testing.
 */

import { randomUUID } from 'crypto';

// Test configuration
export const TEST_CONFIG = {
  baseUrl: process.env.TEST_API_URL || 'http://localhost:3000',
  timeout: 10000,
};

/**
 * HTTP client for tests
 */
export async function request(path, options = {}) {
  const url = `${TEST_CONFIG.baseUrl}${path}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Not JSON response
  }

  return {
    status: response.status,
    headers: response.headers,
    text,
    json,
    ok: response.ok,
  };
}

/**
 * Generate test fixtures
 */
export const fixtures = {
  scoutId: () => randomUUID(),
  beaconId: () => randomUUID(),
  sessionId: () => randomUUID(),

  validIntent: () => ({
    intent: 'I need 500 industrial widgets',
    constraints: { maxBudget: 50000 },
  }),

  validBeacon: (overrides = {}) => ({
    externalId: `test-beacon-${Date.now()}`,
    name: 'Test Beacon',
    description: 'A test beacon',
    capabilities: { products: ['widgets'] },
    ...overrides,
  }),

  validOffer: (beaconId, overrides = {}) => ({
    beaconId,
    product: { name: 'Test Product', sku: 'TEST-001' },
    unitPrice: 100.00,
    quantity: 10,
    currency: 'USD',
    deliveryDate: '2026-03-01',
    ...overrides,
  }),

  // Malicious inputs for security testing
  sqlInjection: {
    basic: "'; DROP TABLE sessions; --",
    union: "' UNION SELECT * FROM scouts --",
    blind: "' OR '1'='1",
    timeBasedBlind: "'; SELECT pg_sleep(10); --",
  },

  xssPayloads: {
    basic: '<script>alert("xss")</script>',
    encoded: '&lt;script&gt;alert("xss")&lt;/script&gt;',
    eventHandler: '<img src=x onerror=alert("xss")>',
  },

  invalidUUIDs: {
    sqlInjection: "'; DROP TABLE sessions; --",
    tooLong: 'a'.repeat(1000),
    empty: '',
    null: null,
    number: 12345,
    object: { id: 'test' },
  },

  oversizedPayloads: {
    largeString: 'x'.repeat(1024 * 1024), // 1MB
    deepNesting: JSON.parse('{"a":'.repeat(100) + '1' + '}'.repeat(100)),
  },
};

/**
 * Assertion helpers
 */
export const assert = {
  equal(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  },

  notEqual(actual, expected, message) {
    if (actual === expected) {
      throw new Error(message || `Expected value to not equal ${expected}`);
    }
  },

  ok(value, message) {
    if (!value) {
      throw new Error(message || `Expected truthy value, got ${value}`);
    }
  },

  isUUID(value, message) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
      throw new Error(message || `Expected valid UUID, got ${value}`);
    }
  },

  statusCode(response, expected, message) {
    if (response.status !== expected) {
      throw new Error(
        message ||
        `Expected status ${expected}, got ${response.status}: ${JSON.stringify(response.json)}`
      );
    }
  },

  hasProperty(obj, prop, message) {
    if (!(prop in obj)) {
      throw new Error(message || `Expected object to have property ${prop}`);
    }
  },

  doesNotContain(str, substring, message) {
    if (str && str.includes(substring)) {
      throw new Error(message || `String should not contain "${substring}"`);
    }
  },
};

/**
 * Test runner utilities
 */
export function describe(name, fn) {
  console.log(`\n📦 ${name}`);
  fn();
}

export function it(name, fn) {
  return { name, fn };
}

export async function runTests(tests) {
  const results = { passed: 0, failed: 0, errors: [] };

  for (const test of tests) {
    try {
      await test.fn();
      console.log(`  ✅ ${test.name}`);
      results.passed++;
    } catch (error) {
      console.log(`  ❌ ${test.name}`);
      console.log(`     ${error.message}`);
      results.failed++;
      results.errors.push({ name: test.name, error: error.message });
    }
  }

  return results;
}

export function summary(results) {
  console.log('\n' + '═'.repeat(60));
  console.log(`Tests: ${results.passed} passed, ${results.failed} failed`);
  if (results.failed > 0) {
    console.log('\nFailed tests:');
    for (const { name, error } of results.errors) {
      console.log(`  - ${name}: ${error}`);
    }
  }
  console.log('═'.repeat(60) + '\n');
  return results.failed === 0;
}
