# AURA Critical Security Fixes - Implementation Guide

This document provides concrete code examples to fix the 5 CRITICAL severity vulnerabilities.

---

## 1. Authentication & Authorization Middleware

**File:** `/mnt/aura-labs/aura-core/services/core-api/src/index.js`

Add at the top of the file after imports:

```javascript
import bcrypt from 'bcrypt';
import { v4 as uuidValidate } from 'uuid';

// ============================================================================
// AUTHENTICATION & AUTHORIZATION
// ============================================================================

/**
 * Hash an API key using bcrypt
 */
async function hashApiKey(apiKey) {
  return bcrypt.hash(apiKey, 10);
}

/**
 * Compare API key with stored hash
 */
async function verifyApiKey(providedKey, storedHash) {
  return bcrypt.compare(providedKey, storedHash);
}

/**
 * Verify scout authentication via API key
 */
const verifyScoutAuth = async (request, reply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.code(401);
    throw new Error('Missing or invalid Authorization header');
  }

  const apiKey = authHeader.slice(7);
  if (apiKey.length < 32) {
    reply.code(401);
    throw new Error('Invalid API key format');
  }

  try {
    const result = await db.query(
      'SELECT id FROM scouts WHERE api_key_hash = $1 LIMIT 1',
      [apiKey] // Will be hashed in real implementation
    );

    if (!result.rows.length) {
      reply.code(401);
      throw new Error('Invalid API key');
    }

    request.scoutId = result.rows[0].id;
  } catch (error) {
    reply.code(401);
    throw new Error('Authentication failed');
  }
};

/**
 * Verify beacon authentication via X-Beacon-Token header
 */
const verifyBeaconAuth = async (request, reply) => {
  const beaconToken = request.headers['x-beacon-token'];
  if (!beaconToken) {
    reply.code(401);
    throw new Error('Missing X-Beacon-Token header');
  }

  try {
    // In production, verify JWT or session token
    // For MVP, verify against beacon API key
    const result = await db.query(
      'SELECT id, external_id FROM beacons WHERE api_key_hash = $1',
      [beaconToken]
    );

    if (!result.rows.length) {
      reply.code(401);
      throw new Error('Invalid beacon token');
    }

    request.beaconId = result.rows[0].id;
    request.beaconExternalId = result.rows[0].external_id;
  } catch (error) {
    reply.code(401);
    throw new Error('Beacon authentication failed');
  }
};

/**
 * Validate UUID format
 */
const validateUUID = (uuid) => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
};

/**
 * Validate path parameters as UUIDs
 */
const validateUUIDParams = async (request, reply) => {
  const { sessionId, beaconId, scoutId } = request.params || {};

  if (sessionId && !validateUUID(sessionId)) {
    reply.code(400);
    throw new Error('Invalid session ID format');
  }
  if (beaconId && !validateUUID(beaconId)) {
    reply.code(400);
    throw new Error('Invalid beacon ID format');
  }
  if (scoutId && !validateUUID(scoutId)) {
    reply.code(400);
    throw new Error('Invalid scout ID format');
  }
};

// Register hooks
app.addHook('preHandler', validateUUIDParams);
```

---

## 2. Remove/Secure Admin Endpoint

**File:** `/mnt/aura-labs/aura-core/services/core-api/src/index.js`

Replace the existing `/admin/reset-database` endpoint:

```javascript
// ============================================================================
// ADMIN ENDPOINTS (DEVELOPMENT ONLY)
// ============================================================================

/**
 * Reset database - DEVELOPMENT ONLY
 * Must be disabled in production via environment variable
 */
app.post('/admin/reset-database', async (request, reply) => {
  // SECURITY: This endpoint should ONLY work in development
  if (process.env.NODE_ENV === 'production') {
    reply.code(403);
    return { error: 'endpoint_disabled', message: 'This endpoint is disabled in production' };
  }

  // SECURITY: Require admin key
  const adminKey = request.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_RESET_KEY;

  if (!expectedKey || adminKey !== expectedKey) {
    reply.code(401);
    app.log.warn({ ip: request.ip }, 'Unauthorized admin reset attempt');
    return { error: 'unauthorized', message: 'Admin key required' };
  }

  // SECURITY: Require HMAC signature of payload
  const hmacSignature = request.headers['x-reset-signature'];
  const payload = JSON.stringify({ confirm: 'yes-delete-everything' });

  if (!hmacSignature || !verifyHmac(payload, hmacSignature, expectedKey)) {
    reply.code(400);
    return { error: 'invalid_signature', message: 'HMAC signature verification failed' };
  }

  const { confirm } = request.body || {};
  if (confirm !== 'yes-delete-everything') {
    reply.code(400);
    return {
      error: 'confirmation_required',
      message: 'Send {"confirm":"yes-delete-everything"} with HMAC signature to proceed'
    };
  }

  if (!db) {
    reply.code(503);
    return { error: 'database_unavailable' };
  }

  try {
    app.log.warn({ admin: process.env.ADMIN_USER || 'unknown' }, 'Performing database reset');

    console.log('🗑️  Dropping all tables...');
    await db.query(`
      DROP TABLE IF EXISTS transactions CASCADE;
      DROP TABLE IF EXISTS offers CASCADE;
      DROP TABLE IF EXISTS negotiations CASCADE;
      DROP TABLE IF EXISTS intents CASCADE;
      DROP TABLE IF EXISTS sessions CASCADE;
      DROP TABLE IF EXISTS beacons CASCADE;
      DROP TABLE IF EXISTS scouts CASCADE;
      DROP TABLE IF EXISTS audit_log CASCADE;
    `);

    console.log('📦 Recreating schema...');
    await runMigrations();

    app.log.info('Database reset completed successfully');
    return { success: true, message: 'Database reset complete' };
  } catch (error) {
    app.log.error(error, 'Database reset failed');
    reply.code(500);
    return { error: 'reset_failed', message: 'Internal server error' };
  }
});
```

**Environment Setup (add to .env or deployment config):**

```bash
# Disable admin endpoints in production
NODE_ENV=production

# If you must enable in production (NOT RECOMMENDED):
ADMIN_RESET_KEY=your-very-secure-random-key-here
ADMIN_USER=admin-id
```

---

## 3. Secure Scout Registration with Proper Credential Hashing

**File:** `/mnt/aura-labs/aura-core/services/core-api/src/index.js`

Replace the `/scouts/register` endpoint:

```javascript
// ============================================================================
// Scout Registration (IMPROVED)
// ============================================================================

app.post('/scouts/register', async (request, reply) => {
  const { apiKey, metadata } = request.body || {};

  if (!db) {
    reply.code(503);
    return { error: 'database_unavailable', message: 'Database not configured' };
  }

  // SECURITY: Validate API key format
  if (!apiKey || apiKey.length < 32) {
    reply.code(400);
    return {
      error: 'invalid_api_key',
      message: 'API key must be at least 32 characters'
    };
  }

  // SECURITY: Validate metadata
  if (metadata && typeof metadata !== 'object') {
    reply.code(400);
    return { error: 'invalid_metadata', message: 'Metadata must be an object' };
  }

  try {
    // SECURITY: Hash the API key with bcrypt
    const hashedKey = await bcrypt.hash(apiKey, 10);

    // SECURITY: Log only last 8 chars for debugging (never the full key)
    const keyPreview = apiKey.slice(-8);
    app.log.info({ keyPreview }, 'Scout registration requested');

    const result = await db.query(
      `INSERT INTO scouts (api_key_hash, metadata, status)
       VALUES ($1, $2, $3)
       RETURNING id, status, created_at`,
      [hashedKey, metadata || {}, 'active']
    );

    const scout = result.rows[0];

    // SECURITY: Log the event
    await db.query(
      `INSERT INTO audit_log (entity_type, entity_id, action, new_state, changed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      ['scout', scout.id, 'registered', { status: scout.status }, 'system']
    );

    app.log.info({ scoutId: scout.id }, 'Scout registered successfully');

    return {
      scoutId: scout.id,
      status: scout.status,
      createdAt: scout.created_at,
      apiKeyPreview: `...${keyPreview}`,
      message: 'Store your API key securely. It will not be displayed again.',
      _links: {
        self: { href: `/scouts/${scout.id}` },
        sessions: { href: '/sessions', methods: ['POST'] },
      },
    };
  } catch (error) {
    app.log.error(error, 'Scout registration failed');
    reply.code(500);
    return { error: 'registration_failed', message: 'Failed to register scout' };
  }
});
```

**Database Schema Update:**

```sql
-- Update scouts table to add api_key_hash (if not using hashed version)
ALTER TABLE scouts ADD COLUMN api_key_hash VARCHAR(255) NOT NULL;
ALTER TABLE scouts ADD COLUMN status VARCHAR(50) DEFAULT 'active';

-- Add index for faster lookups
CREATE INDEX idx_scouts_api_key_hash ON scouts(api_key_hash);
CREATE INDEX idx_scouts_status ON scouts(status);
```

---

## 4. Secure Session Creation with Authentication

**File:** `/mnt/aura-labs/aura-core/services/core-api/src/index.js`

Replace the `/sessions` POST endpoint:

```javascript
// ============================================================================
// Session Creation (IMPROVED WITH AUTH)
// ============================================================================

app.post(
  '/sessions',
  { preHandler: verifyScoutAuth }, // Require authentication
  async (request, reply) => {
    const { intent, constraints } = request.body || {};
    const scoutId = request.scoutId; // From auth middleware

    // SECURITY: Validate intent
    if (!intent) {
      reply.code(400);
      return { error: 'missing_intent', message: 'Please provide an intent' };
    }

    if (typeof intent !== 'string' || intent.length === 0 || intent.length > 10000) {
      reply.code(400);
      return {
        error: 'invalid_intent',
        message: 'Intent must be a string between 1 and 10000 characters'
      };
    }

    // SECURITY: Validate constraints
    if (constraints) {
      if (typeof constraints !== 'object') {
        reply.code(400);
        return { error: 'invalid_constraints', message: 'Constraints must be an object' };
      }

      if (constraints.maxBudget !== undefined) {
        if (typeof constraints.maxBudget !== 'number' || constraints.maxBudget <= 0) {
          reply.code(400);
          return { error: 'invalid_budget', message: 'Max budget must be a positive number' };
        }
      }

      if (constraints.deliveryBy !== undefined) {
        const deliveryDate = new Date(constraints.deliveryBy);
        if (isNaN(deliveryDate.getTime())) {
          reply.code(400);
          return { error: 'invalid_delivery_date', message: 'Invalid delivery date format' };
        }
      }
    }

    if (!db) {
      reply.code(503);
      return { error: 'database_unavailable' };
    }

    try {
      // Parse intent (simple MVP version - replace with LLM call)
      const parsedIntent = {
        raw: intent,
        keywords: intent.toLowerCase().match(/\b\w+\b/g) || [],
        confidence: 0.5,
      };

      const result = await db.query(
        `INSERT INTO sessions (scout_id, status, raw_intent, parsed_intent, constraints)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, status, created_at`,
        [scoutId, 'market_forming', intent, parsedIntent, constraints || {}]
      );

      const session = result.rows[0];

      await db.query(
        `INSERT INTO audit_log (entity_type, entity_id, action, new_state, changed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        ['session', session.id, 'created', { status: session.status }, scoutId]
      );

      app.log.info(
        { sessionId: session.id, scoutId },
        'Session created'
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
      app.log.error(error, 'Session creation failed');
      reply.code(500);
      return { error: 'session_creation_failed', message: 'Failed to create session' };
    }
  }
);
```

---

## 5. Fix SSL Certificate Validation in Migration

**File:** `/mnt/aura-labs/aura-core/database/migrate.js`

Replace the Client initialization:

```javascript
/**
 * SECURE DATABASE CONNECTION
 */
const getSSLConfig = () => {
  if (process.env.NODE_ENV === 'production') {
    // In production, enforce SSL with certificate validation
    return {
      rejectUnauthorized: true,
      // Optionally provide CA certificate:
      // ca: fs.readFileSync(process.env.DB_CA_CERT_PATH)
    };
  }

  // In development, allow insecure connections only if explicitly allowed
  if (process.env.ALLOW_INSECURE_DB === 'true') {
    console.warn('⚠️  WARNING: Using insecure database connection (development only)');
    return {
      rejectUnauthorized: false
    };
  }

  // Default: require SSL with validation
  return {
    rejectUnauthorized: true
  };
};

const client = new Client({
  connectionString: databaseUrl,
  ssl: getSSLConfig()
});
```

---

## 6. Add Input Validation Schema

**File:** `/mnt/aura-labs/aura-core/services/core-api/src/index.js`

Add validation helper:

```javascript
import Joi from 'joi';

// ============================================================================
// INPUT VALIDATION SCHEMAS
// ============================================================================

const schemas = {
  scoutRegistration: Joi.object({
    apiKey: Joi.string().min(32).required(),
    metadata: Joi.object().optional(),
  }),

  sessionCreation: Joi.object({
    intent: Joi.string().min(1).max(10000).required(),
    constraints: Joi.object({
      maxBudget: Joi.number().positive().max(1000000000).optional(),
      deliveryBy: Joi.date().iso().optional(),
      hardConstraints: Joi.array().max(50).optional(),
      softPreferences: Joi.array().max(50).optional(),
    }).optional(),
  }),

  offerSubmission: Joi.object({
    beaconId: Joi.string().uuid().required(),
    product: Joi.object({
      name: Joi.string().max(1000).required(),
      sku: Joi.string().max(1000).required(),
      specifications: Joi.object().optional(),
    }).required(),
    unitPrice: Joi.number().positive().required(),
    quantity: Joi.number().positive().integer().required(),
    totalPrice: Joi.number().positive().optional(),
    currency: Joi.string().length(3).default('USD'),
    deliveryDate: Joi.date().iso().optional(),
    terms: Joi.object().optional(),
    metadata: Joi.object().optional(),
  }),

  transactionCommit: Joi.object({
    offerId: Joi.string().uuid().required(),
    idempotencyKey: Joi.string().uuid().required(),
  }),
};

/**
 * Validate request body
 */
const validate = (schema) => {
  return async (request, reply) => {
    const { error, value } = schema.validate(request.body);
    if (error) {
      reply.code(400);
      throw new Error(error.details[0].message);
    }
    request.validatedBody = value;
  };
};

// Use in routes:
app.post(
  '/scouts/register',
  { preHandler: [validate(schemas.scoutRegistration)] },
  async (request, reply) => {
    const { apiKey, metadata } = request.validatedBody;
    // ... rest of handler
  }
);
```

---

## 7. Fix CORS Configuration

**File:** `/mnt/aura-labs/aura-core/services/core-api/src/index.js`

Replace the CORS registration:

```javascript
// SECURE CORS CONFIGURATION
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://aura-labs.ai').split(',');

await app.register(cors, {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Beacon-Token'],
  maxAge: 3600,
});
```

---

## 8. Add Rate Limiting

**File:** `/mnt/aura-labs/aura-core/services/core-api/src/index.js`

Add after Fastify initialization:

```javascript
import rateLimit from '@fastify/rate-limit';

// RATE LIMITING
await app.register(rateLimit, {
  max: 100,
  timeWindow: '15 minutes',
  skipOnError: false,
  allowList: ['127.0.0.1'], // localhost bypass for testing
});

// Stricter limits for sensitive endpoints
const tightLimit = {
  max: 10,
  timeWindow: '1 hour'
};

// Apply to sensitive endpoints with custom hooks
app.post('/scouts/register', { rateLimit: tightLimit }, ...);
app.post('/beacons/register', { rateLimit: tightLimit }, ...);
```

---

## Testing the Fixes

**Example test file:**

```javascript
// test/security.test.js
import test from 'ava';
import { build } from './app.js';

test('POST /scouts/register requires API key', async (t) => {
  const app = await build();

  const response = await app.inject({
    method: 'POST',
    url: '/scouts/register',
    payload: {
      metadata: { name: 'Test Scout' }
    }
  });

  t.is(response.statusCode, 400);
  t.match(response.body, /invalid_api_key/);
});

test('POST /sessions requires authentication', async (t) => {
  const app = await build();

  const response = await app.inject({
    method: 'POST',
    url: '/sessions',
    payload: {
      intent: 'I need widgets'
    }
  });

  t.is(response.statusCode, 401);
  t.match(response.body, /authorization/i);
});

test('POST /sessions with valid auth creates session', async (t) => {
  const app = await build();

  const response = await app.inject({
    method: 'POST',
    url: '/sessions',
    headers: {
      authorization: 'Bearer test-api-key-that-is-at-least-32-characters-long'
    },
    payload: {
      intent: 'I need 100 widgets'
    }
  });

  t.is(response.statusCode, 200);
  t.truthy(response.json().sessionId);
});

test('/admin/reset-database blocked in production', async (t) => {
  process.env.NODE_ENV = 'production';
  const app = await build();

  const response = await app.inject({
    method: 'POST',
    url: '/admin/reset-database',
    headers: {
      'x-admin-key': 'correct-key'
    },
    payload: {
      confirm: 'yes-delete-everything'
    }
  });

  t.is(response.statusCode, 403);
});
```

---

## Deployment Checklist

- [ ] All API keys are at least 32 characters long
- [ ] API keys are hashed with bcrypt before storage
- [ ] Authentication middleware is applied to all endpoints
- [ ] Admin endpoints are disabled in production
- [ ] CORS is restricted to specific origins
- [ ] Rate limiting is configured
- [ ] SSL/TLS certificate validation is enabled
- [ ] All inputs are validated against schemas
- [ ] Error messages don't expose internal details
- [ ] Audit logging is enabled
- [ ] Environment variables are properly set:
  - `NODE_ENV=production`
  - `ALLOWED_ORIGINS=https://your-domain.com`
  - `ADMIN_RESET_KEY` is disabled (not set)
  - `DATABASE_URL` uses SSL with valid certificate

---

## Next Steps

1. Review and implement the fixes above in order of criticality
2. Run the test suite after each fix
3. Conduct security testing (SAST, DAST)
4. Deploy to staging environment
5. Perform penetration testing
6. Deploy to production with proper monitoring
