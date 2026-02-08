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

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AURA_CORE_URL` | Core API URL (optional) |
| `POLL_INTERVAL` | Polling interval in ms (optional) |

## License

Business Source License 1.1 — See [LICENSE](LICENSE) for details.
