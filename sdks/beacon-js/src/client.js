/**
 * Beacon HTTP Client
 *
 * Handles all HTTP communication with AURA Core.
 * Adds correlation IDs (X-Request-ID) to every request for end-to-end tracing.
 * Reports request timing and outcomes to the activity logger when provided.
 */

import { randomUUID } from 'crypto';
import { ConnectionError, BeaconError } from './errors.js';
import { ActivityEventTypes } from './activity.js';

// API version prefix — all requests target this version of the Core API.
// Bump this constant when upgrading to a new API version.
const API_VERSION = '/v1';

export class BeaconClient {
  #config;
  #activityLogger;

  constructor(config, activityLogger = null) {
    this.#config = config;
    this.#activityLogger = activityLogger;
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

  async #request(method, path, body = null) {
    const url = `${this.#config.coreUrl}${API_VERSION}${path}`;
    const requestId = randomUUID();

    const headers = {
      'Content-Type': 'application/json',
      'X-Beacon-SDK': '@aura-labs/beacon/0.1.0',
      'X-Request-ID': requestId,
    };

    if (this.#config.beaconId) {
      headers['X-Beacon-ID'] = this.#config.beaconId;
    }

    const options = {
      method,
      headers,
      signal: AbortSignal.timeout(this.#config.timeout),
    };

    if (body) {
      options.body = JSON.stringify(body);
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
