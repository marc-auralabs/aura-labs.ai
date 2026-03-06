/**
 * Transaction Health Monitor — Stuck Payments/Fulfillment & Failure Spikes
 *
 * Detects transactions stuck in intermediate states and spikes
 * in payment/fulfillment failures.
 *
 * Thresholds (configurable via policy_config):
 *   - stuck_payment_minutes: Committed but no payment after N min (default: 60)
 *   - stuck_fulfillment_minutes: Paid but not fulfilled after N min (default: 120)
 *   - failure_spike_count: Payment failures per hour triggering alert (default: 10)
 *
 * Remediation: Alert + recommend for stuck transactions.
 * Alert only for failure spikes (need human judgment).
 */

import { PolicyAgent } from '../lib/policy-agent.js';

export class TransactionHealthMonitor extends PolicyAgent {
  constructor(deps) {
    super({ name: 'transaction_health_monitor', ...deps });
  }

  async detect() {
    const stuckPaymentMinutes = this.threshold('stuck_payment_minutes', 60);
    const stuckFulfillmentMinutes = this.threshold('stuck_fulfillment_minutes', 120);
    const failureSpikeCount = this.threshold('failure_spike_count', 10);

    await Promise.all([
      this.#detectStuckPayments(stuckPaymentMinutes),
      this.#detectStuckFulfillment(stuckFulfillmentMinutes),
      this.#detectFailureSpikes(failureSpikeCount),
    ]);
  }

  async #detectStuckPayments(thresholdMinutes) {
    // Transactions committed but payment_status still pending/null
    const result = await this.db.query(`
      SELECT
        t.id,
        t.session_id,
        t.beacon_id,
        t.status,
        t.payment_status,
        t.created_at,
        EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 60 AS age_minutes,
        b.name AS beacon_name
      FROM transactions t
      JOIN beacons b ON b.id = t.beacon_id
      WHERE t.status = 'pending'
        AND (t.payment_status IS NULL OR t.payment_status = 'pending')
        AND t.created_at < NOW() - INTERVAL '1 minute' * $1
    `, [thresholdMinutes]);

    for (const tx of result.rows) {
      const ageMinutes = Math.round(parseFloat(tx.age_minutes));

      await this.createAlert({
        alertType: 'stuck_payment',
        severity: 'high',
        entityType: 'transaction',
        entityId: tx.id,
        beaconId: tx.beacon_id,
        title: `Transaction stuck — no payment after ${ageMinutes} minutes`,
        description: `Transaction ${tx.id} (beacon: ${tx.beacon_name}) has been pending for ${ageMinutes} minutes with no payment. Status: ${tx.status}, payment: ${tx.payment_status || 'null'}. Session: ${tx.session_id}.`,
        observationValue: ageMinutes,
        thresholdValue: thresholdMinutes,
        metadata: {
          beaconName: tx.beacon_name,
          sessionId: tx.session_id,
          transactionStatus: tx.status,
          paymentStatus: tx.payment_status,
        },
      });
    }

    this.logger.info({ stuckPayments: result.rows.length }, 'Stuck payment check complete');
  }

  async #detectStuckFulfillment(thresholdMinutes) {
    // Transactions paid but fulfillment_status still pending/null
    const result = await this.db.query(`
      SELECT
        t.id,
        t.session_id,
        t.beacon_id,
        t.status,
        t.payment_status,
        t.fulfillment_status,
        t.created_at,
        EXTRACT(EPOCH FROM (NOW() - t.updated_at)) / 60 AS minutes_since_update,
        b.name AS beacon_name
      FROM transactions t
      JOIN beacons b ON b.id = t.beacon_id
      WHERE t.payment_status = 'paid'
        AND (t.fulfillment_status IS NULL OR t.fulfillment_status IN ('pending', 'processing'))
        AND t.updated_at < NOW() - INTERVAL '1 minute' * $1
    `, [thresholdMinutes]);

    for (const tx of result.rows) {
      const minutesSinceUpdate = Math.round(parseFloat(tx.minutes_since_update));

      await this.createAlert({
        alertType: 'stuck_fulfillment',
        severity: 'medium',
        entityType: 'transaction',
        entityId: tx.id,
        beaconId: tx.beacon_id,
        title: `Transaction paid but unfulfilled for ${minutesSinceUpdate} minutes`,
        description: `Transaction ${tx.id} (beacon: ${tx.beacon_name}) was paid but fulfillment has stalled for ${minutesSinceUpdate} minutes. Fulfillment status: ${tx.fulfillment_status || 'null'}.`,
        observationValue: minutesSinceUpdate,
        thresholdValue: thresholdMinutes,
        metadata: {
          beaconName: tx.beacon_name,
          sessionId: tx.session_id,
          fulfillmentStatus: tx.fulfillment_status,
        },
      });
    }

    this.logger.info({ stuckFulfillment: result.rows.length }, 'Stuck fulfillment check complete');
  }

  async #detectFailureSpikes(spikeThreshold) {
    // Count payment failures in the last hour
    const result = await this.db.query(`
      SELECT
        COUNT(*) AS failure_count,
        t.beacon_id,
        b.name AS beacon_name
      FROM transactions t
      JOIN beacons b ON b.id = t.beacon_id
      WHERE t.payment_status = 'failed'
        AND t.updated_at >= NOW() - INTERVAL '1 hour'
      GROUP BY t.beacon_id, b.name
      HAVING COUNT(*) >= $1
    `, [spikeThreshold]);

    for (const row of result.rows) {
      const failureCount = parseInt(row.failure_count, 10);

      await this.createAlert({
        alertType: 'payment_failure_spike',
        severity: 'high',
        entityType: 'beacon',
        entityId: row.beacon_id,
        beaconId: row.beacon_id,
        title: `Payment failure spike — ${failureCount} failures in last hour (beacon: ${row.beacon_name})`,
        description: `Beacon ${row.beacon_name} (${row.beacon_id}) has ${failureCount} payment failures in the last hour. Threshold: ${spikeThreshold}. This may indicate a payment integration issue.`,
        observationValue: failureCount,
        thresholdValue: spikeThreshold,
        metadata: {
          beaconName: row.beacon_name,
        },
      });
    }

    // Platform-wide failure count
    const platformResult = await this.db.query(`
      SELECT COUNT(*) AS total_failures
      FROM transactions
      WHERE payment_status = 'failed'
        AND updated_at >= NOW() - INTERVAL '1 hour'
    `);

    const totalFailures = parseInt(platformResult.rows[0]?.total_failures || '0', 10);

    // Update baseline for platform-wide failures
    if (totalFailures > 0) {
      await this.updateBaselines('payment_failures_hourly', null, [totalFailures]);
    }

    this.logger.info({
      beaconsWithSpikes: result.rows.length,
      totalFailures,
    }, 'Failure spike check complete');
  }
}
