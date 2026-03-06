import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIntent,
  extractQuantity,
  extractPriceRange,
  extractDelivery,
  extractFeatures,
  extractKeywords,
} from '../lib/intent-parser.js';

// ─── extractQuantity ───

describe('extractQuantity', () => {
  it('extracts numeric quantities', () => {
    assert.deepStrictEqual(extractQuantity('500 units'), { amount: 500, unit: 'unit' });
    assert.deepStrictEqual(extractQuantity('1000 pieces'), { amount: 1000, unit: 'piece' });
    assert.deepStrictEqual(extractQuantity('50 boxes'), { amount: 50, unit: 'box' });
  });

  it('handles commas in numbers', () => {
    assert.deepStrictEqual(extractQuantity('5,000 units'), { amount: 5000, unit: 'unit' });
    assert.deepStrictEqual(extractQuantity('10,000 items'), { amount: 10000, unit: 'item' });
  });

  it('extracts quantity without unit word', () => {
    const result = extractQuantity('500 widgets');
    assert.strictEqual(result.amount, 500);
  });

  it('handles word-based quantities', () => {
    const result = extractQuantity('a dozen widgets');
    assert.strictEqual(result.amount, 12);
  });

  it('returns null for no quantity', () => {
    assert.strictEqual(extractQuantity('some nice widgets'), null);
  });
});


// ─── extractPriceRange ───

describe('extractPriceRange', () => {
  it('extracts max price from "under $X"', () => {
    const result = extractPriceRange('under $500');
    assert.strictEqual(result.max, 500);
    assert.strictEqual(result.currency, 'USD');
  });

  it('extracts max price from "max $X"', () => {
    const result = extractPriceRange('max $1000');
    assert.strictEqual(result.max, 1000);
  });

  it('extracts price range from "$X-$Y"', () => {
    const result = extractPriceRange('$50-$100');
    assert.strictEqual(result.min, 50);
    assert.strictEqual(result.max, 100);
  });

  it('detects EUR currency', () => {
    const result = extractPriceRange('under €200');
    assert.strictEqual(result.max, 200);
    assert.strictEqual(result.currency, 'EUR');
  });

  it('detects GBP currency', () => {
    const result = extractPriceRange('max £500');
    assert.strictEqual(result.max, 500);
    assert.strictEqual(result.currency, 'GBP');
  });

  it('extracts standalone price', () => {
    const result = extractPriceRange('$50 each');
    assert.strictEqual(result.max, 50);
  });

  it('returns null for no price', () => {
    assert.strictEqual(extractPriceRange('some nice widgets'), null);
  });
});


// ─── extractDelivery ───

describe('extractDelivery', () => {
  it('extracts "within N days"', () => {
    assert.deepStrictEqual(extractDelivery('within 3 days'), { within_days: 3 });
  });

  it('extracts "in N weeks"', () => {
    assert.deepStrictEqual(extractDelivery('in 2 weeks'), { within_days: 14 });
  });

  it('handles "urgent"', () => {
    assert.deepStrictEqual(extractDelivery('urgent delivery needed'), { within_days: 1 });
  });

  it('handles "next week"', () => {
    assert.deepStrictEqual(extractDelivery('deliver next week'), { within_days: 7 });
  });

  it('handles "ASAP"', () => {
    assert.deepStrictEqual(extractDelivery('need this ASAP'), { within_days: 1 });
  });

  it('returns null for no delivery constraint', () => {
    assert.strictEqual(extractDelivery('some nice widgets'), null);
  });
});


// ─── extractFeatures ───

describe('extractFeatures', () => {
  it('extracts color adjectives', () => {
    assert.deepStrictEqual(extractFeatures('red widgets'), ['red']);
  });

  it('extracts multiple features', () => {
    const features = extractFeatures('large red durable widget');
    assert.ok(features.includes('large'));
    assert.ok(features.includes('red'));
    assert.ok(features.includes('durable'));
  });

  it('extracts sustainability features', () => {
    const features = extractFeatures('sustainable organic packaging');
    assert.ok(features.includes('sustainable'));
    assert.ok(features.includes('organic'));
  });

  it('deduplicates features', () => {
    const features = extractFeatures('red red red widget');
    assert.strictEqual(features.filter(f => f === 'red').length, 1);
  });

  it('returns empty array for no features', () => {
    assert.deepStrictEqual(extractFeatures('some widgets'), []);
  });
});


// ─── extractKeywords ───

describe('extractKeywords', () => {
  it('removes stopwords', () => {
    const kw = extractKeywords('I need some nice widgets for my office');
    assert.ok(!kw.includes('i'));
    assert.ok(!kw.includes('need'));
    assert.ok(!kw.includes('some'));
    assert.ok(!kw.includes('for'));
    assert.ok(!kw.includes('my'));
    assert.ok(kw.includes('nice'));
    assert.ok(kw.includes('widgets'));
    assert.ok(kw.includes('office'));
  });

  it('removes single-character words', () => {
    const kw = extractKeywords('a b c widgets');
    assert.ok(!kw.includes('a'));
    assert.ok(!kw.includes('b'));
    assert.ok(!kw.includes('c'));
  });

  it('deduplicates keywords', () => {
    const kw = extractKeywords('widget widget widget');
    assert.strictEqual(kw.filter(k => k === 'widget').length, 1);
  });
});


// ─── parseIntent (integration) ───

describe('parseIntent', () => {
  it('parses a complex B2B intent', () => {
    const result = parseIntent('500 red widgets under $50 each delivered within 3 days');
    assert.ok(result.structured_requirements);
    assert.ok(result.confidence >= 0.8);
    assert.strictEqual(result.structured_requirements.quantity.amount, 500);
    assert.strictEqual(result.structured_requirements.price_range.max, 50);
    assert.strictEqual(result.structured_requirements.delivery.within_days, 3);
    assert.ok(result.structured_requirements.features.includes('red'));
    assert.ok(result.structured_requirements.keywords.includes('widgets'));
    assert.strictEqual(result.structured_requirements.category, 'widgets');
  });

  it('parses a simple consumer intent', () => {
    const result = parseIntent('I need a new laptop');
    assert.ok(result.structured_requirements.keywords.includes('laptop'));
    assert.ok(result.confidence >= 0.3);
  });

  it('merges explicit constraints', () => {
    const result = parseIntent('I need widgets', { price_range: { min: 10, max: 100, currency: 'EUR' } });
    assert.strictEqual(result.structured_requirements.price_range.min, 10);
    assert.strictEqual(result.structured_requirements.price_range.max, 100);
    assert.strictEqual(result.structured_requirements.price_range.currency, 'EUR');
  });

  it('handles empty input gracefully', () => {
    const result = parseIntent('');
    assert.strictEqual(result.confidence, 0.1);
    assert.deepStrictEqual(result.structured_requirements.keywords, []);
  });

  it('handles null input gracefully', () => {
    const result = parseIntent(null);
    assert.strictEqual(result.confidence, 0.1);
  });

  it('returns natural language context', () => {
    const result = parseIntent('500 widgets please');
    assert.strictEqual(result.natural_language_context, '500 widgets please');
  });

  it('handles EUR pricing', () => {
    const result = parseIntent('100 parts under €200 within 2 weeks');
    assert.strictEqual(result.structured_requirements.price_range.max, 200);
    assert.strictEqual(result.structured_requirements.price_range.currency, 'EUR');
    assert.strictEqual(result.structured_requirements.delivery.within_days, 14);
    assert.strictEqual(result.structured_requirements.quantity.amount, 100);
  });
});
