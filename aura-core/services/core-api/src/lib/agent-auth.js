/**
 * Agent Authentication — Ed25519 Signature Verification
 *
 * Provides cryptographic identity verification for AURA agents (Scouts and Beacons).
 * Agents prove identity by signing requests with their Ed25519 private key.
 * The server verifies signatures using the agent's registered public key.
 *
 * Signature scheme:
 *   - Registration: proof-of-possession — sign the request body, verify with provided publicKey
 *   - Authenticated requests: sign a canonical string (method + path + timestamp + body digest)
 *
 * Key format: raw 32-byte Ed25519 public keys, base64-encoded (compatible with tweetnacl.js)
 */

import crypto from 'node:crypto';

// Ed25519 SPKI DER prefix for 32-byte raw public keys
// This wraps a raw key in the ASN.1 structure Node's crypto API expects
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

// Maximum age of a signed request before it's considered stale (5 minutes)
const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000;

/**
 * Convert a raw 32-byte Ed25519 public key (base64) to a Node.js KeyObject
 *
 * tweetnacl.js and browser WebCrypto produce raw 32-byte Ed25519 public keys.
 * Node's crypto.verify() requires a KeyObject in SPKI format.
 *
 * @param {string} publicKeyBase64 - Base64-encoded raw 32-byte Ed25519 public key
 * @returns {crypto.KeyObject} Node.js KeyObject for verification
 * @throws {Error} If the key is malformed or not 32 bytes
 */
export function rawPublicKeyToKeyObject(publicKeyBase64) {
  const rawBytes = Buffer.from(publicKeyBase64, 'base64');

  if (rawBytes.length !== 32) {
    throw new Error(`Invalid Ed25519 public key: expected 32 bytes, got ${rawBytes.length}`);
  }

  const derKey = Buffer.concat([ED25519_SPKI_PREFIX, rawBytes]);
  return crypto.createPublicKey({ key: derKey, format: 'der', type: 'spki' });
}

/**
 * Compute a fingerprint for a public key
 *
 * SHA-256 of the raw public key bytes, returned as hex.
 * Used as a stable, human-readable identifier for keys.
 *
 * @param {string} publicKeyBase64 - Base64-encoded raw Ed25519 public key
 * @returns {string} Hex-encoded SHA-256 fingerprint (64 chars)
 */
export function computeKeyFingerprint(publicKeyBase64) {
  const rawBytes = Buffer.from(publicKeyBase64, 'base64');
  return crypto.createHash('sha256').update(rawBytes).digest('hex');
}

/**
 * Verify a proof-of-possession signature during agent registration
 *
 * The agent signs the canonical JSON body with their private key.
 * We verify using the public key from the request body itself.
 * This proves the registrant possesses the corresponding private key.
 *
 * @param {string} publicKeyBase64 - Base64-encoded raw Ed25519 public key (from body)
 * @param {string} signatureBase64 - Base64-encoded Ed25519 signature (from header)
 * @param {string} bodyString - The raw JSON request body string that was signed
 * @returns {boolean} True if signature is valid
 */
export function verifyRegistrationSignature(publicKeyBase64, signatureBase64, bodyString) {
  try {
    const keyObject = rawPublicKeyToKeyObject(publicKeyBase64);
    const message = Buffer.from(bodyString);
    const signature = Buffer.from(signatureBase64, 'base64');

    if (signature.length !== 64) {
      return false;
    }

    return crypto.verify(null, message, keyObject, signature);
  } catch {
    return false;
  }
}

/**
 * Build the canonical signing string for an authenticated request
 *
 * Format: "${method}\n${path}\n${timestamp}\n${bodyDigest}"
 * bodyDigest is base64(SHA-256(body)) for requests with a body, empty string otherwise.
 *
 * @param {string} method - HTTP method (uppercase)
 * @param {string} path - Request path (e.g., /sessions)
 * @param {string} timestamp - Unix timestamp in milliseconds (string)
 * @param {string|null} body - Raw request body string, or null for bodyless requests
 * @returns {string} The canonical string to sign/verify
 */
export function buildSigningString(method, path, timestamp, body) {
  const bodyDigest = body
    ? crypto.createHash('sha256').update(body).digest('base64')
    : '';
  return `${method}\n${path}\n${timestamp}\n${bodyDigest}`;
}

/**
 * Verify an authenticated request signature
 *
 * Reconstructs the canonical signing string from request components
 * and verifies the Ed25519 signature against the agent's public key.
 *
 * @param {object} params
 * @param {string} params.publicKeyBase64 - Agent's registered public key (base64)
 * @param {string} params.signatureBase64 - Signature from X-Agent-Signature header (base64)
 * @param {string} params.method - HTTP method (uppercase)
 * @param {string} params.path - Request path
 * @param {string} params.timestamp - Unix timestamp in ms from X-Agent-Timestamp header
 * @param {string|null} params.body - Raw request body string or null
 * @returns {{ valid: boolean, reason?: string }} Verification result with reason on failure
 */
export function verifyRequestSignature({ publicKeyBase64, signatureBase64, method, path, timestamp, body }) {
  // SECURITY: Reject stale timestamps to prevent replay attacks
  const now = Date.now();
  const requestTime = parseInt(timestamp, 10);

  if (isNaN(requestTime)) {
    return { valid: false, reason: 'Invalid timestamp format' };
  }

  if (Math.abs(now - requestTime) > MAX_TIMESTAMP_DRIFT_MS) {
    return { valid: false, reason: 'Request timestamp too far from server time' };
  }

  try {
    const signingString = buildSigningString(method, path, timestamp, body);
    const keyObject = rawPublicKeyToKeyObject(publicKeyBase64);
    const message = Buffer.from(signingString);
    const signature = Buffer.from(signatureBase64, 'base64');

    if (signature.length !== 64) {
      return { valid: false, reason: 'Invalid signature length' };
    }

    const valid = crypto.verify(null, message, keyObject, signature);
    return valid ? { valid: true } : { valid: false, reason: 'Signature verification failed' };
  } catch (error) {
    return { valid: false, reason: `Verification error: ${error.message}` };
  }
}

/**
 * Fastify preHandler hook that validates agent signatures on protected routes
 *
 * Extracts X-Agent-Id, X-Agent-Signature, and X-Agent-Timestamp headers,
 * looks up the agent's public key from the database, and verifies the signature.
 * Rejects revoked/suspended agents with 403.
 *
 * @param {object} db - PostgreSQL connection pool
 * @returns {Function} Fastify preHandler hook
 */
export function createSignatureVerifier(db) {
  return async function verifyAgentSignature(request, reply) {
    const agentId = request.headers['x-agent-id'];
    const signature = request.headers['x-agent-signature'];
    const timestamp = request.headers['x-agent-timestamp'];

    // If no agent headers present, skip (allows backward compat with unsigned requests)
    if (!agentId && !signature) {
      return;
    }

    // If partial headers, reject
    if (!agentId || !signature || !timestamp) {
      reply.code(401);
      return reply.send({
        error: 'missing_auth_headers',
        message: 'X-Agent-Id, X-Agent-Signature, and X-Agent-Timestamp headers are all required',
      });
    }

    if (!db) {
      reply.code(503);
      return reply.send({ error: 'database_unavailable' });
    }

    // Look up agent
    const result = await db.query(
      'SELECT id, public_key, status FROM agents WHERE id = $1',
      [agentId]
    );

    if (result.rows.length === 0) {
      reply.code(401);
      return reply.send({ error: 'unknown_agent', message: 'Agent not found' });
    }

    const agent = result.rows[0];

    // SECURITY: Reject revoked or suspended agents
    if (agent.status === 'revoked') {
      reply.code(403);
      return reply.send({ error: 'agent_revoked', message: 'Agent has been revoked' });
    }

    if (agent.status === 'suspended') {
      reply.code(403);
      return reply.send({ error: 'agent_suspended', message: 'Agent has been suspended' });
    }

    // Verify signature
    const rawBody = request.rawBody || null;
    const verification = verifyRequestSignature({
      publicKeyBase64: agent.public_key,
      signatureBase64: signature,
      method: request.method,
      path: request.url.split('?')[0], // Path without query string
      timestamp,
      body: rawBody,
    });

    if (!verification.valid) {
      reply.code(401);
      return reply.send({
        error: 'invalid_signature',
        message: verification.reason,
      });
    }

    // SECURITY: Attach verified agent to request for downstream use
    request.agent = { id: agent.id, status: agent.status };

    // Update last_seen_at (fire-and-forget, don't block the request)
    db.query('UPDATE agents SET last_seen_at = NOW() WHERE id = $1', [agentId]).catch(() => {});
  };
}
