#!/usr/bin/env node

/**
 * Widget Supplier - Test Beacon
 *
 * A simple test Beacon that:
 * 1. Registers as "Acme Widget Co."
 * 2. Polls for sessions containing "widget" in the intent
 * 3. Responds with a fixed offer: $85/unit, delivery in 5 days
 *
 * Run with:
 *   node examples/widget-supplier.js
 *
 * Or with custom Core URL:
 *   AURA_CORE_URL=http://localhost:3000 node examples/widget-supplier.js
 */

import { createBeacon } from '../src/index.js';

// Configuration
const CORE_URL = process.env.AURA_CORE_URL || 'https://aura-labsai-production.up.railway.app';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 3000;

// Calculate delivery date (5 business days from now)
function getDeliveryDate() {
  const date = new Date();
  let daysToAdd = 5;
  while (daysToAdd > 0) {
    date.setDate(date.getDate() + 1);
    const dayOfWeek = date.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daysToAdd--;
    }
  }
  return date.toISOString().split('T')[0];
}

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║          🏭 ACME WIDGET CO. - Test Beacon                 ║
║                                                           ║
║  "The Beacons of Gondor are lit!"                         ║
╚═══════════════════════════════════════════════════════════╝
`);

  // Create Beacon
  const beacon = createBeacon({
    coreUrl: CORE_URL,
    externalId: 'acme-widgets-001',
    name: 'Acme Widget Co.',
    description: 'Premium industrial widgets for all your manufacturing needs',
    capabilities: {
      products: ['widgets', 'industrial widgets', 'premium widgets'],
      minOrder: 100,
      maxOrder: 10000,
      deliveryDays: 5,
    },
    pollIntervalMs: POLL_INTERVAL,
  });

  // Register with Core
  console.log(`📡 Connecting to Core: ${CORE_URL}`);

  try {
    const registration = await beacon.register();
    console.log(`✅ Registered as: ${registration.name}`);
    console.log(`   Beacon ID: ${registration.beaconId}`);
    console.log(`   External ID: ${registration.externalId}`);
  } catch (error) {
    console.error(`❌ Registration failed: ${error.message}`);
    process.exit(1);
  }

  // Handle incoming sessions
  beacon.onSession(async (session, beacon) => {
    const intent = session.intent?.raw?.toLowerCase() || '';

    console.log(`\n📥 New session: ${session.sessionId}`);
    console.log(`   Intent: "${session.intent?.raw}"`);

    // Check if this is a widget request
    if (intent.includes('widget')) {
      // Extract quantity if mentioned (simple regex)
      const quantityMatch = intent.match(/(\d+)\s*(widget|unit)/i);
      const quantity = quantityMatch ? parseInt(quantityMatch[1]) : 500;

      // Clamp to our min/max
      const finalQuantity = Math.max(100, Math.min(10000, quantity));

      const offer = {
        product: {
          name: 'Industrial Widget',
          sku: 'WDG-IND-001',
          description: 'Heavy-duty industrial widget, Grade A quality',
          category: 'Industrial Supplies',
        },
        unitPrice: 85.00,
        quantity: finalQuantity,
        currency: 'USD',
        deliveryDate: getDeliveryDate(),
        terms: {
          warranty: '2 years',
          returnPolicy: '30-day money-back guarantee',
          shipping: 'Free shipping on orders over $1000',
        },
        metadata: {
          sustainable: true,
          rating: 4.8,
          certifications: ['ISO 9001', 'Made in USA'],
        },
      };

      console.log(`   ✅ Matches our products! Submitting offer...`);
      console.log(`      ${finalQuantity} units × $${offer.unitPrice} = $${(finalQuantity * offer.unitPrice).toLocaleString()}`);
      console.log(`      Delivery: ${offer.deliveryDate}`);

      try {
        await beacon.submitOffer(session.sessionId, offer);
        console.log(`   📤 Offer submitted successfully!`);
      } catch (error) {
        console.error(`   ❌ Failed to submit offer: ${error.message}`);
      }
    } else {
      console.log(`   ⏭️  Skipping - not a widget request`);
    }
  });

  // Start polling
  console.log(`\n🔄 Starting to poll for sessions (every ${POLL_INTERVAL/1000}s)...`);
  console.log(`   Press Ctrl+C to stop\n`);

  await beacon.startPolling();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down...');
    beacon.stopPolling();
    process.exit(0);
  });
}

main().catch(console.error);
