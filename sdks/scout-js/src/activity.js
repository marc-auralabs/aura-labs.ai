/**
 * Scout Activity Logger
 *
 * Structured observability for a single Scout's (buyer) lifecycle.
 * Every action the Scout takes — registration, session management,
 * offer evaluation, transaction handling — is recorded as a structured event
 * with timestamps, durations, correlation IDs, and outcome metadata.
 *
 * Consumers can:
 *   - Subscribe to events in real-time via `on(eventType, handler)`
 *   - Query the activity log via `getEvents()` with filters
 *   - Get summary stats via `getSummary()`
 *   - Plug in a custom logger (pino, winston, console, etc.)
 *
 * @example
 * ```js
 * const scout = createScout({ ... });
 *
 * // Listen to specific events
 * scout.activity.on('offer.committed', (event) => {
 *   console.log(`Offer ${event.offerId} committed in ${event.durationMs}ms`);
 * });
 *
 * // Get summary stats
 * const stats = scout.activity.getSummary();
 * console.log(`Sessions: ${stats.sessions.created}, Offers: ${stats.offers.committed}`);
 * ```
 */

import { randomUUID } from 'crypto';

/**
 * Supported Scout activity event types
 */
export const ScoutActivityEventTypes = {
  // Lifecycle
  SCOUT_CREATED: 'scout.created',
  SCOUT_READY: 'scout.ready',
  SCOUT_READY_FAILED: 'scout.ready_failed',
  SCOUT_REGISTERED: 'scout.registered',
  SCOUT_REGISTRATION_FAILED: 'scout.registration_failed',

  // Intent
  INTENT_CREATED: 'intent.created',
  INTENT_FAILED: 'intent.failed',

  // Sessions
  SESSION_CREATED: 'session.created',
  SESSION_REFRESHED: 'session.refreshed',
  SESSION_RESUMED: 'session.resumed',
  SESSION_RESUME_FAILED: 'session.resume_failed',
  SESSION_CANCELLED: 'session.cancelled',
  SESSION_CANCEL_FAILED: 'session.cancel_failed',
  SESSION_COMMITTED: 'session.committed',
  SESSION_COMMIT_FAILED: 'session.commit_failed',

  // Offers
  OFFERS_POLLING: 'offers.polling',
  OFFERS_RECEIVED: 'offers.received',
  OFFERS_EVALUATED: 'offers.evaluated',
  OFFER_COMMITTED: 'offer.committed',
  WAIT_FOR_OFFERS: 'offers.wait_complete',
  WAIT_FOR_OFFERS_FAILED: 'offers.wait_failed',

  // Transactions
  TRANSACTION_CREATED: 'transaction.created',
  TRANSACTION_REFRESHED: 'transaction.refreshed',
  TRANSACTION_FULFILLED: 'transaction.fulfilled',
  TRANSACTION_FULFILLMENT_TIMEOUT: 'transaction.fulfillment_timeout',
  WAIT_FOR_FULFILLMENT: 'transaction.wait_complete',
  WAIT_FOR_FULFILLMENT_FAILED: 'transaction.wait_failed',

  // HTTP
  REQUEST_START: 'request.start',
  REQUEST_COMPLETE: 'request.complete',
  REQUEST_FAILED: 'request.failed',
};

/**
 * Activity event — the unit of observability
 */
export class ActivityEvent {
  constructor(type, data = {}) {
    this.id = randomUUID();
    this.type = type;
    this.timestamp = new Date().toISOString();
    this.epochMs = Date.now();
    this.durationMs = data.durationMs || null;
    this.correlationId = data.correlationId || null;
    this.sessionId = data.sessionId || null;
    this.transactionId = data.transactionId || null;
    this.success = data.success !== undefined ? data.success : null;
    this.error = data.error || null;
    this.metadata = data.metadata || {};
  }

  toJSON() {
    const obj = {
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
    };
    if (this.durationMs !== null) obj.durationMs = this.durationMs;
    if (this.correlationId) obj.correlationId = this.correlationId;
    if (this.sessionId) obj.sessionId = this.sessionId;
    if (this.transactionId) obj.transactionId = this.transactionId;
    if (this.success !== null) obj.success = this.success;
    if (this.error) obj.error = this.error;
    if (Object.keys(this.metadata).length > 0) obj.metadata = this.metadata;
    return obj;
  }
}

/**
 * ScoutActivityLogger — records and emits structured Scout events
 */
export class ScoutActivityLogger {
  #events = [];
  #listeners = new Map();
  #maxEvents;
  #logger;
  #scoutContext;
  #counters;

  /**
   * @param {Object} options
   * @param {number} options.maxEvents - Max events to retain in memory (default 5000)
   * @param {Object} options.logger - External logger with info/warn/error methods (optional)
   * @param {Object} options.scoutContext - Scout identity info attached to all events
   */
  constructor(options = {}) {
    this.#maxEvents = options.maxEvents || 5000;
    this.#logger = options.logger || null;
    this.#scoutContext = options.scoutContext || {};
    this.#counters = {
      sessions: { created: 0, committed: 0, cancelled: 0 },
      offers: { received: 0, evaluated: 0, committed: 0 },
      transactions: { created: 0, fulfilled: 0, timedOut: 0 },
      requests: { total: 0, succeeded: 0, failed: 0, totalDurationMs: 0 },
    };
  }

  /**
   * Record an activity event
   */
  record(type, data = {}) {
    const event = new ActivityEvent(type, data);

    // Attach scout context
    event.scoutId = this.#scoutContext.scoutId || null;
    event.scoutExternalId = this.#scoutContext.externalId || null;
    event.scoutName = this.#scoutContext.name || null;

    // Store event
    this.#events.push(event);

    // Prune if over limit
    if (this.#events.length > this.#maxEvents) {
      this.#events = this.#events.slice(-Math.floor(this.#maxEvents * 0.8));
    }

    // Update counters
    this.#updateCounters(event);

    // Emit to listeners
    this.#emit(type, event);

    // Forward to external logger if configured
    if (this.#logger) {
      const logData = { ...event.toJSON(), scout: this.#scoutContext };
      if (event.error) {
        this.#logger.error?.(logData, `[scout] ${type}`);
      } else {
        this.#logger.info?.(logData, `[scout] ${type}`);
      }
    }

    return event;
  }

  /**
   * Create a timer for measuring durations
   * Returns a function that, when called, records the event with duration
   */
  startTimer(type, data = {}) {
    const start = Date.now();
    const correlationId = data.correlationId || randomUUID();

    return (completionData = {}) => {
      return this.record(type, {
        ...data,
        ...completionData,
        correlationId,
        durationMs: Date.now() - start,
      });
    };
  }

  /**
   * Subscribe to events by type
   * Supports exact match ('offer.committed') or prefix ('offer.*')
   */
  on(eventType, handler) {
    if (!this.#listeners.has(eventType)) {
      this.#listeners.set(eventType, []);
    }
    this.#listeners.get(eventType).push(handler);
    return this;
  }

  /**
   * Remove a listener
   */
  off(eventType, handler) {
    const handlers = this.#listeners.get(eventType);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx !== -1) handlers.splice(idx, 1);
    }
    return this;
  }

  /**
   * Query events with optional filters
   * @param {Object} filters
   * @param {string} filters.type - Event type (exact or prefix with *)
   * @param {string} filters.sessionId - Filter by session
   * @param {string} filters.correlationId - Filter by correlation
   * @param {string} filters.since - ISO timestamp, events after this time
   * @param {number} filters.limit - Max results (default 100)
   */
  getEvents(filters = {}) {
    let results = this.#events;

    if (filters.type) {
      if (filters.type.endsWith('*')) {
        const prefix = filters.type.slice(0, -1);
        results = results.filter((e) => e.type.startsWith(prefix));
      } else {
        results = results.filter((e) => e.type === filters.type);
      }
    }

    if (filters.sessionId) {
      results = results.filter((e) => e.sessionId === filters.sessionId);
    }

    if (filters.correlationId) {
      results = results.filter((e) => e.correlationId === filters.correlationId);
    }

    if (filters.since) {
      const sinceMs = new Date(filters.since).getTime();
      results = results.filter((e) => e.epochMs >= sinceMs);
    }

    if (filters.limit) {
      results = results.slice(-filters.limit);
    }

    return results.map((e) => e.toJSON());
  }

  /**
   * Get aggregate summary counters
   */
  getSummary() {
    const avgRequestMs =
      this.#counters.requests.total > 0
        ? Math.round(this.#counters.requests.totalDurationMs / this.#counters.requests.total)
        : 0;

    return {
      scout: { ...this.#scoutContext },
      sessions: { ...this.#counters.sessions },
      offers: { ...this.#counters.offers },
      transactions: { ...this.#counters.transactions },
      requests: {
        total: this.#counters.requests.total,
        succeeded: this.#counters.requests.succeeded,
        failed: this.#counters.requests.failed,
        avgDurationMs: avgRequestMs,
      },
      eventsRecorded: this.#events.length,
      oldestEvent: this.#events[0]?.timestamp || null,
      newestEvent: this.#events[this.#events.length - 1]?.timestamp || null,
    };
  }

  /**
   * Clear all events (keeps counters)
   */
  clearEvents() {
    this.#events = [];
  }

  /**
   * Reset everything (events and counters)
   */
  reset() {
    this.#events = [];
    this.#counters = {
      sessions: { created: 0, committed: 0, cancelled: 0 },
      offers: { received: 0, evaluated: 0, committed: 0 },
      transactions: { created: 0, fulfilled: 0, timedOut: 0 },
      requests: { total: 0, succeeded: 0, failed: 0, totalDurationMs: 0 },
    };
  }

  /**
   * Update scout context (e.g., after registration when scoutId is assigned)
   */
  setScoutContext(context) {
    this.#scoutContext = { ...this.#scoutContext, ...context };
  }

  /**
   * Generate a new correlation ID
   */
  static correlationId() {
    return randomUUID();
  }

  // --- Private methods ---

  #updateCounters(event) {
    switch (event.type) {
      case ScoutActivityEventTypes.SESSION_CREATED:
        this.#counters.sessions.created++;
        break;
      case ScoutActivityEventTypes.SESSION_COMMITTED:
        this.#counters.sessions.committed++;
        break;
      case ScoutActivityEventTypes.SESSION_CANCELLED:
        this.#counters.sessions.cancelled++;
        break;
      case ScoutActivityEventTypes.OFFERS_RECEIVED:
        this.#counters.offers.received++;
        break;
      case ScoutActivityEventTypes.OFFERS_EVALUATED:
        this.#counters.offers.evaluated++;
        break;
      case ScoutActivityEventTypes.OFFER_COMMITTED:
        this.#counters.offers.committed++;
        break;
      case ScoutActivityEventTypes.TRANSACTION_CREATED:
        this.#counters.transactions.created++;
        break;
      case ScoutActivityEventTypes.TRANSACTION_FULFILLED:
        this.#counters.transactions.fulfilled++;
        break;
      case ScoutActivityEventTypes.TRANSACTION_FULFILLMENT_TIMEOUT:
        this.#counters.transactions.timedOut++;
        break;
      case ScoutActivityEventTypes.REQUEST_COMPLETE:
        this.#counters.requests.total++;
        this.#counters.requests.succeeded++;
        if (event.durationMs) this.#counters.requests.totalDurationMs += event.durationMs;
        break;
      case ScoutActivityEventTypes.REQUEST_FAILED:
        this.#counters.requests.total++;
        this.#counters.requests.failed++;
        if (event.durationMs) this.#counters.requests.totalDurationMs += event.durationMs;
        break;
    }
  }

  #emit(type, event) {
    // Exact match listeners
    const exact = this.#listeners.get(type) || [];
    for (const handler of exact) {
      try {
        handler(event.toJSON());
      } catch (_) {
        // Listener errors must not break the Scout
      }
    }

    // Wildcard listeners (e.g., 'offer.*' matches 'offer.committed')
    for (const [pattern, handlers] of this.#listeners) {
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        if (type.startsWith(prefix) && pattern !== type) {
          for (const handler of handlers) {
            try {
              handler(event.toJSON());
            } catch (_) {
              // Listener errors must not break the Scout
            }
          }
        }
      }
    }

    // Global wildcard
    const global = this.#listeners.get('*') || [];
    for (const handler of global) {
      try {
        handler(event.toJSON());
      } catch (_) {
        // Listener errors must not break the Scout
      }
    }
  }
}
