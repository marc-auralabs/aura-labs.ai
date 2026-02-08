/**
 * Basic Purchase Example
 *
 * Demonstrates the core Scout SDK flow:
 * 1. Initialize Scout with API key
 * 2. Express purchase intent with constraints
 * 3. Wait for offers
 * 4. Evaluate and commit to best offer
 *
 * Run with: AURA_API_KEY=your-key node examples/basic-purchase.js
 */

import { createScout } from '../src/index.js';

async function main() {
  // Initialize Scout
  const scout = createScout({
    apiKey: process.env.AURA_API_KEY,
    // coreUrl: 'http://localhost:3000', // Uncomment for local development
  });

  console.log('🔍 Scout initialized');
  console.log(`   Core URL: ${scout.coreUrl}`);

  // Express purchase intent with constraints
  console.log('\n📝 Creating session with intent...');

  const session = await scout.intent(
    'I need 500 industrial widgets for manufacturing, grade A quality',
    {
      maxBudget: 50000, // $50,000 max
      deliveryBy: new Date('2026-03-01'), // Need by March 1st
      hardConstraints: [
        // Must be grade A
        { field: 'grade', operator: 'eq', value: 'A' },
      ],
      softPreferences: [
        // Prefer sustainable suppliers (+10 to score)
        { field: 'sustainable', operator: 'eq', value: true, weight: 10 },
        // Prefer suppliers with high ratings (+5 per point above 4.0)
        { field: 'rating', operator: 'gte', value: 4.0, weight: 5 },
      ],
    }
  );

  console.log(`✓ Session created: ${session.id}`);
  console.log(`  Status: ${session.status}`);

  // Wait for offers from Beacons
  console.log('\n⏳ Waiting for offers...');

  try {
    const offers = await session.waitForOffers({
      timeout: 60000, // Wait up to 60 seconds
      interval: 2000, // Poll every 2 seconds
    });

    console.log(`\n✓ Received ${offers.length} offer(s)`);

    // Display all offers
    for (const offer of offers) {
      console.log(`\n  📦 ${offer.beaconName || offer.beaconId}`);
      console.log(`     Product: ${offer.product}`);
      console.log(`     Price: $${offer.totalPrice.toLocaleString()} (${offer.quantity} × $${offer.unitPrice})`);
      console.log(`     Delivery: ${offer.deliveryDate || 'TBD'}`);
      console.log(`     Score: ${offer.score.toFixed(1)}/100`);
      console.log(`     Meets constraints: ${offer.meetsConstraints ? '✓' : '✗'}`);

      if (!offer.meetsConstraints) {
        console.log(`     Violations: ${offer.constraintViolations.join(', ')}`);
      }
    }

    // Get only offers that meet all constraints
    const validOffers = session.validOffers;
    console.log(`\n✓ ${validOffers.length} offer(s) meet all constraints`);

    // Get the best offer (highest score among valid offers)
    const bestOffer = session.bestOffer;

    if (bestOffer) {
      console.log(`\n🏆 Best offer: ${bestOffer.beaconName || bestOffer.beaconId}`);
      console.log(`   Total: $${bestOffer.totalPrice.toLocaleString()}`);
      console.log(`   Score: ${bestOffer.score.toFixed(1)}/100`);

      // Commit to the best offer
      console.log('\n💳 Committing to offer...');
      const transaction = await session.commit(bestOffer.id);

      console.log(`✓ Transaction created: ${transaction.id}`);
      console.log(`  Status: ${transaction.status}`);
    } else {
      console.log('\n⚠️ No offers meet all constraints');

      // Show why offers were rejected
      for (const offer of offers) {
        if (!offer.meetsConstraints) {
          console.log(`   ${offer.beaconName}: ${offer.constraintViolations.join(', ')}`);
        }
      }
    }
  } catch (error) {
    if (error.code === 'TIMEOUT') {
      console.log('\n⚠️ Timed out waiting for offers');
      console.log('   This may mean no Beacons matched your intent');
    } else {
      throw error;
    }
  }
}

main().catch(console.error);
