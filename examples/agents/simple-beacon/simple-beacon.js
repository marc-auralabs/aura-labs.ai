/**
 * Simple Beacon - Reference Implementation (v2)
 *
 * Updated to align with AURA Protocol Specification v1.0
 * Uses HATEOAS for API discovery and follows spec message formats.
 *
 * A Beacon is a seller-side agent that:
 * 1. Registers with AURA Core via REST API
 * 2. Receives offer requests via WebSocket
 * 3. Generates and submits offers using HATEOAS links
 * 4. Handles transaction notifications
 *
 * @module SimpleBeacon
 * @version 2.0.0
 */

const express = require('express');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Beacon server configuration
  PORT: process.env.PORT || 3000,

  // AURA Core connection
  AURA_CORE_URL: process.env.AURA_CORE_URL || 'http://localhost:8080',
  AURA_WS_URL: process.env.AURA_WS_URL || 'ws://localhost:8080',

  // Merchant information
  MERCHANT_NAME: process.env.MERCHANT_NAME || 'Demo Electronics Store',
  MERCHANT_DOMAIN: process.env.MERCHANT_DOMAIN || 'demo-electronics.example.com',
  MERCHANT_CATEGORIES: ['electronics', 'audio', 'wearables'],

  // Pricing settings
  MIN_DISCOUNT_PERCENT: 5,
  MAX_DISCOUNT_PERCENT: 25,
  OFFER_VALIDITY_HOURS: 12,
};

// ============================================================================
// SIMPLE BEACON CLASS
// ============================================================================

class SimpleBeacon {
  constructor(config = CONFIG) {
    this.config = config;
    this.app = express();
    this.server = null;
    this.ws = null;

    // AURA credentials (populated after registration)
    this.beaconId = null;
    this.apiKey = null;
    this.links = {}; // HATEOAS links

    // In-memory stores
    this.inventory = new Map();
    this.pendingRequests = new Map();
    this.transactions = new Map();

    this.setupExpress();
    this.loadSampleInventory();
  }

  // ==========================================================================
  // EXPRESS SERVER (Internal Management API)
  // ==========================================================================

  setupExpress() {
    this.app.use(express.json());

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        beacon_id: this.beaconId,
        connected: this.ws?.readyState === WebSocket.OPEN,
        inventory_count: this.inventory.size,
        pending_requests: this.pendingRequests.size,
      });
    });

    // Inventory management
    this.app.get('/inventory', (req, res) => {
      res.json({
        items: Array.from(this.inventory.values()),
        _links: {
          add: { href: '/inventory', method: 'POST' },
        },
      });
    });

    this.app.post('/inventory', (req, res) => {
      const item = this.addInventoryItem(req.body);
      res.status(201).json(item);
    });

    // Webhook endpoint for AURA Core (if using webhooks instead of WebSocket)
    this.app.post('/aura/webhook', (req, res) => {
      this.handleWebhook(req.body);
      res.status(200).json({ received: true });
    });
  }

  // ==========================================================================
  // INVENTORY MANAGEMENT
  // ==========================================================================

  loadSampleInventory() {
    const products = [
      {
        name: 'Sony WH-1000XM5 Wireless Headphones',
        category: 'electronics.headphones.over_ear',
        basePrice: 399.99,
        stock: 50,
        description: 'Industry-leading noise cancellation with exceptional sound quality. 30-hour battery, premium comfort.',
        features: ['noise_cancellation', 'wireless', 'foldable', 'multipoint', 'speak_to_chat'],
        brand: 'Sony',
        model: 'WH-1000XM5',
      },
      {
        name: 'Bose QuietComfort Ultra Headphones',
        category: 'electronics.headphones.over_ear',
        basePrice: 429.99,
        stock: 35,
        description: 'Immersive audio with world-class noise cancellation. Spatial audio for a theater-like experience.',
        features: ['noise_cancellation', 'wireless', 'spatial_audio', 'comfortable'],
        brand: 'Bose',
        model: 'QuietComfort Ultra',
      },
      {
        name: 'Apple AirPods Max',
        category: 'electronics.headphones.over_ear',
        basePrice: 549.99,
        stock: 20,
        description: 'High-fidelity audio with custom Apple-designed drivers. Seamless Apple ecosystem integration.',
        features: ['noise_cancellation', 'wireless', 'spatial_audio', 'transparency_mode'],
        brand: 'Apple',
        model: 'AirPods Max',
      },
    ];

    products.forEach(product => this.addInventoryItem(product));
    console.log(`✓ Loaded ${this.inventory.size} products into inventory`);
  }

  addInventoryItem(product) {
    const item = {
      product_id: `prod_${uuidv4().substring(0, 8)}`,
      ...product,
      currentPrice: product.currentPrice || product.basePrice,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.inventory.set(item.product_id, item);
    return item;
  }

  // ==========================================================================
  // AURA CORE REGISTRATION (HATEOAS)
  // ==========================================================================

  /**
   * Discover AURA Core API endpoints via HATEOAS.
   */
  async discover() {
    console.log(`Discovering AURA Core API at ${this.config.AURA_CORE_URL}...`);

    const response = await this.request('GET', '/v1');
    this.links = response._links || {};

    console.log('✓ API discovered. Available actions:', Object.keys(this.links).join(', '));
    return this.links;
  }

  /**
   * Register this Beacon with AURA Core.
   */
  async register() {
    if (!this.links.beacons) {
      await this.discover();
    }

    const beaconsLink = this.links.beacons;
    const response = await this.request(
      beaconsLink.method || 'POST',
      new URL(beaconsLink.href).pathname,
      {
        agent_name: `${this.config.MERCHANT_NAME} Beacon`,
        agent_version: '2.0.0',
        merchant_name: this.config.MERCHANT_NAME,
        merchant_domain: this.config.MERCHANT_DOMAIN,
        categories: this.config.MERCHANT_CATEGORIES,
        capabilities: ['offers', 'inventory_check', 'dynamic_pricing'],
        webhook_url: `http://localhost:${this.config.PORT}/aura/webhook`,
        contact_email: 'integrations@demo-store.example.com',
      }
    );

    this.beaconId = response.beacon_id;
    this.apiKey = response.api_key;
    this.links = { ...this.links, ...response._links };

    console.log(`✓ Beacon registered: ${this.beaconId}`);
    return response;
  }

  // ==========================================================================
  // WEBSOCKET CONNECTION
  // ==========================================================================

  /**
   * Connect to AURA Core via WebSocket for real-time offer requests.
   */
  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      const wsUrl = `${this.config.AURA_WS_URL}/ws/beacons/${this.beaconId}?token=${this.apiKey}`;
      console.log(`Connecting WebSocket to AURA Core...`);

      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log('✓ WebSocket connected to AURA Core');
        resolve();
      });

      this.ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        this.handleAURAMessage(message);
      });

      this.ws.on('close', () => {
        console.log('WebSocket disconnected. Reconnecting in 5s...');
        setTimeout(() => this.connectWebSocket(), 5000);
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error.message);
        reject(error);
      });
    });
  }

  // ==========================================================================
  // MESSAGE HANDLING
  // ==========================================================================

  handleAURAMessage(message) {
    console.log(`← AURA: ${message.event_type || message.event}`);

    switch (message.event_type || message.event) {
      case 'connected':
        console.log('  Ready to receive offer requests');
        break;

      case 'offer_request':
        this.handleOfferRequest(message);
        break;

      case 'offer_accepted':
        this.handleOfferAccepted(message);
        break;

      case 'transaction_confirmed':
        this.handleTransactionConfirmed(message);
        break;

      case 'transaction_cancelled':
        this.handleTransactionCancelled(message);
        break;

      default:
        console.log(`  Unknown message type: ${message.event_type || message.event}`);
    }
  }

  handleWebhook(payload) {
    // Alternative to WebSocket - handle webhook notifications
    this.handleAURAMessage(payload);
  }

  // ==========================================================================
  // OFFER GENERATION (Core Business Logic)
  // ==========================================================================

  /**
   * Handle incoming offer request from AURA Core.
   * This is where the Beacon's business logic lives.
   */
  async handleOfferRequest(request) {
    const { request_id, session_id, interpreted_request, respond_by } = request;
    const responseUrl = request.response_url || request._links?.submit_offers?.href;

    console.log(`\n📥 Offer Request: ${request_id}`);
    console.log(`  Session: ${session_id}`);
    console.log(`  Deadline: ${respond_by}`);

    // Store the request
    this.pendingRequests.set(request_id, request);

    // Find matching inventory
    const matches = this.findMatchingProducts(interpreted_request);
    console.log(`  Found ${matches.length} matching products`);

    if (matches.length === 0) {
      console.log('  No matching inventory - skipping response');
      return;
    }

    // Generate offers for matching products
    const offers = matches.map(product =>
      this.generateOffer(product, interpreted_request)
    );

    // Submit offers via REST API (using HATEOAS link from request)
    try {
      await this.submitOffers(session_id, offers, responseUrl);
      console.log(`✓ Submitted ${offers.length} offers for session ${session_id}`);
    } catch (error) {
      console.error(`✗ Failed to submit offers: ${error.message}`);
    }
  }

  /**
   * Find products matching the interpreted request.
   */
  findMatchingProducts(interpreted) {
    const matches = [];
    const requirements = interpreted?.structured_requirements || {};
    const category = requirements.category;
    const maxPrice = requirements.hard_constraints?.price_max_usd;
    const features = requirements.soft_preferences?.features?.required || [];

    for (const product of this.inventory.values()) {
      // Skip out of stock
      if (product.stock <= 0) continue;

      // Category match (flexible - check if product category contains request category)
      if (category && !product.category.includes(category.split('.')[0])) {
        continue;
      }

      // Price constraint
      if (maxPrice && product.basePrice > maxPrice * 1.1) {
        // Allow 10% over for negotiation room
        continue;
      }

      // Feature matching (soft - boost score if features match)
      const featureMatch = features.filter(f =>
        product.features?.includes(f)
      ).length;

      matches.push({
        ...product,
        featureMatchScore: featureMatch / Math.max(features.length, 1),
      });
    }

    // Sort by feature match
    return matches.sort((a, b) => b.featureMatchScore - a.featureMatchScore);
  }

  /**
   * Generate an offer for a product based on the request context.
   */
  generateOffer(product, interpreted) {
    const offerId = `ofr_${uuidv4().replace(/-/g, '').substring(0, 26).toUpperCase()}`;

    // Calculate dynamic pricing
    const pricing = this.calculateDynamicPricing(product, interpreted);

    const validUntil = new Date(
      Date.now() + this.config.OFFER_VALIDITY_HOURS * 60 * 60 * 1000
    ).toISOString();

    return {
      offer_id: offerId,
      product: {
        product_id: product.product_id,
        name: product.name,
        category: product.category,
        structured_attributes: {
          brand: product.brand,
          model: product.model,
          features: product.features,
        },
        natural_language_description: {
          content: product.description,
          language: 'en',
        },
        images: [
          { url: `https://cdn.example.com/products/${product.product_id}.jpg`, type: 'primary' },
        ],
      },
      pricing: {
        currency: 'USD',
        list_price: product.basePrice,
        offer_price: pricing.offerPrice,
        discount_percentage: pricing.discountPercent,
        price_valid_until: validUntil,
        price_rationale: pricing.rationale,
      },
      availability: {
        in_stock: product.stock > 0,
        quantity_available: product.stock,
        estimated_ship_date: this.getNextBusinessDay(),
        delivery_estimate_days: { min: 2, max: 5 },
        shipping_options: [
          { method: 'standard', days: '3-5', price_usd: 0 },
          { method: 'express', days: '1-2', price_usd: 14.99 },
        ],
      },
      terms: {
        return_policy: '30-day free returns, no questions asked',
        warranty: '1-year manufacturer warranty',
        price_match: true,
      },
      merchant: {
        name: this.config.MERCHANT_NAME,
        domain: this.config.MERCHANT_DOMAIN,
      },
      valid_until: validUntil,
      signature: this.signOffer(offerId, product.product_id, pricing.offerPrice),
    };
  }

  /**
   * Calculate dynamic pricing based on request context and inventory.
   */
  calculateDynamicPricing(product, interpreted) {
    let discountPercent = this.config.MIN_DISCOUNT_PERCENT;
    let rationale = 'Standard pricing';

    // Inventory-based discount (move excess stock)
    if (product.stock > 40) {
      discountPercent = Math.max(discountPercent, 15);
      rationale = 'Inventory clearance offer';
    }

    // Budget-aware pricing
    const priceRange = interpreted?.structured_requirements?.soft_preferences?.price_range_usd;
    if (priceRange && product.basePrice > priceRange.max) {
      // Product is over budget - offer bigger discount to fit
      const neededDiscount = ((product.basePrice - priceRange.max) / product.basePrice) * 100;
      if (neededDiscount <= this.config.MAX_DISCOUNT_PERCENT) {
        discountPercent = Math.max(discountPercent, neededDiscount + 2);
        rationale = 'Special price to fit your budget';
      }
    }

    // Cap discount
    discountPercent = Math.min(discountPercent, this.config.MAX_DISCOUNT_PERCENT);

    const offerPrice = Math.round(product.basePrice * (1 - discountPercent / 100) * 100) / 100;

    return {
      offerPrice,
      discountPercent: Math.round(discountPercent * 10) / 10,
      rationale,
    };
  }

  /**
   * Submit offers to AURA Core via REST API.
   */
  async submitOffers(sessionId, offers, responseUrl) {
    const url = responseUrl || `${this.config.AURA_CORE_URL}/v1/sessions/${sessionId}/offers`;
    const path = new URL(url).pathname;

    return await this.request('POST', path, {
      beacon_id: this.beaconId,
      offers: offers,
      beacon_metadata: {
        merchant_name: this.config.MERCHANT_NAME,
        merchant_url: `https://${this.config.MERCHANT_DOMAIN}`,
        support_email: `support@${this.config.MERCHANT_DOMAIN}`,
        certifications: ['ssl_verified'],
      },
    });
  }

  // ==========================================================================
  // TRANSACTION HANDLING
  // ==========================================================================

  handleOfferAccepted(message) {
    const { offer_id, transaction_id, buyer_identity } = message.payload || message;

    console.log(`\n🎉 Offer Accepted!`);
    console.log(`  Offer: ${offer_id}`);
    console.log(`  Transaction: ${transaction_id}`);
    console.log(`  Buyer: ${buyer_identity?.name || 'Unknown'}`);

    // Store transaction
    this.transactions.set(transaction_id, {
      transaction_id,
      offer_id,
      buyer_identity,
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    });
  }

  handleTransactionConfirmed(message) {
    const { transaction_id } = message.payload || message;

    const transaction = this.transactions.get(transaction_id);
    if (transaction) {
      transaction.status = 'confirmed';
      transaction.confirmed_at = new Date().toISOString();
    }

    console.log(`\n✅ Transaction Confirmed: ${transaction_id}`);
    console.log('  Ready for fulfillment');
  }

  handleTransactionCancelled(message) {
    const { transaction_id, reason } = message.payload || message;

    const transaction = this.transactions.get(transaction_id);
    if (transaction) {
      transaction.status = 'cancelled';
      transaction.cancelled_at = new Date().toISOString();
      transaction.cancellation_reason = reason;
    }

    console.log(`\n❌ Transaction Cancelled: ${transaction_id}`);
    console.log(`  Reason: ${reason || 'Not specified'}`);
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  async request(method, path, body = null) {
    const url = `${this.config.AURA_CORE_URL}${path}`;
    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const options = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || `Request failed: ${response.status}`);
    }

    return data;
  }

  signOffer(offerId, productId, price) {
    // Simplified signature (in production, use Ed25519)
    const payload = `${offerId}|${this.beaconId}|${productId}|${price}`;
    return `sig_${Buffer.from(payload).toString('base64').substring(0, 20)}`;
  }

  getNextBusinessDay() {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    // Skip weekends
    while (date.getDay() === 0 || date.getDay() === 6) {
      date.setDate(date.getDate() + 1);
    }
    return date.toISOString().split('T')[0];
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  async start() {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║              Simple Beacon v2.0 (AURA Protocol)            ║
╠════════════════════════════════════════════════════════════╣
║  Merchant: ${this.config.MERCHANT_NAME.padEnd(41)}║
║  Categories: ${this.config.MERCHANT_CATEGORIES.join(', ').padEnd(39)}║
╚════════════════════════════════════════════════════════════╝
    `);

    try {
      // Start Express server
      this.server = this.app.listen(this.config.PORT, () => {
        console.log(`✓ Management API running on http://localhost:${this.config.PORT}`);
      });

      // Register with AURA Core
      await this.register();

      // Connect WebSocket
      await this.connectWebSocket();

      console.log(`\n✓ Beacon is ready to receive offer requests\n`);

    } catch (error) {
      console.error('Failed to start Beacon:', error.message);
      console.log('\nMake sure AURA Core is running at:', this.config.AURA_CORE_URL);
      process.exit(1);
    }
  }

  async stop() {
    console.log('\nShutting down Beacon...');

    if (this.ws) {
      this.ws.close();
    }

    if (this.server) {
      this.server.close();
    }

    console.log('✓ Beacon stopped');
  }
}

// ============================================================================
// MAIN
// ============================================================================

const beacon = new SimpleBeacon(CONFIG);

process.on('SIGINT', async () => {
  await beacon.stop();
  process.exit(0);
});

beacon.start();

module.exports = SimpleBeacon;
