# @aura-labs/beacon

Beacon SDK for AURA — Build selling agents that participate in agentic commerce.

## What is a Beacon?

A Beacon is a seller agent in the AURA ecosystem. Beacons:
- Register their capabilities with AURA Core
- Poll for sessions matching their products/services
- Submit offers in response to Scout intents
- Fulfill committed transactions

## Installation

```bash
npm install @aura-labs/beacon
```

## Quick Start

```javascript
import { createBeacon } from '@aura-labs/beacon';

// Create and register a Beacon
const beacon = createBeacon({
  externalId: 'my-store-001',
  name: 'My Store',
  capabilities: { products: ['widgets', 'gadgets'] },
});

await beacon.register();

// Handle incoming sessions
beacon.onSession(async (session) => {
  if (session.intent.raw.includes('widget')) {
    await beacon.submitOffer(session.sessionId, {
      product: { name: 'Premium Widget', sku: 'WDG-001' },
      unitPrice: 85.00,
      quantity: 500,
      deliveryDate: '2026-02-20',
    });
  }
});

// Start polling for sessions
// (For production use, see Merchant Integration Hooks below for offer validation and fulfillment tracking)
await beacon.startPolling();
```

## Test Beacons (Stubs)

The SDK includes several test beacons simulating different vendor types:

| Beacon | Description | Responds To |
|--------|-------------|-------------|
| `widgets` | Acme Widget Co. | widget, industrial |
| `electronics` | TechMart Electronics | laptop, computer, monitor, keyboard |
| `office` | OfficeMax Pro | desk, chair, paper, printer, office |
| `cloud` | Nimbus Cloud Services | server, vm, cloud, database, storage, gpu |
| `travel` | Wanderlust Travel | flight, hotel, travel, vacation |

### Running Individual Beacons

```bash
# Using npm scripts
npm run demo:widgets
npm run demo:electronics
npm run demo:office
npm run demo:cloud
npm run demo:travel

# Or run files directly
node examples/widget-supplier.js
node examples/electronics-vendor.js
node examples/office-supplies.js
node examples/cloud-services.js
node examples/travel-agent.js
```

### Running All Beacons (Marketplace Demo)

Run all beacons simultaneously for a full marketplace simulation:

```bash
npm run demo
# or
node examples/run-all-beacons.js
```

### Beacon CLI

```bash
# List available beacons
npx beacon-cli list

# Run a specific beacon
npx beacon-cli run widgets
npx beacon-cli run electronics

# Run all beacons
npx beacon-cli run all

# Show connection info
npx beacon-cli info
```

### Environment Variables

```bash
# Custom Core URL
AURA_CORE_URL=http://localhost:3000 npm run demo

# Custom polling interval (ms)
POLL_INTERVAL=5000 npm run demo:widgets
```

## API Reference

### `createBeacon(config)`

Create a new Beacon instance.

```javascript
const beacon = createBeacon({
  externalId: 'required-unique-id',  // Your unique identifier
  name: 'Required Name',              // Display name
  description: 'Optional description',
  endpointUrl: 'https://...',         // Optional webhook URL
  capabilities: {},                    // What you sell
  coreUrl: 'https://...',             // Optional, defaults to production
  pollIntervalMs: 5000,               // Polling interval
});
```

### `beacon.register()`

Register with AURA Core. Called automatically by `startPolling()` if needed.

```javascript
const result = await beacon.register();
// { beaconId: 'uuid', externalId: '...', name: '...', status: 'active' }
```

### `beacon.onSession(handler)`

Register a handler for incoming sessions.

```javascript
beacon.onSession(async (session, beacon) => {
  console.log('New session:', session.sessionId);
  console.log('Intent:', session.intent.raw);

  // Decide whether to submit an offer
  if (matchesMyProducts(session)) {
    await beacon.submitOffer(session.sessionId, myOffer);
  }
});
```

### `beacon.submitOffer(sessionId, offer)`

Submit an offer to a session.

```javascript
await beacon.submitOffer(sessionId, {
  product: { name: 'Widget', sku: 'WDG-001' },
  unitPrice: 85.00,
  quantity: 500,
  totalPrice: 42500.00,  // Optional, calculated if not provided
  currency: 'USD',
  deliveryDate: '2026-02-20',
  terms: { warranty: '2 years' },
  metadata: { sustainable: true },
});
```

### `beacon.startPolling()`

Start polling for sessions. Calls registered handlers for each new session.

### `beacon.stopPolling()`

Stop polling.

### `beacon.getSessions()`

Manually fetch available sessions without polling.

```javascript
const sessions = await beacon.getSessions();
```

## Merchant Integration Hooks

Integration hooks enable advanced merchant logic including offer validation, business rule enforcement, and fulfillment tracking. All hook methods return `this` for method chaining.

### `beacon.beforeOffer(validator)`

Register a pre-offer validation middleware. Runs sequentially before each `submitOffer()` call. Use this to validate inventory, apply dynamic pricing, or enforce business rules.

**Validator Signature:**
```javascript
async (session, proposedOffer) => modifiedOffer | undefined
```

- If validator throws an error, the offer is blocked
- If validator returns an object, it is merged into the offer
- If validator returns `undefined`, the offer proceeds unchanged

**Example: Inventory Check**
```javascript
beacon.beforeOffer(async (session, proposedOffer) => {
  const inventory = await checkInventory(proposedOffer.product.sku);
  if (inventory < proposedOffer.quantity) {
    throw new Error(`Insufficient inventory: only ${inventory} available`);
  }
  // Return undefined to proceed with original offer
});
```

**Example: Dynamic Price Floor**
```javascript
beacon.beforeOffer(async (session, proposedOffer) => {
  const minPrice = await calculateMinPrice(proposedOffer.product.sku);
  if (proposedOffer.unitPrice < minPrice) {
    // Return modified offer with minimum price
    return { unitPrice: minPrice };
  }
});
```

### `beacon.onOfferAccepted(handler)`

Register a handler called when an offer is committed/accepted by the buyer.

**Handler Signature:**
```javascript
async (transactionData) => void
```

**Example: Log Accepted Orders**
```javascript
beacon.onOfferAccepted(async (transactionData) => {
  console.log(`Order ${transactionData.transactionId} accepted`);
  await logOrderToSystem(transactionData);
  await notifyWarehouse(transactionData);
});
```

### `beacon.onTransactionUpdate(handler)`

Register a handler for transaction status changes (e.g., payment confirmed, shipped, delivered).

**Handler Signature:**
```javascript
async (event) => void
```

**Example: Track Transaction Status**
```javascript
beacon.onTransactionUpdate(async (event) => {
  console.log(`Transaction ${event.transactionId}: ${event.status}`);
  if (event.status === 'payment_confirmed') {
    await chargeCard(event.paymentReference);
  }
});
```

### `beacon.registerPolicies(policies)`

Declare your merchant business rules. Auto-adds a built-in `beforeOffer` validator enforcing these policies.

**Policies Object:**
```javascript
{
  minPrice?: number,              // Minimum unit price
  maxQuantityPerOrder?: number,   // Order quantity cap
  maxDeliveryDays?: number,       // Maximum days until delivery
  deliveryRegions?: string[],     // Supported shipping regions
}
```

**Example: Enforce Business Rules**
```javascript
beacon.registerPolicies({
  minPrice: 10.00,
  maxQuantityPerOrder: 1000,
  maxDeliveryDays: 7,
  deliveryRegions: ['US', 'CA', 'MX'],
});

// Now all offers are validated against these policies automatically
```

### `beacon.updateFulfillment(transactionId, update)`

Report fulfillment progress to AURA Core.

**Update Object:**
```javascript
{
  fulfillmentStatus: 'shipped' | 'delivered',
  fulfillmentReference?: string,  // Tracking number, shipment ID, etc.
  metadata?: object,              // Additional metadata
}
```

**Example: Report Shipment**
```javascript
await beacon.updateFulfillment(transactionId, {
  fulfillmentStatus: 'shipped',
  fulfillmentReference: 'FDX123456789',
  metadata: { carrier: 'FedEx', estimatedDelivery: '2026-03-10' },
});
```

### `beacon.getTransaction(transactionId)`

Fetch detailed transaction information from AURA Core.

**Example: Check Transaction Details**
```javascript
const transaction = await beacon.getTransaction(transactionId);
console.log(`Status: ${transaction.status}`);
console.log(`Amount: ${transaction.totalPrice} ${transaction.currency}`);
console.log(`Buyer: ${transaction.buyerInfo.name}`);
```

### Chaining Example

Integration hooks support method chaining for clean setup:

```javascript
beacon
  .registerPolicies({
    minPrice: 15.00,
    maxQuantityPerOrder: 500,
  })
  .beforeOffer(async (session, offer) => {
    const inventory = await checkInventory(offer.product.sku);
    if (inventory < offer.quantity) {
      throw new Error('Out of stock');
    }
  })
  .onOfferAccepted(async (tx) => {
    await fulfillmentService.createOrder(tx);
  })
  .onTransactionUpdate(async (event) => {
    if (event.status === 'dispute') {
      await escalationTeam.alert(event);
    }
  });

await beacon.register();
await beacon.startPolling();
```

## Beacon Properties

Access beacon state and metadata:

```javascript
beacon.isRegistered  // boolean — beacon registered with Core
beacon.id            // UUID assigned by AURA Core
beacon.externalId    // Your external identifier
beacon.name          // Display name
beacon.isPolling     // boolean — polling active
```

## Error Classes

The SDK exports the following error types for precise error handling:

- `BeaconError` — Base error class
- `ConnectionError` — Core API connection failures
- `RegistrationError` — Registration failures
- `OfferError` — Offer submission failures
- `ValidationError` — Thrown by `beforeOffer` validators

**Example: Error Handling**
```javascript
import { createBeacon, ValidationError, OfferError } from '@aura-labs/beacon';

try {
  await beacon.submitOffer(sessionId, offer);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Offer validation failed:', error.message);
  } else if (error instanceof OfferError) {
    console.error('Offer submission failed:', error.message);
  }
}
```

## Session Object

```javascript
{
  sessionId: 'uuid',
  status: 'market_forming',
  intent: {
    raw: 'I need 500 widgets',
    parsed: { keywords: ['need', '500', 'widgets'] }
  },
  constraints: {
    maxBudget: 50000,
    deliveryBy: '2026-03-01'
  },
  createdAt: '2026-02-08T...'
}
```

## Beacon Registration and Agent Registration

Beacons have two optional registration paths:

### 1. Beacon Registration (Required for polling)
Call `beacon.register()` or `beacon.startPolling()` to register via `POST /beacons/register`. This creates a **Beacon** record in Core, allowing the beacon to poll for sessions and submit offers.

```javascript
const result = await beacon.register();
// { beaconId: 'uuid', externalId: '...', name: '...', status: 'active' }
```

### 2. Agent Registration (Optional, for Ed25519 signing)
For added security and to participate in protocols requiring cryptographic identity (like AP2 mandates or TAP), a Beacon can optionally register as an **Agent** via `POST /agents/register` with type `beacon`. This generates and stores an Ed25519 key pair for signing requests.

**Current Status:** The Beacon SDK currently uses simple HTTP requests for `POST /beacons/register`. In the future, Beacons can opt into Ed25519-based agent registration for enhanced security and protocol support.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AURA_CORE_URL` | Core API URL (optional) |
| `POLL_INTERVAL` | Polling interval in ms (optional) |

## License

Business Source License 1.1 — See [LICENSE](LICENSE) for details.
