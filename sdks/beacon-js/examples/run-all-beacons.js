#!/usr/bin/env node

/**
 * Multi-Beacon Runner
 *
 * Runs all test beacons simultaneously for demonstrations.
 * Creates a marketplace with diverse vendors responding to intents.
 *
 * Usage:
 *   node examples/run-all-beacons.js
 *
 * Options via environment:
 *   AURA_CORE_URL - Core API URL (default: production)
 *   POLL_INTERVAL - Polling interval in ms (default: 3000)
 */

import { createBeacon } from '../src/index.js';

const CORE_URL = process.env.AURA_CORE_URL || 'https://aura-labsai-production.up.railway.app';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 5000;

// Helper for delivery dates
function getDeliveryDate(days) {
  const date = new Date();
  let daysToAdd = days;
  while (daysToAdd > 0) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) daysToAdd--;
  }
  return date.toISOString().split('T')[0];
}

// ============================================================================
// Beacon Configurations
// ============================================================================

const BEACONS = [
  {
    config: {
      externalId: 'acme-widgets-001',
      name: 'Acme Widget Co.',
      description: 'Premium industrial widgets',
      capabilities: { products: ['widgets', 'industrial widgets'] },
    },
    icon: '🏭',
    matcher: (intent) => intent.toLowerCase().includes('widget'),
    makeOffer: (intent) => {
      const qtyMatch = intent.match(/(\d+)\s*widget/i);
      const quantity = qtyMatch ? Math.min(10000, Math.max(100, parseInt(qtyMatch[1]))) : 500;
      return {
        product: { name: 'Industrial Widget', sku: 'WDG-IND-001', category: 'Industrial' },
        unitPrice: 85.00,
        quantity,
        deliveryDate: getDeliveryDate(5),
        terms: { warranty: '2 years', shipping: 'Free over $1000' },
      };
    },
  },
  {
    config: {
      externalId: 'techmart-electronics-001',
      name: 'TechMart Electronics',
      description: 'Business and consumer electronics',
      capabilities: { products: ['laptops', 'monitors', 'keyboards', 'mice'] },
    },
    icon: '💻',
    matcher: (intent) => {
      const lower = intent.toLowerCase();
      return lower.includes('laptop') || lower.includes('computer') ||
             lower.includes('monitor') || lower.includes('keyboard') ||
             lower.includes('mouse') || lower.includes('electronics');
    },
    makeOffer: (intent) => {
      const lower = intent.toLowerCase();
      if (lower.includes('laptop') || lower.includes('computer')) {
        return {
          product: { name: 'ProBook Business Laptop', sku: 'ELEC-LAP-001', category: 'Computers' },
          unitPrice: 1299.00,
          quantity: 1,
          deliveryDate: getDeliveryDate(3),
          terms: { warranty: '3 years', support: '24/7' },
        };
      }
      if (lower.includes('monitor')) {
        return {
          product: { name: '27" 4K Professional Monitor', sku: 'ELEC-MON-001', category: 'Displays' },
          unitPrice: 449.00,
          quantity: 1,
          deliveryDate: getDeliveryDate(2),
          terms: { warranty: '3 years' },
        };
      }
      return {
        product: { name: 'Ergonomic Wireless Keyboard', sku: 'ELEC-KEY-001', category: 'Accessories' },
        unitPrice: 149.00,
        quantity: 1,
        deliveryDate: getDeliveryDate(1),
      };
    },
  },
  {
    config: {
      externalId: 'officemax-pro-001',
      name: 'OfficeMax Pro',
      description: 'Complete office solutions',
      capabilities: { products: ['desks', 'chairs', 'paper', 'printers'] },
    },
    icon: '📎',
    matcher: (intent) => {
      const lower = intent.toLowerCase();
      return lower.includes('desk') || lower.includes('chair') ||
             lower.includes('paper') || lower.includes('office') ||
             lower.includes('printer') || lower.includes('furniture');
    },
    makeOffer: (intent) => {
      const lower = intent.toLowerCase();
      if (lower.includes('desk')) {
        return {
          product: { name: 'Adjustable Standing Desk', sku: 'OFF-DSK-001', category: 'Furniture' },
          unitPrice: 599.00,
          quantity: 1,
          deliveryDate: getDeliveryDate(7),
          terms: { assembly: 'Available for $50' },
        };
      }
      if (lower.includes('chair')) {
        return {
          product: { name: 'Ergonomic Executive Chair', sku: 'OFF-CHR-001', category: 'Furniture' },
          unitPrice: 449.00,
          quantity: 1,
          deliveryDate: getDeliveryDate(5),
        };
      }
      return {
        product: { name: 'Premium Copy Paper (Case)', sku: 'OFF-PPR-001', category: 'Supplies' },
        unitPrice: 54.99,
        quantity: 5,
        deliveryDate: getDeliveryDate(2),
      };
    },
  },
  {
    config: {
      externalId: 'nimbus-cloud-001',
      name: 'Nimbus Cloud Services',
      description: 'Enterprise cloud infrastructure',
      capabilities: { services: ['compute', 'storage', 'database', 'kubernetes'] },
    },
    icon: '☁️',
    matcher: (intent) => {
      const lower = intent.toLowerCase();
      return lower.includes('server') || lower.includes('vm') ||
             lower.includes('cloud') || lower.includes('compute') ||
             lower.includes('database') || lower.includes('storage') ||
             lower.includes('hosting') || lower.includes('gpu');
    },
    makeOffer: (intent) => {
      const lower = intent.toLowerCase();
      if (lower.includes('gpu') || lower.includes('ml') || lower.includes('ai')) {
        return {
          product: { name: 'GPU Compute Instance (A100)', sku: 'CLD-GPU-A100', category: 'AI/ML' },
          unitPrice: 2.50,
          quantity: 1,
          deliveryDate: new Date().toISOString().split('T')[0],
          terms: { billing: 'per hour', sla: '99.95%' },
        };
      }
      if (lower.includes('database')) {
        return {
          product: { name: 'Managed PostgreSQL Database', sku: 'CLD-DB-PG', category: 'Database' },
          unitPrice: 125.00,
          quantity: 1,
          deliveryDate: new Date().toISOString().split('T')[0],
          terms: { billing: 'monthly', backups: 'daily' },
        };
      }
      return {
        product: { name: 'Standard Compute Instance', sku: 'CLD-VM-STD', category: 'Compute' },
        unitPrice: 75.00,
        quantity: 1,
        deliveryDate: new Date().toISOString().split('T')[0],
        terms: { billing: 'monthly', sla: '99.95%' },
      };
    },
  },
  {
    config: {
      externalId: 'wanderlust-travel-001',
      name: 'Wanderlust Travel Agency',
      description: 'Full-service travel agency',
      capabilities: { services: ['flights', 'hotels', 'car rentals', 'packages'] },
    },
    icon: '✈️',
    matcher: (intent) => {
      const lower = intent.toLowerCase();
      return lower.includes('flight') || lower.includes('hotel') ||
             lower.includes('travel') || lower.includes('trip') ||
             lower.includes('vacation') || lower.includes('book');
    },
    makeOffer: (intent) => {
      const lower = intent.toLowerCase();
      if (lower.includes('flight') || lower.includes('fly')) {
        return {
          product: { name: 'Round-trip Economy Flight', sku: 'TRV-FLT-ECO', category: 'Flights' },
          unitPrice: 350.00,
          quantity: 1,
          deliveryDate: getDeliveryDate(14),
          terms: { cancellation: 'Free up to 48 hours', bags: '1 checked bag included' },
        };
      }
      if (lower.includes('hotel') || lower.includes('stay')) {
        return {
          product: { name: 'Standard Hotel Room', sku: 'TRV-HTL-STD', category: 'Hotels' },
          unitPrice: 149.00,
          quantity: 3, // 3 nights
          deliveryDate: getDeliveryDate(14),
          terms: { breakfast: 'included', cancellation: 'Free up to 24 hours' },
        };
      }
      return {
        product: { name: 'All-Inclusive Vacation Package', sku: 'TRV-PKG-ALL', category: 'Packages' },
        unitPrice: 1899.00,
        quantity: 1,
        deliveryDate: getDeliveryDate(30),
        terms: { includes: 'Flight + Hotel + Transfers', duration: '7 days' },
      };
    },
  },
];

// ============================================================================
// Main Runner
// ============================================================================

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                                                                           ║
║     🔥 AURA MARKETPLACE - Multi-Beacon Demo                               ║
║                                                                           ║
║     Running ${BEACONS.length} beacons simultaneously                                    ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
`);

  console.log(`📡 Core: ${CORE_URL}`);
  console.log(`⏱️  Poll interval: ${POLL_INTERVAL / 1000}s\n`);

  const beacons = [];
  const seenSessions = new Set();

  // Register all beacons
  for (const beaconDef of BEACONS) {
    const beacon = createBeacon({
      coreUrl: CORE_URL,
      pollIntervalMs: POLL_INTERVAL,
      ...beaconDef.config,
    });

    try {
      const reg = await beacon.register();
      console.log(`${beaconDef.icon}  Registered: ${reg.name}`);

      // Set up session handler
      beacon.onSession(async (session) => {
        // Check if already handled by this beacon
        const sessionKey = `${session.sessionId}-${beaconDef.config.externalId}`;
        if (seenSessions.has(sessionKey)) return;
        seenSessions.add(sessionKey);

        const intent = session.intent?.raw || '';

        if (beaconDef.matcher(intent)) {
          const offer = beaconDef.makeOffer(intent);
          const total = offer.unitPrice * offer.quantity;

          console.log(`\n${beaconDef.icon}  ${beaconDef.config.name} responding to: "${intent.slice(0, 50)}..."`);
          console.log(`   └─ ${offer.product.name}: ${offer.quantity} × $${offer.unitPrice} = $${total.toFixed(2)}`);

          try {
            await beacon.submitOffer(session.sessionId, offer);
          } catch (error) {
            console.log(`   └─ ❌ Error: ${error.message}`);
          }
        }
      });

      beacons.push({ beacon, def: beaconDef });
    } catch (error) {
      console.error(`❌ Failed to register ${beaconDef.config.name}: ${error.message}`);
    }
  }

  console.log(`\n${'─'.repeat(75)}`);
  console.log(`\n✅ ${beacons.length} beacons online and listening!\n`);
  console.log(`Try creating sessions with intents like:`);
  console.log(`  • "I need 500 industrial widgets"`);
  console.log(`  • "Looking for 10 laptops for our team"`);
  console.log(`  • "Need standing desks and chairs for new office"`);
  console.log(`  • "Spin up 5 VMs with GPU for ML training"`);
  console.log(`  • "Book a flight and hotel to New York for 2 people"`);
  console.log(`\nPress Ctrl+C to stop all beacons\n`);
  console.log(`${'─'.repeat(75)}\n`);

  // Start all beacons polling
  for (const { beacon } of beacons) {
    await beacon.startPolling();
  }

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down all beacons...');
    for (const { beacon, def } of beacons) {
      beacon.stopPolling();
      console.log(`   ${def.icon}  ${def.config.name} stopped`);
    }
    console.log('\n👋 Goodbye!\n');
    process.exit(0);
  });

  // Prune seen sessions periodically
  setInterval(() => {
    if (seenSessions.size > 5000) {
      const arr = Array.from(seenSessions);
      seenSessions.clear();
      arr.slice(-2500).forEach(s => seenSessions.add(s));
    }
  }, 60000);
}

main().catch(console.error);
