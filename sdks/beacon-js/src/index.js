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
import { BeaconError, ConnectionError, RegistrationError, OfferError, ValidationError, AuthenticationError } from './errors.js';
import { ActivityLogger, ActivityEventTypes } from './activity.js';

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
  #beforeOfferValidators = [];
  #offerAcceptedHandlers = [];
  #transactionUpdateHandlers = [];
  #policies = {};
  #currentSession = null;
  #activity;

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

    // Initialize activity logger
    this.#activity = new ActivityLogger({
      maxEvents: this.#config.maxActivityEvents || 5000,
      logger: this.#config.logger || null,
      beaconContext: {
        externalId: this.#config.externalId,
        name: this.#config.name,
      },
    });

    this.#client = new BeaconClient(this.#config, this.#activity);

    this.#activity.record(ActivityEventTypes.BEACON_CREATED, {
      metadata: {
        externalId: this.#config.externalId,
        name: this.#config.name,
        coreUrl: this.#config.coreUrl,
        pollIntervalMs: this.#config.pollIntervalMs,
        capabilities: this.#config.capabilities,
      },
    });
  }

  /**
   * Register this Beacon with AURA Core
   */
  async register() {
    if (this.#registered) {
      return { beaconId: this.#beaconId };
    }

    const finish = this.#activity.startTimer(ActivityEventTypes.BEACON_REGISTERED, {
      metadata: { externalId: this.#config.externalId },
    });

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

      // Update activity context with assigned beaconId
      this.#activity.setBeaconContext({
        beaconId: this.#beaconId,
        externalId: result.externalId,
        name: result.name,
      });

      finish({
        success: true,
        metadata: {
          beaconId: this.#beaconId,
          externalId: result.externalId,
          status: result.status,
        },
      });

      return {
        beaconId: this.#beaconId,
        externalId: result.externalId,
        name: result.name,
        status: result.status,
      };
    } catch (error) {
      this.#activity.record(ActivityEventTypes.BEACON_REGISTRATION_FAILED, {
        success: false,
        error: error.message,
      });

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

    this.#activity.record(ActivityEventTypes.POLL_STARTED, {
      metadata: { intervalMs: this.#config.pollIntervalMs },
    });

    console.log(`Beacon "${this.#config.name}" polling for sessions...`);

    // Poll immediately, then on interval
    await this.#poll();

    this.#pollInterval = setInterval(async () => {
      try {
        await this.#poll();
      } catch (error) {
        this.#activity.record(ActivityEventTypes.POLL_ERROR, {
          success: false,
          error: error.message,
        });
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

      this.#activity.record(ActivityEventTypes.POLL_STOPPED, {
        metadata: {
          totalCycles: this.#activity.getSummary().polls.cycles,
        },
      });

      console.log('Stopped polling');
    }
  }

  /**
   * Poll for sessions and call handlers
   */
  async #poll() {
    const finish = this.#activity.startTimer(ActivityEventTypes.POLL_CYCLE);

    const result = await this.#client.get('/beacons/sessions');
    const sessions = result.sessions || [];

    let newCount = 0;
    let skippedCount = 0;

    for (const session of sessions) {
      // Skip already-seen sessions
      if (this.#seenSessions.has(session.sessionId)) {
        skippedCount++;
        continue;
      }

      this.#seenSessions.add(session.sessionId);
      newCount++;

      this.#activity.record(ActivityEventTypes.SESSION_RECEIVED, {
        sessionId: session.sessionId,
        metadata: {
          intent: session.intent?.raw,
          region: session.region,
        },
      });

      // Call all handlers
      for (let i = 0; i < this.#sessionHandlers.length; i++) {
        const handler = this.#sessionHandlers[i];
        const handlerFinish = this.#activity.startTimer(ActivityEventTypes.SESSION_HANDLER_COMPLETE, {
          sessionId: session.sessionId,
          metadata: { handlerIndex: i },
        });

        try {
          this.#currentSession = session;
          await handler(session, this);
          this.#currentSession = null;

          handlerFinish({
            success: true,
            sessionId: session.sessionId,
          });
        } catch (error) {
          this.#currentSession = null;

          this.#activity.record(ActivityEventTypes.SESSION_HANDLER_ERROR, {
            sessionId: session.sessionId,
            success: false,
            error: error.message,
            metadata: { handlerIndex: i },
          });

          console.error(`Handler error for session ${session.sessionId}:`, error.message);
        }
      }
    }

    finish({
      metadata: {
        totalSessions: sessions.length,
        newSessions: newCount,
        skippedSessions: skippedCount,
      },
    });

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

    // Run all pre-offer validators sequentially
    let validatedOffer = { ...offer };

    this.#activity.record(ActivityEventTypes.OFFER_VALIDATING, {
      sessionId,
      metadata: {
        validatorCount: this.#beforeOfferValidators.length,
        product: product.name || product.sku,
        unitPrice,
        quantity,
      },
    });

    for (let i = 0; i < this.#beforeOfferValidators.length; i++) {
      const validator = this.#beforeOfferValidators[i];
      try {
        const result = await validator(this.#currentSession, validatedOffer);
        if (result) {
          validatedOffer = { ...validatedOffer, ...result };
        }
        this.#activity.record(ActivityEventTypes.OFFER_VALIDATOR_PASS, {
          sessionId,
          metadata: { validatorIndex: i },
        });
      } catch (error) {
        this.#activity.record(ActivityEventTypes.OFFER_VALIDATOR_FAIL, {
          sessionId,
          success: false,
          error: error.message,
          metadata: { validatorIndex: i },
        });
        throw new ValidationError(`Validator failed: ${error.message}`, { originalError: error });
      }
    }

    const submitFinish = this.#activity.startTimer(ActivityEventTypes.OFFER_SUBMITTED, {
      sessionId,
      metadata: {
        product: validatedOffer.product?.name || validatedOffer.product?.sku,
        unitPrice: validatedOffer.unitPrice,
        quantity: validatedOffer.quantity,
      },
    });

    try {
      const result = await this.#client.post(`/sessions/${sessionId}/offers`, {
        beaconId: this.#beaconId,
        product: validatedOffer.product,
        unitPrice: validatedOffer.unitPrice,
        quantity: validatedOffer.quantity,
        totalPrice: validatedOffer.totalPrice || (validatedOffer.unitPrice * validatedOffer.quantity),
        currency: validatedOffer.currency || 'USD',
        deliveryDate: validatedOffer.deliveryDate,
        terms: validatedOffer.terms,
        metadata: validatedOffer.metadata,
      });

      const finalPrice = result.totalPrice || validatedOffer.totalPrice || (validatedOffer.unitPrice * validatedOffer.quantity);

      submitFinish({
        success: true,
        metadata: {
          offerId: result.offerId,
          totalPrice: finalPrice,
        },
      });

      console.log(`Offer submitted to session ${sessionId}: $${finalPrice}`);

      return result;
    } catch (error) {
      this.#activity.record(ActivityEventTypes.OFFER_SUBMISSION_FAILED, {
        sessionId,
        success: false,
        error: error.message,
      });
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

  /**
   * Register a pre-offer validation function
   * Validator signature: async (session, proposedOffer) => modifiedOffer | undefined
   */
  beforeOffer(validator) {
    this.#beforeOfferValidators.push(validator);
    return this;
  }

  /**
   * Register handler for when an offer is committed
   * Handler signature: async (transactionData) => void
   */
  onOfferAccepted(handler) {
    this.#offerAcceptedHandlers.push(handler);
    return this;
  }

  /**
   * Register handler for transaction status changes
   * Handler signature: async (event) => void
   */
  onTransactionUpdate(handler) {
    this.#transactionUpdateHandlers.push(handler);
    return this;
  }

  /**
   * Declare merchant policies
   * Accepts: { minPrice?, maxDiscountPct?, maxQuantityPerOrder?, deliveryRegions?, maxDeliveryDays? }
   */
  registerPolicies(policies) {
    this.#policies = { ...this.#policies, ...policies };

    // Add built-in validator that enforces policies
    this.#beforeOfferValidators.unshift(async (session, offer) => {
      const errors = [];

      if (this.#policies.minPrice && offer.unitPrice < this.#policies.minPrice) {
        errors.push(`Unit price ${offer.unitPrice} is below minimum ${this.#policies.minPrice}`);
      }

      if (this.#policies.maxQuantityPerOrder && offer.quantity > this.#policies.maxQuantityPerOrder) {
        errors.push(`Quantity ${offer.quantity} exceeds maximum ${this.#policies.maxQuantityPerOrder} per order`);
      }

      if (this.#policies.maxDeliveryDays && offer.deliveryDate) {
        const today = new Date();
        const deliveryDate = new Date(offer.deliveryDate);
        const daysUntilDelivery = Math.floor((deliveryDate - today) / (1000 * 60 * 60 * 24));
        if (daysUntilDelivery > this.#policies.maxDeliveryDays) {
          errors.push(`Delivery in ${daysUntilDelivery} days exceeds maximum ${this.#policies.maxDeliveryDays}`);
        }
      }

      if (this.#policies.deliveryRegions && session && session.region) {
        if (!this.#policies.deliveryRegions.includes(session.region)) {
          errors.push(`Region ${session.region} not in approved delivery regions`);
        }
      }

      if (errors.length > 0) {
        throw new ValidationError(`Policy violations: ${errors.join('; ')}`, { violations: errors });
      }

      return undefined;
    });

    return this;
  }

  /**
   * Report fulfillment status to Core
   * update: { fulfillmentStatus, fulfillmentReference?, metadata? }
   */
  async updateFulfillment(transactionId, update) {
    if (!this.#registered) {
      throw new RegistrationError('Beacon must be registered before updating fulfillment');
    }

    const finish = this.#activity.startTimer(ActivityEventTypes.FULFILLMENT_UPDATED, {
      transactionId,
      metadata: { fulfillmentStatus: update.fulfillmentStatus },
    });

    try {
      const result = await this.#client.put(`/transactions/${transactionId}/fulfillment`, {
        fulfillmentStatus: update.fulfillmentStatus,
        fulfillmentReference: update.fulfillmentReference,
        metadata: update.metadata,
      });

      finish({
        success: true,
        transactionId,
        metadata: {
          fulfillmentStatus: update.fulfillmentStatus,
          fulfillmentReference: update.fulfillmentReference,
        },
      });

      console.log(`Fulfillment updated for transaction ${transactionId}: ${update.fulfillmentStatus}`);
      return result;
    } catch (error) {
      this.#activity.record(ActivityEventTypes.FULFILLMENT_UPDATE_FAILED, {
        transactionId,
        success: false,
        error: error.message,
      });
      throw new BeaconError(`Failed to update fulfillment: ${error.message}`);
    }
  }

  /**
   * Fetch transaction details from Core
   */
  async getTransaction(transactionId) {
    if (!this.#registered) {
      throw new RegistrationError('Beacon must be registered before fetching transactions');
    }

    try {
      const result = await this.#client.get(`/transactions/${transactionId}`);
      return result;
    } catch (error) {
      throw new BeaconError(`Failed to fetch transaction: ${error.message}`);
    }
  }

  /**
   * Notify handlers of accepted offer (internal method)
   */
  _notifyOfferAccepted(transactionData) {
    this.#activity.record(ActivityEventTypes.OFFER_ACCEPTED, {
      sessionId: transactionData.sessionId,
      transactionId: transactionData.transactionId,
      metadata: {
        offerId: transactionData.offerId,
      },
    });

    for (const handler of this.#offerAcceptedHandlers) {
      try {
        handler(transactionData);
      } catch (error) {
        console.error('Error in offer accepted handler:', error.message);
      }
    }
  }

  /**
   * Notify handlers of transaction update (internal method)
   */
  _notifyTransactionUpdate(event) {
    this.#activity.record(ActivityEventTypes.TRANSACTION_UPDATE, {
      transactionId: event.transactionId,
      metadata: {
        status: event.status,
        fulfillmentStatus: event.fulfillmentStatus,
        paymentStatus: event.paymentStatus,
      },
    });

    for (const handler of this.#transactionUpdateHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in transaction update handler:', error.message);
      }
    }
  }

  // --- Public accessors ---

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

  /**
   * Access the activity logger for observability
   *
   * @example
   * ```js
   * // Subscribe to events
   * beacon.activity.on('offer.submitted', (event) => {
   *   console.log(`Offer submitted in ${event.durationMs}ms`);
   * });
   *
   * // Get summary stats
   * const stats = beacon.activity.getSummary();
   *
   * // Query recent errors
   * const errors = beacon.activity.getEvents({ type: '*.error' });
   * ```
   */
  get activity() {
    return this.#activity;
  }
}

export { BeaconError, ConnectionError, RegistrationError, OfferError, ValidationError, AuthenticationError } from './errors.js';
export { ActivityLogger, ActivityEventTypes, ActivityEvent } from './activity.js';
export default { createBeacon, Beacon };
