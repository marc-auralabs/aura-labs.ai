/**
 * Beacon Activity Logger
 *
 * Structured observability for a single Beacon's lifecycle.
 * Every action the Beacon takes — registration, polling, session handling,
 * offer submission, fulfillment — is recorded as a structured event with
 * timestamps, durations, correlation IDs, and outcome metadata.
 *
 * Consumers can:
 *   - Subscribe to events in real-time via `on(eventType, handler)`
 *   - Query the activity log via `getEvents()` with filters
 *   - Get summary stats via `getSummary()`
 *   - Plug in a custom logger (pino, winston, console, etc.)
 *
 * @example
 * ```js
 * const beacon = createBeacon({ ... });
 *
 * // Listen to specific events
 * beacon.activity.on('offer.submitted', (event) => {
 *   console.log(`Offer ${event.offerId} submitted in ${event.durationMs}ms`);
 * });
 *
 * // Get summary stats
 * const stats = beacon.activity.getSummary();
 * console.log(`Sessions: ${stats.sessions.received}, Offers: ${stats.offers.submitted}`);
 * ```
 */

import { randomUUID } from 'crypto';

/**
 * Supported activity event types
 */
export const ActivityEventTypes = {
  // Lifecycle
  BEACON_CREATED: 'beacon.created',
  BEACON_REGISTERED: 'beacon.registered',
  BEACON_REGISTRATION_FAILED: 'beacon.registration_failed',

  // Polling
  POLL_STARTED: 'poll.started',
  POLL_STOPPED: 'poll.stopped',
  POLL_CYCLE: 'poll.cycle',
  POLL_ERROR: 'poll.error',

  // Sessions
  SESSION_RECEIVED: 'session.received',
  SESSION_SKIPPED: 'session.skipped',
  SESSION_HANDLER_START: 'session.handler_start',
  SESSION_HANDLER_COMPLETE: 'session.handler_complete',
  SESSION_HANDLER_ERROR: 'session.handler_error',

  // Offers
  OFFER_VALIDATING: 'offer.validating',
  OFFER_VALIDATOR_PASS: 'offer.validator_pass',
  OFFER_VALIDATOR_FAIL: 'offer.validator_fail',
  OFFER_SUBMITTED: 'offer.submitted',
  OFFER_SUBMISSION_FAILED: 'offer.submission_failed',
  OFFER_ACCEPTED: 'offer.accepted',

  // Transactions
  TRANSACTION_UPDATE: 'transaction.update',
  FULFILLMENT_UPDATED: 'fulfillment.updated',
  FULFILLMENT_UPDATE_FAILED: 'fulfillment.update_failed',

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
 * ActivityLogger — records and emits structured Beacon events
 */
export class ActivityLogger {
  #events = [];
  #listeners = new Map();
  #maxEvents;
  #logger;
  #beaconContext;
  #counters;

  /**
   * @param {Object} options
   * @param {number} options.maxEvents - Max events to retain in memory (default 5000)
   * @param {Object} options.logger - External logger with info/warn/error methods (optional)
   * @param {Object} options.beaconContext - Beacon identity info attached to all events
   */
  constructor(options = {}) {
    this.#maxEvents = options.maxEvents || 5000;
    this.#logger = options.logger || null;
    this.#beaconContext = options.beaconContext || {};
    this.#counters = {
      sessions: { received: 0, skipped: 0, handled: 0, handlerErrors: 0 },
      offers: { submitted: 0, accepted: 0, validationFailed: 0, submissionFailed: 0 },
      polls: { cycles: 0, errors: 0 },
      requests: { total: 0, succeeded: 0, failed: 0, totalDurationMs: 0 },
      fulfillment: { updated: 0, failed: 0 },
    };
  }

  /**
   * Record an activity event
   */
  record(type, data = {}) {
    const event = new ActivityEvent(type, data);

    // Attach beacon context
    event.beaconId = this.#beaconContext.beaconId || null;
    event.beaconExternalId = this.#beaconContext.externalId || null;
    event.beaconName = this.#beaconContext.name || null;

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
      const logData = { ...event.toJSON(), beacon: this.#beaconContext };
      if (event.error) {
        this.#logger.error?.(logData, `[beacon] ${type}`);
      } else {
        this.#logger.info?.(logData, `[beacon] ${type}`);
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
   * Supports exact match ('offer.submitted') or prefix ('offer.*')
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
      beacon: { ...this.#beaconContext },
      sessions: { ...this.#counters.sessions },
      offers: {
        ...this.#counters.offers,
        acceptanceRate:
          this.#counters.offers.submitted > 0
            ? +(this.#counters.offers.accepted / this.#counters.offers.submitted * 100).toFixed(2)
            : 0,
      },
      polls: { ...this.#counters.polls },
      requests: {
        total: this.#counters.requests.total,
        succeeded: this.#counters.requests.succeeded,
        failed: this.#counters.requests.failed,
        avgDurationMs: avgRequestMs,
      },
      fulfillment: { ...this.#counters.fulfillment },
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
      sessions: { received: 0, skipped: 0, handled: 0, handlerErrors: 0 },
      offers: { submitted: 0, accepted: 0, validationFailed: 0, submissionFailed: 0 },
      polls: { cycles: 0, errors: 0 },
      requests: { total: 0, succeeded: 0, failed: 0, totalDurationMs: 0 },
      fulfillment: { updated: 0, failed: 0 },
    };
  }

  /**
   * Update beacon context (e.g., after registration when beaconId is assigned)
   */
  setBeaconContext(context) {
    this.#beaconContext = { ...this.#beaconContext, ...context };
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
      case ActivityEventTypes.SESSION_RECEIVED:
        this.#counters.sessions.received++;
        break;
      case ActivityEventTypes.SESSION_SKIPPED:
        this.#counters.sessions.skipped++;
        break;
      case ActivityEventTypes.SESSION_HANDLER_COMPLETE:
        this.#counters.sessions.handled++;
        break;
      case ActivityEventTypes.SESSION_HANDLER_ERROR:
        this.#counters.sessions.handlerErrors++;
        break;
      case ActivityEventTypes.OFFER_SUBMITTED:
        this.#counters.offers.submitted++;
        break;
      case ActivityEventTypes.OFFER_ACCEPTED:
        this.#counters.offers.accepted++;
        break;
      case ActivityEventTypes.OFFER_VALIDATOR_FAIL:
        this.#counters.offers.validationFailed++;
        break;
      case ActivityEventTypes.OFFER_SUBMISSION_FAILED:
        this.#counters.offers.submissionFailed++;
        break;
      case ActivityEventTypes.POLL_CYCLE:
        this.#counters.polls.cycles++;
        break;
      case ActivityEventTypes.POLL_ERROR:
        this.#counters.polls.errors++;
        break;
      case ActivityEventTypes.REQUEST_COMPLETE:
        this.#counters.requests.total++;
        this.#counters.requests.succeeded++;
        if (event.durationMs) this.#counters.requests.totalDurationMs += event.durationMs;
        break;
      case ActivityEventTypes.REQUEST_FAILED:
        this.#counters.requests.total++;
        this.#counters.requests.failed++;
        if (event.durationMs) this.#counters.requests.totalDurationMs += event.durationMs;
        break;
      case ActivityEventTypes.FULFILLMENT_UPDATED:
        this.#counters.fulfillment.updated++;
        break;
      case ActivityEventTypes.FULFILLMENT_UPDATE_FAILED:
        this.#counters.fulfillment.failed++;
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
        // Listener errors must not break the Beacon
      }
    }

    // Wildcard listeners (e.g., 'offer.*' matches 'offer.submitted')
    for (const [pattern, handlers] of this.#listeners) {
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        if (type.startsWith(prefix) && pattern !== type) {
          for (const handler of handlers) {
            try {
              handler(event.toJSON());
            } catch (_) {
              // Listener errors must not break the Beacon
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
        // Listener errors must not break the Beacon
      }
    }
  }
}
