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

## Test Beacon

Run the included Widget Supplier test beacon:

```bash
node examples/widget-supplier.js

# Or with custom Core URL
AURA_CORE_URL=http://localhost:3000 node examples/widget-supplier.js
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
