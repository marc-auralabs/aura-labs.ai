/**
 * Agent Key Manager — Ed25519 Identity Management
 *
 * Manages the agent's root Ed25519 key pair, which is the foundation
 * of its cryptographic identity in the AURA network.
 *
 * Key responsibilities:
 *   - Generate or load the root key pair
 *   - Sign data (registration proofs, request signatures)
 *   - Build canonical signing strings for HTTP request authentication
 *   - Provide pluggable storage adapters for persistence across restarts
 *
 * Key format: raw 32-byte Ed25519 keys, base64-encoded (compatible with
 * tweetnacl.js in browser contexts and Node.js crypto module).
 */

import crypto from 'node:crypto';

// Ed25519 DER prefixes for raw key <-> KeyObject conversion
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');   // public key
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex'); // private key

/**
 * In-memory storage adapter (default — keys lost on restart)
 *
 * Implements the storage interface: { get(key), set(key, value), remove(key) }
 */
export class MemoryStorage {
  #store = new Map();

  async get(key) { return this.#store.get(key) ?? null; }
  async set(key, value) { this.#store.set(key, value); }
  async remove(key) { this.#store.delete(key); }
}

/**
 * KeyManager — Manages an agent's Ed25519 root key pair
 *
 * @param {object} options
 * @param {object} [options.storage] - Storage adapter with get/set/remove methods
 * @param {string} [options.storagePrefix] - Key prefix for storage (default: 'aura:agent:')
 */
export class KeyManager {
  #storage;
  #prefix;
  #publicKeyBase64 = null;
  #privateKeyObject = null;
  #publicKeyObject = null;
  #initialized = false;

  constructor({ storage, storagePrefix } = {}) {
    this.#storage = storage || new MemoryStorage();
    this.#prefix = storagePrefix || 'aura:agent:';
  }

  /**
   * Initialize the key manager — load existing keys or generate new ones
   *
   * @returns {Promise<{ publicKey: string, isNew: boolean }>}
   *   publicKey is base64-encoded raw 32-byte Ed25519 public key
   *   isNew is true if a new key pair was generated
   */
  async init() {
    if (this.#initialized) {
      return { publicKey: this.#publicKeyBase64, isNew: false };
    }

    // Try to load existing keys from storage
    const storedPublic = await this.#storage.get(`${this.#prefix}publicKey`);
    const storedPrivate = await this.#storage.get(`${this.#prefix}privateKey`);

    if (storedPublic && storedPrivate) {
      this.#publicKeyBase64 = storedPublic;
      this.#publicKeyObject = this.#rawPublicToKeyObject(storedPublic);
      this.#privateKeyObject = this.#rawPrivateToKeyObject(storedPrivate);
      this.#initialized = true;
      return { publicKey: this.#publicKeyBase64, isNew: false };
    }

    // Generate new key pair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

    // Extract raw bytes for storage and interop
    const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
    const rawPublic = spkiDer.subarray(spkiDer.length - 32);
    this.#publicKeyBase64 = rawPublic.toString('base64');

    const pkcs8Der = privateKey.export({ type: 'pkcs8', format: 'der' });
    const rawPrivate = pkcs8Der.subarray(pkcs8Der.length - 32);
    const rawPrivateBase64 = rawPrivate.toString('base64');

    // Store for persistence
    await this.#storage.set(`${this.#prefix}publicKey`, this.#publicKeyBase64);
    await this.#storage.set(`${this.#prefix}privateKey`, rawPrivateBase64);

    this.#publicKeyObject = publicKey;
    this.#privateKeyObject = privateKey;
    this.#initialized = true;

    return { publicKey: this.#publicKeyBase64, isNew: true };
  }

  /**
   * Sign arbitrary data with the agent's private key
   *
   * @param {string} data - String data to sign
   * @returns {string} Base64-encoded Ed25519 signature (64 bytes)
   * @throws {Error} If not initialized
   */
  sign(data) {
    this.#ensureInitialized();
    const signature = crypto.sign(null, Buffer.from(data), this.#privateKeyObject);
    return signature.toString('base64');
  }

  /**
   * Build and sign the canonical request string for HTTP request authentication
   *
   * Format: "${method}\n${path}\n${timestamp}\n${bodyDigest}"
   *
   * @param {object} params
   * @param {string} params.method - HTTP method (uppercase)
   * @param {string} params.path - Request path (e.g., /sessions)
   * @param {string|null} params.body - JSON body string or null
   * @returns {{ signature: string, timestamp: string }} Signature and timestamp to include in headers
   */
  signRequest({ method, path, body }) {
    this.#ensureInitialized();

    const timestamp = Date.now().toString();
    const bodyDigest = body
      ? crypto.createHash('sha256').update(body).digest('base64')
      : '';
    const signingString = `${method}\n${path}\n${timestamp}\n${bodyDigest}`;
    const signature = this.sign(signingString);

    return { signature, timestamp };
  }

  /**
   * Get the public key (base64-encoded raw 32-byte Ed25519)
   *
   * @returns {string|null} Public key or null if not initialized
   */
  get publicKey() {
    return this.#publicKeyBase64;
  }

  /**
   * Check if the key manager has been initialized
   *
   * @returns {boolean}
   */
  get isInitialized() {
    return this.#initialized;
  }

  /**
   * Compute the key fingerprint (SHA-256 hex of raw public key)
   *
   * @returns {string} 64-char hex fingerprint
   */
  get fingerprint() {
    this.#ensureInitialized();
    return crypto.createHash('sha256')
      .update(Buffer.from(this.#publicKeyBase64, 'base64'))
      .digest('hex');
  }

  /**
   * Load the stored agentId from storage
   *
   * @returns {Promise<string|null>}
   */
  async getAgentId() {
    return this.#storage.get(`${this.#prefix}agentId`);
  }

  /**
   * Store the agentId after registration
   *
   * @param {string} agentId - UUID from /agents/register response
   */
  async setAgentId(agentId) {
    await this.#storage.set(`${this.#prefix}agentId`, agentId);
  }

  // ─── Private helpers ────────────────────────────────────────────────

  #ensureInitialized() {
    if (!this.#initialized) {
      throw new Error('KeyManager not initialized. Call init() first.');
    }
  }

  /**
   * Convert raw 32-byte base64 public key to Node.js KeyObject
   */
  #rawPublicToKeyObject(base64Key) {
    const rawBytes = Buffer.from(base64Key, 'base64');
    const derKey = Buffer.concat([SPKI_PREFIX, rawBytes]);
    return crypto.createPublicKey({ key: derKey, format: 'der', type: 'spki' });
  }

  /**
   * Convert raw 32-byte base64 private key (seed) to Node.js KeyObject
   */
  #rawPrivateToKeyObject(base64Key) {
    const rawBytes = Buffer.from(base64Key, 'base64');
    const derKey = Buffer.concat([PKCS8_PREFIX, rawBytes]);
    return crypto.createPrivateKey({ key: derKey, format: 'der', type: 'pkcs8' });
  }
}
