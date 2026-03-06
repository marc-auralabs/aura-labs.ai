/**
 * Throughput Monitor — Platform-Wide Rate Changes
 *
 * Monitors platform-wide session creation, offer submission, and
 * transaction commit rates for unusual drops or spikes.
 *
 * Uses the audit_log table for event counts per time window, compared
 * against rolling statistical baselines.
 *
 * Thresholds (configurable via policy_config):
 *   - drop_percent: Alert if throughput drops by this % (default: 30)
 *   - spike_percent: Alert if throughput spikes by this % (default: 50)
 *   - min_baseline_samples: Minimum baseline data points before alerting (default: 5)
 *
 * Remediation: Alert only. Platform-wide throughput changes need human
 * judgment — could be legitimate (time of day, marketing event) or
 * indicate infrastructure issues.
 */

import { PolicyAgent } from '../lib/policy-agent.js';

export class ThroughputMonitor extends PolicyAgent {
  constructor(deps) {
    super({ name: 'throughput_monitor', ...deps });
  }

  /**
   * Metrics to track
   */
  static METRICS = [
    { entityType: 'session', action: 'created', label: 'Session creation' },
    { entityType: 'negotiation', action: 'created', label: 'Offer submission' },
    { entityType: 'transaction', action: 'created', label: 'Transaction commit' },
  ];

  async detect() {
    const dropPercent = this.threshold('drop_percent', 30);
    const spikePercent = this.threshold('spike_percent', 50);
    const minSamples = this.threshold('min_baseline_samples', 5);
    const lookback = this.lookbackMinutes;

    for (const metric of ThroughputMonitor.METRICS) {
      await this.#checkMetric(metric, lookback, dropPercent, spikePercent, minSamples);
    }
  }

  async #checkMetric({ entityType, action, label }, lookbackMinutes, dropPercent, spikePercent, minSamples) {
    // Count events in the lookback window
    const countResult = await this.db.query(`
      SELECT COUNT(*) AS event_count
      FROM audit_log
      WHERE entity_type = $1 AND action = $2
        AND created_at >= NOW() - INTERVAL '1 minute' * $3
    `, [entityType, action, lookbackMinutes]);

    const currentCount = parseInt(countResult.rows[0]?.event_count || '0', 10);
    const metricKey = `${entityType}_${action}_rate`;

    // Get baseline
    const baseline = await this.getBaseline(metricKey, null);

    // Update baseline with current observation
    await this.updateBaselines(metricKey, null, [currentCount]);

    // Skip alerting if not enough baseline data
    if (!baseline || baseline.sample_count < minSamples) {
      this.logger.debug({
        metric: metricKey,
        currentCount,
        baselineSamples: baseline?.sample_count || 0,
        minSamples,
      }, 'Insufficient baseline data, skipping alert check');
      return;
    }

    const baselineMean = baseline.mean;

    // Skip if baseline mean is effectively zero (nothing to compare)
    if (baselineMean < 0.5) {
      return;
    }

    // Check for drop
    const changePercent = ((currentCount - baselineMean) / baselineMean) * 100;

    if (changePercent <= -dropPercent) {
      await this.createAlert({
        alertType: 'throughput_drop',
        severity: 'high',
        entityType: 'platform',
        title: `${label} rate dropped ${Math.abs(Math.round(changePercent))}%`,
        description: `${label} rate is ${currentCount} in the last ${lookbackMinutes} minutes, down ${Math.abs(Math.round(changePercent))}% from baseline mean of ${baselineMean.toFixed(1)}. This may indicate infrastructure issues, downstream service failures, or a sudden loss of traffic.`,
        observationValue: currentCount,
        thresholdValue: baselineMean * (1 - dropPercent / 100),
        metadata: {
          metricKey,
          baselineMean,
          baselineStddev: baseline.stddev,
          baselineSamples: baseline.sample_count,
          changePercent: Math.round(changePercent),
        },
      });
    }

    // Check for spike
    if (changePercent >= spikePercent) {
      await this.createAlert({
        alertType: 'throughput_spike',
        severity: 'medium',
        entityType: 'platform',
        title: `${label} rate spiked ${Math.round(changePercent)}%`,
        description: `${label} rate is ${currentCount} in the last ${lookbackMinutes} minutes, up ${Math.round(changePercent)}% from baseline mean of ${baselineMean.toFixed(1)}. This may indicate a marketing event, bot activity, or an unexpected surge.`,
        observationValue: currentCount,
        thresholdValue: baselineMean * (1 + spikePercent / 100),
        metadata: {
          metricKey,
          baselineMean,
          baselineStddev: baseline.stddev,
          baselineSamples: baseline.sample_count,
          changePercent: Math.round(changePercent),
        },
      });
    }

    this.logger.debug({
      metric: metricKey,
      currentCount,
      baselineMean: baselineMean.toFixed(1),
      changePercent: Math.round(changePercent),
    }, 'Throughput metric checked');
  }
}
