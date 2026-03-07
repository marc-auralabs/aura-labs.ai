# Scout Implementations

This directory contains reference implementations and SDKs for building AURA Scouts (buying agents).

## What is a Scout?

A Scout is an autonomous agent that represents buyer interests in the AURA ecosystem. Scouts:

1. **Express Intent** - Convert user needs into structured, privacy-preserving requests
2. **Receive Offers** - Get ranked offers from Beacons via AURA Core
3. **Maintain Privacy** - Keep buyer identity hidden until transaction commitment
4. **Execute Transactions** - Commit to offers and manage fulfillment

## Available Implementations

### simple-scout/

A Node.js reference implementation demonstrating the full Scout protocol:

- HATEOAS-based API discovery
- WebSocket real-time updates
- Session management
- Offer evaluation
- Transaction commitment

```bash
cd simple-scout
npm install
npm start
```

## Building Your Own Scout

Scouts integrate into buyer-facing applications (shopping apps, procurement portals, personal assistants). Key integration points:

1. **User Interface** - Where users express what they're looking for
2. **Scout SDK** - Translates intent and manages AURA sessions
3. **Offer Display** - Shows ranked offers to users
4. **Checkout Flow** - Handles transaction commitment

See the [Scout SDK documentation](../docs/scout/README.md) for detailed integration guides.

## Protocol Flow

```
User → Scout → AURA Core → Beacons
                    ↓
            Ranked Offers
                    ↓
User ← Scout ← AURA Core
       ↓
   Commits to Offer
       ↓
   Transaction
```

## License

Business Source License 1.1 - See LICENSE in repository root.
