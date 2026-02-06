# Simple Scout - AURA Buying Agent SDK

A reference implementation of an AURA Scout (buying agent). This SDK demonstrates how to build buying agents that integrate with AURA Core.

## What is a Scout?

A Scout is an autonomous agent that represents a buyer's interests. It:

1. **Expresses Intent** - Translates user needs into structured requests
2. **Evaluates Offers** - Reviews and compares offers from Beacons
3. **Maintains Privacy** - Keeps buyer identity hidden until transaction commitment
4. **Executes Transactions** - Commits to offers and manages fulfillment

## Quick Start

### Prerequisites

- Node.js 18+
- Running AURA Core (mock or production)

### Installation

```bash
cd scouts/simple-scout
npm install
```

### Basic Usage

```javascript
const { SimpleScout } = require('./simple-scout');

const scout = new SimpleScout({
  AURA_CORE_URL: 'http://localhost:8080',
});

// 1. Discover API (HATEOAS)
await scout.discover();

// 2. Register your Scout
await scout.register({
  name: 'MyShoppingAssistant',
  email: 'dev@example.com',
});

// 3. Create a shopping session
const session = await scout.createSession(
  'I need wireless headphones for commuting, noise cancellation required, budget $300-400',
  {
    hints: {
      category_hint: 'electronics',
      price_range_usd: { min: 250, max: 400 },
      required_features: ['noise_cancellation', 'wireless'],
    },
  }
);

// 4. Wait for offers
await session.waitForOffers();

// 5. Get ranked offers
const { offers } = await session.getOffers();

// 6. Commit to the best offer
const transaction = await session.commit(offers[0], {
  name: 'Jane Doe',
  email: 'jane@example.com',
  shippingAddress: {
    line1: '123 Main St',
    city: 'San Francisco',
    state: 'CA',
    postal_code: '94102',
    country: 'US',
  },
});
```

## HATEOAS Discovery

The Scout SDK uses HATEOAS (Hypertext as the Engine of Application State) to discover available actions. Instead of hardcoding URLs, the client follows links provided in API responses:

```javascript
// Discover available endpoints from API root
const links = await scout.discover();
// { scouts: {...}, beacons: {...}, sessions: {...} }

// Each response includes _links for next actions
const session = await scout.createSession('...');
// session._links: { self, offers, commit, websocket }

const { offers } = await session.getOffers();
// Each offer has _links: { self, commit }
```

## Real-Time Updates

Connect via WebSocket for real-time offer notifications:

```javascript
const session = await scout.createSession('...');

// Connect WebSocket
await session.connectWebSocket();

// Set up event handlers
session.onStatusChange = (msg) => console.log('Status:', msg.status);
session.onOfferReceived = (msg) => console.log('New offer:', msg.preview);
session.onOffersReady = (msg) => console.log('All offers ready!');
```

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `AURA_CORE_URL` | `http://localhost:8080` | AURA Core REST API URL |
| `AURA_WS_URL` | `ws://localhost:8080` | AURA Core WebSocket URL |
| `API_KEY` | `null` | Pre-configured API key (skip registration) |
| `SCOUT_NAME` | `SimpleScout` | Agent name for registration |

## API Reference

### SimpleScout

| Method | Description |
|--------|-------------|
| `discover()` | Fetch API root and cache HATEOAS links |
| `register(options)` | Register Scout with AURA Core |
| `createSession(query, options)` | Create a new shopping session |

### ScoutSession

| Method | Description |
|--------|-------------|
| `connectWebSocket()` | Connect for real-time updates |
| `getStatus()` | Poll current session status |
| `waitForOffers(timeout, interval)` | Wait for offers to be ready |
| `getOffers()` | Fetch ranked offers |
| `commit(offer, buyerInfo)` | Accept an offer and create transaction |
| `disconnect()` | Close WebSocket connection |

### Transaction

| Method | Description |
|--------|-------------|
| `getStatus()` | Get current transaction status |
| `cancel(reason)` | Cancel the transaction |

## Running the Example

Make sure AURA Core is running, then:

```bash
# Start AURA Core (in another terminal)
cd ../core
npm install && npm start

# Run Scout example
npm start
```

## License

Business Source License 1.1 - See LICENSE in repository root.
