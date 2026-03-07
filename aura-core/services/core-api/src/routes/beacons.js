/**
 * Beacon Endpoints
 *
 * Domain: Client Integration & Management
 * - POST /beacons/register — Register/update a beacon
 * - GET  /beacons/:beaconId — Get beacon details
 * - GET  /beacons/sessions  — Poll for available sessions (constraint-redacted)
 */

/**
 * Register beacon routes as a Fastify plugin.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {object} opts - Shared dependencies
 */
export async function registerBeaconRoutes(app, opts) {
  const { db, safeError, versionedHref } = opts;

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
}
