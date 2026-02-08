/**
 * Scout Session
 *
 * Represents an active commerce session with AURA Core.
 * Handles offer polling, constraint evaluation, and transaction commitment.
 */

import { SessionError, OfferError, ConstraintError } from './errors.js';

/**
 * Session states
 */
export const SessionStatus = {
  CREATED: 'created',
  MARKET_FORMING: 'market_forming',
  OFFERS_AVAILABLE: 'offers_available',
  NEGOTIATING: 'negotiating',
  COMMITTED: 'committed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
};

/**
 * Commerce Session
 */
export class Session {
  #data;
  #client;
  #config;
  #offers = [];
  #constraints;
  #pollInterval = null;

  constructor(data, client, config) {
    this.#data = data;
    this.#client = client;
    this.#config = config;
    this.#constraints = new Constraints(config.constraints || {});
  }

  /**
   * Session ID
   */
  get id() {
    return this.#data.sessionId;
  }

  /**
   * Current session status
   */
  get status() {
    return this.#data.status;
  }

  /**
   * Parsed intent (as interpreted by Core)
   */
  get intent() {
    return this.#data.intent;
  }

  /**
   * Available HATEOAS links
   */
  get links() {
    return this.#data._links || {};
  }

  /**
   * Is session still active?
   */
  get isActive() {
    return ![
      SessionStatus.COMPLETED,
      SessionStatus.CANCELLED,
      SessionStatus.EXPIRED,
    ].includes(this.status);
  }

  /**
   * Get current offers
   */
  get offers() {
    return this.#offers;
  }

  /**
   * Refresh session state from Core
   */
  async refresh() {
    this.#data = await this.#client.get(`/sessions/${this.id}`);
    return this;
  }

  /**
   * Poll for offers until available or timeout
   *
   * @param {object} options
   * @param {number} options.timeout - Max time to wait in ms (default: 30000)
   * @param {number} options.interval - Poll interval in ms (default: 2000)
   * @returns {Promise<Offer[]>}
   */
  async waitForOffers(options = {}) {
    const { timeout = 30000, interval = 2000 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      await this.refresh();

      if (this.status === SessionStatus.OFFERS_AVAILABLE) {
        this.#offers = await this.#fetchOffers();
        return this.#offers;
      }

      if (!this.isActive) {
        throw new SessionError(`Session is no longer active: ${this.status}`);
      }

      await this.#sleep(interval);
    }

    throw new SessionError('Timed out waiting for offers', 'TIMEOUT');
  }

  /**
   * Fetch current offers from Core
   */
  async #fetchOffers() {
    if (!this.links.offers) {
      return [];
    }

    const response = await this.#client.get(`/sessions/${this.id}/offers`);
    return (response.offers || []).map(o => new Offer(o, this.#constraints));
  }

  /**
   * Get offers that satisfy all constraints
   */
  get validOffers() {
    return this.#offers.filter(o => o.meetsConstraints);
  }

  /**
   * Get best offer based on constraint ranking
   */
  get bestOffer() {
    const valid = this.validOffers;
    if (valid.length === 0) return null;

    return valid.reduce((best, offer) =>
      offer.score > best.score ? offer : best
    );
  }

  /**
   * Commit to an offer
   *
   * @param {string} offerId - ID of the offer to commit to
   * @returns {Promise<Transaction>}
   */
  async commit(offerId) {
    const offer = this.#offers.find(o => o.id === offerId);

    if (!offer) {
      throw new OfferError(`Offer not found: ${offerId}`, offerId);
    }

    if (!offer.meetsConstraints) {
      const violations = offer.constraintViolations;
      throw new ConstraintError(
        `Offer violates constraints: ${violations.join(', ')}`,
        violations[0]
      );
    }

    const response = await this.#client.post(`/sessions/${this.id}/commit`, {
      offerId,
    });

    this.#data.status = SessionStatus.COMMITTED;

    return new Transaction(response);
  }

  /**
   * Cancel the session
   */
  async cancel() {
    await this.#client.post(`/sessions/${this.id}/cancel`);
    this.#data.status = SessionStatus.CANCELLED;
  }

  /**
   * Update constraints for this session
   */
  updateConstraints(constraints) {
    this.#constraints = new Constraints({
      ...this.#constraints.raw,
      ...constraints,
    });
  }

  #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Convert to JSON for serialization
   */
  toJSON() {
    return {
      id: this.id,
      status: this.status,
      intent: this.intent,
      offers: this.#offers.map(o => o.toJSON()),
      links: this.links,
    };
  }
}

/**
 * Constraints Engine
 *
 * Evaluates offers against user-defined constraints.
 */
export class Constraints {
  #constraints;

  constructor(constraints = {}) {
    this.#constraints = {
      maxBudget: constraints.maxBudget || null,
      deliveryBy: constraints.deliveryBy ? new Date(constraints.deliveryBy) : null,
      hardConstraints: constraints.hardConstraints || [],
      softPreferences: constraints.softPreferences || [],
      ...constraints,
    };
  }

  get raw() {
    return { ...this.#constraints };
  }

  /**
   * Check if offer meets all hard constraints
   */
  meetsConstraints(offer) {
    return this.getViolations(offer).length === 0;
  }

  /**
   * Get list of constraint violations
   */
  getViolations(offer) {
    const violations = [];

    // Check budget
    if (this.#constraints.maxBudget !== null) {
      if (offer.totalPrice > this.#constraints.maxBudget) {
        violations.push(`price_exceeds_budget:${offer.totalPrice}>${this.#constraints.maxBudget}`);
      }
    }

    // Check delivery date
    if (this.#constraints.deliveryBy !== null) {
      if (offer.deliveryDate && new Date(offer.deliveryDate) > this.#constraints.deliveryBy) {
        violations.push(`delivery_too_late:${offer.deliveryDate}`);
      }
    }

    // Check custom hard constraints
    for (const constraint of this.#constraints.hardConstraints) {
      if (!this.#evaluateConstraint(constraint, offer)) {
        violations.push(constraint.name || constraint.field);
      }
    }

    return violations;
  }

  /**
   * Score offer based on soft preferences (0-100)
   */
  score(offer) {
    let score = 50; // Base score

    // Budget utilization (prefer lower prices)
    if (this.#constraints.maxBudget && offer.totalPrice) {
      const utilizationRatio = offer.totalPrice / this.#constraints.maxBudget;
      score += (1 - utilizationRatio) * 20; // Up to +20 for lower prices
    }

    // Delivery speed (prefer earlier delivery)
    if (this.#constraints.deliveryBy && offer.deliveryDate) {
      const deliveryDate = new Date(offer.deliveryDate);
      const deadline = this.#constraints.deliveryBy;
      const now = new Date();
      const totalWindow = deadline - now;
      const actualWindow = deliveryDate - now;

      if (totalWindow > 0 && actualWindow < totalWindow) {
        score += ((totalWindow - actualWindow) / totalWindow) * 15; // Up to +15 for faster delivery
      }
    }

    // Soft preferences
    for (const pref of this.#constraints.softPreferences) {
      if (this.#evaluateConstraint(pref, offer)) {
        score += pref.weight || 5;
      }
    }

    // Clamp to 0-100
    return Math.max(0, Math.min(100, score));
  }

  #evaluateConstraint(constraint, offer) {
    const value = offer[constraint.field];

    switch (constraint.operator) {
      case 'eq': return value === constraint.value;
      case 'ne': return value !== constraint.value;
      case 'gt': return value > constraint.value;
      case 'gte': return value >= constraint.value;
      case 'lt': return value < constraint.value;
      case 'lte': return value <= constraint.value;
      case 'contains': return String(value).includes(constraint.value);
      case 'in': return constraint.value.includes(value);
      default: return true;
    }
  }
}

/**
 * Offer from a Beacon
 */
export class Offer {
  #data;
  #constraints;

  constructor(data, constraints) {
    this.#data = data;
    this.#constraints = constraints;
  }

  get id() { return this.#data.id; }
  get beaconId() { return this.#data.beaconId; }
  get beaconName() { return this.#data.beaconName; }
  get product() { return this.#data.product; }
  get unitPrice() { return this.#data.unitPrice; }
  get quantity() { return this.#data.quantity; }
  get totalPrice() { return this.#data.totalPrice || (this.unitPrice * this.quantity); }
  get currency() { return this.#data.currency || 'USD'; }
  get deliveryDate() { return this.#data.deliveryDate; }
  get terms() { return this.#data.terms || {}; }
  get metadata() { return this.#data.metadata || {}; }

  get meetsConstraints() {
    return this.#constraints.meetsConstraints(this.#data);
  }

  get constraintViolations() {
    return this.#constraints.getViolations(this.#data);
  }

  get score() {
    return this.#constraints.score(this.#data);
  }

  toJSON() {
    return {
      ...this.#data,
      meetsConstraints: this.meetsConstraints,
      constraintViolations: this.constraintViolations,
      score: this.score,
    };
  }
}

/**
 * Committed Transaction
 */
export class Transaction {
  #data;

  constructor(data) {
    this.#data = data;
  }

  get id() { return this.#data.transactionId; }
  get status() { return this.#data.status; }
  get offerId() { return this.#data.offerId; }
  get paymentStatus() { return this.#data.paymentStatus; }
  get fulfillmentStatus() { return this.#data.fulfillmentStatus; }

  toJSON() {
    return { ...this.#data };
  }
}
