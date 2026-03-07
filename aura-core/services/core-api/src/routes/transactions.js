/**
 * Transaction Endpoints
 *
 * Domain: Transaction Services
 * - POST /sessions/:sessionId/commit       — Commit to an offer (atomic, idempotent)
 * - GET  /transactions/:transactionId       — Get transaction details
 * - PUT  /transactions/:transactionId/fulfillment — Report fulfillment status (atomic)
 * - PUT  /transactions/:transactionId/payment     — Report payment status (atomic)
 */

/**
 * Register transaction routes as a Fastify plugin.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {object} opts - Shared dependencies
 */
export async function registerTransactionRoutes(app, opts) {
  const { db, verifyAgent, safeError, versionedHref, isValidUUID, dispatchWebhook } = opts;

  app.post('/sessions/:sessionId/commit', { preHandler: verifyAgent }, async (request, reply) => {
    const { sessionId } = request.params;
    const { offerId, idempotencyKey } = request.body || {};

    // SECURITY: Validate UUID format
    if (!isValidUUID(sessionId)) {
      reply.code(400);
      return { error: 'invalid_parameter', message: 'Invalid sessionId format. Expected UUID.' };
    }

    if (!db) {
      reply.code(503);
      return { error: 'database_unavailable' };
    }

    if (!offerId) {
      reply.code(400);
      return { error: 'missing_offer_id', message: 'offerId is required' };
    }

    // SECURITY: Idempotency key is mandatory for transaction commits
    if (!idempotencyKey) {
      reply.code(400);
      return { error: 'missing_idempotency_key', message: 'idempotencyKey is required for transaction commits. Generate a UUID v4 client-side.' };
    }

    // SECURITY: Validate idempotency key format (must be UUID)
    if (!isValidUUID(idempotencyKey)) {
      reply.code(400);
      return { error: 'invalid_idempotency_key', message: 'idempotencyKey must be a valid UUID v4.' };
    }

    // SECURITY: Validate offerId is UUID
    if (!isValidUUID(offerId)) {
      reply.code(400);
      return { error: 'invalid_parameter', message: 'Invalid offerId format. Expected UUID.' };
    }

    try {
      // TRUE IDEMPOTENCY: If idempotency key provided, return existing transaction
      if (idempotencyKey) {
        const existing = await db.query(
          `SELECT t.*, b.name as beacon_name
           FROM transactions t JOIN beacons b ON t.beacon_id = b.id
           WHERE t.idempotency_key = $1`,
          [idempotencyKey]
        );
        if (existing.rows.length > 0) {
          const tx = existing.rows[0];
          return {
            transactionId: tx.id,
            sessionId: tx.session_id,
            offerId: tx.offer_id,
            beaconId: tx.beacon_id,
            beaconName: tx.beacon_name,
            status: tx.status,
            finalTerms: tx.final_terms,
            createdAt: tx.created_at,
            _links: {
              self: { href: versionedHref(request, `/transactions/${tx.id}`) },
              session: { href: versionedHref(request, `/sessions/${tx.session_id}`) },
            },
          };
        }
      }

      // ATOMIC COMMIT: Acquire a dedicated client for the transaction
      const client = await db.connect();
      let transaction, offer, session;

      try {
        await client.query('BEGIN');

        // Lock the session row — serializes concurrent commits
        const sessionResult = await client.query(
          'SELECT * FROM sessions WHERE id = $1 FOR UPDATE',
          [sessionId]
        );
        if (sessionResult.rows.length === 0) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { error: 'session_not_found' };
        }

        session = sessionResult.rows[0];

        // SECURITY: Reject commits to expired sessions
        if (session.expires_at && new Date(session.expires_at) < new Date() &&
            !['committed', 'completed'].includes(session.status)) {
          await client.query('UPDATE sessions SET status = $1 WHERE id = $2', ['expired', sessionId]);
          await client.query('COMMIT');
          reply.code(400);
          return { error: 'session_expired', message: 'Session has expired' };
        }

        // SECURITY: Reject if already committed (after acquiring lock)
        if (session.status === 'committed' || session.status === 'completed' || session.status === 'cancelled') {
          await client.query('ROLLBACK');
          reply.code(400);
          return { error: 'session_not_committable', message: `Session status is ${session.status}` };
        }

        // Lock the offer row too
        const offerResult = await client.query(
          'SELECT o.*, b.name as beacon_name, b.endpoint_url as beacon_endpoint_url FROM offers o JOIN beacons b ON o.beacon_id = b.id WHERE o.id = $1 AND o.session_id = $2 FOR UPDATE OF o',
          [offerId, sessionId]
        );
        if (offerResult.rows.length === 0) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { error: 'offer_not_found' };
        }

        offer = offerResult.rows[0];

        // Create transaction (atomic with session/offer updates)
        // Use agent_id from the authenticated request; fall back to session's agent_id or legacy scout_id
        const commitAgentId = request.agent?.id || session.agent_id || null;
        const txResult = await client.query(
          `INSERT INTO transactions (session_id, offer_id, beacon_id, agent_id, scout_id, status, final_terms, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, status, created_at`,
          [sessionId, offerId, offer.beacon_id, commitAgentId, session.scout_id, 'committed', {
            product: offer.product,
            totalPrice: offer.total_price,
            currency: offer.currency,
            deliveryDate: offer.delivery_date,
            terms: offer.terms,
          }, idempotencyKey]
        );

        transaction = txResult.rows[0];

        // Update session and offer status — all within the same transaction
        await client.query('UPDATE sessions SET status = $1 WHERE id = $2', ['committed', sessionId]);
        await client.query('UPDATE offers SET status = $1 WHERE id = $2', ['accepted', offerId]);
        await client.query('UPDATE offers SET status = $1 WHERE session_id = $2 AND id != $3', ['rejected', sessionId, offerId]);

        // Audit log — inside the transaction for consistency
        await client.query(
          `INSERT INTO audit_log (entity_type, entity_id, action, new_state, changed_by, request_id) VALUES ($1, $2, $3, $4, $5, $6)`,
          ['transaction', transaction.id, 'committed', { offerId, beaconId: offer.beacon_id, agentId: commitAgentId }, commitAgentId || session.scout_id || 'anonymous', request.requestId]
        );

        await client.query('COMMIT');
      } catch (innerError) {
        await client.query('ROLLBACK').catch(() => {});
        throw innerError;
      } finally {
        client.release();
      }

      // Structured activity logging (outside transaction)
      request.log.info({
        event: 'session.committed',
        sessionId,
        offerId,
        transactionId: transaction.id,
      });

      // Dispatch webhook to beacon (fire-and-forget, outside transaction)
      if (offer.beacon_endpoint_url) {
        dispatchWebhook(
          { id: offer.beacon_id, endpoint_url: offer.beacon_endpoint_url, name: offer.beacon_name },
          'transaction.committed',
          {
            transactionId: transaction.id,
            sessionId,
            offerId,
            finalTerms: {
              product: offer.product,
              totalPrice: parseFloat(offer.total_price),
              currency: offer.currency,
              deliveryDate: offer.delivery_date,
            },
          },
          app.log
        );
      }

      return {
        transactionId: transaction.id,
        sessionId,
        offerId,
        beaconId: offer.beacon_id,
        beaconName: offer.beacon_name,
        status: transaction.status,
        finalTerms: {
          product: offer.product,
          totalPrice: parseFloat(offer.total_price),
          currency: offer.currency,
          deliveryDate: offer.delivery_date,
        },
        createdAt: transaction.created_at,
        _links: {
          self: { href: versionedHref(request, `/transactions/${transaction.id}`) },
          session: { href: versionedHref(request, `/sessions/${sessionId}`) },
        },
      };
    } catch (error) {
      app.log.error(error);
      if (error.code === '23505') { // unique constraint violation (idempotency key race)
        // Another request won the race — look up and return the existing transaction
        if (idempotencyKey) {
          const existing = await db.query(
            `SELECT t.*, b.name as beacon_name
             FROM transactions t JOIN beacons b ON t.beacon_id = b.id
             WHERE t.idempotency_key = $1`,
            [idempotencyKey]
          );
          if (existing.rows.length > 0) {
            const tx = existing.rows[0];
            return {
              transactionId: tx.id, sessionId: tx.session_id, offerId: tx.offer_id,
              beaconId: tx.beacon_id, beaconName: tx.beacon_name,
              status: tx.status, finalTerms: tx.final_terms, createdAt: tx.created_at,
              _links: { self: { href: versionedHref(request, `/transactions/${tx.id}`) }, session: { href: versionedHref(request, `/sessions/${tx.session_id}`) } },
            };
          }
        }
        reply.code(409);
        return { error: 'duplicate_transaction', message: 'Transaction with this idempotency key already exists' };
      }
      reply.code(500);
      return { error: 'commit_failed', message: safeError(error, 'Transaction commit failed') };
    }
  });

  // Get transaction details (Scout or Beacon can query)
  app.get('/transactions/:transactionId', async (request, reply) => {
    const { transactionId } = request.params;

    if (!isValidUUID(transactionId)) {
      reply.code(400);
      return { error: 'invalid_parameter', message: 'Invalid transactionId format. Expected UUID.' };
    }

    if (!db) {
      reply.code(503);
      return { error: 'database_unavailable' };
    }

    try {
      const result = await db.query(
        `SELECT t.*, b.name as beacon_name, b.external_id as beacon_external_id
         FROM transactions t
         JOIN beacons b ON t.beacon_id = b.id
         WHERE t.id = $1`,
        [transactionId]
      );

      if (result.rows.length === 0) {
        reply.code(404);
        return { error: 'not_found', message: 'Transaction not found' };
      }

      const tx = result.rows[0];

      return {
        transactionId: tx.id,
        sessionId: tx.session_id,
        offerId: tx.offer_id,
        beaconId: tx.beacon_id,
        beaconName: tx.beacon_name,
        agentId: tx.agent_id || tx.scout_id,
        scoutId: tx.scout_id,  // Legacy — use agentId
        status: tx.status,
        finalTerms: tx.final_terms,
        paymentStatus: tx.payment_status,
        paymentReference: tx.payment_reference,
        fulfillmentStatus: tx.fulfillment_status,
        fulfillmentReference: tx.fulfillment_reference,
        createdAt: tx.created_at,
        updatedAt: tx.updated_at,
        completedAt: tx.completed_at,
        _links: {
          self: { href: versionedHref(request, `/transactions/${tx.id}`) },
          session: { href: versionedHref(request, `/sessions/${tx.session_id}`) },
          fulfillment: { href: versionedHref(request, `/transactions/${tx.id}/fulfillment`), methods: ['PUT'] },
          payment: { href: versionedHref(request, `/transactions/${tx.id}/payment`), methods: ['PUT'] },
        },
      };
    } catch (error) {
      app.log.error(error);
      reply.code(500);
      return { error: 'fetch_failed', message: safeError(error, 'Resource fetch failed') };
    }
  });

  // Beacon reports fulfillment status
  app.put('/transactions/:transactionId/fulfillment', { preHandler: verifyAgent }, async (request, reply) => {
    const { transactionId } = request.params;
    const { fulfillmentStatus, fulfillmentReference, metadata } = request.body || {};

    if (!isValidUUID(transactionId)) {
      reply.code(400);
      return { error: 'invalid_parameter', message: 'Invalid transactionId format. Expected UUID.' };
    }

    if (!fulfillmentStatus) {
      reply.code(400);
      return { error: 'missing_fields', message: 'fulfillmentStatus is required' };
    }

    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'failed'];
    if (!validStatuses.includes(fulfillmentStatus)) {
      reply.code(400);
      return { error: 'invalid_status', message: `fulfillmentStatus must be one of: ${validStatuses.join(', ')}` };
    }

    if (!db) {
      reply.code(503);
      return { error: 'database_unavailable' };
    }

    try {
      // ATOMIC: Lock transaction row to prevent concurrent fulfillment/payment races
      const client = await db.connect();
      let tx, newStatus;

      try {
        await client.query('BEGIN');

        const txResult = await client.query(
          'SELECT * FROM transactions WHERE id = $1 FOR UPDATE',
          [transactionId]
        );
        if (txResult.rows.length === 0) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { error: 'not_found', message: 'Transaction not found' };
        }

        tx = txResult.rows[0];

        // Auto-transition transaction status
        newStatus = tx.status;
        if (fulfillmentStatus === 'delivered') {
          // Also check if payment already charged → completed
          newStatus = tx.payment_status === 'charged' ? 'completed' : 'fulfilled';
        }

        await client.query(
          `UPDATE transactions
           SET fulfillment_status = $1, fulfillment_reference = $2,
               status = $3, updated_at = NOW()
           WHERE id = $4`,
          [fulfillmentStatus, fulfillmentReference || null, newStatus, transactionId]
        );

        // Audit log inside transaction
        await client.query(
          `INSERT INTO audit_log (entity_type, entity_id, action, previous_state, new_state, changed_by, request_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          ['transaction', transactionId, 'fulfillment_updated',
           { fulfillmentStatus: tx.fulfillment_status, status: tx.status },
           { fulfillmentStatus, status: newStatus },
           tx.beacon_id,
           request.requestId]
        );

        await client.query('COMMIT');
      } catch (innerError) {
        await client.query('ROLLBACK').catch(() => {});
        throw innerError;
      } finally {
        client.release();
      }

      // Structured activity logging (outside transaction)
      request.log.info({
        event: 'fulfillment.updated',
        transactionId,
        status: fulfillmentStatus,
      });

      // Dispatch webhook (fire-and-forget, outside transaction)
      const beaconResult = await db.query('SELECT id, endpoint_url, name FROM beacons WHERE id = $1', [tx.beacon_id]);
      if (beaconResult.rows.length > 0) {
        dispatchWebhook(beaconResult.rows[0], 'fulfillment.updated', {
          transactionId,
          sessionId: tx.session_id,
          fulfillmentStatus,
          fulfillmentReference: fulfillmentReference || null,
          status: newStatus,
        }, app.log);
      }

      return {
        transactionId,
        status: newStatus,
        fulfillmentStatus,
        fulfillmentReference: fulfillmentReference || null,
        updatedAt: new Date().toISOString(),
        _links: {
          self: { href: versionedHref(request, `/transactions/${transactionId}`) },
          session: { href: versionedHref(request, `/sessions/${tx.session_id}`) },
        },
      };
    } catch (error) {
      app.log.error(error);
      reply.code(500);
      return { error: 'update_failed', message: safeError(error, 'Update failed') };
    }
  });

  // Beacon or payment processor reports payment status
  app.put('/transactions/:transactionId/payment', { preHandler: verifyAgent }, async (request, reply) => {
    const { transactionId } = request.params;
    const { paymentStatus, paymentReference, amount, currency } = request.body || {};

    if (!isValidUUID(transactionId)) {
      reply.code(400);
      return { error: 'invalid_parameter', message: 'Invalid transactionId format. Expected UUID.' };
    }

    if (!paymentStatus) {
      reply.code(400);
      return { error: 'missing_fields', message: 'paymentStatus is required' };
    }

    const validStatuses = ['pending', 'authorized', 'charged', 'refunded', 'failed'];
    if (!validStatuses.includes(paymentStatus)) {
      reply.code(400);
      return { error: 'invalid_status', message: `paymentStatus must be one of: ${validStatuses.join(', ')}` };
    }

    if (!db) {
      reply.code(503);
      return { error: 'database_unavailable' };
    }

    try {
      // ATOMIC: Lock transaction row to prevent concurrent payment/fulfillment races
      const client = await db.connect();
      let tx, newStatus;

      try {
        await client.query('BEGIN');

        const txResult = await client.query(
          'SELECT * FROM transactions WHERE id = $1 FOR UPDATE',
          [transactionId]
        );
        if (txResult.rows.length === 0) {
          await client.query('ROLLBACK');
          reply.code(404);
          return { error: 'not_found', message: 'Transaction not found' };
        }

        tx = txResult.rows[0];

        // Auto-transition: if fulfilled + charged → completed
        newStatus = tx.status;
        if (paymentStatus === 'charged' && tx.fulfillment_status === 'delivered') {
          newStatus = 'completed';
        }

        await client.query(
          `UPDATE transactions
           SET payment_status = $1, payment_reference = $2,
               status = $3, updated_at = NOW()
           WHERE id = $4`,
          [paymentStatus, paymentReference || null, newStatus, transactionId]
        );

        // Audit log inside transaction
        await client.query(
          `INSERT INTO audit_log (entity_type, entity_id, action, previous_state, new_state, changed_by, request_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          ['transaction', transactionId, 'payment_updated',
           { paymentStatus: tx.payment_status, status: tx.status },
           { paymentStatus, status: newStatus },
           tx.beacon_id,
           request.requestId]
        );

        await client.query('COMMIT');
      } catch (innerError) {
        await client.query('ROLLBACK').catch(() => {});
        throw innerError;
      } finally {
        client.release();
      }

      // Dispatch webhook (fire-and-forget, outside transaction)
      const beaconResult = await db.query('SELECT id, endpoint_url, name FROM beacons WHERE id = $1', [tx.beacon_id]);
      if (beaconResult.rows.length > 0) {
        dispatchWebhook(beaconResult.rows[0], 'payment.updated', {
          transactionId,
          sessionId: tx.session_id,
          paymentStatus,
          paymentReference: paymentReference || null,
          status: newStatus,
        }, app.log);
      }

      return {
        transactionId,
        status: newStatus,
        paymentStatus,
        paymentReference: paymentReference || null,
        updatedAt: new Date().toISOString(),
        _links: {
          self: { href: versionedHref(request, `/transactions/${transactionId}`) },
          session: { href: versionedHref(request, `/sessions/${tx.session_id}`) },
        },
      };
    } catch (error) {
      app.log.error(error);
      reply.code(500);
      return { error: 'update_failed', message: safeError(error, 'Update failed') };
    }
  });
}
