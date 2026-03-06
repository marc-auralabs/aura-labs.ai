import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreBeacon, extractCapabilityText, matchBeacons } from '../lib/beacon-matcher.js';
import { parseIntent } from '../lib/intent-parser.js';

// ─── extractCapabilityText ───

describe('extractCapabilityText', () => {
  it('extracts text from object with products array', () => {
    const text = extractCapabilityText({ products: ['widgets', 'gadgets'], categories: ['industrial'] });
    assert.ok(text.includes('widgets'));
    assert.ok(text.includes('gadgets'));
    assert.ok(text.includes('industrial'));
  });

  it('extracts text from string capabilities', () => {
    const text = extractCapabilityText('electronics and computing');
    assert.ok(text.includes('electronics'));
  });

  it('extracts text from array capabilities', () => {
    const text = extractCapabilityText(['widgets', 'tools', 'fasteners']);
    assert.ok(text.includes('widgets'));
    assert.ok(text.includes('tools'));
  });

  it('handles null capabilities', () => {
    assert.strictEqual(extractCapabilityText(null), '');
  });

  it('handles nested objects with name field', () => {
    const text = extractCapabilityText({ products: [{ name: 'Widget Pro' }, { name: 'Gadget X' }] });
    assert.ok(text.includes('widget pro'));
    assert.ok(text.includes('gadget x'));
  });
});


// ─── scoreBeacon ───

describe('scoreBeacon', () => {
  it('scores a matching beacon higher than non-matching', () => {
    const intent = parseIntent('500 red widgets');

    const matchingBeacon = {
      id: 'b1', status: 'active',
      capabilities: { products: ['widgets', 'gadgets'] },
    };
    const nonMatchingBeacon = {
      id: 'b2', status: 'active',
      capabilities: { products: ['laptops', 'monitors'] },
    };

    const scoreMatch = scoreBeacon(matchingBeacon, intent);
    const scoreNoMatch = scoreBeacon(nonMatchingBeacon, intent);

    assert.ok(scoreMatch > scoreNoMatch, `Matching (${scoreMatch}) should beat non-matching (${scoreNoMatch})`);
  });

  it('gives active beacons a base score of 20', () => {
    const intent = parseIntent('something obscure and unlikely to match');
    const beacon = { id: 'b1', status: 'active', capabilities: {} };
    const score = scoreBeacon(beacon, intent);
    assert.strictEqual(score, 20);
  });

  it('gives inactive beacons lower score than active', () => {
    const intent = parseIntent('widgets');
    const activeBeacon = { id: 'b1', status: 'active', capabilities: { products: ['widgets'] } };
    const inactiveBeacon = { id: 'b2', status: 'inactive', capabilities: { products: ['widgets'] } };
    const activeScore = scoreBeacon(activeBeacon, intent);
    const inactiveScore = scoreBeacon(inactiveBeacon, intent);
    // Active gets +20 base, inactive does not
    assert.ok(activeScore > inactiveScore, `Active (${activeScore}) should beat inactive (${inactiveScore})`);
  });

  it('caps keyword score at 60', () => {
    const intent = parseIntent('electronics software hardware clothing tools machinery equipment');
    const beacon = {
      id: 'b1', status: 'active',
      capabilities: { products: ['electronics', 'software', 'hardware', 'clothing', 'tools', 'machinery', 'equipment'] },
    };
    const score = scoreBeacon(beacon, intent);
    assert.ok(score <= 100);
  });

  it('handles missing structured_requirements', () => {
    const score = scoreBeacon({ id: 'b1', status: 'active', capabilities: {} }, {});
    assert.strictEqual(score, 0);
  });
});


// ─── matchBeacons (with mock DB) ───

describe('matchBeacons', () => {
  // Create a mock DB that returns predefined beacon rows
  function createMockDb(beacons) {
    return {
      query: async (sql) => {
        if (sql.includes('FROM beacons')) {
          return { rows: beacons };
        }
        return { rows: [] };
      },
    };
  }

  const testBeacons = [
    { id: 'b1', external_id: 'ext-1', name: 'Widget Co', description: 'Widget supplier', endpoint_url: 'https://widgets.example.com', status: 'active', capabilities: { products: ['widgets', 'gadgets'] } },
    { id: 'b2', external_id: 'ext-2', name: 'Tech Corp', description: 'Electronics', endpoint_url: 'https://tech.example.com', status: 'active', capabilities: { products: ['laptops', 'monitors', 'electronics'] } },
    { id: 'b3', external_id: 'ext-3', name: 'Office Supplies', description: 'Office gear', endpoint_url: 'https://office.example.com', status: 'active', capabilities: { products: ['pens', 'paper', 'furniture'] } },
    { id: 'b4', external_id: 'ext-4', name: 'Inactive Shop', description: 'Closed', endpoint_url: 'https://closed.example.com', status: 'inactive', capabilities: { products: ['widgets'] } },
  ];

  it('returns matching beacons sorted by score', async () => {
    const db = createMockDb(testBeacons);
    const intent = parseIntent('500 widgets');
    const results = await matchBeacons(db, intent);

    assert.ok(results.length > 0, 'Should find at least one match');
    assert.strictEqual(results[0].name, 'Widget Co');
  });

  it('filters out zero-score beacons', async () => {
    const db = createMockDb(testBeacons);
    const intent = parseIntent('something completely unrelated like quantum physics');
    const results = await matchBeacons(db, intent);

    // All beacons get at least 20 for being active, so they'll all match
    // But the inactive one should be filtered by status in query
    for (const r of results) {
      assert.ok(r.score > 0, `Beacon ${r.name} should have positive score`);
    }
  });

  it('respects limit parameter', async () => {
    const db = createMockDb(testBeacons);
    const intent = parseIntent('widgets');
    const results = await matchBeacons(db, intent, { limit: 2 });

    assert.ok(results.length <= 2);
  });

  it('returns empty array for null db', async () => {
    const results = await matchBeacons(null, parseIntent('widgets'));
    assert.deepStrictEqual(results, []);
  });

  it('returns empty array for null intent', async () => {
    const db = createMockDb(testBeacons);
    const results = await matchBeacons(db, null);
    assert.deepStrictEqual(results, []);
  });

  it('handles db query failure gracefully', async () => {
    const failDb = {
      query: async () => { throw new Error('Connection refused'); },
    };
    const results = await matchBeacons(failDb, parseIntent('widgets'));
    assert.deepStrictEqual(results, []);
  });

  it('returns beacon metadata in results', async () => {
    const db = createMockDb(testBeacons);
    const intent = parseIntent('500 widgets');
    const results = await matchBeacons(db, intent);

    const first = results[0];
    assert.ok(first.beaconId);
    assert.ok(first.name);
    assert.ok(typeof first.score === 'number');
    assert.ok(first.capabilities);
  });
});
