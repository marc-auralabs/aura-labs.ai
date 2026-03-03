# Beacon Basics: Creating Your First Selling Agent

Welcome to AURA! This tutorial will guide you through creating and running your first Beacon—an intelligent selling agent that responds to purchase intents from Scout buyers. By the end, you'll have a working Beacon that can register with AURA Core, listen for buyer sessions, and submit competitive offers in real-time.

## What You'll Learn

- What a Beacon is and how it fits into the AURA ecosystem
- How to install the Beacon SDK
- How to create and configure a Beacon
- How to register your Beacon with AURA Core
- How to listen for buyer sessions and submit offers
- How to start polling for new opportunities
- Best practices for Beacon development

## Prerequisites

- Node.js 16 or higher
- npm or yarn installed
- Basic JavaScript knowledge
- An internet connection (to connect to AURA Core)

**Estimated Time:** ~15 minutes

---

## What is a Beacon?

In the AURA ecosystem, a **Beacon** is a selling agent that represents your business. When a Scout (a buyer's agent) searches for products or services, your Beacon can respond with offers. Think of it as your automated sales representative that:

- Registers with AURA Core to make your business discoverable
- Listens for buyer intents (e.g., "I need 500 industrial widgets")
- Evaluates each opportunity in real-time
- Submits competitive offers to interested buyers
- Tracks order fulfillment and customer relationships

Beacons are the foundation of the AURA marketplace—they're how suppliers connect with buyers at scale.

---

## Step 1: Install the SDK

Create a new directory for your Beacon and initialize Node.js:

```bash
mkdir my-first-beacon
cd my-first-beacon
npm init -y
npm install @aura-labs/beacon
```

---

## Step 2: Create Your First Beacon

Create a new file called `beacon.js`:

```javascript
import { createBeacon } from '@aura-labs/beacon';

const beacon = createBeacon({
  externalId: 'acme-widgets-001',
  name: 'ACME Widget Co.',
  description: 'Premium industrial widgets and components',
  capabilities: {
    products: ['industrial-widgets', 'components'],
    maxOrder: 10000,
    deliveryDays: 3
  },
  metadata: {
    rating: 4.8,
    reviewCount: 247,
    certifications: ['ISO-9001', 'ISO-14001']
  }
});

console.log('Beacon created:', beacon.name);
```

This configuration tells AURA about your business:
- **externalId**: Your unique identifier (should be consistent across runs)
- **name**: Display name shown to buyers
- **capabilities**: What you can sell and delivery constraints
- **metadata**: Trust signals like ratings and certifications

---

## Step 3: Register with AURA Core

After creating your Beacon, register it with AURA Core:

```javascript
const registered = await beacon.register();
console.log('Registration successful!');
console.log('Beacon ID:', registered.beaconId);
console.log('Status:', registered.status);
```

Registration returns:
- `beaconId`: Your unique identifier in AURA (used for all transactions)
- `externalId`: Your original ID
- `name`: Your registered name
- `status`: Typically "active" after successful registration

---

## Step 4: Listen for Scout Sessions

Sessions are purchase opportunities. When a Scout finds a matching buyer, it creates a session and sends it to your Beacon:

```javascript
beacon.onSession(async (session) => {
  console.log('New session received!');
  console.log('Intent:', session.intent.raw);
  console.log('Region:', session.region);
  console.log('Session ID:', session.sessionId);
});
```

The `session.intent.raw` contains the buyer's natural language request—e.g., "I need 500 industrial widgets for automotive manufacturing."

---

## Step 5: Submit Your First Offer

When you receive a session, evaluate it and submit an offer:

```javascript
beacon.onSession(async (session) => {
  // Check if this is an opportunity for you
  if (session.intent.raw.includes('widget')) {

    // Create a competitive offer
    const offer = {
      product: {
        name: 'Industrial Widget Pro',
        sku: 'WDG-500-PRO',
        description: 'High-precision industrial widget, 500-pack',
        category: 'industrial-components'
      },
      unitPrice: 85.00,
      quantity: 500,
      currency: 'USD',
      deliveryDate: '2026-03-10',
      terms: {
        warranty: '12-month manufacturer warranty',
        returnPolicy: '30-day full refund guarantee'
      }
    };

    // Submit the offer
    try {
      await beacon.submitOffer(session.sessionId, offer);
      console.log('Offer submitted successfully!');
    } catch (error) {
      console.error('Failed to submit offer:', error.message);
    }
  }
});
```

---

## Step 6: Start Polling

Begin polling AURA Core for new sessions. Polling checks periodically (default: every 5 seconds) for incoming opportunities:

```javascript
await beacon.startPolling();
console.log('Beacon is now listening for opportunities!');
```

The Beacon will now:
1. Check for new sessions every 5 seconds
2. Trigger your `onSession` handler when sessions arrive
3. Continue until you call `beacon.stopPolling()`

---

## Understanding the Flow

Here's how a transaction flows through AURA:

```
┌──────────────┐
│ Scout Intent │  "I need 500 widgets"
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ Session Created  │  Scout creates session, routes to Beacons
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Beacon Polls     │  Your beacon checks for new sessions
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Offer Submitted  │  Your beacon evaluates & submits offer
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Scout Evaluates  │  Scout compares offers from all Beacons
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Transaction      │  Winner is selected, order confirmed
└──────────────────┘
```

---

## Complete Working Example

Here's a complete, runnable Beacon that you can start with:

```javascript
import { createBeacon } from '@aura-labs/beacon';

const beacon = createBeacon({
  externalId: 'acme-widgets-001',
  name: 'ACME Widget Co.',
  description: 'Premium industrial widgets and components',
  capabilities: {
    products: ['industrial-widgets', 'components'],
    maxOrder: 10000,
    deliveryDays: 3
  },
  metadata: {
    rating: 4.8,
    reviewCount: 247,
    certifications: ['ISO-9001', 'ISO-14001']
  }
});

// Register with AURA Core
console.log('Registering Beacon...');
const registered = await beacon.register();
console.log(`✓ Registered as "${registered.name}" (ID: ${registered.beaconId})`);

// Listen for buyer sessions
beacon.onSession(async (session) => {
  console.log(`\n🔔 New session from Scout!`);
  console.log(`   Intent: "${session.intent.raw}"`);
  console.log(`   Region: ${session.region}`);

  // Create and submit an offer
  const offer = {
    product: {
      name: 'Industrial Widget Pro',
      sku: 'WDG-500-PRO',
      description: 'High-precision industrial widget, 500-pack',
      category: 'industrial-components'
    },
    unitPrice: 85.00,
    quantity: 500,
    currency: 'USD',
    deliveryDate: '2026-03-10',
    terms: {
      warranty: '12-month manufacturer warranty',
      returnPolicy: '30-day full refund guarantee'
    }
  };

  try {
    await beacon.submitOffer(session.sessionId, offer);
    console.log(`   ✓ Offer submitted: 500 units @ $85 each`);
  } catch (error) {
    console.error(`   ✗ Failed to submit offer: ${error.message}`);
  }
});

// Handle accepted offers
beacon.onOfferAccepted((transaction) => {
  console.log(`\n🎉 Offer accepted!`);
  console.log(`   Transaction ID: ${transaction.txnId}`);
  console.log(`   Total: $${transaction.total}`);
});

// Start listening for opportunities
console.log('Starting to listen for opportunities...');
await beacon.startPolling();
console.log('✓ Beacon is ready! Listening for buyer intents...\n');

// Keep the process running
process.on('SIGINT', () => {
  console.log('\nShutting down Beacon...');
  beacon.stopPolling();
  process.exit(0);
});
```

To run this example:

```bash
node beacon.js
```

Your Beacon will now register and start listening for opportunities. When a Scout sends a matching session, your Beacon will submit an offer.

---

## Best Practices

### ✓ DO: Validate Sessions Before Offering

```javascript
beacon.onSession(async (session) => {
  // Check if this opportunity matches your business
  if (session.intent.raw.toLowerCase().includes('widget') &&
      session.region === 'us-east') {
    // Only then submit an offer
    await beacon.submitOffer(session.sessionId, offer);
  }
});
```

### ✗ DON'T: Submit Offers for Everything

```javascript
// Bad: Submitting offers you can't fulfill
beacon.onSession(async (session) => {
  await beacon.submitOffer(session.sessionId, offer); // Always submit!
});
```

### ✓ DO: Use Unique External IDs

```javascript
const beacon = createBeacon({
  externalId: 'acme-widgets-001', // Include company + instance ID
  // ...
});
```

### ✗ DON'T: Hardcode Configuration

```javascript
// Bad: Configuration is hardcoded
const beacon = createBeacon({
  externalId: 'beacon-123',
  // ...
});
```

### ✓ DO: Handle Errors Gracefully

```javascript
try {
  await beacon.submitOffer(session.sessionId, offer);
} catch (error) {
  console.error('Failed to submit offer:', error.message);
  // Log error, alert team, or retry later
}
```

### ✗ DON'T: Ignore Submission Errors

```javascript
// Bad: Silent failures
await beacon.submitOffer(session.sessionId, offer);
```

---

## Troubleshooting

### Issue: "Registration failed: Invalid externalId"
**Solution:** Ensure `externalId` is a non-empty string and unique to your Beacon. Try including your company name and an instance identifier.

```javascript
externalId: 'my-company-beacon-001'
```

### Issue: "Beacon is polling but not receiving sessions"
**Solution:**
- Verify your `externalId` hasn't changed (it must be consistent)
- Check that your capabilities match buyer intents
- Ensure your network allows outbound HTTPS connections
- Review your Beacon's `metadata` to ensure it shows credibility

### Issue: "OfferError: Cannot submit offer without registering first"
**Solution:** Always call `beacon.register()` and wait for it to complete before calling other methods:

```javascript
const registered = await beacon.register();
// Now safe to use other methods
await beacon.startPolling();
```

### Issue: "Timeout connecting to AURA Core"
**Solution:** AURA Core is at `https://aura-labsai-production.up.railway.app`. Verify:
- You have internet connectivity
- Your firewall allows HTTPS (port 443)
- The service is accessible (check status page)

### Issue: "session is undefined in onSession handler"
**Solution:** Ensure your handler is registered *before* calling `startPolling()`:

```javascript
beacon.onSession(async (session) => { /* ... */ }); // Register first
await beacon.startPolling();                        // Then start polling
```

---

## Next Steps

You now have a working Beacon! Here's what to learn next:

1. **[Beacon Inventory](./beacon-inventory.md)** - Manage your product catalog and availability
2. **[Beacon Pricing](./beacon-pricing.md)** - Set dynamic prices and discounts
3. **[Beacon Transactions](./beacon-transactions.md)** - Handle order fulfillment and tracking
4. **[Advanced Policies](./beacon-policies.md)** - Implement business rules and validation

---

## Questions?

We're here to help! Reach out to **hello@aura-labs.ai** with questions, feedback, or feature requests.

Happy selling! 🚀
