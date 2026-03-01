/**
 * AURA Core API Client
 *
 * HTTP client for communicating with AURA Core from the Chrome extension.
 *
 * Supports two authentication modes:
 *   1. Ed25519 signed requests (new — via setIdentity)
 *   2. Bearer token (legacy — via apiKey constructor param)
 *
 * When identity is set, requests include X-Agent-Id, X-Agent-Signature,
 * and X-Agent-Timestamp headers. The signature covers the canonical string:
 *   "${method}\n${path}\n${timestamp}\n${bodyDigest}"
 */

import { CORE_API_URL, REQUEST_TIMEOUT_MS, SDK_VERSION } from '../shared/constants.js';
import {
  ScoutError,
  ConnectionError,
  AuthenticationError,
} from '../shared/errors.js';

export class AuraClient {
  #baseUrl;
  #timeout;
  #apiKey;
  #agentId = null;
  #signFn = null;

  /**
   * @param {Object} config
   * @param {string} [config.apiKey] - Legacy API key (optional with Ed25519 identity)
   * @param {string} [config.baseUrl] - Core API URL (defaults to production)
   * @param {number} [config.timeout] - Request timeout in ms (defaults to 30s)
   */
  constructor({ apiKey, baseUrl = CORE_API_URL, timeout = REQUEST_TIMEOUT_MS } = {}) {
    this.#apiKey = apiKey || null;
    this.#baseUrl = baseUrl;
    this.#timeout = timeout;
  }

  /**
   * Set the Ed25519 signing identity for authenticated requests.
   *
   * @param {string} agentId - Registered agent UUID
   * @param {Function} signFn - Async function(data) => base64 signature string
   */
  setIdentity(agentId, signFn) {
    this.#agentId = agentId;
    this.#signFn = signFn;
  }

  /**
   * Register a new agent with AURA Core using Ed25519 proof-of-possession.
   *
   * @param {Object} params
   * @param {string} params.publicKey - Base64-encoded raw Ed25519 public key
   * @param {string} params.type - Agent type ('scout' or 'beacon')
   * @param {Object} [params.manifest] - Agent manifest (name, version, capabilities)
   * @param {Function} params.signFn - Function to sign the body for proof-of-possession
   * @returns {Promise<Object>} { agentId, status, keyId, _links }
   */
  async registerAgent({ publicKey, type, manifest, signFn }) {
    const body = { publicKey, type, manifest: manifest || {} };
    const bodyString = JSON.stringify(body);
    const signature = await signFn(bodyString);

    return this.#request('POST', '/agents/register', body, {
      'X-Agent-Signature': signature,
    });
  }

  /**
   * Create a new shopping session.
   *
   * @param {string} intent - Natural language shopping intent
   * @param {string} agentId - Agent registration ID
   * @param {Object} [constraints] - Shopping constraints (budget, categories, etc.)
   * @returns {Promise<Object>} Session data with { sessionId, status, intent, _links }
   */
  async createSession(intent, agentId, constraints = {}) {
    return this.#request('POST', '/sessions', { intent, agentId, constraints });
  }

  /**
   * Get current session state.
   */
  async getSession(sessionId) {
    return this.#request('GET', `/sessions/${sessionId}`);
  }

  /**
   * Get offers for a session.
   */
  async getOffers(sessionId) {
    return this.#request('GET', `/sessions/${sessionId}/offers`);
  }

  /**
   * Commit to an offer (triggers transaction).
   */
  async commitOffer(sessionId, offerId, idempotencyKey) {
    const key = idempotencyKey || crypto.randomUUID();
    return this.#request('POST', `/sessions/${sessionId}/commit`, {
      offerId,
      idempotencyKey: key,
    });
  }

  /**
   * Cancel an active session.
   */
  async cancelSession(sessionId) {
    return this.#request('POST', `/sessions/${sessionId}/cancel`);
  }

  /**
   * Check API health / connectivity.
   */
  async healthCheck() {
    return this.#request('GET', '/health');
  }

  /**
   * Core HTTP request method.
   *
   * If Ed25519 identity is set, signs requests with agent key.
   * Falls back to Bearer token auth if apiKey is available.
   *
   * @param {string} method - HTTP method
   * @param {string} path - API path
   * @param {Object} [body] - Request body
   * @param {Object} [extraHeaders] - Additional headers
   */
  async #request(method, path, body = null, extraHeaders = {}) {
    const url = `${this.#baseUrl}${path}`;
    const bodyString = body ? JSON.stringify(body) : null;

    const headers = {
      'Content-Type': 'application/json',
      'X-Scout-SDK': SDK_VERSION,
      ...extraHeaders,
    };

    // Auth: prefer Ed25519 signing, fall back to Bearer token
    if (this.#agentId && this.#signFn) {
      const timestamp = Date.now().toString();
      const bodyDigest = bodyString
        ? await this.#sha256Base64(bodyString)
        : '';
      const signingString = `${method}\n${path}\n${timestamp}\n${bodyDigest}`;
      const signature = await this.#signFn(signingString);

      headers['X-Agent-Id'] = this.#agentId;
      headers['X-Agent-Signature'] = signature;
      headers['X-Agent-Timestamp'] = timestamp;
    } else if (this.#apiKey) {
      headers['Authorization'] = `Bearer ${this.#apiKey}`;
    }

    const options = {
      method,
      headers,
      signal: AbortSignal.timeout(this.#timeout),
    };

    if (bodyString) {
      options.body = bodyString;
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));

        if (response.status === 401) {
          throw new AuthenticationError(error.message || 'Authentication failed');
        }

        if (response.status === 403) {
          throw new AuthenticationError(error.message || 'Access denied');
        }

        if (response.status === 404) {
          throw new ScoutError(error.message || 'Resource not found', 'NOT_FOUND');
        }

        throw new ScoutError(
          error.message || `Request failed with status ${response.status}`,
          error.code || 'REQUEST_FAILED'
        );
      }

      return response.json();
    } catch (error) {
      if (error instanceof ScoutError) {
        throw error;
      }
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        throw new ConnectionError(`Request timed out after ${this.#timeout}ms`);
      }
      throw new ConnectionError(`Failed to connect to AURA Core: ${error.message}`);
    }
  }

  /**
   * Compute SHA-256 digest using Web Crypto API (browser-compatible)
   */
  async #sha256Base64(data) {
    const encoder = new TextEncoder();
    const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }

  /** Expose base URL for diagnostics */
  get baseUrl() {
    return this.#baseUrl;
  }
}
