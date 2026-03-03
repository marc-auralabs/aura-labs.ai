# Product Catalog and Inventory Management in AURA Beacons

Learn how to manage product catalogs and track inventory within your Beacon. This tutorial covers defining product catalogs, matching Scout intents to products, validating stock levels with `beforeOffer` validators, and synchronizing inventory with external systems.

## Overview

Managing inventory is about building a catalog your Beacon can offer from, and using validators to ensure you never oversell. As a Beacon, you'll:

1. **Define a product catalog** - Create a JavaScript object or database of products with SKUs, names, prices, and stock counts
2. **Match Scout intents to products** - Parse incoming Scout sessions to find products matching their requests
3. **Validate stock before offering** - Use `beforeOffer` validators to check inventory before submitting offers
4. **Handle out-of-stock gracefully** - Skip unavailable products or suggest alternatives
5. **Update inventory after transactions** - Decrement stock when offers are accepted
6. **Sync with external systems** - Load catalogs from databases or APIs in real-time

**Key insight:** The Beacon SDK does NOT provide built-in inventory management. Instead, you build inventory management around the SDK using `beforeOffer` validators and `onSession` handlers to control what you can safely offer.

## What You'll Learn

- Building and maintaining a product catalog in memory or from a database
- Parsing Scout intents to match products
- Implementing `beforeOffer` validators for inventory checks
- Gracefully handling out-of-stock scenarios
- Updating inventory when transactions complete
- Loading catalogs from external APIs and databases
- Best practices for catalog consistency and accuracy

## Prerequisites

- **Beacon SDK installed**: `npm install @aura-labs/beacon`
- **Registered Beacon**: Your Beacon must be registered with AURA Core
- **Node.js 16+**: Modern async/await support
- **Familiarity with AURA Beacons**: Basics covered in [Your First Beacon](./beacon-basics.md)
- **Understanding of offers**: How to submit offers via `submitOffer()` (see [Offer Basics](./beacon-offers.md))

## Estimated Time

~20 minutes

---

## Understanding Inventory-Driven Offers

The typical flow is:

```
Scout Intent → Beacon receives session → Match products in catalog
    → Validate inventory with beforeOffer → submitOffer() (or skip if out-of-stock)
    → Scout commits → Decrement inventory → Transaction complete
```

Unlike transactions, which are handled by the SDK, **inventory is your responsibility**. You must:

- **Store and query** your product catalog
- **Check stock** before offering
- **Block invalid offers** by throwing in `beforeOffer`
- **Update counts** when orders complete

---

## Step 1: Define Your Product Catalog

Start by creating a product catalog. For simplicity, we'll use a Map, but in production you'd load from a database:

```javascript
import { createBeacon } from '@aura-labs/beacon';

// Simple in-memory catalog (in production, load from database)
const productCatalog = new Map([
  ['BOOK-001', {
    sku: 'BOOK-001',
    name: 'The Pragmatic Programmer',
    description: 'Your Journey to Mastery in Software Development',
    category: 'programming',
    unitPrice: 49.99,
    stock: 15,
  }],
  ['BOOK-002', {
    sku: 'BOOK-002',
    name: 'Clean Code',
    description: 'A Handbook of Agile Software Craftsmanship',
    category: 'programming',
    unitPrice: 45.00,
    stock: 8,
  }],
  ['BOOK-003', {
    sku: 'BOOK-003',
    name: 'Designing Data-Intensive Applications',
    description: 'The Big Ideas Behind Reliable, Scalable, and Maintainable Systems',
    category: 'architecture',
    unitPrice: 79.99,
    stock: 0, // Out of stock
  }],
]);

// Helper to find products by keyword
function findProductByKeyword(keyword) {
  const lowerKeyword = keyword.toLowerCase();
  for (const [sku, product] of productCatalog.entries()) {
    if (product.name.toLowerCase().includes(lowerKeyword) ||
        product.category.toLowerCase().includes(lowerKeyword) ||
        product.description.toLowerCase().includes(lowerKeyword)) {
      return product;
    }
  }
  return null;
}

// Helper to get stock level
function getStock(sku) {
  const product = productCatalog.get(sku);
  return product ? product.stock : 0;
}
```

---

## Step 2: Match Scout Intents to Products

When a Scout sends a session, parse their intent to find matching products:

```javascript
const beacon = createBeacon({
  externalId: 'bookstore-beacon-001',
  name: 'BookStore Beacon',
  description: 'Your source for programming and tech books',
  capabilities: {
    products: ['books', 'programming', 'architecture'],
    maxOrder: 10,
    deliveryDays: 5,
  },
});

beacon.onSession(async (session) => {
  const { sessionId, intent, region } = session;
  const rawIntent = intent.raw;

  console.log(`\n📖 Scout intent: "${rawIntent}"`);
  console.log(`   Region: ${region}`);

  // Try to match a product
  const product = findProductByKeyword(rawIntent);

  if (!product) {
    console.log(`   ❌ No matching product found`);
    // Don't submit an offer - skip this session
    return;
  }

  console.log(`   ✅ Matched product: ${product.name} (${product.sku})`);
  console.log(`   Current stock: ${product.stock} units`);

  // Now proceed to submitOffer (with inventory validation)
  // See Step 3 below
});
```

---

## Step 3: Validate Inventory with beforeOffer

Use the `beforeOffer` validator to check stock BEFORE submitting an offer:

```javascript
// Register the beforeOffer validator
beacon.beforeOffer((session, offer) => {
  const { product, quantity } = offer;
  const currentStock = getStock(product.sku);

  console.log(`   🔍 beforeOffer validation`);
  console.log(`      Requested: ${quantity} units`);
  console.log(`      In stock: ${currentStock} units`);

  // Check if we have enough inventory
  if (currentStock < quantity) {
    console.log(`      ❌ Insufficient inventory!`);
    throw new Error(`Only ${currentStock} units available, but ${quantity} requested`);
  }

  console.log(`      ✅ Inventory validated`);
  // Return the offer if valid - it will be submitted
  return offer;
});

beacon.onSession(async (session) => {
  const { sessionId, intent } = session;
  const product = findProductByKeyword(intent.raw);

  if (!product) {
    console.log(`   ❌ No matching product`);
    return;
  }

  // Create an offer
  // The beforeOffer validator will check inventory automatically
  const offer = {
    product: {
      name: product.name,
      sku: product.sku,
      description: product.description,
      category: product.category,
    },
    unitPrice: product.unitPrice,
    quantity: 1, // Scout is requesting 1 unit
    currency: 'USD',
    deliveryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    terms: 'Standard return policy applies',
  };

  try {
    // Submit the offer (beforeOffer validator runs automatically)
    await beacon.submitOffer(sessionId, offer);
    console.log(`   ✅ Offer submitted`);
  } catch (error) {
    console.log(`   ⚠️  Offer rejected: ${error.message}`);
  }
});
```

---

## Step 4: Handle Out-of-Stock Gracefully

When a product is out of stock, you have options: skip the offer, suggest alternatives, or notify the Scout:

```javascript
beacon.onSession(async (session) => {
  const { sessionId, intent } = session;
  const product = findProductByKeyword(intent.raw);

  if (!product) {
    console.log(`   ❌ No matching product`);
    return;
  }

  const stock = getStock(product.sku);

  // Option 1: Skip if out of stock
  if (stock === 0) {
    console.log(`   ℹ️  ${product.name} is out of stock - skipping offer`);
    return;
  }

  // Option 2: Limit quantity to available stock
  if (stock < 5) {
    console.log(`   ⚠️  Low stock (${stock} units) - offering limited quantity`);
  }

  const offer = {
    product: {
      name: product.name,
      sku: product.sku,
      description: product.description,
      category: product.category,
    },
    unitPrice: product.unitPrice,
    quantity: Math.min(1, stock), // Offer only what we have
    currency: 'USD',
    deliveryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    terms: `${stock} units available. Standard return policy applies.`,
  };

  try {
    await beacon.submitOffer(sessionId, offer);
    console.log(`   ✅ Offer submitted for ${offer.quantity} units`);
  } catch (error) {
    console.log(`   ⚠️  Offer failed: ${error.message}`);
  }
});
```

---

## Step 5: Update Inventory After Transactions

When a Scout accepts your offer, decrement inventory:

```javascript
beacon.onOfferAccepted(async (transaction) => {
  const { transactionId, offer } = transaction;
  const { product, quantity } = offer;
  const sku = product.sku;

  console.log(`\n✅ Offer accepted! Updating inventory...`);
  console.log(`   Transaction: ${transactionId}`);
  console.log(`   Product: ${product.name} (${sku})`);
  console.log(`   Quantity: ${quantity}`);

  // Decrement inventory
  const catalogProduct = productCatalog.get(sku);
  if (catalogProduct) {
    const previousStock = catalogProduct.stock;
    catalogProduct.stock = Math.max(0, catalogProduct.stock - quantity);

    console.log(`   📊 Stock updated: ${previousStock} → ${catalogProduct.stock} units`);

    // In production, also update your database
    await db.inventory.update({
      sku: sku,
      stock: catalogProduct.stock,
      lastUpdated: new Date(),
      transactionId: transactionId,
    });
  }

  // Continue with fulfillment...
});
```

---

## Step 6: Sync with External Systems

Load your catalog from a database or API in real-time:

```javascript
// Load catalog from an external API
async function loadCatalogFromAPI() {
  try {
    const response = await fetch('https://api.inventory-system.com/products');
    const products = await response.json();

    // Clear and rebuild catalog
    productCatalog.clear();
    products.forEach(p => {
      productCatalog.set(p.sku, {
        sku: p.sku,
        name: p.name,
        description: p.description,
        category: p.category,
        unitPrice: p.price,
        stock: p.availableQuantity,
      });
    });

    console.log(`📚 Loaded ${productCatalog.size} products from external API`);
  } catch (error) {
    console.error(`❌ Failed to load catalog: ${error.message}`);
  }
}

// Reload catalog periodically (e.g., every 5 minutes)
setInterval(async () => {
  console.log(`\n🔄 Syncing catalog with external system...`);
  await loadCatalogFromAPI();
}, 5 * 60 * 1000);

// Also reload on startup
async function main() {
  await loadCatalogFromAPI();

  const registration = await beacon.register();
  console.log(`✅ Beacon registered: ${registration.name}`);

  await beacon.startPolling();
}

main().catch(console.error);
```

---

## Complete Working Example

Here's a full BookStore Beacon with complete inventory management:

```javascript
#!/usr/bin/env node

import { createBeacon } from '@aura-labs/beacon';

// ============================================================================
// PRODUCT CATALOG: In-memory store with stock tracking
// ============================================================================
const productCatalog = new Map([
  ['BOOK-001', {
    sku: 'BOOK-001',
    name: 'The Pragmatic Programmer',
    description: 'Your Journey to Mastery in Software Development',
    category: 'programming',
    unitPrice: 49.99,
    stock: 15,
  }],
  ['BOOK-002', {
    sku: 'BOOK-002',
    name: 'Clean Code',
    description: 'A Handbook of Agile Software Craftsmanship',
    category: 'programming',
    unitPrice: 45.00,
    stock: 8,
  }],
  ['BOOK-003', {
    sku: 'BOOK-003',
    name: 'Design Patterns',
    description: 'Elements of Reusable Object-Oriented Software',
    category: 'architecture',
    unitPrice: 54.99,
    stock: 5,
  }],
  ['BOOK-004', {
    sku: 'BOOK-004',
    name: 'Microservices Patterns',
    description: 'With examples in Java',
    category: 'architecture',
    unitPrice: 59.99,
    stock: 0, // Out of stock
  }],
]);

// Helper functions
function findProductByKeyword(keyword) {
  const lower = keyword.toLowerCase();
  for (const [, product] of productCatalog.entries()) {
    if (product.name.toLowerCase().includes(lower) ||
        product.category.toLowerCase().includes(lower) ||
        product.description.toLowerCase().includes(lower)) {
      return product;
    }
  }
  return null;
}

function getStock(sku) {
  const product = productCatalog.get(sku);
  return product ? product.stock : 0;
}

async function reserveInventory(sku, quantity) {
  // In production, this would be transactional
  const product = productCatalog.get(sku);
  if (product && product.stock >= quantity) {
    product.stock -= quantity;
    return true;
  }
  return false;
}

// ============================================================================
// BEACON SETUP: Create and configure
// ============================================================================
const beacon = createBeacon({
  coreUrl: process.env.AURA_CORE_URL || 'https://aura-labsai-production.up.railway.app',
  externalId: 'bookstore-beacon-001',
  name: 'BookStore Beacon',
  description: 'Your source for programming and architecture books',
  capabilities: {
    products: ['books', 'programming', 'architecture'],
    maxOrder: 10,
    deliveryDays: 5,
  },
  metadata: {
    categories: ['programming', 'architecture', 'design'],
    totalProducts: productCatalog.size,
  },
});

// ============================================================================
// BEFOREOFFER VALIDATOR: Check inventory before submitting
// ============================================================================
beacon.beforeOffer((session, offer) => {
  const { product, quantity } = offer;
  const currentStock = getStock(product.sku);

  console.log(`   🔍 Validating inventory for ${product.name}`);
  console.log(`      Requested: ${quantity}, Available: ${currentStock}`);

  if (currentStock < quantity) {
    console.log(`      ❌ Insufficient inventory`);
    throw new Error(`Only ${currentStock} units available`);
  }

  console.log(`      ✅ Stock OK`);
  return offer;
});

// ============================================================================
// SESSION HANDLER: Match intents to products and submit offers
// ============================================================================
beacon.onSession(async (session) => {
  const { sessionId, intent } = session;

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`📖 Scout seeking: "${intent.raw}"`);

  // Step 1: Find matching product
  const product = findProductByKeyword(intent.raw);
  if (!product) {
    console.log(`   ❌ No matching product found`);
    return;
  }

  const stock = getStock(product.sku);
  console.log(`   ✅ Found: ${product.name}`);
  console.log(`   Stock: ${stock} units @ $${product.unitPrice}`);

  // Step 2: Skip if out of stock
  if (stock === 0) {
    console.log(`   ℹ️  Out of stock - passing`);
    return;
  }

  // Step 3: Create offer
  const offer = {
    product: {
      name: product.name,
      sku: product.sku,
      description: product.description,
      category: product.category,
    },
    unitPrice: product.unitPrice,
    quantity: 1,
    currency: 'USD',
    deliveryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    terms: `${stock} units in stock. Books are returnable within 30 days.`,
  };

  // Step 4: Submit offer (beforeOffer validator runs here)
  try {
    await beacon.submitOffer(sessionId, offer);
    console.log(`   ✅ Offer submitted`);
  } catch (error) {
    console.log(`   ⚠️  Offer rejected: ${error.message}`);
  }
});

// ============================================================================
// OFFER ACCEPTED: Scout commits, decrement inventory
// ============================================================================
beacon.onOfferAccepted(async (transaction) => {
  const { transactionId, offer } = transaction;
  const { product, quantity } = offer;
  const sku = product.sku;

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`✅ SALE! Inventory Update`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`   Transaction: ${transactionId}`);
  console.log(`   Product: ${product.name} (${sku})`);
  console.log(`   Quantity: ${quantity}`);

  const catalogProduct = productCatalog.get(sku);
  if (catalogProduct) {
    const before = catalogProduct.stock;
    catalogProduct.stock = Math.max(0, catalogProduct.stock - quantity);
    console.log(`   📊 Stock: ${before} → ${catalogProduct.stock} units`);
  }
});

// ============================================================================
// PERIODIC SYNC: Reload catalog from external system
// ============================================================================
async function syncCatalog() {
  console.log(`\n🔄 Syncing catalog with inventory system...`);
  // In production: fetch from API/database
  // For demo, just log
  console.log(`   📚 ${productCatalog.size} products available`);
  let totalStock = 0;
  for (const p of productCatalog.values()) {
    totalStock += p.stock;
  }
  console.log(`   📦 Total stock: ${totalStock} units`);
}

// Sync every 10 minutes
setInterval(syncCatalog, 10 * 60 * 1000);

// ============================================================================
// STARTUP
// ============================================================================
async function main() {
  try {
    console.log(`\n╔════════════════════════════════════════════════════════════╗`);
    console.log(`║       📚 BOOKSTORE BEACON - Inventory Management           ║`);
    console.log(`║                                                            ║`);
    console.log(`║  Ready to match Scout intents with our product catalog    ║`);
    console.log(`╚════════════════════════════════════════════════════════════╝`);

    // Print catalog
    console.log(`\n📖 Current Catalog:`);
    for (const product of productCatalog.values()) {
      const status = product.stock === 0 ? '❌ OUT OF STOCK' : `✅ ${product.stock} units`;
      console.log(`   ${product.sku}: ${product.name} - ${status}`);
    }

    const registration = await beacon.register();
    console.log(`\n✅ Beacon registered: ${registration.name}`);
    console.log(`   ID: ${registration.beaconId}`);

    // Initial sync
    await syncCatalog();

    // Start listening for Scout sessions
    await beacon.startPolling();
    console.log(`\n👂 Listening for Scout intents...`);

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\n🛑 Shutting down...');
      beacon.stopPolling();

      // Print final inventory
      console.log('\n📊 Final Inventory:');
      for (const product of productCatalog.values()) {
        console.log(`   ${product.sku}: ${product.stock} units`);
      }
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
node bookstore-beacon.js

# With custom Core URL:
AURA_CORE_URL=http://localhost:3000 node bookstore-beacon.js
```

---

## Best Practices

### 1. Always Validate Stock Before AND After
Check inventory both in `beforeOffer` and in `onOfferAccepted`. Stock can change between offer submission and acceptance:

```javascript
beacon.beforeOffer((session, offer) => {
  if (getStock(offer.product.sku) < offer.quantity) {
    throw new Error('Out of stock');
  }
  return offer;
});

beacon.onOfferAccepted(async (transaction) => {
  // Revalidate - another beacon may have sold the item
  if (getStock(transaction.offer.product.sku) < transaction.offer.quantity) {
    console.warn('Stock mismatch - handling gracefully');
    // Notify Scout, refund, cancel, etc.
  }
});
```

### 2. Use SKUs Consistently
Always use the same SKU format across your catalog, offers, and inventory updates:

```javascript
// ✅ Good: Consistent SKU format
const offer = {
  product: { sku: 'BOOK-001', ... },
  ...
};
const stock = getStock('BOOK-001');

// ❌ Bad: Inconsistent
const offer = {
  product: { sku: 'book_001', ... }, // Different format!
  ...
};
const stock = getStock('BOOK-001'); // Won't match
```

### 3. Log All Inventory Changes
Maintain an audit trail of inventory updates for reconciliation:

```javascript
async function logInventoryChange(sku, before, after, reason, transactionId) {
  const log = {
    timestamp: new Date().toISOString(),
    sku,
    before,
    after,
    reason, // 'sale', 'restock', 'adjustment', etc.
    transactionId,
  };
  await fs.appendFile('inventory.jsonl', JSON.stringify(log) + '\n');
}

beacon.onOfferAccepted(async (transaction) => {
  const before = getStock(sku);
  // ... decrement stock ...
  const after = getStock(sku);
  await logInventoryChange(sku, before, after, 'sale', transaction.transactionId);
});
```

### 4. Handle Race Conditions
Multiple Beacons or external updates can cause race conditions. Use atomic operations:

```javascript
// Use a lock or database transaction for safety
const stockLock = new Map();

async function reserveWithLock(sku, quantity) {
  // Acquire lock
  while (stockLock.get(sku)) {
    await new Promise(r => setTimeout(r, 10));
  }
  stockLock.set(sku, true);

  try {
    const product = productCatalog.get(sku);
    if (product.stock >= quantity) {
      product.stock -= quantity;
      return true;
    }
    return false;
  } finally {
    stockLock.delete(sku);
  }
}
```

### 5. Sync Regularly with External Systems
Don't rely on in-memory catalog alone. Periodically refresh from your source of truth:

```javascript
setInterval(async () => {
  try {
    const externalInventory = await db.getAllProducts();
    for (const ext of externalInventory) {
      const local = productCatalog.get(ext.sku);
      if (local && local.stock !== ext.stock) {
        console.warn(`Stock mismatch for ${ext.sku}: ${local.stock} vs ${ext.stock}`);
        local.stock = ext.stock; // Sync with source of truth
      }
    }
  } catch (error) {
    console.error(`Failed to sync catalog: ${error.message}`);
  }
}, 5 * 60 * 1000); // Every 5 minutes
```

---

## Troubleshooting

### beforeOffer validator not called
Ensure you register the validator BEFORE calling `onSession`:

```javascript
// ✅ Correct order
beacon.beforeOffer((session, offer) => { ... });
beacon.onSession(async (session) => { ... });
await beacon.startPolling();

// ❌ Wrong: register after polling starts
await beacon.startPolling();
beacon.beforeOffer((session, offer) => { ... }); // May not work
```

### Stock mismatch between offers and transactions
This happens when multiple Beacons compete for the same products. Revalidate in `onOfferAccepted`:

```javascript
beacon.onOfferAccepted(async (transaction) => {
  const actualStock = await fetchStockFromDB(sku);
  if (actualStock < transaction.offer.quantity) {
    // Handle: refund Scout, notify, etc.
    console.error('Stock mismatch - Scout will be refunded');
  }
});
```

### External catalog not syncing
Check that your API/database is accessible and responding correctly:

```javascript
async function syncCatalog() {
  try {
    const response = await fetch('https://api.example.com/products', {
      timeout: 5000,
      headers: { 'Authorization': `Bearer ${process.env.API_KEY}` },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    // ... process response ...
  } catch (error) {
    console.error(`Sync failed: ${error.message}`);
    // Keep using cached catalog if sync fails
  }
}
```

### Inventory not updating after offer accepted
Ensure you're using the correct SKU and that the product exists in your catalog:

```javascript
beacon.onOfferAccepted(async (transaction) => {
  const sku = transaction.offer.product.sku;
  const product = productCatalog.get(sku);

  if (!product) {
    console.error(`Product ${sku} not found in catalog!`);
    return;
  }

  product.stock = Math.max(0, product.stock - transaction.offer.quantity);
});
```

---

## Next Steps

- **[Transaction Handling](./beacon-transactions.md)** - Complete order fulfillment and payment workflows
- **[Pricing & Policies](./beacon-policies.md)** - Set min/max prices and business rules
- **[Multi-Store Beacons](./beacon-multistore.md)** - Manage inventory across multiple locations
- **[Integration: Database](./integration-database.md)** - Sync catalog with your inventory system

---

**Questions?** Email us at hello@aura-labs.ai or visit the [AURA Developer Community](https://aura-labs.ai/developers).
