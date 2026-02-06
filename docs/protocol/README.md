# AURA Protocol Documentation

This section contains the complete protocol specifications for the AURA Framework.

## Contents

### Core Specifications

- **[Protocol Specification](./PROTOCOL_SPECIFICATION.md)** - Complete protocol reference including:
  - Message formats and schemas
  - WebSocket communication patterns
  - REST API endpoints
  - Authentication and authorization
  - Error handling

- **[Reputation Specification](./REPUTATION_SPECIFICATION.md)** - Trust and reputation system:
  - Trust score calculation
  - Reputation tracking
  - Dispute resolution
  - Anti-gaming measures

### Message Reference

- [Message Formats](./messages.md) - Detailed schema for all message types
- [Authentication](./authentication.md) - Auth flow and token management
- [Negotiation Protocol](./negotiation-protocol.md) - The negotiation lifecycle
- [Versioning](./versioning.md) - Protocol version compatibility

## Protocol Overview

The AURA protocol enables three types of participants to communicate:

| Participant | Role | Primary Messages |
|-------------|------|------------------|
| **Scout** | Buying agent | Intent registration, negotiation requests, transaction requests |
| **AURA Core** | Neutral broker | Matching, routing, coordination |
| **Beacon** | Selling agent | Proposition registration, offers, confirmations |

## Message Flow

```
Scout                    AURA Core                   Beacon
  │                          │                          │
  │─── Intent Registration ──>│                          │
  │                          │─── Anonymized Inquiry ───>│
  │                          │<── Proposition ───────────│
  │<── Matched Propositions ──│                          │
  │                          │                          │
  │─── Negotiation Request ──>│                          │
  │                          │─── Forward Request ──────>│
  │                          │<── Offer ─────────────────│
  │<── Offer ─────────────────│                          │
  │                          │                          │
  │─── Accept ───────────────>│                          │
  │                          │─── Transaction ──────────>│
  │                          │<── Confirmation ──────────│
  │<── Confirmation ──────────│                          │
```

## Transport

- **WebSocket** - Primary transport for real-time communication
- **REST API** - Secondary transport for stateless operations

## Security

- TLS 1.3 required for all connections
- JWT-based authentication
- Message signing for integrity
- Rate limiting per client

## See Also

- [Architecture Overview](../ARCHITECTURE.md)
- [API Reference](../api/README.md)
- [JSON Schemas](../../schemas/README.md)
