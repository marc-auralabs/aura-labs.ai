/**
 * Session Lifecycle Monitor — Stuck/Abandoned Session Detection
 *
 * Detects sessions that are stuck in intermediate states or have
 * zero offers after a reasonable time window.
 *
 * Thresholds (configurable via policy_config):
 *   - stuck_collecting_minutes: Session in 'active'/'negotiating' too long (default: 45)
 *   - zero_offers_minutes: Session active with no offers after N minutes (default: 60)
 *
 * Remediation: Alert only — sessions may be legitimately slow (few beacons,
 * niche products). No auto-remediation for sessions.
 */

import { PolicyAgent } from '../lib/policy-agent.js';

export class SessionLifecycleMonitor extends PolicyAgent {
  constructor(deps) {
    super({ name: 'session_lifecycle_monitor', ...deps });
  }

  async detect() {
    const stuckMinutes = this.threshold('stuck_collecting_minutes', 45);
    const zeroOffersMinutes = this.threshold('zero_offers_minutes', 60);

    // Find stuck sessions (in active/negotiating status for too long)
    const stuckResult = await this.db.query(`
      SELECT
        s.id,
        s.status,
        s.scout_id,
        s.created_at,
        EXTRACT(EPOCH FROM (NOW() - s.created_at)) / 60 AS age_minutes,
        (SELECT COUNT(*) FROM negotiations n WHERE n.session_id = s.id) AS offer_count
      FROM sessions s
      WHERE s.status IN ('active', 'negotiating')
        AND s.created_at < NOW() - INTERVAL '1 minute' * $1
      ORDER BY s.created_at ASC
    `, [stuckMinutes]);

    for (const session of stuckResult.rows) {
      const ageMinutes = Math.round(parseFloat(session.age_minutes));
      const offerCount = parseInt(session.offer_count, 10);

      if (offerCount === 0 && ageMinutes >= zeroOffersMinutes) {
        // Zero offers after threshold — low severity (might be niche intent)
        await this.createAlert({
          alertType: 'session_zero_offers',
          severity: 'low',
          entityType: 'session',
          entityId: session.id,
          title: `Session has zero offers after ${ageMinutes} minutes`,
          description: `Session ${session.id} (status: ${session.status}) has been active for ${ageMinutes} minutes with no offers. Scout: ${session.scout_id || 'unknown'}. This may indicate no matching beacons or a parsing issue with the intent.`,
          observationValue: ageMinutes,
          thresholdValue: zeroOffersMinutes,
          metadata: {
            sessionStatus: session.status,
            scoutId: session.scout_id,
            offerCount,
          },
        });
      } else {
        // Stuck in collecting_offers — medium severity
        await this.createAlert({
          alertType: 'session_stuck',
          severity: 'medium',
          entityType: 'session',
          entityId: session.id,
          title: `Session stuck in "${session.status}" for ${ageMinutes} minutes`,
          description: `Session ${session.id} has been in "${session.status}" status for ${ageMinutes} minutes (threshold: ${stuckMinutes}). Offers: ${offerCount}. Scout: ${session.scout_id || 'unknown'}.`,
          observationValue: ageMinutes,
          thresholdValue: stuckMinutes,
          metadata: {
            sessionStatus: session.status,
            scoutId: session.scout_id,
            offerCount,
          },
        });
      }
    }

    this.logger.info({
      stuckSessions: stuckResult.rows.length,
    }, 'Session lifecycle check complete');
  }
}
