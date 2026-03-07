/**
 * Beacon HTTP Client
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
import { ConnectionError, AuthenticationError, BeaconError } from './errors.js';
import { ActivityEventTypes } from './activity.js';

// API version prefix — all requests target this version of the Core API.
// Bump this constant when upgrading to a new API version.
const API_VERSION = '/v1';

export class BeaconClient {
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

  async get(path) {
    return this.#request('GET', path);
  }

  async post(path, body) {
    return this.#request('POST', path, body);
  }

  async put(path, body) {
    return this.#request('PUT', path, body);
  }

  /**
   * POST with explicit extra headers (used for registration signing)
   */
  async postSigned(path, body, extraHeaders = {}) {
    return this.#request('POST', path, body, extraHeaders);
  }

  /**
   * Core HTTP request method
   *
   * If a KeyManager is configured, requests are signed with Ed25519.
   * Falls back to Bearer token auth if apiKey is provided.
   * Retains X-Beacon-ID for backward compatibility but it is NOT
   * considered sufficient authentication on its own.
   */
  async #request(method, path, body = null, extraHeaders = {}) {
    const url = `${this.#config.coreUrl}${API_VERSION}${path}`;
    const requestId = randomUUID();
    const bodyString = body ? JSON.stringify(body) : null;

    const headers = {
      'Content-Type': 'application/json',
      'X-Beacon-SDK': '@aura-labs/beacon/0.1.0',
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

    // Backward-compat: include beacon ID as supplementary header
    if (this.#config.beaconId) {
      headers['X-Beacon-ID'] = this.#config.beaconId;
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
      completeTimer = this.#activityLogger.startTimer(ActivityEventTypes.REQUEST_COMPLETE, {
        correlationId: requestId,
        metadata: { method, path, url },
      });
      this.#activityLogger.record(ActivityEventTypes.REQUEST_START, {
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
          this.#activityLogger.record(ActivityEventTypes.REQUEST_FAILED, {
            correlationId: requestId,
            success: false,
            error: errorMsg,
            metadata: { method, path, statusCode: response.status },
          });
        }

        if (response.status === 401 || response.status === 403) {
          throw new AuthenticationError(errorMsg);
        }

        throw new BeaconError(errorMsg, error.code || 'REQUEST_FAILED');
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
      if (error instanceof BeaconError) throw error;

      const isTimeout = error.name === 'AbortError' || error.name === 'TimeoutError';
      const errorMsg = isTimeout
        ? `Request timed out after ${this.#config.timeout}ms`
        : `Failed to connect to AURA Core: ${error.message}`;

      // Record failure
      if (this.#activityLogger) {
        this.#activityLogger.record(ActivityEventTypes.REQUEST_FAILED, {
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

  get coreUrl() {
    return this.#config.coreUrl;
  }

  setBeaconId(id) {
    this.#config.beaconId = id;
  }
}
