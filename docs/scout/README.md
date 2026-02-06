# Scout SDK Documentation

Build buying agents that represent user interests in the AURA ecosystem.

## What is a Scout?

A Scout is a buying agent that:
- Represents buyer intent to the AURA network
- Discovers matching products and services
- Negotiates pricing autonomously
- Presents options for user approval
- Completes transactions with explicit consent

Scouts integrate into buyer-facing applications: shopping apps, browser extensions, voice assistants, procurement portals.

## Quick Start

### Installation

```bash
npm install @aura-labs/scout-sdk
```

### Basic Usage

```javascript
import { Scout } from '@aura-labs/scout-sdk';

// Initialize Scout
const scout = new Scout({
  apiKey: process.env.AURA_API_KEY,
  userId: 'user-123' // Your internal user ID
});

// Connect to AURA Core
await scout.connect();

// Register intent
const intent = await scout.registerIntent({
  category: 'electronics',
  description: 'wireless headphones with ANC',
  constraints: {
    priceRange: { min: 100, max: 300 }
  }
});

// Listen for matches
scout.on('propositions', (propositions) => {
  console.log('Found matches:', propositions);
});

// Listen for offers during negotiation
scout.on('offer', (offer) => {
  // Present to user or auto-evaluate
  if (meetsUserCriteria(offer)) {
    scout.acceptOffer(offer.id);
  }
});
```

## Core Concepts

### Intent Registration

An intent describes what the user is looking for:

```javascript
const intent = {
  category: 'travel',           // Product/service category
  description: 'flight to NYC', // Natural language description
  keywords: ['direct', 'morning'],
  constraints: {
    priceRange: { min: 200, max: 500 },
    deliveryBy: '2026-03-15',   // Or travel date
    attributes: {
      class: 'economy',
      stops: 0
    }
  },
  preferences: {
    prioritize: 'price',        // price | speed | quality
    negotiationStyle: 'balanced'
  }
};
```

### Identity Abstraction

The Scout maintains user privacy:

```javascript
// Behavioral data shared with Beacons (anonymized)
const behavioralData = {
  purchaseHistory: {
    totalPurchases: 15,
    averageOrderValue: 250,
    categoryAffinities: { electronics: 0.8, travel: 0.3 }
  },
  trustScore: 85  // Scout's network reputation
};

// Identity ONLY revealed at transaction
const identity = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  shippingAddress: { /* ... */ }
};
```

### Negotiation

Scouts can negotiate automatically or with user guidance:

```javascript
// Set negotiation parameters
scout.setNegotiationStrategy({
  style: 'balanced',           // aggressive | balanced | conservative
  autoAcceptBelow: 250,        // Auto-accept offers under this price
  maxCounterOffers: 3,
  timeout: 300000              // 5 minutes
});

// Handle offers
scout.on('offer', async (offer) => {
  if (offer.price <= scout.autoAcceptBelow) {
    return scout.acceptOffer(offer.id);
  }

  // Present to user
  const userDecision = await presentToUser(offer);

  if (userDecision === 'accept') {
    scout.acceptOffer(offer.id);
  } else if (userDecision === 'counter') {
    scout.counterOffer(offer.id, { maxPrice: 275 });
  } else {
    scout.rejectOffer(offer.id);
  }
});
```

### Consent Management

All transactions require explicit user consent:

```javascript
// Configure consent requirements
scout.setConsentPolicy({
  requireApproval: 'always',   // always | above_threshold | never
  approvalThreshold: 100,
  notifyOnMatch: true,
  notifyOnOffer: true
});

// Handle consent flow
scout.on('transaction_ready', async (transaction) => {
  // Always present final terms to user
  const consent = await getUserConsent(transaction);

  if (consent.approved) {
    // NOW identity is revealed to seller
    await scout.completeTransaction(transaction.id, {
      identity: consent.identityToShare,
      paymentMethod: consent.paymentMethod
    });
  }
});
```

## API Reference

### Scout Class

#### Constructor

```javascript
new Scout(config)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `apiKey` | string | AURA API key |
| `userId` | string | Your internal user identifier |
| `preferences` | object | Default user preferences |

#### Methods

| Method | Description |
|--------|-------------|
| `connect()` | Connect to AURA Core |
| `disconnect()` | Disconnect from AURA Core |
| `registerIntent(intent)` | Register purchase intent |
| `cancelIntent(intentId)` | Cancel an intent |
| `acceptOffer(offerId)` | Accept a negotiation offer |
| `counterOffer(offerId, terms)` | Make counter-offer |
| `rejectOffer(offerId)` | Reject an offer |
| `completeTransaction(txId, details)` | Complete transaction |

#### Events

| Event | Description |
|-------|-------------|
| `connected` | Connected to AURA Core |
| `disconnected` | Disconnected |
| `propositions` | Matching propositions found |
| `offer` | Received negotiation offer |
| `transaction_ready` | Ready to complete transaction |
| `transaction_complete` | Transaction completed |
| `error` | Error occurred |

## Best Practices

### Privacy

- Never log or store user identity unnecessarily
- Only share behavioral data, not PII
- Let users control what data is shared

### User Experience

- Always explain what the Scout is doing
- Present clear options, not overwhelming lists
- Make it easy to cancel or modify intent

### Error Handling

- Handle network disconnections gracefully
- Implement retry logic with backoff
- Always have a fallback user flow

## Examples

See the [Examples directory](../../examples/) for:
- React Scout integration
- Mobile Scout (React Native)
- Voice assistant Scout
- Browser extension Scout

## See Also

- [Protocol Specification](../protocol/PROTOCOL_SPECIFICATION.md)
- [API Reference](../api/README.md)
- [Tutorials](../tutorials/README.md)
