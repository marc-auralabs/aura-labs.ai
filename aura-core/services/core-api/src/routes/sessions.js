/**
 * Session Endpoints (Core Commerce Flow)
 *
 * Domain: Market Navigation
 * - POST /sessions            — Create a commerce session with intent
 * - GET  /sessions/:sessionId — Get session details (with expiry enforcement)
 * - POST /sessions/:sessionId/cancel — Cancel a session
 */

/**
 * Register session routes as a Fastify plugin.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {object} opts - Shared dependencies
 */
export async function registerSessionRoutes(app, opts) {
  const {
    db,
    verifyAgent,
    safeError,
    versionedHref,
    isValidUUID,
    parseIntent,
    matchBeacons,
  } = opts;

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
}
