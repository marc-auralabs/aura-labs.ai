/**
 * Rate Limiting & Request ID Middleware
 *
 * Domain: Client Integration & Management (cross-cutting)
 * - Per-agent rate limiting (120 req/min authenticated, 30 req/min public)
 * - Request ID tracking for distributed tracing
 */

import { randomUUID } from 'crypto';

// =============================================================================
// Rate Limiting (per-agent for authenticated routes, per-IP for public routes)
// In-memory store — resets on deploy. Future: policy agent can adjust limits.
// =============================================================================

const rateLimitStore = new Map();  // key → { count, windowStart }
export const RATE_LIMITS = {
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

/**
 * Register rate limiting and request ID hooks on the Fastify app.
 */
export function registerMiddleware(app, config) {
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
}
