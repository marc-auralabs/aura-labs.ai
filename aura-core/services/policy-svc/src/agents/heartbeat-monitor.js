/**
 * Heartbeat Monitor — Agent Liveness Detection
 *
 * Detects agents (Beacons) that registered but stopped communicating.
 * Uses the beacons table (updated_at) and audit_log for activity signals.
 *
 * Thresholds (configurable via policy_config):
 *   - stale_minutes: No activity for N minutes → high severity alert (default: 30)
 *   - dead_minutes: No activity for N minutes → critical severity, suspend (default: 120)
 *
 * Remediation: Suspend the beacon (set status='suspended' in beacons table)
 * so it can't receive new sessions until an operator investigates.
 */

import { PolicyAgent } from '../lib/policy-agent.js';
import { RemediationEngine } from '../lib/remediation-engine.js';

export class HeartbeatMonitor extends PolicyAgent {
  constructor(deps) {
    super({ name: 'heartbeat_monitor', ...deps });
  }

  async detect() {
    const staleMinutes = this.threshold('stale_minutes', 30);
    const deadMinutes = this.threshold('dead_minutes', 120);

    // Find active beacons with no recent activity
    const result = await this.db.query(`
      SELECT
        b.id,
        b.name,
        b.external_id,
        b.status,
        b.updated_at,
        EXTRACT(EPOCH FROM (NOW() - b.updated_at)) / 60 AS minutes_since_update,
        (
          SELECT MAX(al.created_at)
          FROM audit_log al
          WHERE al.entity_type = 'beacon' AND al.entity_id = b.id
        ) AS last_audit_activity
      FROM beacons b
      WHERE b.status = 'active'
      ORDER BY b.updated_at ASC
    `);

    for (const beacon of result.rows) {
      const minutesSinceUpdate = parseFloat(beacon.minutes_since_update) || 0;

      // Determine most recent activity from either source
      const lastActivity = beacon.last_audit_activity
        ? new Date(Math.max(
            new Date(beacon.updated_at).getTime(),
            new Date(beacon.last_audit_activity).getTime()
          ))
        : new Date(beacon.updated_at);

      const minutesSinceActivity =
        (Date.now() - lastActivity.getTime()) / (1000 * 60);

      if (minutesSinceActivity >= deadMinutes) {
        // Critical — beacon appears dead
        const alert = await this.createAlert({
          alertType: 'heartbeat_dead',
          severity: 'critical',
          entityType: 'beacon',
          entityId: beacon.id,
          beaconId: beacon.id,
          title: `Beacon "${beacon.name}" unresponsive for ${Math.round(minutesSinceActivity)} minutes`,
          description: `Beacon ${beacon.external_id} (${beacon.id}) has not communicated with Core for ${Math.round(minutesSinceActivity)} minutes. Last activity: ${lastActivity.toISOString()}. Threshold: ${deadMinutes} minutes.`,
          observationValue: minutesSinceActivity,
          thresholdValue: deadMinutes,
          metadata: {
            beaconName: beacon.name,
            externalId: beacon.external_id,
            lastActivity: lastActivity.toISOString(),
          },
        });

        // Auto-remediate: suspend the beacon
        if (alert && alert.id) {
          await this.applyRemediation(alert.id, RemediationEngine.ACTIONS.SUSPEND_BEACON);
        }
      } else if (minutesSinceActivity >= staleMinutes) {
        // High — beacon is stale
        await this.createAlert({
          alertType: 'heartbeat_stale',
          severity: 'high',
          entityType: 'beacon',
          entityId: beacon.id,
          beaconId: beacon.id,
          title: `Beacon "${beacon.name}" stale — no activity for ${Math.round(minutesSinceActivity)} minutes`,
          description: `Beacon ${beacon.external_id} (${beacon.id}) has not communicated for ${Math.round(minutesSinceActivity)} minutes. Last activity: ${lastActivity.toISOString()}. Threshold: ${staleMinutes} minutes.`,
          observationValue: minutesSinceActivity,
          thresholdValue: staleMinutes,
          metadata: {
            beaconName: beacon.name,
            externalId: beacon.external_id,
            lastActivity: lastActivity.toISOString(),
          },
        });
      }
    }

    this.logger.info({
      beaconsChecked: result.rows.length,
    }, 'Heartbeat check complete');
  }
}
