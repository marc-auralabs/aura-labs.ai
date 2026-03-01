/**
 * AURA Scout SDK
 *
 * Build buying agents that participate in agentic commerce.
 * Scouts represent users in the AURA ecosystem, expressing intent
 * and negotiating with Beacons through the neutral Core broker.
 *
 * @example
 * ```js
 * import { createScout } from '@aura-labs/scout';
 *
 * // Zero config — auto-generates Ed25519 identity and registers with Core
 * const scout = createScout();
 * await scout.ready();
 *
 * // Express purchase intent with constraints
 * const session = await scout.intent('I need 500 widgets', {
 *   maxBudget: 50000,
 *   deliveryBy: new Date('2026-03-01'),
 * });
 *
 * // Wait for offers (polling)
 * const offers = await session.waitForOffers();
 *
 * // Commit to best offer that meets constraints
 * if (session.bestOffer) {
 *   const tx = await session.commit(session.bestOffer.id);
 *   console.log('Transaction:', tx.id);
 * }
 * ```
 */

import { ScoutClient } from './client.js';
import { Session, Constraints } from './session.js';
import { KeyManager, MemoryStorage } from './key-manager.js';
import {
  ScoutError,
  ConnectionError,
  AuthenticationError,
  SessionError,
  ConstraintError,
  OfferError,
} from './errors.js';

// Protocol Integrations
import { MCPClient } from './mcp/client.js';
import { AP2Mandates, generateKeyPair as generateAP2KeyPair } from './ap2/mandates.js';
import { VisaTAP, TAPError } from './tap/visa.js';

/**
 * Create a new Scout instance
 *
 * @param {ScoutConfig} config - Scout configuration
 * @returns {Scout} Configured Scout instance
 */
export function createScout(config) {
  return new Scout(config);
}

/**
 * Scout - User-sovereign buying agent
 *
 * The Scout represents a user's interests in the AURA commerce ecosystem.
 * It handles:
 * - Expressing purchase intent in natural language
 * - Managing commerce sessions
 * - Evaluating offers against user-defined constraints
 * - Committing to transactions
 */
export class Scout {
  #client;
  #config;
  #keyManager;
  #sessions = new Map();
  #registered = false;
  #agentId = null;
  #readyPromise = null;

  /**
   * @param {ScoutConfig} config
   * @param {string} [config.apiKey] - Optional API key (legacy — for developer analytics/billing)
   * @param {string} [config.coreUrl] - AURA Core API URL
   * @param {number} [config.timeout] - Request timeout in ms
   * @param {object} [config.storage] - Storage adapter with get/set/remove methods
   * @param {object} [config.constraints] - Default constraints for all sessions
   */
  constructor(config = {}) {
    this.#config = {
      coreUrl: 'https://aura-labsai-production.up.railway.app',
      timeout: 30000,
      constraints: {},
      ...config,
    };

    // Initialize key manager with provided storage (or in-memory default)
    this.#keyManager = new KeyManager({
      storage: this.#config.storage,
    });

    this.#client = new ScoutClient(this.#config);
  }

  /**
   * Initialize the Scout — generates keys and registers with AURA Core
   *
   * Call this once before using the Scout. It generates Ed25519 keys (if new)
   * and registers with Core via POST /agents/register (if not already registered).
   *
   * This is idempotent — safe to call multiple times.
   *
   * @returns {Promise<Scout>} Returns self for chaining
   */
  async ready() {
    // Deduplicate concurrent ready() calls
    if (this.#readyPromise) return this.#readyPromise;

    this.#readyPromise = this.#initialize();
    try {
      await this.#readyPromise;
      return this;
    } catch (error) {
      this.#readyPromise = null;
      throw error;
    }
  }

  /**
   * Register this Scout with AURA Core
   *
   * Called automatically by ready(), but can be called explicitly
   * to re-register or update metadata.
   *
   * Uses the new /agents/register endpoint with Ed25519 proof-of-possession.
   * Falls back to legacy /scouts/register if apiKey is provided.
   *
   * @param {object} metadata - Optional metadata about this Scout
   * @returns {Promise<{agentId: string}>}
   */
  async register(metadata = {}) {
    if (this.#registered && this.#agentId) {
      return { agentId: this.#agentId };
    }

    // Ensure keys are initialized
    if (!this.#keyManager.isInitialized) {
      await this.#keyManager.init();
    }

    const publicKey = this.#keyManager.publicKey;

    // Build registration body
    const body = {
      publicKey,
      type: 'scout',
      manifest: {
        name: metadata.name || 'AURA Scout',
        version: '0.1.0',
        platform: metadata.platform || 'node-sdk',
        sdkVersion: '0.1.0',
        capabilities: ['intent', 'compare', 'mandate.sign'],
        protocolVersions: ['ap2-v1', 'tap-v1'],
        ...metadata,
      },
    };

    // Sign the body for proof-of-possession
    const bodyString = JSON.stringify(body);
    const signature = this.#keyManager.sign(bodyString);

    const result = await this.#client.postSigned('/agents/register', body, {
      'X-Agent-Signature': signature,
    });

    this.#agentId = result.agentId;
    this.#registered = true;

    // Persist agentId for next launch
    await this.#keyManager.setAgentId(this.#agentId);

    // Configure client to sign subsequent requests
    this.#client.setKeyManager(this.#keyManager, this.#agentId);

    return { agentId: this.#agentId };
  }

  /**
   * Express purchase intent and create a commerce session
   *
   * Intent is expressed in natural language. AURA Core interprets the
   * intent and matches it against Beacon capabilities.
   *
   * @param {string} intent - Natural language description of what you want
   * @param {IntentOptions} options - Constraints and preferences
   * @returns {Promise<Session>}
   *
   * @example
   * ```js
   * // Simple intent
   * const session = await scout.intent('I want to buy a laptop');
   *
   * // Intent with constraints
   * const session = await scout.intent('I need office supplies', {
   *   maxBudget: 500,
   *   deliveryBy: new Date('2026-02-15'),
   *   hardConstraints: [
   *     { field: 'sustainable', operator: 'eq', value: true }
   *   ],
   *   softPreferences: [
   *     { field: 'rating', operator: 'gte', value: 4.5, weight: 10 }
   *   ]
   * });
   * ```
   */
  async intent(intent, options = {}) {
    // Auto-initialize if needed
    if (!this.#registered) {
      await this.ready();
    }

    // Merge session-specific constraints with defaults
    const constraints = {
      ...this.#config.constraints,
      ...options,
    };

    const response = await this.#client.post('/sessions', {
      intent,
      agentId: this.#agentId,
      constraints: {
        maxBudget: constraints.maxBudget,
        deliveryBy: constraints.deliveryBy,
        hardConstraints: constraints.hardConstraints,
        softPreferences: constraints.softPreferences,
      },
    });

    const sessionConfig = {
      ...this.#config,
      constraints,
    };

    const session = new Session(response, this.#client, sessionConfig);
    this.#sessions.set(session.id, session);

    return session;
  }

  /**
   * Resume an existing session by ID
   *
   * @param {string} sessionId
   * @returns {Promise<Session>}
   */
  async resumeSession(sessionId) {
    if (this.#sessions.has(sessionId)) {
      return this.#sessions.get(sessionId);
    }

    const response = await this.#client.get(`/sessions/${sessionId}`);
    const session = new Session(response, this.#client, this.#config);
    this.#sessions.set(session.id, session);

    return session;
  }

  /**
   * List active sessions
   *
   * @returns {Session[]}
   */
  get activeSessions() {
    return Array.from(this.#sessions.values()).filter(s => s.isActive);
  }

  /**
   * Set default constraints for all sessions
   *
   * @param {object} constraints
   */
  setDefaultConstraints(constraints) {
    this.#config.constraints = {
      ...this.#config.constraints,
      ...constraints,
    };
  }

  /**
   * Get Scout's registration status
   */
  get isRegistered() {
    return this.#registered;
  }

  /**
   * Get Agent ID (null if not registered)
   */
  get id() {
    return this.#agentId;
  }

  /**
   * Get the agent's public key (base64-encoded Ed25519)
   */
  get publicKey() {
    return this.#keyManager.publicKey;
  }

  /**
   * Get Core URL
   */
  get coreUrl() {
    return this.#client.coreUrl;
  }

  // ─── Private ────────────────────────────────────────────────────────

  async #initialize() {
    // Step 1: Initialize key manager (generate or load keys)
    const { isNew } = await this.#keyManager.init();

    // Step 2: Check if already registered (agentId in storage)
    const storedAgentId = await this.#keyManager.getAgentId();
    if (storedAgentId) {
      this.#agentId = storedAgentId;
      this.#registered = true;
      this.#client.setKeyManager(this.#keyManager, this.#agentId);
      return;
    }

    // Step 3: Register with Core
    await this.register();
  }
}

// Re-export classes
export { Session, Constraints } from './session.js';
export { KeyManager, MemoryStorage } from './key-manager.js';
export {
  ScoutError,
  ConnectionError,
  AuthenticationError,
  SessionError,
  ConstraintError,
  OfferError,
} from './errors.js';

// =========================================================================
// Protocol Integrations
// =========================================================================

/**
 * MCP (Model Context Protocol) Client
 *
 * Connect to MCP servers to access external tools and context.
 *
 * @example
 * ```js
 * import { MCPClient } from '@aura-labs/scout';
 *
 * const mcp = new MCPClient();
 * await mcp.connect('https://mcp.example.com/sse');
 * const tools = await mcp.listAllTools();
 * const result = await mcp.callTool('server-uri', 'search', { query: 'laptops' });
 * ```
 */
export { MCPClient };

/**
 * AP2 Mandates - Google's Agent Payments Protocol
 *
 * Create user-signed mandates that authorize agent actions:
 * - Intent Mandate: Authorizes shopping within constraints
 * - Cart Mandate: Authorizes specific purchase
 * - Payment Mandate: Authorization for payment networks
 *
 * @example
 * ```js
 * import { AP2Mandates, generateAP2KeyPair } from '@aura-labs/scout';
 *
 * const { publicKey, privateKey } = generateAP2KeyPair();
 *
 * const intentMandate = await AP2Mandates.createIntent({
 *   agentId: 'scout-123',
 *   userId: 'user-456',
 *   userKey: privateKey,
 *   constraints: {
 *     maxAmount: 5000,
 *     currency: 'USD',
 *     categories: ['electronics'],
 *     validUntil: '2026-03-01T00:00:00Z',
 *   },
 * });
 * ```
 */
export { AP2Mandates, generateAP2KeyPair };

/**
 * Visa TAP - Trusted Agent Protocol
 *
 * Agent identity verification for commerce transactions.
 * Allows payment networks to verify agent authenticity.
 *
 * @example
 * ```js
 * import { VisaTAP } from '@aura-labs/scout';
 *
 * // Generate keys and register agent
 * const keyPair = VisaTAP.generateKeyPair();
 * const registration = await VisaTAP.register({
 *   agentId: 'my-scout-agent',
 *   publicKey: keyPair.publicKey,
 *   metadata: { name: 'Shopping Agent', operator: 'AURA Labs' },
 * });
 *
 * // Sign HTTP requests for TAP verification
 * const signedRequest = await VisaTAP.signRequest(
 *   { method: 'POST', url: '/api/pay', body: { amount: 100 } },
 *   { tapId: registration.tapId, privateKey: keyPair.privateKey, keyId: keyPair.keyId }
 * );
 * ```
 */
export { VisaTAP, TAPError };

// Default export
export default {
  createScout,
  Scout,
  KeyManager,
  // Protocols
  MCPClient,
  AP2Mandates,
  VisaTAP,
};
