/**
 * AURA Core API
 *
 * Main entry point for the REST API and WebSocket gateway.
 * Handles Scout and Beacon connections, routes to internal services.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import pg from 'pg';

const { Pool } = pg;

// Configuration from environment
const config = {
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  intentServiceUrl: process.env.INTENT_SERVICE_URL || 'http://localhost:3001',
  workerServiceUrl: process.env.WORKER_SERVICE_URL || 'http://localhost:3002',
};

// Database connection pool
let db = null;

if (config.databaseUrl) {
  db = new Pool({
    connectionString: config.databaseUrl,
    ssl: { rejectUnauthorized: false },
    max: 10,
  });
}

// Initialize Fastify
const app = Fastify({
  logger: {
    level: config.env === 'production' ? 'info' : 'debug',
  },
});

// Register plugins
await app.register(cors, { origin: true });
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(websocket);

// =============================================================================
// Health Check Endpoints
// =============================================================================

app.get('/health', async () => ({
  status: 'healthy',
  service: 'core-api',
  timestamp: new Date().toISOString(),
  version: '0.1.0',
}));

app.get('/health/ready', async (request, reply) => {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
  };
  const allHealthy = Object.values(checks).every(c => c.status === 'healthy');
  reply.code(allHealthy ? 200 : 503);
  return { status: allHealthy ? 'ready' : 'not_ready', checks, timestamp: new Date().toISOString() };
});

async function checkDatabase() {
  if (!config.databaseUrl || !db) return { status: 'unconfigured' };
  try {
    await db.query('SELECT 1');
    return { status: 'healthy' };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

async function checkRedis() {
  if (!config.redisUrl) return { status: 'unconfigured' };
  return { status: 'healthy' }; // TODO: actual check
}

// =============================================================================
// Auto-Migration
// =============================================================================

async function runMigrations() {
  if (!db) {
    console.log('⚠️  No DATABASE_URL configured, skipping migrations');
    return;
  }

  console.log('🔍 Checking database schema...');

  try {
    // Always run migrations incrementally - they use IF NOT EXISTS
    console.log('📦 Running database migrations...');

    // Helper to check if column exists
    const columnExists = async (table, column) => {
      const result = await db.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
      `, [table, column]);
      return result.rows.length > 0;
    };

    // Add missing columns to existing tables
    if (!(await columnExists('beacons', 'capabilities'))) {
      console.log('   Adding capabilities column to beacons...');
      await db.query('ALTER TABLE beacons ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT \'{}\'');
    }

    // Make endpoint_url nullable (old schema had it as NOT NULL)
    await db.query('ALTER TABLE beacons ALTER COLUMN endpoint_url DROP NOT NULL').catch(() => {});
    if (!(await columnExists('sessions', 'raw_intent'))) {
      console.log('   Adding raw_intent column to sessions...');
      await db.query('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS raw_intent TEXT');
      await db.query('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS parsed_intent JSONB DEFAULT \'{}\'');
      await db.query('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS constraints JSONB DEFAULT \'{}\'');
    }

    // Add offer_id to transactions if missing (old schema didn't have it)
    if (!(await columnExists('transactions', 'offer_id'))) {
      console.log('   Adding offer_id column to transactions...');
      await db.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS offer_id UUID');
    }

    // Create extension and tables (IF NOT EXISTS makes these safe to re-run)
    await db.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await db.query(`
      -- SCOUTS (Buyer Agents)
      CREATE TABLE IF NOT EXISTS scouts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        api_key_hash VARCHAR(255),
        status VARCHAR(50) DEFAULT 'active',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_scouts_status ON scouts(status);

      -- BEACONS (Seller Agents)
      CREATE TABLE IF NOT EXISTS beacons (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        external_id VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        endpoint_url VARCHAR(500),
        status VARCHAR(50) DEFAULT 'active',
        capabilities JSONB DEFAULT '{}',
        identity_protocols JSONB DEFAULT '[]',
        negotiation_protocols JSONB DEFAULT '[]',
        payment_protocols JSONB DEFAULT '[]',
        fulfillment_protocols JSONB DEFAULT '[]',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_beacons_status ON beacons(status);
      CREATE INDEX IF NOT EXISTS idx_beacons_external_id ON beacons(external_id);

      -- SESSIONS (Commerce Sessions)
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        scout_id UUID REFERENCES scouts(id),
        status VARCHAR(50) DEFAULT 'created',
        raw_intent TEXT,
        parsed_intent JSONB DEFAULT '{}',
        constraints JSONB DEFAULT '{}',
        context JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_scout_id ON sessions(scout_id);

      -- OFFERS (Beacon Responses)
      CREATE TABLE IF NOT EXISTS offers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        beacon_id UUID NOT NULL REFERENCES beacons(id),
        status VARCHAR(50) DEFAULT 'pending',
        product JSONB NOT NULL,
        unit_price DECIMAL(15,2),
        quantity INTEGER,
        total_price DECIMAL(15,2),
        currency VARCHAR(10) DEFAULT 'USD',
        delivery_date DATE,
        terms JSONB DEFAULT '{}',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour')
      );
      CREATE INDEX IF NOT EXISTS idx_offers_session_id ON offers(session_id);
      CREATE INDEX IF NOT EXISTS idx_offers_beacon_id ON offers(beacon_id);
      CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);

      -- TRANSACTIONS (Committed Deals)
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        session_id UUID NOT NULL REFERENCES sessions(id),
        offer_id UUID NOT NULL REFERENCES offers(id),
        beacon_id UUID NOT NULL REFERENCES beacons(id),
        scout_id UUID REFERENCES scouts(id),
        status VARCHAR(50) DEFAULT 'pending',
        final_terms JSONB NOT NULL,
        payment_status VARCHAR(50),
        payment_reference VARCHAR(255),
        fulfillment_status VARCHAR(50),
        fulfillment_reference VARCHAR(255),
        idempotency_key VARCHAR(255) UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_transactions_session_id ON transactions(session_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

      -- AUDIT LOG
      CREATE TABLE IF NOT EXISTS audit_log (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        entity_type VARCHAR(50) NOT NULL,
        entity_id UUID NOT NULL,
        action VARCHAR(50) NOT NULL,
        previous_state JSONB,
        new_state JSONB,
        changed_by VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
    `);

    // Create update trigger
    await db.query(`
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$ LANGUAGE plpgsql;
    `);

    for (const table of ['scouts', 'beacons', 'sessions', 'transactions']) {
      await db.query(`DROP TRIGGER IF EXISTS ${table}_updated_at ON ${table}`);
      await db.query(`CREATE TRIGGER ${table}_updated_at BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION update_updated_at()`);
    }

    console.log('✅ Database migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

// =============================================================================
// API Root - HATEOAS Entry Point
// =============================================================================

app.get('/', async () => ({
  name: 'AURA Core API',
  version: '0.1.0',
  description: 'Agent Universal Resource Architecture — Infrastructure for Agentic Commerce',
  _links: {
    self: { href: '/' },
    health: { href: '/health' },
    sessions: { href: '/sessions', title: 'Create or list commerce sessions', methods: ['GET', 'POST'] },
    scouts: { href: '/scouts', title: 'Scout registration and management' },
    beacons: { href: '/beacons', title: 'Beacon registration and management' },
    docs: { href: 'https://aura-labs.ai/developers', title: 'API Documentation' },
  },
}));

// =============================================================================
// Scout Endpoints
// =============================================================================

app.post('/scouts/register', async (request, reply) => {
  const { apiKey, metadata } = request.body || {};

  if (!db) {
    reply.code(503);
    return { error: 'database_unavailable', message: 'Database not configured' };
  }

  try {
    // Create Scout in database
    const result = await db.query(
      `INSERT INTO scouts (api_key_hash, metadata) VALUES ($1, $2) RETURNING id, status, created_at`,
      [apiKey ? apiKey.slice(-8) : null, metadata || {}]
    );

    const scout = result.rows[0];

    await db.query(
      `INSERT INTO audit_log (entity_type, entity_id, action, new_state, changed_by) VALUES ($1, $2, $3, $4, $5)`,
      ['scout', scout.id, 'registered', { status: scout.status }, 'system']
    );

    return {
      scoutId: scout.id,
      status: scout.status,
      createdAt: scout.created_at,
      _links: {
        self: { href: `/scouts/${scout.id}` },
        sessions: { href: '/sessions', methods: ['POST'] },
      },
    };
  } catch (error) {
    app.log.error(error);
    reply.code(500);
    return { error: 'registration_failed', message: error.message };
  }
});

app.get('/scouts/:scoutId', async (request, reply) => {
  const { scoutId } = request.params;

  if (!db) {
    reply.code(503);
    return { error: 'database_unavailable' };
  }

  try {
    const result = await db.query('SELECT * FROM scouts WHERE id = $1', [scoutId]);
    if (result.rows.length === 0) {
      reply.code(404);
      return { error: 'not_found', message: 'Scout not found' };
    }

    const scout = result.rows[0];
    return {
      scoutId: scout.id,
      status: scout.status,
      metadata: scout.metadata,
      createdAt: scout.created_at,
      _links: {
        self: { href: `/scouts/${scout.id}` },
        sessions: { href: '/sessions', methods: ['POST'] },
      },
    };
  } catch (error) {
    reply.code(500);
    return { error: 'fetch_failed', message: error.message };
  }
});

// =============================================================================
// Beacon Endpoints
// =============================================================================

app.post('/beacons/register', async (request, reply) => {
  const { externalId, name, description, endpointUrl, capabilities, metadata } = request.body || {};

  if (!db) {
    reply.code(503);
    return { error: 'database_unavailable' };
  }

  if (!externalId || !name) {
    reply.code(400);
    return { error: 'missing_fields', message: 'externalId and name are required' };
  }

  try {
    const result = await db.query(
      `INSERT INTO beacons (external_id, name, description, endpoint_url, capabilities, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (external_id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         endpoint_url = EXCLUDED.endpoint_url,
         capabilities = EXCLUDED.capabilities,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()
       RETURNING id, external_id, name, status, capabilities, created_at`,
      [externalId, name, description, endpointUrl, capabilities || {}, metadata || {}]
    );

    const beacon = result.rows[0];

    await db.query(
      `INSERT INTO audit_log (entity_type, entity_id, action, new_state, changed_by) VALUES ($1, $2, $3, $4, $5)`,
      ['beacon', beacon.id, 'registered', { name: beacon.name, status: beacon.status }, 'system']
    );

    return {
      beaconId: beacon.id,
      externalId: beacon.external_id,
      name: beacon.name,
      status: beacon.status,
      capabilities: beacon.capabilities,
      _links: {
        self: { href: `/beacons/${beacon.id}` },
        sessions: { href: '/beacons/sessions', title: 'Poll for sessions to respond to' },
        submitOffer: { href: '/sessions/{sessionId}/offers', methods: ['POST'] },
      },
    };
  } catch (error) {
    app.log.error(error);
    reply.code(500);
    return { error: 'registration_failed', message: error.message };
  }
});

app.get('/beacons/:beaconId', async (request, reply) => {
  const { beaconId } = request.params;

  if (!db) {
    reply.code(503);
    return { error: 'database_unavailable' };
  }

  try {
    const result = await db.query('SELECT * FROM beacons WHERE id::text = $1 OR external_id = $1', [beaconId]);
    if (result.rows.length === 0) {
      reply.code(404);
      return { error: 'not_found', message: 'Beacon not found' };
    }

    const beacon = result.rows[0];
    return {
      beaconId: beacon.id,
      externalId: beacon.external_id,
      name: beacon.name,
      status: beacon.status,
      capabilities: beacon.capabilities,
      createdAt: beacon.created_at,
      _links: { self: { href: `/beacons/${beacon.id}` } },
    };
  } catch (error) {
    reply.code(500);
    return { error: 'fetch_failed', message: error.message };
  }
});

// Beacon polls for sessions matching their capabilities
app.get('/beacons/sessions', async (request, reply) => {
  const { status, limit } = request.query;

  if (!db) {
    reply.code(503);
    return { error: 'database_unavailable' };
  }

  try {
    // Return sessions that are waiting for offers
    const result = await db.query(
      `SELECT id, scout_id, status, raw_intent, parsed_intent, constraints, created_at
       FROM sessions
       WHERE status IN ('created', 'market_forming')
       ORDER BY created_at DESC
       LIMIT $1`,
      [parseInt(limit) || 20]
    );

    return {
      sessions: result.rows.map(s => ({
        sessionId: s.id,
        status: s.status,
        intent: { raw: s.raw_intent, parsed: s.parsed_intent },
        constraints: s.constraints,
        createdAt: s.created_at,
        _links: {
          submitOffer: { href: `/sessions/${s.id}/offers`, methods: ['POST'] },
        },
      })),
      _links: { self: { href: '/beacons/sessions' } },
    };
  } catch (error) {
    reply.code(500);
    return { error: 'fetch_failed', message: error.message };
  }
});

// =============================================================================
// Session Endpoints (Core Commerce Flow)
// =============================================================================

app.post('/sessions', async (request, reply) => {
  const { intent, scoutId, constraints } = request.body || {};

  if (!intent) {
    reply.code(400);
    return { error: 'missing_intent', message: 'Please provide an intent describing what you want' };
  }

  if (!db) {
    reply.code(503);
    return { error: 'database_unavailable' };
  }

  try {
    // Simple intent parsing (MVP - just extract keywords)
    // TODO: Replace with Granite LLM call
    const parsedIntent = {
      raw: intent,
      keywords: intent.toLowerCase().match(/\b\w+\b/g) || [],
      confidence: 0.5,
    };

    const result = await db.query(
      `INSERT INTO sessions (scout_id, status, raw_intent, parsed_intent, constraints)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, status, created_at`,
      [scoutId || null, 'market_forming', intent, parsedIntent, constraints || {}]
    );

    const session = result.rows[0];

    await db.query(
      `INSERT INTO audit_log (entity_type, entity_id, action, new_state, changed_by) VALUES ($1, $2, $3, $4, $5)`,
      ['session', session.id, 'created', { status: session.status, intent }, scoutId || 'anonymous']
    );

    return {
      sessionId: session.id,
      status: session.status,
      intent: parsedIntent,
      _links: {
        self: { href: `/sessions/${session.id}` },
        offers: { href: `/sessions/${session.id}/offers` },
        cancel: { href: `/sessions/${session.id}/cancel`, methods: ['POST'] },
      },
    };
  } catch (error) {
    app.log.error(error);
    reply.code(500);
    return { error: 'session_creation_failed', message: error.message };
  }
});

app.get('/sessions/:sessionId', async (request, reply) => {
  const { sessionId } = request.params;

  if (!db) {
    reply.code(503);
    return { error: 'database_unavailable' };
  }

  try {
    const result = await db.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    if (result.rows.length === 0) {
      reply.code(404);
      return { error: 'not_found', message: 'Session not found' };
    }

    const session = result.rows[0];

    // Check if there are offers
    const offersResult = await db.query(
      'SELECT COUNT(*) as count FROM offers WHERE session_id = $1 AND status = $2',
      [sessionId, 'pending']
    );
    const hasOffers = parseInt(offersResult.rows[0].count) > 0;

    // Update status if offers are available
    let status = session.status;
    if (hasOffers && status === 'market_forming') {
      status = 'offers_available';
      await db.query('UPDATE sessions SET status = $1 WHERE id = $2', [status, sessionId]);
    }

    const links = {
      self: { href: `/sessions/${sessionId}` },
      cancel: { href: `/sessions/${sessionId}/cancel`, methods: ['POST'] },
    };

    if (hasOffers || status === 'offers_available') {
      links.offers = { href: `/sessions/${sessionId}/offers` };
      links.commit = { href: `/sessions/${sessionId}/commit`, methods: ['POST'] };
    }

    return {
      sessionId: session.id,
      status,
      intent: { raw: session.raw_intent, parsed: session.parsed_intent },
      constraints: session.constraints,
      createdAt: session.created_at,
      _links: links,
    };
  } catch (error) {
    reply.code(500);
    return { error: 'fetch_failed', message: error.message };
  }
});

// =============================================================================
// Offer Endpoints
// =============================================================================

// Beacon submits an offer to a session
app.post('/sessions/:sessionId/offers', async (request, reply) => {
  const { sessionId } = request.params;
  const { beaconId, product, unitPrice, quantity, totalPrice, currency, deliveryDate, terms, metadata } = request.body || {};

  if (!db) {
    reply.code(503);
    return { error: 'database_unavailable' };
  }

  if (!beaconId || !product) {
    reply.code(400);
    return { error: 'missing_fields', message: 'beaconId and product are required' };
  }

  try {
    // Verify session exists and is accepting offers
    const sessionResult = await db.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    if (sessionResult.rows.length === 0) {
      reply.code(404);
      return { error: 'session_not_found' };
    }

    const session = sessionResult.rows[0];
    if (!['created', 'market_forming', 'offers_available'].includes(session.status)) {
      reply.code(400);
      return { error: 'session_not_accepting_offers', message: `Session status is ${session.status}` };
    }

    // Verify beacon exists
    const beaconResult = await db.query('SELECT * FROM beacons WHERE id::text = $1 OR external_id = $1', [beaconId]);
    if (beaconResult.rows.length === 0) {
      reply.code(404);
      return { error: 'beacon_not_found' };
    }
    const beacon = beaconResult.rows[0];

    // Calculate total if not provided
    const calculatedTotal = totalPrice || (unitPrice * quantity);

    const result = await db.query(
      `INSERT INTO offers (session_id, beacon_id, product, unit_price, quantity, total_price, currency, delivery_date, terms, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, status, created_at`,
      [sessionId, beacon.id, product, unitPrice, quantity, calculatedTotal, currency || 'USD', deliveryDate, terms || {}, metadata || {}]
    );

    const offer = result.rows[0];

    // Update session status
    await db.query('UPDATE sessions SET status = $1 WHERE id = $2', ['offers_available', sessionId]);

    return {
      offerId: offer.id,
      sessionId,
      beaconId: beacon.id,
      status: offer.status,
      createdAt: offer.created_at,
      _links: {
        self: { href: `/sessions/${sessionId}/offers/${offer.id}` },
        session: { href: `/sessions/${sessionId}` },
      },
    };
  } catch (error) {
    app.log.error(error);
    reply.code(500);
    return { error: 'offer_submission_failed', message: error.message };
  }
});

// Scout retrieves offers for a session
app.get('/sessions/:sessionId/offers', async (request, reply) => {
  const { sessionId } = request.params;

  if (!db) {
    reply.code(503);
    return { error: 'database_unavailable' };
  }

  try {
    const result = await db.query(
      `SELECT o.*, b.name as beacon_name, b.external_id as beacon_external_id
       FROM offers o
       JOIN beacons b ON o.beacon_id = b.id
       WHERE o.session_id = $1 AND o.status = 'pending'
       ORDER BY o.created_at DESC`,
      [sessionId]
    );

    return {
      sessionId,
      offers: result.rows.map(o => ({
        id: o.id,
        beaconId: o.beacon_id,
        beaconName: o.beacon_name,
        product: o.product,
        unitPrice: parseFloat(o.unit_price),
        quantity: o.quantity,
        totalPrice: parseFloat(o.total_price),
        currency: o.currency,
        deliveryDate: o.delivery_date,
        terms: o.terms,
        metadata: o.metadata,
        createdAt: o.created_at,
      })),
      _links: {
        self: { href: `/sessions/${sessionId}/offers` },
        session: { href: `/sessions/${sessionId}` },
        commit: { href: `/sessions/${sessionId}/commit`, methods: ['POST'] },
      },
    };
  } catch (error) {
    reply.code(500);
    return { error: 'fetch_failed', message: error.message };
  }
});

// =============================================================================
// Transaction Commitment
// =============================================================================

app.post('/sessions/:sessionId/commit', async (request, reply) => {
  const { sessionId } = request.params;
  const { offerId, idempotencyKey } = request.body || {};

  if (!db) {
    reply.code(503);
    return { error: 'database_unavailable' };
  }

  if (!offerId) {
    reply.code(400);
    return { error: 'missing_offer_id', message: 'offerId is required' };
  }

  try {
    // Verify session and offer
    const sessionResult = await db.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    if (sessionResult.rows.length === 0) {
      reply.code(404);
      return { error: 'session_not_found' };
    }

    const offerResult = await db.query(
      'SELECT o.*, b.name as beacon_name FROM offers o JOIN beacons b ON o.beacon_id = b.id WHERE o.id = $1 AND o.session_id = $2',
      [offerId, sessionId]
    );
    if (offerResult.rows.length === 0) {
      reply.code(404);
      return { error: 'offer_not_found' };
    }

    const offer = offerResult.rows[0];
    const session = sessionResult.rows[0];

    // Create transaction
    const txResult = await db.query(
      `INSERT INTO transactions (session_id, offer_id, beacon_id, scout_id, status, final_terms, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, status, created_at`,
      [sessionId, offerId, offer.beacon_id, session.scout_id, 'committed', {
        product: offer.product,
        totalPrice: offer.total_price,
        currency: offer.currency,
        deliveryDate: offer.delivery_date,
        terms: offer.terms,
      }, idempotencyKey || null]
    );

    const transaction = txResult.rows[0];

    // Update session and offer status
    await db.query('UPDATE sessions SET status = $1 WHERE id = $2', ['committed', sessionId]);
    await db.query('UPDATE offers SET status = $1 WHERE id = $2', ['accepted', offerId]);
    await db.query('UPDATE offers SET status = $1 WHERE session_id = $2 AND id != $3', ['rejected', sessionId, offerId]);

    await db.query(
      `INSERT INTO audit_log (entity_type, entity_id, action, new_state, changed_by) VALUES ($1, $2, $3, $4, $5)`,
      ['transaction', transaction.id, 'committed', { offerId, beaconId: offer.beacon_id }, session.scout_id || 'anonymous']
    );

    return {
      transactionId: transaction.id,
      sessionId,
      offerId,
      beaconId: offer.beacon_id,
      beaconName: offer.beacon_name,
      status: transaction.status,
      finalTerms: {
        product: offer.product,
        totalPrice: parseFloat(offer.total_price),
        currency: offer.currency,
        deliveryDate: offer.delivery_date,
      },
      createdAt: transaction.created_at,
      _links: {
        self: { href: `/transactions/${transaction.id}` },
        session: { href: `/sessions/${sessionId}` },
      },
    };
  } catch (error) {
    app.log.error(error);
    if (error.code === '23505') { // unique constraint violation
      reply.code(409);
      return { error: 'duplicate_transaction', message: 'Transaction with this idempotency key already exists' };
    }
    reply.code(500);
    return { error: 'commit_failed', message: error.message };
  }
});

// Cancel session
app.post('/sessions/:sessionId/cancel', async (request, reply) => {
  const { sessionId } = request.params;

  if (!db) {
    reply.code(503);
    return { error: 'database_unavailable' };
  }

  try {
    const result = await db.query(
      'UPDATE sessions SET status = $1 WHERE id = $2 AND status NOT IN ($3, $4) RETURNING id, status',
      ['cancelled', sessionId, 'committed', 'completed']
    );

    if (result.rows.length === 0) {
      reply.code(400);
      return { error: 'cannot_cancel', message: 'Session not found or already committed/completed' };
    }

    return {
      sessionId,
      status: 'cancelled',
      _links: { self: { href: `/sessions/${sessionId}` } },
    };
  } catch (error) {
    reply.code(500);
    return { error: 'cancel_failed', message: error.message };
  }
});

// =============================================================================
// WebSocket Endpoints (keeping for future real-time support)
// =============================================================================

app.get('/ws/scout', { websocket: true }, (connection) => {
  connection.socket.on('message', (message) => {
    const data = JSON.parse(message.toString());
    app.log.info({ type: 'scout_message', data });
    connection.socket.send(JSON.stringify({ type: 'ack', received: data }));
  });
  connection.socket.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to AURA Core as Scout',
    note: 'WebSocket support is for future real-time updates. Use REST API for MVP.',
  }));
});

app.get('/ws/beacon', { websocket: true }, (connection) => {
  connection.socket.on('message', (message) => {
    const data = JSON.parse(message.toString());
    app.log.info({ type: 'beacon_message', data });
    connection.socket.send(JSON.stringify({ type: 'ack', received: data }));
  });
  connection.socket.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to AURA Core as Beacon',
    note: 'WebSocket support is for future real-time updates. Use REST API for MVP.',
  }));
});

// =============================================================================
// Start Server
// =============================================================================

try {
  await runMigrations();
  await app.listen({ port: config.port, host: config.host });
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    AURA Core API                          ║
║                                                           ║
║  REST API:    http://${config.host}:${config.port}                       ║
║  Environment: ${config.env.padEnd(40)}║
║  Database:    ${config.databaseUrl ? 'connected' : 'not configured'}${' '.repeat(config.databaseUrl ? 30 : 22)}║
╚═══════════════════════════════════════════════════════════╝
  `);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
