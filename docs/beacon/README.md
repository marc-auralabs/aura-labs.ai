# Beacon SDK Documentation

Build selling agents that connect your inventory to the AURA ecosystem. Beacons are server-side agents that register with AURA Core, handle buyer sessions, submit offers, and manage transaction lifecycles.

## What is a Beacon?

A Beacon is a selling agent that:
- Registers with AURA Core and receives a unique beaconId
- Polls for new buyer sessions expressing intent
- Evaluates sessions against business rules and policies
- Submits offers with dynamic pricing and fulfillment terms
- Tracks transactions through committed → shipped → delivered → fulfilled → completed states
- Receives webhooks for state changes via a registered endpoint URL

Beacons integrate into seller systems: e-commerce platforms, ERP systems, inventory management, booking systems, and marketplace integrations.

## Quick Start

### Installation

```bash
npm install @aura-labs/beacon
```

### Basic Usage

```javascript
import { createBeacon } from '@aura-labs/beacon';

// Create beacon instance
const beacon = createBeacon({
  externalId: 'my-store-001',      // Your internal identifier
  name: 'My Store',
  description: 'Electronics retailer',
  endpointUrl: 'https://mystore.com/webhook',  // Receives transaction webhooks
  capabilities: ['retail', 'shipping'],
  coreUrl: 'https://core.aura-labs.io',
  pollIntervalMs: 5000               // Poll every 5 seconds
});

// Register with AURA Core
const { beaconId } = await beacon.register();
console.log('Registered with beaconId:', beaconId);

// Handle incoming sessions
beacon.onSession(async (session, beacon) => {
  const { sessionId, status, intent, constraints, createdAt } = session;

  // intent.raw: original buyer text
  // intent.parsed: structured intent { category, keywords, quantity, priceRange }
  // constraints: buyer requirements { maxPrice, deliveryRegions, maxDeliveryDays }

  // Evaluate if you can fulfill
  if (matchesInventory(intent.parsed)) {
    const offer = {
      product: findProduct(intent.parsed),
      unitPrice: calculatePrice(intent.parsed),
      quantity: intent.parsed.quantity || 1,
      currency: 'USD',
      deliveryDate: calculateDelivery(),
      terms: 'Standard terms apply'
    };

    await beacon.submitOffer(sessionId, offer);
  }
});

// Apply business rules
beacon.registerPolicies({
  minPrice: 10,
  maxQuantityPerOrder: 100,
  maxDeliveryDays: 30,
  deliveryRegions: ['US', 'CA', 'UK']
});

// Optional: Pre-offer validation
beacon.beforeOffer(async (session, offer) => {
  // Validate or modify offer before submission
  if (offer.unitPrice < 5) {
    throw new Error('Price too low');
  }
  return offer;  // Return modified offer or undefined to block
});

// Track accepted offers
beacon.onOfferAccepted(async (transactionData) => {
  console.log('Offer accepted, transaction:', transactionData.transactionId);
});

// Start polling for sessions
await beacon.startPolling();

// Graceful shutdown
process.on('SIGINT', async () => {
  await beacon.stopPolling();
});
```

## Core Concepts

### Registration

Beacons register once with AURA Core:

```javascript
const beacon = createBeacon({
  externalId: 'my-store-001',        // Your internal identifier
  name: 'My Store',                  // Display name
  description: 'What you sell',      // Brief description
  endpointUrl: 'https://mystore.com/webhook',  // Webhook receiver
  capabilities: ['retail', 'shipping', 'drop-shipping'],  // What you can do
  coreUrl: 'https://core.aura-labs.io',
  pollIntervalMs: 5000
});

const { beaconId } = await beacon.register();
// Returns beaconId (UUID) - use this to identify your beacon
// Future: Registration will also return Ed25519 keypair for request signing
```

**What happens:**
- POST to `/beacons/register` with config
- Core returns unique `beaconId`
- Beacon stores beaconId for all subsequent requests
- No API keys — identity via beaconId (and future Ed25519 signatures)

### Session Handling

Sessions represent buyer intent. Your beacon polls for them:

```javascript
beacon.onSession(async (session, beacon) => {
  // session structure:
  // {
  //   sessionId: "uuid",
  //   status: "pending" | "offer_requested" | "offered" | "committed",
  //   intent: {
  //     raw: "I'm looking for wireless headphones under $100",
  //     parsed: {
  //       category: "electronics",
  //       keywords: ["wireless", "headphones"],
  //       quantity: 1,
  //       priceRange: { min: 0, max: 100 }
  //     }
  //   },
  //   constraints: {
  //     maxPrice: 100,
  //     deliveryRegions: ["US"],
  //     maxDeliveryDays: 7
  //   },
  //   createdAt: "2026-03-03T10:00:00Z"
  // }

  // Respond with an offer or ignore (don't call submitOffer)
});
```

**Polling:**
```javascript
// Automatically polls GET /beacons/sessions every pollIntervalMs
await beacon.startPolling();

// Deduplicates sessions via internal Set
// Calls onSession handler for each new unique session
// Stops polling
await beacon.stopPolling();
```

### Offer Submission

Submit an offer to a session:

```javascript
const offer = {
  product: 'Wireless Headphones Pro',      // Your product name/identifier
  unitPrice: 89.99,                        // Price per unit
  quantity: 1,                             // Quantity available
  currency: 'USD',
  deliveryDate: '2026-03-10',              // When you can deliver
  terms: 'Standard return policy applies', // Optional terms
  metadata: { sku: 'SKU-123', color: 'black' }  // Optional metadata
};

await beacon.submitOffer(sessionId, offer);
// POST to /sessions/:sessionId/offers
// Returns offer confirmation
```

**Validation flow:**
1. Offer passes through `beforeOffer` validators (if registered)
2. Offer passes through policy validators (if registered)
3. Offer submitted to Core

If any validator throws or returns undefined, offer is blocked.

## Merchant Integration Hooks

### beforeOffer: Pre-Offer Validation Middleware

Validate or modify offers before submission:

```javascript
beacon.beforeOffer(async (session, offer) => {
  // Validators run sequentially (chainable)
  // Return modified offer, undefined to block, or throw to reject

  // Example: Enforce minimum margin
  if (offer.unitPrice < 50) {
    throw new Error(`Price ${offer.unitPrice} below cost`);
  }

  // Example: Modify offer based on session
  if (session.constraints.maxDeliveryDays < 3) {
    offer.deliveryDate = calculateExpressDelivery();
    offer.terms = 'Express delivery applies';
  }

  return offer;  // Return to proceed
});

// Chain multiple validators
beacon
  .beforeOffer(validateMinimumPrice)
  .beforeOffer(validateInventory)
  .beforeOffer(addDynamicDiscount);
```

### registerPolicies: Business Rules

Declare business rules. SDK auto-validates offers:

```javascript
beacon.registerPolicies({
  minPrice: 10,                    // Minimum unit price
  maxQuantityPerOrder: 100,        // Max units per offer
  maxDeliveryDays: 30,             // Maximum delivery time
  deliveryRegions: ['US', 'CA', 'UK']  // Where you ship
});
```

**What happens:**
- SDK automatically adds policy validator to beforeOffer chain
- Checks every offer against these rules
- Blocks offers that violate policies
- Policies are SDK-side only (Core doesn't enforce them)

### onOfferAccepted: Offer Committed

Called when a buyer commits to your offer:

```javascript
beacon.onOfferAccepted(async (transactionData) => {
  // {
  //   transactionId: "uuid",
  //   sessionId: "uuid",
  //   offer: { product, unitPrice, quantity, ... },
  //   committedAt: "2026-03-03T10:05:00Z"
  // }

  console.log('Order confirmed:', transactionData.transactionId);
  // Reserve inventory, create order record, etc.
});
```

### onTransactionUpdate: Track Status Changes

Called for any transaction status change:

```javascript
beacon.onTransactionUpdate(async (event) => {
  // {
  //   transactionId: "uuid",
  //   status: "committed" | "shipped" | "delivered" | "fulfilled" | "completed",
  //   timestamp: "2026-03-03T10:05:00Z",
  //   metadata: { ... }
  // }

  if (event.status === 'shipped') {
    console.log('Order shipped:', event.transactionId);
  }
});
```

### Fulfillment Tracking

Update fulfillment status as you process the order:

```javascript
// When you ship the order
await beacon.updateFulfillment(transactionId, {
  fulfillmentStatus: 'shipped',
  fulfillmentReference: 'TRACK-123456',  // Tracking number
  metadata: { carrier: 'FedEx' }
});

// When delivered
await beacon.updateFulfillment(transactionId, {
  fulfillmentStatus: 'delivered',
  metadata: { deliveredAt: '2026-03-10T14:30:00Z' }
});

// GET transaction details
const transaction = await beacon.getTransaction(transactionId);
// {
//   transactionId: "uuid",
//   sessionId: "uuid",
//   status: "delivered",
//   offer: { ... },
//   fulfillment: { status: "delivered", reference: "TRACK-123456" },
//   createdAt: "2026-03-03T10:05:00Z",
//   updatedAt: "2026-03-10T14:30:00Z"
// }
```

## Transaction Lifecycle

Transactions follow this state machine:

```
committed → shipped → delivered → fulfilled → completed
           (your action) (your action) (auto)     (auto)
                                    ↓
                              (buyer pays + delivered)
```

**States:**

- **committed**: Buyer accepted your offer. This is when you receive the order.
- **shipped**: You've shipped the order (call `updateFulfillment('shipped')`).
- **delivered**: Order arrived at buyer (call `updateFulfillment('delivered')`).
- **fulfilled**: Auto-transitioned when delivered (payment pending).
- **completed**: Auto-transitioned when paid and fulfilled.

**Webhooks:**

Core sends webhooks to your `endpointUrl` at each state change:

```javascript
// Your endpoint receives:
POST https://mystore.com/webhook
{
  transactionId: "uuid",
  status: "shipped",
  timestamp: "2026-03-10T10:00:00Z",
  offer: { ... }
}
```

Handle webhooks to trigger fulfillment workflows, accounting updates, etc.

## API Reference

### Factory Function

```javascript
const beacon = createBeacon(config)
```

| Config | Type | Description |
|--------|------|-------------|
| `externalId` | string | Your internal beacon identifier |
| `name` | string | Display name for your beacon |
| `description` | string | What the beacon does/sells |
| `endpointUrl` | string | HTTPS URL to receive webhooks |
| `capabilities` | string[] | Your capabilities: `retail`, `shipping`, `drop-shipping`, etc. |
| `coreUrl` | string | AURA Core URL (default: production) |
| `pollIntervalMs` | number | Session polling interval in milliseconds (default: 5000) |

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `register()` | `async () => { beaconId }` | Register beacon with Core, returns beaconId |
| `startPolling()` | `async () => void` | Start polling for new sessions |
| `stopPolling()` | `async () => void` | Stop polling |
| `submitOffer()` | `async (sessionId, offer) => void` | Submit offer to a session |
| `beforeOffer()` | `(validator) => beacon` | Register pre-offer validator (chainable) |
| `registerPolicies()` | `(rules) => beacon` | Register business policies (chainable) |
| `onSession()` | `(handler) => beacon` | Register session handler (chainable) |
| `onOfferAccepted()` | `(handler) => beacon` | Register offer-accepted handler (chainable) |
| `onTransactionUpdate()` | `(handler) => beacon` | Register transaction-update handler (chainable) |
| `updateFulfillment()` | `async (transactionId, update) => void` | Update fulfillment status |
| `getTransaction()` | `async (transactionId) => transaction` | Get transaction details |

### Hooks & Callbacks

| Hook | Signature | Description |
|------|-----------|-------------|
| `onSession` | `(session, beacon) => Promise<void>` | Called for each new session during polling |
| `beforeOffer` | `(session, offer) => Promise<offer \| undefined>` | Validator runs before submitOffer, can modify or block |
| `onOfferAccepted` | `(transactionData) => Promise<void>` | Called when offer is committed |
| `onTransactionUpdate` | `(event) => Promise<void>` | Called for any transaction status change |

### Data Structures

**Session:**
```javascript
{
  sessionId: string,
  status: 'pending' | 'offer_requested' | 'offered' | 'committed',
  intent: {
    raw: string,           // Original buyer text
    parsed: {
      category: string,
      keywords: string[],
      quantity: number,
      priceRange: { min: number, max: number }
    }
  },
  constraints: {
    maxPrice: number,
    deliveryRegions: string[],
    maxDeliveryDays: number
  },
  createdAt: string        // ISO timestamp
}
```

**Offer:**
```javascript
{
  product: string,         // Your product name/identifier
  unitPrice: number,       // Price per unit
  quantity: number,        // Quantity available
  totalPrice?: number,     // Optional: computed automatically if omitted
  currency?: string,       // Default: 'USD'
  deliveryDate: string,    // Date you can deliver (ISO format)
  terms?: string,          // Optional terms/conditions
  metadata?: object        // Optional custom data
}
```

**Transaction:**
```javascript
{
  transactionId: string,
  sessionId: string,
  status: 'committed' | 'shipped' | 'delivered' | 'fulfilled' | 'completed',
  offer: Offer,
  fulfillment?: {
    status: 'shipped' | 'delivered',
    reference?: string,    // Tracking number
    metadata?: object
  },
  createdAt: string,
  updatedAt: string
}
```

## Best Practices

### Session Evaluation

- Always check `constraints` (max price, delivery regions, max days)
- Use `intent.parsed` for structured data, `intent.raw` for debugging
- Ignore sessions you can't fulfill — don't submit an offer

### Offer Submission

- Submit offers quickly (within seconds of receiving session)
- Use accurate delivery dates (don't promise 2-day if you can't)
- Set realistic prices and quantities
- Don't discriminate based on buyer identity (you don't have it)

### Validation Hooks

- Use `beforeOffer` to enforce business rules at SDK level
- Keep validators fast (no complex I/O)
- Throw descriptive errors when rejecting offers
- Chain multiple validators for separation of concerns

### Fulfillment Tracking

- Call `updateFulfillment('shipped')` as soon as item ships
- Call `updateFulfillment('delivered')` when confirmed delivered
- Include tracking numbers and carrier info in metadata
- Handle webhook retries gracefully (implement idempotency)

### Polling & Performance

- Adjust `pollIntervalMs` based on session volume
- Keep handlers async but non-blocking
- Handle polling errors gracefully (exponential backoff)
- Log all sessions and offers for reconciliation

### Error Handling

```javascript
beacon.onSession(async (session) => {
  try {
    // Evaluate and submit offer
    if (canFulfill(session)) {
      await beacon.submitOffer(sessionId, offer);
    }
  } catch (error) {
    console.error('Error handling session:', error);
    // Don't re-throw — let polling continue
  }
});
```

## Integration Guides

- [Shopify Integration](../integration-guides/shopify.md)
- [WooCommerce Integration](../integration-guides/woocommerce.md)
- [Custom Platform Guide](../integration-guides/custom-ecommerce.md)
- [Webhook Handling](../integration-guides/webhooks.md)

## Examples

See [Beacon Implementations](../../beacons/) for:
- Simple Beacon (learning/prototyping)
- Retail Beacon (e-commerce)
- Travel Beacon (hospitality)
- Service Beacon (appointments)

## See Also

- [Protocol Specification](../protocol/PROTOCOL_SPECIFICATION.md)
- [AURA Core API Reference](../api/README.md)
- [Tutorials](../tutorials/README.md)
- [Troubleshooting](../guides/troubleshooting.md)
