/**
 * Mock AURA Core Server
 *
 * A minimal implementation of AURA Core for testing and demonstration.
 * This implements the basic protocol flow with HATEOAS-compliant responses.
 *
 * NOTE: This is NOT production-ready. It lacks:
 * - LLM-based interpretation (queries pass through with basic parsing)
 * - Real CWR scoring (uses simplified matching)
 * - Persistent storage (in-memory only)
 * - Authentication/signatures (accepts all API keys)
 * - Horizontal scaling
 *
 * @module MockAURACore
 * @version 0.1.0
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  PORT: process.env.PORT || 8080,
  BASE_URL: process.env.BASE_URL || 'http://localhost:8080',
  WS_URL: process.env.WS_URL || 'ws://localhost:8080',
  OFFER_TIMEOUT_MS: 30000, // 30 seconds for Beacons to respond
  SESSION_EXPIRY_MS: 3600000, // 1 hour
};

// ============================================================================
// HATEOAS LINK BUILDER
// ============================================================================

/**
 * Build HATEOAS links for API responses.
 * This enables clients to discover available actions dynamically.
 */
class LinkBuilder {
  static base(path) {
    return `${CONFIG.BASE_URL}${path}`;
  }

  static wsBase(path) {
    return `${CONFIG.WS_URL}${path}`;
  }

  static root() {
    return {
      self: { href: this.base('/v1'), method: 'GET' },
      scouts: { href: this.base('/v1/agents/scouts'), method: 'POST', title: 'Register a Scout' },
      beacons: { href: this.base('/v1/agents/beacons'), method: 'POST', title: 'Register a Beacon' },
      sessions: { href: this.base('/v1/sessions'), method: 'POST', title: 'Create a session' },
      docs: { href: this.base('/v1/docs'), method: 'GET', title: 'API documentation' },
    };
  }

  static scout(scoutId) {
    return {
      self: { href: this.base(`/v1/agents/scouts/${scoutId}`), method: 'GET' },
      sessions: { href: this.base('/v1/sessions'), method: 'POST', title: 'Create shopping session' },
      policies: { href: this.base(`/v1/agents/scouts/${scoutId}/policies`), method: 'PUT', title: 'Update policies' },
      payment_capabilities: { href: this.base(`/v1/agents/scouts/${scoutId}/payment-capabilities`), method: 'PUT' },
    };
  }

  static beacon(beaconId) {
    return {
      self: { href: this.base(`/v1/agents/beacons/${beaconId}`), method: 'GET' },
      requests: { href: this.base(`/v1/beacons/${beaconId}/requests`), method: 'GET', title: 'Pending requests' },
      transactions: { href: this.base(`/v1/beacons/${beaconId}/transactions`), method: 'GET' },
      policies: { href: this.base(`/v1/agents/beacons/${beaconId}/policies`), method: 'PUT' },
    };
  }

  static session(sessionId) {
    return {
      self: { href: this.base(`/v1/sessions/${sessionId}`), method: 'GET' },
      offers: { href: this.base(`/v1/sessions/${sessionId}/offers`), method: 'GET', title: 'View ranked offers' },
      commit: { href: this.base(`/v1/sessions/${sessionId}/commit`), method: 'POST', title: 'Commit to an offer' },
      websocket: { href: this.wsBase(`/ws/sessions/${sessionId}`), protocol: 'websocket' },
    };
  }

  static offer(offerId, sessionId) {
    return {
      self: { href: this.base(`/v1/offers/${offerId}`), method: 'GET' },
      session: { href: this.base(`/v1/sessions/${sessionId}`), method: 'GET' },
      commit: { href: this.base(`/v1/sessions/${sessionId}/commit`), method: 'POST', title: 'Accept this offer' },
    };
  }

  static transaction(transactionId) {
    return {
      self: { href: this.base(`/v1/transactions/${transactionId}`), method: 'GET' },
      cancel: { href: this.base(`/v1/transactions/${transactionId}`), method: 'DELETE', title: 'Cancel transaction' },
    };
  }
}

// ============================================================================
// IN-MEMORY STORES
// ============================================================================

const stores = {
  scouts: new Map(),
  beacons: new Map(),
  sessions: new Map(),
  offers: new Map(),
  transactions: new Map(),
};

// Active WebSocket connections
const wsConnections = {
  sessions: new Map(), // sessionId -> Set<WebSocket>
  beacons: new Map(),  // beaconId -> WebSocket
};

// ============================================================================
// MOCK AURA CORE CLASS
// ============================================================================

class MockAURACore {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  // ==========================================================================
  // MIDDLEWARE
  // ==========================================================================

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());

    // Simple API key validation (accepts anything for demo)
    this.app.use('/v1', (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader && req.path !== '/' && req.path !== '/docs') {
        return res.status(401).json({
          error: {
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Missing Authorization header',
            _links: LinkBuilder.root(),
          }
        });
      }
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  // ==========================================================================
  // REST API ROUTES
  // ==========================================================================

  setupRoutes() {
    const router = express.Router();

    // API Root - Entry point with HATEOAS links
    router.get('/', (req, res) => {
      res.json({
        name: 'AURA Core API',
        version: '1.0.0',
        status: 'operational',
        environment: 'sandbox',
        _links: LinkBuilder.root(),
      });
    });

    // Documentation endpoint
    router.get('/docs', (req, res) => {
      res.json({
        title: 'AURA Protocol API',
        version: '1.0.0',
        description: 'API for agentic commerce - Scout and Beacon interactions',
        endpoints: {
          scouts: {
            register: { method: 'POST', path: '/v1/agents/scouts' },
            get: { method: 'GET', path: '/v1/agents/scouts/{scout_id}' },
          },
          beacons: {
            register: { method: 'POST', path: '/v1/agents/beacons' },
            get: { method: 'GET', path: '/v1/agents/beacons/{beacon_id}' },
          },
          sessions: {
            create: { method: 'POST', path: '/v1/sessions' },
            get: { method: 'GET', path: '/v1/sessions/{session_id}' },
            offers: { method: 'GET', path: '/v1/sessions/{session_id}/offers' },
            commit: { method: 'POST', path: '/v1/sessions/{session_id}/commit' },
          },
          transactions: {
            get: { method: 'GET', path: '/v1/transactions/{transaction_id}' },
            cancel: { method: 'DELETE', path: '/v1/transactions/{transaction_id}' },
          },
        },
        _links: LinkBuilder.root(),
      });
    });

    // ----- SCOUT ENDPOINTS -----

    router.post('/agents/scouts', (req, res) => {
      const scoutId = `sct_${uuidv4().replace(/-/g, '').substring(0, 26).toUpperCase()}`;
      const apiKey = `sk_test_${uuidv4().replace(/-/g, '')}`;

      const scout = {
        scout_id: scoutId,
        api_key: apiKey,
        agent_name: req.body.agent_name || 'Unnamed Scout',
        registered_at: new Date().toISOString(),
        rate_limits: {
          requests_per_minute: 60,
          sessions_per_hour: 100,
        },
      };

      stores.scouts.set(scoutId, scout);

      res.status(201).json({
        ...scout,
        _links: LinkBuilder.scout(scoutId),
      });
    });

    router.get('/agents/scouts/:scoutId', (req, res) => {
      const scout = stores.scouts.get(req.params.scoutId);
      if (!scout) {
        return res.status(404).json({
          error: { code: 'SCOUT_NOT_FOUND', message: 'Scout not found' },
          _links: LinkBuilder.root(),
        });
      }
      res.json({ ...scout, _links: LinkBuilder.scout(scout.scout_id) });
    });

    // ----- BEACON ENDPOINTS -----

    router.post('/agents/beacons', (req, res) => {
      const beaconId = `bcn_${uuidv4().replace(/-/g, '').substring(0, 26).toUpperCase()}`;
      const apiKey = `bk_test_${uuidv4().replace(/-/g, '')}`;

      const beacon = {
        beacon_id: beaconId,
        api_key: apiKey,
        agent_name: req.body.agent_name || 'Unnamed Beacon',
        merchant_name: req.body.merchant_name || 'Unknown Merchant',
        categories: req.body.categories || [],
        webhook_url: req.body.webhook_url,
        registered_at: new Date().toISOString(),
        verification_status: 'verified', // Auto-verify in sandbox
        rate_limits: {
          offer_responses_per_minute: 1000,
        },
      };

      stores.beacons.set(beaconId, beacon);

      res.status(201).json({
        ...beacon,
        _links: LinkBuilder.beacon(beaconId),
      });
    });

    router.get('/agents/beacons/:beaconId', (req, res) => {
      const beacon = stores.beacons.get(req.params.beaconId);
      if (!beacon) {
        return res.status(404).json({
          error: { code: 'BEACON_NOT_FOUND', message: 'Beacon not found' },
          _links: LinkBuilder.root(),
        });
      }
      res.json({ ...beacon, _links: LinkBuilder.beacon(beacon.beacon_id) });
    });

    // ----- SESSION ENDPOINTS -----

    router.post('/sessions', async (req, res) => {
      const sessionId = `ses_${uuidv4().replace(/-/g, '').substring(0, 26).toUpperCase()}`;

      const session = {
        session_id: sessionId,
        status: 'interpreting',
        created_at: new Date().toISOString(),
        natural_language_query: req.body.natural_language_query,
        structured_hints: req.body.structured_hints || {},
        context: req.body.context || {},
        offers: [],
      };

      stores.sessions.set(sessionId, session);

      // Start async processing
      this.processSession(sessionId);

      res.status(201).json({
        session_id: sessionId,
        status: session.status,
        created_at: session.created_at,
        estimated_offers_at: new Date(Date.now() + 30000).toISOString(),
        _links: LinkBuilder.session(sessionId),
      });
    });

    router.get('/sessions/:sessionId', (req, res) => {
      const session = stores.sessions.get(req.params.sessionId);
      if (!session) {
        return res.status(404).json({
          error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
          _links: LinkBuilder.root(),
        });
      }

      const response = {
        session_id: session.session_id,
        status: session.status,
        created_at: session.created_at,
        updated_at: session.updated_at || session.created_at,
        offers_count: session.offers.length,
        _links: LinkBuilder.session(session.session_id),
      };

      if (session.interpreted_request) {
        response.interpreted_request = session.interpreted_request;
      }

      res.json(response);
    });

    router.get('/sessions/:sessionId/offers', (req, res) => {
      const session = stores.sessions.get(req.params.sessionId);
      if (!session) {
        return res.status(404).json({
          error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
          _links: LinkBuilder.root(),
        });
      }

      const rankedOffers = session.offers.map((offer, index) => ({
        rank: index + 1,
        ...offer,
        _links: LinkBuilder.offer(offer.offer_id, session.session_id),
      }));

      res.json({
        session_id: session.session_id,
        status: session.status,
        total_offers: rankedOffers.length,
        offers: rankedOffers,
        _links: {
          self: { href: LinkBuilder.base(`/v1/sessions/${session.session_id}/offers`) },
          session: { href: LinkBuilder.base(`/v1/sessions/${session.session_id}`) },
          commit: { href: LinkBuilder.base(`/v1/sessions/${session.session_id}/commit`), method: 'POST' },
        },
      });
    });

    router.post('/sessions/:sessionId/commit', (req, res) => {
      const session = stores.sessions.get(req.params.sessionId);
      if (!session) {
        return res.status(404).json({
          error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
          _links: LinkBuilder.root(),
        });
      }

      const offer = session.offers.find(o => o.offer_id === req.body.offer_id);
      if (!offer) {
        return res.status(404).json({
          error: { code: 'OFFER_NOT_FOUND', message: 'Offer not found in this session' },
          _links: LinkBuilder.session(session.session_id),
        });
      }

      const transactionId = `txn_${uuidv4().replace(/-/g, '').substring(0, 26).toUpperCase()}`;

      const transaction = {
        transaction_id: transactionId,
        session_id: session.session_id,
        offer_id: offer.offer_id,
        beacon_id: offer.beacon_id,
        status: 'confirmed',
        created_at: new Date().toISOString(),
        buyer_identity: req.body.buyer_identity,
        shipping_address: req.body.shipping_address,
        amounts: {
          subtotal_usd: offer.pricing.offer_price,
          shipping_usd: 0,
          tax_usd: Math.round(offer.pricing.offer_price * 0.09 * 100) / 100,
          total_usd: Math.round(offer.pricing.offer_price * 1.09 * 100) / 100,
        },
        order: {
          merchant_order_id: `ORD-${Date.now()}`,
          merchant_name: offer.merchant?.name || 'Demo Merchant',
        },
      };

      stores.transactions.set(transactionId, transaction);
      session.status = 'committed';
      session.transaction_id = transactionId;

      // Notify Beacon via WebSocket
      this.notifyBeacon(offer.beacon_id, {
        event_type: 'offer_accepted',
        payload: {
          offer_id: offer.offer_id,
          transaction_id: transactionId,
          buyer_identity: req.body.buyer_identity,
        },
      });

      res.status(201).json({
        ...transaction,
        _links: LinkBuilder.transaction(transactionId),
      });
    });

    // ----- OFFER SUBMISSION (for Beacons) -----

    router.post('/sessions/:sessionId/offers', (req, res) => {
      const session = stores.sessions.get(req.params.sessionId);
      if (!session) {
        return res.status(404).json({
          error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
        });
      }

      const offers = req.body.offers || [req.body];
      const acceptedOffers = [];

      offers.forEach(offerData => {
        const offer = {
          offer_id: offerData.offer_id || `ofr_${uuidv4().replace(/-/g, '').substring(0, 26).toUpperCase()}`,
          beacon_id: req.body.beacon_id,
          created_at: new Date().toISOString(),
          ...offerData,
          cwr_score: this.calculateMockCWR(offerData, session),
        };

        session.offers.push(offer);
        stores.offers.set(offer.offer_id, offer);
        acceptedOffers.push(offer.offer_id);

        // Notify Scout via WebSocket
        this.notifySession(session.session_id, {
          event: 'offer_received',
          offer_id: offer.offer_id,
          preview: {
            product_name: offer.product?.name,
            price_usd: offer.pricing?.offer_price,
          },
        });
      });

      // Sort offers by CWR
      session.offers.sort((a, b) => b.cwr_score - a.cwr_score);

      res.status(201).json({
        accepted: acceptedOffers,
        total_offers: session.offers.length,
        _links: {
          session: { href: LinkBuilder.base(`/v1/sessions/${session.session_id}`) },
        },
      });
    });

    // ----- TRANSACTION ENDPOINTS -----

    router.get('/transactions/:transactionId', (req, res) => {
      const transaction = stores.transactions.get(req.params.transactionId);
      if (!transaction) {
        return res.status(404).json({
          error: { code: 'TRANSACTION_NOT_FOUND', message: 'Transaction not found' },
          _links: LinkBuilder.root(),
        });
      }
      res.json({ ...transaction, _links: LinkBuilder.transaction(transaction.transaction_id) });
    });

    router.delete('/transactions/:transactionId', (req, res) => {
      const transaction = stores.transactions.get(req.params.transactionId);
      if (!transaction) {
        return res.status(404).json({
          error: { code: 'TRANSACTION_NOT_FOUND', message: 'Transaction not found' },
        });
      }

      transaction.status = 'cancelled';
      transaction.cancelled_at = new Date().toISOString();
      transaction.cancellation_reason = req.body.reason || 'user_requested';

      res.json({
        ...transaction,
        refund: {
          status: 'processing',
          amount_usd: transaction.amounts.total_usd,
          expected_by: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
        _links: LinkBuilder.transaction(transaction.transaction_id),
      });
    });

    // ----- OFFER DETAIL -----

    router.get('/offers/:offerId', (req, res) => {
      const offer = stores.offers.get(req.params.offerId);
      if (!offer) {
        return res.status(404).json({
          error: { code: 'OFFER_NOT_FOUND', message: 'Offer not found' },
          _links: LinkBuilder.root(),
        });
      }

      // Find the session this offer belongs to
      let sessionId = null;
      for (const [sessId, sess] of stores.sessions) {
        if (sess.offers.some(o => o.offer_id === offer.offer_id)) {
          sessionId = sessId;
          break;
        }
      }

      res.json({
        ...offer,
        _links: LinkBuilder.offer(offer.offer_id, sessionId),
      });
    });

    this.app.use('/v1', router);

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        uptime: process.uptime(),
        stores: {
          scouts: stores.scouts.size,
          beacons: stores.beacons.size,
          sessions: stores.sessions.size,
          transactions: stores.transactions.size,
        },
      });
    });
  }

  // ==========================================================================
  // WEBSOCKET HANDLING
  // ==========================================================================

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const path = url.pathname;

      console.log(`WebSocket connected: ${path}`);

      // Session WebSocket (for Scouts)
      const sessionMatch = path.match(/^\/ws\/sessions\/(ses_[A-Z0-9]+)$/);
      if (sessionMatch) {
        const sessionId = sessionMatch[1];
        if (!wsConnections.sessions.has(sessionId)) {
          wsConnections.sessions.set(sessionId, new Set());
        }
        wsConnections.sessions.get(sessionId).add(ws);

        ws.on('close', () => {
          wsConnections.sessions.get(sessionId)?.delete(ws);
        });

        ws.send(JSON.stringify({
          event: 'connected',
          session_id: sessionId,
          message: 'Connected to session updates',
        }));
        return;
      }

      // Beacon WebSocket
      const beaconMatch = path.match(/^\/ws\/beacons\/(bcn_[A-Z0-9]+)$/);
      if (beaconMatch) {
        const beaconId = beaconMatch[1];
        wsConnections.beacons.set(beaconId, ws);

        ws.on('close', () => {
          wsConnections.beacons.delete(beaconId);
        });

        ws.on('message', (data) => {
          this.handleBeaconMessage(beaconId, JSON.parse(data.toString()));
        });

        ws.send(JSON.stringify({
          event: 'connected',
          beacon_id: beaconId,
          message: 'Connected to AURA Core',
        }));
        return;
      }

      ws.close(4000, 'Invalid WebSocket path');
    });
  }

  // ==========================================================================
  // SESSION PROCESSING (Mock Interpretation)
  // ==========================================================================

  async processSession(sessionId) {
    const session = stores.sessions.get(sessionId);
    if (!session) return;

    // Simulate interpretation delay
    await this.delay(500);

    // Mock interpretation (in production this would use LLM)
    const interpreted = this.mockInterpret(session.natural_language_query, session.structured_hints);
    session.interpreted_request = interpreted;
    session.status = 'discovering';
    session.updated_at = new Date().toISOString();

    this.notifySession(sessionId, {
      event: 'status_changed',
      status: 'discovering',
    });

    // Find matching Beacons
    await this.delay(200);
    const matchingBeacons = this.findMatchingBeacons(interpreted);

    session.status = 'collecting_offers';
    this.notifySession(sessionId, {
      event: 'status_changed',
      status: 'collecting_offers',
      beacons_contacted: matchingBeacons.length,
    });

    // Request offers from Beacons
    for (const beacon of matchingBeacons) {
      this.requestOfferFromBeacon(beacon, session);
    }

    // Wait for offers (or timeout)
    await this.delay(CONFIG.OFFER_TIMEOUT_MS / 10); // Shortened for demo

    session.status = 'offers_ready';
    session.updated_at = new Date().toISOString();

    this.notifySession(sessionId, {
      event: 'offers_ready',
      total_offers: session.offers.length,
    });
  }

  mockInterpret(query, hints) {
    // Very basic "interpretation" - in production this uses LLM
    const words = (query || '').toLowerCase().split(/\s+/);

    return {
      structured_requirements: {
        category: hints?.category_hint || this.guessCategory(words),
        hard_constraints: {
          price_max_usd: hints?.price_range_usd?.max || 1000,
          in_stock: true,
        },
        soft_preferences: {
          price_range_usd: hints?.price_range_usd || { min: 0, max: 500 },
          features: hints?.required_features || [],
        },
      },
      natural_language_context: {
        content: query,
        language: 'en',
        sanitized: true,
        extracted_entities: words.filter(w => w.length > 4).slice(0, 5).map(w => ({
          type: 'keyword',
          value: w,
        })),
      },
    };
  }

  guessCategory(words) {
    const categoryKeywords = {
      'electronics': ['headphones', 'phone', 'laptop', 'computer', 'camera', 'watch', 'tablet'],
      'clothing': ['shirt', 'pants', 'shoes', 'jacket', 'dress', 'hat'],
      'home': ['furniture', 'kitchen', 'bed', 'chair', 'table', 'lamp'],
      'food': ['grocery', 'food', 'drink', 'snack', 'meal'],
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (words.some(w => keywords.includes(w))) {
        return category;
      }
    }
    return 'general';
  }

  findMatchingBeacons(interpreted) {
    const matches = [];
    const category = interpreted.structured_requirements?.category;

    for (const [beaconId, beacon] of stores.beacons) {
      // Match by category or include all if no specific category
      if (!category || beacon.categories?.includes(category) || beacon.categories?.length === 0) {
        matches.push(beacon);
      }
    }

    return matches;
  }

  requestOfferFromBeacon(beacon, session) {
    const ws = wsConnections.beacons.get(beacon.beacon_id);

    const offerRequest = {
      event_type: 'offer_request',
      request_id: `req_${uuidv4().replace(/-/g, '').substring(0, 26).toUpperCase()}`,
      session_id: session.session_id,
      timestamp: new Date().toISOString(),
      respond_by: new Date(Date.now() + CONFIG.OFFER_TIMEOUT_MS).toISOString(),
      response_url: `${CONFIG.BASE_URL}/v1/sessions/${session.session_id}/offers`,
      interpreted_request: session.interpreted_request,
      _links: {
        submit_offers: {
          href: `${CONFIG.BASE_URL}/v1/sessions/${session.session_id}/offers`,
          method: 'POST',
        },
      },
    };

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(offerRequest));
    }
    // In production, would also POST to webhook_url
  }

  calculateMockCWR(offer, session) {
    // Simplified CWR calculation
    let score = 70; // Base score

    // Price match bonus
    const priceRange = session.interpreted_request?.structured_requirements?.soft_preferences?.price_range_usd;
    if (priceRange && offer.pricing?.offer_price) {
      if (offer.pricing.offer_price >= priceRange.min && offer.pricing.offer_price <= priceRange.max) {
        score += 15;
      }
    }

    // Add some randomness for demo variety
    score += Math.random() * 10;

    return Math.min(100, Math.round(score * 10) / 10);
  }

  // ==========================================================================
  // NOTIFICATIONS
  // ==========================================================================

  notifySession(sessionId, message) {
    const connections = wsConnections.sessions.get(sessionId);
    if (connections) {
      const data = JSON.stringify({
        ...message,
        session_id: sessionId,
        timestamp: new Date().toISOString(),
      });
      connections.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });
    }
  }

  notifyBeacon(beaconId, message) {
    const ws = wsConnections.beacons.get(beaconId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        ...message,
        beacon_id: beaconId,
        timestamp: new Date().toISOString(),
      }));
    }
  }

  handleBeaconMessage(beaconId, message) {
    console.log(`Beacon ${beaconId} message:`, message.type);
    // Handle Beacon-initiated messages (inventory updates, etc.)
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  start() {
    return new Promise((resolve) => {
      this.server.listen(CONFIG.PORT, () => {
        console.log(`
╔════════════════════════════════════════════════════════════╗
║                    AURA Core (Mock)                        ║
╠════════════════════════════════════════════════════════════╣
║  REST API:    ${CONFIG.BASE_URL.padEnd(40)}║
║  WebSocket:   ${CONFIG.WS_URL.padEnd(40)}║
║  Environment: sandbox                                      ║
╠════════════════════════════════════════════════════════════╣
║  Endpoints:                                                ║
║    GET  /v1              API root (HATEOAS entry point)    ║
║    GET  /v1/docs         API documentation                 ║
║    POST /v1/agents/scouts    Register Scout                ║
║    POST /v1/agents/beacons   Register Beacon               ║
║    POST /v1/sessions         Create session                ║
║    GET  /health              Health check                  ║
╚════════════════════════════════════════════════════════════╝
        `);
        resolve();
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      this.wss.close(() => {
        this.server.close(resolve);
      });
    });
  }
}

// ============================================================================
// MAIN
// ============================================================================

const core = new MockAURACore();

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await core.stop();
  process.exit(0);
});

core.start();

module.exports = MockAURACore;
