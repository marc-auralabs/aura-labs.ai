/**
 * AURA Core API
 *
 * Thin orchestrator — initializes Fastify, registers plugins and middleware,
 * then delegates all business logic to domain-aligned route modules.
 *
 * Domain mapping (see COMPONENT_REGISTRY.md):
 *   Client Integration & Mgmt → routes/agents.js, routes/beacons.js
 *   Market Navigation          → routes/sessions.js, routes/offers.js
 *   Transaction Services       → routes/transactions.js
 *   Message Routing            → routes/websockets.js
 *   Network Health             → routes/health.js
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import pg from 'pg';

// Internal libraries
import {
  verifyRegistrationSignature,
  computeKeyFingerprint,
  createSignatureVerifier,
  validateRedirectUrl,
} from './lib/agent-auth.js';
import { parseIntent } from './lib/intent-parser.js';
import { matchBeacons } from './lib/beacon-matcher.js';
import { dispatchWebhook } from './lib/webhook-dispatcher.js';
import { safeError, versionedHref, isValidUUID } from './lib/shared.js';

// Route modules
import { registerDevRoutes } from './routes/dev.js';
import { registerMiddleware } from './routes/middleware.js';
import { registerHealthRoutes } from './routes/health.js';
import { runMigrations } from './routes/migrations.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerBeaconRoutes } from './routes/beacons.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerOfferRoutes } from './routes/offers.js';
import { registerTransactionRoutes } from './routes/transactions.js';
import { registerWebSocketRoutes } from './routes/websockets.js';

const { Pool } = pg;

// =============================================================================
// Configuration
// =============================================================================

const config = {
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
};

// =============================================================================
// Database Connection Pool
// =============================================================================

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

// =============================================================================
// Fastify Initialization
// =============================================================================

const app = Fastify({
  logger: {
    level: config.env === 'production' ? 'info' : 'debug',
  },
});

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
// Cross-Cutting Middleware & Dev Routes
// =============================================================================

registerMiddleware(app, config);

// Agent signature verifier — validates Ed25519 signatures on protected endpoints
// Skips gracefully if no auth headers present (backward compat)
const verifyAgent = createSignatureVerifier(db);

// Register development routes (test runners, etc.)
registerDevRoutes(app, config);

// =============================================================================
// Unversioned Routes (health, root)
// =============================================================================

registerHealthRoutes(app, db, config);

// API Root - Version Discovery Entry Point
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

// Shared dependencies passed to all route modules via Fastify plugin opts
const sharedOpts = {
  db,
  config,
  verifyAgent,
  verifyRegistrationSignature,
  computeKeyFingerprint,
  safeError,
  versionedHref,
  isValidUUID,
  parseIntent,
  matchBeacons,
  dispatchWebhook,
};

async function businessRoutesV1(app, opts) {
  // UUID validation hook (applies to all v1 business routes)
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

  // Domain: Client Integration & Management
  await app.register(registerAgentRoutes, sharedOpts);
  await app.register(registerBeaconRoutes, sharedOpts);

  // Domain: Market Navigation
  await app.register(registerSessionRoutes, sharedOpts);
  await app.register(registerOfferRoutes, sharedOpts);

  // Domain: Transaction Services
  await app.register(registerTransactionRoutes, sharedOpts);

  // Domain: Message Routing
  await app.register(registerWebSocketRoutes, sharedOpts);
}

// Register versioned routes
app.register(businessRoutesV1, { prefix: '/v1' });

// =============================================================================
// Start Server
// =============================================================================

try {
  await runMigrations(db);
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
