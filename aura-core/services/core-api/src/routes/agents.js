/**
 * Agent Endpoints (Universal Identity — Scouts and Beacons)
 *
 * Domain: Client Integration & Management
 * - POST /agents/register — Register with Ed25519 proof-of-possession
 * - GET  /agents/:agentId — Get agent details
 * - POST /agents/:agentId/revoke — Revoke agent identity
 */

/**
 * Register agent routes as a Fastify plugin.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {object} opts - Shared dependencies
 */
export async function registerAgentRoutes(app, opts) {
  const {
    db,
    verifyAgent,
    verifyRegistrationSignature,
    computeKeyFingerprint,
    safeError,
    versionedHref,
    isValidUUID,
  } = opts;

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
}
