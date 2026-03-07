# @aura-labs/scout

Scout SDK for AURA — Build buying agents that participate in agentic commerce.

## What is a Scout?

A Scout is a user-sovereign buying agent in the AURA ecosystem. Scouts:
- Express purchase intent in natural language
- Discover products through AURA Core's neutral broker
- Evaluate offers against user-defined constraints
- Commit to transactions while preserving privacy

## Installation

```bash
npm install @aura-labs/scout
```

## Quick Start

```javascript
import { createScout } from '@aura-labs/scout';

// Zero-config — auto-generates Ed25519 identity and registers with Core
const scout = createScout();
await scout.ready();

// Express purchase intent with constraints
const session = await scout.intent('I need 500 widgets', {
  maxBudget: 50000,
  deliveryBy: new Date('2026-03-01'),
});

// Wait for offers (polling)
const offers = await session.waitForOffers();

// Commit to best offer that meets constraints
if (session.bestOffer) {
  const tx = await session.commit(session.bestOffer.id);
  console.log('Transaction:', tx.id);
}
```

## CLI Tool

The SDK includes a CLI for testing:

```bash
# Interactive mode (zero-config, uses Ed25519 keys)
npx @aura-labs/scout

# Single intent mode
npx @aura-labs/scout --intent "I need office supplies" --max-budget 500
```

**HTTPS Enforcement:** The CLI requires HTTPS for all Core API connections. Plaintext HTTP is only permitted for `localhost` and `127.0.0.1` during local development. Use `--core-url https://...` or set `AURA_CORE_URL` with an HTTPS URL.

## Constraint Engine

Define hard constraints (must be met) and soft preferences (influence ranking):

```javascript
const session = await scout.intent('Buy enterprise software licenses', {
  // Hard constraints - offers that don't meet these are filtered out
  maxBudget: 100000,
  deliveryBy: new Date('2026-06-01'),
  hardConstraints: [
    { field: 'compliance', operator: 'eq', value: 'SOC2' },
  ],

  // Soft preferences - influence offer scoring
  softPreferences: [
    { field: 'support', operator: 'eq', value: '24/7', weight: 10 },
    { field: 'rating', operator: 'gte', value: 4.5, weight: 5 },
  ],
});
```

### Constraint Operators

Only the following operators are accepted. Unknown operators are rejected (fail-closed) to prevent constraint bypass:

| Operator | Description |
|----------|-------------|
| `eq` | Equal to |
| `ne` | Not equal to |
| `gt` | Greater than |
| `gte` | Greater than or equal |
| `lt` | Less than |
| `lte` | Less than or equal |
| `contains` | String contains |
| `in` | Value in array |

## API Reference

### `createScout(config)`

Create a new Scout instance. Authentication is handled via Ed25519 public key registration — no API keys required.

```javascript
const scout = createScout({
  coreUrl: 'https://aura-labsai-production.up.railway.app', // optional, defaults to production
  timeout: 30000, // optional, ms
  storage: customStorageAdapter, // optional, defaults to in-memory
  constraints: {}, // optional, default constraints
});

// Initialize and register with AURA Core (idempotent)
await scout.ready();
```

### `scout.intent(text, options)`

Create a commerce session with purchase intent.

```javascript
const session = await scout.intent('I want to buy...', {
  maxBudget: number,
  deliveryBy: Date,
  hardConstraints: Constraint[],
  softPreferences: Constraint[],
});
```

### `session.waitForOffers(options)`

Poll for offers until available.

```javascript
const offers = await session.waitForOffers({
  timeout: 30000, // max wait time
  interval: 2000, // poll interval
});
```

### `session.commit(offerId)`

Commit to an offer.

```javascript
const transaction = await session.commit(offer.id);
```

### `session.validOffers`

Get offers that meet all hard constraints.

### `session.bestOffer`

Get highest-scoring valid offer.

## Error Handling

```javascript
import { ScoutError, AuthenticationError, SessionError } from '@aura-labs/scout';

try {
  await scout.intent('...');
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.log('Invalid API key');
  } else if (error instanceof SessionError) {
    console.log('Session error:', error.message);
  }
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AURA_CORE_URL` | Core API URL (optional) | `https://aura-labsai-production.up.railway.app` |

## Authentication

Scout uses **Ed25519 public key cryptography** for identity. When you call `scout.ready()`:
1. An Ed25519 key pair is auto-generated (or loaded from storage)
2. The Scout registers with AURA Core via `POST /agents/register` using proof-of-possession (signed request)
3. Core assigns an agent ID, which is persisted for future sessions
4. All subsequent requests are signed with the private key for identity verification

No API keys or other credentials are required.

## License

Business Source License 1.1 — See [LICENSE](LICENSE) for details.
