/**
 * AURA Beacon SDK
 *
 * Build selling agents that participate in agentic commerce.
 * Beacons represent merchants/sellers in the AURA ecosystem,
 * responding to Scout intents with offers.
 *
 * @example
 * ```js
 * import { createBeacon } from '@aura-labs/beacon';
 *
 * const beacon = createBeacon({
 *   externalId: 'widget-supplier-001',
 *   name: 'Acme Widgets',
 *   capabilities: { products: ['widgets', 'gadgets'] },
 * });
 *
 * await beacon.register();
 *
 * // Poll for sessions and respond with offers
 * beacon.onSession(async (session) => {
 *   if (session.intent.raw.includes('widget')) {
 *     await beacon.submitOffer(session.sessionId, {
 *       product: { name: 'Industrial Widget', sku: 'WDG-001' },
 *       unitPrice: 85.00,
 *       quantity: 500,
 *       deliveryDate: '2026-02-20',
 *     });
 *   }
 * });
 *
 * await beacon.startPolling();
 * ```
 */

import { BeaconClient } from './client.js';
import { BeaconError, ConnectionError, RegistrationError, OfferError } from './errors.js';

/**
 * Create a new Beacon instance
 */
export function createBeacon(config) {
  return new Beacon(config);
}

/**
 * Beacon - Seller agent in the AURA ecosystem
 */
export class Beacon {
  #client;
  #config;
  #registered = false;
  #beaconId = null;
  #pollInterval = null;
  #sessionHandlers = [];
  #seenSessions = new Set();

  constructor(config) {
    this.#config = {
      coreUrl: 'https://aura-labsai-production.up.railway.app',
      timeout: 30000,
      pollIntervalMs: 5000,
      ...config,
    };

    if (!this.#config.externalId) {
      throw new RegistrationError('externalId is required');
    }

    if (!this.#config.name) {
      throw new RegistrationError('name is required');
    }

    this.#client = new BeaconClient(this.#config);
  }

  /**
   * Register this Beacon with AURA Core
   */
  async register() {
    if (this.#registered) {
      return { beaconId: this.#beaconId };
    }

    try {
      const result = await this.#client.post('/beacons/register', {
        externalId: this.#config.externalId,
        name: this.#config.name,
        description: this.#config.description,
        endpointUrl: this.#config.endpointUrl,
        capabilities: this.#config.capabilities || {},
        metadata: this.#config.metadata || {},
      });

      this.#beaconId = result.beaconId;
      this.#registered = true;
      this.#client.setBeaconId(this.#beaconId);

      return {
        beaconId: this.#beaconId,
        externalId: result.externalId,
        name: result.name,
        status: result.status,
      };
    } catch (error) {
      throw new RegistrationError(`Failed to register: ${error.message}`);
    }
  }

  /**
   * Register a handler for incoming sessions
   */
  onSession(handler) {
    this.#sessionHandlers.push(handler);
  }

  /**
   * Start polling for sessions
   */
  async startPolling() {
    if (!this.#registered) {
      await this.register();
    }

    if (this.#pollInterval) {
      return; // Already polling
    }

    console.log(`🔍 Beacon "${this.#config.name}" polling for sessions...`);

    // Poll immediately, then on interval
    await this.#poll();

    this.#pollInterval = setInterval(async () => {
      try {
        await this.#poll();
      } catch (error) {
        console.error('Poll error:', error.message);
      }
    }, this.#config.pollIntervalMs);
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.#pollInterval) {
      clearInterval(this.#pollInterval);
      this.#pollInterval = null;
      console.log('⏹️  Stopped polling');
    }
  }

  /**
   * Poll for sessions and call handlers
   */
  async #poll() {
    const result = await this.#client.get('/beacons/sessions');

    for (const session of result.sessions || []) {
      // Skip already-seen sessions
      if (this.#seenSessions.has(session.sessionId)) {
        continue;
      }

      this.#seenSessions.add(session.sessionId);

      // Call all handlers
      for (const handler of this.#sessionHandlers) {
        try {
          await handler(session, this);
        } catch (error) {
          console.error(`Handler error for session ${session.sessionId}:`, error.message);
        }
      }
    }

    // Prune old sessions from seen set (keep last 1000)
    if (this.#seenSessions.size > 1000) {
      const arr = Array.from(this.#seenSessions);
      this.#seenSessions = new Set(arr.slice(-500));
    }
  }

  /**
   * Submit an offer to a session
   */
  async submitOffer(sessionId, offer) {
    if (!this.#registered) {
      throw new RegistrationError('Beacon must be registered before submitting offers');
    }

    const {
      product,
      unitPrice,
      quantity,
      totalPrice,
      currency,
      deliveryDate,
      terms,
      metadata,
    } = offer;

    if (!product) {
      throw new OfferError('product is required', sessionId);
    }

    try {
      const result = await this.#client.post(`/sessions/${sessionId}/offers`, {
        beaconId: this.#beaconId,
        product,
        unitPrice,
        quantity,
        totalPrice: totalPrice || (unitPrice * quantity),
        currency: currency || 'USD',
        deliveryDate,
        terms,
        metadata,
      });

      console.log(`📤 Offer submitted to session ${sessionId}: $${result.totalPrice || totalPrice || (unitPrice * quantity)}`);

      return result;
    } catch (error) {
      throw new OfferError(`Failed to submit offer: ${error.message}`, sessionId);
    }
  }

  /**
   * Fetch sessions manually (without polling)
   */
  async getSessions() {
    if (!this.#registered) {
      await this.register();
    }

    const result = await this.#client.get('/beacons/sessions');
    return result.sessions || [];
  }

  get isRegistered() {
    return this.#registered;
  }

  get id() {
    return this.#beaconId;
  }

  get externalId() {
    return this.#config.externalId;
  }

  get name() {
    return this.#config.name;
  }

  get isPolling() {
    return this.#pollInterval !== null;
  }
}

export { BeaconError, ConnectionError, RegistrationError, OfferError } from './errors.js';
export default { createBeacon, Beacon };
