/**
 * AlertDispatcher — Creates alerts, dispatches webhooks, writes audit trail
 *
 * Every anomaly detected by a policy agent flows through here.
 * The dispatcher:
 *   1. Inserts the alert into policy_alerts
 *   2. Writes an audit entry to policy_audit
 *   3. Dispatches a webhook (if configured) for external notifications
 */

export class AlertDispatcher {
  #db;
  #logger;

  /**
   * @param {import('pg').Pool} db
   * @param {object} logger - Pino-compatible logger
   */
  constructor(db, logger) {
    this.#db = db;
    this.#logger = logger.child({ component: 'alert-dispatcher' });
  }

  /**
   * Create a new alert
   *
   * @param {object} options
   * @param {string} options.policyName - Source policy agent
   * @param {string} options.alertType - e.g., 'heartbeat_missing', 'price_anomaly'
   * @param {string} options.severity - 'low' | 'medium' | 'high' | 'critical'
   * @param {string} [options.entityType] - 'beacon', 'session', 'transaction', 'platform'
   * @param {string} [options.entityId] - Entity UUID
   * @param {string} [options.beaconId] - Beacon UUID (for beacon-specific alerts)
   * @param {string} options.title - Short alert title
   * @param {string} [options.description] - Detailed description
   * @param {number} [options.observationValue] - What was observed
   * @param {number} [options.thresholdValue] - What the threshold was
   * @param {object} [options.metadata] - Additional data
   * @returns {object} Created alert row
   */
  async createAlert({
    policyName,
    alertType,
    severity,
    entityType = null,
    entityId = null,
    beaconId = null,
    title,
    description = null,
    observationValue = null,
    thresholdValue = null,
    metadata = {},
  }) {
    // Check for existing unresolved alert of the same type for the same entity
    // to avoid alert storms
    const existing = await this.#db.query(`
      SELECT id FROM policy_alerts
      WHERE policy_name = $1 AND alert_type = $2
        AND entity_id IS NOT DISTINCT FROM $3::uuid
        AND beacon_id IS NOT DISTINCT FROM $4::uuid
        AND resolved = FALSE
        AND created_at > NOW() - INTERVAL '1 hour'
      LIMIT 1
    `, [policyName, alertType, entityId, beaconId]);

    if (existing.rows.length > 0) {
      this.#logger.debug({
        policyName, alertType, entityId,
        existingAlertId: existing.rows[0].id,
      }, 'Duplicate alert suppressed');
      return existing.rows[0];
    }

    // Insert alert
    const result = await this.#db.query(`
      INSERT INTO policy_alerts (
        policy_name, alert_type, severity,
        entity_type, entity_id, beacon_id,
        title, description,
        observation_value, threshold_value, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      policyName, alertType, severity,
      entityType, entityId, beaconId,
      title, description,
      observationValue, thresholdValue,
      JSON.stringify(metadata),
    ]);

    const alert = result.rows[0];

    // Write audit entry
    await this.#writeAudit({
      action: 'alert_created',
      policyName,
      beaconId,
      alertId: alert.id,
      description: `[${severity.toUpperCase()}] ${title}`,
      newState: { alertType, severity, observationValue, thresholdValue },
    });

    this.#logger.warn({
      alertId: alert.id,
      policyName,
      alertType,
      severity,
      title,
    }, `Policy alert: ${title}`);

    // Dispatch webhook (fire and forget)
    this.#dispatchWebhook(policyName, alert).catch(err => {
      this.#logger.error({ error: err.message, alertId: alert.id }, 'Webhook dispatch failed');
    });

    return alert;
  }

  /**
   * Resolve an alert
   *
   * @param {string} alertId
   * @param {string} notes - Resolution notes
   * @returns {object} Updated alert row
   */
  async resolveAlert(alertId, notes = '') {
    const result = await this.#db.query(`
      UPDATE policy_alerts
      SET resolved = TRUE, resolved_at = NOW(), resolution_notes = $2
      WHERE id = $1
      RETURNING *
    `, [alertId, notes]);

    const alert = result.rows[0];
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    await this.#writeAudit({
      action: 'alert_resolved',
      policyName: alert.policy_name,
      beaconId: alert.beacon_id,
      alertId,
      description: `Resolved: ${notes}`,
      previousState: { resolved: false },
      newState: { resolved: true, resolution_notes: notes },
    });

    this.#logger.info({ alertId, policyName: alert.policy_name }, 'Alert resolved');
    return alert;
  }

  /**
   * List alerts with filters
   *
   * @param {object} filters
   * @returns {object[]} Alert rows
   */
  async listAlerts(filters = {}) {
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (filters.severity) {
      conditions.push(`severity = $${paramIndex++}`);
      params.push(filters.severity);
    }
    if (filters.policyName) {
      conditions.push(`policy_name = $${paramIndex++}`);
      params.push(filters.policyName);
    }
    if (filters.resolved !== undefined) {
      conditions.push(`resolved = $${paramIndex++}`);
      params.push(filters.resolved);
    }
    if (filters.since) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.since);
    }
    if (filters.beaconId) {
      conditions.push(`beacon_id = $${paramIndex++}`);
      params.push(filters.beaconId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 100;

    const result = await this.#db.query(`
      SELECT * FROM policy_alerts ${where}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `, params);

    return result.rows;
  }

  /**
   * Get a single alert with its audit trail
   *
   * @param {string} alertId
   * @returns {object} Alert with audit entries
   */
  async getAlertDetail(alertId) {
    const [alertResult, auditResult] = await Promise.all([
      this.#db.query('SELECT * FROM policy_alerts WHERE id = $1', [alertId]),
      this.#db.query(
        'SELECT * FROM policy_audit WHERE alert_id = $1 ORDER BY created_at ASC',
        [alertId]
      ),
    ]);

    const alert = alertResult.rows[0];
    if (!alert) return null;

    return {
      ...alert,
      auditTrail: auditResult.rows,
    };
  }

  // ─── Private ─────────────────────────────────────────────────────────

  async #writeAudit({ action, policyName, beaconId = null, alertId = null, description = null, previousState = null, newState = null }) {
    await this.#db.query(`
      INSERT INTO policy_audit (action, policy_name, beacon_id, alert_id, description, previous_state, new_state)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      action, policyName, beaconId, alertId, description,
      previousState ? JSON.stringify(previousState) : null,
      newState ? JSON.stringify(newState) : null,
    ]);
  }

  async #dispatchWebhook(policyName, alert) {
    // Load webhook URL from config
    const configResult = await this.#db.query(
      'SELECT webhook_url FROM policy_config WHERE policy_name = $1',
      [policyName]
    );

    const webhookUrl = configResult.rows[0]?.webhook_url;
    if (!webhookUrl) return;

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'policy_alert',
          alert: {
            id: alert.id,
            policyName: alert.policy_name,
            alertType: alert.alert_type,
            severity: alert.severity,
            title: alert.title,
            description: alert.description,
            observationValue: alert.observation_value,
            thresholdValue: alert.threshold_value,
            createdAt: alert.created_at,
          },
        }),
        signal: AbortSignal.timeout(5000),
      });

      this.#logger.info({
        alertId: alert.id,
        webhookUrl,
        statusCode: response.status,
      }, 'Webhook dispatched');
    } catch (error) {
      this.#logger.error({
        alertId: alert.id,
        webhookUrl,
        error: error.message,
      }, 'Webhook dispatch failed');
    }
  }
}
