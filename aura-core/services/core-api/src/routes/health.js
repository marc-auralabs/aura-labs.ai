/**
 * Health Check Endpoints
 *
 * Domain: Network Health (cross-cutting)
 * - GET /health — Basic liveness check
 * - GET /health/ready — Readiness probe (DB + Redis)
 */

import { safeError } from '../lib/shared.js';

/**
 * Register health check routes on the Fastify app.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {object} db - PostgreSQL pool (or null)
 * @param {object} config - Application config
 */
export function registerHealthRoutes(app, db, config) {
  app.get('/health', async () => ({
    status: 'healthy',
    service: 'core-api',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  }));

  app.get('/health/ready', async (request, reply) => {
    const checks = {
      database: await checkDatabase(db, config),
      redis: await checkRedis(config),
    };
    const allHealthy = Object.values(checks).every(c => c.status === 'healthy');
    reply.code(allHealthy ? 200 : 503);
    return { status: allHealthy ? 'ready' : 'not_ready', checks, timestamp: new Date().toISOString() };
  });
}

async function checkDatabase(db, config) {
  if (!config.databaseUrl || !db) return { status: 'unconfigured' };
  try {
    await db.query('SELECT 1');
    return { status: 'healthy' };
  } catch (error) {
    return { status: 'unhealthy', error: safeError(error, 'Database check failed') };
  }
}

async function checkRedis(config) {
  if (!config.redisUrl) return { status: 'unconfigured' };
  return { status: 'healthy' }; // TODO: actual check
}
