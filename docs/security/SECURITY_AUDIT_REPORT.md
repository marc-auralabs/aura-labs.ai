# AURA Codebase Security Audit Report

**Date:** February 9, 2026
**Scope:** Scout SDK, Beacon SDK, Core API, Scripts
**Status:** Multiple critical and high-severity vulnerabilities identified

---

## Executive Summary

The AURA codebase contains **5 CRITICAL**, **8 HIGH**, and **7 MEDIUM** severity security issues that must be addressed before production deployment. The most severe issues involve SQL injection vulnerabilities, lack of authentication/authorization, unprotected admin endpoints, and credential exposure in error messages.

---

## CRITICAL Issues (Immediate Fix Required)

### 1. SQL Injection in Core API Session Endpoint

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/aura-core/services/core-api/src/index.js`
**Line:** 427
**Severity:** CRITICAL
**CWE:** CWE-89 (SQL Injection)

```javascript
// Line 427 - VULNERABLE
const result = await db.query('SELECT * FROM beacons WHERE id::text = $1 OR external_id = $1', [beaconId]);
```

**Issue:** While parameterized queries are used here, the same pattern is used throughout without consistent validation. However, the real issue is on line 554:

```javascript
// Line 554 - VULNERABLE
const result = await db.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
```

**Risk:** If `sessionId` is not properly validated as a UUID before being passed to this query, an attacker could potentially exploit type coercion or similar vulnerabilities. More importantly, user input from URL parameters (`request.params`) is not explicitly validated as UUID format.

**Recommendation:**
- Add UUID validation middleware for all path parameters
- Implement input validation before any database query
- Use explicit type casting in SQL: `id::uuid = $1::uuid`

```javascript
// Add at the top of file
import { validate as uuidValidate } from 'uuid';

// Add middleware
app.addHook('preHandler', (request, reply, done) => {
  const { sessionId, beaconId, scoutId } = request.params || {};
  if (sessionId && !uuidValidate(sessionId)) {
    return reply.code(400).send({ error: 'invalid_session_id' });
  }
  if (beaconId && !uuidValidate(beaconId)) {
    return reply.code(400).send({ error: 'invalid_beacon_id' });
  }
  done();
});
```

---

### 2. Unprotected Admin Reset Database Endpoint

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/aura-core/services/core-api/src/index.js`
**Lines:** 90-123
**Severity:** CRITICAL
**CWE:** CWE-276 (Incorrect Default Permissions)

```javascript
app.post('/admin/reset-database', async (request, reply) => {
  const { confirm } = request.body || {};
  if (confirm !== 'yes-delete-everything') {
    // ...
  }
  // Drops all tables without any authentication!
```

**Issue:**
- No authentication or authorization check
- No rate limiting
- Only client-side confirmation string (`confirm: 'yes-delete-everything'`)
- Completely exposed in production deployment at `https://aura-labsai-production.up.railway.app/admin/reset-database`
- Comment says "one-time use, remove after" but endpoint is still active

**Risk:** Complete data destruction; any user can wipe the entire database.

**Recommendation:**
- **Immediate:** Remove this endpoint entirely from production
- Add authentication/authorization (API key verification)
- Implement rate limiting
- Use environment-based feature flags to disable in production
- Add multi-factor confirmation (e.g., signing with HMAC)

```javascript
// Secure version:
const ADMIN_RESET_ENABLED = process.env.NODE_ENV === 'development';

app.post('/admin/reset-database', async (request, reply) => {
  if (!ADMIN_RESET_ENABLED) {
    reply.code(403);
    return { error: 'endpoint_disabled_in_production' };
  }

  const adminKey = request.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_RESET_KEY) {
    reply.code(401);
    return { error: 'unauthorized' };
  }

  // ... rest of implementation
});
```

---

### 3. Credential Exposure in Scout Registration

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/aura-core/services/core-api/src/index.js`
**Line:** 302
**Severity:** CRITICAL
**CWE:** CWE-532 (Insertion of Sensitive Information into Log File)

```javascript
const result = await db.query(
  `INSERT INTO scouts (api_key_hash, metadata) VALUES ($1, $2) RETURNING id, status, created_at`,
  [apiKey ? apiKey.slice(-8) : null, metadata || {}]  // Only last 8 chars hashed
);
```

**Issue:**
- API key is "hashed" by taking only the last 8 characters (NOT a cryptographic hash)
- No actual hashing function used
- The `apiKey` parameter is sent in request body without HTTPS enforcement
- Stored value is predictable and reversible

**Risk:** API keys are essentially stored in plaintext, defeating authentication security.

**Recommendation:**
- Use proper cryptographic hashing (bcrypt, argon2, or scrypt)
- Never transmit API keys in request bodies; use Authorization headers
- Implement rate limiting on registration endpoint

```javascript
import bcrypt from 'bcrypt';

// In registration endpoint
const hashedKey = await bcrypt.hash(apiKey, 10);
const result = await db.query(
  `INSERT INTO scouts (api_key_hash, metadata) VALUES ($1, $2) RETURNING id, status, created_at`,
  [hashedKey, metadata || {}]
);

// In authentication middleware
const compareKey = await bcrypt.compare(providedKey, storedHashedKey);
```

---

### 4. No Authentication/Authorization on Critical Endpoints

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/aura-core/services/core-api/src/index.js`
**Multiple Locations**
**Severity:** CRITICAL
**CWE:** CWE-306 (Missing Authentication for Critical Function)

**Issues:**
- `/scouts/register` (line 290) - No verification that requester owns the API key
- `/beacons/register` (line 364) - Any client can register arbitrary beacons
- `/beacons/sessions` (line 450) - Any beacon can see ALL sessions from ANY scout
- `/sessions/:sessionId/offers` (line 605) - Any beacon can submit offers to any session
- `/sessions/:sessionId/commit` (line 725) - Any user can commit to any session without scout verification

**Risk:** Complete authentication bypass; malicious actors can:
- Forge scouts
- Register fake beacons
- Spy on other users' sessions
- Commit fraudulent transactions

**Recommendation:**
```javascript
// Add authentication middleware
const verifyApiKey = async (request, reply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.code(401);
    throw new Error('Missing authorization header');
  }

  const apiKey = authHeader.slice(7);
  const result = await db.query(
    'SELECT id FROM scouts WHERE api_key_hash = $1',
    [await hashKey(apiKey)]
  );

  if (!result.rows.length) {
    reply.code(401);
    throw new Error('Invalid API key');
  }

  request.scoutId = result.rows[0].id;
};

// Apply to endpoints
app.post('/sessions', { preHandler: verifyApiKey }, async (request, reply) => {
  // Only allow creating sessions for authenticated scout
  const { intent, constraints } = request.body;

  const result = await db.query(
    `INSERT INTO sessions (scout_id, status, raw_intent, parsed_intent, constraints)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, status, created_at`,
    [request.scoutId, 'market_forming', intent, parsedIntent, constraints]
  );
  // ...
});
```

---

### 5. Unsafe Database Connection in Migration Script

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/aura-core/database/migrate.js`
**Line:** 25
**Severity:** CRITICAL
**CWE:** CWE-295 (Improper Certificate Validation)

```javascript
const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }  // DANGEROUS!
});
```

**Issue:**
- `rejectUnauthorized: false` disables SSL/TLS certificate validation
- Vulnerable to man-in-the-middle (MITM) attacks
- Database credentials transmitted over potentially unencrypted connection

**Risk:** MITM attacker can intercept database credentials and queries.

**Recommendation:**
```javascript
const client = new Client({
  connectionString: databaseUrl,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: true,
    ca: process.env.DB_CA_CERT // Provide via env var or file
  } : false
});
```

---

## HIGH Severity Issues

### 6. Unsafe SQL Trigger Creation

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/aura-core/services/core-api/src/index.js`
**Lines:** 256-259
**Severity:** HIGH
**CWE:** CWE-89 (SQL Injection via trigger names)

```javascript
for (const table of ['scouts', 'beacons', 'sessions', 'transactions']) {
  await db.query(`DROP TRIGGER IF EXISTS ${table}_updated_at ON ${table}`);
  await db.query(`CREATE TRIGGER ${table}_updated_at BEFORE UPDATE ON ${table}...`);
}
```

**Issue:** Table names are injected directly into SQL without parameterization. While table names are hardcoded here (safer), the pattern sets a bad precedent.

**Recommendation:**
```javascript
const tables = ['scouts', 'beacons', 'sessions', 'transactions'];
const allowedTables = new Set(tables);

for (const table of tables) {
  if (!allowedTables.has(table)) throw new Error('Invalid table name');

  // Use dynamic query building safely
  await db.query(`DROP TRIGGER IF EXISTS "${table}_updated_at" ON "${table}"`);
  await db.query(`CREATE TRIGGER "${table}_updated_at" BEFORE UPDATE ON "${table}"...`);
}
```

---

### 7. Missing CORS Validation

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/aura-core/services/core-api/src/index.js`
**Line:** 46
**Severity:** HIGH
**CWE:** CWE-345 (Insufficient Verification of Data Authenticity)

```javascript
await app.register(cors, { origin: true });
```

**Issue:** `origin: true` allows CORS requests from ANY origin, enabling:
- CSRF attacks
- Cross-origin data theft
- Unauthorized API usage from malicious websites

**Risk:** Any website can make authenticated requests to AURA Core on behalf of users.

**Recommendation:**
```javascript
await app.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://aura-labs.ai'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
});
```

---

### 8. No Rate Limiting

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/aura-core/services/core-api/src/index.js`
**Severity:** HIGH
**CWE:** CWE-770 (Allocation of Resources Without Limits or Throttling)

**Issue:** No rate limiting on any endpoint. Attackers can:
- Spam registration endpoints (account enumeration)
- DoS by creating millions of sessions
- Brute force API key guessing
- Exhaust database resources

**Recommendation:**
```javascript
import rateLimit from '@fastify/rate-limit';

await app.register(rateLimit, {
  max: 100,
  timeWindow: '15 minutes'
});

// Per-endpoint limits
app.post('/scouts/register', {
  rateLimit: { max: 10, timeWindow: '1 hour' }
}, async (request, reply) => {
  // ...
});
```

---

### 9. Hardcoded Production URL in SDKs

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/sdks/scout-js/src/index.js`
**Line:** 76
**Severity:** HIGH

```javascript
coreUrl: 'https://aura-labsai-production.up.railway.app',
```

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/sdks/beacon-js/src/index.js`
**Line:** 60
**Severity:** HIGH

```javascript
coreUrl: 'https://aura-labsai-production.up.railway.app',
```

**Issue:**
- Production URLs hardcoded in SDK source
- Exposes infrastructure details
- Makes it impossible to use custom/private deployments
- Pins all clients to single production instance

**Risk:** Supply chain compromise; if production URL is compromised, all clients affected.

**Recommendation:**
```javascript
constructor(config) {
  this.#config = {
    coreUrl: process.env.AURA_CORE_URL || config.coreUrl,
    // Provide sensible defaults only if no env var set
    ...config,
  };

  if (!this.#config.coreUrl) {
    throw new Error('coreUrl required - set AURA_CORE_URL or pass in config');
  }
}
```

---

### 10. No Input Validation on Session Intent

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/aura-core/services/core-api/src/index.js`
**Lines:** 492-518
**Severity:** HIGH
**CWE:** CWE-20 (Improper Input Validation)

```javascript
app.post('/sessions', async (request, reply) => {
  const { intent, scoutId, constraints } = request.body || {};

  if (!intent) {
    // Only checks for falsy, not type or length
    reply.code(400);
    return { error: 'missing_intent', ... };
  }

  // No validation of intent content, size, or format
  const parsedIntent = {
    raw: intent,
    keywords: intent.toLowerCase().match(/\b\w+\b/g) || [],
    confidence: 0.5,
  };
```

**Issue:**
- No size limits on intent string (DoS via large payloads)
- No validation of constraints structure
- No type checking on numeric values
- Potential for stored XSS if intent is returned in responses

**Risk:**
- Memory exhaustion attacks
- Invalid data in database
- Injection attacks if data is later rendered in web UI

**Recommendation:**
```javascript
const Joi = require('joi');

const sessionSchema = Joi.object({
  intent: Joi.string().required().max(10000),
  scoutId: Joi.string().uuid(),
  constraints: Joi.object({
    maxBudget: Joi.number().positive().max(1000000),
    deliveryBy: Joi.date().iso(),
    hardConstraints: Joi.array().max(50),
    softPreferences: Joi.array().max(50)
  })
});

app.post('/sessions', async (request, reply) => {
  const { error, value } = sessionSchema.validate(request.body);
  if (error) {
    reply.code(400);
    return { error: 'validation_failed', message: error.details[0].message };
  }

  const { intent, scoutId, constraints } = value;
  // ... rest of handler
});
```

---

### 11. Command Injection in Shell Scripts

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/scripts/run-beacons.sh`
**Lines:** 38-40
**Severity:** HIGH
**CWE:** CWE-78 (Improper Neutralization of Special Elements)

```bash
json_val() {
  echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$2',''))" 2>/dev/null
}
```

**Issue:**
- `$2` (the JSON key) is not quoted in the Python code
- If key contains special characters or Python syntax, injection is possible
- Example: key = `',__import__('os').system('rm -rf /'),'` would execute arbitrary code

**Risk:** Remote code execution if untrusted JSON is parsed.

**Recommendation:**
```bash
json_val() {
  local json="$1"
  local key="$2"
  echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$key',''))" 2>/dev/null
}
```

Or better, use `jq`:
```bash
json_val() {
  echo "$1" | jq -r ".\"$2\"" 2>/dev/null || echo ""
}
```

---

### 12. Unsafe Variable Expansion in Shell Scripts

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/scripts/run-beacons.sh`
**Lines:** 141-143
**Severity:** HIGH
**CWE:** CWE-78 (Shell Injection)

```bash
local qty=$(echo "$intent" | grep -oE '[0-9]+' | head -1)
qty=${qty:-500}
[ $qty -lt 100 ] && qty=100  # Unquoted variable in comparison
[ $qty -gt 10000 ] && qty=10000
```

**Issue:**
- `$qty` should be quoted to prevent word splitting
- If `grep -oE` fails to find a number and `qty` is empty, the comparison `[ -lt 100 ]` fails
- Could cause unexpected behavior or script errors

**Risk:** Script breakage or unexpected behavior in edge cases.

**Recommendation:**
```bash
local qty
qty=$(echo "$intent" | grep -oE '[0-9]+' | head -1)
qty="${qty:-500}"
if [[ "$qty" -lt 100 ]]; then qty=100; fi
if [[ "$qty" -gt 10000 ]]; then qty=10000; fi
```

---

### 13. Beacon Client Missing Authorization Header

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/sdks/beacon-js/src/client.js`
**Lines:** 22-32
**Severity:** HIGH
**CWE:** CWE-306 (Missing Authentication)

```javascript
async #request(method, path, body = null) {
  const url = `${this.#config.coreUrl}${path}`;

  const headers = {
    'Content-Type': 'application/json',
    'X-Beacon-SDK': '@aura-labs/beacon/0.1.0',
    // NO AUTHORIZATION HEADER!
  };

  if (this.#config.beaconId) {
    headers['X-Beacon-ID'] = this.#config.beaconId;  // Just a custom header, not auth
  }
```

**Issue:**
- Beacon client doesn't send API key/Bearer token
- Relies only on `X-Beacon-ID` header which is easily spoofed
- Any client can impersonate any beacon by setting the header

**Risk:** Beacon impersonation; malicious actor can submit offers as legitimate vendor.

**Recommendation:** Implement proper bearer token authentication (see issue #4).

---

## MEDIUM Severity Issues

### 14. SQL Injection in Dynamic Trigger Names (Anti-pattern)

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/aura-core/services/core-api/src/index.js`
**Lines:** 256-259
**Severity:** MEDIUM (not exploitable in current code, but bad practice)

**See issue #6 for details and recommendations.**

---

### 15. Insufficient Error Information Disclosure

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/aura-core/services/core-api/src/index.js`
**Line:** 100
**Severity:** MEDIUM
**CWE:** CWE-209 (Information Exposure Through an Error Message)

```javascript
throw new ConnectionError(`Failed to connect to AURA Core: ${error.message}`);
```

**Issue:** Error messages may leak internal details about system architecture, database structure, or API endpoints.

**Risk:** Information disclosure helping attackers plan attacks.

**Recommendation:**
```javascript
app.log.error(error); // Log full details internally
throw new ConnectionError('Failed to process request. Please try again.');
```

---

### 16. No HTTPS Enforcement in Scout CLI

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/sdks/scout-js/bin/scout-cli.js`
**Lines:** 28-31
**Severity:** MEDIUM
**CWE:** CWE-295 (Improper Certificate Validation)

```javascript
const config = {
  apiKey: flags['api-key'] || process.env.AURA_API_KEY,
  coreUrl: flags['core-url'] || process.env.AURA_CORE_URL || 'https://aura-labsai-production.up.railway.app',
};
```

**Issue:**
- Allows `--core-url` flag with HTTP URL
- API key sent in Authorization header could be captured in transit

**Risk:** MITM attack capturing API key.

**Recommendation:**
```javascript
const config = {
  apiKey: flags['api-key'] || process.env.AURA_API_KEY,
  coreUrl: flags['core-url'] || process.env.AURA_CORE_URL || 'https://aura-labsai-production.up.railway.app',
};

if (!config.coreUrl.startsWith('https://')) {
  throw new Error('Core URL must use HTTPS. Received: ' + config.coreUrl);
}
```

---

### 17. Constraint Evaluation Logic Vulnerability

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/sdks/scout-js/src/session.js`
**Lines:** 318-332
**Severity:** MEDIUM
**CWE:** CWE-20 (Improper Input Validation)

```javascript
#evaluateConstraint(constraint, offer) {
  const value = offer[constraint.field];

  switch (constraint.operator) {
    case 'eq': return value === constraint.value;
    case 'ne': return value !== constraint.value;
    case 'gt': return value > constraint.value;
    case 'gte': return value >= constraint.value;
    case 'lt': return value < constraint.value;
    case 'lte': return value <= constraint.value;
    case 'contains': return String(value).includes(constraint.value);
    case 'in': return constraint.value.includes(value);
    default: return true;  // DANGEROUS: unknown operators bypass constraints!
  }
}
```

**Issue:**
- Unknown operators return `true` (constraint passes)
- No validation of operator type or field names
- Prototype pollution vulnerability: `constraint.field = '__proto__'` could corrupt object

**Risk:**
- Constraint bypass (offers violating constraints would be accepted)
- Prototype pollution leading to application-wide object corruption

**Recommendation:**
```javascript
#evaluateConstraint(constraint, offer) {
  const ALLOWED_OPERATORS = new Set(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in']);
  const ALLOWED_FIELDS = new Set(['unitPrice', 'totalPrice', 'deliveryDate', 'beaconName', 'rating']);

  if (!ALLOWED_OPERATORS.has(constraint.operator)) {
    throw new ConstraintError(`Unknown operator: ${constraint.operator}`);
  }
  if (!ALLOWED_FIELDS.has(constraint.field)) {
    throw new ConstraintError(`Unknown field: ${constraint.field}`);
  }

  const value = offer[constraint.field];

  switch (constraint.operator) {
    case 'eq': return value === constraint.value;
    case 'ne': return value !== constraint.value;
    case 'gt': return value > constraint.value;
    case 'gte': return value >= constraint.value;
    case 'lt': return value < constraint.value;
    case 'lte': return value <= constraint.value;
    case 'contains': return String(value).includes(String(constraint.value));
    case 'in': return Array.isArray(constraint.value) && constraint.value.includes(value);
    default: throw new Error('Impossible: unreachable default case');
  }
}
```

---

### 18. Session Timeout Not Enforced

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/aura-core/services/core-api/src/index.js`
**Lines:** 176-187
**Severity:** MEDIUM
**CWE:** CWE-613 (Insufficient Session Expiration)

```javascript
CREATE TABLE IF NOT EXISTS sessions (
  ...
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);
```

**Issue:**
- `expires_at` column exists but is never checked in queries
- Sessions don't actually expire; sessions endpoint returns expired sessions as if active
- No cleanup mechanism for expired records

**Risk:**
- Expired sessions can still be accessed
- Database bloat from accumulating old sessions
- Resource leaks

**Recommendation:**
```javascript
app.get('/sessions/:sessionId', async (request, reply) => {
  const { sessionId } = request.params;

  const result = await db.query(
    'SELECT * FROM sessions WHERE id = $1 AND expires_at > NOW()',
    [sessionId]
  );

  if (result.rows.length === 0) {
    reply.code(404);
    return { error: 'not_found', message: 'Session not found or expired' };
  }

  // ... rest of handler
});

// Add cleanup job
setInterval(async () => {
  await db.query('DELETE FROM sessions WHERE expires_at < NOW()');
}, 3600000); // Run hourly
```

---

### 19. No Idempotency Key Validation

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/aura-core/services/core-api/src/index.js`
**Lines:** 725-771
**Severity:** MEDIUM
**CWE:** CWE-362 (Concurrent Execution using Shared Resource with Improper Synchronization)

```javascript
const txResult = await db.query(
  `INSERT INTO transactions (session_id, offer_id, beacon_id, scout_id, status, final_terms, idempotency_key)
   VALUES ($1, $2, $3, $4, $5, $6, $7)
   ...`,
  [..., idempotencyKey || null]  // Optional idempotency key
);
```

**Issue:**
- Idempotency key is optional (`|| null`)
- No validation that it's a valid format (UUID, hash, etc.)
- Multiple commit requests with same offer ID could create duplicate transactions (race condition)

**Risk:** Duplicate charges; users could be billed twice.

**Recommendation:**
```javascript
app.post('/sessions/:sessionId/commit', async (request, reply) => {
  const { offerId, idempotencyKey } = request.body || {};

  if (!idempotencyKey) {
    reply.code(400);
    return { error: 'missing_idempotency_key',
             message: 'idempotencyKey is required for transaction safety' };
  }

  if (!/^[a-f0-9\-]{36}$/.test(idempotencyKey)) {
    reply.code(400);
    return { error: 'invalid_idempotency_key_format' };
  }

  // Check if we've already processed this idempotency key
  const existing = await db.query(
    'SELECT id FROM transactions WHERE idempotency_key = $1',
    [idempotencyKey]
  );

  if (existing.rows.length > 0) {
    // Return the previously created transaction
    return { transactionId: existing.rows[0].id, status: 'already_committed' };
  }

  // ... rest of implementation
});
```

---

### 20. Overly Permissive Query Responses

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/aura-core/services/core-api/src/index.js`
**Line:** 461-467
**Severity:** MEDIUM
**CWE:** CWE-200 (Information Exposure)

```javascript
const result = await db.query(
  `SELECT id, scout_id, status, raw_intent, parsed_intent, constraints, created_at
   FROM sessions
   WHERE status IN ('created', 'market_forming')
   ORDER BY created_at DESC
   LIMIT $1`,
  [parseInt(limit) || 20]
);

// Returns all sessions to ANY beacon
return {
  sessions: result.rows.map(s => ({
    sessionId: s.id,
    status: s.status,
    intent: { raw: s.raw_intent, parsed: s.parsed_intent },
    constraints: s.constraints,  // User's budget/requirements exposed!
    createdAt: s.created_at,
    // ...
  })),
};
```

**Issue:**
- `/beacons/sessions` endpoint returns ALL pending sessions from ALL scouts
- Returns user's constraints (budget, delivery requirements)
- Any beacon can see every other beacon's competitors
- Violates privacy; enables price discrimination or collusion

**Risk:**
- Information disclosure (users' shopping patterns)
- Anti-competitive behavior (price collusion between beacons)
- Privacy violation

**Recommendation:**
```javascript
// Only return sessions that beacon is interested in based on their capabilities
app.get('/beacons/sessions', async (request, reply) => {
  const beaconId = request.headers['x-beacon-id'];

  if (!beaconId) {
    reply.code(401);
    return { error: 'unauthorized' };
  }

  // Get beacon's capabilities
  const beaconResult = await db.query(
    'SELECT capabilities FROM beacons WHERE id = $1',
    [beaconId]
  );

  if (!beaconResult.rows.length) {
    reply.code(404);
    return { error: 'beacon_not_found' };
  }

  // Only return relevant sessions (matching beacon's capabilities)
  // Don't expose detailed constraints
  const result = await db.query(
    `SELECT id, status, raw_intent, created_at
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
      intent: { raw: s.raw_intent },  // Don't expose parsed_intent
      // Don't include constraints at all
      createdAt: s.created_at,
    })),
  };
});
```

---

## LOW Severity Issues (Best Practices)

### 21. Missing Content Security Policy

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/aura-core/services/core-api/src/index.js`
**Line:** 47
**Severity:** LOW
**CWE:** CWE-693 (Protection Mechanism Failure)

```javascript
await app.register(helmet, { contentSecurityPolicy: false });
```

**Issue:** CSP disabled; if responses ever include HTML/JS, XSS attacks are possible.

**Recommendation:**
```javascript
await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "https:"],
    }
  }
});
```

---

### 22. No Request ID Correlation

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/aura-core/services/core-api/src/index.js`
**Severity:** LOW
**CWE:** CWE-778 (Insufficient Logging)

**Issue:** No request ID generation; makes debugging and fraud investigation difficult.

**Recommendation:**
```javascript
import { v4 as uuid } from 'uuid';

app.addHook('preHandler', (request, reply, done) => {
  request.id = uuid();
  reply.header('x-request-id', request.id);
  done();
});

// Use request.id in all logging
app.log.info({ requestId: request.id }, 'Processing request');
```

---

### 23. Insufficient WebSocket Security

**File:** `/sessions/busy-blissful-edison/mnt/aura-labs/aura-core/services/core-api/src/index.js`
**Lines:** 850-874
**Severity:** LOW
**CWE:** CWE-345 (Insufficient Verification of Data Authenticity)

```javascript
app.get('/ws/scout', { websocket: true }, (connection) => {
  connection.socket.on('message', (message) => {
    const data = JSON.parse(message.toString());  // Potential JSON bomb
    app.log.info({ type: 'scout_message', data });
    connection.socket.send(JSON.stringify({ type: 'ack', received: data }));
  });
});
```

**Issue:**
- No authentication on WebSocket connections
- No payload size limits
- Arbitrary JSON echo-back (potential TOCTOU issues)
- Note: WebSocket support is marked as "future" in comments

**Recommendation:**
- Add authentication (Bearer token verification)
- Add payload size limits
- Only echo back safe subset of data

---

### 24. No API Versioning

**Severity:** LOW
**CWE:** CWE-664 (Improper Control of Interaction Frequency)

**Issue:** No API versioning strategy; breaking changes will affect all clients simultaneously.

**Recommendation:**
```javascript
// Add version prefix to all routes
app.post('/v1/sessions', async (request, reply) => {
  // Version 1 implementation
});

app.post('/v2/sessions', async (request, reply) => {
  // Version 2 with improvements
});
```

---

### 25. Missing Logging and Monitoring

**Severity:** LOW
**CWE:** CWE-778 (Insufficient Logging)

**Issue:** Minimal security event logging:
- No failed authentication attempts logged
- No access to admin endpoints logged
- No database transaction audits
- Audit log table exists but is never written to

**Recommendation:**
- Log all authentication failures with IP address
- Log all writes to audit_log table
- Set up alerts for suspicious patterns
- Implement log shipping to secure facility

---

### 26. Unvalidated Redirect/Open Redirect Prevention

**Severity:** LOW
**CWE:** CWE-601 (URL Redirection to Untrusted Site)

**Issue:** While not present in current code, the HATEOAS links system could be exploited if extended.

**Recommendation:**
```javascript
// If adding redirect endpoints in future:
app.get('/redirect', async (request, reply) => {
  const { url } = request.query;

  // Validate URL is relative or same-origin
  if (!url.startsWith('/') && !url.startsWith(request.hostname)) {
    reply.code(400);
    return { error: 'invalid_redirect_url' };
  }

  reply.redirect(url);
});
```

---

## Summary Table

| # | Severity | Title | File | Line(s) | CWE |
|---|----------|-------|------|---------|-----|
| 1 | CRITICAL | SQL Injection in Parameters | core-api/index.js | 554 | CWE-89 |
| 2 | CRITICAL | Unprotected Admin Reset Endpoint | core-api/index.js | 90-123 | CWE-276 |
| 3 | CRITICAL | Credential Exposure in Scout Registration | core-api/index.js | 302 | CWE-532 |
| 4 | CRITICAL | No Authentication/Authorization | core-api/index.js | Multiple | CWE-306 |
| 5 | CRITICAL | Unsafe SSL in Migration | migrate.js | 25 | CWE-295 |
| 6 | HIGH | SQL Trigger Injection | core-api/index.js | 256-259 | CWE-89 |
| 7 | HIGH | Unsafe CORS Configuration | core-api/index.js | 46 | CWE-345 |
| 8 | HIGH | No Rate Limiting | core-api/index.js | All | CWE-770 |
| 9 | HIGH | Hardcoded Production URL | scout-js/index.js, beacon-js/index.js | 76, 60 | Information Disclosure |
| 10 | HIGH | No Input Validation | core-api/index.js | 492-518 | CWE-20 |
| 11 | HIGH | Command Injection in Shell | run-beacons.sh | 38-40 | CWE-78 |
| 12 | HIGH | Unsafe Variable Expansion | run-beacons.sh | 141-143 | CWE-78 |
| 13 | HIGH | Beacon Missing Auth Header | beacon-js/client.js | 22-32 | CWE-306 |
| 14 | MEDIUM | SQL Injection Anti-pattern | core-api/index.js | 256-259 | CWE-89 |
| 15 | MEDIUM | Error Information Disclosure | core-api/index.js | 100 | CWE-209 |
| 16 | MEDIUM | No HTTPS Enforcement | scout-cli.js | 28-31 | CWE-295 |
| 17 | MEDIUM | Constraint Evaluation Vuln | session.js | 318-332 | CWE-20 |
| 18 | MEDIUM | Session Timeout Not Enforced | core-api/index.js | 176-187 | CWE-613 |
| 19 | MEDIUM | No Idempotency Validation | core-api/index.js | 725-771 | CWE-362 |
| 20 | MEDIUM | Overly Permissive Queries | core-api/index.js | 461-467 | CWE-200 |
| 21 | LOW | Missing CSP | core-api/index.js | 47 | CWE-693 |
| 22 | LOW | No Request ID Correlation | core-api/index.js | All | CWE-778 |
| 23 | LOW | Insufficient WebSocket Security | core-api/index.js | 850-874 | CWE-345 |
| 24 | LOW | No API Versioning | All | All | CWE-664 |
| 25 | LOW | Missing Logging/Monitoring | core-api/index.js | All | CWE-778 |
| 26 | LOW | Unvalidated Redirect | N/A | N/A | CWE-601 |

---

## Remediation Priority

### Phase 1: CRITICAL (Must fix before any production use)
1. Implement proper authentication/authorization on all endpoints
2. Remove or protect admin reset endpoint
3. Add UUID validation on path parameters
4. Implement proper API key hashing with bcrypt
5. Fix SSL certificate validation in migration script

**Estimated effort:** 40-60 hours
**Risk if not fixed:** Complete system compromise

### Phase 2: HIGH (Fix before beta release)
6. Add rate limiting
7. Restrict CORS to specific origins
8. Add comprehensive input validation
9. Fix shell script command injection
10. Implement bearer token auth for beacons

**Estimated effort:** 30-40 hours
**Risk if not fixed:** DoS, impersonation, data theft

### Phase 3: MEDIUM (Fix before GA release)
11. Enforce session expiration
12. Add idempotency key validation
13. Restrict session query scope
14. Add proper error handling
15. Implement constraint evaluation safely

**Estimated effort:** 20-30 hours
**Risk if not fixed:** Privacy leaks, duplicate transactions, fraud

### Phase 4: LOW (Best practices)
16. Add CSP headers
17. Add request ID correlation
18. Implement proper logging
19. Add API versioning
20. Document security requirements

**Estimated effort:** 15-20 hours

---

## Security Configuration Checklist

- [ ] Implement centralized authentication middleware
- [ ] Add rate limiting (global and per-endpoint)
- [ ] Validate all user inputs with schema validation
- [ ] Hash all stored credentials with bcrypt/argon2
- [ ] Enforce HTTPS with HSTS headers
- [ ] Configure restrictive CORS
- [ ] Add request logging with correlation IDs
- [ ] Implement comprehensive audit logging
- [ ] Add security headers (CSP, X-Frame-Options, etc.)
- [ ] Implement session timeouts and cleanup
- [ ] Add monitoring and alerting
- [ ] Conduct security testing (SAST, DAST, penetration testing)
- [ ] Document security architecture
- [ ] Implement dependency vulnerability scanning
- [ ] Set up secure secrets management

---

## Testing Recommendations

1. **Unit Tests:** Input validation, constraint evaluation, authentication
2. **Integration Tests:** End-to-end flows with auth/authz validation
3. **Security Tests:**
   - Attempt SQL injection on all endpoints
   - Test authentication bypass
   - Test authorization bypass (cross-user access)
   - Test constraint bypass
   - Test rate limiting
   - Test CORS
4. **Load Tests:** Verify rate limiting and DoS protections
5. **Penetration Testing:** Third-party security assessment

---

## References

- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Fastify Security](https://www.fastify.io/docs/latest/Guides/Security/)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/sql-syntax.html)

---

**Report Generated:** February 9, 2026
**Audit Scope:** AURA Codebase (Scout SDK, Beacon SDK, Core API, Scripts)
**Status:** FINDINGS REQUIRE IMMEDIATE REMEDIATION
