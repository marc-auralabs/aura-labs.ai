/**
 * Offer Anomaly Detector — Per-Beacon Offer Rate & Price Anomalies
 *
 * Monitors each beacon's offer submission rate and pricing against
 * statistical baselines. Detects:
 *   - Offer rate drops (beacon stopped submitting offers)
 *   - Price anomalies (prices deviating significantly from historical)
 *
 * Thresholds (configurable via policy_config):
 *   - rate_drop_percent: Alert if rate drops by this % vs baseline (default: 50)
 *   - price_sigma: Alert if price deviates by this many σ (default: 2)
 *   - min_samples: Minimum samples before baselining (default: 5)
 *
 * Remediation: Alert only. Rate drops may be legitimate (inventory exhaustion,
 * time-of-day patterns). Price anomalies need human investigation.
 */

import { PolicyAgent } from '../lib/policy-agent.js';

export class OfferAnomalyDetector extends PolicyAgent {
  constructor(deps) {
    super({ name: 'offer_anomaly_detector', ...deps });
  }

  async detect() {
    const rateDropPercent = this.threshold('rate_drop_percent', 50);
    const priceSigma = this.threshold('price_sigma', 2);
    const minSamples = this.threshold('min_samples', 5);
    const lookback = this.lookbackMinutes;

    // Get per-beacon offer counts in the lookback window
    const rateResult = await this.db.query(`
      SELECT
        n.beacon_id,
        b.name AS beacon_name,
        b.external_id,
        COUNT(*) AS offer_count,
        AVG(CASE WHEN n.current_offer IS NOT NULL
            THEN (n.current_offer->>'totalPrice')::numeric
            ELSE NULL END) AS avg_price
      FROM negotiations n
      JOIN beacons b ON b.id = n.beacon_id
      WHERE n.created_at >= NOW() - INTERVAL '1 minute' * $1
        AND b.status = 'active'
      GROUP BY n.beacon_id, b.name, b.external_id
    `, [lookback]);

    // Also check active beacons that had ZERO offers in the window
    const activeBeacons = await this.db.query(`
      SELECT id, name, external_id FROM beacons WHERE status = 'active'
    `);

    const beaconsWithOffers = new Set(rateResult.rows.map(r => r.beacon_id));

    for (const beacon of activeBeacons.rows) {
      if (!beaconsWithOffers.has(beacon.id)) {
        // Check if this beacon had offers in previous windows (has a baseline)
        const baseline = await this.getBaseline('offer_rate', beacon.id);
        if (baseline && baseline.mean > 0 && baseline.sample_count >= minSamples) {
          // Beacon had historical activity but zero now
          await this.createAlert({
            alertType: 'offer_rate_drop',
            severity: 'medium',
            entityType: 'beacon',
            entityId: beacon.id,
            beaconId: beacon.id,
            title: `Beacon "${beacon.name}" — zero offers in last ${lookback} minutes`,
            description: `Beacon ${beacon.external_id} submitted 0 offers in the last ${lookback} minutes. Historical baseline: ${baseline.mean.toFixed(1)} offers per window. This is a 100% drop.`,
            observationValue: 0,
            thresholdValue: baseline.mean * (1 - rateDropPercent / 100),
            metadata: {
              beaconName: beacon.name,
              baselineMean: baseline.mean,
              baselineSamples: baseline.sample_count,
            },
          });
        }
      }
    }

    // Process beacons that DO have offers
    for (const row of rateResult.rows) {
      const offerCount = parseInt(row.offer_count, 10);
      const avgPrice = row.avg_price ? parseFloat(row.avg_price) : null;

      // Update offer rate baseline
      const rateBaseline = await this.getBaseline('offer_rate', row.beacon_id);
      await this.updateBaselines('offer_rate', row.beacon_id, [offerCount]);

      // Check rate drop
      if (rateBaseline && rateBaseline.mean > 0 && rateBaseline.sample_count >= minSamples) {
        const dropPercent = ((rateBaseline.mean - offerCount) / rateBaseline.mean) * 100;
        if (dropPercent >= rateDropPercent) {
          await this.createAlert({
            alertType: 'offer_rate_drop',
            severity: 'medium',
            entityType: 'beacon',
            entityId: row.beacon_id,
            beaconId: row.beacon_id,
            title: `Beacon "${row.beacon_name}" offer rate dropped ${Math.round(dropPercent)}%`,
            description: `Beacon ${row.external_id} submitted ${offerCount} offers in the last ${lookback} minutes vs baseline of ${rateBaseline.mean.toFixed(1)}. Drop: ${dropPercent.toFixed(1)}%.`,
            observationValue: offerCount,
            thresholdValue: rateBaseline.mean * (1 - rateDropPercent / 100),
            metadata: {
              beaconName: row.beacon_name,
              baselineMean: rateBaseline.mean,
              dropPercent: Math.round(dropPercent),
            },
          });
        }
      }

      // Check price anomaly
      if (avgPrice !== null) {
        const priceBaseline = await this.getBaseline('avg_price', row.beacon_id);
        await this.updateBaselines('avg_price', row.beacon_id, [avgPrice]);

        if (priceBaseline && priceBaseline.sample_count >= minSamples) {
          const { isAnomaly, deviations, direction } =
            this.config.__baselineCalculator?.checkAnomaly(avgPrice, priceBaseline, priceSigma) ||
            this.#checkAnomaly(avgPrice, priceBaseline, priceSigma);

          if (isAnomaly) {
            await this.createAlert({
              alertType: 'price_anomaly',
              severity: 'low',
              entityType: 'beacon',
              entityId: row.beacon_id,
              beaconId: row.beacon_id,
              title: `Beacon "${row.beacon_name}" price ${direction} normal — ${Math.abs(deviations)}σ`,
              description: `Beacon ${row.external_id} average price $${avgPrice.toFixed(2)} is ${Math.abs(deviations)}σ ${direction} the baseline mean of $${priceBaseline.mean.toFixed(2)} (stddev: $${priceBaseline.stddev.toFixed(2)}).`,
              observationValue: avgPrice,
              thresholdValue: priceBaseline.mean + (priceSigma * priceBaseline.stddev * (direction === 'above' ? 1 : -1)),
              metadata: {
                beaconName: row.beacon_name,
                baselineMean: priceBaseline.mean,
                baselineStddev: priceBaseline.stddev,
                deviations,
                direction,
              },
            });
          }
        }
      }
    }

    this.logger.info({
      beaconsChecked: rateResult.rows.length + (activeBeacons.rows.length - beaconsWithOffers.size),
    }, 'Offer anomaly check complete');
  }

  /**
   * Inline anomaly check (mirrors BaselineCalculator.checkAnomaly)
   */
  #checkAnomaly(value, baseline, sigmaThreshold) {
    if (!baseline || !baseline.stddev || baseline.stddev === 0) {
      return { isAnomaly: false, deviations: 0, direction: 'none' };
    }
    const deviations = (value - baseline.mean) / baseline.stddev;
    const isAnomaly = Math.abs(deviations) >= sigmaThreshold;
    const direction = deviations > 0 ? 'above' : deviations < 0 ? 'below' : 'none';
    return { isAnomaly, deviations: Math.round(deviations * 100) / 100, direction };
  }
}
