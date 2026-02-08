/**
 * Scout SDK Error Classes
 */

/**
 * Base error for all Scout SDK errors
 */
export class ScoutError extends Error {
  constructor(message, code = 'SCOUT_ERROR') {
    super(message);
    this.name = 'ScoutError';
    this.code = code;
  }
}

/**
 * Connection/network errors
 */
export class ConnectionError extends ScoutError {
  constructor(message) {
    super(message, 'CONNECTION_ERROR');
    this.name = 'ConnectionError';
  }
}

/**
 * Authentication errors (invalid API key, etc.)
 */
export class AuthenticationError extends ScoutError {
  constructor(message) {
    super(message, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

/**
 * Session-related errors
 */
export class SessionError extends ScoutError {
  constructor(message, code = 'SESSION_ERROR') {
    super(message, code);
    this.name = 'SessionError';
  }
}

/**
 * Constraint validation errors
 */
export class ConstraintError extends ScoutError {
  constructor(message, constraint) {
    super(message, 'CONSTRAINT_ERROR');
    this.name = 'ConstraintError';
    this.constraint = constraint;
  }
}

/**
 * Offer-related errors
 */
export class OfferError extends ScoutError {
  constructor(message, offerId) {
    super(message, 'OFFER_ERROR');
    this.name = 'OfferError';
    this.offerId = offerId;
  }
}
