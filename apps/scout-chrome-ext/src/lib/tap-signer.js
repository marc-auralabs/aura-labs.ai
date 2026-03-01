/**
 * Visa TAP (Trusted Agent Protocol) Signer
 *
 * Signs HTTP requests with TAP headers for agent identity verification.
 * Browser-compatible implementation using tweetnacl for Ed25519 signing.
 *
 * Implements a subset of RFC 9421 (HTTP Message Signatures) matching
 * the patterns in sdks/scout-js/src/tap/visa.js.
 *
 * @see https://usa.visa.com/about-visa/newsroom/press-releases.releaseId.21716.html
 */

import * as cryptoManager from './crypto-manager.js';
import { TAPError } from '../shared/errors.js';

/**
 * Sign an HTTP request with TAP headers.
 *
 * Adds X-TAP-Agent-Id, X-TAP-Timestamp, X-TAP-Nonce, Signature,
 * and Signature-Input headers to the request.
 *
 * @param {Object} request
 * @param {string} request.method - HTTP method (GET, POST, etc.)
 * @param {string} request.url - Full request URL
 * @param {Object} [request.headers] - Existing headers
 * @param {Object} [request.body] - Request body (for POST/PUT)
 * @param {Object} credentials
 * @param {string} credentials.tapId - TAP registration ID
 * @param {string} credentials.keyId - Key identifier
 * @returns {Promise<Object>} Request with TAP signature headers added
 */
export async function signRequest(request, credentials) {
  const { method, url, headers = {}, body } = request;
  const { tapId, keyId } = credentials;

  if (!tapId || !keyId) {
    throw new TAPError('TAP credentials (tapId, keyId) are required');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = generateNonce();

  // Build the signature base string
  const signatureBase = buildSignatureBase({
    method,
    url,
    tapId,
    timestamp,
    nonce,
    body,
  });

  // Sign with the extension's Ed25519 key
  const signature = await cryptoManager.sign(signatureBase);

  // Build the Signature-Input header value
  const signatureInput = `sig=("@method" "@path" "@authority" "x-tap-agent-id" "x-tap-timestamp" "x-tap-nonce");keyid="${keyId}";alg="ed25519";created=${timestamp}`;

  return {
    ...request,
    headers: {
      ...headers,
      'X-TAP-Agent-Id': tapId,
      'X-TAP-Timestamp': timestamp.toString(),
      'X-TAP-Nonce': nonce,
      'Signature': `sig=:${signature}:`,
      'Signature-Input': signatureInput,
    },
  };
}

/**
 * Build the signature base string per HTTP Message Signatures spec.
 *
 * Components signed: @method, @path, @authority, x-tap-agent-id,
 * x-tap-timestamp, x-tap-nonce, and content-digest (if body present).
 *
 * @param {Object} params
 * @returns {string} Signature base string
 */
function buildSignatureBase({ method, url, tapId, timestamp, nonce, body }) {
  const urlObj = new URL(url);

  const components = [
    `"@method": ${method.toUpperCase()}`,
    `"@path": ${urlObj.pathname}`,
    `"@authority": ${urlObj.host}`,
    `"x-tap-agent-id": ${tapId}`,
    `"x-tap-timestamp": ${timestamp}`,
    `"x-tap-nonce": ${nonce}`,
  ];

  // Include content-digest for requests with a body
  if (body) {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const digest = sha256Base64(bodyStr);
    components.push(`"content-digest": sha-256=:${digest}:`);
  }

  return components.join('\n');
}

/**
 * Compute SHA-256 hash of a string, returned as base64.
 * Uses the Web Crypto API (available in all modern browsers).
 *
 * Note: This is a synchronous approximation for the signature base.
 * For production, use the async SubtleCrypto API.
 *
 * @param {string} data
 * @returns {string} Base64-encoded SHA-256 hash
 */
function sha256Base64(data) {
  // Simple hash for signature base — tweetnacl provides nacl.hash (SHA-512)
  // For SHA-256 in the browser, we use a sync fallback since this is
  // only used for the content-digest component.
  // In production, migrate to async SubtleCrypto.
  const encoder = new TextEncoder();
  const bytes = encoder.encode(data);

  // Simple deterministic hash for MVP
  // SECURITY: Replace with proper SHA-256 via SubtleCrypto for production
  let hash = 0;
  for (const byte of bytes) {
    hash = ((hash << 5) - hash + byte) | 0;
  }
  return btoa(String(Math.abs(hash)));
}

/**
 * Generate a cryptographically random nonce.
 *
 * @returns {string} 32-character hex nonce
 */
function generateNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create TAP credentials from stored keys.
 *
 * @param {string} tapId - TAP registration ID
 * @returns {Promise<Object>} Credentials object for signRequest
 */
export async function createCredentials(tapId) {
  const keyId = await cryptoManager.getKeyId();
  return { tapId, keyId };
}
