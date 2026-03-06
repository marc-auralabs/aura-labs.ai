/**
 * PolicyAgent — Base class for all AURA policy agents
 *
 * Policy agents are the independent observer layer. They consume platform
 * data (database state, audit logs, event streams), build statistical
 * baselines of normal behavior, and detect/respond to anomalies.
 *
 * They are NOT Scouts or Beacons. They are a separate class of agent
 * that observes and enforces platform health.
 *
 * Each policy agent implements detect() with its specific detection logic.
 * The base class provides:
 *   - Run loop with timing, error handling, and isRunning guard
 *   - Config loading from policy_config table
 *   - Shared access to baseline calculator, alert dispatcher, remediation engine
 *   - Structured logging
 */

export class PolicyAgent {
  #name;
  #db;
  #baselineCalculator;
  #alertDispatcher;
  #remediationEngine;
  #logger;
  #config = null;
  #isRunning = false;
  #lastRunAt = null;
  #runCount = 0;
  #errorCount = 0;

  /**
   * @param {object} options
   * @param {string} options.name - Policy agent name (matches policy_config.policy_name)
   * @param {import('pg').Pool} options.db - Database pool
   * @param {import('./baseline-calculator.js').BaselineCalculator} options.baselineCalculator
   * @param {import('./alert-dispatcher.js').AlertDispatcher} options.alertDispatcher
   * @param {import('./remediation-engine.js').RemediationEngine} options.remediationEngine
   * @param {object} options.logger - Pino-compatible logger
   */
  constructor({ name, db, baselineCalculator, alertDispatcher, remediationEngine, logger }) {
    this.#name = name;
    this.#db = db;
    this.#baselineCalculator = baselineCalculator;
    this.#alertDispatcher = alertDispatcher;
    this.#remediationEngine = remediationEngine;
    this.#logger = logger.child({ policy: name });
  }

  // ─── Public API ──────────────────────────────────────────────────────

  get name() { return this.#name; }
  get isRunning() { return this.#isRunning; }
  get lastRunAt() { return this.#lastRunAt; }
  get runCount() { return this.#runCount; }
  get errorCount() { return this.#errorCount; }

  /**
   * Check if this agent should run based on its configured interval
   *
   * @returns {boolean}
   */
  shouldRun() {
    if (this.#isRunning) return false;
    if (!this.#config?.enabled) return false;

    if (!this.#lastRunAt) return true;

    const elapsed = Date.now() - this.#lastRunAt.getTime();
    const intervalMs = (this.#config.poll_interval_seconds || 300) * 1000;
    return elapsed >= intervalMs;
  }

  /**
   * Execute the policy agent's detection cycle
   *
   * Wraps the subclass's detect() with timing, error handling,
   * and an isRunning guard to prevent overlapping runs.
   */
  async run() {
    if (this.#isRunning) {
      this.#logger.warn('Skipping run — already in progress');
      return;
    }

    this.#isRunning = true;
    const startTime = Date.now();

    try {
      // Reload config each run to pick up threshold changes
      await this.#loadConfig();

      if (!this.#config?.enabled) {
        this.#logger.debug('Agent disabled, skipping');
        return;
      }

      this.#logger.info({ run: this.#runCount + 1 }, 'Starting detection cycle');

      await this.detect();

      this.#runCount++;
      this.#lastRunAt = new Date();

      const durationMs = Date.now() - startTime;
      this.#logger.info({ durationMs, run: this.#runCount }, 'Detection cycle complete');
    } catch (error) {
      this.#errorCount++;
      const durationMs = Date.now() - startTime;
      this.#logger.error({ error: error.message, durationMs, run: this.#runCount + 1 }, 'Detection cycle failed');
    } finally {
      this.#isRunning = false;
    }
  }

  /**
   * Load initial config — call once during startup
   */
  async init() {
    await this.#loadConfig();
    this.#logger.info({
      enabled: this.#config?.enabled,
      interval: this.#config?.poll_interval_seconds,
    }, 'Policy agent initialized');
  }

  // ─── Override in subclass ────────────────────────────────────────────

  /**
   * Implement detection logic in subclass
   *
   * @abstract
   */
  async detect() {
    throw new Error(`${this.#name}: detect() not implemented`);
  }

  // ─── Protected helpers (available to subclasses) ─────────────────────

  /** @protected */
  get db() { return this.#db; }

  /** @protected */
  get logger() { return this.#logger; }

  /** @protected */
  get config() { return this.#config; }

  /**
   * Get threshold value from config
   * @protected
   */
  threshold(key, defaultValue) {
    return this.#config?.thresholds?.[key] ?? defaultValue;
  }

  /**
   * Get lookback window in minutes
   * @protected
   */
  get lookbackMinutes() {
    return this.#config?.lookback_minutes ?? 60;
  }

  /**
   * Create an alert
   * @protected
   */
  async createAlert(options) {
    return this.#alertDispatcher.createAlert({
      policyName: this.#name,
      ...options,
    });
  }

  /**
   * Update statistical baselines
   * @protected
   */
  async updateBaselines(metricType, beaconId, data) {
    return this.#baselineCalculator.computeBaselines(
      this.#name, metricType, beaconId, data
    );
  }

  /**
   * Get current baseline for a metric
   * @protected
   */
  async getBaseline(metricType, beaconId = null) {
    return this.#baselineCalculator.getBaseline(this.#name, metricType, beaconId);
  }

  /**
   * Apply auto-remediation (only if enabled and severity qualifies)
   * @protected
   */
  async applyRemediation(alertId, action) {
    if (!this.#config?.remediation_enabled) {
      this.#logger.info({ alertId, action }, 'Remediation disabled, skipping');
      return null;
    }
    return this.#remediationEngine.applyRemediation(alertId, action, this.#name);
  }

  // ─── Private ─────────────────────────────────────────────────────────

  async #loadConfig() {
    const result = await this.#db.query(
      'SELECT * FROM policy_config WHERE policy_name = $1',
      [this.#name]
    );
    this.#config = result.rows[0] || { enabled: false };
  }
}
