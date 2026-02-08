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

// Initialize with your API key
const scout = createScout({
  apiKey: 'your-api-key',
});

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
# Interactive mode
npx @aura-labs/scout --api-key YOUR_KEY

# Single intent mode
npx @aura-labs/scout --api-key YOUR_KEY --intent "I need office supplies" --max-budget 500
```

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

Create a new Scout instance.

```javascript
const scout = createScout({
  apiKey: 'required',
  coreUrl: 'https://api.aura-labs.ai', // optional
  timeout: 30000, // optional, ms
  constraints: {}, // optional, default constraints
});
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

| Variable | Description |
|----------|-------------|
| `AURA_API_KEY` | Your AURA API key |
| `AURA_CORE_URL` | Core API URL (optional) |

## Get an API Key

Sign up at [aura-labs.ai/developers](https://aura-labs.ai/developers) to get your API key.

## License

Business Source License 1.1 — See [LICENSE](LICENSE) for details.
