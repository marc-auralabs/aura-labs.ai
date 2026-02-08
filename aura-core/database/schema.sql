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
    scout_id VARCHAR(255),                      -- Scout's identifier (if provided)
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
