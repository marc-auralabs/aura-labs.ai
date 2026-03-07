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
import { randomUUID } from 'crypto';
import { registerDevRoutes } from './routes/dev.js';
import {
  verifyRegistrationSignature,
  computeKeyFingerprint,
  createSignatureVerifier,
  validateRedirectUrl,
} from './lib/agent-auth.js';
import { parseIntent } from './lib/intent-parser.js';
import { matchBeacons } from './lib/beacon-matcher.js';
import { dispatchWebhook } from './lib/webhook-dispatcher.js';

const { Pool } = pg;

// Safe error messages — never leak internal details in production
function safeError(error, fallbackMessage = 'An internal error occurred') {
  if (process.env.NODE_ENV !== 'production') return error.message;
  // Only return known safe error messages; everything else gets the fallback
  const safePatterns = [
    /not found/i, /invalid/i, /required/i, /already exists/i,
    /expired/i, /unauthorized/i, /forbidden/i, /missing/i,
  ];
  if (safePatterns.some(p => p.test(error.message))) return error.message;
  console.error('Suppressed error detail:', error.message);
  return fallbackMessage;
}

// Versioned HATEOAS helper — extracts version prefix from request URL
// so all _links.href values match the caller's declared API version.
function versionedHref(request, path) {
  const match = request.url.match(/^\/(v\d+)/);
  const prefix = match ? `/${match[1]}` : '';
  return `${prefix}${path}`;
}

// Configuration from environment
const config = {
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
};

// Database connection pool
let db = null;

if (config.databaseUrl) {
  // SSL configuration:
  // - Local dev (localhost/127.0.0.1): no SSL
  // - Cloud (Railway, Supabase): SSL enabled, rejectUnauthorized off
  //   because Railway/Supabase use self-signed or internal CA certs.
  //   Traffic is encrypted; Railway's internal network handles trust.
  const isLocal = config.databaseUrl.includes('localhost') || config.databaseUrl.includes('127.0.0.1');
  const sslConfig = isLocal ? false : { rejectUnauthorized: false };

  db = new Pool({
    connectionString: config.databaseUrl,
    ssl: sslConfig,
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
// CORS: restrict to known origins. Server-side agents (SDKs) don't use CORS.
// Browser clients (Chrome extension, portal, local dev) need explicit origins.
const ALLOWED_ORIGINS = [
  config.env === 'production' && 'https://aura-labs.ai',
  config.env === 'production' && 'https://www.aura-labs.ai',
  config.env === 'production' && /^chrome-extension:\/\//,   // Scout Chrome extension
  config.env !== 'production' && /^http:\/\/localhost(:\d+)?$/,
].filter(Boolean);

await app.register(cors, {
  origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Agent-ID', 'X-Signature', 'X-Timestamp', 'X-Beacon-ID'],
  exposedHeaders: ['X-Request-ID'],
  maxAge: 600,    // Cache preflight for 10 minutes
  credentials: false,
});
await app.register(helmet, {
  // CSP not needed for a JSON API (no HTML served)
  contentSecurityPolicy: false,
  // Prevent MIME-type sniffing
  noSniff: true,
  // Not an HTML frame target
  frameguard: { action: 'deny' },
  // Force HTTPS in production
  hsts: config.env === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
  // Hide powered-by header
  hidePoweredBy: true,
  // Prevent IE from executing downloads in site context
  ieNoOpen: true,
  // Disable DNS prefetching
  dnsPrefetchControl: { allow: false },
  // Don't send referrer
  referrerPolicy: { policy: 'no-referrer' },
});
await app.register(websocket);

// =============================================================================
// Rate Limiting (per-agent for authenticated routes, per-IP for public routes)
// In-memory store — resets on deploy. Future: policy agent can adjust limits.
// =============================================================================

const rateLimitStore = new Map();  // key → { count, windowStart }
const RATE_LIMITS = {
  agent:  { windowMs: 60_000, max: 120 },  // 120 req/min per authenticated agent
  public: { windowMs: 60_000, max: 30 },    // 30 req/min per IP for unauthenticated
};
// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now - entry.windowStart > entry.windowMs * 2) rateLimitStore.delete(key);
  }
}, 300_000).unref();

function checkRateLimit(key, limit) {
  const now = Date.now();
  let entry = rateLimitStore.get(key);
  if (!entry || now - entry.windowStart > limit.windowMs) {
    entry = { count: 0, windowStart: now, windowMs: limit.windowMs };
    rateLimitStore.set(key, entry);
  }
  entry.count++;
  const remaining = Math.max(0, limit.max - entry.count);
  const resetAt = entry.windowStart + limit.windowMs;
  return { allowed: entry.count <= limit.max, remaining, resetAt, limit: limit.max };
}

// Rate limit hook — uses X-Agent-ID header to identify authenticated agents.
// Runs early (onRequest) so abusive traffic is rejected before heavier processing.
app.addHook('onRequest', async (request, reply) => {
  // Skip health checks
  if (request.url === '/health' || request.url === '/health/ready') return;

  // Use X-Agent-ID header as the rate limit key for authenticated agents.
  // The actual signature verification still happens in verifyAgent preHandler —
  // this just determines which bucket to count against.
  const agentId = request.headers['x-agent-id'];
  const key = agentId ? `agent:${agentId}` : `ip:${request.ip}`;
  const limit = agentId ? RATE_LIMITS.agent : RATE_LIMITS.public;
  const result = checkRateLimit(key, limit);

  reply.header('X-RateLimit-Limit', result.limit);
  reply.header('X-RateLimit-Remaining', result.remaining);
  reply.header('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

  if (!result.allowed) {
    // SECURITY: Log rate limit violations
    request.log.warn({
      event: 'security.rate_limited',
      agentId: agentId || null,
      ip: request.ip,
      path: request.url,
      limit: result.limit,
    });
    reply.code(429);
    return reply.send({
      error: 'rate_limit_exceeded',
      message: agentId
        ? `Agent rate limit exceeded. ${result.limit} requests per minute.`
        : `IP rate limit exceeded. Authenticate as an agent for higher limits.`,
      retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
    });
  }
});

// =============================================================================
// Request ID Middleware
// =============================================================================

app.addHook('preHandler', (request, reply, done) => {
  // Check for incoming X-Request-ID header; if present, use it. Otherwise generate one.
  const requestId = request.headers['x-request-id'] || randomUUID();

  // Attach to request
  request.requestId = requestId;

  // Add to reply header
  reply.header('X-Request-ID', requestId);

  // Add to Fastify's request logging context so all pino logs include requestId
  request.log = request.log.child({ requestId });

  done();
});

// Agent signature verifier — validates Ed25519 signatures on protected endpoints
// Skips gracefully if no auth headers present (backward compat)
const verifyAgent = createSignatureVerifier(db);

// Register development routes (test runners, etc.)
registerDevRoutes(app, config);

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
    return { status: 'unhealthy', error: safeError(error, 'Database check failed') };
  }
}

async function checkRedis() {
  if (!config.redisUrl) return { status: 'unconfigured' };
  return { status: 'healthy' }; // TODO: actual check
}

// =============================================================================
// Security: UUID Validation
// (moved inside plugin function below)
// =============================================================================

// =============================================================================
// Admin Reset Endpoint: REMOVED (DEC-015)
//
// Policy agents are the operator layer. No human-facing mutation endpoints
// in production. Platform actions flow through policy agents with audit
// trails, safety gates, and revert capability.
// =============================================================================

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

    // Create extension and tables FIRST (IF NOT EXISTS makes these safe to re-run)
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
        agent_id UUID REFERENCES agents(id),
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
        agent_id UUID REFERENCES agents(id),
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

      -- AGENTS (Universal Identity — Scouts and Beacons)
      -- Every agent registers with an Ed25519 public key.
      -- The public key IS the agent's identity; it signs all requests.
      -- type: 'scout' (buyer) or 'beacon' (seller)
      -- manifest: SDK version, capabilities, supported protocols
      CREATE TABLE IF NOT EXISTS agents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        type VARCHAR(20) NOT NULL CHECK (type IN ('scout', 'beacon')),
        public_key TEXT NOT NULL UNIQUE,
        key_fingerprint VARCHAR(64) NOT NULL,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
        manifest JSONB NOT NULL DEFAULT '{}',
        registered_at TIMESTAMPTZ DEFAULT NOW(),
        revoked_at TIMESTAMPTZ,
        last_seen_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_agents_public_key ON agents(public_key);
      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
      CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type);
    `);

    // Incremental migrations: add columns to existing tables
    // Safe to re-run — ADD COLUMN IF NOT EXISTS is idempotent
    await db.query(`
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agents(id);
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agents(id);
      ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS request_id VARCHAR(255);
      CREATE INDEX IF NOT EXISTS idx_sessions_agent_id ON sessions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_agent_id ON transactions(agent_id);
    `);

    // Create update trigger
    await db.query(`
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$ LANGUAGE plpgsql;
    `);

    // Trigger table names are hardcoded — validate against allowlist to prevent
    // any future refactor from introducing SQL injection via string interpolation.
    const TRIGGER_TABLES = Object.freeze(['scouts', 'beacons', 'sessions', 'transactions']);
    const VALID_TABLE_NAME = /^[a-z_]+$/;
    for (const table of TRIGGER_TABLES) {
      if (!VALID_TABLE_NAME.test(table)) throw new Error(`Invalid table name: ${table}`);
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
// API Root - Version Discovery Entry Point
// =============================================================================

app.get('/', async () => ({
  name: 'AURA Core API',
  description: 'Agent Universal Resource Architecture — Infrastructure for Agentic Commerce',
  versions: {
    v1: {
      status: 'current',
      href: '/v1',
      deprecated: false,
    },
  },
  _links: {
    self: { href: '/' },
    health: { href: '/health' },
    current: { href: '/v1', title: 'Current API version' },
    docs: { href: 'https://aura-labs.ai/developers', title: 'API Documentation' },
  },
}));

// =============================================================================
// Versioned Business Routes (v1)
// =============================================================================

async function businessRoutesV1(app, opts) {
  // UUID validation hook (moved inside plugin so it only applies to business routes)
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function isValidUUID(str) {
    return typeof str === 'string' && UUID_REGEX.test(str);
  }
  app.addHook('preHandler', async (request, reply) => {
    const params = request.params || {};
    for (const [key, value] of Object.entries(params)) {
      if (key.endsWith('Id') && key !== 'beaconId' && value) {
        if (!isValidUUID(value)) {
          reply.code(400);
          return { error: 'invalid_parameter', message: `Invalid ${key} format. Expected UUID.` };
        }
      }
    }
  });

  // V1 HATEOAS root
  app.get('/', async (request) => ({
    name: 'AURA Core API',
    version: 'v1',
    _links: {
      self: { href: versionedHref(request, '/') },
      agents: { href: versionedHref(request, '/agents/register'), title: 'Register agent (Scout or Beacon)', methods: ['POST'] },
      sessions: { href: versionedHref(request, '/sessions'), title: 'Commerce sessions', methods: ['GET', 'POST'] },
      beacons: { href: versionedHref(request, '/beacons'), title: 'Beacon management' },
      docs: { href: 'https://aura-labs.ai/developers', title: 'API Documentation' },
    },
  }));

  // =============================================================================
  // Scout Endpoints: REMOVED (DEC-015 / Fix #2)
  //
  // Legacy scout registration stored API keys as plaintext (apiKey.slice(-8)).
  // Scouts now register via POST /agents/register with Ed25519 proof-of-possession,
  // the same identity model as beacons. One auth system, one identity model.
  //
  // Scout lookup is available via GET /agents/:agentId (universal agent endpoint).
  // =============================================================================

  // =============================================================================
  // Agent Endpoints (Universal Identity — Scouts and Beacons)
  // =============================================================================

  /**
   * Register a new agent with cryptographic identity.
   *
   * The agent generates an Ed25519 key pair locally, then proves possession
   * of the private key by signing the request body. The public key becomes
   * the agent's permanent identity anchor.
   *
   * Request body: { publicKey, type, manifest }
   * Header: X-Agent-Signature (base64 Ed25519 signature of the JSON body)
   */
  app.post('/agents/register', async (request, reply) => {
    const { publicKey, type, manifest } = request.body || {};

    if (!db) {
      reply.code(503);
      return { error: 'database_unavailable', message: 'Database not configured' };
    }

    // Validate required fields
    if (!publicKey) {
      reply.code(400);
      return { error: 'missing_field', message: 'publicKey is required (base64-encoded Ed25519 public key)' };
    }

    if (!type || !['scout', 'beacon'].includes(type)) {
      reply.code(400);
      return { error: 'invalid_type', message: 'type must be "scout" or "beacon"' };
    }

    // SECURITY: Validate public key is exactly 32 bytes (Ed25519)
    const keyBytes = Buffer.from(publicKey, 'base64');
    if (keyBytes.length !== 32) {
      reply.code(400);
      return { error: 'invalid_key', message: 'publicKey must be a 32-byte Ed25519 public key (base64-encoded)' };
    }

    // SECURITY: Verify proof-of-possession signature
    const signature = request.headers['x-agent-signature'];
    if (!signature) {
      reply.code(400);
      return { error: 'missing_signature', message: 'X-Agent-Signature header is required (sign the JSON body with your private key)' };
    }

    // Reconstruct the raw body for signature verification
    const rawBody = JSON.stringify(request.body);
    const signatureValid = verifyRegistrationSignature(publicKey, signature, rawBody);

    if (!signatureValid) {
      reply.code(401);
      return { error: 'invalid_signature', message: 'Proof-of-possession failed. Signature does not match the provided public key.' };
    }

    try {
      const fingerprint = computeKeyFingerprint(publicKey);

      // Check if this key is already registered
      const existing = await db.query(
        'SELECT id, status FROM agents WHERE public_key = $1',
        [publicKey]
      );

      if (existing.rows.length > 0) {
        const existingAgent = existing.rows[0];

        // SECURITY: Don't allow re-registration of revoked keys
        if (existingAgent.status === 'revoked') {
          reply.code(403);
          return { error: 'key_revoked', message: 'This public key has been revoked and cannot be re-registered' };
        }

        // Idempotent: return existing agent for active/suspended keys
        return {
          agentId: existingAgent.id,
          status: existingAgent.status,
          keyId: fingerprint,
          _links: {
            self: { href: versionedHref(request, `/agents/${existingAgent.id}`) },
            sessions: { href: versionedHref(request, '/sessions'), methods: ['POST'] },
          },
        };
      }

      const result = await db.query(
        `INSERT INTO agents (type, public_key, key_fingerprint, manifest)
         VALUES ($1, $2, $3, $4)
         RETURNING id, status, registered_at`,
        [type, publicKey, fingerprint, manifest || {}]
      );

      const agent = result.rows[0];

      await db.query(
        `INSERT INTO audit_log (entity_type, entity_id, action, new_state, changed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        ['agent', agent.id, 'registered', { type, status: agent.status, keyId: fingerprint }, 'self']
      );

      return {
        agentId: agent.id,
        status: agent.status,
        keyId: fingerprint,
        registeredAt: agent.registered_at,
        _links: {
          self: { href: versionedHref(request, `/agents/${agent.id}`) },
          sessions: { href: versionedHref(request, '/sessions'), methods: ['POST'] },
        },
      };
    } catch (error) {
      app.log.error(error);
      reply.code(500);
      return { error: 'registration_failed', message: safeError(error, 'Registration failed') };
    }
  });

  /**
   * Get agent details by ID
   */
  app.get('/agents/:agentId', async (request, reply) => {
    const { agentId } = request.params;

    if (!isValidUUID(agentId)) {
      reply.code(400);
      return { error: 'invalid_parameter', message: 'Invalid agentId format. Expected UUID.' };
    }

    if (!db) {
      reply.code(503);
      return { error: 'database_unavailable' };
    }

    try {
      const result = await db.query('SELECT * FROM agents WHERE id = $1', [agentId]);
      if (result.rows.length === 0) {
        reply.code(404);
        return { error: 'not_found', message: 'Agent not found' };
      }

      const agent = result.rows[0];
      return {
        agentId: agent.id,
        type: agent.type,
        status: agent.status,
        keyId: agent.key_fingerprint,
        manifest: agent.manifest,
        registeredAt: agent.registered_at,
        lastSeenAt: agent.last_seen_at,
        _links: {
          self: { href: versionedHref(request, `/agents/${agent.id}`) },
          sessions: { href: versionedHref(request, '/sessions'), methods: ['POST'] },
        },
      };
    } catch (error) {
      reply.code(500);
      return { error: 'fetch_failed', message: safeError(error, 'Resource fetch failed') };
    }
  });

  /**
   * Revoke an agent's identity.
   *
   * Once revoked, the agent's public key is permanently blacklisted.
   * All future signed requests from this agent will be rejected with 403.
   * This is the enforcement mechanism for behavioral violations
   * (e.g., tit-for-tat protocol violations, market manipulation).
   *
   * SECURITY: Requires authenticated agent identity (Ed25519 signature).
   * Per DEC-015, agent revocation is a policy agent responsibility.
   * The calling agent must be authenticated via verifyAgent preHandler.
   */
  app.post('/agents/:agentId/revoke', { preHandler: verifyAgent }, async (request, reply) => {
    const { agentId } = request.params;
    const { reason } = request.body || {};

    if (!isValidUUID(agentId)) {
      reply.code(400);
      return { error: 'invalid_parameter', message: 'Invalid agentId format. Expected UUID.' };
    }

    if (!db) {
      reply.code(503);
      return { error: 'database_unavailable' };
    }

    try {
      const result = await db.query(
        `UPDATE agents SET status = 'revoked', revoked_at = NOW()
         WHERE id = $1 AND status != 'revoked'
         RETURNING id, status, revoked_at`,
        [agentId]
      );

      if (result.rows.length === 0) {
        reply.code(404);
        return { error: 'not_found', message: 'Agent not found or already revoked' };
      }

      const agent = result.rows[0];

      await db.query(
        `INSERT INTO audit_log (entity_type, entity_id, action, new_state, changed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        ['agent', agent.id, 'revoked', { status: 'revoked', reason: reason || 'unspecified' }, request.agent?.id || 'system']
      );

      return {
        agentId: agent.id,
        status: 'revoked',
        revokedAt: agent.revoked_at,
        _links: { self: { href: versionedHref(request, `/agents/${agent.id}`) } },
      };
    } catch (error) {
      reply.code(500);
      return { error: 'revocation_failed', message: safeError(error, 'Revocation failed') };
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

      // Structured activity logging
      request.log.info({
        event: 'beacon.registered',
        beaconId: beacon.id,
        externalId: beacon.external_id,
        name: beacon.name,
      });

      await db.query(
        `INSERT INTO audit_log (entity_type, entity_id, action, new_state, changed_by, request_id) VALUES ($1, $2, $3, $4, $5, $6)`,
        ['beacon', beacon.id, 'registered', { name: beacon.name, status: beacon.status }, 'system', request.requestId]
      );

      return {
        beaconId: beacon.id,
        externalId: beacon.external_id,
        name: beacon.name,
        status: beacon.status,
        capabilities: beacon.capabilities,
        _links: {
          self: { href: versionedHref(request, `/beacons/${beacon.id}`) },
          sessions: { href: versionedHref(request, '/beacons/sessions'), title: 'Poll for sessions to respond to' },
          submitOffer: { href: versionedHref(request, '/sessions/{sessionId}/offers'), methods: ['POST'] },
        },
      };
    } catch (error) {
      app.log.error(error);
      reply.code(500);
      return { error: 'registration_failed', message: safeError(error, 'Registration failed') };
    }
  });

  app.get('/beacons/:beaconId', async (request, reply) => {
    const { beaconId } = request.params;

    // beaconId can be a UUID (internal) or a string (external_id).
    // Validate length to prevent abuse — external IDs should be reasonable.
    if (!beaconId || beaconId.length > 255) {
      reply.code(400);
      return { error: 'invalid_parameter', message: 'Invalid beaconId format.' };
    }

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
        _links: { self: { href: versionedHref(request, `/beacons/${beacon.id}`) } },
      };
    } catch (error) {
      reply.code(500);
      return { error: 'fetch_failed', message: safeError(error, 'Resource fetch failed') };
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
      // Return sessions that are waiting for offers and have not expired
      const result = await db.query(
        `SELECT id, scout_id, status, raw_intent, parsed_intent, constraints, created_at
         FROM sessions
         WHERE status IN ('created', 'market_forming', 'collecting_offers')
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY created_at DESC
         LIMIT $1`,
        [parseInt(limit) || 20]
      );

      // Structured activity logging (at debug level)
      request.log.debug({
        event: 'beacon.poll',
        beaconId: request.query.beaconId,
        sessionCount: result.rows.length,
      });

      return {
        sessions: result.rows.map(s => {
          // SECURITY: Redact buyer constraints from beacon-facing endpoint.
          // Beacons see only the categories the session is looking for, not
          // the buyer's budget or delivery deadline (information asymmetry).
          const safeConstraints = s.constraints ? {
            categories: s.constraints.categories || [],
          } : {};

          return {
            sessionId: s.id,
            status: s.status,
            intent: { raw: s.raw_intent, parsed: s.parsed_intent },
            constraints: safeConstraints,
            createdAt: s.created_at,
            _links: {
              submitOffer: { href: versionedHref(request, `/sessions/${s.id}/offers`), methods: ['POST'] },
            },
          };
        }),
        _links: { self: { href: versionedHref(request, '/beacons/sessions') } },
      };
    } catch (error) {
      reply.code(500);
      return { error: 'fetch_failed', message: safeError(error, 'Resource fetch failed') };
    }
  });

  // =============================================================================
  // Session Endpoints (Core Commerce Flow)
  // =============================================================================

  app.post('/sessions', { preHandler: verifyAgent }, async (request, reply) => {
    const { intent, constraints } = request.body || {};

    if (!intent) {
      reply.code(400);
      return { error: 'missing_intent', message: 'Please provide an intent describing what you want' };
    }

    // Input validation: intent must be a reasonable string
    if (typeof intent !== 'string' || intent.length > 2000) {
      reply.code(400);
      return { error: 'invalid_intent', message: 'Intent must be a string under 2000 characters' };
    }

    // Constraints must be a plain object if provided
    if (constraints !== undefined && constraints !== null) {
      if (typeof constraints !== 'object' || Array.isArray(constraints)) {
        reply.code(400);
        return { error: 'invalid_constraints', message: 'Constraints must be a JSON object' };
      }
      // Cap constraints size to prevent abuse
      const constraintsStr = JSON.stringify(constraints);
      if (constraintsStr.length > 10000) {
        reply.code(400);
        return { error: 'invalid_constraints', message: 'Constraints object too large (max 10KB)' };
      }
    }

    if (!db) {
      reply.code(503);
      return { error: 'database_unavailable' };
    }

    // Agent identity comes from Ed25519 signature verification (verifyAgent preHandler).
    // request.agent is set by createSignatureVerifier — contains { id, status }.
    // No more accepting scoutId/agentId from the request body.
    const authenticatedAgentId = request.agent?.id || null;

    try {
      // Parse intent using structured extraction (Alpha — regex-based, no LLM)
      // Phase 2 will replace with Granite LLM via Replicate
      const parsedIntent = parseIntent(intent, constraints);

      const result = await db.query(
        `INSERT INTO sessions (agent_id, status, raw_intent, parsed_intent, constraints)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, status, created_at`,
        [authenticatedAgentId, 'collecting_offers', intent, parsedIntent, constraints || {}]
      );

      const session = result.rows[0];

      // Match registered beacons against parsed intent
      const matchedBeacons = await matchBeacons(db, parsedIntent);

      // Store matched beacon IDs in session context
      if (matchedBeacons.length > 0) {
        await db.query(
          `UPDATE sessions SET context = $1 WHERE id = $2`,
          [{ matched_beacons: matchedBeacons.map(b => ({ id: b.beaconId, name: b.name, score: b.score })) }, session.id]
        );
      }

      // Structured activity logging
      request.log.info({
        event: 'session.created',
        sessionId: session.id,
        agentId: authenticatedAgentId,
        intent: parsedIntent,
      });

      await db.query(
        `INSERT INTO audit_log (entity_type, entity_id, action, new_state, changed_by, request_id) VALUES ($1, $2, $3, $4, $5, $6)`,
        ['session', session.id, 'created', { status: 'collecting_offers', intent, matchedBeacons: matchedBeacons.length, agentId: authenticatedAgentId }, authenticatedAgentId || 'anonymous', request.requestId]
      );

      return {
        sessionId: session.id,
        status: 'collecting_offers',
        intent: parsedIntent,
        matchedBeacons: matchedBeacons.map(b => ({
          beaconId: b.beaconId,
          name: b.name,
          score: b.score,
        })),
        _links: {
          self: { href: versionedHref(request, `/sessions/${session.id}`) },
          offers: { href: versionedHref(request, `/sessions/${session.id}/offers`) },
          cancel: { href: versionedHref(request, `/sessions/${session.id}/cancel`), methods: ['POST'] },
        },
      };
    } catch (error) {
      app.log.error(error);
      reply.code(500);
      return { error: 'session_creation_failed', message: safeError(error, 'Session creation failed') };
    }
  });

  app.get('/sessions/:sessionId', async (request, reply) => {
    const { sessionId } = request.params;

    // SECURITY: Validate UUID format
    if (!isValidUUID(sessionId)) {
      reply.code(400);
      return { error: 'invalid_parameter', message: 'Invalid sessionId format. Expected UUID.' };
    }

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

      // SECURITY: Enforce session expiry — auto-expire stale sessions
      if (session.expires_at && new Date(session.expires_at) < new Date() &&
          !['completed', 'cancelled', 'expired'].includes(session.status)) {
        await db.query('UPDATE sessions SET status = $1 WHERE id = $2', ['expired', sessionId]);
        session.status = 'expired';
      }

      // Check if there are offers
      const offersResult = await db.query(
        'SELECT COUNT(*) as count FROM offers WHERE session_id = $1 AND status = $2',
        [sessionId, 'pending']
      );
      const hasOffers = parseInt(offersResult.rows[0].count) > 0;

      // Update status if offers are available
      let status = session.status;
      if (hasOffers && (status === 'market_forming' || status === 'collecting_offers')) {
        status = 'offers_available';
        await db.query('UPDATE sessions SET status = $1 WHERE id = $2', [status, sessionId]);
      }

      const links = {
        self: { href: versionedHref(request, `/sessions/${sessionId}`) },
        cancel: { href: versionedHref(request, `/sessions/${sessionId}/cancel`), methods: ['POST'] },
      };

      if (hasOffers || status === 'offers_available') {
        links.offers = { href: versionedHref(request, `/sessions/${sessionId}/offers`) };
        links.commit = { href: versionedHref(request, `/sessions/${sessionId}/commit`), methods: ['POST'] };
      }

      // If committed, look up the transaction ID
      let transactionId = null;
      if (status === 'committed' || status === 'fulfilled' || status === 'completed') {
        const txResult = await db.query('SELECT id FROM transactions WHERE session_id = $1 LIMIT 1', [sessionId]);
        if (txResult.rows.length > 0) {
          transactionId = txResult.rows[0].id;
          links.transaction = { href: versionedHref(request, `/transactions/${transactionId}`) };
        }
      }

      return {
        sessionId: session.id,
        status,
        transactionId,
        intent: session.parsed_intent,
        rawIntent: session.raw_intent,
        constraints: session.constraints,
        context: session.context,
        createdAt: session.created_at,
        _links: links,
      };
    } catch (error) {
      reply.code(500);
      return { error: 'fetch_failed', message: safeError(error, 'Resource fetch failed') };
    }
  });

  // =============================================================================
  // Offer Endpoints
  // =============================================================================

  // Beacon submits an offer to a session
  app.post('/sessions/:sessionId/offers', { preHandler: verifyAgent }, async (request, reply) => {
    const { sessionId } = request.params;
    const { beaconId, product, unitPrice, quantity, totalPrice, currency, deliveryDate, terms, metadata } = request.body || {};

    // SECURITY: Validate UUID format for sessionId
    if (!isValidUUID(sessionId)) {
      reply.code(400);
      return { error: 'invalid_parameter', message: 'Invalid sessionId format. Expected UUID.' };
    }

    if (!db) {
      reply.code(503);
      return { error: 'database_unavailable' };
    }

    if (!beaconId || !product) {
      reply.code(400);
      return { error: 'missing_fields', message: 'beaconId and product are required' };
    }

    // Normalise product: column is JSONB, so wrap plain strings
    const productJsonb = typeof product === 'string' ? { name: product } : product;

    // SECURITY: Validate price and quantity are positive
    if (typeof unitPrice === 'number' && unitPrice < 0) {
      reply.code(400);
      return { error: 'invalid_price', message: 'unitPrice must be a positive number' };
    }
    if (typeof quantity === 'number' && quantity < 1) {
      reply.code(400);
      return { error: 'invalid_quantity', message: 'quantity must be a positive integer' };
    }

    try {
      // ATOMIC: Acquire a dedicated client for the transaction
      const client = await db.connect();
      let offer, beacon;

      try {
        await client.query('BEGIN');

        // Lock session to prevent concurrent state changes
        const sessionResult = await client.query(
          'SELECT * FROM sessions WHERE id = $1 FOR UPDATE',
          [sessionId]
        );
        if (sessionResult.rows.length === 0) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { error: 'session_not_found' };
        }

        const session = sessionResult.rows[0];

        // SECURITY: Reject offers to expired sessions
        if (session.expires_at && new Date(session.expires_at) < new Date()) {
          await client.query('UPDATE sessions SET status = $1 WHERE id = $2', ['expired', sessionId]);
          await client.query('COMMIT');
          reply.code(400);
          return { error: 'session_expired', message: 'Session has expired and is no longer accepting offers' };
        }

        if (!['created', 'market_forming', 'collecting_offers', 'offers_available'].includes(session.status)) {
          await client.query('ROLLBACK');
          reply.code(400);
          return { error: 'session_not_accepting_offers', message: `Session status is ${session.status}` };
        }

        // Verify beacon exists
        const beaconResult = await client.query('SELECT * FROM beacons WHERE id::text = $1 OR external_id = $1', [beaconId]);
        if (beaconResult.rows.length === 0) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { error: 'beacon_not_found' };
        }
        beacon = beaconResult.rows[0];

        // SECURITY: Reject offers from inactive/suspended beacons
        if (beacon.status !== 'active') {
          await client.query('ROLLBACK');
          reply.code(403);
          return { error: 'beacon_inactive', message: `Beacon status is ${beacon.status}` };
        }

        // Calculate total if not provided
        const calculatedTotal = totalPrice || (unitPrice * quantity);

        const result = await client.query(
          `INSERT INTO offers (session_id, beacon_id, product, unit_price, quantity, total_price, currency, delivery_date, terms, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id, status, created_at`,
          [sessionId, beacon.id, productJsonb, unitPrice, quantity, calculatedTotal, currency || 'USD', deliveryDate, terms || {}, metadata || {}]
        );

        offer = result.rows[0];

        // Update session status atomically
        await client.query('UPDATE sessions SET status = $1 WHERE id = $2', ['offers_available', sessionId]);

        await client.query('COMMIT');
      } catch (innerError) {
        await client.query('ROLLBACK').catch(() => {});
        throw innerError;
      } finally {
        client.release();
      }

      // Structured activity logging (outside transaction)
      request.log.info({
        event: 'offer.submitted',
        sessionId,
        offerId: offer.id,
        beaconId: beacon.id,
        unitPrice,
        quantity,
      });

      return {
        offerId: offer.id,
        sessionId,
        beaconId: beacon.id,
        status: offer.status,
        createdAt: offer.created_at,
        _links: {
          self: { href: versionedHref(request, `/sessions/${sessionId}/offers/${offer.id}`) },
          session: { href: versionedHref(request, `/sessions/${sessionId}`) },
        },
      };
    } catch (error) {
      app.log.error(error);
      reply.code(500);
      return { error: 'offer_submission_failed', message: safeError(error, 'Offer submission failed') };
    }
  });

  // Scout retrieves offers for a session
  app.get('/sessions/:sessionId/offers', async (request, reply) => {
    const { sessionId } = request.params;

    // SECURITY: Validate UUID format
    if (!isValidUUID(sessionId)) {
      reply.code(400);
      return { error: 'invalid_parameter', message: 'Invalid sessionId format. Expected UUID.' };
    }

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
          self: { href: versionedHref(request, `/sessions/${sessionId}/offers`) },
          session: { href: versionedHref(request, `/sessions/${sessionId}`) },
          commit: { href: versionedHref(request, `/sessions/${sessionId}/commit`), methods: ['POST'] },
        },
      };
    } catch (error) {
      reply.code(500);
      return { error: 'fetch_failed', message: safeError(error, 'Resource fetch failed') };
    }
  });

  // =============================================================================
  // Transaction Commitment
  // =============================================================================

  app.post('/sessions/:sessionId/commit', { preHandler: verifyAgent }, async (request, reply) => {
    const { sessionId } = request.params;
    const { offerId, idempotencyKey } = request.body || {};

    // SECURITY: Validate UUID format
    if (!isValidUUID(sessionId)) {
      reply.code(400);
      return { error: 'invalid_parameter', message: 'Invalid sessionId format. Expected UUID.' };
    }

    if (!db) {
      reply.code(503);
      return { error: 'database_unavailable' };
    }

    if (!offerId) {
      reply.code(400);
      return { error: 'missing_offer_id', message: 'offerId is required' };
    }

    // SECURITY: Idempotency key is mandatory for transaction commits
    if (!idempotencyKey) {
      reply.code(400);
      return { error: 'missing_idempotency_key', message: 'idempotencyKey is required for transaction commits. Generate a UUID v4 client-side.' };
    }

    // SECURITY: Validate idempotency key format (must be UUID)
    if (!isValidUUID(idempotencyKey)) {
      reply.code(400);
      return { error: 'invalid_idempotency_key', message: 'idempotencyKey must be a valid UUID v4.' };
    }

    // SECURITY: Validate offerId is UUID
    if (!isValidUUID(offerId)) {
      reply.code(400);
      return { error: 'invalid_parameter', message: 'Invalid offerId format. Expected UUID.' };
    }

    try {
      // TRUE IDEMPOTENCY: If idempotency key provided, return existing transaction
      if (idempotencyKey) {
        const existing = await db.query(
          `SELECT t.*, b.name as beacon_name
           FROM transactions t JOIN beacons b ON t.beacon_id = b.id
           WHERE t.idempotency_key = $1`,
          [idempotencyKey]
        );
        if (existing.rows.length > 0) {
          const tx = existing.rows[0];
          return {
            transactionId: tx.id,
            sessionId: tx.session_id,
            offerId: tx.offer_id,
            beaconId: tx.beacon_id,
            beaconName: tx.beacon_name,
            status: tx.status,
            finalTerms: tx.final_terms,
            createdAt: tx.created_at,
            _links: {
              self: { href: versionedHref(request, `/transactions/${tx.id}`) },
              session: { href: versionedHref(request, `/sessions/${tx.session_id}`) },
            },
          };
        }
      }

      // ATOMIC COMMIT: Acquire a dedicated client for the transaction
      const client = await db.connect();
      let transaction, offer, session;

      try {
        await client.query('BEGIN');

        // Lock the session row — serializes concurrent commits
        const sessionResult = await client.query(
          'SELECT * FROM sessions WHERE id = $1 FOR UPDATE',
          [sessionId]
        );
        if (sessionResult.rows.length === 0) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { error: 'session_not_found' };
        }

        session = sessionResult.rows[0];

        // SECURITY: Reject commits to expired sessions
        if (session.expires_at && new Date(session.expires_at) < new Date() &&
            !['committed', 'completed'].includes(session.status)) {
          await client.query('UPDATE sessions SET status = $1 WHERE id = $2', ['expired', sessionId]);
          await client.query('COMMIT');
          reply.code(400);
          return { error: 'session_expired', message: 'Session has expired' };
        }

        // SECURITY: Reject if already committed (after acquiring lock)
        if (session.status === 'committed' || session.status === 'completed' || session.status === 'cancelled') {
          await client.query('ROLLBACK');
          reply.code(400);
          return { error: 'session_not_committable', message: `Session status is ${session.status}` };
        }

        // Lock the offer row too
        const offerResult = await client.query(
          'SELECT o.*, b.name as beacon_name, b.endpoint_url as beacon_endpoint_url FROM offers o JOIN beacons b ON o.beacon_id = b.id WHERE o.id = $1 AND o.session_id = $2 FOR UPDATE OF o',
          [offerId, sessionId]
        );
        if (offerResult.rows.length === 0) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { error: 'offer_not_found' };
        }

        offer = offerResult.rows[0];

        // Create transaction (atomic with session/offer updates)
        // Use agent_id from the authenticated request; fall back to session's agent_id or legacy scout_id
        const commitAgentId = request.agent?.id || session.agent_id || null;
        const txResult = await client.query(
          `INSERT INTO transactions (session_id, offer_id, beacon_id, agent_id, scout_id, status, final_terms, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, status, created_at`,
          [sessionId, offerId, offer.beacon_id, commitAgentId, session.scout_id, 'committed', {
            product: offer.product,
            totalPrice: offer.total_price,
            currency: offer.currency,
            deliveryDate: offer.delivery_date,
            terms: offer.terms,
          }, idempotencyKey]
        );

        transaction = txResult.rows[0];

        // Update session and offer status — all within the same transaction
        await client.query('UPDATE sessions SET status = $1 WHERE id = $2', ['committed', sessionId]);
        await client.query('UPDATE offers SET status = $1 WHERE id = $2', ['accepted', offerId]);
        await client.query('UPDATE offers SET status = $1 WHERE session_id = $2 AND id != $3', ['rejected', sessionId, offerId]);

        // Audit log — inside the transaction for consistency
        await client.query(
          `INSERT INTO audit_log (entity_type, entity_id, action, new_state, changed_by, request_id) VALUES ($1, $2, $3, $4, $5, $6)`,
          ['transaction', transaction.id, 'committed', { offerId, beaconId: offer.beacon_id, agentId: commitAgentId }, commitAgentId || session.scout_id || 'anonymous', request.requestId]
        );

        await client.query('COMMIT');
      } catch (innerError) {
        await client.query('ROLLBACK').catch(() => {});
        throw innerError;
      } finally {
        client.release();
      }

      // Structured activity logging (outside transaction)
      request.log.info({
        event: 'session.committed',
        sessionId,
        offerId,
        transactionId: transaction.id,
      });

      // Dispatch webhook to beacon (fire-and-forget, outside transaction)
      if (offer.beacon_endpoint_url) {
        dispatchWebhook(
          { id: offer.beacon_id, endpoint_url: offer.beacon_endpoint_url, name: offer.beacon_name },
          'transaction.committed',
          {
            transactionId: transaction.id,
            sessionId,
            offerId,
            finalTerms: {
              product: offer.product,
              totalPrice: parseFloat(offer.total_price),
              currency: offer.currency,
              deliveryDate: offer.delivery_date,
            },
          },
          app.log
        );
      }

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
          self: { href: versionedHref(request, `/transactions/${transaction.id}`) },
          session: { href: versionedHref(request, `/sessions/${sessionId}`) },
        },
      };
    } catch (error) {
      app.log.error(error);
      if (error.code === '23505') { // unique constraint violation (idempotency key race)
        // Another request won the race — look up and return the existing transaction
        if (idempotencyKey) {
          const existing = await db.query(
            `SELECT t.*, b.name as beacon_name
             FROM transactions t JOIN beacons b ON t.beacon_id = b.id
             WHERE t.idempotency_key = $1`,
            [idempotencyKey]
          );
          if (existing.rows.length > 0) {
            const tx = existing.rows[0];
            return {
              transactionId: tx.id, sessionId: tx.session_id, offerId: tx.offer_id,
              beaconId: tx.beacon_id, beaconName: tx.beacon_name,
              status: tx.status, finalTerms: tx.final_terms, createdAt: tx.created_at,
              _links: { self: { href: versionedHref(request, `/transactions/${tx.id}`) }, session: { href: versionedHref(request, `/sessions/${tx.session_id}`) } },
            };
          }
        }
        reply.code(409);
        return { error: 'duplicate_transaction', message: 'Transaction with this idempotency key already exists' };
      }
      reply.code(500);
      return { error: 'commit_failed', message: safeError(error, 'Transaction commit failed') };
    }
  });

  // Cancel session
  app.post('/sessions/:sessionId/cancel', async (request, reply) => {
    const { sessionId } = request.params;

    // SECURITY: Validate UUID format
    if (!isValidUUID(sessionId)) {
      reply.code(400);
      return { error: 'invalid_parameter', message: 'Invalid sessionId format. Expected UUID.' };
    }

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
        _links: { self: { href: versionedHref(request, `/sessions/${sessionId}`) } },
      };
    } catch (error) {
      reply.code(500);
      return { error: 'cancel_failed', message: safeError(error, 'Cancellation failed') };
    }
  });

  // =============================================================================
  // Transaction Endpoints
  // =============================================================================

  // Get transaction details (Scout or Beacon can query)
  app.get('/transactions/:transactionId', async (request, reply) => {
    const { transactionId } = request.params;

    if (!isValidUUID(transactionId)) {
      reply.code(400);
      return { error: 'invalid_parameter', message: 'Invalid transactionId format. Expected UUID.' };
    }

    if (!db) {
      reply.code(503);
      return { error: 'database_unavailable' };
    }

    try {
      const result = await db.query(
        `SELECT t.*, b.name as beacon_name, b.external_id as beacon_external_id
         FROM transactions t
         JOIN beacons b ON t.beacon_id = b.id
         WHERE t.id = $1`,
        [transactionId]
      );

      if (result.rows.length === 0) {
        reply.code(404);
        return { error: 'not_found', message: 'Transaction not found' };
      }

      const tx = result.rows[0];

      return {
        transactionId: tx.id,
        sessionId: tx.session_id,
        offerId: tx.offer_id,
        beaconId: tx.beacon_id,
        beaconName: tx.beacon_name,
        agentId: tx.agent_id || tx.scout_id,
        scoutId: tx.scout_id,  // Legacy — use agentId
        status: tx.status,
        finalTerms: tx.final_terms,
        paymentStatus: tx.payment_status,
        paymentReference: tx.payment_reference,
        fulfillmentStatus: tx.fulfillment_status,
        fulfillmentReference: tx.fulfillment_reference,
        createdAt: tx.created_at,
        updatedAt: tx.updated_at,
        completedAt: tx.completed_at,
        _links: {
          self: { href: versionedHref(request, `/transactions/${tx.id}`) },
          session: { href: versionedHref(request, `/sessions/${tx.session_id}`) },
          fulfillment: { href: versionedHref(request, `/transactions/${tx.id}/fulfillment`), methods: ['PUT'] },
          payment: { href: versionedHref(request, `/transactions/${tx.id}/payment`), methods: ['PUT'] },
        },
      };
    } catch (error) {
      app.log.error(error);
      reply.code(500);
      return { error: 'fetch_failed', message: safeError(error, 'Resource fetch failed') };
    }
  });

  // Beacon reports fulfillment status
  app.put('/transactions/:transactionId/fulfillment', { preHandler: verifyAgent }, async (request, reply) => {
    const { transactionId } = request.params;
    const { fulfillmentStatus, fulfillmentReference, metadata } = request.body || {};

    if (!isValidUUID(transactionId)) {
      reply.code(400);
      return { error: 'invalid_parameter', message: 'Invalid transactionId format. Expected UUID.' };
    }

    if (!fulfillmentStatus) {
      reply.code(400);
      return { error: 'missing_fields', message: 'fulfillmentStatus is required' };
    }

    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'failed'];
    if (!validStatuses.includes(fulfillmentStatus)) {
      reply.code(400);
      return { error: 'invalid_status', message: `fulfillmentStatus must be one of: ${validStatuses.join(', ')}` };
    }

    if (!db) {
      reply.code(503);
      return { error: 'database_unavailable' };
    }

    try {
      // ATOMIC: Lock transaction row to prevent concurrent fulfillment/payment races
      const client = await db.connect();
      let tx, newStatus;

      try {
        await client.query('BEGIN');

        const txResult = await client.query(
          'SELECT * FROM transactions WHERE id = $1 FOR UPDATE',
          [transactionId]
        );
        if (txResult.rows.length === 0) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { error: 'not_found', message: 'Transaction not found' };
        }

        tx = txResult.rows[0];

        // Auto-transition transaction status
        newStatus = tx.status;
        if (fulfillmentStatus === 'delivered') {
          // Also check if payment already charged → completed
          newStatus = tx.payment_status === 'charged' ? 'completed' : 'fulfilled';
        }

        await client.query(
          `UPDATE transactions
           SET fulfillment_status = $1, fulfillment_reference = $2,
               status = $3, updated_at = NOW()
           WHERE id = $4`,
          [fulfillmentStatus, fulfillmentReference || null, newStatus, transactionId]
        );

        // Audit log inside transaction
        await client.query(
          `INSERT INTO audit_log (entity_type, entity_id, action, previous_state, new_state, changed_by, request_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          ['transaction', transactionId, 'fulfillment_updated',
           { fulfillmentStatus: tx.fulfillment_status, status: tx.status },
           { fulfillmentStatus, status: newStatus },
           tx.beacon_id,
           request.requestId]
        );

        await client.query('COMMIT');
      } catch (innerError) {
        await client.query('ROLLBACK').catch(() => {});
        throw innerError;
      } finally {
        client.release();
      }

      // Structured activity logging (outside transaction)
      request.log.info({
        event: 'fulfillment.updated',
        transactionId,
        status: fulfillmentStatus,
      });

      // Dispatch webhook (fire-and-forget, outside transaction)
      const beaconResult = await db.query('SELECT id, endpoint_url, name FROM beacons WHERE id = $1', [tx.beacon_id]);
      if (beaconResult.rows.length > 0) {
        dispatchWebhook(beaconResult.rows[0], 'fulfillment.updated', {
          transactionId,
          sessionId: tx.session_id,
          fulfillmentStatus,
          fulfillmentReference: fulfillmentReference || null,
          status: newStatus,
        }, app.log);
      }

      return {
        transactionId,
        status: newStatus,
        fulfillmentStatus,
        fulfillmentReference: fulfillmentReference || null,
        updatedAt: new Date().toISOString(),
        _links: {
          self: { href: versionedHref(request, `/transactions/${transactionId}`) },
          session: { href: versionedHref(request, `/sessions/${tx.session_id}`) },
        },
      };
    } catch (error) {
      app.log.error(error);
      reply.code(500);
      return { error: 'update_failed', message: safeError(error, 'Update failed') };
    }
  });

  // Beacon or payment processor reports payment status
  app.put('/transactions/:transactionId/payment', { preHandler: verifyAgent }, async (request, reply) => {
    const { transactionId } = request.params;
    const { paymentStatus, paymentReference, amount, currency } = request.body || {};

    if (!isValidUUID(transactionId)) {
      reply.code(400);
      return { error: 'invalid_parameter', message: 'Invalid transactionId format. Expected UUID.' };
    }

    if (!paymentStatus) {
      reply.code(400);
      return { error: 'missing_fields', message: 'paymentStatus is required' };
    }

    const validStatuses = ['pending', 'authorized', 'charged', 'refunded', 'failed'];
    if (!validStatuses.includes(paymentStatus)) {
      reply.code(400);
      return { error: 'invalid_status', message: `paymentStatus must be one of: ${validStatuses.join(', ')}` };
    }

    if (!db) {
      reply.code(503);
      return { error: 'database_unavailable' };
    }

    try {
      // ATOMIC: Lock transaction row to prevent concurrent payment/fulfillment races
      const client = await db.connect();
      let tx, newStatus;

      try {
        await client.query('BEGIN');

        const txResult = await client.query(
          'SELECT * FROM transactions WHERE id = $1 FOR UPDATE',
          [transactionId]
        );
        if (txResult.rows.length === 0) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { error: 'not_found', message: 'Transaction not found' };
        }

        tx = txResult.rows[0];

        // Auto-transition: if fulfilled + charged → completed
        newStatus = tx.status;
        if (paymentStatus === 'charged' && tx.fulfillment_status === 'delivered') {
          newStatus = 'completed';
        }

        await client.query(
          `UPDATE transactions
           SET payment_status = $1, payment_reference = $2,
               status = $3, updated_at = NOW()
           WHERE id = $4`,
          [paymentStatus, paymentReference || null, newStatus, transactionId]
        );

        // Audit log inside transaction
        await client.query(
          `INSERT INTO audit_log (entity_type, entity_id, action, previous_state, new_state, changed_by, request_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          ['transaction', transactionId, 'payment_updated',
           { paymentStatus: tx.payment_status, status: tx.status },
           { paymentStatus, status: newStatus },
           tx.beacon_id,
           request.requestId]
        );

        await client.query('COMMIT');
      } catch (innerError) {
        await client.query('ROLLBACK').catch(() => {});
        throw innerError;
      } finally {
        client.release();
      }

      // Dispatch webhook (fire-and-forget, outside transaction)
      const beaconResult = await db.query('SELECT id, endpoint_url, name FROM beacons WHERE id = $1', [tx.beacon_id]);
      if (beaconResult.rows.length > 0) {
        dispatchWebhook(beaconResult.rows[0], 'payment.updated', {
          transactionId,
          sessionId: tx.session_id,
          paymentStatus,
          paymentReference: paymentReference || null,
          status: newStatus,
        }, app.log);
      }

      return {
        transactionId,
        status: newStatus,
        paymentStatus,
        paymentReference: paymentReference || null,
        updatedAt: new Date().toISOString(),
        _links: {
          self: { href: versionedHref(request, `/transactions/${transactionId}`) },
          session: { href: versionedHref(request, `/sessions/${tx.session_id}`) },
        },
      };
    } catch (error) {
      app.log.error(error);
      reply.code(500);
      return { error: 'update_failed', message: safeError(error, 'Update failed') };
    }
  });

  // =============================================================================
  // WebSocket Endpoints (keeping for future real-time support)
  // =============================================================================

  // SECURITY: WebSocket payload size limit (64 KB)
  const WS_MAX_PAYLOAD = 64 * 1024;

  app.get('/ws/scout', { websocket: true }, (connection) => {
    // SECURITY: Close connections that send oversized payloads
    connection.socket._socket?.setMaxListeners?.(20);

    connection.socket.on('message', (message) => {
      const raw = message.toString();

      // SECURITY: Reject oversized payloads
      if (raw.length > WS_MAX_PAYLOAD) {
        connection.socket.send(JSON.stringify({ type: 'error', message: 'Payload too large' }));
        connection.socket.close(1009, 'Payload too large');
        return;
      }

      // SECURITY: Safe JSON parsing — don't crash on malformed input
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        connection.socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        return;
      }

      app.log.info({ type: 'scout_message', messageType: data?.type });
      // SECURITY: Don't echo back raw user data — only acknowledge with type
      connection.socket.send(JSON.stringify({ type: 'ack', messageType: data?.type }));
    });
    connection.socket.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to AURA Core as Scout',
      note: 'WebSocket support is for future real-time updates. Use REST API for MVP.',
    }));
  });

  app.get('/ws/beacon', { websocket: true }, (connection) => {
    connection.socket.on('message', (message) => {
      const raw = message.toString();

      // SECURITY: Reject oversized payloads
      if (raw.length > WS_MAX_PAYLOAD) {
        connection.socket.send(JSON.stringify({ type: 'error', message: 'Payload too large' }));
        connection.socket.close(1009, 'Payload too large');
        return;
      }

      // SECURITY: Safe JSON parsing
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        connection.socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        return;
      }

      app.log.info({ type: 'beacon_message', messageType: data?.type });
      // SECURITY: Don't echo back raw user data
      connection.socket.send(JSON.stringify({ type: 'ack', messageType: data?.type }));
    });
    connection.socket.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to AURA Core as Beacon',
      note: 'WebSocket support is for future real-time updates. Use REST API for MVP.',
    }));
  });
}

// Register versioned routes
app.register(businessRoutesV1, { prefix: '/v1' });

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
