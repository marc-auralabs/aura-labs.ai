/**
 * BaselineCalculator — Statistical engine for policy agents
 *
 * Computes rolling statistical baselines (mean, stddev, percentiles)
 * from numeric data samples. Stores results in the policy_baselines table
 * so agents can compare current observations against historical norms.
 *
 * Pure math — no domain logic. Each policy agent decides what data
 * to feed in and how to interpret the output.
 */

export class BaselineCalculator {
  #db;
  #logger;

  /**
   * @param {import('pg').Pool} db
   * @param {object} logger - Pino-compatible logger
   */
  constructor(db, logger) {
    this.#db = db;
    this.#logger = logger.child({ component: 'baseline-calculator' });
  }

  /**
   * Compute and store baselines from a set of numeric samples
   *
   * @param {string} policyName - Which policy agent owns this baseline
   * @param {string} metricType - What metric (e.g., 'offer_rate', 'avg_price')
   * @param {string|null} beaconId - Beacon ID or null for platform-wide
   * @param {number[]} data - Array of numeric samples
   * @param {number} windowSizeMinutes - Window these samples represent
   * @returns {object} Computed baseline stats
   */
  async computeBaselines(policyName, metricType, beaconId, data, windowSizeMinutes = 60) {
    if (!data || data.length === 0) {
      this.#logger.debug({ policyName, metricType, beaconId }, 'No data for baseline computation');
      return null;
    }

    const sorted = [...data].sort((a, b) => a - b);
    const stats = {
      sampleCount: sorted.length,
      mean: this.#mean(sorted),
      stddev: this.#stddev(sorted),
      p50: this.#percentile(sorted, 50),
      p95: this.#percentile(sorted, 95),
      p99: this.#percentile(sorted, 99),
      minValue: sorted[0],
      maxValue: sorted[sorted.length - 1],
    };

    // Upsert into policy_baselines (keyed on policy_name + metric_type + beacon_id)
    await this.#db.query(`
      INSERT INTO policy_baselines (
        policy_name, metric_type, beacon_id, window_size_minutes,
        sample_count, mean, stddev, p50, p95, p99, min_value, max_value, computed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      ON CONFLICT (policy_name, metric_type, COALESCE(beacon_id, '00000000-0000-0000-0000-000000000000'))
      DO UPDATE SET
        sample_count = EXCLUDED.sample_count,
        mean = EXCLUDED.mean,
        stddev = EXCLUDED.stddev,
        p50 = EXCLUDED.p50,
        p95 = EXCLUDED.p95,
        p99 = EXCLUDED.p99,
        min_value = EXCLUDED.min_value,
        max_value = EXCLUDED.max_value,
        window_size_minutes = EXCLUDED.window_size_minutes,
        computed_at = NOW()
    `, [
      policyName, metricType, beaconId, windowSizeMinutes,
      stats.sampleCount, stats.mean, stats.stddev,
      stats.p50, stats.p95, stats.p99,
      stats.minValue, stats.maxValue,
    ]);

    this.#logger.info({
      policyName, metricType, beaconId,
      samples: stats.sampleCount,
      mean: stats.mean.toFixed(2),
      stddev: stats.stddev.toFixed(2),
    }, 'Baseline computed');

    return stats;
  }

  /**
   * Retrieve the most recent baseline for a metric
   *
   * @param {string} policyName
   * @param {string} metricType
   * @param {string|null} beaconId
   * @returns {object|null} Baseline stats or null if none exists
   */
  async getBaseline(policyName, metricType, beaconId = null) {
    const result = await this.#db.query(`
      SELECT * FROM policy_baselines
      WHERE policy_name = $1 AND metric_type = $2
        AND ($3::uuid IS NULL AND beacon_id IS NULL OR beacon_id = $3::uuid)
      ORDER BY computed_at DESC
      LIMIT 1
    `, [policyName, metricType, beaconId]);

    return result.rows[0] || null;
  }

  /**
   * Check if a value is anomalous compared to baseline
   *
   * @param {number} value - Observed value
   * @param {object} baseline - Baseline from getBaseline()
   * @param {number} sigmaThreshold - Number of standard deviations (default: 2)
   * @returns {{ isAnomaly: boolean, deviations: number, direction: string }}
   */
  checkAnomaly(value, baseline, sigmaThreshold = 2) {
    if (!baseline || !baseline.stddev || baseline.stddev === 0) {
      return { isAnomaly: false, deviations: 0, direction: 'none' };
    }

    const deviations = (value - baseline.mean) / baseline.stddev;
    const isAnomaly = Math.abs(deviations) >= sigmaThreshold;
    const direction = deviations > 0 ? 'above' : deviations < 0 ? 'below' : 'none';

    return { isAnomaly, deviations: Math.round(deviations * 100) / 100, direction };
  }

  // ─── Pure math ───────────────────────────────────────────────────────

  #mean(sorted) {
    if (sorted.length === 0) return 0;
    const sum = sorted.reduce((a, b) => a + b, 0);
    return sum / sorted.length;
  }

  #stddev(sorted) {
    if (sorted.length < 2) return 0;
    const avg = this.#mean(sorted);
    const squaredDiffs = sorted.map(v => (v - avg) ** 2);
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (sorted.length - 1);
    return Math.sqrt(variance);
  }

  #percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    const fraction = index - lower;
    return sorted[lower] + fraction * (sorted[upper] - sorted[lower]);
  }
}
