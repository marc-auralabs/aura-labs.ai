/**
 * Simple Scout - Reference Implementation
 *
 * A minimal Scout client that demonstrates the AURA protocol from the
 * buyer side. Scouts represent buying agents that:
 *
 * 1. Register with AURA Core
 * 2. Express shopping intent (natural language + structured hints)
 * 3. Receive and evaluate ranked offers
 * 4. Commit to transactions
 *
 * This implementation uses HATEOAS - it discovers available actions
 * dynamically from API responses rather than hardcoding URLs.
 *
 * @module SimpleScout
 * @version 0.1.0
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG = {
  AURA_CORE_URL: process.env.AURA_CORE_URL || 'http://localhost:8080',
  AURA_WS_URL: process.env.AURA_WS_URL || 'ws://localhost:8080',
  API_KEY: process.env.AURA_API_KEY || null,
  SCOUT_NAME: 'SimpleScout',
  AUTO_DISCOVER: true, // Use HATEOAS to discover endpoints
};

// ============================================================================
// SCOUT CLIENT CLASS
// ============================================================================

class SimpleScout {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.scoutId = null;
    this.apiKey = this.config.API_KEY;
    this.ws = null;

    // HATEOAS link cache - populated from API responses
    this.links = {};
    this.discoveredEndpoints = false;
  }

  // ==========================================================================
  // HATEOAS DISCOVERY
  // ==========================================================================

  /**
   * Discover API endpoints by following HATEOAS links from root.
   * This is the recommended way to initialize the client.
   */
  async discover() {
    console.log('Discovering AURA Core API...');

    const response = await this.request('GET', '/v1');
    this.links = response._links || {};
    this.discoveredEndpoints = true;

    console.log('Available actions:', Object.keys(this.links).join(', '));
    return this.links;
  }

  /**
   * Get a link from the cache or a response.
   * @param {string} rel - Link relation name
   * @param {object} response - Optional response object to search
   */
  getLink(rel, response = null) {
    const source = response?._links || this.links;
    const link = source[rel];

    if (!link) {
      throw new Error(`Link '${rel}' not found. Available: ${Object.keys(source).join(', ')}`);
    }

    return link;
  }

  // ==========================================================================
  // REGISTRATION
  // ==========================================================================

  /**
   * Register this Scout with AURA Core.
   * Returns API credentials and updates internal state.
   */
  async register(options = {}) {
    if (!this.discoveredEndpoints) {
      await this.discover();
    }

    const scoutsLink = this.getLink('scouts');

    const response = await this.request(scoutsLink.method || 'POST', new URL(scoutsLink.href).pathname, {
      agent_name: options.name || this.config.SCOUT_NAME,
      agent_version: '0.1.0',
      platform: options.platform || 'node',
      capabilities: ['natural_language', 'transaction_commit'],
      callback_url: options.callbackUrl,
      contact_email: options.email,
    });

    this.scoutId = response.scout_id;
    this.apiKey = response.api_key;
    this.links = { ...this.links, ...response._links };

    console.log(`✓ Scout registered: ${this.scoutId}`);
    return response;
  }

  // ==========================================================================
  // SHOPPING SESSIONS
  // ==========================================================================

  /**
   * Create a new shopping session with natural language query.
   *
   * @param {string} query - Natural language description of what you're looking for
   * @param {object} options - Additional options
   * @param {object} options.hints - Structured hints (category, price range, features)
   * @param {object} options.context - Context (location, use case, etc.)
   * @param {object} options.preferences - Session preferences (max offers, timeout)
   */
  async createSession(query, options = {}) {
    if (!this.discoveredEndpoints) {
      await this.discover();
    }

    const sessionsLink = this.getLink('sessions');

    const response = await this.request(sessionsLink.method || 'POST', new URL(sessionsLink.href).pathname, {
      natural_language_query: query,
      structured_hints: options.hints || {},
      context: options.context || {},
      preferences: options.preferences || {
        max_offers: 10,
        offer_timeout_seconds: 30,
        include_reputation_data: true,
      },
    });

    console.log(`✓ Session created: ${response.session_id}`);
    console.log(`  Status: ${response.status}`);
    console.log(`  Offers expected by: ${response.estimated_offers_at}`);

    return new ScoutSession(this, response);
  }

  // ==========================================================================
  // HTTP CLIENT
  // ==========================================================================

  async request(method, path, body = null) {
    const url = `${this.config.AURA_CORE_URL}${path}`;
    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const options = {
      method,
      headers,
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.error?.message || `Request failed: ${response.status}`);
      error.code = data.error?.code;
      error.status = response.status;
      error._links = data._links;
      throw error;
    }

    return data;
  }
}

// ============================================================================
// SCOUT SESSION CLASS
// ============================================================================

/**
 * Represents an active shopping session.
 * Handles polling, WebSocket updates, and transaction commitment.
 */
class ScoutSession {
  constructor(scout, sessionData) {
    this.scout = scout;
    this.sessionId = sessionData.session_id;
    this.status = sessionData.status;
    this.links = sessionData._links || {};
    this.offers = [];
    this.ws = null;

    // Event handlers
    this.onStatusChange = null;
    this.onOfferReceived = null;
    this.onOffersReady = null;
  }

  /**
   * Connect to WebSocket for real-time updates.
   */
  async connectWebSocket() {
    const wsLink = this.links.websocket;
    if (!wsLink) {
      console.warn('WebSocket link not available');
      return;
    }

    return new Promise((resolve, reject) => {
      const wsUrl = `${wsLink.href}?token=${this.scout.apiKey}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log('✓ WebSocket connected');
        resolve();
      });

      this.ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        this.handleWebSocketMessage(message);
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('WebSocket disconnected');
      });
    });
  }

  handleWebSocketMessage(message) {
    console.log(`← WS: ${message.event}`);

    switch (message.event) {
      case 'status_changed':
        this.status = message.status;
        if (this.onStatusChange) this.onStatusChange(message);
        break;

      case 'offer_received':
        if (this.onOfferReceived) this.onOfferReceived(message);
        break;

      case 'offers_ready':
        this.status = 'offers_ready';
        if (this.onOffersReady) this.onOffersReady(message);
        break;
    }
  }

  /**
   * Get current session status.
   */
  async getStatus() {
    const selfLink = this.links.self;
    const response = await this.scout.request('GET', new URL(selfLink.href).pathname);

    this.status = response.status;
    this.links = { ...this.links, ...response._links };

    return response;
  }

  /**
   * Wait for offers to be ready (polling fallback).
   *
   * @param {number} maxWaitMs - Maximum time to wait
   * @param {number} pollIntervalMs - Polling interval
   */
  async waitForOffers(maxWaitMs = 60000, pollIntervalMs = 2000) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const status = await this.getStatus();

      if (status.status === 'offers_ready' || status.status === 'committed') {
        return status;
      }

      if (status.status === 'failed' || status.status === 'cancelled') {
        throw new Error(`Session ${status.status}: ${status.error?.message || 'Unknown error'}`);
      }

      console.log(`  Status: ${status.status}... waiting`);
      await this.delay(pollIntervalMs);
    }

    throw new Error('Timeout waiting for offers');
  }

  /**
   * Get ranked offers for this session.
   * Uses HATEOAS link from session response.
   */
  async getOffers() {
    const offersLink = this.links.offers;
    if (!offersLink) {
      throw new Error('Offers link not available. Session may not be ready.');
    }

    const response = await this.scout.request('GET', new URL(offersLink.href).pathname);

    this.offers = response.offers || [];
    this.links = { ...this.links, ...response._links };

    return response;
  }

  /**
   * Get full details for a specific offer.
   * Follows HATEOAS link from offer.
   */
  async getOfferDetails(offer) {
    const selfLink = offer._links?.self;
    if (!selfLink) {
      throw new Error('Offer self link not available');
    }

    return await this.scout.request('GET', new URL(selfLink.href).pathname);
  }

  /**
   * Commit to an offer (initiate purchase).
   *
   * @param {object} offer - The offer to accept
   * @param {object} buyerInfo - Buyer identity and shipping information
   */
  async commit(offer, buyerInfo) {
    // Use the commit link from the offer or session
    const commitLink = offer._links?.commit || this.links.commit;
    if (!commitLink) {
      throw new Error('Commit link not available');
    }

    const response = await this.scout.request(commitLink.method || 'POST', new URL(commitLink.href).pathname, {
      offer_id: offer.offer_id,
      quantity: buyerInfo.quantity || 1,
      buyer_identity: {
        name: buyerInfo.name,
        email: buyerInfo.email,
        phone: buyerInfo.phone,
      },
      shipping_address: buyerInfo.shippingAddress,
      payment_method: buyerInfo.paymentMethod || {
        type: 'x402',
        x402_payment: {
          facilitator: 'stripe',
          payment_token: 'pm_test_' + uuidv4(),
          currency: 'USD',
        },
      },
      consent: {
        share_identity_with_merchant: true,
        share_email_for_order_updates: true,
        share_phone_for_delivery: buyerInfo.phone ? true : false,
        marketing_opt_in: false,
        consent_timestamp: new Date().toISOString(),
        consent_method: 'explicit_user_action',
      },
    });

    console.log(`✓ Transaction committed: ${response.transaction_id}`);
    console.log(`  Order: ${response.order?.merchant_order_id}`);
    console.log(`  Total: $${response.amounts?.total_usd}`);

    return new Transaction(this.scout, response);
  }

  /**
   * Close WebSocket connection.
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// TRANSACTION CLASS
// ============================================================================

class Transaction {
  constructor(scout, data) {
    this.scout = scout;
    this.transactionId = data.transaction_id;
    this.status = data.status;
    this.data = data;
    this.links = data._links || {};
  }

  /**
   * Get current transaction status.
   */
  async getStatus() {
    const selfLink = this.links.self;
    const response = await this.scout.request('GET', new URL(selfLink.href).pathname);

    this.status = response.status;
    this.data = response;
    this.links = { ...this.links, ...response._links };

    return response;
  }

  /**
   * Cancel the transaction.
   */
  async cancel(reason = 'user_requested') {
    const cancelLink = this.links.cancel;
    if (!cancelLink) {
      throw new Error('Cancel link not available');
    }

    const response = await this.scout.request('DELETE', new URL(cancelLink.href).pathname, {
      reason,
    });

    this.status = response.status;
    this.data = response;

    return response;
  }
}

// ============================================================================
// EXAMPLE USAGE
// ============================================================================

async function runExample() {
  console.log('\n=== Simple Scout Demo ===\n');

  const scout = new SimpleScout();

  try {
    // 1. Discover API
    await scout.discover();

    // 2. Register Scout
    await scout.register({
      name: 'DemoShoppingAssistant',
      email: 'demo@example.com',
    });

    // 3. Create shopping session
    const session = await scout.createSession(
      'I need wireless headphones for my daily commute. Noise cancellation is important. Budget around $300-400.',
      {
        hints: {
          category_hint: 'electronics',
          price_range_usd: { min: 250, max: 400 },
          required_features: ['noise_cancellation', 'wireless'],
        },
        context: {
          use_case: 'daily_commute',
          location: { country: 'US', region: 'CA' },
        },
      }
    );

    // 4. Connect WebSocket (optional - for real-time updates)
    try {
      await session.connectWebSocket();
    } catch (e) {
      console.log('WebSocket not available, using polling');
    }

    // 5. Wait for offers
    console.log('\nWaiting for offers...');
    await session.waitForOffers(30000, 1000);

    // 6. Get ranked offers
    const offersResponse = await session.getOffers();
    console.log(`\n✓ Received ${offersResponse.total_offers} offers:\n`);

    offersResponse.offers.forEach((offer, i) => {
      console.log(`  ${i + 1}. ${offer.product?.name || 'Product'}`);
      console.log(`     Price: $${offer.pricing?.offer_price || 'N/A'}`);
      console.log(`     CWR Score: ${offer.cwr_score || 'N/A'}`);
      console.log(`     Links: ${Object.keys(offer._links || {}).join(', ')}`);
      console.log('');
    });

    // 7. (Optional) Commit to first offer
    if (offersResponse.offers.length > 0) {
      console.log('To commit to an offer, call session.commit(offer, buyerInfo)');
      console.log('Example:');
      console.log(`
  const transaction = await session.commit(offersResponse.offers[0], {
    name: 'Jane Doe',
    email: 'jane@example.com',
    shippingAddress: {
      line1: '123 Main St',
      city: 'San Francisco',
      state: 'CA',
      postal_code: '94102',
      country: 'US',
    },
  });
      `);
    }

    // Cleanup
    session.disconnect();

  } catch (error) {
    console.error('Error:', error.message);
    if (error._links) {
      console.log('Available actions:', Object.keys(error._links).join(', '));
    }
  }
}

// Run if called directly
if (require.main === module) {
  runExample().catch(console.error);
}

module.exports = { SimpleScout, ScoutSession, Transaction };
