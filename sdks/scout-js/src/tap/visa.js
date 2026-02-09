/**
 * Visa TAP (Trusted Agent Protocol) for AURA Scout SDK
 *
 * Implements Visa's Trusted Agent Protocol for agent identity
 * verification in commerce transactions.
 *
 * Key Features:
 * - Agent registration with Visa directory
 * - HTTP message signing for transaction requests
 * - Identity verification for merchants/payment networks
 *
 * @see https://usa.visa.com/about-visa/newsroom/press-releases.releaseId.21716.html
 */

import { createHash, createSign, createVerify, generateKeyPairSync, randomBytes } from 'crypto';

// TAP Registry URL (would be Visa's in production)
const TAP_REGISTRY_URL = process.env.TAP_REGISTRY_URL || 'https://tap.visa.com/v1';

/**
 * Visa TAP - Trusted Agent Protocol implementation
 */
export class VisaTAP {
  /**
   * Generate a new agent key pair
   *
   * @returns {Object} Public and private keys
   */
  static generateKeyPair() {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    // Also generate key ID
    const keyId = createHash('sha256')
      .update(publicKey)
      .digest('hex')
      .substring(0, 16);

    return {
      keyId,
      publicKey,
      privateKey,
      algorithm: 'ed25519',
    };
  }

  /**
   * Register an agent with the TAP directory
   *
   * @param {Object} params
   * @param {string} params.agentId - Unique agent identifier
   * @param {string} params.publicKey - Agent's public key (PEM format)
   * @param {Object} params.metadata - Agent metadata
   * @returns {Object} Registration response with TAP ID
   */
  static async register({
    agentId,
    publicKey,
    metadata = {},
  }) {
    const registration = {
      agentId,
      publicKey,
      metadata: {
        name: metadata.name || 'AURA Agent',
        operator: metadata.operator || 'AURA Labs',
        capabilities: metadata.capabilities || ['shopping', 'payments'],
        version: metadata.version || '1.0',
        registeredAt: new Date().toISOString(),
      },
    };

    // In production, this would POST to Visa's TAP registry
    // For development, simulate registration
    if (process.env.NODE_ENV === 'production') {
      const response = await fetch(`${TAP_REGISTRY_URL}/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registration),
      });

      if (!response.ok) {
        throw new TAPError('Registration failed', await response.text());
      }

      return response.json();
    }

    // Development mode - simulate registration
    const tapId = `tap_${agentId}_${randomBytes(8).toString('hex')}`;
    return {
      tapId,
      agentId,
      status: 'active',
      registeredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
    };
  }

  /**
   * Sign an HTTP request for TAP verification
   *
   * Creates a signature that proves the request came from
   * a registered agent acting on behalf of a user.
   *
   * @param {Object} request - Request to sign
   * @param {string} request.method - HTTP method
   * @param {string} request.url - Request URL
   * @param {Object} request.headers - Request headers
   * @param {Object} request.body - Request body
   * @param {Object} credentials - TAP credentials
   * @param {string} credentials.tapId - TAP registration ID
   * @param {string} credentials.privateKey - Agent's private key
   * @param {string} credentials.keyId - Key identifier
   */
  static async signRequest(request, credentials) {
    const { method, url, headers = {}, body } = request;
    const { tapId, privateKey, keyId } = credentials;

    // Create signature input
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = randomBytes(16).toString('hex');

    // Build signature base string (HTTP Message Signatures spec)
    const signatureInput = this.#buildSignatureInput({
      method,
      url,
      headers,
      body,
      timestamp,
      nonce,
      tapId,
    });

    // Sign the input
    const signature = this.#sign(signatureInput, privateKey);

    // Build signature header
    const signatureHeader = this.#buildSignatureHeader({
      keyId,
      algorithm: 'ed25519',
      timestamp,
      nonce,
      signature,
    });

    // Return signed request with TAP headers
    return {
      ...request,
      headers: {
        ...headers,
        'X-TAP-Agent-Id': tapId,
        'X-TAP-Timestamp': timestamp.toString(),
        'X-TAP-Nonce': nonce,
        'Signature': signatureHeader,
        'Signature-Input': `sig=("@method" "@path" "@authority" "x-tap-agent-id" "x-tap-timestamp" "x-tap-nonce");keyid="${keyId}";alg="ed25519";created=${timestamp}`,
      },
    };
  }

  /**
   * Verify a TAP-signed request
   *
   * Used by merchants/payment networks to verify agent identity.
   *
   * @param {Object} request - Request to verify
   * @param {Function} publicKeyLookup - Function to get public key from TAP registry
   */
  static async verifyRequest(request, publicKeyLookup) {
    const tapId = request.headers['x-tap-agent-id'];
    const timestamp = parseInt(request.headers['x-tap-timestamp']);
    const nonce = request.headers['x-tap-nonce'];
    const signatureHeader = request.headers['signature'];

    if (!tapId || !timestamp || !nonce || !signatureHeader) {
      return { valid: false, error: 'Missing TAP headers' };
    }

    // Check timestamp freshness (within 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > 300) {
      return { valid: false, error: 'Request timestamp too old or in future' };
    }

    // Look up public key from TAP registry
    let publicKey;
    try {
      publicKey = await publicKeyLookup(tapId);
    } catch (error) {
      return { valid: false, error: 'Agent not found in TAP registry' };
    }

    // Parse signature header
    const signature = this.#parseSignatureHeader(signatureHeader);

    // Rebuild signature input
    const signatureInput = this.#buildSignatureInput({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body,
      timestamp,
      nonce,
      tapId,
    });

    // Verify signature
    try {
      const isValid = this.#verify(signatureInput, signature, publicKey);
      return {
        valid: isValid,
        agentId: tapId,
        timestamp: new Date(timestamp * 1000).toISOString(),
      };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Create TAP credentials object for use in transactions
   */
  static createCredentials({ tapId, keyPair }) {
    return {
      tapId,
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
      keyId: keyPair.keyId,
    };
  }

  /**
   * Rotate agent keys (create new key pair and update registry)
   */
  static async rotateKeys(tapId, oldPrivateKey) {
    const newKeyPair = this.generateKeyPair();

    if (process.env.NODE_ENV === 'production') {
      // Sign the rotation request with old key
      const rotationRequest = {
        tapId,
        newPublicKey: newKeyPair.publicKey,
        timestamp: new Date().toISOString(),
      };

      const signature = this.#sign(
        JSON.stringify(rotationRequest),
        oldPrivateKey
      );

      const response = await fetch(`${TAP_REGISTRY_URL}/agents/${tapId}/keys/rotate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TAP-Signature': signature,
        },
        body: JSON.stringify(rotationRequest),
      });

      if (!response.ok) {
        throw new TAPError('Key rotation failed', await response.text());
      }
    }

    return newKeyPair;
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  /**
   * Build signature input string per HTTP Message Signatures spec
   */
  static #buildSignatureInput({ method, url, headers, body, timestamp, nonce, tapId }) {
    const urlObj = new URL(url, 'https://example.com');

    const components = [
      `"@method": ${method.toUpperCase()}`,
      `"@path": ${urlObj.pathname}`,
      `"@authority": ${urlObj.host}`,
      `"x-tap-agent-id": ${tapId}`,
      `"x-tap-timestamp": ${timestamp}`,
      `"x-tap-nonce": ${nonce}`,
    ];

    // Include content-digest for requests with body
    if (body) {
      const bodyHash = createHash('sha256')
        .update(typeof body === 'string' ? body : JSON.stringify(body))
        .digest('base64');
      components.push(`"content-digest": sha-256=:${bodyHash}:`);
    }

    return components.join('\n');
  }

  /**
   * Build signature header value
   */
  static #buildSignatureHeader({ keyId, algorithm, timestamp, nonce, signature }) {
    return `sig=:${signature}:`;
  }

  /**
   * Parse signature from header
   */
  static #parseSignatureHeader(header) {
    const match = header.match(/sig=:([^:]+):/);
    return match ? match[1] : null;
  }

  /**
   * Sign data with private key
   */
  static #sign(data, privateKey) {
    const signer = createSign('sha256');
    signer.update(data);
    return signer.sign(privateKey, 'base64');
  }

  /**
   * Verify signature with public key
   */
  static #verify(data, signature, publicKey) {
    const verifier = createVerify('sha256');
    verifier.update(data);
    return verifier.verify(publicKey, signature, 'base64');
  }
}

/**
 * TAP Protocol Error
 */
export class TAPError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'TAPError';
    this.details = details;
  }
}

export default VisaTAP;
