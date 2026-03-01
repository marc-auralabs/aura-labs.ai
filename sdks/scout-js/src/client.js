/**
 * Scout HTTP Client
 *
 * Handles all HTTP communication with AURA Core.
 *
 * Supports two authentication modes:
 *   1. Ed25519 signed requests (new — via KeyManager)
 *   2. Bearer token (legacy — via apiKey)
 *
 * When a KeyManager is set, all requests are signed with the agent's
 * private key and include X-Agent-Id, X-Agent-Signature, and
 * X-Agent-Timestamp headers.
 */

import { ConnectionError, AuthenticationError, ScoutError } from './errors.js';

export class ScoutClient {
  #config;
  #keyManager = null;
  #agentId = null;

  constructor(config) {
    this.#config = config;
  }

  /**
   * Configure the client to sign requests with Ed25519
   *
   * @param {KeyManager} keyManager - Initialized KeyManager instance
   * @param {string} agentId - Registered agent UUID
   */
  setKeyManager(keyManager, agentId) {
    this.#keyManager = keyManager;
    this.#agentId = agentId;
  }

  /**
   * Make HTTP GET request to Core
   */
  async get(path) {
    return this.#request('GET', path);
  }

  /**
   * Make HTTP POST request to Core
   */
  async post(path, body) {
    return this.#request('POST', path, body);
  }

  /**
   * Make HTTP POST request with explicit extra headers (used for registration)
   *
   * @param {string} path - API path
   * @param {object} body - Request body
   * @param {object} extraHeaders - Additional headers (e.g., X-Agent-Signature for registration)
   */
  async postSigned(path, body, extraHeaders = {}) {
    return this.#request('POST', path, body, extraHeaders);
  }

  /**
   * Make HTTP PUT request to Core
   */
  async put(path, body) {
    return this.#request('PUT', path, body);
  }

  /**
   * Make HTTP DELETE request to Core
   */
  async delete(path) {
    return this.#request('DELETE', path);
  }

  /**
   * Core HTTP request method
   *
   * If a KeyManager is configured, requests are signed with Ed25519.
   * Falls back to Bearer token auth if apiKey is provided.
   */
  async #request(method, path, body = null, extraHeaders = {}) {
    const url = `${this.#config.coreUrl}${path}`;
    const bodyString = body ? JSON.stringify(body) : null;

    const headers = {
      'Content-Type': 'application/json',
      'X-Scout-SDK': '@aura-labs/scout/0.1.0',
      ...extraHeaders,
    };

    // Auth: prefer Ed25519 signing, fall back to Bearer token
    if (this.#keyManager && this.#agentId) {
      const { signature, timestamp } = this.#keyManager.signRequest({
        method,
        path,
        body: bodyString,
      });
      headers['X-Agent-Id'] = this.#agentId;
      headers['X-Agent-Signature'] = signature;
      headers['X-Agent-Timestamp'] = timestamp;
    } else if (this.#config.apiKey) {
      headers['Authorization'] = `Bearer ${this.#config.apiKey}`;
    }

    const options = {
      method,
      headers,
      signal: AbortSignal.timeout(this.#config.timeout),
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
          throw new ScoutError(
            error.message || 'Resource not found',
            'NOT_FOUND'
          );
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
        throw new ConnectionError(`Request timed out after ${this.#config.timeout}ms`);
      }

      throw new ConnectionError(`Failed to connect to AURA Core: ${error.message}`);
    }
  }

  /**
   * Get the configured Core URL
   */
  get coreUrl() {
    return this.#config.coreUrl;
  }
}
