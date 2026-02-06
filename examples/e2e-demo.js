#!/usr/bin/env node
/**
 * AURA End-to-End Demo
 *
 * This script demonstrates a complete transaction flow:
 * 1. Start mock AURA Core
 * 2. Register and connect a Beacon
 * 3. Register a Scout
 * 4. Scout creates shopping session
 * 5. Beacon receives request and submits offers
 * 6. Scout receives offers and commits to transaction
 *
 * Run with: node examples/e2e-demo.js
 *
 * Prerequisites:
 * - npm install in /core, /beacons/simple-beacon, /scouts/simple-scout
 */

const { spawn } = require('child_process');
const path = require('path');

const AURA_CORE_URL = 'http://localhost:8080';
const AURA_WS_URL = 'ws://localhost:8080';

// Color helpers for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(prefix, message, color = colors.reset) {
  console.log(`${color}[${prefix}]${colors.reset} ${message}`);
}

// Simple HTTP client
async function request(method, url, body = null, headers = {}) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  return response.json();
}

// Wait for server to be ready
async function waitForServer(url, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await fetch(`${url}/health`);
      return true;
    } catch (e) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Server at ${url} did not start in time`);
}

// Delay helper
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================================
// MAIN DEMO
// ============================================================================

async function runDemo() {
  console.log(`
${colors.bright}╔════════════════════════════════════════════════════════════╗
║              AURA End-to-End Demo                          ║
║                                                            ║
║  This demo shows a complete Scout → AURA → Beacon flow    ║
╚════════════════════════════════════════════════════════════╝${colors.reset}
  `);

  let coreProcess = null;
  let beaconProcess = null;

  try {
    // ========================================================================
    // STEP 1: Start AURA Core
    // ========================================================================
    log('SETUP', 'Starting AURA Core...', colors.cyan);

    coreProcess = spawn('node', ['src/mock-aura-core.js'], {
      cwd: path.join(__dirname, '..', 'core'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    coreProcess.stdout.on('data', data => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      lines.forEach(line => log('CORE', line, colors.blue));
    });

    coreProcess.stderr.on('data', data => {
      log('CORE', data.toString(), colors.red);
    });

    await waitForServer(AURA_CORE_URL);
    log('SETUP', '✓ AURA Core is running', colors.green);
    await delay(500);

    // ========================================================================
    // STEP 2: Start Beacon
    // ========================================================================
    log('SETUP', 'Starting Beacon...', colors.cyan);

    beaconProcess = spawn('node', ['simple-beacon.js'], {
      cwd: path.join(__dirname, '..', 'beacons', 'simple-beacon'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: '3001' },
    });

    beaconProcess.stdout.on('data', data => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      lines.forEach(line => log('BEACON', line, colors.yellow));
    });

    beaconProcess.stderr.on('data', data => {
      log('BEACON', data.toString(), colors.red);
    });

    await waitForServer('http://localhost:3001');
    log('SETUP', '✓ Beacon is running', colors.green);
    await delay(1000);

    // ========================================================================
    // STEP 3: Discover API (HATEOAS)
    // ========================================================================
    console.log(`\n${colors.bright}━━━ Step 1: Discover API ━━━${colors.reset}\n`);

    const apiRoot = await request('GET', `${AURA_CORE_URL}/v1`);
    log('SCOUT', `API discovered: ${apiRoot.name} v${apiRoot.version}`, colors.cyan);
    log('SCOUT', `Available actions: ${Object.keys(apiRoot._links).join(', ')}`, colors.cyan);

    // ========================================================================
    // STEP 4: Register Scout
    // ========================================================================
    console.log(`\n${colors.bright}━━━ Step 2: Register Scout ━━━${colors.reset}\n`);

    const scoutLink = apiRoot._links.scouts;
    const scout = await request(scoutLink.method, scoutLink.href, {
      agent_name: 'DemoShoppingAssistant',
      platform: 'node',
      capabilities: ['natural_language', 'transaction_commit'],
    });

    log('SCOUT', `Registered: ${scout.scout_id}`, colors.green);
    log('SCOUT', `API Key: ${scout.api_key.substring(0, 20)}...`, colors.cyan);
    log('SCOUT', `Available actions: ${Object.keys(scout._links).join(', ')}`, colors.cyan);

    // ========================================================================
    // STEP 5: Create Shopping Session
    // ========================================================================
    console.log(`\n${colors.bright}━━━ Step 3: Create Shopping Session ━━━${colors.reset}\n`);

    const sessionsLink = scout._links.sessions;
    const session = await request(
      sessionsLink.method,
      sessionsLink.href,
      {
        natural_language_query: 'I need wireless noise-cancelling headphones for my daily commute. Budget around $350.',
        structured_hints: {
          category_hint: 'electronics',
          price_range_usd: { min: 250, max: 400 },
          required_features: ['noise_cancellation', 'wireless'],
        },
        context: {
          use_case: 'daily_commute',
          location: { country: 'US', region: 'CA' },
        },
      },
      { Authorization: `Bearer ${scout.api_key}` }
    );

    log('SCOUT', `Session created: ${session.session_id}`, colors.green);
    log('SCOUT', `Status: ${session.status}`, colors.cyan);
    log('SCOUT', `Available actions: ${Object.keys(session._links).join(', ')}`, colors.cyan);

    // ========================================================================
    // STEP 6: Wait for Offers
    // ========================================================================
    console.log(`\n${colors.bright}━━━ Step 4: Wait for Offers ━━━${colors.reset}\n`);

    log('SCOUT', 'Waiting for Beacon offers...', colors.cyan);

    let offers = [];
    for (let i = 0; i < 20; i++) {
      await delay(500);

      const statusResponse = await request(
        'GET',
        session._links.self.href,
        null,
        { Authorization: `Bearer ${scout.api_key}` }
      );

      log('SCOUT', `Session status: ${statusResponse.status}`, colors.cyan);

      if (statusResponse.status === 'offers_ready') {
        const offersResponse = await request(
          'GET',
          session._links.offers.href,
          null,
          { Authorization: `Bearer ${scout.api_key}` }
        );

        offers = offersResponse.offers || [];
        log('SCOUT', `✓ Received ${offers.length} offers`, colors.green);
        break;
      }
    }

    if (offers.length === 0) {
      log('SCOUT', 'No offers received (Beacon may not have matching inventory)', colors.yellow);
      return;
    }

    // ========================================================================
    // STEP 7: Display Ranked Offers
    // ========================================================================
    console.log(`\n${colors.bright}━━━ Step 5: Ranked Offers ━━━${colors.reset}\n`);

    offers.forEach((offer, i) => {
      console.log(`${colors.bright}${i + 1}. ${offer.product?.name || 'Product'}${colors.reset}`);
      console.log(`   Price: $${offer.pricing?.offer_price} (was $${offer.pricing?.list_price})`);
      console.log(`   Discount: ${offer.pricing?.discount_percentage}%`);
      console.log(`   CWR Score: ${offer.cwr_score}`);
      console.log(`   Actions: ${Object.keys(offer._links || {}).join(', ')}`);
      console.log('');
    });

    // ========================================================================
    // STEP 8: Commit to Best Offer
    // ========================================================================
    console.log(`\n${colors.bright}━━━ Step 6: Commit to Offer ━━━${colors.reset}\n`);

    const bestOffer = offers[0];
    log('SCOUT', `Committing to offer: ${bestOffer.offer_id}`, colors.cyan);
    log('SCOUT', `Product: ${bestOffer.product?.name}`, colors.cyan);
    log('SCOUT', `Price: $${bestOffer.pricing?.offer_price}`, colors.cyan);

    const commitLink = bestOffer._links?.commit || session._links.commit;
    const transaction = await request(
      commitLink.method,
      commitLink.href,
      {
        offer_id: bestOffer.offer_id,
        quantity: 1,
        buyer_identity: {
          name: 'Jane Demo',
          email: 'jane.demo@example.com',
          phone: '+1-555-0123',
        },
        shipping_address: {
          line1: '123 Demo Street',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US',
        },
        payment_method: {
          type: 'x402',
          x402_payment: {
            facilitator: 'stripe',
            payment_token: 'pm_test_demo',
            currency: 'USD',
          },
        },
        consent: {
          share_identity_with_merchant: true,
          share_email_for_order_updates: true,
          marketing_opt_in: false,
          consent_timestamp: new Date().toISOString(),
          consent_method: 'explicit_user_action',
        },
      },
      { Authorization: `Bearer ${scout.api_key}` }
    );

    console.log('');
    log('SCOUT', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.green);
    log('SCOUT', '✓ TRANSACTION COMPLETE', colors.green);
    log('SCOUT', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.green);
    console.log('');
    console.log(`   Transaction ID: ${transaction.transaction_id}`);
    console.log(`   Order: ${transaction.order?.merchant_order_id}`);
    console.log(`   Status: ${transaction.status}`);
    console.log(`   Subtotal: $${transaction.amounts?.subtotal_usd}`);
    console.log(`   Tax: $${transaction.amounts?.tax_usd}`);
    console.log(`   Total: $${transaction.amounts?.total_usd}`);
    console.log(`   Actions: ${Object.keys(transaction._links || {}).join(', ')}`);
    console.log('');

    // ========================================================================
    // DONE
    // ========================================================================
    console.log(`
${colors.bright}╔════════════════════════════════════════════════════════════╗
║              Demo Complete!                                 ║
║                                                            ║
║  The full Scout → AURA Core → Beacon flow was executed:   ║
║  • API discovered via HATEOAS                              ║
║  • Scout registered and created session                    ║
║  • Beacon received request and submitted offers            ║
║  • Scout evaluated offers and committed to transaction     ║
╚════════════════════════════════════════════════════════════╝${colors.reset}
    `);

  } catch (error) {
    log('ERROR', error.message, colors.red);
    console.error(error);
  } finally {
    // Cleanup
    log('CLEANUP', 'Shutting down servers...', colors.cyan);

    if (beaconProcess) {
      beaconProcess.kill('SIGINT');
    }
    if (coreProcess) {
      coreProcess.kill('SIGINT');
    }

    await delay(500);
    log('CLEANUP', 'Done', colors.green);
    process.exit(0);
  }
}

// Run the demo
runDemo().catch(console.error);
