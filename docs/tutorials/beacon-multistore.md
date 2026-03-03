# Managing Multiple Locations with Beacon

## Overview

As your business grows across multiple warehouses, fulfillment centers, or retail locations, you need a way to manage inventory and pricing across all of them through a single AURA Beacon. While Beacon represents a single merchant registration, you can build sophisticated location-aware logic that routes customer intents to the right warehouse, aggregates inventory, and provides location-specific pricing.

This tutorial walks you through implementing a multi-location strategy with Beacon, enabling you to serve customers from the warehouse closest to them with the fastest shipping and best availability.

## What You'll Learn

- How to structure location data (warehouses, stores, fulfillment centers)
- How to match customer sessions to the most appropriate location
- How to aggregate inventory across multiple locations
- How to implement location-specific pricing and shipping
- How to route fulfillment decisions to the correct warehouse
- How to use policies to control which regions you serve

## Prerequisites

- Familiarity with Beacon basics (see [Getting Started with Beacon](./beacon-getting-started.md))
- Understanding of AURA sessions and intents
- Node.js 16+ and the `@aura-labs/beacon` SDK installed
- Knowledge of your warehouse/location network and inventory systems

## Estimated Time

45 minutes

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Scout (Customer)                       │
└──────────────────────────────────┬───────────────────────────┘
                                   │
                                   ▼
                        ┌──────────────────────────┐
                        │      AURA Core           │
                        │     (Orchestrator)       │
                        └──────────────┬───────────┘
                                       │
                        ┌──────────────▼───────────┐
                        │   Single Beacon          │
                        │  (Your Merchant)         │
                        └──────────────┬───────────┘
                                       │
                 ┌─────────────────────┼─────────────────────┐
                 ▼                     ▼                     ▼
        ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
        │  Warehouse A     │  │  Warehouse B     │  │  Warehouse C     │
        │  (West Region)   │  │  (Central Region)│  │  (East Region)   │
        │  - Inventory     │  │  - Inventory     │  │  - Inventory     │
        │  - Pricing       │  │  - Pricing       │  │  - Pricing       │
        └──────────────────┘  └──────────────────┘  └──────────────────┘
```

## Step 1: Define Your Locations

Create a data structure that represents each warehouse, store, or fulfillment center:

```javascript
const locations = [
  {
    id: 'warehouse-west',
    name: 'West Coast Distribution Center',
    region: 'west',
    center: { lat: 34.0522, lng: -118.2437 }, // Los Angeles
    inventory: {
      'PART-001': 150,
      'PART-002': 45,
      'PART-003': 0
    },
    shippingDays: 1,
    baseShippingCost: 8.99,
    handlingCost: 2.50
  },
  {
    id: 'warehouse-central',
    name: 'Central Distribution Center',
    region: 'central',
    center: { lat: 41.8781, lng: -87.6298 }, // Chicago
    inventory: {
      'PART-001': 75,
      'PART-002': 200,
      'PART-003': 120
    },
    shippingDays: 2,
    baseShippingCost: 6.99,
    handlingCost: 2.50
  },
  {
    id: 'warehouse-east',
    name: 'East Coast Distribution Center',
    region: 'east',
    center: { lat: 40.7128, lng: -74.0060 }, // New York
    inventory: {
      'PART-001': 200,
      'PART-002': 80,
      'PART-003': 95
    },
    shippingDays: 1,
    baseShippingCost: 7.99,
    handlingCost: 2.50
  }
];
```

## Step 2: Match Sessions to the Best Location

Use the session's region hint to determine which warehouse should handle the request:

```javascript
function findBestLocationForSession(session) {
  // If session includes region data, use it
  if (session.region) {
    const location = locations.find(loc => loc.region === session.region);
    if (location) return location;
  }

  // Fallback: return primary location
  return locations[0];
}
```

## Step 3: Aggregate Inventory Across Locations

Check if ANY location has the requested product in stock, and identify which one is best:

```javascript
function findInventoryForProduct(sku, quantity) {
  // Find all locations with sufficient inventory
  const capable = locations.filter(loc =>
    (loc.inventory[sku] || 0) >= quantity
  );

  if (capable.length === 0) {
    return null; // Out of stock everywhere
  }

  // Return the one with shortest shipping time (you can customize this logic)
  return capable.reduce((best, loc) =>
    loc.shippingDays < best.shippingDays ? loc : best
  );
}
```

## Step 4: Implement Location-Specific Pricing

Different warehouses may have different unit costs and shipping rates:

```javascript
function calculatePricingForLocation(location, productData, quantity) {
  const baseUnitPrice = productData.basePrice;
  const warehouseCost = location.handlingCost;
  const shippingCost = location.baseShippingCost;

  // Your warehouse might have bulk pricing
  const unitPrice = quantity > 10 ? baseUnitPrice * 0.95 : baseUnitPrice;

  return {
    unitPrice,
    totalProductCost: unitPrice * quantity,
    shippingCost,
    warehouseCost,
    totalPrice: (unitPrice * quantity) + shippingCost + warehouseCost
  };
}
```

## Step 5: Set Up Location-Aware Session Handling

Use Beacon's `onSession` and `beforeOffer` hooks to route requests intelligently:

```javascript
const beacon = createBeacon({
  externalId: 'multistore-beacon-001',
  name: 'National Parts Distributor',
  description: 'Multi-location fulfillment network',
  coreUrl: 'https://aura-core.example.com',
  capabilities: {
    products: ['parts', 'components', 'industrial supplies'],
    maxOrder: 5000,
    deliveryDays: 5,
  },
  metadata: { locations: locations.length },
  endpointUrl: 'https://api.example.com/beacon',
  timeout: 5000
});

beacon.onSession(async (session) => {
  console.log(`Session ${session.sessionId} from region: ${session.region}`);

  // Determine which location should handle this
  const location = findBestLocationForSession(session);
  console.log(`Routing to: ${location.name}`);
});

beacon.beforeOffer(async (session, proposedOffer) => {
  const sku = proposedOffer.product.sku;
  const quantity = proposedOffer.quantity;

  // Find the best location with inventory
  const fulfillmentLocation = findInventoryForProduct(sku, quantity);

  if (!fulfillmentLocation) {
    return undefined; // Cannot fulfill
  }

  // Calculate location-specific pricing
  const pricing = calculatePricingForLocation(
    fulfillmentLocation,
    { basePrice: proposedOffer.unitPrice },
    quantity
  );

  // Return modified offer with location metadata
  return {
    ...proposedOffer,
    unitPrice: pricing.unitPrice,
    terms: {
      shippingCost: pricing.shippingCost,
      estimatedDeliveryDays: fulfillmentLocation.shippingDays
    },
    metadata: {
      fulfillmentLocationId: fulfillmentLocation.id,
      fulfillmentLocationName: fulfillmentLocation.name,
      region: fulfillmentLocation.region
    },
    deliveryDate: new Date(Date.now() + fulfillmentLocation.shippingDays * 24 * 60 * 60 * 1000)
  };
});

beacon.registerPolicies({
  minPrice: 1.99,
  maxQuantityPerOrder: 1000,
  deliveryRegions: ['west', 'central', 'east'],
  maxDeliveryDays: 5
});

await beacon.register();
await beacon.startPolling();
```

## Complete Working Example

Here's a complete example: a National Parts Distributor with three regional warehouses:

```javascript
import { createBeacon } from '@aura-labs/beacon';

// Initialize beacon with multi-location support
const beacon = createBeacon({
  externalId: 'national-parts-dist-001',
  name: 'National Parts Distributor',
  description: 'Multi-warehouse fulfillment network',
  coreUrl: 'https://aura-core.example.com',
  capabilities: {
    products: ['parts', 'components', 'industrial supplies'],
    maxOrder: 5000,
    deliveryDays: 5,
  },
  endpointUrl: 'https://api.example.com/beacon',
  pollIntervalMs: 5000,
  timeout: 5000,
  metadata: {
    locations: 3,
    totalInventoryItems: 500
  }
});

// Define product catalog
const products = {
  'PART-001': { name: 'Ball Bearing', basePrice: 2.99, category: 'components' },
  'PART-002': { name: 'Gasket Set', basePrice: 4.49, category: 'kits' },
  'PART-003': { name: 'Timing Belt', basePrice: 12.99, category: 'components' }
};

// Session routing
beacon.onSession(async (session) => {
  console.log(`Processing session: ${session.sessionId}`);
  console.log(`Customer region preference: ${session.region}`);
});

// Location-aware offer generation
beacon.beforeOffer(async (session, proposedOffer) => {
  const sku = proposedOffer.product.sku;
  const quantity = proposedOffer.quantity;

  // Find fulfillment location
  const location = findInventoryForProduct(sku, quantity);
  if (!location) return undefined;

  // Update pricing
  const pricing = calculatePricingForLocation(location, products[sku], quantity);

  // Return enhanced offer
  return {
    ...proposedOffer,
    unitPrice: pricing.unitPrice,
    terms: {
      shippingCost: pricing.shippingCost,
      estimatedDeliveryDays: location.shippingDays
    },
    metadata: {
      warehouseId: location.id,
      warehouseName: location.name,
      warehouseRegion: location.region
    }
  };
});

beacon.registerPolicies({
  minPrice: 1.99,
  maxQuantityPerOrder: 500,
  deliveryRegions: ['west', 'central', 'east'],
  maxDeliveryDays: 5
});

// Start the beacon
(async () => {
  try {
    await beacon.register();
    console.log('Beacon registered successfully');
    await beacon.startPolling();
    console.log('Beacon polling started');
  } catch (error) {
    console.error('Beacon error:', error);
  }
})();
```

## Best Practices

**Failover Logic**: If your primary warehouse is out of stock, automatically check secondary and tertiary locations. Prioritize closest location, then best inventory, then lowest cost.

**Inventory Sync**: Integrate with your warehouse management systems to keep real-time inventory synchronized. A stale inventory count can lead to overselling.

**Log Routing Decisions**: Track which location fulfills each order for analytics and debugging. Include warehouse ID in offer metadata and transaction logs.

**Region-Aware Policies**: Use `registerPolicies` with `deliveryRegions` to ensure you only offer fulfillment for regions you actually serve.

**Load Balancing**: Consider distributing orders across locations to prevent bottlenecks. Round-robin or weighted distribution can help.

## Troubleshooting

**Offer Rejected for All Locations**: Check that at least one location has the product in stock and serves the customer's region. Verify `deliveryRegions` in policies matches session regions.

**Incorrect Pricing**: Ensure `calculatePricingForLocation` is being called with current warehouse cost data. Log the pricing calculation to verify accuracy.

**Sessions Not Routing Correctly**: Verify that `session.region` is populated by AURA Core. If empty, implement fallback logic to select a default location.

**Fulfillment Metadata Missing**: Confirm that `beforeOffer` is properly attaching warehouse information to the offer metadata before returning.

## Next Steps

- Explore [Beacon Analytics](./beacon-analytics.md) to track multi-location performance
- Learn about [Beacon Transactions](./beacon-transactions.md) for order confirmation
- Implement advanced inventory synchronization with your warehouse systems
- Set up regional pricing tiers and seasonal adjustments

---

*Have questions? Email us at hello@aura-labs.ai*
