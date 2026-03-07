/**
 * Offer Endpoints
 *
 * Domain: Market Navigation
 * - POST /sessions/:sessionId/offers — Beacon submits an offer (atomic)
 * - GET  /sessions/:sessionId/offers — Scout retrieves offers
 */

/**
 * Register offer routes as a Fastify plugin.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {object} opts - Shared dependencies
 */
export async function registerOfferRoutes(app, opts) {
  const { db, verifyAgent, safeError, versionedHref, isValidUUID } = opts;

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
}
