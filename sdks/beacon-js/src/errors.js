/**
 * Beacon SDK Error Classes
 */

export class BeaconError extends Error {
  constructor(message, code = 'BEACON_ERROR') {
    super(message);
    this.name = 'BeaconError';
    this.code = code;
  }
}

export class ConnectionError extends BeaconError {
  constructor(message) {
    super(message, 'CONNECTION_ERROR');
    this.name = 'ConnectionError';
  }
}

export class RegistrationError extends BeaconError {
  constructor(message) {
    super(message, 'REGISTRATION_ERROR');
    this.name = 'RegistrationError';
  }
}

export class OfferError extends BeaconError {
  constructor(message, sessionId) {
    super(message, 'OFFER_ERROR');
    this.name = 'OfferError';
    this.sessionId = sessionId;
  }
}
