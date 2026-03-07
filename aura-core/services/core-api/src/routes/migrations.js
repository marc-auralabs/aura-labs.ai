/**
 * Database Auto-Migration
 *
 * Creates and updates all database tables, indexes, and triggers.
 * Uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS for idempotent re-runs.
 */

export async function runMigrations(db) {
  if (!db) {
    console.log('⚠️  No DATABASE_URL configured, skipping migrations');
    return;
  }

  console.log('🔍 Checking database schema...');

  try {
    // Always run migrations incrementally - they use IF NOT EXISTS
    console.log('📦 Running database migrations...');

    // Create extension and tables FIRST (IF NOT EXISTS makes these safe to re-run)
    await db.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await db.query(`
      -- SCOUTS (Buyer Agents)
      CREATE TABLE IF NOT EXISTS scouts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        api_key_hash VARCHAR(255),
        status VARCHAR(50) DEFAULT 'active',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_scouts_status ON scouts(status);

      -- BEACONS (Seller Agents)
      CREATE TABLE IF NOT EXISTS beacons (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        external_id VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        endpoint_url VARCHAR(500),
        status VARCHAR(50) DEFAULT 'active',
        capabilities JSONB DEFAULT '{}',
        identity_protocols JSONB DEFAULT '[]',
        negotiation_protocols JSONB DEFAULT '[]',
        payment_protocols JSONB DEFAULT '[]',
        fulfillment_protocols JSONB DEFAULT '[]',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_beacons_status ON beacons(status);
      CREATE INDEX IF NOT EXISTS idx_beacons_external_id ON beacons(external_id);

      -- SESSIONS (Commerce Sessions)
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        scout_id UUID REFERENCES scouts(id),
        agent_id UUID REFERENCES agents(id),
        status VARCHAR(50) DEFAULT 'created',
        raw_intent TEXT,
        parsed_intent JSONB DEFAULT '{}',
        constraints JSONB DEFAULT '{}',
        context JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_scout_id ON sessions(scout_id);

      -- OFFERS (Beacon Responses)
      CREATE TABLE IF NOT EXISTS offers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        beacon_id UUID NOT NULL REFERENCES beacons(id),
        status VARCHAR(50) DEFAULT 'pending',
        product JSONB NOT NULL,
        unit_price DECIMAL(15,2),
        quantity INTEGER,
        total_price DECIMAL(15,2),
        currency VARCHAR(10) DEFAULT 'USD',
        delivery_date DATE,
        terms JSONB DEFAULT '{}',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour')
      );
      CREATE INDEX IF NOT EXISTS idx_offers_session_id ON offers(session_id);
      CREATE INDEX IF NOT EXISTS idx_offers_beacon_id ON offers(beacon_id);
      CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);

      -- TRANSACTIONS (Committed Deals)
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        session_id UUID NOT NULL REFERENCES sessions(id),
        offer_id UUID NOT NULL REFERENCES offers(id),
        beacon_id UUID NOT NULL REFERENCES beacons(id),
        scout_id UUID REFERENCES scouts(id),
        agent_id UUID REFERENCES agents(id),
        status VARCHAR(50) DEFAULT 'pending',
        final_terms JSONB NOT NULL,
        payment_status VARCHAR(50),
        payment_reference VARCHAR(255),
        fulfillment_status VARCHAR(50),
        fulfillment_reference VARCHAR(255),
        idempotency_key VARCHAR(255) UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_transactions_session_id ON transactions(session_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

      -- AUDIT LOG
      CREATE TABLE IF NOT EXISTS audit_log (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        entity_type VARCHAR(50) NOT NULL,
        entity_id UUID NOT NULL,
        action VARCHAR(50) NOT NULL,
        previous_state JSONB,
        new_state JSONB,
        changed_by VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);

      -- AGENTS (Universal Identity — Scouts and Beacons)
      -- Every agent registers with an Ed25519 public key.
      -- The public key IS the agent's identity; it signs all requests.
      -- type: 'scout' (buyer) or 'beacon' (seller)
      -- manifest: SDK version, capabilities, supported protocols
      CREATE TABLE IF NOT EXISTS agents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        type VARCHAR(20) NOT NULL CHECK (type IN ('scout', 'beacon')),
        public_key TEXT NOT NULL UNIQUE,
        key_fingerprint VARCHAR(64) NOT NULL,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
        manifest JSONB NOT NULL DEFAULT '{}',
        registered_at TIMESTAMPTZ DEFAULT NOW(),
        revoked_at TIMESTAMPTZ,
        last_seen_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_agents_public_key ON agents(public_key);
      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
      CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type);
    `);

    // Incremental migrations: add columns to existing tables
    // Safe to re-run — ADD COLUMN IF NOT EXISTS is idempotent
    await db.query(`
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agents(id);
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agents(id);
      ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS request_id VARCHAR(255);
      CREATE INDEX IF NOT EXISTS idx_sessions_agent_id ON sessions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_agent_id ON transactions(agent_id);
    `);

    // Create update trigger
    await db.query(`
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$ LANGUAGE plpgsql;
    `);

    // Trigger table names are hardcoded — validate against allowlist to prevent
    // any future refactor from introducing SQL injection via string interpolation.
    const TRIGGER_TABLES = Object.freeze(['scouts', 'beacons', 'sessions', 'transactions']);
    const VALID_TABLE_NAME = /^[a-z_]+$/;
    for (const table of TRIGGER_TABLES) {
      if (!VALID_TABLE_NAME.test(table)) throw new Error(`Invalid table name: ${table}`);
      await db.query(`DROP TRIGGER IF EXISTS ${table}_updated_at ON ${table}`);
      await db.query(`CREATE TRIGGER ${table}_updated_at BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION update_updated_at()`);
    }

    console.log('✅ Database migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}
