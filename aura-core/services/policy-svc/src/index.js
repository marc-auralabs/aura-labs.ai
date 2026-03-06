/**
 * AURA Policy Service — Independent Observer Layer
 *
 * Runs policy agents on a scheduled tick loop. Each agent independently
 * queries the database, computes statistical baselines, detects anomalies,
 * and responds (alert / auto-remediate).
 *
 * Architecture:
 *   - 30-second tick loop checks each agent's shouldRun()
 *   - Agents run independently — one failing doesn't block others
 *   - Separate DB pool (max 5 connections)
 *   - Admin API on port 3003 for alert management and config
 *   - Designed for independent deployment (can observe even if core-api is down)
 */

import Fastify from 'fastify';
import pg from 'pg';

import { BaselineCalculator } from './lib/baseline-calculator.js';
import { AlertDispatcher } from './lib/alert-dispatcher.js';
import { RemediationEngine } from './lib/remediation-engine.js';

// Policy agents
import { HeartbeatMonitor } from './agents/heartbeat-monitor.js';
import { SessionLifecycleMonitor } from './agents/session-lifecycle-monitor.js';
import { OfferAnomalyDetector } from './agents/offer-anomaly-detector.js';
import { TransactionHealthMonitor } from './agents/transaction-health-monitor.js';
import { ThroughputMonitor } from './agents/throughput-monitor.js';

const { Pool } = pg;

// ─── Configuration ─────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3003', 10);
const TICK_INTERVAL_MS = 30_000; // 30 seconds
const DATABASE_URL = process.env.DATABASE_URL;

// ─── Boot ──────────────────────────────────────────────────────────────

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    ...(process.env.NODE_ENV !== 'production' && {
      transport: { target: 'pino-pretty' },
    }),
  },
});

// Separate DB pool — policy-svc owns its own connections
const db = new Pool({
  connectionString: DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// ─── Shared Infrastructure ─────────────────────────────────────────────

const baselineCalculator = new BaselineCalculator(db, fastify.log);
const alertDispatcher = new AlertDispatcher(db, fastify.log);
const remediationEngine = new RemediationEngine(db, fastify.log);

// ─── Policy Agents ─────────────────────────────────────────────────────

const agentDeps = {
  db,
  baselineCalculator,
  alertDispatcher,
  remediationEngine,
  logger: fastify.log,
};

const agents = [
  new HeartbeatMonitor(agentDeps),
  new SessionLifecycleMonitor(agentDeps),
  new OfferAnomalyDetector(agentDeps),
  new TransactionHealthMonitor(agentDeps),
  new ThroughputMonitor(agentDeps),
];

// ─── Scheduler ─────────────────────────────────────────────────────────

let tickTimer = null;

async function tick() {
  for (const agent of agents) {
    if (agent.shouldRun()) {
      // Fire and forget — each agent handles its own errors
      agent.run().catch(err => {
        fastify.log.error({
          policy: agent.name,
          error: err.message,
        }, 'Agent run failed (unhandled)');
      });
    }
  }
}

function startScheduler() {
  tickTimer = setInterval(tick, TICK_INTERVAL_MS);
  fastify.log.info({ intervalMs: TICK_INTERVAL_MS }, 'Policy scheduler started');
}

function stopScheduler() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
    fastify.log.info('Policy scheduler stopped');
  }
}

// ─── Health Checks ─────────────────────────────────────────────────────

fastify.get('/health', async () => ({
  status: 'ok',
  service: 'policy-svc',
  uptime: process.uptime(),
  agents: agents.map(a => ({
    name: a.name,
    isRunning: a.isRunning,
    lastRunAt: a.lastRunAt,
    runCount: a.runCount,
    errorCount: a.errorCount,
  })),
}));

fastify.get('/health/ready', async (request, reply) => {
  try {
    await db.query('SELECT 1');
    return { status: 'ready', database: 'connected' };
  } catch (error) {
    reply.status(503);
    return { status: 'not_ready', database: 'disconnected', error: error.message };
  }
});

// ─── Admin API ─────────────────────────────────────────────────────────

// List alerts
fastify.get('/alerts', async (request) => {
  const { severity, policy_name, resolved, since, beacon_id, limit } = request.query;
  const alerts = await alertDispatcher.listAlerts({
    severity,
    policyName: policy_name,
    resolved: resolved !== undefined ? resolved === 'true' : undefined,
    since,
    beaconId: beacon_id,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
  return { alerts, count: alerts.length };
});

// Alert detail with audit trail
fastify.get('/alerts/:id', async (request, reply) => {
  const detail = await alertDispatcher.getAlertDetail(request.params.id);
  if (!detail) {
    reply.status(404);
    return { error: 'Alert not found' };
  }
  return detail;
});

// Resolve alert
fastify.post('/alerts/:id/resolve', async (request, reply) => {
  try {
    const { notes } = request.body || {};
    const alert = await alertDispatcher.resolveAlert(request.params.id, notes || '');
    return alert;
  } catch (error) {
    reply.status(400);
    return { error: error.message };
  }
});

// Revert remediation
fastify.post('/alerts/:id/revert', async (request, reply) => {
  try {
    const result = await remediationEngine.revert(request.params.id);
    return result;
  } catch (error) {
    reply.status(400);
    return { error: error.message };
  }
});

// List baselines
fastify.get('/baselines', async (request) => {
  const { policy_name, metric_type, beacon_id } = request.query;
  const conditions = [];
  const params = [];
  let idx = 1;

  if (policy_name) {
    conditions.push(`policy_name = $${idx++}`);
    params.push(policy_name);
  }
  if (metric_type) {
    conditions.push(`metric_type = $${idx++}`);
    params.push(metric_type);
  }
  if (beacon_id) {
    conditions.push(`beacon_id = $${idx++}`);
    params.push(beacon_id);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await db.query(`
    SELECT DISTINCT ON (policy_name, metric_type, beacon_id) *
    FROM policy_baselines ${where}
    ORDER BY policy_name, metric_type, beacon_id, computed_at DESC
  `, params);

  return { baselines: result.rows, count: result.rows.length };
});

// List all policy configs
fastify.get('/config', async () => {
  const result = await db.query('SELECT * FROM policy_config ORDER BY policy_name');
  return { configs: result.rows };
});

// Update a policy config
fastify.put('/config/:policyName', async (request, reply) => {
  const { policyName } = request.params;
  const updates = request.body || {};

  const allowedFields = [
    'enabled', 'poll_interval_seconds', 'lookback_minutes',
    'thresholds', 'severity_rules',
    'alert_enabled', 'remediation_enabled', 'webhook_url',
  ];

  const setClauses = [];
  const params = [policyName];
  let idx = 2;

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      const value = (field === 'thresholds' || field === 'severity_rules')
        ? JSON.stringify(updates[field])
        : updates[field];
      setClauses.push(`${field} = $${idx++}`);
      params.push(value);
    }
  }

  if (setClauses.length === 0) {
    reply.status(400);
    return { error: 'No valid fields to update' };
  }

  const result = await db.query(`
    UPDATE policy_config SET ${setClauses.join(', ')}
    WHERE policy_name = $1
    RETURNING *
  `, params);

  if (result.rows.length === 0) {
    reply.status(404);
    return { error: `Policy config not found: ${policyName}` };
  }

  fastify.log.info({ policyName, updates: Object.keys(updates) }, 'Policy config updated');
  return result.rows[0];
});

// ─── Startup ───────────────────────────────────────────────────────────

async function start() {
  try {
    // Verify database connection
    await db.query('SELECT 1');
    fastify.log.info('Database connected');

    // Initialize all agents (load configs)
    await Promise.all(agents.map(a => a.init()));

    // Start scheduler
    startScheduler();

    // Run initial tick immediately
    tick();

    // Start HTTP server
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info({ port: PORT, agents: agents.length }, 'Policy service started');
  } catch (error) {
    fastify.log.error({ error: error.message }, 'Failed to start policy service');
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal) {
  fastify.log.info({ signal }, 'Shutting down...');
  stopScheduler();
  await fastify.close();
  await db.end();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
