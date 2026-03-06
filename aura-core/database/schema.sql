-- AURA Core Database Schema
-- PostgreSQL 15+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- BEACONS (Seller Agents)
-- ============================================

CREATE TABLE beacons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id VARCHAR(255) UNIQUE NOT NULL,  -- Beacon's self-declared ID
    name VARCHAR(255) NOT NULL,
    description TEXT,
    endpoint_url VARCHAR(500) NOT NULL,         -- Beacon's callback URL
    status VARCHAR(50) DEFAULT 'pending',       -- pending, active, suspended

    -- Protocol capabilities (static declarations)
    identity_protocols JSONB DEFAULT '[]',      -- e.g., ["did:web", "api_key"]
    negotiation_protocols JSONB DEFAULT '[]',   -- e.g., ["fixed_price", "auction"]
    payment_protocols JSONB DEFAULT '[]',       -- e.g., ["stripe", "crypto"]
    fulfillment_protocols JSONB DEFAULT '[]',   -- e.g., ["digital_delivery", "shipping"]

    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_beacons_status ON beacons(status);
CREATE INDEX idx_beacons_external_id ON beacons(external_id);

-- ============================================
-- SESSIONS (Scout Conversations)
-- ============================================

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scout_id VARCHAR(255),                      -- Legacy scout identifier (deprecated)
    agent_id UUID REFERENCES agents(id),        -- Authenticated agent identity (Ed25519)
    status VARCHAR(50) DEFAULT 'active',        -- active, negotiating, completed, expired

    -- Session context
    context JSONB DEFAULT '{}',                 -- Accumulated context from conversation

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_scout_id ON sessions(scout_id);
CREATE INDEX idx_sessions_agent_id ON sessions(agent_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- ============================================
-- INTENTS (Parsed Scout Intentions)
-- ============================================

CREATE TABLE intents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,

    -- Raw and parsed intent
    raw_input TEXT NOT NULL,                    -- Original natural language input
    parsed_intent JSONB NOT NULL,               -- LLM-parsed structured intent
    confidence DECIMAL(3,2),                    -- Parsing confidence 0.00-1.00

    -- Intent classification
    intent_type VARCHAR(100),                   -- search, negotiate, purchase, inquire

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_intents_session_id ON intents(session_id);
CREATE INDEX idx_intents_type ON intents(intent_type);

-- ============================================
-- NEGOTIATIONS (Active Deals)
-- ============================================

CREATE TABLE negotiations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    beacon_id UUID NOT NULL REFERENCES beacons(id),

    -- Negotiation state
    status VARCHAR(50) DEFAULT 'initiated',     -- initiated, proposed, countered, accepted, rejected, expired

    -- Protocol selection (negotiated between Scout intent and Beacon capabilities)
    selected_protocols JSONB DEFAULT '{}',      -- {"identity": "did:web", "payment": "stripe", ...}

    -- Offer/counter-offer history
    current_offer JSONB,                        -- Latest offer on the table
    offer_history JSONB DEFAULT '[]',           -- All offers/counter-offers

    -- Idempotency
    idempotency_key VARCHAR(255) UNIQUE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour')
);

CREATE INDEX idx_negotiations_session_id ON negotiations(session_id);
CREATE INDEX idx_negotiations_beacon_id ON negotiations(beacon_id);
CREATE INDEX idx_negotiations_status ON negotiations(status);
CREATE INDEX idx_negotiations_idempotency ON negotiations(idempotency_key);

-- ============================================
-- TRANSACTIONS (Completed Deals)
-- ============================================

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    negotiation_id UUID REFERENCES negotiations(id),
    session_id UUID NOT NULL REFERENCES sessions(id),
    beacon_id UUID NOT NULL REFERENCES beacons(id),
    agent_id UUID REFERENCES agents(id),          -- Authenticated agent who committed

    -- Transaction details
    status VARCHAR(50) DEFAULT 'pending',       -- pending, paid, fulfilled, completed, refunded, disputed

    -- Final agreed terms
    final_terms JSONB NOT NULL,                 -- The accepted offer

    -- Payment tracking
    payment_status VARCHAR(50),
    payment_reference VARCHAR(255),             -- External payment ID

    -- Fulfillment tracking (Beacon-authoritative)
    fulfillment_status VARCHAR(50),
    fulfillment_reference VARCHAR(255),         -- External fulfillment ID

    -- Idempotency
    idempotency_key VARCHAR(255) UNIQUE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_transactions_session_id ON transactions(session_id);
CREATE INDEX idx_transactions_beacon_id ON transactions(beacon_id);
CREATE INDEX idx_transactions_agent_id ON transactions(agent_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_idempotency ON transactions(idempotency_key);

-- ============================================
-- AUDIT LOG (State Changes)
-- ============================================

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- What changed
    entity_type VARCHAR(50) NOT NULL,           -- session, negotiation, transaction, beacon
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,                -- created, updated, status_changed

    -- Change details
    previous_state JSONB,
    new_state JSONB,
    changed_by VARCHAR(255),                    -- scout_id, beacon_id, or 'system'

    -- Request tracking
    request_id UUID,                            -- Request ID for traceability

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created_at ON audit_log(created_at);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER beacons_updated_at BEFORE UPDATE ON beacons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER sessions_updated_at BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER negotiations_updated_at BEFORE UPDATE ON negotiations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER transactions_updated_at BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- POLICY BASELINES (Rolling statistical baselines)
-- ============================================

CREATE TABLE policy_baselines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identity
    policy_name VARCHAR(100) NOT NULL,             -- e.g., 'offer_anomaly_detector'
    metric_type VARCHAR(100) NOT NULL,             -- e.g., 'offer_rate', 'avg_price'
    beacon_id UUID REFERENCES beacons(id),         -- NULL = platform-wide metric

    -- Window
    window_size_minutes INTEGER NOT NULL DEFAULT 60,

    -- Statistics
    sample_count INTEGER NOT NULL DEFAULT 0,
    mean DOUBLE PRECISION,
    stddev DOUBLE PRECISION,
    p50 DOUBLE PRECISION,
    p95 DOUBLE PRECISION,
    p99 DOUBLE PRECISION,
    min_value DOUBLE PRECISION,
    max_value DOUBLE PRECISION,

    -- Timestamps
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_policy_baselines_lookup ON policy_baselines(policy_name, metric_type, beacon_id);
CREATE INDEX idx_policy_baselines_computed ON policy_baselines(computed_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_policy_baselines_upsert
  ON policy_baselines (policy_name, metric_type, COALESCE(beacon_id, '00000000-0000-0000-0000-000000000000'));

-- ============================================
-- POLICY ALERTS (Anomaly detections)
-- ============================================

CREATE TABLE policy_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Source
    policy_name VARCHAR(100) NOT NULL,
    alert_type VARCHAR(100) NOT NULL,              -- e.g., 'heartbeat_missing', 'price_anomaly'
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),

    -- Target entity
    entity_type VARCHAR(50),                       -- 'beacon', 'session', 'transaction', 'platform'
    entity_id UUID,
    beacon_id UUID REFERENCES beacons(id),

    -- Alert details
    title VARCHAR(500) NOT NULL,
    description TEXT,
    observation_value DOUBLE PRECISION,            -- What was observed
    threshold_value DOUBLE PRECISION,              -- What the threshold was
    metadata JSONB DEFAULT '{}',

    -- Remediation tracking
    auto_remediation BOOLEAN DEFAULT FALSE,
    remediation_action VARCHAR(100),               -- e.g., 'suspend_beacon'
    remediation_status VARCHAR(20) CHECK (remediation_status IN ('pending', 'applied', 'failed', 'reverted')),
    remediation_at TIMESTAMPTZ,

    -- Resolution
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_policy_alerts_severity ON policy_alerts(severity);
CREATE INDEX idx_policy_alerts_beacon ON policy_alerts(beacon_id);
CREATE INDEX idx_policy_alerts_resolved ON policy_alerts(resolved);
CREATE INDEX idx_policy_alerts_created ON policy_alerts(created_at);
CREATE INDEX idx_policy_alerts_policy ON policy_alerts(policy_name);

-- ============================================
-- POLICY CONFIG (Configurable thresholds)
-- ============================================

CREATE TABLE policy_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    policy_name VARCHAR(100) UNIQUE NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    poll_interval_seconds INTEGER DEFAULT 300,     -- How often to run (default 5 min)
    lookback_minutes INTEGER DEFAULT 60,           -- How far back to look

    -- Configurable thresholds (policy-specific)
    thresholds JSONB DEFAULT '{}',
    severity_rules JSONB DEFAULT '{}',

    -- Alerting
    alert_enabled BOOLEAN DEFAULT TRUE,
    remediation_enabled BOOLEAN DEFAULT FALSE,     -- Conservative: off by default
    webhook_url VARCHAR(500),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER policy_config_updated_at BEFORE UPDATE ON policy_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- POLICY AUDIT (Action trail)
-- ============================================

CREATE TABLE policy_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- What happened
    action VARCHAR(100) NOT NULL,                  -- 'alert_created', 'remediation_applied', 'remediation_reverted'
    policy_name VARCHAR(100) NOT NULL,
    beacon_id UUID REFERENCES beacons(id),
    alert_id UUID REFERENCES policy_alerts(id),

    -- Details
    description TEXT,
    previous_state JSONB,
    new_state JSONB,

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_policy_audit_policy ON policy_audit(policy_name);
CREATE INDEX idx_policy_audit_alert ON policy_audit(alert_id);
CREATE INDEX idx_policy_audit_created ON policy_audit(created_at);

-- ============================================
-- SEED: Default Policy Agent Configurations
-- ============================================

INSERT INTO policy_config (policy_name, enabled, poll_interval_seconds, lookback_minutes, thresholds, remediation_enabled) VALUES
  ('heartbeat_monitor', TRUE, 300, 60,
   '{"stale_minutes": 30, "dead_minutes": 120}', FALSE),
  ('session_lifecycle_monitor', TRUE, 300, 60,
   '{"stuck_collecting_minutes": 45, "zero_offers_minutes": 60}', FALSE),
  ('offer_anomaly_detector', TRUE, 600, 60,
   '{"rate_drop_percent": 50, "price_sigma": 2, "min_samples": 5}', FALSE),
  ('transaction_health_monitor', TRUE, 600, 60,
   '{"stuck_payment_minutes": 60, "stuck_fulfillment_minutes": 120, "failure_spike_count": 10}', FALSE),
  ('throughput_monitor', TRUE, 900, 60,
   '{"drop_percent": 30, "spike_percent": 50, "min_baseline_samples": 5}', FALSE)
ON CONFLICT (policy_name) DO NOTHING;
