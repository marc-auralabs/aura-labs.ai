# Dynamic Pricing Strategies in AURA Beacons

Learn how to implement intelligent, dynamic pricing in your Beacon to maximize competitiveness and profit margins. This tutorial covers base pricing, price floors, volume discounts, time-based pricing, competitive adjustments, and validation chains.

## Overview

Pricing is your Beacon's primary competitive weapon. Rather than hardcoding static prices, use the Beacon SDK's `beforeOffer` validators to dynamically adjust prices based on:

- **Quantity ordered** - Volume discounts for bulk purchases
- **Time of day/season** - Peak vs. off-peak rates
- **Competitive context** - React to session metadata
- **Business rules** - Enforce margin floors and discount caps

The key insight: **`beforeOffer` validators run sequentially**, each modifying the offer before it's submitted. By chaining validators, you build sophisticated pricing logic that's easy to test and maintain.

```
Scout Intent → Session received → Validator 1 (floor price) → Validator 2 (discounts)
→ Validator 3 (margin check) → submitOffer(modifiedOffer)
```

## What You'll Learn

- Setting base prices in your product catalog
- Enforcing price floors with `registerPolicies()`
- Implementing volume discount tiers with validators
- Adding time-based and seasonal pricing rules
- Building validator chains for complex pricing logic
- Validating pricing decisions with margin checks
- Best practices for testing and scaling pricing strategies

## Prerequisites

- **Beacon SDK installed**: `npm install @aura-labs/beacon`
- **Registered Beacon**: Your Beacon must be registered with AURA Core
- **Node.js 16+**: Modern async/await support
- **Product catalog**: Understand your costs, margins, and competitor prices

## Estimated Time

~30 minutes

---

## Understanding Pricing Flows

### Static vs. Dynamic Pricing

**Static pricing** is simple but loses sales:
```javascript
// ❌ Static - miss opportunities for bulk discounts
await beacon.submitOffer(sessionId, {
  product: { name: 'Widget', sku: 'W-001' },
  unitPrice: 10.00,
  quantity: session.intent.raw, // Could be 1 or 100
  currency: 'USD',
});
```

**Dynamic pricing** adapts to context:
```javascript
// ✅ Dynamic - adjust based on quantity, time, competitor context
beacon.beforeOffer(async (session, proposedOffer) => {
  // If order is large, apply volume discount
  if (proposedOffer.quantity >= 10) {
    proposedOffer.unitPrice *= 0.85; // 15% discount
  }
  return proposedOffer;
});
```

### Validator Chain Execution

Validators execute **sequentially**, each receiving the offer modified by the previous validator:

```javascript
// When registerPolicies is called, it adds a validator at the FRONT
beacon.registerPolicies({
  minPrice: 5.00, // Added as FIRST validator
});

// These validators are added after (in order)
beacon.beforeOffer(volumeDiscountValidator);  // Validator 2
beacon.beforeOffer(seasonalPricingValidator);  // Validator 3
beacon.beforeOffer(marginCheckValidator);      // Validator 4

// Execution order: minPrice policy → volume → seasonal → margin check
```

---

## Step 1: Set Base Prices in Your Catalog

Define baseline prices for each product. These are your starting point before any adjustments:

```javascript
import { createBeacon } from '@aura-labs/beacon';

const beacon = createBeacon({
  externalId: 'office-supplies-001',
  name: 'OfficeHub',
  description: 'Bulk office supplies with smart pricing',
  capabilities: {
    products: ['pens', 'paper', 'folders', 'desk-accessories'],
    maxQuantityPerOrder: 10000,
    deliveryDays: 2,
  },
});

// Define your catalog with base prices
const catalog = {
  'PEN-BLUE': {
    name: 'Blue Ballpoint Pen',
    sku: 'PEN-BLUE',
    description: 'Classic blue ink pen, box of 50',
    category: 'writing-instruments',
    basePrice: 12.99, // Your cost: $8.00, target margin: 60%
    cost: 8.00,
    minMarginPct: 15, // Never drop below 15% margin
  },
  'PAPER-A4': {
    name: 'A4 Copy Paper',
    sku: 'PAPER-A4',
    description: 'White copy paper, 500 sheets',
    category: 'paper-products',
    basePrice: 4.99,
    cost: 2.50,
    minMarginPct: 20,
  },
  'FOLDER-FILE': {
    name: 'File Folder',
    sku: 'FOLDER-FILE',
    description: 'Manila folder, box of 100',
    category: 'filing',
    basePrice: 8.49,
    cost: 4.00,
    minMarginPct: 15,
  },
};

// When Scout submits intent, create offer from catalog
beacon.onSession(async (session) => {
  const product = session.intent.raw;
  const productInfo = catalog[product];

  if (!productInfo) {
    console.log(`Product not found: ${product}`);
    return;
  }

  const offer = {
    product: {
      name: productInfo.name,
      sku: productInfo.sku,
      description: productInfo.description,
      category: productInfo.category,
    },
    unitPrice: productInfo.basePrice,
    quantity: 1, // Will be modified by validators
    currency: 'USD',
    deliveryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    terms: 'Payment on delivery',
    metadata: {
      basePrice: productInfo.basePrice,
      cost: productInfo.cost,
    },
  };

  await beacon.submitOffer(session.sessionId, offer);
});
```

---

## Step 2: Enforce Price Floors with Policies

Use `registerPolicies()` to define business rules that protect your margins. Policies add a validator at the **front** of the chain:

```javascript
beacon.registerPolicies({
  minPrice: 5.00, // Never sell below this, regardless of discounts
  maxDiscountPct: 30, // Cap discounts at 30%
  maxQuantityPerOrder: 10000,
  deliveryRegions: ['US', 'CA', 'MX'],
  maxDeliveryDays: 3,
});

// registerPolicies returns beacon for chaining
await beacon
  .registerPolicies({
    minPrice: 5.00,
    maxDiscountPct: 30,
  })
  .beforeOffer(volumeDiscountValidator)
  .beforeOffer(seasonalPricingValidator);
```

**How it works:**
1. Scout requests 100 pens at $12.99 base price
2. Policy validator runs first: Checks `minPrice: 5.00` is enforced
3. Volume discount validator: Reduces to $11.04 (15% off for bulk)
4. Still above $5.00 floor ✅

If a validator tries to drop below `minPrice`, validation fails and the offer is rejected.

---

## Step 3: Volume Discounts

Implement tiered pricing based on order quantity. This is the most common dynamic pricing strategy:

```javascript
const volumeDiscountValidator = async (session, offer) => {
  // Define tier thresholds
  const tiers = [
    { minQty: 100, discountPct: 10 },   // 100+ units = 10% off
    { minQty: 500, discountPct: 15 },   // 500+ units = 15% off
    { minQty: 1000, discountPct: 20 },  // 1000+ units = 20% off
    { minQty: 5000, discountPct: 25 },  // 5000+ units = 25% off
  ];

  // Find the highest tier the order qualifies for
  let appliedDiscount = 0;
  for (const tier of tiers) {
    if (offer.quantity >= tier.minQty) {
      appliedDiscount = tier.discountPct;
    }
  }

  if (appliedDiscount > 0) {
    const originalPrice = offer.unitPrice;
    offer.unitPrice = originalPrice * (1 - appliedDiscount / 100);

    console.log(`📊 Volume discount applied: ${offer.quantity} units = ${appliedDiscount}%`);
    console.log(`   $${originalPrice} → $${offer.unitPrice.toFixed(2)}`);
  }

  return offer;
};

beacon.beforeOffer(volumeDiscountValidator);
```

**Example execution:**
```
Scout orders 250 pens
→ Base price: $12.99
→ Volume discount: 10% (tier: 100+)
→ Final: $12.99 × 0.90 = $11.69/unit
```

---

## Step 4: Time-Based Pricing

Adjust prices based on time of day, day of week, or season. This captures demand variation:

```javascript
const seasonalPricingValidator = async (session, offer) => {
  const now = new Date();
  const month = now.getMonth();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 5 = Friday

  let priceMultiplier = 1.0;
  const adjustments = [];

  // Peak season: September-October (back-to-school)
  if (month === 8 || month === 9) {
    priceMultiplier *= 1.15; // +15% during peak season
    adjustments.push('Peak season (+15%)');
  }

  // Off-peak: July-August (summer slump)
  if (month === 6 || month === 7) {
    priceMultiplier *= 0.95; // -5% discount
    adjustments.push('Summer off-peak (-5%)');
  }

  // Weekend premium: Friday-Sunday
  if (dayOfWeek >= 5) {
    priceMultiplier *= 1.05; // +5% on weekends
    adjustments.push('Weekend premium (+5%)');
  }

  // Apply multiplier
  if (priceMultiplier !== 1.0) {
    const originalPrice = offer.unitPrice;
    offer.unitPrice = originalPrice * priceMultiplier;

    console.log(`⏰ Seasonal adjustment applied:`);
    adjustments.forEach(adj => console.log(`   ${adj}`));
    console.log(`   $${originalPrice} → $${offer.unitPrice.toFixed(2)}`);
  }

  return offer;
};

beacon.beforeOffer(seasonalPricingValidator);
```

**Example:**
```
September 15 (Friday evening)
Scout orders pens
→ Base: $12.99
→ Back-to-school season: +15% = $14.94
→ Weekend premium: +5% = $15.69
→ Final: $15.69/unit
```

---

## Step 5: Competitive Pricing

Adjust prices based on session context (region, Scout tier, etc.). This enables responsive competition:

```javascript
const competitivePricingValidator = async (session, offer) => {
  // session.region provides location context
  const region = session.region || 'US';

  // Different margins by region
  const regionMultipliers = {
    'US': 1.0,      // Standard pricing
    'CA': 1.05,     // +5% for Canada (shipping costs)
    'EU': 1.10,     // +10% for Europe
    'APAC': 1.08,   // +8% for Asia-Pacific
  };

  const multiplier = regionMultipliers[region] || 1.0;

  if (multiplier !== 1.0) {
    const originalPrice = offer.unitPrice;
    offer.unitPrice = originalPrice * multiplier;

    console.log(`🌍 Competitive regional pricing:`);
    console.log(`   Region: ${region}`);
    console.log(`   $${originalPrice} → $${offer.unitPrice.toFixed(2)}`);
  }

  return offer;
};

beacon.beforeOffer(competitivePricingValidator);
```

---

## Step 6: Price Validation Chain

Combine multiple validators in sequence. The order matters:

```javascript
// 1. Register policies FIRST (minPrice protection)
beacon.registerPolicies({
  minPrice: 4.00,
  maxDiscountPct: 30,
});

// 2. Apply volume discounts
beacon.beforeOffer(volumeDiscountValidator);

// 3. Apply seasonal adjustments
beacon.beforeOffer(seasonalPricingValidator);

// 4. Apply regional pricing
beacon.beforeOffer(competitivePricingValidator);

// 5. Final margin validation
const marginCheckValidator = async (session, offer) => {
  const cost = offer.metadata?.cost || 0;
  const currentPrice = offer.unitPrice;
  const currentMargin = ((currentPrice - cost) / currentPrice) * 100;

  // Ensure minimum margin
  const minMargin = offer.metadata?.minMarginPct || 15;
  if (currentMargin < minMargin) {
    const minPrice = cost / (1 - minMargin / 100);
    offer.unitPrice = minPrice;

    console.log(`💰 Margin floor enforced: ${currentMargin.toFixed(1)}% < ${minMargin}%`);
    console.log(`   Raised price to $${offer.unitPrice.toFixed(2)}`);
  }

  return offer;
};

beacon.beforeOffer(marginCheckValidator);
```

**Chain execution example:**
```
Input: 500 pens, $12.99 base, $8.00 cost, 15% min margin

1. Policy validator
   → Check minPrice: $4.00 ✅
   → Check maxDiscount: 30% ✅

2. Volume discount
   → 500 units = 15% off
   → $12.99 × 0.85 = $11.04

3. Seasonal (September)
   → Back-to-school: +15%
   → $11.04 × 1.15 = $12.70

4. Competitive (US region)
   → No regional adjustment
   → $12.70

5. Margin check
   → Current margin: ($12.70 - $8.00) / $12.70 = 37%
   → Meets 15% minimum ✅
   → Final: $12.70 ✅
```

---

## Complete Working Example

Here's a full "Office Supplies" Beacon with tiered pricing, seasonal rules, and margin protection:

```javascript
#!/usr/bin/env node

import { createBeacon } from '@aura-labs/beacon';

// ============================================================================
// CATALOG & CONFIGURATION
// ============================================================================

const catalog = {
  'PEN-BLUE': {
    name: 'Blue Ballpoint Pen',
    sku: 'PEN-BLUE',
    basePrice: 12.99,
    cost: 8.00,
    minMarginPct: 15,
  },
  'PAPER-A4': {
    name: 'A4 Copy Paper',
    sku: 'PAPER-A4',
    basePrice: 4.99,
    cost: 2.50,
    minMarginPct: 20,
  },
  'FOLDER-FILE': {
    name: 'File Folder',
    sku: 'FOLDER-FILE',
    basePrice: 8.49,
    cost: 4.00,
    minMarginPct: 15,
  },
};

const beacon = createBeacon({
  coreUrl: process.env.AURA_CORE_URL || 'https://aura-labsai-production.up.railway.app',
  externalId: 'office-supplies-001',
  name: 'OfficeHub',
  description: 'Bulk office supplies with smart dynamic pricing',
  capabilities: {
    products: Object.keys(catalog),
    maxQuantityPerOrder: 10000,
    deliveryDays: 2,
  },
  metadata: {
    specialization: 'Office Supplies',
    bulkDiscounts: true,
    seasonalPricing: true,
  },
});

// ============================================================================
// PRICING VALIDATORS
// ============================================================================

const volumeDiscountValidator = async (session, offer) => {
  const tiers = [
    { minQty: 100, discountPct: 10 },
    { minQty: 500, discountPct: 15 },
    { minQty: 1000, discountPct: 20 },
    { minQty: 5000, discountPct: 25 },
  ];

  let appliedDiscount = 0;
  for (const tier of tiers) {
    if (offer.quantity >= tier.minQty) {
      appliedDiscount = tier.discountPct;
    }
  }

  if (appliedDiscount > 0) {
    const originalPrice = offer.unitPrice;
    offer.unitPrice = originalPrice * (1 - appliedDiscount / 100);
    console.log(`  📊 Volume: ${offer.quantity} units → ${appliedDiscount}% off`);
  }

  return offer;
};

const seasonalPricingValidator = async (session, offer) => {
  const now = new Date();
  const month = now.getMonth();

  let multiplier = 1.0;
  let reason = '';

  if (month === 8 || month === 9) { // Sep-Oct: back-to-school
    multiplier = 1.15;
    reason = 'Back-to-school peak season';
  } else if (month === 6 || month === 7) { // Jul-Aug: summer slump
    multiplier = 0.95;
    reason = 'Summer off-peak discount';
  }

  if (multiplier !== 1.0) {
    const originalPrice = offer.unitPrice;
    offer.unitPrice = originalPrice * multiplier;
    console.log(`  ⏰ Seasonal: ${reason}`);
  }

  return offer;
};

const marginCheckValidator = async (session, offer) => {
  const cost = offer.metadata?.cost || 0;
  const minMarginPct = offer.metadata?.minMarginPct || 15;
  const currentMargin = cost > 0 ? ((offer.unitPrice - cost) / offer.unitPrice) * 100 : 0;

  if (currentMargin < minMarginPct) {
    const minPrice = cost / (1 - minMarginPct / 100);
    offer.unitPrice = minPrice;
    console.log(`  💰 Margin floor: ${currentMargin.toFixed(1)}% < ${minMarginPct}%, raised to $${minPrice.toFixed(2)}`);
  }

  return offer;
};

// ============================================================================
// SESSION HANDLING
// ============================================================================

beacon.onSession(async (session) => {
  const sku = session.intent.raw;
  const productInfo = catalog[sku];

  if (!productInfo) {
    console.log(`❌ Product not found: ${sku}`);
    return;
  }

  // Assume quantity from session - in real app, parse from intent
  const quantity = parseInt(session.intent.raw.split(':')[1]) || 1;

  console.log(`\n🔍 New session: ${sku} × ${quantity}`);

  const offer = {
    product: {
      name: productInfo.name,
      sku: productInfo.sku,
      description: productInfo.name,
      category: 'office-supplies',
    },
    unitPrice: productInfo.basePrice,
    quantity: quantity,
    currency: 'USD',
    deliveryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    terms: 'Net 30',
    metadata: {
      basePrice: productInfo.basePrice,
      cost: productInfo.cost,
      minMarginPct: productInfo.minMarginPct,
    },
  };

  console.log(`  Base price: $${offer.unitPrice.toFixed(2)}/unit`);

  try {
    await beacon.submitOffer(session.sessionId, offer);
    console.log(`  ✅ Offer submitted`);
  } catch (error) {
    console.error(`  ❌ Offer failed: ${error.message}`);
  }
});

// ============================================================================
// SETUP & STARTUP
// ============================================================================

// Set up pricing chain: policies first, then validators in order
beacon
  .registerPolicies({
    minPrice: 3.00,
    maxDiscountPct: 30,
    maxQuantityPerOrder: 10000,
    deliveryRegions: ['US', 'CA', 'EU'],
    maxDeliveryDays: 7,
  })
  .beforeOffer(volumeDiscountValidator)
  .beforeOffer(seasonalPricingValidator)
  .beforeOffer(marginCheckValidator);

async function main() {
  try {
    console.log(`\n╔══════════════════════════════════════════════════════╗`);
    console.log(`║      🏢 OFFICEHUB - Dynamic Pricing Example          ║`);
    console.log(`║      Listening for Scout requests...                 ║`);
    console.log(`╚══════════════════════════════════════════════════════╝\n`);

    const registration = await beacon.register();
    console.log(`✅ Beacon registered: ${registration.name}`);
    console.log(`   Beacon ID: ${registration.beaconId}\n`);

    await beacon.startPolling();

    process.on('SIGINT', () => {
      console.log('\n\n🛑 Shutting down...');
      beacon.stopPolling();
      process.exit(0);
    });

  } catch (error) {
    console.error(`❌ Startup failed: ${error.message}`);
    process.exit(1);
  }
}

main();
```

**Run it:**
```bash
node office-pricing-beacon.js

# Test with custom intents (simulate Scout requests)
# Your Beacon will respond with dynamically priced offers
```

---

## Best Practices

### 1. Always Set `minPrice` Policy
Protect your baseline profitability:

```javascript
beacon.registerPolicies({
  minPrice: 4.00, // Never sell below this under any circumstance
  maxDiscountPct: 30, // Cap total discount impact
});
```

### 2. Log Every Price Adjustment
Debug pricing issues and analyze what's happening:

```javascript
const auditingValidator = async (session, offer) => {
  const originalPrice = offer.unitPrice;
  // ... make adjustments ...
  if (offer.unitPrice !== originalPrice) {
    console.log(`[AUDIT] ${offer.product.sku}: $${originalPrice} → $${offer.unitPrice}`);
  }
  return offer;
};
```

### 3. Test Pricing Edge Cases
Verify corner cases before deploying:

```javascript
// Test: Large quantity + seasonal peak + tight margin
const testOffer = {
  product: { sku: 'PEN-BLUE' },
  quantity: 10000,
  unitPrice: 12.99,
  metadata: { cost: 8.00, minMarginPct: 15 },
};

// Run through validators manually to verify results
```

### 4. Don't Race to the Bottom
Dynamic pricing doesn't mean lowest price wins:

```javascript
// ❌ Bad: Always discount to win
beacon.beforeOffer(async (session, offer) => {
  offer.unitPrice *= 0.80; // Always 20% off - kills margin!
});

// ✅ Good: Strategic discounting with volume + margin protection
beacon.registerPolicies({ minPrice: 4.00 }); // Floor protection
beacon.beforeOffer(volumeDiscountValidator); // Only for bulk
beacon.beforeOffer(marginCheckValidator); // Enforce 15% minimum
```

### 5. Chain Validators in Logical Order
Policy → Discounts → Adjustments → Final Validation:

```javascript
// 1. Policies (floor, caps)
beacon.registerPolicies({ minPrice: 4.00, maxDiscountPct: 30 });

// 2. Discounts (volume, loyalty)
beacon.beforeOffer(volumeDiscountValidator);

// 3. Adjustments (seasonal, regional, competitive)
beacon.beforeOffer(seasonalPricingValidator);
beacon.beforeOffer(competitivePricingValidator);

// 4. Final validation (margin, sanity checks)
beacon.beforeOffer(marginCheckValidator);
```

---

## Troubleshooting

### ValidationError: Price Below Floor

**Problem:**
```
ValidationError: Offer price $3.50 violates minPrice policy: $4.00
```

**Solution:**
Check which validator is dropping below the floor. The margin check validator likely needs adjustment:

```javascript
const marginCheckValidator = async (session, offer) => {
  const cost = offer.metadata?.cost || 0;
  const minPrice = offer.metadata?.minPrice || 0;

  // Respect the policy floor!
  const calculatedPrice = cost / (1 - 0.15);
  const enforcePrice = Math.max(calculatedPrice, minPrice); // Use policy floor

  offer.unitPrice = enforcePrice;
  return offer;
};
```

### Validators Not Running in Expected Order

**Problem:**
Volume discount runs before margin check, resulting in low prices.

**Solution:**
Check your registration order. `registerPolicies()` adds a validator first:

```javascript
// ✅ Correct order:
beacon.registerPolicies({ minPrice: 4.00 }); // Runs FIRST
beacon.beforeOffer(volumeDiscountValidator);  // Runs SECOND
beacon.beforeOffer(marginCheckValidator);     // Runs THIRD
```

### Prices Unexpectedly High/Low

**Problem:**
Multipliers stack unexpectedly (1.15 × 1.05 = 1.2075, not 1.20).

**Solution:**
Track adjustments explicitly:

```javascript
const trackingValidator = async (session, offer) => {
  const startPrice = offer.unitPrice;

  // Apply adjustments and log each one
  offer.unitPrice *= 1.15; // +15%
  offer.unitPrice *= 1.05; // +5%

  const totalAdjustment = ((offer.unitPrice - startPrice) / startPrice) * 100;
  console.log(`Total adjustment: +${totalAdjustment.toFixed(1)}%`);

  return offer;
};
```

---

## Next Steps

- **[Beacon Inventory Management](./beacon-inventory.md)** - Sync pricing with stock levels
- **[Beacon Multi-Store](./beacon-multistore.md)** - Manage pricing across locations
- **[Beacon Analytics](./beacon-analytics.md)** - Track pricing performance metrics
- **[Advanced Competitors](./beacon-competitive.md)** - Real-time competitive pricing

---

**Questions?** Email us at hello@aura-labs.ai or visit the [AURA Developer Community](https://aura-labs.ai/developers).
