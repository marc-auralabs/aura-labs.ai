# Transaction Handling in AURA Beacons

Learn how to handle the complete transaction lifecycle in AURA, from receiving Scout purchase intents to fulfilling orders and processing payments. This tutorial covers offer acceptance, transaction tracking, fulfillment workflows, and payment confirmation.

## Overview

When a Scout agent finds a Beacon with a matching offer, they commit to purchase, creating a **transaction**. As a Beacon, you'll:

1. **Receive and accept offers** - Handle `transaction.committed` events when a Scout chooses your offer
2. **Track transactions** - Query transaction details and monitor status
3. **Fulfill orders** - Report shipping and delivery progress
4. **Process payments** - Update payment status as funds are collected
5. **Listen for updates** - React to transaction status changes via webhooks

The transaction state machine flows like this:

```
committed → fulfilled (when delivered) → completed (when payment charged)
```

## What You'll Learn

- Setting up transaction handlers with the Beacon SDK
- Receiving and processing `transaction.committed` events
- Fetching transaction details and current status
- Reporting fulfillment progress (packed, shipped, delivered)
- Processing payments and completing transactions
- Handling errors and retries
- Best practices for reliable order fulfillment

## Prerequisites

- **Beacon SDK installed**: `npm install @aura-labs/beacon`
- **Registered Beacon**: Your Beacon must be registered with AURA Core
- **Node.js 16+**: Modern async/await support
- **Familiarity with AURA Beacons**: Basics covered in [Your First Beacon](./beacon-basics.md)

## Estimated Time

~30 minutes

---

## Understanding the Transaction Lifecycle

### 1. Offer Submission
You submit an offer in response to a Scout session:

```
Scout Intent → Beacon receives session → submitOffer() → stored as open offer
```

### 2. Offer Commitment (Scout commits)
When a Scout chooses your offer, AURA Core creates a transaction:

```
Scout commits to offer → POST /v1/sessions/:id/commit → Transaction created
→ transaction.committed webhook event sent to your beacon
```

### 3. Fulfillment Phase
You report shipment and delivery:

```
Order packed → updateFulfillment({ fulfillmentStatus: "shipped", ... })
→ fulfillment.updated webhook
→ Order delivered → updateFulfillment({ fulfillmentStatus: "delivered", ... })
→ Auto-transitions transaction to "fulfilled"
```

### 4. Payment Phase
You update payment status:

```
Payment processed → updatePayment({ paymentStatus: "charged", paymentReference: "..." })
→ payment.updated webhook
→ Auto-transitions transaction to "completed"
```

---

## Step 1: Set Up Your Beacon with Transaction Handlers

First, register handlers for transaction events. The Beacon SDK provides two main entry points:

### Handler 1: `onOfferAccepted()` - When a Scout Commits

Called immediately when a Scout purchases your offer:

```javascript
import { createBeacon } from '@aura-labs/beacon';

const beacon = createBeacon({
  externalId: 'electronics-seller-001',
  name: 'ElectroHub',
  description: 'Premium electronics and computer parts',
  capabilities: {
    products: ['laptops', 'desktops', 'monitors', 'keyboards', 'mice'],
    maxOrder: 100,
    deliveryDays: 3,
  },
});

// Register to be notified when Scout commits to your offer
beacon.onOfferAccepted(async (transaction) => {
  console.log(`✅ Offer accepted! Transaction ID: ${transaction.transactionId}`);
  console.log(`   Scout bought: ${transaction.offer.quantity}x ${transaction.offer.product.name}`);
  console.log(`   Total: $${transaction.offer.totalPrice}`);

  // Now you have the transaction ID - use it for future operations
  const txnId = transaction.transactionId;

  // Next: fetch full details, validate inventory, etc.
});

await beacon.register();
await beacon.startPolling();
```

### Handler 2: `onTransactionUpdate()` - Webhook Events

Receive status change notifications. Set up an `endpointUrl` in your Beacon config to receive webhooks:

```javascript
const beacon = createBeacon({
  externalId: 'electronics-seller-001',
  name: 'ElectroHub',
  // Tell AURA where to send webhook events
  endpointUrl: 'https://your-server.com/webhooks/aura',
  // ... other config
});

// Handle webhook events
beacon.onTransactionUpdate(async (event) => {
  console.log(`📨 Webhook: ${event.type}`);
  console.log(`   Transaction: ${event.transactionId}`);
  console.log(`   Status: ${event.status}`);

  // event.type could be: 'transaction.committed', 'fulfillment.updated', etc.
});
```

---

## Step 2: Responding to Offer Acceptance

When a Scout commits to your offer, AURA creates a transaction and notifies you. Your `onOfferAccepted` handler receives transaction details:

```javascript
beacon.onOfferAccepted(async (transaction) => {
  const {
    transactionId,
    scoutId,
    offer: {
      product,
      quantity,
      unitPrice,
      totalPrice,
      deliveryDate,
    },
    createdAt,
  } = transaction;

  console.log(`🛍️  New Order Received`);
  console.log(`   TX ID: ${transactionId}`);
  console.log(`   Product: ${product.name} (SKU: ${product.sku})`);
  console.log(`   Qty: ${quantity} @ $${unitPrice} = $${totalPrice}`);
  console.log(`   Must deliver by: ${deliveryDate}`);
  console.log(`   Order time: ${createdAt}`);

  // Typical next steps:
  // 1. Validate inventory is still available
  // 2. Create order in your backend
  // 3. Begin fulfillment (pick, pack, ship)
  // 4. Handle any errors gracefully
});
```

---

## Step 3: Fetching Transaction Details

After offer acceptance, use `getTransaction()` to fetch the full transaction state at any time:

```javascript
beacon.onOfferAccepted(async (transaction) => {
  const txnId = transaction.transactionId;

  try {
    // Fetch full transaction details from Core
    const fullTxn = await beacon.getTransaction(txnId);

    console.log(`Transaction Status: ${fullTxn.status}`);
    console.log(`Fulfillment Status: ${fullTxn.fulfillmentStatus}`);
    console.log(`Payment Status: ${fullTxn.paymentStatus}`);
    console.log(`Created: ${fullTxn.createdAt}`);

    // Use this to verify state before proceeding
    if (fullTxn.status === 'committed') {
      console.log('✅ Ready to fulfill this order');
    }
  } catch (error) {
    console.error(`Failed to fetch transaction: ${error.message}`);
  }
});
```

---

## Step 4: Reporting Fulfillment Progress

As you process the order, update the fulfillment status. The system tracks three key states:

| Status | Meaning |
|--------|---------|
| `pending` | Initial state, awaiting fulfillment |
| `shipped` | Package is in transit (provide tracking) |
| `delivered` | Package delivered to Scout |

**Important:** When fulfillment status reaches `delivered`, the transaction automatically transitions to `fulfilled`.

### Example: Full Fulfillment Workflow

```javascript
beacon.onOfferAccepted(async (transaction) => {
  const txnId = transaction.transactionId;
  const product = transaction.offer.product;
  const quantity = transaction.offer.quantity;

  console.log(`📦 Processing order ${txnId}...`);

  try {
    // Step 1: Pick & Pack (simulate delay)
    console.log(`   🏭 Packing ${quantity}x ${product.name}...`);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 2: Ship the order
    console.log(`   🚚 Creating shipment...`);
    const trackingNumber = `TRK-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    await beacon.updateFulfillment(txnId, {
      fulfillmentStatus: 'shipped',
      fulfillmentReference: trackingNumber, // Tracking number/ID
      metadata: {
        carrierCode: 'UPS',
        estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        weightKg: 1.2,
      },
    });
    console.log(`   ✅ Shipped! Tracking: ${trackingNumber}`);

    // Step 3: Later, mark as delivered
    // (In production, this would come from carrier webhook or manual confirmation)
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log(`   📍 Marking as delivered...`);
    await beacon.updateFulfillment(txnId, {
      fulfillmentStatus: 'delivered',
      metadata: {
        deliveredAt: new Date().toISOString(),
        deliveredTo: 'Front porch',
      },
    });
    console.log(`   ✅ Order delivered! Transaction auto-transitioned to "fulfilled"`);

  } catch (error) {
    console.error(`❌ Fulfillment error: ${error.message}`);
    // Handle error: retry logic, notify Scout, etc.
  }
});
```

---

## Step 5: Processing Payments

Once the order is delivered, process the payment. This step is critical for completing the transaction.

```javascript
beacon.onTransactionUpdate(async (event) => {
  // Watch for fulfillment completion
  if (event.type === 'fulfillment.updated' && event.fulfillmentStatus === 'delivered') {
    console.log(`🎉 Order delivered! Now processing payment...`);

    const txnId = event.transactionId;

    try {
      // Step 1: Charge the Scout's payment method
      // (In real scenario, call your payment processor: Stripe, PayPal, etc.)
      const paymentReference = await chargePayment(event.offer.totalPrice);

      // Step 2: Report payment to AURA Core
      // When paymentStatus becomes 'charged', transaction auto-transitions to 'completed'
      await beacon.updatePayment(txnId, {
        paymentStatus: 'charged',
        paymentReference: paymentReference, // Stripe charge ID, PayPal txn ID, etc.
        metadata: {
          processor: 'stripe',
          amount: event.offer.totalPrice,
          currency: 'USD',
          timestamp: new Date().toISOString(),
        },
      });

      console.log(`✅ Payment processed! Transaction completed.`);

    } catch (error) {
      console.error(`❌ Payment failed: ${error.message}`);
      // Handle payment failure: retry, notify, etc.
    }
  }
});

// Mock payment processor
async function chargePayment(amount) {
  // Real implementation would call Stripe, PayPal API, etc.
  console.log(`   💳 Processing $${amount}...`);
  const chargeId = `ch_${Date.now()}`;
  return chargeId;
}
```

**Note:** The Beacon SDK currently provides `updateFulfillment()`. For full payment handling, you may need to call the Core API directly:

```javascript
// Direct Core API call for payment (if updatePayment not yet in SDK)
const result = await beacon._client.put(`/transactions/${txnId}/payment`, {
  paymentStatus: 'charged',
  paymentReference: chargeId,
});
```

---

## Step 6: Error Handling & Retries

Transaction operations can fail due to network issues, validation errors, or server problems. Implement robust error handling:

```javascript
import { BeaconError, RegistrationError, ValidationError } from '@aura-labs/beacon';

beacon.onOfferAccepted(async (transaction) => {
  const txnId = transaction.transactionId;
  let retryCount = 0;
  const maxRetries = 3;

  while (retryCount < maxRetries) {
    try {
      await beacon.updateFulfillment(txnId, {
        fulfillmentStatus: 'shipped',
        fulfillmentReference: 'TRK-123456',
      });
      break; // Success

    } catch (error) {
      retryCount++;

      if (error instanceof RegistrationError) {
        console.error('❌ Beacon not registered:', error.message);
        break; // Don't retry - registration issue
      }

      if (error instanceof ValidationError) {
        console.error('❌ Validation failed:', error.message);
        break; // Don't retry - validation failed
      }

      if (error instanceof BeaconError) {
        if (retryCount < maxRetries) {
          const delayMs = 1000 * Math.pow(2, retryCount); // Exponential backoff
          console.warn(`⚠️  Retry ${retryCount}/${maxRetries} after ${delayMs}ms...`);
          await new Promise(r => setTimeout(r, delayMs));
        } else {
          console.error('❌ Max retries exceeded:', error.message);
          // Implement fallback: queue for later, notify operator, etc.
          await queueForRetry(txnId, 'fulfillment_update');
        }
      }
    }
  }
});

async function queueForRetry(txnId, operation) {
  // Store in database for manual retry later
  console.log(`📋 Queued ${operation} for ${txnId}`);
}
```

---

## Complete Working Example

Here's a full Beacon implementation handling transactions end-to-end:

```javascript
#!/usr/bin/env node

import { createBeacon } from '@aura-labs/beacon';

const beacon = createBeacon({
  coreUrl: process.env.AURA_CORE_URL || 'https://aura-labsai-production.up.railway.app',
  externalId: 'electrohub-seller',
  name: 'ElectroHub',
  description: 'Your trusted source for electronics & computer hardware',
  endpointUrl: process.env.WEBHOOK_URL || 'https://electrohub.local/webhooks/aura',
  capabilities: {
    products: ['laptops', 'monitors', 'keyboards', 'mice', 'cables'],
    minPrice: 10,
    maxQuantityPerOrder: 50,
    deliveryDays: 3,
  },
  metadata: {
    rating: 4.9,
    reviewCount: 2847,
    certifications: ['ISO 9001', 'B2B Verified'],
  },
});

// Track active orders
const activeOrders = new Map();

// ============================================================================
// OFFER ACCEPTANCE: When Scout commits to your offer
// ============================================================================
beacon.onOfferAccepted(async (transaction) => {
  const txnId = transaction.transactionId;
  const { product, quantity, unitPrice, totalPrice } = transaction.offer;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`✅ OFFER ACCEPTED - New Transaction Created`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Transaction ID: ${txnId}`);
  console.log(`Product: ${product.name} (SKU: ${product.sku})`);
  console.log(`Quantity: ${quantity} units @ $${unitPrice}/unit`);
  console.log(`Total: $${totalPrice}`);
  console.log(`Must deliver by: ${transaction.offer.deliveryDate}`);

  // Store order for tracking
  activeOrders.set(txnId, {
    transactionId: txnId,
    product,
    quantity,
    totalPrice,
    status: 'pending_fulfillment',
    startedAt: Date.now(),
  });

  // Begin async fulfillment workflow
  fulfillOrder(beacon, txnId, quantity, product);
});

// ============================================================================
// TRANSACTION UPDATES: Monitor fulfillment and payment via webhooks
// ============================================================================
beacon.onTransactionUpdate(async (event) => {
  console.log(`\n📨 Webhook Event: ${event.type}`);
  console.log(`   Transaction: ${event.transactionId}`);
  console.log(`   Status: ${event.status}`);

  if (event.type === 'transaction.committed') {
    console.log(`   → Scout committed to your offer`);
  }

  if (event.type === 'fulfillment.updated') {
    console.log(`   → Fulfillment: ${event.fulfillmentStatus}`);
    if (event.fulfillmentReference) {
      console.log(`   → Tracking: ${event.fulfillmentReference}`);
    }
  }

  if (event.type === 'payment.updated') {
    console.log(`   → Payment: ${event.paymentStatus}`);
    if (event.paymentReference) {
      console.log(`   → Reference: ${event.paymentReference}`);
    }
  }
});

// ============================================================================
// FULFILLMENT WORKFLOW: Execute order fulfillment process
// ============================================================================
async function fulfillOrder(beacon, txnId, quantity, product) {
  try {
    // Fetch current transaction state
    console.log(`\n🔍 Fetching transaction details...`);
    const txn = await beacon.getTransaction(txnId);
    console.log(`   Status: ${txn.status}`);
    console.log(`   Fulfillment: ${txn.fulfillmentStatus || 'pending'}`);
    console.log(`   Payment: ${txn.paymentStatus || 'pending'}`);

    // Step 1: Validate Inventory
    console.log(`\n📦 Validating inventory...`);
    const hasInventory = await checkInventory(product.sku, quantity);
    if (!hasInventory) {
      console.error(`❌ INSUFFICIENT INVENTORY for ${product.sku}`);
      // In production: notify Scout, trigger refund, etc.
      return;
    }
    console.log(`   ✅ ${quantity} units available`);

    // Step 2: Reserve inventory
    await reserveInventory(product.sku, quantity);

    // Step 3: Simulate picking & packing
    console.log(`\n🏭 Packing order...`);
    await new Promise(r => setTimeout(r, 2000));

    // Step 4: Ship and report
    console.log(`\n🚚 Shipping order...`);
    const trackingNumber = `UPS-${Date.now()}`;

    await beacon.updateFulfillment(txnId, {
      fulfillmentStatus: 'shipped',
      fulfillmentReference: trackingNumber,
      metadata: {
        carrier: 'UPS',
        weightKg: 2.5,
        packingSlipId: `PACK-${txnId.slice(-8)}`,
      },
    });
    console.log(`   ✅ Shipped with tracking: ${trackingNumber}`);

    activeOrders.get(txnId).status = 'shipped';
    activeOrders.get(txnId).trackingNumber = trackingNumber;

    // Step 5: Simulate delivery
    console.log(`\n📍 Simulating delivery (3 second delay)...`);
    await new Promise(r => setTimeout(r, 3000));

    console.log(`\n✨ Marking order as delivered...`);
    await beacon.updateFulfillment(txnId, {
      fulfillmentStatus: 'delivered',
      metadata: {
        deliveredAt: new Date().toISOString(),
        signature: 'signature_on_file',
      },
    });
    console.log(`   ✅ Delivered! Transaction auto-transitioned to "fulfilled"`);

    activeOrders.get(txnId).status = 'fulfilled';
    activeOrders.get(txnId).deliveredAt = Date.now();

    // Step 6: Process payment
    console.log(`\n💳 Processing payment...`);
    const paymentRef = await processPaymentWithStripe(txn.offer.totalPrice);
    console.log(`   ✅ Payment processed: ${paymentRef}`);

    activeOrders.get(txnId).status = 'completed';
    activeOrders.get(txnId).paymentReference = paymentRef;

    console.log(`\n${'='.repeat(70)}`);
    console.log(`🎉 ORDER COMPLETE: ${txnId}`);
    console.log(`${'='.repeat(70)}`);

  } catch (error) {
    console.error(`\n❌ Order fulfillment failed: ${error.message}`);

    // In production, implement:
    // - Retry logic with exponential backoff
    // - Dead letter queue for failed orders
    // - Alert/notification to operators
    // - Potential refund processing

    if (activeOrders.has(txnId)) {
      activeOrders.get(txnId).status = 'failed';
      activeOrders.get(txnId).error = error.message;
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS: Inventory and Payment
// ============================================================================
async function checkInventory(sku, quantity) {
  // Mock: would query real inventory system
  const inventory = {
    'LAPTOP-001': 50,
    'MONITOR-4K': 30,
    'KEYBOARD-MECH': 100,
  };
  return (inventory[sku] || 0) >= quantity;
}

async function reserveInventory(sku, quantity) {
  // Mock: would update inventory system
  console.log(`   📋 Reserved ${quantity} units of ${sku}`);
}

async function processPaymentWithStripe(amount) {
  // Mock: would call Stripe API
  // In production:
  // const charge = await stripe.charges.create({
  //   amount: Math.round(amount * 100),
  //   currency: 'usd',
  //   source: 'tok_visa',
  // });
  // return charge.id;

  const mockChargeId = `ch_${Date.now()}`;
  console.log(`   🏦 Stripe charge: ${mockChargeId} for $${amount}`);
  return mockChargeId;
}

// ============================================================================
// STARTUP
// ============================================================================
async function main() {
  try {
    console.log(`\n╔════════════════════════════════════════════════════════════╗`);
    console.log(`║           🔌 ELECTROHUB - Transaction Handler              ║`);
    console.log(`║                                                            ║`);
    console.log(`║  Listening for Scout purchases and fulfilling orders...   ║`);
    console.log(`╚════════════════════════════════════════════════════════════╝\n`);

    const registration = await beacon.register();
    console.log(`✅ Beacon registered: ${registration.name}`);
    console.log(`   ID: ${registration.beaconId}`);

    await beacon.startPolling();

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\n🛑 Shutting down...');
      beacon.stopPolling();

      // Print final status
      if (activeOrders.size > 0) {
        console.log('\nActive Orders:');
        activeOrders.forEach((order, txnId) => {
          console.log(`  ${txnId}: ${order.status}`);
        });
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
node transaction-handler.js

# With custom Core URL:
AURA_CORE_URL=http://localhost:3000 node transaction-handler.js
```

---

## Best Practices

### 1. Idempotency
Operations may be retried due to network failures. Ensure fulfillment updates are idempotent:

```javascript
// ✅ Good: Idempotent - safe to call multiple times
await beacon.updateFulfillment(txnId, {
  fulfillmentStatus: 'shipped',
  fulfillmentReference: 'UPS-123', // Fixed value, not incremented
});

// ❌ Bad: Not idempotent - multiple calls cause issues
let count = 0;
await beacon.updateFulfillment(txnId, {
  metadata: { attemptCount: ++count }, // Changes on retry!
});
```

### 2. Persist Transaction IDs
Store transaction IDs in your database immediately for reconciliation:

```javascript
beacon.onOfferAccepted(async (transaction) => {
  // Save to DB right away
  await db.orders.create({
    transactionId: transaction.transactionId,
    beaconId: beacon.id,
    scoutId: transaction.scoutId,
    product: transaction.offer.product,
    quantity: transaction.offer.quantity,
    totalPrice: transaction.offer.totalPrice,
    createdAt: new Date(),
  });
});
```

### 3. Validate Before Fulfilling
Always check inventory and availability before committing to fulfillment:

```javascript
beacon.beforeOffer((session, offer) => {
  // Validate before submitting offer
  if (!hasInventory(offer.product.sku, offer.quantity)) {
    throw new ValidationError('Out of stock');
  }
  return offer;
});

beacon.onOfferAccepted(async (transaction) => {
  // Revalidate before fulfilling (inventory may have changed)
  if (!hasInventory(transaction.offer.product.sku, transaction.offer.quantity)) {
    // Handle: refund, cancel, notify
  }
});
```

### 4. Timeout & Deadline Awareness
Respect delivery deadlines and implement timeouts:

```javascript
beacon.onOfferAccepted(async (transaction) => {
  const deliveryDeadline = new Date(transaction.offer.deliveryDate);
  const timeoutMs = deliveryDeadline - Date.now();

  if (timeoutMs < 3600000) { // Less than 1 hour
    console.warn(`⚠️  Tight delivery deadline: ${timeoutMs}ms`);
  }

  // Set timeout for fulfillment
  setTimeout(() => {
    if (activeOrders.get(transaction.transactionId)?.status === 'pending') {
      console.error(`❌ Fulfillment timeout for ${transaction.transactionId}`);
    }
  }, timeoutMs);
});
```

### 5. Log Everything
Maintain detailed logs for debugging and compliance:

```javascript
beacon.onOfferAccepted(async (transaction) => {
  const log = {
    timestamp: new Date().toISOString(),
    transactionId: transaction.transactionId,
    event: 'offer_accepted',
    offer: transaction.offer,
    beaconId: beacon.id,
  };

  await logToFile('orders.jsonl', JSON.stringify(log));
});
```

### 6. Monitor Transaction Status
Periodically check transaction status to catch issues:

```javascript
// Periodic health check
setInterval(async () => {
  for (const [txnId, order] of activeOrders) {
    if (order.status === 'shipped') {
      const txn = await beacon.getTransaction(txnId);

      // If status changed unexpectedly, alert
      if (txn.status !== 'committed' && txn.status !== 'fulfilled') {
        console.warn(`⚠️  Unexpected status change for ${txnId}: ${txn.status}`);
      }
    }
  }
}, 30000); // Every 30 seconds
```

---

## Troubleshooting

### Transaction not found
Ensure you're using the correct `transactionId` from the `onOfferAccepted` callback:

```javascript
// ✅ Correct: Use transactionId from callback
beacon.onOfferAccepted(async (transaction) => {
  const txnId = transaction.transactionId;
  await beacon.updateFulfillment(txnId, { ... });
});

// ❌ Wrong: sessionId is not the same as transactionId!
beacon.onSession(async (session) => {
  await beacon.updateFulfillment(session.sessionId, { ... }); // Will fail
});
```

### Fulfillment status not updating
Verify the beacon is registered before calling `updateFulfillment()`:

```javascript
if (!beacon.isRegistered) {
  await beacon.register();
}
await beacon.updateFulfillment(txnId, { ... });
```

### Payment processing fails
Check that fulfillment status is `delivered` before processing payment:

```javascript
const txn = await beacon.getTransaction(txnId);
if (txn.fulfillmentStatus !== 'delivered') {
  console.error('Cannot process payment until order is delivered');
  return;
}
```

### Webhook events not received
Ensure your beacon config includes a valid `endpointUrl`:

```javascript
const beacon = createBeacon({
  // ... other config
  endpointUrl: 'https://your-server.com/webhooks/aura',
});
```

The endpoint must be HTTPS, publicly accessible, and return a 2xx status code to acknowledge receipt.

---

## Next Steps

- **[Beacon Policies & Validation](./beacon-policies.md)** - Enforce business rules and pricing
- **[Multi-Store Beacons](./beacon-multistore.md)** - Manage multiple inventory locations
- **[Integration: Shopify](./integration-shopify.md)** - Connect to your existing store
- **[Error Handling Guide](./error-handling.md)** - Comprehensive error strategies

---

**Questions?** Email us at hello@aura-labs.ai or visit the [AURA Developer Community](https://aura-labs.ai/developers).
