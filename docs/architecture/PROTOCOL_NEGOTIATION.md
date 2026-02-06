# Protocol Negotiation Architecture

## Overview

AURA Core manages commerce between Scouts (buying agents) and Beacons (selling agents) through intelligent protocol negotiation. Rather than requiring agents to implement complex protocol logic, Core interprets intent, matches capabilities, forms markets, and enforces transaction rules.

## Design Principles

### 1. Scouts Express Intent, Not Protocols

Scouts communicate in natural language with business intent. Core's LLM interprets this into actionable protocol requirements.

```
Scout: "I want to buy 500 widgets, willing to pay up to $100 each,
        but would prefer around $90. Need delivery within 2 weeks."

Core interprets:
  - Product: widgets, quantity: 500
  - Pricing protocols:
      1. Direct purchase at $100 (fallback)
      2. Negotiated price with $90 anchor (preferred)
  - Fulfillment constraint: 14-day delivery window
```

Scouts don't need to know protocol names or enumerate capabilities. They describe what they want and Core figures out how to get it.

### 2. Beacons Declare Static Capabilities

Beacons represent businesses with existing backend systems (payment processors, inventory systems, fulfillment networks). These impose hard constraints that cannot be negotiated away.

```
Beacon registers:
  capabilities:
    identity: [oauth2, api_key]
    negotiation: [direct, rfq]           # Pricing engine limitation
    payment: [card, invoice_net30]       # Payment processor limitation
    fulfillment: [shipped, pickup]       # Logistics limitation

  offerings: "Industrial widgets, custom sizes, bulk discounts available"
```

Beacons describe *what* they sell naturally, but *how* they transact is constrained by their systems.

### 3. Core Enforces Negotiated Protocols

Core is not just a matchmaker—it's a protocol enforcer. Once a transaction protocol is established:

- Core holds canonical session state
- Core validates every state transition
- Core rejects non-compliant actions
- Core provides attestation of what happened

This ensures market integrity. Neither party can deviate from agreed rules.

### 4. HATEOAS for Protocol Discovery

Rather than upfront capability negotiation, protocols emerge through hypermedia discovery.

```
Scout: POST /sessions { intent: "I want widgets..." }

Core responds with available actions based on market reality:
{
  "session_id": "abc123",
  "market_status": "formed",
  "participants": 7,
  "_links": {
    "start_auction": {
      "href": "/sessions/abc123/auction",
      "title": "3 sellers support auction"
    },
    "request_quotes": {
      "href": "/sessions/abc123/rfq",
      "title": "5 sellers support RFQ"
    },
    "browse_direct": {
      "href": "/sessions/abc123/catalog",
      "title": "7 sellers with fixed prices"
    }
  }
}
```

Scout doesn't declare "I support auction"—they see auction is available and choose to follow that link. Core has already computed what's possible given the market.

Each subsequent response provides the next valid actions:

```
Scout: POST /sessions/abc123/auction

Core:
{
  "auction_id": "xyz789",
  "status": "bidding_open",
  "ends_at": "2024-01-15T10:00:00Z",
  "_links": {
    "view_bids": { "href": "..." },
    "set_reserve": { "href": "..." },
    "end_early": { "href": "..." },
    "cancel": { "href": "..." }
  }
}
```

If an action isn't valid, the link isn't present. Protocol compliance through link availability.

## Protocol Dimensions

Commerce protocols span multiple dimensions. Core must find compatible options across all:

| Dimension | Examples | Constraint Source |
|-----------|----------|-------------------|
| Identity | OAuth2, DID, API key, certificate | Security requirements |
| Negotiation | Auction, RFQ, direct, negotiated | Pricing engine capability |
| Payment | Card, invoice, escrow, crypto | Payment processor |
| Fulfillment | Digital, shipped, pickup, installed | Logistics network |

A valid transaction requires at least one compatible option in *each* dimension.

## Market Formation

When a Scout expresses intent:

1. **Intent Interpretation**: Core's LLM extracts requirements and infers protocols
2. **Beacon Matching**: Find Beacons that sell what Scout wants
3. **Capability Filtering**: Eliminate Beacons that can't support required protocols
4. **Prioritization**: Rank by protocol sophistication (negotiated > direct, etc.)
5. **Market Formation**: Establish the set of eligible Beacons
6. **Protocol Selection**: Offer Scout available paths via HATEOAS links

```
Core's internal process:

Scout wants: widgets, max $100, prefers $90, 2-week delivery

Beacon A: sells widgets at $95, direct only, ships in 3 days
  → Eligible: meets price, has direct protocol

Beacon B: sells widgets at $92, supports negotiation, ships in 5 days
  → Eligible + Prioritized: supports preferred negotiation protocol

Beacon C: sells widgets at $105, supports negotiation
  → Eliminated: exceeds max price

Beacon D: sells widgets at $88, digital delivery only
  → Eliminated: cannot meet fulfillment requirement

Market formed with Beacons A, B
Preferred path: negotiation (Beacon B supports it)
Fallback path: direct purchase (both support it)
```

## Session Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                        SESSION STATES                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────────┐     │
│  │  INTENT  │───►│    MARKET    │───►│     PROTOCOL      │     │
│  │ RECEIVED │    │   FORMING    │    │   NEGOTIATION     │     │
│  └──────────┘    └──────────────┘    └───────────────────┘     │
│                                               │                 │
│                                               ▼                 │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────────┐     │
│  │ COMPLETE │◄───│  SETTLEMENT  │◄───│     COMMERCE      │     │
│  │          │    │              │    │    (protocol-     │     │
│  └──────────┘    └──────────────┘    │     specific)     │     │
│       │                              └───────────────────┘     │
│       ▼                                                        │
│  ┌──────────┐                                                  │
│  │ ARCHIVED │   (Failed states: CANCELLED, EXPIRED, DISPUTED)  │
│  └──────────┘                                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

The COMMERCE phase behavior varies based on negotiated protocol:
- **Auction**: Bidding rounds, time limits, winner determination
- **RFQ**: Quote collection, scoring, selection
- **Direct**: Catalog browse, add to cart, checkout
- **Negotiated**: Offer, counter-offer, acceptance

## Actor Model Mapping (Scala/Akka)

The protocol enforcement model maps well to actors:

```
                    ┌─────────────────┐
                    │  CoreGuardian   │
                    │   (supervisor)  │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ BeaconRegistry│   │ SessionRouter │   │  MarketIndex  │
│    Actor      │   │    Actor      │   │    Actor      │
└───────────────┘   └───────┬───────┘   └───────────────┘
                            │
           ┌────────────────┼────────────────┐
           │                │                │
           ▼                ▼                ▼
    ┌────────────┐   ┌────────────┐   ┌────────────┐
    │  Session   │   │  Session   │   │  Session   │
    │   Actor    │   │   Actor    │   │   Actor    │
    │ (Auction)  │   │  (RFQ)     │   │ (Direct)   │
    └────────────┘   └────────────┘   └────────────┘
```

- **BeaconRegistryActor**: Maintains connected Beacons and their capabilities
- **SessionRouter**: Routes messages to appropriate session actors
- **MarketIndex**: Indexes offerings for fast intent matching
- **SessionActor**: One per transaction, behavior determined by protocol

Session actors use `become()` to adopt protocol-specific behavior:

```scala
class SessionActor extends Actor {
  def receive = initializing

  def initializing: Receive = {
    case IntentReceived(intent) =>
      val protocols = interpretIntent(intent)
      context.become(formingMarket(protocols))

    // ...
  }

  def formingMarket(protocols: Protocols): Receive = {
    case MarketFormed(beacons, negotiatedProtocol) =>
      negotiatedProtocol match {
        case Auction(params) => context.become(auctionBehavior(params))
        case RFQ(params) => context.become(rfqBehavior(params))
        case Direct => context.become(directBehavior)
      }
  }

  def auctionBehavior(params: AuctionParams): Receive = {
    case PlaceBid(amount) if isValidBid(amount) => // process
    case PlaceBid(_) => sender() ! InvalidAction("Bid does not meet requirements")
    // Only auction-valid messages accepted
  }
}
```

## Integration Patterns

### Scout Integration (Simple)

```javascript
const scout = new AuraScout({ apiKey: 'xxx' });

// Express intent naturally
const session = await scout.findMarket({
  intent: "I need 500 widgets, prefer under $90 each, within 2 weeks"
});

// Discover available paths (HATEOAS)
console.log(session.availableActions);
// ['start_auction', 'request_quotes', 'browse_direct']

// Follow preferred path
const auction = await session.follow('start_auction');

// Respond to protocol events
auction.on('bid_received', bid => console.log(bid));
auction.on('auction_ended', result => console.log(result));
```

### Beacon Integration (Capability Declaration)

```javascript
const beacon = new AuraBeacon({
  apiKey: 'xxx',
  capabilities: {
    identity: ['api_key'],
    negotiation: ['direct', 'rfq'],
    payment: ['card', 'invoice_net30'],
    fulfillment: ['shipped']
  }
});

// Describe offerings naturally
beacon.registerOfferings([
  { description: "Industrial widgets, various sizes", category: "widgets" },
  { description: "Custom widget fabrication", category: "widgets" }
]);

// Respond to opportunities
beacon.on('opportunity', async (session) => {
  if (session.protocol === 'rfq') {
    return { price: calculatePrice(session.requirements), terms: '...' };
  }
  if (session.protocol === 'direct') {
    return { catalogItems: getMatchingItems(session.requirements) };
  }
});
```

## Design Decisions

### 1. Protocol Versioning

Versioning is declared but not strictly enforced except for security-critical features (identity, authentication, encryption). Follow industry best practices:

- **Backwards compatibility**: New Core versions support old protocol versions
- **Forwards compatibility**: Older clients gracefully handle unknown fields
- **Strict versioning** only for: identity protocols, security handshakes, payment authorization
- **Flexible versioning** for: negotiation styles, fulfillment options, metadata

### 2. Custom Protocols

Future capability, but architecturally possible. Approach inspired by Worldpay's custom messaging integration:

- Use ML to map client inputs/outputs in a black-box manner
- Sophisticated clients can interpret Core's intent and build custom implementations
- Must follow market rules and boundaries set by Core
- HATEOAS enables this: clients follow links, Core controls valid transitions
- Custom protocols = custom link relations that Core understands

### 3. Protocol Composition

Protocols can compose dynamically via HATEOAS:

- If a market doesn't support Scout's full desires, Core responds with achievable alternatives
- Scout can interpret and adjust expectations
- Example: Scout wants auction + escrow, but market only supports auction + invoice
  - Core offers: `{ "_links": { "auction_with_invoice": {...}, "direct_with_escrow": {...} } }`
  - Scout chooses best available path

### 4. Cross-Core Federation (Internal Architecture)

Two logical Cores, not exposed externally:

```
┌─────────────────────────────────────────────────────────┐
│                    External API                         │
│                  (Single AURA Core)                     │
└─────────────────────────┬───────────────────────────────┘
                          │
         ┌────────────────┴────────────────┐
         │                                 │
         ▼                                 ▼
┌─────────────────┐               ┌─────────────────┐
│   Scout Core    │◄─────────────►│   Market Core   │
│                 │               │                 │
│ - Intent mgmt   │               │ - Dynamic mkts  │
│ - Session state │               │ - Beacon intent │
│ - Scout comms   │               │ - Beacon state  │
└─────────────────┘               └─────────────────┘
```

**Key principles:**
- Everything is **idempotent** - state can be reconstructed from retries
- If state is lost, simply retry the operation
- State engine modeled after Cassandra (eventual consistency, partition tolerance)
- External API presents unified view; internal separation enables scaling

### 5. Dispute Resolution & State Authority

**Beacons are authoritative on fulfillment state.** Core facilitates but doesn't override.

```
State Authority Chain:
  Scout: "I want X"           → Scout authoritative on intent
  Core: "Market formed"       → Core authoritative on market rules
  Beacon: "I can deliver"     → Beacon authoritative on capability
  Beacon: "Shipped/Delivered" → Beacon authoritative on fulfillment
  Scout: "Received/Accepted"  → Scout authoritative on satisfaction
```

**Query mechanism:**
- Scouts can query Core for session/transaction status at any time
- Core queries Beacon state engine for fulfillment status
- Idempotent operations mean retries are safe and resolve ambiguity

**Beacon State Engine:**
- Persistent, eventually consistent (Cassandra-style)
- Beacons push state updates; Core subscribes
- If Scout and Beacon disagree, Beacon state is canonical for fulfillment
- Dispute escalation path for genuine conflicts (future: human arbitration, evidence submission)

## Intent Interpretation Architecture

### Tiered LLM Approach

Rather than relying on a single large language model, Core uses a tiered approach for intent interpretation:

```
Scout Input (natural language)
         │
         ▼
┌─────────────────────────────┐
│    Tier 1: Granite Local    │
│    (small, specialized)     │
│                             │
│  • 3B parameters            │
│  • Sub-100ms inference      │
│  • Self-hosted              │
│  • Fine-tuned for commerce  │
└──────────────┬──────────────┘
               │
     ┌─────────┴─────────┐
     │                   │
  Success            Uncertain
     │                   │
     ▼                   ▼
 Structured     ┌───────────────────┐
  Intent        │  Tier 2: Hosted   │
                │   LLM (fallback)  │
                │                   │
                │  • Larger model   │
                │  • More context   │
                │  • Higher cost    │
                └─────────┬─────────┘
                          │
                ┌─────────┴─────────┐
                │                   │
             Success          Still Ambiguous
                │                   │
                ▼                   ▼
            Structured     ┌───────────────────┐
             Intent        │  Tier 3: Ask User │
                           │  for Clarification│
                           │                   │
                           │  (Natural UX)     │
                           └───────────────────┘
```

### Why This Architecture

**Performance**: Most requests (estimated 90%) are straightforward and can be handled by the local Granite model in under 100ms. No external API call needed.

**Cost**: Small local model is essentially free to run. Only complex/ambiguous cases incur hosted LLM costs.

**Determinism**: Smaller, fine-tuned models produce more consistent outputs. The extraction task is constrained, not open-ended generation.

**Graceful degradation**: If local model is uncertain, escalate rather than guess. If hosted LLM is uncertain, ask the user. Asking for clarification is natural in commerce.

**Self-hostable**: Core can run entirely on-premise for enterprise deployments. Granite models are Apache 2.0 licensed.

### Granite Model Fit

IBM Granite 4.0 is well-suited for this use case:

- **Native JSON output**: Built-in structured output, not bolted on
- **Function calling**: Top-tier performance on Berkeley Function Calling Leaderboard
- **Agentic design**: Built for tool use and multi-turn workflows
- **Efficient**: 70% less RAM than conventional LLMs
- **Micro variant**: 3B parameters, can run on modest hardware

### Intent Extraction Schema

The local model extracts a structured intent object:

```json
{
  "product": {
    "description": "industrial widgets",
    "category": "widgets",
    "quantity": 500,
    "specifications": {}
  },
  "pricing": {
    "target": 90.00,
    "maximum": 100.00,
    "currency": "USD",
    "unit": "per_item"
  },
  "delivery": {
    "within_days": 14,
    "location": null,
    "method_preference": null
  },
  "protocols_inferred": {
    "negotiation": ["negotiated", "direct"],
    "payment": null,
    "fulfillment": null
  },
  "confidence": 0.92,
  "ambiguities": []
}
```

If `confidence` is below threshold or `ambiguities` is non-empty, escalate to Tier 2 or Tier 3.

### Clarification UX

Asking for clarification should feel natural, not like an error:

```
Scout: "I need widgets fast"

Core: "I understand you need widgets urgently. To find the best options:
       - How many widgets do you need?
       - What's your budget range?

       Or just tell me more and I'll figure it out."
```

This mirrors how a real purchasing agent would respond. It builds trust and leads to better outcomes.

## Next Steps

- [ ] Define protocol schemas (JSON Schema for each protocol type)
- [ ] Fine-tune Granite on commerce intent extraction dataset
- [ ] Implement tiered LLM routing logic
- [ ] Design clarification dialogue patterns
- [ ] Define HATEOAS link relations vocabulary
- [ ] Design capability advertisement schema for Beacons
