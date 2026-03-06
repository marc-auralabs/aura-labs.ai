#!/usr/bin/env node

/**
 * AURA Core Database Migration
 * Run with: node migrate.js
 * Requires DATABASE_URL environment variable
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  console.log('🚀 Starting AURA Core database migration...\n');

  // SSL: validate certificates by default (prevents MITM attacks).
  // Only skip SSL for localhost/development connections.
  const isLocal = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');
  const client = new Client({
    connectionString: databaseUrl,
    ssl: isLocal ? false : { rejectUnauthorized: true },
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL\n');

    // Read the schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Execute the schema
    console.log('📦 Creating tables...\n');
    await client.query(schema);

    console.log('✅ Migration completed successfully!\n');

    // Verify tables were created
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('📋 Tables created:');
    result.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
