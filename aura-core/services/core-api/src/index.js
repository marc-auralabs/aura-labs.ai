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

  // Database
  databaseUrl: process.env.DATABASE_URL,

  // Redis
  redisUrl: process.env.REDIS_URL,

  // Internal services
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
await app.register(cors, {
  origin: true, // Configure appropriately for production
});

await app.register(helmet, {
  contentSecurityPolicy: false, // Adjust for production
});

await app.register(websocket);

// =============================================================================
// Health Check Endpoints
// =============================================================================

app.get('/health', async (request, reply) => {
  return {
    status: 'healthy',
    service: 'core-api',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  };
});

app.get('/health/ready', async (request, reply) => {
  // Check dependencies
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
  };

  const allHealthy = Object.values(checks).every(c => c.status === 'healthy');

  reply.code(allHealthy ? 200 : 503);
  return {
    status: allHealthy ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString(),
  };
});

async function checkDatabase() {
  if (!config.databaseUrl || !db) {
    return { status: 'unconfigured' };
  }
  try {
    const result = await db.query('SELECT 1');
    return { status: 'healthy' };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
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
    // Check if tables exist
    const result = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'beacons'
    `);

    if (result.rows.length > 0) {
      console.log('✅ Database schema already exists');
      return;
    }

    console.log('📦 Running database migrations...');

    // Create tables inline (same as schema.sql)
    await db.query(`
      -- Enable UUID extension
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      -- BEACONS (Seller Agents)
      CREATE TABLE IF NOT EXISTS beacons (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          external_id VARCHAR(255) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          endpoint_url VARCHAR(500) NOT NULL,
          status VARCHAR(50) DEFAULT 'pending',
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

      -- SESSIONS (Scout Conversations)
      CREATE TABLE IF NOT EXISTS sessions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          scout_id VARCHAR(255),
          status VARCHAR(50) DEFAULT 'active',
          context JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_scout_id ON sessions(scout_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

      -- INTENTS (Parsed Scout Intentions)
      CREATE TABLE IF NOT EXISTS intents (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          raw_input TEXT NOT NULL,
          parsed_intent JSONB NOT NULL,
          confidence DECIMAL(3,2),
          intent_type VARCHAR(100),
          created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_intents_session_id ON intents(session_id);
      CREATE INDEX IF NOT EXISTS idx_intents_type ON intents(intent_type);

      -- NEGOTIATIONS (Active Deals)
      CREATE TABLE IF NOT EXISTS negotiations (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          beacon_id UUID NOT NULL REFERENCES beacons(id),
          status VARCHAR(50) DEFAULT 'initiated',
          selected_protocols JSONB DEFAULT '{}',
          current_offer JSONB,
          offer_history JSONB DEFAULT '[]',
          idempotency_key VARCHAR(255) UNIQUE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour')
      );

      CREATE INDEX IF NOT EXISTS idx_negotiations_session_id ON negotiations(session_id);
      CREATE INDEX IF NOT EXISTS idx_negotiations_beacon_id ON negotiations(beacon_id);
      CREATE INDEX IF NOT EXISTS idx_negotiations_status ON negotiations(status);
      CREATE INDEX IF NOT EXISTS idx_negotiations_idempotency ON negotiations(idempotency_key);

      -- TRANSACTIONS (Completed Deals)
      CREATE TABLE IF NOT EXISTS transactions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          negotiation_id UUID REFERENCES negotiations(id),
          session_id UUID NOT NULL REFERENCES sessions(id),
          beacon_id UUID NOT NULL REFERENCES beacons(id),
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
      CREATE INDEX IF NOT EXISTS idx_transactions_beacon_id ON transactions(beacon_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
      CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON transactions(idempotency_key);

      -- AUDIT LOG (State Changes)
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
      CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at);
    `);

    // Create update trigger function
    await db.query(`
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create triggers (drop first if exist to avoid errors)
    const tables = ['beacons', 'sessions', 'negotiations', 'transactions'];
    for (const table of tables) {
      await db.query(`DROP TRIGGER IF EXISTS ${table}_updated_at ON ${table}`);
      await db.query(`
        CREATE TRIGGER ${table}_updated_at
        BEFORE UPDATE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION update_updated_at()
      `);
    }

    console.log('✅ Database migrations completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

async function checkRedis() {
  if (!config.redisUrl) {
    return { status: 'unconfigured' };
  }
  try {
    // TODO: Implement actual Redis check
    return { status: 'healthy' };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

// =============================================================================
// Coming Soon Response Helper
// =============================================================================

function comingSoon(request, reply, feature) {
  reply.code(200); // 200 instead of 404 - it's a valid endpoint, just not ready
  return {
    status: 'coming_soon',
    feature,
    message: `This endpoint is under active development and will be available soon.`,
    timestamp: new Date().toISOString(),
    _links: {
      home: { href: '/' },
      health: { href: '/health' },
      docs: { href: 'https://aura-labs.ai/developers' },
    },
  };
}

// =============================================================================
// API Root - HATEOAS Entry Point
// =============================================================================

app.get('/', async (request, reply) => {
  return {
    name: 'AURA Core API',
    version: '0.1.0',
    description: 'Agent Universal Resource Access - Commerce Protocol',
    _links: {
      self: { href: '/' },
      health: { href: '/health' },
      sessions: {
        href: '/sessions',
        title: 'Create or list commerce sessions',
        methods: ['GET', 'POST'],
      },
      scouts: {
        href: '/scouts',
        title: 'Scout registration and management',
      },
      beacons: {
        href: '/beacons',
        title: 'Beacon registration and management',
      },
      docs: {
        href: 'https://aura-labs.ai/developers',
        title: 'API Documentation',
      },
    },
  };
});

// =============================================================================
// Scout Endpoints
// =============================================================================

app.post('/scouts/register', async (request, reply) => {
  const { apiKey, metadata } = request.body || {};

  // TODO: Validate API key against Supabase
  // TODO: Register Scout in database

  return {
    scoutId: `scout_${Date.now()}`,
    status: 'registered',
    _links: {
      self: { href: `/scouts/scout_${Date.now()}` },
      sessions: { href: '/sessions', methods: ['POST'] },
      websocket: { href: '/ws/scout', protocol: 'websocket' },
    },
  };
});

// =============================================================================
// Beacon Endpoints
// =============================================================================

app.post('/beacons/register', async (request, reply) => {
  const { apiKey, capabilities, offerings } = request.body || {};

  // TODO: Validate API key against Supabase
  // TODO: Register Beacon with capabilities

  return {
    beaconId: `beacon_${Date.now()}`,
    status: 'registered',
    capabilities: capabilities || {},
    _links: {
      self: { href: `/beacons/beacon_${Date.now()}` },
      websocket: { href: '/ws/beacon', protocol: 'websocket' },
      updateCapabilities: { href: `/beacons/beacon_${Date.now()}/capabilities`, methods: ['PUT'] },
    },
  };
});

// =============================================================================
// Session Endpoints (Core Commerce Flow)
// =============================================================================

app.post('/sessions', async (request, reply) => {
  const { intent, scoutId } = request.body || {};

  if (!intent) {
    reply.code(400);
    return {
      error: 'missing_intent',
      message: 'Please provide an intent describing what you want',
    };
  }

  // TODO: Call intent-svc to parse natural language
  // TODO: Call core-worker to form market

  // Placeholder response demonstrating HATEOAS
  const sessionId = `session_${Date.now()}`;

  return {
    sessionId,
    status: 'market_forming',
    intent: {
      raw: intent,
      parsed: {
        // Would come from intent-svc
        product: 'unknown',
        confidence: 0.0,
      },
    },
    _links: {
      self: { href: `/sessions/${sessionId}` },
      status: { href: `/sessions/${sessionId}/status` },
      cancel: { href: `/sessions/${sessionId}/cancel`, methods: ['POST'] },
      // These links appear once market is formed
      // offers: { href: `/sessions/${sessionId}/offers` },
      // commit: { href: `/sessions/${sessionId}/commit`, methods: ['POST'] },
    },
  };
});

app.get('/sessions/:sessionId', async (request, reply) => {
  const { sessionId } = request.params;

  // TODO: Fetch session from database/cache

  return {
    sessionId,
    status: 'active',
    _links: {
      self: { href: `/sessions/${sessionId}` },
      offers: { href: `/sessions/${sessionId}/offers` },
    },
  };
});

// =============================================================================
// WebSocket Endpoints
// =============================================================================

app.get('/ws/scout', { websocket: true }, (connection, req) => {
  connection.socket.on('message', (message) => {
    const data = JSON.parse(message.toString());
    app.log.info({ type: 'scout_message', data });

    // Echo for now - will route to core-worker
    connection.socket.send(JSON.stringify({
      type: 'ack',
      received: data,
    }));
  });

  connection.socket.on('close', () => {
    app.log.info('Scout WebSocket disconnected');
  });

  // Send welcome message
  connection.socket.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to AURA Core as Scout',
    _links: {
      createSession: { action: 'create_session' },
    },
  }));
});

app.get('/ws/beacon', { websocket: true }, (connection, req) => {
  connection.socket.on('message', (message) => {
    const data = JSON.parse(message.toString());
    app.log.info({ type: 'beacon_message', data });

    // Echo for now - will route to core-worker
    connection.socket.send(JSON.stringify({
      type: 'ack',
      received: data,
    }));
  });

  connection.socket.on('close', () => {
    app.log.info('Beacon WebSocket disconnected');
  });

  // Send welcome message
  connection.socket.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to AURA Core as Beacon',
    _links: {
      registerOfferings: { action: 'register_offerings' },
    },
  }));
});

// =============================================================================
// Coming Soon Endpoints
// =============================================================================

// Scout endpoints - coming soon
app.get('/scouts', async (request, reply) => {
  return comingSoon(request, reply, 'List Scouts');
});

app.get('/scouts/:scoutId', async (request, reply) => {
  return comingSoon(request, reply, 'Scout Details');
});

// Beacon endpoints - coming soon
app.get('/beacons', async (request, reply) => {
  return comingSoon(request, reply, 'List Beacons');
});

app.get('/beacons/:beaconId', async (request, reply) => {
  return comingSoon(request, reply, 'Beacon Details');
});

app.put('/beacons/:beaconId/capabilities', async (request, reply) => {
  return comingSoon(request, reply, 'Update Beacon Capabilities');
});

// Session endpoints - coming soon
app.get('/sessions', async (request, reply) => {
  return comingSoon(request, reply, 'List Sessions');
});

app.get('/sessions/:sessionId/status', async (request, reply) => {
  return comingSoon(request, reply, 'Session Status');
});

app.post('/sessions/:sessionId/cancel', async (request, reply) => {
  return comingSoon(request, reply, 'Cancel Session');
});

app.get('/sessions/:sessionId/offers', async (request, reply) => {
  return comingSoon(request, reply, 'Session Offers');
});

app.post('/sessions/:sessionId/commit', async (request, reply) => {
  return comingSoon(request, reply, 'Commit to Offer');
});

// =============================================================================
// Start Server
// =============================================================================

try {
  // Run migrations before starting
  await runMigrations();

  await app.listen({ port: config.port, host: config.host });
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    AURA Core API                          ║
║                                                           ║
║  REST API:    http://${config.host}:${config.port}                       ║
║  WebSocket:   ws://${config.host}:${config.port}/ws/scout                ║
║               ws://${config.host}:${config.port}/ws/beacon               ║
║                                                           ║
║  Environment: ${config.env.padEnd(40)}║
║  Database:    ${config.databaseUrl ? 'connected' : 'not configured'}${' '.repeat(config.databaseUrl ? 30 : 22)}║
╚═══════════════════════════════════════════════════════════╝
  `);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
