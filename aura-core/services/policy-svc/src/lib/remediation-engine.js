/**
 * RemediationEngine — Auto-remediation with audit trail and revert
 *
 * When a policy agent detects a high/critical severity anomaly and
 * remediation is enabled, this engine applies corrective actions
 * (e.g., suspending a misbehaving beacon) and records full before/after
 * state so every action can be reverted.
 *
 * Safety gates:
 *   - Only acts if remediation_enabled=true in policy_config
 *   - Only acts if alert severity >= high
 *   - Every action writes before/after state to policy_audit
 *   - Every action is revertible via revert()
 */

export class RemediationEngine {
  #db;
  #logger;

  /**
   * @param {import('pg').Pool} db
   * @param {object} logger - Pino-compatible logger
   */
  constructor(db, logger) {
    this.#db = db;
    this.#logger = logger.child({ component: 'remediation-engine' });
  }

  /**
   * Supported remediation actions
   */
  static ACTIONS = {
    SUSPEND_BEACON: 'suspend_beacon',
  };

  /**
   * Apply an auto-remediation action
   *
   * @param {string} alertId - The alert triggering remediation
   * @param {string} action - The remediation action (e.g., 'suspend_beacon')
   * @param {string} policyName - Source policy agent
   * @returns {object|null} Remediation result or null if skipped
   */
  async applyRemediation(alertId, action, policyName) {
    // Load the alert
    const alertResult = await this.#db.query(
      'SELECT * FROM policy_alerts WHERE id = $1',
      [alertId]
    );
    const alert = alertResult.rows[0];
    if (!alert) {
      this.#logger.error({ alertId }, 'Alert not found for remediation');
      return null;
    }

    // Safety gate: only high/critical severity
    if (!['high', 'critical'].includes(alert.severity)) {
      this.#logger.info({
        alertId,
        severity: alert.severity,
      }, 'Remediation skipped — severity below threshold');
      return null;
    }

    // Check remediation is enabled for this policy
    const configResult = await this.#db.query(
      'SELECT remediation_enabled FROM policy_config WHERE policy_name = $1',
      [policyName]
    );
    if (!configResult.rows[0]?.remediation_enabled) {
      this.#logger.info({ alertId, policyName }, 'Remediation disabled for this policy');
      return null;
    }

    // Dispatch by action type
    let result;
    try {
      switch (action) {
        case RemediationEngine.ACTIONS.SUSPEND_BEACON:
          result = await this.#suspendBeacon(alert, policyName);
          break;
        default:
          this.#logger.error({ alertId, action }, 'Unknown remediation action');
          return null;
      }

      // Update alert with remediation status
      await this.#db.query(`
        UPDATE policy_alerts
        SET auto_remediation = TRUE,
            remediation_action = $2,
            remediation_status = 'applied',
            remediation_at = NOW()
        WHERE id = $1
      `, [alertId, action]);

      this.#logger.warn({
        alertId,
        action,
        policyName,
        result,
      }, 'Auto-remediation applied');

      return result;
    } catch (error) {
      // Mark remediation as failed
      await this.#db.query(`
        UPDATE policy_alerts
        SET auto_remediation = TRUE,
            remediation_action = $2,
            remediation_status = 'failed',
            remediation_at = NOW()
        WHERE id = $1
      `, [alertId, action]);

      this.#logger.error({
        alertId,
        action,
        error: error.message,
      }, 'Auto-remediation failed');

      return null;
    }
  }

  /**
   * Revert a previously applied remediation
   *
   * Restores the entity to its previous state using the audit trail.
   *
   * @param {string} alertId - The alert whose remediation to revert
   * @returns {object|null} Revert result or null if nothing to revert
   */
  async revert(alertId) {
    // Load the alert
    const alertResult = await this.#db.query(
      'SELECT * FROM policy_alerts WHERE id = $1',
      [alertId]
    );
    const alert = alertResult.rows[0];
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    if (alert.remediation_status !== 'applied') {
      throw new Error(`Cannot revert: remediation status is '${alert.remediation_status}'`);
    }

    // Find the remediation audit entry to get previous state
    const auditResult = await this.#db.query(`
      SELECT * FROM policy_audit
      WHERE alert_id = $1 AND action = 'remediation_applied'
      ORDER BY created_at DESC
      LIMIT 1
    `, [alertId]);

    const auditEntry = auditResult.rows[0];
    if (!auditEntry || !auditEntry.previous_state) {
      throw new Error('No previous state found in audit trail');
    }

    const previousState = auditEntry.previous_state;

    // Dispatch revert by action type
    switch (alert.remediation_action) {
      case RemediationEngine.ACTIONS.SUSPEND_BEACON:
        await this.#restoreBeaconStatus(alert, previousState);
        break;
      default:
        throw new Error(`Unknown remediation action to revert: ${alert.remediation_action}`);
    }

    // Update alert
    await this.#db.query(`
      UPDATE policy_alerts
      SET remediation_status = 'reverted'
      WHERE id = $1
    `, [alertId]);

    // Write audit entry for the revert
    await this.#db.query(`
      INSERT INTO policy_audit (action, policy_name, beacon_id, alert_id, description, previous_state, new_state)
      VALUES ('remediation_reverted', $1, $2, $3, $4, $5, $6)
    `, [
      alert.policy_name,
      alert.beacon_id,
      alertId,
      `Reverted ${alert.remediation_action}`,
      JSON.stringify({ status: 'suspended' }),
      JSON.stringify(previousState),
    ]);

    this.#logger.warn({
      alertId,
      action: alert.remediation_action,
      restoredState: previousState,
    }, 'Remediation reverted');

    return { reverted: true, previousState };
  }

  // ─── Action implementations ──────────────────────────────────────────

  async #suspendBeacon(alert, policyName) {
    const beaconId = alert.beacon_id || alert.entity_id;
    if (!beaconId) {
      throw new Error('No beacon ID on alert for suspend_beacon action');
    }

    // Capture current state before modification
    const currentResult = await this.#db.query(
      'SELECT id, status, name FROM beacons WHERE id = $1',
      [beaconId]
    );
    const beacon = currentResult.rows[0];
    if (!beacon) {
      throw new Error(`Beacon not found: ${beaconId}`);
    }

    const previousState = { status: beacon.status };

    // Suspend the beacon
    await this.#db.query(
      'UPDATE beacons SET status = $1 WHERE id = $2',
      ['suspended', beaconId]
    );

    // Write audit entry with full before/after
    await this.#db.query(`
      INSERT INTO policy_audit (action, policy_name, beacon_id, alert_id, description, previous_state, new_state)
      VALUES ('remediation_applied', $1, $2, $3, $4, $5, $6)
    `, [
      policyName,
      beaconId,
      alert.id,
      `Suspended beacon ${beacon.name} (${beaconId})`,
      JSON.stringify(previousState),
      JSON.stringify({ status: 'suspended' }),
    ]);

    return { beaconId, previousStatus: beacon.status, newStatus: 'suspended' };
  }

  async #restoreBeaconStatus(alert, previousState) {
    const beaconId = alert.beacon_id || alert.entity_id;
    if (!beaconId) {
      throw new Error('No beacon ID for restore');
    }

    const restoredStatus = previousState.status || 'active';

    await this.#db.query(
      'UPDATE beacons SET status = $1 WHERE id = $2',
      [restoredStatus, beaconId]
    );

    this.#logger.info({
      beaconId,
      restoredStatus,
    }, 'Beacon status restored');
  }
}
