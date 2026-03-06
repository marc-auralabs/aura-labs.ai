/**
 * Error classes for AURA Scout Chrome Extension
 *
 * Mirrors the error hierarchy in sdks/scout-js/src/errors.js
 * for consistent error handling across the AURA platform.
 */

/**
 * Base error for all Scout extension errors.
 */
export class ScoutError extends Error {
  constructor(message, code = 'SCOUT_ERROR') {
    super(message);
    this.name = 'ScoutError';
    this.code = code;
  }
}

/**
 * Network or connection errors (timeout, unreachable, etc.)
 */
export class ConnectionError extends ScoutError {
  constructor(message) {
    super(message, 'CONNECTION_ERROR');
    this.name = 'ConnectionError';
  }
}

/**
 * Authentication errors (invalid or missing API key).
 */
export class AuthenticationError extends ScoutError {
  constructor(message) {
    super(message, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

/**
 * Session lifecycle errors (invalid state, timeout, etc.)
 */
export class SessionError extends ScoutError {
  constructor(message, code = 'SESSION_ERROR') {
    super(message, code);
    this.name = 'SessionError';
  }
}

/**
 * Offer-related errors.
 */
export class OfferError extends ScoutError {
  constructor(message, offerId) {
    super(message, 'OFFER_ERROR');
    this.name = 'OfferError';
    this.offerId = offerId;
  }
}

/**
 * Cryptographic operation errors (signing, key generation, etc.)
 */
export class CryptoError extends ScoutError {
  constructor(message) {
    super(message, 'CRYPTO_ERROR');
    this.name = 'CryptoError';
  }
}

/**
 * TAP protocol errors.
 */
export class TAPError extends ScoutError {
  constructor(message, details) {
    super(message, 'TAP_ERROR');
    this.name = 'TAPError';
    this.details = details;
  }
}

/**
 * AP2 mandate errors.
 */
export class MandateError extends ScoutError {
  constructor(message, mandateType) {
    super(message, 'MANDATE_ERROR');
    this.name = 'MandateError';
    this.mandateType = mandateType;
  }
}
