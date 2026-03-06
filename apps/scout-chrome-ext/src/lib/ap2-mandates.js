/**
 * AP2 Mandates (Agent Payments Protocol)
 *
 * Creates and validates AP2 mandates for secure agent-mediated payments.
 * Browser-compatible implementation using tweetnacl for signing.
 *
 * Mandate chain: Intent → Cart → Payment
 * Each mandate is signed with Ed25519 and references its predecessor.
 *
 * Mirrors the patterns from sdks/scout-js/src/ap2/mandates.js.
 */

import * as cryptoManager from './crypto-manager.js';
import { MandateError } from '../shared/errors.js';

/**
 * Create an Intent Mandate.
 *
 * Authorises the agent to shop on behalf of the user within constraints.
 *
 * @param {Object} params
 * @param {string} params.agentId - Scout agent ID
 * @param {string} params.userId - User identifier
 * @param {Object} params.constraints
 * @param {number} params.constraints.maxAmount
 * @param {string} [params.constraints.currency='USD']
 * @param {string[]} [params.constraints.categories]
 * @param {string} [params.constraints.validUntil]
 * @returns {Promise<Object>} Signed intent mandate
 */
export async function createIntentMandate({
  agentId,
  userId,
  constraints,
  metadata = {},
}) {
  const mandate = {
    type: 'intent',
    version: '1.0',
    id: generateMandateId(),
    issuedAt: new Date().toISOString(),
    issuer: { type: 'user', id: userId },
    subject: { type: 'agent', id: agentId },
    constraints: {
      maxAmount: constraints.maxAmount,
      currency: constraints.currency || 'USD',
      categories: constraints.categories || [],
      validUntil: constraints.validUntil || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      validFrom: constraints.validFrom || new Date().toISOString(),
      merchantAllowlist: constraints.merchantAllowlist || null,
      merchantBlocklist: constraints.merchantBlocklist || null,
      requireUserPresent: constraints.requireUserPresent ?? false,
      maxTransactions: constraints.maxTransactions || null,
    },
    metadata,
  };

  const proof = await signMandate(mandate, userId);
  return { ...mandate, proof };
}

/**
 * Create a Cart Mandate.
 *
 * Authorises a specific offer for purchase. References the intent mandate.
 *
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {Object} params.offer
 * @param {string} params.userId
 * @param {string} params.intentMandateId
 * @returns {Promise<Object>} Signed cart mandate
 */
export async function createCartMandate({
  sessionId,
  offer,
  userId,
  intentMandateId,
  metadata = {},
}) {
  const mandate = {
    type: 'cart',
    version: '1.0',
    id: generateMandateId(),
    issuedAt: new Date().toISOString(),
    issuer: { type: 'user', id: userId },
    intentMandateRef: intentMandateId,
    cart: {
      sessionId,
      offerId: offer.id,
      merchantId: offer.beaconId,
      merchantName: offer.beaconName,
      items: [{
        product: offer.product,
        quantity: offer.quantity,
        unitPrice: offer.unitPrice,
        currency: offer.currency || 'USD',
      }],
      totalAmount: offer.totalPrice || (offer.unitPrice * offer.quantity),
      currency: offer.currency || 'USD',
      deliveryDate: offer.deliveryDate,
    },
    userPresent: true,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    metadata,
  };

  const proof = await signMandate(mandate, userId);
  return { ...mandate, proof };
}

/**
 * Create a Payment Mandate.
 *
 * Authorises the agent to execute payment. References the cart mandate.
 *
 * @param {Object} params
 * @param {Object} params.cartMandate
 * @param {Object} params.paymentMethod
 * @param {string} params.agentId
 * @param {string} [params.tapId]
 * @returns {Promise<Object>} Signed payment mandate
 */
export async function createPaymentMandate({
  cartMandate,
  paymentMethod,
  agentId,
  tapId = null,
}) {
  const mandate = {
    type: 'payment',
    version: '1.0',
    id: generateMandateId(),
    issuedAt: new Date().toISOString(),
    cartMandateRef: cartMandate.id,
    agent: {
      id: agentId,
      tapId,
    },
    transaction: {
      amount: cartMandate.cart.totalAmount,
      currency: cartMandate.cart.currency,
      merchantId: cartMandate.cart.merchantId,
      merchantName: cartMandate.cart.merchantName,
    },
    userPresent: cartMandate.userPresent,
    paymentMethod: {
      type: paymentMethod.type || 'card',
      network: paymentMethod.network || 'visa',
      tokenized: true,
    },
    riskSignals: {
      userAuthTime: cartMandate.issuedAt,
      intentMandatePresent: !!cartMandate.intentMandateRef,
      constraintsValid: true,
      amountWithinLimit: true,
    },
  };

  const proof = await signMandate(mandate, agentId);
  return { ...mandate, proof };
}

/**
 * Validate that an intent mandate covers a proposed purchase.
 *
 * @param {Object} intentMandate
 * @param {Object} purchase - { totalAmount, currency, category, merchantId }
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateIntentCoverage(intentMandate, purchase) {
  const c = intentMandate.constraints;
  const errors = [];

  if (purchase.totalAmount > c.maxAmount) {
    errors.push(`Amount ${purchase.totalAmount} exceeds max ${c.maxAmount}`);
  }

  if (c.currency && purchase.currency !== c.currency) {
    errors.push(`Currency ${purchase.currency} not allowed (expected ${c.currency})`);
  }

  const now = new Date();
  if (c.validFrom && new Date(c.validFrom) > now) {
    errors.push('Mandate not yet valid');
  }
  if (c.validUntil && new Date(c.validUntil) < now) {
    errors.push('Mandate expired');
  }

  if (c.categories?.length > 0 && purchase.category) {
    if (!c.categories.includes(purchase.category)) {
      errors.push(`Category ${purchase.category} not in allowed list`);
    }
  }

  if (c.merchantAllowlist?.length > 0) {
    if (!c.merchantAllowlist.includes(purchase.merchantId)) {
      errors.push('Merchant not in allowlist');
    }
  }

  if (c.merchantBlocklist?.length > 0) {
    if (c.merchantBlocklist.includes(purchase.merchantId)) {
      errors.push('Merchant is blocklisted');
    }
  }

  return { valid: errors.length === 0, errors };
}

// =========================================================================
// Internal Helpers
// =========================================================================

/**
 * Sign a mandate with Ed25519.
 *
 * @param {Object} mandate - Mandate object (without proof)
 * @param {string} signerId - Signer identifier
 * @returns {Promise<Object>} Proof object
 */
async function signMandate(mandate, signerId) {
  const canonical = canonicalize(mandate);
  const signature = await cryptoManager.sign(canonical);

  return {
    type: 'Ed25519Signature2020',
    created: new Date().toISOString(),
    verificationMethod: `did:key:${signerId}#keys-1`,
    proofPurpose: 'assertionMethod',
    proofValue: signature,
  };
}

/**
 * Canonical JSON serialisation for deterministic signing.
 */
function canonicalize(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/**
 * Generate a unique mandate ID.
 */
function generateMandateId() {
  const timestamp = Date.now().toString(36);
  const random = Array.from(crypto.getRandomValues(new Uint8Array(5)))
    .map(b => b.toString(36))
    .join('');
  return `mandate_${timestamp}_${random}`;
}
