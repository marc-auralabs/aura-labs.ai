/**
 * Scout HTTP Client
 *
 * Handles all HTTP communication with AURA Core.
 * MVP uses polling for simplicity — WebSocket support planned for future.
 */

import { ConnectionError, AuthenticationError, ScoutError } from './errors.js';

export class ScoutClient {
  #config;

  constructor(config) {
    this.#config = config;
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
   */
  async #request(method, path, body = null) {
    const url = `${this.#config.coreUrl}${path}`;

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.#config.apiKey}`,
      'X-Scout-SDK': '@aura-labs/scout/0.1.0',
    };

    const options = {
      method,
      headers,
      signal: AbortSignal.timeout(this.#config.timeout),
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));

        if (response.status === 401) {
          throw new AuthenticationError(error.message || 'Invalid API key');
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
