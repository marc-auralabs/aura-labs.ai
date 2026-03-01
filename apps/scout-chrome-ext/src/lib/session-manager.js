/**
 * Session Manager
 *
 * Owns the shopping session lifecycle for the Chrome extension.
 * Coordinates between AuraClient (API calls), CryptoManager (Ed25519 keys),
 * the side panel UI (state rendering), and the service worker (message routing).
 *
 * Auto-registration:
 *   On first use, generates an Ed25519 key pair and registers with AURA Core
 *   via POST /agents/register. No API key or manual setup required.
 *
 * State machine:
 *   IDLE → SEARCHING → OFFERS_READY → MANDATE_FLOW → CHECKOUT → CONFIRMATION
 *
 * Uses EventTarget for loose coupling — UI components subscribe to
 * state change events rather than being called directly.
 */

import { AuraClient } from './aura-client.js';
import * as storage from './storage.js';
import * as cryptoManager from './crypto-manager.js';
import {
  SessionStatus,
  TERMINAL_STATUSES,
  POLL_INTERVAL_MS,
  POLL_TIMEOUT_MS,
  UIState,
  StorageKeys,
} from '../shared/constants.js';
import { SessionError } from '../shared/errors.js';

export class SessionManager extends EventTarget {
  #client = null;
  #session = null;
  #offers = [];
  #selectedOffer = null;
  #mandates = { intent: null, cart: null, payment: null };
  #transaction = null;
  #uiState = UIState.IDLE;
  #pollTimer = null;
  #agentId = null;
  #initPromise = null;

  /**
   * Initialise the session manager.
   *
   * Generates Ed25519 keys (if needed) and registers with AURA Core.
   * No API key required — identity is cryptographic.
   *
   * @param {Object} [options]
   * @param {string} [options.baseUrl] - Override Core API URL
   * @returns {Promise<void>}
   */
  async init(options = {}) {
    // Deduplicate concurrent init calls
    if (this.#initPromise) return this.#initPromise;
    this.#initPromise = this.#doInit(options);
    try {
      await this.#initPromise;
    } catch (error) {
      this.#initPromise = null;
      throw error;
    }
  }

  /** Current UI state */
  get state() {
    return this.#uiState;
  }

  /** Current session data */
  get session() {
    return this.#session;
  }

  /** Available offers */
  get offers() {
    return this.#offers;
  }

  /** Currently selected offer */
  get selectedOffer() {
    return this.#selectedOffer;
  }

  /** Mandate chain */
  get mandates() {
    return { ...this.#mandates };
  }

  /** Completed transaction */
  get transaction() {
    return this.#transaction;
  }

  /** Whether the manager has been initialised */
  get isReady() {
    return this.#client !== null && this.#agentId !== null;
  }

  /** Registered agent ID */
  get agentId() {
    return this.#agentId;
  }

  // =========================================================================
  // Session Lifecycle
  // =========================================================================

  /**
   * Start a new shopping session.
   *
   * @param {string} intent - Natural language shopping intent
   * @param {Object} [constraints] - Budget, categories, delivery, etc.
   * @returns {Promise<Object>} Session data from Core
   */
  async startSession(intent, constraints = {}) {
    this.#assertReady();
    this.#reset();

    this.#setState(UIState.SEARCHING);

    try {
      this.#session = await this.#client.createSession(intent, this.#agentId, constraints);

      // Persist session ID for recovery
      await storage.set(StorageKeys.CURRENT_SESSION, this.#session.sessionId);

      // Start polling for offers
      this.#startPolling();

      return this.#session;
    } catch (error) {
      this.#setState(UIState.ERROR);
      this.#emitError(error);
      throw error;
    }
  }

  /**
   * Cancel the current session.
   */
  async cancelSession() {
    if (!this.#session) return;

    this.#stopPolling();

    try {
      await this.#client.cancelSession(this.#session.sessionId);
    } catch {
      // Best effort — session may already be terminal
    }

    this.#reset();
    this.#setState(UIState.IDLE);
  }

  /**
   * Select an offer for checkout.
   */
  selectOffer(offerId) {
    const offer = this.#offers.find(o => o.id === offerId);
    if (!offer) {
      throw new SessionError(`Offer not found: ${offerId}`);
    }

    this.#selectedOffer = offer;
    this.#setState(UIState.MANDATE_FLOW);
  }

  /**
   * Store a mandate in the chain.
   */
  setMandate(type, mandate) {
    this.#mandates[type] = mandate;
    this.#emit('mandate-created', { type, mandate });
  }

  /**
   * Commit the selected offer and complete checkout.
   */
  async commitOffer() {
    this.#assertReady();

    if (!this.#session || !this.#selectedOffer) {
      throw new SessionError('No session or offer selected');
    }

    this.#setState(UIState.CHECKOUT);

    try {
      this.#transaction = await this.#client.commitOffer(
        this.#session.sessionId,
        this.#selectedOffer.id
      );

      await storage.remove(StorageKeys.CURRENT_SESSION);
      this.#setState(UIState.CONFIRMATION);

      return this.#transaction;
    } catch (error) {
      this.#setState(UIState.ERROR);
      this.#emitError(error);
      throw error;
    }
  }

  /**
   * Reset to idle state for a new session.
   */
  newSession() {
    this.#reset();
    this.#setState(UIState.INTENT_INPUT);
  }

  // =========================================================================
  // Polling
  // =========================================================================

  #startPolling() {
    const startTime = Date.now();

    this.#pollTimer = setInterval(async () => {
      if (Date.now() - startTime > POLL_TIMEOUT_MS) {
        this.#stopPolling();
        this.#setState(UIState.ERROR);
        this.#emitError(new SessionError('Timed out waiting for offers', 'TIMEOUT'));
        return;
      }

      try {
        const sessionData = await this.#client.getSession(this.#session.sessionId);
        this.#session = sessionData;

        if (TERMINAL_STATUSES.includes(sessionData.status)) {
          this.#stopPolling();
          this.#setState(UIState.ERROR);
          this.#emitError(new SessionError(`Session ended: ${sessionData.status}`));
          return;
        }

        if (sessionData.status === SessionStatus.OFFERS_AVAILABLE) {
          this.#stopPolling();
          await this.#fetchOffers();
          this.#setState(UIState.OFFERS_READY);
        }

        this.#emit('session-updated', sessionData);
      } catch (error) {
        this.#emitError(error);
      }
    }, POLL_INTERVAL_MS);
  }

  #stopPolling() {
    if (this.#pollTimer) {
      clearInterval(this.#pollTimer);
      this.#pollTimer = null;
    }
  }

  async #fetchOffers() {
    const response = await this.#client.getOffers(this.#session.sessionId);
    this.#offers = response.offers || [];
    this.#emit('offers-ready', this.#offers);
  }

  // =========================================================================
  // Initialization & Identity
  // =========================================================================

  async #doInit(options) {
    // Step 1: Create client (no API key needed)
    this.#client = new AuraClient({ ...options });

    // Step 2: Generate or load Ed25519 keys
    await cryptoManager.getOrCreateKeyPair();

    // Step 3: Check for existing agent registration
    const storedAgentId = await storage.get(StorageKeys.AGENT_ID);
    if (storedAgentId) {
      this.#agentId = storedAgentId;
      this.#client.setIdentity(this.#agentId, (data) => cryptoManager.sign(data));
      return;
    }

    // Step 4: Register with AURA Core
    const publicKeyBase64 = await cryptoManager.getPublicKeyBase64();

    const result = await this.#client.registerAgent({
      publicKey: publicKeyBase64,
      type: 'scout',
      manifest: {
        name: 'AURA Scout Chrome Extension',
        version: '0.1.0',
        platform: 'chrome-extension',
        capabilities: ['intent', 'compare', 'mandate.sign'],
        protocolVersions: ['ap2-v1', 'tap-v1'],
      },
      signFn: (data) => cryptoManager.sign(data),
    });

    this.#agentId = result.agentId;
    await storage.set(StorageKeys.AGENT_ID, this.#agentId);

    // Configure client for signed requests
    this.#client.setIdentity(this.#agentId, (data) => cryptoManager.sign(data));
  }

  // =========================================================================
  // Internal Helpers
  // =========================================================================

  #assertReady() {
    if (!this.#client || !this.#agentId) {
      throw new SessionError('SessionManager not initialised — call init() first');
    }
  }

  #reset() {
    this.#stopPolling();
    this.#session = null;
    this.#offers = [];
    this.#selectedOffer = null;
    this.#mandates = { intent: null, cart: null, payment: null };
    this.#transaction = null;
  }

  #setState(newState) {
    const previous = this.#uiState;
    this.#uiState = newState;
    this.#emit('state-change', { previous, current: newState });
  }

  #emit(eventName, detail) {
    this.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  #emitError(error) {
    this.dispatchEvent(new CustomEvent('error', {
      detail: { message: error.message, code: error.code, name: error.name },
    }));
  }
}
