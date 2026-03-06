/**
 * AP2 Mandates Tests
 *
 * Tests mandate creation, signing, and validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createIntentMandate,
  createCartMandate,
  createPaymentMandate,
  validateIntentCoverage,
} from '../src/lib/ap2-mandates.js';

// Mock crypto manager
vi.mock('../src/lib/crypto-manager.js', () => ({
  sign: vi.fn().mockResolvedValue('mock_ed25519_signature'),
}));

// Mock crypto.getRandomValues for deterministic IDs
vi.stubGlobal('crypto', {
  getRandomValues: (arr) => {
    for (let i = 0; i < arr.length; i++) arr[i] = (i * 7 + 3) % 256;
    return arr;
  },
});

describe('AP2Mandates', () => {
  describe('createIntentMandate', () => {
    it('should create a signed intent mandate', async () => {
      const mandate = await createIntentMandate({
        agentId: 'agent_1',
        userId: 'user_1',
        constraints: {
          maxAmount: 1500,
          currency: 'USD',
          categories: ['electronics'],
        },
      });

      expect(mandate.type).toBe('intent');
      expect(mandate.version).toBe('1.0');
      expect(mandate.id).toMatch(/^mandate_/);
      expect(mandate.issuer).toEqual({ type: 'user', id: 'user_1' });
      expect(mandate.subject).toEqual({ type: 'agent', id: 'agent_1' });
      expect(mandate.constraints.maxAmount).toBe(1500);
      expect(mandate.constraints.currency).toBe('USD');
      expect(mandate.proof.type).toBe('Ed25519Signature2020');
      expect(mandate.proof.proofValue).toBe('mock_ed25519_signature');
    });

    it('should set default currency to USD', async () => {
      const mandate = await createIntentMandate({
        agentId: 'a', userId: 'u',
        constraints: { maxAmount: 100 },
      });
      expect(mandate.constraints.currency).toBe('USD');
    });
  });

  describe('createCartMandate', () => {
    it('should create a signed cart mandate referencing intent', async () => {
      const mandate = await createCartMandate({
        sessionId: 'sess_1',
        offer: {
          id: 'offer_1',
          beaconId: 'beacon_1',
          beaconName: 'Test Vendor',
          product: { name: 'Keyboard', sku: 'KB-100' },
          unitPrice: 50,
          quantity: 10,
          totalPrice: 500,
          currency: 'USD',
          deliveryDate: '2026-03-15',
        },
        userId: 'user_1',
        intentMandateId: 'mandate_abc_123',
      });

      expect(mandate.type).toBe('cart');
      expect(mandate.intentMandateRef).toBe('mandate_abc_123');
      expect(mandate.cart.offerId).toBe('offer_1');
      expect(mandate.cart.totalAmount).toBe(500);
      expect(mandate.cart.merchantName).toBe('Test Vendor');
      expect(mandate.userPresent).toBe(true);
      expect(mandate.expiresAt).toBeDefined();
      expect(mandate.proof.type).toBe('Ed25519Signature2020');
    });
  });

  describe('createPaymentMandate', () => {
    it('should create a signed payment mandate referencing cart', async () => {
      const cartMandate = {
        id: 'mandate_cart_1',
        intentMandateRef: 'mandate_intent_1',
        issuedAt: new Date().toISOString(),
        userPresent: true,
        cart: {
          totalAmount: 500,
          currency: 'USD',
          merchantId: 'beacon_1',
          merchantName: 'Test Vendor',
        },
      };

      const mandate = await createPaymentMandate({
        cartMandate,
        paymentMethod: { type: 'card', network: 'visa' },
        agentId: 'agent_1',
        tapId: 'tap_agent_1',
      });

      expect(mandate.type).toBe('payment');
      expect(mandate.cartMandateRef).toBe('mandate_cart_1');
      expect(mandate.agent.id).toBe('agent_1');
      expect(mandate.agent.tapId).toBe('tap_agent_1');
      expect(mandate.transaction.amount).toBe(500);
      expect(mandate.paymentMethod.tokenized).toBe(true);
      expect(mandate.riskSignals.intentMandatePresent).toBe(true);
      expect(mandate.proof.type).toBe('Ed25519Signature2020');
    });
  });

  describe('validateIntentCoverage', () => {
    const intentMandate = {
      constraints: {
        maxAmount: 1500,
        currency: 'USD',
        categories: ['electronics', 'office-supplies'],
        validFrom: new Date(Date.now() - 60000).toISOString(),
        validUntil: new Date(Date.now() + 3600000).toISOString(),
        merchantAllowlist: null,
        merchantBlocklist: ['blocked_vendor'],
      },
    };

    it('should validate a valid purchase', () => {
      const result = validateIntentCoverage(intentMandate, {
        totalAmount: 500,
        currency: 'USD',
        category: 'electronics',
        merchantId: 'good_vendor',
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject amount exceeding max', () => {
      const result = validateIntentCoverage(intentMandate, {
        totalAmount: 2000,
        currency: 'USD',
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('exceeds max');
    });

    it('should reject wrong currency', () => {
      const result = validateIntentCoverage(intentMandate, {
        totalAmount: 500,
        currency: 'EUR',
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Currency');
    });

    it('should reject blocklisted merchant', () => {
      const result = validateIntentCoverage(intentMandate, {
        totalAmount: 500,
        currency: 'USD',
        merchantId: 'blocked_vendor',
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('blocklisted');
    });

    it('should reject disallowed category', () => {
      const result = validateIntentCoverage(intentMandate, {
        totalAmount: 500,
        currency: 'USD',
        category: 'travel',
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Category');
    });
  });
});
