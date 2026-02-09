# AURA Protocol Integration Architecture

## Overview

AURA integrates with industry-standard agent protocols to enable interoperability:

| Protocol | Purpose | Integration Point |
|----------|---------|-------------------|
| **MCP** | Agent-to-tool communication | Scout SDK, Core API |
| **AP2** | Payment authorization | Transaction commitment |
| **Visa TAP** | Agent identity verification | Payment flows |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AURA ECOSYSTEM                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐     MCP Client      ┌─────────────────────────────────┐   │
│  │   Scout     │◄───────────────────►│      External MCP Servers       │   │
│  │   Agent     │                     │  (databases, tools, calendars)  │   │
│  └──────┬──────┘                     └─────────────────────────────────┘   │
│         │                                                                   │
│         │ AURA Protocol                                                     │
│         ▼                                                                   │
│  ┌─────────────┐     MCP Server      ┌─────────────────────────────────┐   │
│  │   AURA      │◄───────────────────►│     External MCP Clients        │   │
│  │   Core      │                     │  (ChatGPT, Claude, Gemini)      │   │
│  └──────┬──────┘                     └─────────────────────────────────┘   │
│         │                                                                   │
│         │ AURA Protocol                                                     │
│         ▼                                                                   │
│  ┌─────────────┐                                                           │
│  │   Beacon    │                                                           │
│  │   Agent     │                                                           │
│  └─────────────┘                                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                    │
                    │ Transaction Commitment
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PAYMENT PROTOCOLS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         AP2 (Agent Payments Protocol)                │   │
│  │                                                                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │   │
│  │  │   Intent    │  │    Cart     │  │   Payment   │                  │   │
│  │  │   Mandate   │  │   Mandate   │  │   Mandate   │                  │   │
│  │  │             │  │             │  │             │                  │   │
│  │  │ "Agent can  │  │ "User auth  │  │ "Payment    │                  │   │
│  │  │  buy X for  │  │  this exact │  │  network    │                  │   │
│  │  │  up to $Y"  │  │  cart/price"│  │  context"   │                  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Visa TAP (Trusted Agent Protocol)                 │   │
│  │                                                                       │   │
│  │  Agent Registration ──► Public Key Directory ──► HTTP Signatures     │   │
│  │                                                                       │   │
│  │  "This agent is authorized to act on behalf of cardholder X"         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## MCP Integration

### Scout as MCP Client

Scouts can connect to MCP servers to access external tools and data:

```javascript
import { createScout } from '@aura-labs/scout';
import { MCPClient } from '@aura-labs/scout/mcp';

const scout = createScout({ apiKey: '...' });

// Connect to MCP servers for additional context
await scout.connectMCP([
  { uri: 'mcp://calendar.example.com', name: 'Calendar' },
  { uri: 'mcp://inventory.example.com', name: 'Inventory' },
]);

// Intent can now reference MCP-provided context
const session = await scout.intent(
  'Order 500 widgets, check my calendar for delivery window',
  {
    constraints: { maxBudget: 50000 },
    mcpContext: true  // Include context from connected MCP servers
  }
);
```

### AURA Core as MCP Server

AURA Core exposes an MCP server interface, allowing external agents to:
- Discover available Beacons
- Create commerce sessions
- Submit and evaluate offers

```javascript
// External agent connecting to AURA via MCP
const auraServer = await mcpClient.connect('mcp://core.aura-labs.ai');

// List available tools
const tools = await auraServer.listTools();
// Returns: [create_session, list_offers, commit_transaction, ...]

// Use AURA through MCP
const result = await auraServer.callTool('create_session', {
  intent: 'I need 500 industrial widgets',
  constraints: { maxBudget: 50000 }
});
```

## AP2 Integration

### Mandate Flow for Transactions

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  User   │     │  Scout  │     │  AURA   │     │ Payment │
│         │     │         │     │  Core   │     │ Network │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │
     │ 1. Create Intent Mandate      │               │
     │──────────────►│               │               │
     │  (sign with   │               │               │
     │   user key)   │               │               │
     │               │               │               │
     │               │ 2. Create Session              │
     │               │──────────────►│               │
     │               │  (w/ Intent   │               │
     │               │   Mandate)    │               │
     │               │               │               │
     │               │◄──────────────│               │
     │               │  Offers       │               │
     │               │               │               │
     │ 3. Review & Create Cart Mandate               │
     │◄──────────────│               │               │
     │──────────────►│               │               │
     │  (sign for    │               │               │
     │   specific    │               │               │
     │   offer)      │               │               │
     │               │               │               │
     │               │ 4. Commit Transaction          │
     │               │──────────────►│               │
     │               │  (w/ Cart     │               │
     │               │   Mandate)    │               │
     │               │               │               │
     │               │               │ 5. Payment Mandate
     │               │               │──────────────►│
     │               │               │  (agent ID,   │
     │               │               │   user auth)  │
     │               │               │               │
     │               │               │◄──────────────│
     │               │◄──────────────│  Confirmed    │
     │◄──────────────│  Complete     │               │
     │               │               │               │
```

### Scout SDK with AP2

```javascript
import { createScout, AP2Mandates } from '@aura-labs/scout';

const scout = createScout({
  apiKey: '...',
  ap2: {
    enabled: true,
    userKeyPair: await loadUserKeyPair(),  // User's signing keys
  }
});

// Create an intent mandate (user authorizes agent to shop)
const intentMandate = await AP2Mandates.createIntent({
  agent: scout.id,
  constraints: {
    maxAmount: 50000,
    currency: 'USD',
    categories: ['industrial-supplies'],
    validUntil: '2026-03-01',
  },
  userSignature: await signWithUserKey(intentData),
});

// Create session with mandate
const session = await scout.intent('I need 500 widgets', {
  mandate: intentMandate,
});

// When user approves an offer, create cart mandate
const cartMandate = await AP2Mandates.createCart({
  sessionId: session.id,
  offer: selectedOffer,
  userSignature: await signWithUserKey(cartData),
});

// Commit with cart mandate
const transaction = await session.commit(selectedOffer.id, {
  mandate: cartMandate,
});
```

## Visa TAP Integration

### Agent Registration

```javascript
import { VisaTAP } from '@aura-labs/scout/tap';

// Generate agent keypair
const agentKeys = await VisaTAP.generateKeyPair();

// Register with Visa directory
const registration = await VisaTAP.register({
  agentId: scout.id,
  publicKey: agentKeys.publicKey,
  metadata: {
    name: 'My Shopping Agent',
    operator: 'My Company Inc.',
    capabilities: ['shopping', 'payments'],
  },
});

// Store credentials
await saveAgentCredentials({
  tapId: registration.tapId,
  privateKey: agentKeys.privateKey,
});
```

### Signed Transactions

```javascript
// When making a payment request, sign the HTTP message
const paymentRequest = {
  amount: 42500,
  currency: 'USD',
  merchantId: beacon.id,
  orderId: transaction.id,
};

// Sign with agent's private key
const signedRequest = await VisaTAP.signRequest(paymentRequest, {
  tapId: agentCredentials.tapId,
  privateKey: agentCredentials.privateKey,
});

// Merchant/payment network verifies signature against Visa directory
// Confirms: "This agent is authorized to act on behalf of cardholder X"
```

## Implementation Phases

### Phase 1: MCP Client (Scout SDK)
- [ ] Add MCP client library to Scout SDK
- [ ] Implement server discovery and connection
- [ ] Support tool listing and invocation
- [ ] Context aggregation from multiple MCP servers

### Phase 2: MCP Server (AURA Core)
- [ ] Expose Core API as MCP server
- [ ] Define AURA-specific MCP tools
- [ ] Handle MCP client connections
- [ ] Implement resource exposure (sessions, offers)

### Phase 3: AP2 Mandates
- [ ] Implement Intent Mandate creation/validation
- [ ] Implement Cart Mandate creation/validation
- [ ] Implement Payment Mandate creation
- [ ] Key management utilities

### Phase 4: Visa TAP
- [ ] Agent registration flow
- [ ] HTTP message signing
- [ ] Integration with payment commitment
- [ ] Key rotation support

## Security Considerations

### MCP Security
- Validate server certificates
- Sanitize tool inputs/outputs
- Rate limit MCP calls
- Audit MCP server connections

### AP2 Security
- Secure key storage (HSM recommended for production)
- Mandate expiration enforcement
- Signature verification on all mandates
- Audit trail for all mandate operations

### Visa TAP Security
- Private key protection
- Regular key rotation
- Verify TAP responses from Visa
- Handle revocation scenarios

## References

- [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25)
- [AP2 Protocol Documentation](https://ap2-protocol.org/)
- [AP2 GitHub Repository](https://github.com/google-agentic-commerce/AP2)
- [Visa TAP Announcement](https://usa.visa.com/about-visa/newsroom/press-releases.releaseId.21716.html)
