/**
 * Shared constants for AURA Scout Chrome Extension
 *
 * Centralises API URLs, timeouts, status enums, and configuration
 * values used across all extension components.
 */

/** AURA Core API base URL */
export const CORE_API_URL = 'https://aura-labsai-production.up.railway.app';

/** HTTP request timeout in milliseconds */
export const REQUEST_TIMEOUT_MS = 30_000;

/** Offer polling interval in milliseconds */
export const POLL_INTERVAL_MS = 2_000;

/** Offer polling timeout in milliseconds */
export const POLL_TIMEOUT_MS = 30_000;

/** SDK version identifier sent with requests */
export const SDK_VERSION = '@aura-labs/scout-chrome/0.1.0';

/**
 * Session status values from AURA Core.
 * Mirrors SessionStatus in sdks/scout-js/src/session.js.
 */
export const SessionStatus = Object.freeze({
  CREATED: 'created',
  MARKET_FORMING: 'market_forming',
  OFFERS_AVAILABLE: 'offers_available',
  NEGOTIATING: 'negotiating',
  COMMITTED: 'committed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
});

/**
 * Terminal session states — no further transitions possible.
 */
export const TERMINAL_STATUSES = Object.freeze([
  SessionStatus.COMPLETED,
  SessionStatus.CANCELLED,
  SessionStatus.EXPIRED,
]);

/**
 * Side panel UI states.
 * Drives the state machine in sidepanel.js.
 */
export const UIState = Object.freeze({
  IDLE: 'idle',
  INTENT_INPUT: 'intent_input',
  SEARCHING: 'searching',
  OFFERS_READY: 'offers_ready',
  MANDATE_FLOW: 'mandate_flow',
  CHECKOUT: 'checkout',
  CONFIRMATION: 'confirmation',
  ERROR: 'error',
});

/**
 * AP2 mandate steps for the mandate flow UI.
 */
export const MandateStep = Object.freeze({
  INTENT: 'intent',
  CART: 'cart',
  PAYMENT: 'payment',
});

/**
 * Chrome storage keys.
 */
export const StorageKeys = Object.freeze({
  API_KEY: 'aura_api_key',         // Legacy — kept for backward compat
  SCOUT_ID: 'aura_scout_id',       // Legacy — kept for backward compat
  AGENT_ID: 'aura_agent_id',       // New: UUID from /agents/register
  KEY_PAIR: 'aura_key_pair',
  TAP_CREDENTIALS: 'aura_tap_credentials',
  CURRENT_SESSION: 'aura_current_session',
});

/**
 * Message types for chrome.runtime messaging between
 * service worker, side panel, popup, and content scripts.
 */
export const MessageType = Object.freeze({
  // Session lifecycle
  CREATE_SESSION: 'create_session',
  SESSION_UPDATED: 'session_updated',
  CANCEL_SESSION: 'cancel_session',

  // Offers
  OFFERS_READY: 'offers_ready',
  SELECT_OFFER: 'select_offer',

  // Mandates
  CREATE_INTENT_MANDATE: 'create_intent_mandate',
  CREATE_CART_MANDATE: 'create_cart_mandate',
  CREATE_PAYMENT_MANDATE: 'create_payment_mandate',
  MANDATE_CREATED: 'mandate_created',

  // Checkout
  COMMIT_OFFER: 'commit_offer',
  CHECKOUT_COMPLETE: 'checkout_complete',

  // Content script
  EXTRACT_PRODUCT: 'extract_product',
  PRODUCT_EXTRACTED: 'product_extracted',

  // Settings
  API_KEY_UPDATED: 'api_key_updated',
  HEALTH_CHECK: 'health_check',
  HEALTH_RESULT: 'health_result',

  // Errors
  ERROR: 'error',
});
