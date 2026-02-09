/**
 * AP2 Mandates for AURA Scout SDK
 *
 * Implements Google's Agent Payments Protocol (AP2) mandate system
 * for secure, auditable AI agent payments.
 *
 * Mandate Types:
 * - Intent Mandate: User authorizes agent to shop within constraints
 * - Cart Mandate: User authorizes specific purchase
 * - Payment Mandate: Authorization for payment network
 *
 * @see https://ap2-protocol.org/specification/
 */

import { createHash, createSign, createVerify, generateKeyPairSync } from 'crypto';

/**
 * AP2 Mandates - Create and validate payment mandates
 */
export class AP2Mandates {
  /**
   * Create an Intent Mandate
   *
   * Intent mandates authorize an agent to shop on behalf of a user
   * within specified constraints (amount, categories, time, etc.)
   *
   * @param {Object} params
   * @param {string} params.agentId - ID of the authorized agent
   * @param {Object} params.constraints - Shopping constraints
   * @param {number} params.constraints.maxAmount - Maximum purchase amount
   * @param {string} params.constraints.currency - Currency code (USD, EUR, etc.)
   * @param {string[]} params.constraints.categories - Allowed product categories
   * @param {string} params.constraints.validUntil - ISO date string
   * @param {string} params.constraints.merchantAllowlist - Optional merchant IDs
   * @param {Object} params.userKey - User's signing key (private key)
   * @returns {Object} Signed intent mandate
   */
  static async createIntent({
    agentId,
    constraints,
    userKey,
    userId,
    metadata = {},
  }) {
    const mandate = {
      type: 'intent',
      version: '1.0',
      id: generateMandateId(),
      issuedAt: new Date().toISOString(),
      issuer: {
        type: 'user',
        id: userId,
      },
      subject: {
        type: 'agent',
        id: agentId,
      },
      constraints: {
        maxAmount: constraints.maxAmount,
        currency: constraints.currency || 'USD',
        categories: constraints.categories || [],
        validUntil: constraints.validUntil,
        validFrom: constraints.validFrom || new Date().toISOString(),
        merchantAllowlist: constraints.merchantAllowlist || null,
        merchantBlocklist: constraints.merchantBlocklist || null,
        requireUserPresent: constraints.requireUserPresent ?? false,
        maxTransactions: constraints.maxTransactions || null,
      },
      metadata,
    };

    // Create canonical form for signing
    const canonical = canonicalize(mandate);
    const signature = await sign(canonical, userKey);

    return {
      ...mandate,
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        verificationMethod: `did:key:${userId}#keys-1`,
        proofPurpose: 'assertionMethod',
        proofValue: signature,
      },
    };
  }

  /**
   * Create a Cart Mandate
   *
   * Cart mandates authorize a specific purchase (exact items, price).
   * Created when user explicitly approves a particular offer.
   *
   * @param {Object} params
   * @param {string} params.sessionId - Commerce session ID
   * @param {Object} params.offer - The specific offer being authorized
   * @param {Object} params.userKey - User's signing key
   * @returns {Object} Signed cart mandate
   */
  static async createCart({
    sessionId,
    offer,
    userKey,
    userId,
    intentMandateId,
    metadata = {},
  }) {
    const mandate = {
      type: 'cart',
      version: '1.0',
      id: generateMandateId(),
      issuedAt: new Date().toISOString(),
      issuer: {
        type: 'user',
        id: userId,
      },
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
      userPresent: true, // User explicitly approved
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
      metadata,
    };

    const canonical = canonicalize(mandate);
    const signature = await sign(canonical, userKey);

    return {
      ...mandate,
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        verificationMethod: `did:key:${userId}#keys-1`,
        proofPurpose: 'assertionMethod',
        proofValue: signature,
      },
    };
  }

  /**
   * Create a Payment Mandate
   *
   * Payment mandates are shared with the payment network to provide
   * context about the AI agent transaction.
   *
   * @param {Object} params
   * @param {Object} params.cartMandate - The cart mandate being paid
   * @param {Object} params.paymentMethod - Payment method details
   * @param {Object} params.agentKey - Agent's signing key
   * @returns {Object} Signed payment mandate
   */
  static async createPayment({
    cartMandate,
    paymentMethod,
    agentId,
    agentKey,
    tapCredentials = null,
  }) {
    const mandate = {
      type: 'payment',
      version: '1.0',
      id: generateMandateId(),
      issuedAt: new Date().toISOString(),
      cartMandateRef: cartMandate.id,
      agent: {
        id: agentId,
        tapId: tapCredentials?.tapId || null, // Visa TAP registration
      },
      transaction: {
        amount: cartMandate.cart.totalAmount,
        currency: cartMandate.cart.currency,
        merchantId: cartMandate.cart.merchantId,
        merchantName: cartMandate.cart.merchantName,
      },
      userPresent: cartMandate.userPresent,
      paymentMethod: {
        type: paymentMethod.type, // 'card', 'bank', 'crypto'
        network: paymentMethod.network, // 'visa', 'mastercard', etc.
        tokenized: true, // Always use tokens, never raw card numbers
      },
      riskSignals: {
        userAuthTime: cartMandate.issuedAt,
        agentSessionDuration: calculateSessionDuration(cartMandate),
        intentMandatePresent: !!cartMandate.intentMandateRef,
      },
    };

    const canonical = canonicalize(mandate);
    const signature = await sign(canonical, agentKey);

    return {
      ...mandate,
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        verificationMethod: `did:agent:${agentId}#keys-1`,
        proofPurpose: 'assertionMethod',
        proofValue: signature,
      },
    };
  }

  /**
   * Verify a mandate's signature
   */
  static async verify(mandate, publicKey) {
    if (!mandate.proof?.proofValue) {
      return { valid: false, error: 'No proof present' };
    }

    const proof = mandate.proof;
    const mandateWithoutProof = { ...mandate };
    delete mandateWithoutProof.proof;

    const canonical = canonicalize(mandateWithoutProof);

    try {
      const isValid = await verifySignature(canonical, proof.proofValue, publicKey);
      return { valid: isValid };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Check if an intent mandate covers a proposed purchase
   */
  static validateIntentCoverage(intentMandate, proposedPurchase) {
    const c = intentMandate.constraints;
    const errors = [];

    // Check amount
    if (proposedPurchase.totalAmount > c.maxAmount) {
      errors.push(`Amount ${proposedPurchase.totalAmount} exceeds max ${c.maxAmount}`);
    }

    // Check currency
    if (c.currency && proposedPurchase.currency !== c.currency) {
      errors.push(`Currency ${proposedPurchase.currency} not allowed (expected ${c.currency})`);
    }

    // Check validity period
    const now = new Date();
    if (c.validFrom && new Date(c.validFrom) > now) {
      errors.push('Mandate not yet valid');
    }
    if (c.validUntil && new Date(c.validUntil) < now) {
      errors.push('Mandate expired');
    }

    // Check categories
    if (c.categories?.length > 0 && proposedPurchase.category) {
      if (!c.categories.includes(proposedPurchase.category)) {
        errors.push(`Category ${proposedPurchase.category} not in allowed list`);
      }
    }

    // Check merchant allowlist
    if (c.merchantAllowlist?.length > 0) {
      if (!c.merchantAllowlist.includes(proposedPurchase.merchantId)) {
        errors.push('Merchant not in allowlist');
      }
    }

    // Check merchant blocklist
    if (c.merchantBlocklist?.length > 0) {
      if (c.merchantBlocklist.includes(proposedPurchase.merchantId)) {
        errors.push('Merchant is blocklisted');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate unique mandate ID
 */
function generateMandateId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `mandate_${timestamp}_${random}`;
}

/**
 * Canonicalize object for signing (deterministic JSON)
 */
function canonicalize(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/**
 * Sign data with private key
 */
async function sign(data, privateKey) {
  // In production, use proper Ed25519 signing
  // For now, use Node.js crypto
  if (typeof privateKey === 'string') {
    // Assume PEM format
    const signer = createSign('sha256');
    signer.update(data);
    return signer.sign(privateKey, 'base64');
  }

  // Mock signing for development
  const hash = createHash('sha256').update(data).digest('base64');
  return `mock_signature_${hash.substring(0, 20)}`;
}

/**
 * Verify signature
 */
async function verifySignature(data, signature, publicKey) {
  if (signature.startsWith('mock_signature_')) {
    // Mock verification for development
    const hash = createHash('sha256').update(data).digest('base64');
    return signature === `mock_signature_${hash.substring(0, 20)}`;
  }

  // Real verification
  const verifier = createVerify('sha256');
  verifier.update(data);
  return verifier.verify(publicKey, signature, 'base64');
}

/**
 * Calculate session duration from mandate timestamps
 */
function calculateSessionDuration(cartMandate) {
  const cartTime = new Date(cartMandate.issuedAt).getTime();
  const now = Date.now();
  return Math.floor((now - cartTime) / 1000); // seconds
}

/**
 * Generate a key pair for signing (development utility)
 */
export function generateKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

export default AP2Mandates;
