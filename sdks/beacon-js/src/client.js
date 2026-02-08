/**
 * Beacon HTTP Client
 */

import { ConnectionError, BeaconError } from './errors.js';

export class BeaconClient {
  #config;

  constructor(config) {
    this.#config = config;
  }

  async get(path) {
    return this.#request('GET', path);
  }

  async post(path, body) {
    return this.#request('POST', path, body);
  }

  async #request(method, path, body = null) {
    const url = `${this.#config.coreUrl}${path}`;

    const headers = {
      'Content-Type': 'application/json',
      'X-Beacon-SDK': '@aura-labs/beacon/0.1.0',
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

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new BeaconError(
          error.message || `Request failed with status ${response.status}`,
          error.code || 'REQUEST_FAILED'
        );
      }

      return response.json();
    } catch (error) {
      if (error instanceof BeaconError) throw error;

      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        throw new ConnectionError(`Request timed out after ${this.#config.timeout}ms`);
      }

      throw new ConnectionError(`Failed to connect to AURA Core: ${error.message}`);
    }
  }

  get coreUrl() {
    return this.#config.coreUrl;
  }

  setBeaconId(id) {
    this.#config.beaconId = id;
  }
}
