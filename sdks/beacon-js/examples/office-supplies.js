#!/usr/bin/env node

/**
 * Office Supplies - Test Beacon
 *
 * Simulates an office supplies vendor offering:
 * - Furniture (desks, chairs)
 * - Paper products
 * - Writing supplies
 * - Office equipment
 *
 * Matches intents containing: desk, chair, paper, pen, printer, supplies, office
 */

import { createBeacon } from '../src/index.js';

const CORE_URL = process.env.AURA_CORE_URL || 'https://aura-labsai-production.up.railway.app';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 3000;

// Product catalog
const CATALOG = {
  desk: {
    product: {
      name: 'Adjustable Standing Desk',
      sku: 'OFF-DSK-001',
      description: '60" x 30" Electric sit-stand desk, memory presets, cable management',
      category: 'Furniture',
    },
    unitPrice: 599.00,
    deliveryDays: 7,
  },
  chair: {
    product: {
      name: 'Ergonomic Executive Chair',
      sku: 'OFF-CHR-001',
      description: 'Mesh back, lumbar support, adjustable armrests, 300lb capacity',
      category: 'Furniture',
    },
    unitPrice: 449.00,
    deliveryDays: 5,
  },
  paper: {
    product: {
      name: 'Premium Copy Paper (Case)',
      sku: 'OFF-PPR-001',
      description: '10 reams, 500 sheets each, 20lb, 92 brightness, FSC certified',
      category: 'Paper Products',
    },
    unitPrice: 54.99,
    deliveryDays: 2,
  },
  pens: {
    product: {
      name: 'Professional Pen Set (Box of 12)',
      sku: 'OFF-PEN-001',
      description: 'Ballpoint pens, medium point, black ink, rubberized grip',
      category: 'Writing Supplies',
    },
    unitPrice: 24.99,
    deliveryDays: 1,
  },
  printer: {
    product: {
      name: 'Business Laser Printer',
      sku: 'OFF-PRT-001',
      description: 'Monochrome, 40ppm, duplex, network-ready, 550-sheet tray',
      category: 'Equipment',
    },
    unitPrice: 399.00,
    deliveryDays: 3,
  },
  whiteboard: {
    product: {
      name: 'Magnetic Dry-Erase Whiteboard',
      sku: 'OFF-WBD-001',
      description: '48" x 36", aluminum frame, includes markers and eraser',
      category: 'Office Supplies',
    },
    unitPrice: 129.00,
    deliveryDays: 4,
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

  if (lower.includes('desk') || lower.includes('standing desk')) {
    matches.push('desk');
  }
  if (lower.includes('chair') || lower.includes('seating')) {
    matches.push('chair');
  }
  if (lower.includes('paper') || lower.includes('copy paper') || lower.includes('printer paper')) {
    matches.push('paper');
  }
  if (lower.includes('pen') || lower.includes('writing')) {
    matches.push('pens');
  }
  if (lower.includes('printer') || lower.includes('printing')) {
    matches.push('printer');
  }
  if (lower.includes('whiteboard') || lower.includes('white board')) {
    matches.push('whiteboard');
  }
  // Generic office supplies match
  if (lower.includes('office supplies') || lower.includes('office equipment')) {
    if (matches.length === 0) matches.push('paper'); // Default to paper
  }

  return matches;
}

function extractQuantity(intent, defaultQty = 1) {
  const match = intent.match(/(\d+)\s*(desk|chair|case|box|ream|printer|unit)/i);
  return match ? parseInt(match[1]) : defaultQty;
}

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║          📎 OFFICEMAX PRO - Test Beacon                   ║
║                                                           ║
║  "Everything for the Modern Workplace"                    ║
╚═══════════════════════════════════════════════════════════╝
`);

  const beacon = createBeacon({
    coreUrl: CORE_URL,
    externalId: 'officemax-pro-001',
    name: 'OfficeMax Pro',
    description: 'Complete office solutions - furniture, supplies, and equipment',
    capabilities: {
      products: ['desks', 'chairs', 'paper', 'pens', 'printers', 'whiteboards'],
      categories: ['Furniture', 'Paper Products', 'Writing Supplies', 'Equipment'],
      minOrder: 1,
      maxOrder: 1000,
      businessAccounts: true,
      installation: true,
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

    // Submit offer for each matching product (up to 2)
    for (const productKey of matches.slice(0, 2)) {
      const catalogItem = CATALOG[productKey];
      const quantity = extractQuantity(intent, productKey === 'paper' ? 5 : 1);

      // Volume discounts
      let unitPrice = catalogItem.unitPrice;
      if (quantity >= 5) unitPrice *= 0.92;
      if (quantity >= 20) unitPrice *= 0.85;

      const offer = {
        product: catalogItem.product,
        unitPrice: Math.round(unitPrice * 100) / 100,
        quantity,
        currency: 'USD',
        deliveryDate: getDeliveryDate(catalogItem.deliveryDays),
        terms: {
          warranty: 'Manufacturer warranty included',
          returnPolicy: '60-day hassle-free returns',
          delivery: 'Free delivery for orders over $100',
          installation: catalogItem.product.category === 'Furniture' ? 'Assembly available for $50' : undefined,
        },
        metadata: {
          inStock: true,
          ecoFriendly: productKey === 'paper',
        },
      };

      console.log(`   ✅ Match: ${catalogItem.product.name}`);
      console.log(`      ${quantity} × $${offer.unitPrice} = $${(quantity * offer.unitPrice).toFixed(2)}`);

      try {
        await beacon.submitOffer(session.sessionId, offer);
        console.log(`   📤 Offer submitted!`);
      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
      }
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
