#!/usr/bin/env node

/**
 * Electronics Vendor - Test Beacon
 *
 * Simulates an electronics supplier offering:
 * - Laptops (business and consumer)
 * - Monitors
 * - Accessories
 *
 * Matches intents containing: laptop, computer, monitor, display, keyboard, mouse
 */

import { createBeacon } from '../src/index.js';

const CORE_URL = process.env.AURA_CORE_URL || 'https://aura-labsai-production.up.railway.app';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 3000;

// Product catalog
const CATALOG = {
  laptop: {
    product: {
      name: 'ProBook Business Laptop',
      sku: 'ELEC-LAP-001',
      description: '14" Intel i7, 16GB RAM, 512GB SSD, Windows 11 Pro',
      category: 'Computers',
      specs: { processor: 'Intel i7-1365U', ram: '16GB', storage: '512GB SSD' },
    },
    unitPrice: 1299.00,
    deliveryDays: 3,
  },
  monitor: {
    product: {
      name: '27" 4K Professional Monitor',
      sku: 'ELEC-MON-001',
      description: '27" 4K IPS, USB-C, Height Adjustable, 99% sRGB',
      category: 'Displays',
      specs: { size: '27"', resolution: '4K UHD', panel: 'IPS' },
    },
    unitPrice: 449.00,
    deliveryDays: 2,
  },
  keyboard: {
    product: {
      name: 'Ergonomic Wireless Keyboard',
      sku: 'ELEC-KEY-001',
      description: 'Split design, mechanical switches, Bluetooth/USB',
      category: 'Accessories',
    },
    unitPrice: 149.00,
    deliveryDays: 1,
  },
  mouse: {
    product: {
      name: 'Precision Wireless Mouse',
      sku: 'ELEC-MOU-001',
      description: 'Ergonomic, 8000 DPI, programmable buttons',
      category: 'Accessories',
    },
    unitPrice: 79.00,
    deliveryDays: 1,
  },
};

function getDeliveryDate(days) {
  const date = new Date();
  let daysToAdd = days;
  while (daysToAdd > 0) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) daysToAdd--;
  }
  return date.toISOString().split('T')[0];
}

function matchProducts(intent) {
  const lower = intent.toLowerCase();
  const matches = [];

  if (lower.includes('laptop') || lower.includes('computer') || lower.includes('notebook')) {
    matches.push('laptop');
  }
  if (lower.includes('monitor') || lower.includes('display') || lower.includes('screen')) {
    matches.push('monitor');
  }
  if (lower.includes('keyboard')) {
    matches.push('keyboard');
  }
  if (lower.includes('mouse') || lower.includes('mice')) {
    matches.push('mouse');
  }

  return matches;
}

function extractQuantity(intent, defaultQty = 1) {
  const match = intent.match(/(\d+)\s*(laptop|computer|monitor|keyboard|mouse|unit)/i);
  return match ? parseInt(match[1]) : defaultQty;
}

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║          💻 TECHMART ELECTRONICS - Test Beacon            ║
║                                                           ║
║  "Your Technology Partner"                                ║
╚═══════════════════════════════════════════════════════════╝
`);

  const beacon = createBeacon({
    coreUrl: CORE_URL,
    externalId: 'techmart-electronics-001',
    name: 'TechMart Electronics',
    description: 'Business and consumer electronics, computers, and accessories',
    capabilities: {
      products: ['laptops', 'monitors', 'keyboards', 'mice', 'accessories'],
      categories: ['Computers', 'Displays', 'Accessories'],
      minOrder: 1,
      maxOrder: 500,
      bulkDiscounts: true,
    },
    pollIntervalMs: POLL_INTERVAL,
  });

  console.log(`📡 Connecting to Core: ${CORE_URL}`);

  try {
    const reg = await beacon.register();
    console.log(`✅ Registered as: ${reg.name} (${reg.beaconId})`);
  } catch (error) {
    console.error(`❌ Registration failed: ${error.message}`);
    process.exit(1);
  }

  beacon.onSession(async (session, beacon) => {
    const intent = session.intent?.raw || '';
    console.log(`\n📥 Session: ${session.sessionId}`);
    console.log(`   Intent: "${intent}"`);

    const matches = matchProducts(intent);

    if (matches.length === 0) {
      console.log(`   ⏭️  No matching products`);
      return;
    }

    // Submit an offer for the first matching product
    const productKey = matches[0];
    const catalogItem = CATALOG[productKey];
    const quantity = extractQuantity(intent, productKey === 'laptop' ? 1 : 10);

    // Apply bulk discount for larger orders
    let unitPrice = catalogItem.unitPrice;
    if (quantity >= 10) unitPrice *= 0.95; // 5% off
    if (quantity >= 50) unitPrice *= 0.90; // additional 10% off

    const offer = {
      product: catalogItem.product,
      unitPrice: Math.round(unitPrice * 100) / 100,
      quantity,
      currency: 'USD',
      deliveryDate: getDeliveryDate(catalogItem.deliveryDays),
      terms: {
        warranty: '3 years manufacturer warranty',
        returnPolicy: '30-day returns',
        support: '24/7 technical support',
      },
      metadata: {
        bulkDiscount: quantity >= 10,
        inStock: true,
      },
    };

    console.log(`   ✅ Match: ${catalogItem.product.name}`);
    console.log(`      ${quantity} × $${offer.unitPrice} = $${(quantity * offer.unitPrice).toLocaleString()}`);

    try {
      await beacon.submitOffer(session.sessionId, offer);
      console.log(`   📤 Offer submitted!`);
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  });

  console.log(`\n🔄 Polling for sessions (every ${POLL_INTERVAL/1000}s)...`);
  console.log(`   Press Ctrl+C to stop\n`);

  await beacon.startPolling();

  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    beacon.stopPolling();
    process.exit(0);
  });
}

main().catch(console.error);
