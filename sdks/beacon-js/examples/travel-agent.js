#!/usr/bin/env node

/**
 * Travel Agent - Test Beacon
 *
 * Simulates a travel booking service offering:
 * - Flights (domestic and international)
 * - Hotels
 * - Car rentals
 * - Vacation packages
 *
 * Matches intents containing: flight, hotel, travel, vacation, trip, booking, rental car
 */

import { createBeacon } from '../src/index.js';

const CORE_URL = process.env.AURA_CORE_URL || 'https://aura-labsai-production.up.railway.app';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 3000;

// Service catalog
const CATALOG = {
  flight: {
    product: {
      name: 'Round-trip Economy Flight',
      sku: 'TRV-FLT-ECO',
      description: 'Economy class, 1 checked bag included, seat selection available',
      category: 'Flights',
    },
    basePrice: 350.00,
    perNight: false,
  },
  'flight-business': {
    product: {
      name: 'Round-trip Business Class Flight',
      sku: 'TRV-FLT-BIZ',
      description: 'Business class, 2 bags, priority boarding, lounge access',
      category: 'Flights',
    },
    basePrice: 1200.00,
    perNight: false,
  },
  hotel: {
    product: {
      name: 'Standard Hotel Room',
      sku: 'TRV-HTL-STD',
      description: 'City center location, king bed, wifi, breakfast included',
      category: 'Hotels',
    },
    basePrice: 149.00,
    perNight: true,
  },
  'hotel-luxury': {
    product: {
      name: 'Luxury Suite',
      sku: 'TRV-HTL-LUX',
      description: '5-star hotel, suite with view, spa access, concierge service',
      category: 'Hotels',
    },
    basePrice: 450.00,
    perNight: true,
  },
  car: {
    product: {
      name: 'Mid-size Rental Car',
      sku: 'TRV-CAR-MID',
      description: 'Mid-size sedan, unlimited mileage, insurance included',
      category: 'Car Rentals',
    },
    basePrice: 55.00,
    perNight: true, // per day
  },
  package: {
    product: {
      name: 'All-Inclusive Vacation Package',
      sku: 'TRV-PKG-ALL',
      description: 'Flight + 4-star hotel + transfers + tours, 7 days/6 nights',
      category: 'Packages',
    },
    basePrice: 1899.00,
    perNight: false,
    fixedDuration: 7,
  },
};

// Popular destinations with price modifiers
const DESTINATIONS = {
  'new york': { modifier: 1.2, name: 'New York, NY' },
  'los angeles': { modifier: 1.1, name: 'Los Angeles, CA' },
  'miami': { modifier: 1.15, name: 'Miami, FL' },
  'london': { modifier: 1.5, name: 'London, UK' },
  'paris': { modifier: 1.6, name: 'Paris, France' },
  'tokyo': { modifier: 1.8, name: 'Tokyo, Japan' },
  'cancun': { modifier: 0.9, name: 'Cancun, Mexico' },
  'vegas': { modifier: 0.85, name: 'Las Vegas, NV' },
  'hawaii': { modifier: 1.4, name: 'Honolulu, HI' },
};

function getDeliveryDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function matchProducts(intent) {
  const lower = intent.toLowerCase();
  const matches = [];

  if (lower.includes('business class') || lower.includes('first class')) {
    matches.push('flight-business');
  } else if (lower.includes('flight') || lower.includes('fly') || lower.includes('airline')) {
    matches.push('flight');
  }

  if (lower.includes('luxury') || lower.includes('5 star') || lower.includes('suite')) {
    matches.push('hotel-luxury');
  } else if (lower.includes('hotel') || lower.includes('stay') || lower.includes('accommodation') || lower.includes('room')) {
    matches.push('hotel');
  }

  if (lower.includes('car') || lower.includes('rental') || lower.includes('drive')) {
    matches.push('car');
  }

  if (lower.includes('package') || lower.includes('vacation') || lower.includes('all inclusive') || lower.includes('getaway')) {
    matches.push('package');
  }

  // Generic travel match
  if ((lower.includes('trip') || lower.includes('travel') || lower.includes('book')) && matches.length === 0) {
    matches.push('flight', 'hotel');
  }

  return matches;
}

function extractDestination(intent) {
  const lower = intent.toLowerCase();
  for (const [key, dest] of Object.entries(DESTINATIONS)) {
    if (lower.includes(key)) {
      return { key, ...dest };
    }
  }
  return { key: 'default', modifier: 1.0, name: 'Flexible Destination' };
}

function extractNights(intent, defaultNights = 3) {
  // Match patterns like "5 nights", "3 days", "week"
  let match = intent.match(/(\d+)\s*(night|day|week)/i);
  if (match) {
    let qty = parseInt(match[1]);
    if (match[2].toLowerCase() === 'week') qty *= 7;
    if (match[2].toLowerCase() === 'day') qty -= 1; // days to nights
    return Math.max(1, qty);
  }
  if (intent.toLowerCase().includes('weekend')) return 2;
  if (intent.toLowerCase().includes('week')) return 7;
  return defaultNights;
}

function extractTravelers(intent, defaultTravelers = 1) {
  const match = intent.match(/(\d+)\s*(person|people|traveler|guest|passenger)/i);
  if (match) return parseInt(match[1]);
  if (intent.toLowerCase().includes('couple')) return 2;
  if (intent.toLowerCase().includes('family')) return 4;
  return defaultTravelers;
}

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║          ✈️  WANDERLUST TRAVEL - Test Beacon              ║
║                                                           ║
║  "Your Journey Starts Here"                               ║
╚═══════════════════════════════════════════════════════════╝
`);

  const beacon = createBeacon({
    coreUrl: CORE_URL,
    externalId: 'wanderlust-travel-001',
    name: 'Wanderlust Travel Agency',
    description: 'Full-service travel agency - flights, hotels, cars, and vacation packages',
    capabilities: {
      services: ['flights', 'hotels', 'car rentals', 'vacation packages'],
      destinations: Object.values(DESTINATIONS).map(d => d.name),
      partnerships: ['United', 'Delta', 'Marriott', 'Hilton', 'Hertz', 'Avis'],
      support: '24/7 travel assistance',
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
      console.log(`   ⏭️  No matching travel services`);
      return;
    }

    const destination = extractDestination(intent);
    const nights = extractNights(intent);
    const travelers = extractTravelers(intent);

    console.log(`   📍 Destination: ${destination.name}`);
    console.log(`   👥 Travelers: ${travelers}, 🌙 Nights: ${nights}`);

    for (const serviceKey of matches.slice(0, 2)) {
      const catalogItem = CATALOG[serviceKey];

      // Calculate price based on destination, duration, and travelers
      let unitPrice = catalogItem.basePrice * destination.modifier;
      let quantity = travelers;

      if (catalogItem.perNight) {
        quantity = nights * travelers;
        if (serviceKey === 'car') quantity = nights; // Cars don't multiply by travelers
      }

      // Seasonal pricing (simplified)
      const month = new Date().getMonth();
      if (month >= 5 && month <= 7) unitPrice *= 1.2; // Summer premium
      if (month === 11 || month === 0) unitPrice *= 1.3; // Holiday premium

      // Early booking discount
      unitPrice *= 0.95; // 5% early booking discount

      const totalPrice = Math.round(unitPrice * quantity * 100) / 100;

      const offer = {
        product: {
          ...catalogItem.product,
          destination: destination.name,
        },
        unitPrice: Math.round(unitPrice * 100) / 100,
        quantity,
        totalPrice,
        currency: 'USD',
        deliveryDate: getDeliveryDate(14), // Travel date 2 weeks from now
        terms: {
          cancellation: 'Free cancellation up to 48 hours before',
          changes: 'One free date change',
          insurance: 'Travel insurance available for 5% extra',
          loyalty: 'Earn 1 point per $1 spent',
        },
        metadata: {
          destination: destination.name,
          nights: catalogItem.perNight ? nights : undefined,
          travelers,
          bookingType: 'instant confirmation',
        },
      };

      const priceDesc = catalogItem.perNight
        ? `${quantity} night${quantity > 1 ? 's' : ''} × $${offer.unitPrice}`
        : `${travelers} traveler${travelers > 1 ? 's' : ''} × $${offer.unitPrice}`;

      console.log(`   ✅ ${catalogItem.product.name} to ${destination.name}`);
      console.log(`      ${priceDesc} = $${totalPrice.toLocaleString()}`);

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
