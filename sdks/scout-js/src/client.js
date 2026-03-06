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
 *
 * Adds correlation IDs (X-Request-ID) to every request for end-to-end tracing.
 * Reports request timing and outcomes to the activity logger when provided.
 */

import { randomUUID } from 'crypto';
import { ConnectionError, AuthenticationError, ScoutError } from './errors.js';
import { ScoutActivityEventTypes } from './activity.js';

// API version prefix — all requests target this version of the Core API.
// Bump this constant when upgrading to a new API version.
const API_VERSION = '/v1';

export class ScoutClient {
  #config;
  #keyManager = null;
  #agentId = null;
  #activityLogger;

  constructor(config, activityLogger = null) {
    this.#config = config;
    this.#activityLogger = activityLogger;
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
    const url = `${this.#config.coreUrl}${API_VERSION}${path}`;
    const requestId = randomUUID();
    const bodyString = body ? JSON.stringify(body) : null;

    const headers = {
      'Content-Type': 'application/json',
      'X-Scout-SDK': '@aura-labs/scout/0.1.0',
      'X-Request-ID': requestId,
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

    // Record request start
    let completeTimer;
    if (this.#activityLogger) {
      completeTimer = this.#activityLogger.startTimer(ScoutActivityEventTypes.REQUEST_COMPLETE, {
        correlationId: requestId,
        metadata: { method, path, url },
      });
      this.#activityLogger.record(ScoutActivityEventTypes.REQUEST_START, {
        correlationId: requestId,
        metadata: { method, path, url },
      });
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const errorMsg = error.message || `Request failed with status ${response.status}`;

        // Record failure
        if (this.#activityLogger) {
          this.#activityLogger.record(ScoutActivityEventTypes.REQUEST_FAILED, {
            correlationId: requestId,
            success: false,
            error: errorMsg,
            metadata: { method, path, statusCode: response.status },
          });
        }

        if (response.status === 401) {
          throw new AuthenticationError(errorMsg);
        }

        if (response.status === 403) {
          throw new AuthenticationError(errorMsg);
        }

        if (response.status === 404) {
          throw new ScoutError(errorMsg, 'NOT_FOUND');
        }

        throw new ScoutError(errorMsg, error.code || 'REQUEST_FAILED');
      }

      const result = await response.json();

      // Record success
      if (completeTimer) {
        completeTimer({
          success: true,
          metadata: { method, path, statusCode: response.status },
        });
      }

      return result;
    } catch (error) {
      if (error instanceof ScoutError) throw error;

      const isTimeout = error.name === 'AbortError' || error.name === 'TimeoutError';
      const errorMsg = isTimeout
        ? `Request timed out after ${this.#config.timeout}ms`
        : `Failed to connect to AURA Core: ${error.message}`;

      // Record failure
      if (this.#activityLogger) {
        this.#activityLogger.record(ScoutActivityEventTypes.REQUEST_FAILED, {
          correlationId: requestId,
          success: false,
          error: errorMsg,
          metadata: { method, path, timeout: isTimeout },
        });
      }

      if (isTimeout) {
        throw new ConnectionError(errorMsg);
      }

      throw new ConnectionError(errorMsg);
    }
  }

  /**
   * Get the configured Core URL
   */
  get coreUrl() {
    return this.#config.coreUrl;
  }
}
