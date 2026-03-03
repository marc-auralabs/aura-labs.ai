# AURA API Reference

Complete REST API documentation for integrating with AURA. The API is built on Fastify and deployed on Railway.

## Overview

AURA is a REST-only API that facilitates commerce flows between Scouts (buyers) and Beacons (sellers). The API provides endpoints for:

- **Agent Identity Management** - Register and manage agents using Ed25519 cryptographic signatures
- **Scout & Beacon Registration** - Register participants in the marketplace
- **Session Management** - Create and manage commerce sessions with NLP intent parsing and beacon matching
- **Offer Negotiation** - Submit and track offers within sessions
- **Transaction Lifecycle** - Manage post-transaction fulfillment and payment status

## Base URL

```
https://aura-labsai-production.up.railway.app
```

All API requests use the base URL above. Request/response content type is `application/json`.

## Authentication

### Agent Authentication (Recommended)
Agent requests use Ed25519 signatures as defined in DEC-009 specification:

1. Register agent with public key and signature proof via `POST /agents/register`
2. Include agent signature in request headers for authenticated operations
3. No API keys needed for basic demo/dev scenarios

### Unauthenticated Endpoints
Some endpoints (health checks, root info) do not require authentication.

## Endpoints

### Health & Status

#### GET /health
System health status.

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 3600
}
```

#### GET /health/ready
Readiness probe (typically for Kubernetes).

**Response:**
```json
{
  "status": "ready",
  "database": "connected"
}
```

### Root

#### GET /
API root information with available endpoints.

**Response:**
```json
{
  "name": "AURA API",
  "version": "1.0.0",
  "endpoints": [
    "/agents/register",
    "/sessions",
    "/beacons/register",
    "..."
  ],
  "_links": {
    "agents": { "href": "/agents" },
    "sessions": { "href": "/sessions" },
    "beacons": { "href": "/beacons" }
  }
}
```

### Agent Identity (Ed25519)

#### POST /agents/register
Register an agent with Ed25519 public key and signature proof.

**Request:**
```json
{
  "publicKey": "base64-encoded-ed25519-public-key",
  "signature": "base64-encoded-signature",
  "metadata": {
    "name": "Agent Name",
    "type": "scout|beacon"
  }
}
```

**Response:** `201 Created`
```json
{
  "agentId": "uuid",
  "publicKey": "base64-encoded-ed25519-public-key",
  "createdAt": "2026-03-03T00:00:00Z",
  "_links": {
    "self": { "href": "/agents/{agentId}" },
    "revoke": { "href": "/agents/{agentId}/revoke" }
  }
}
```

#### GET /agents/:agentId
Get agent details by ID.

**Response:** `200 OK`
```json
{
  "agentId": "uuid",
  "publicKey": "base64-encoded-ed25519-public-key",
  "metadata": {
    "name": "Agent Name",
    "type": "scout|beacon"
  },
  "createdAt": "2026-03-03T00:00:00Z",
  "revokedAt": null,
  "_links": {
    "self": { "href": "/agents/{agentId}" }
  }
}
```

#### POST /agents/:agentId/revoke
Revoke an agent (invalidates future signatures).

**Response:** `200 OK`
```json
{
  "agentId": "uuid",
  "revokedAt": "2026-03-03T00:00:00Z",
  "_links": {
    "self": { "href": "/agents/{agentId}" }
  }
}
```

### Scout Registration (Legacy)

#### POST /scouts/register
Register a Scout (buyer) in the marketplace.

**Request:**
```json
{
  "name": "Scout Name",
  "email": "scout@example.com",
  "metadata": {}
}
```

**Response:** `201 Created`
```json
{
  "scoutId": "uuid",
  "name": "Scout Name",
  "email": "scout@example.com",
  "createdAt": "2026-03-03T00:00:00Z",
  "_links": {
    "self": { "href": "/scouts/{scoutId}" },
    "sessions": { "href": "/sessions" }
  }
}
```

#### GET /scouts/:scoutId
Get Scout details by ID.

**Response:** `200 OK`
```json
{
  "scoutId": "uuid",
  "name": "Scout Name",
  "email": "scout@example.com",
  "createdAt": "2026-03-03T00:00:00Z",
  "_links": {
    "self": { "href": "/scouts/{scoutId}" }
  }
}
```

### Beacon Registration

#### POST /beacons/register
Register a Beacon (seller) with capabilities and webhook endpoint.

**Request:**
```json
{
  "name": "Beacon Name",
  "email": "beacon@example.com",
  "capabilities": ["product-sales", "services"],
  "endpointUrl": "https://beacon.example.com/webhook"
}
```

**Response:** `201 Created`
```json
{
  "beaconId": "uuid",
  "name": "Beacon Name",
  "email": "beacon@example.com",
  "capabilities": ["product-sales", "services"],
  "endpointUrl": "https://beacon.example.com/webhook",
  "createdAt": "2026-03-03T00:00:00Z",
  "_links": {
    "self": { "href": "/beacons/{beaconId}" },
    "sessions": { "href": "/beacons/sessions" }
  }
}
```

#### GET /beacons/:beaconId
Get Beacon details by ID.

**Response:** `200 OK`
```json
{
  "beaconId": "uuid",
  "name": "Beacon Name",
  "email": "beacon@example.com",
  "capabilities": ["product-sales", "services"],
  "endpointUrl": "https://beacon.example.com/webhook",
  "createdAt": "2026-03-03T00:00:00Z",
  "_links": {
    "self": { "href": "/beacons/{beaconId}" }
  }
}
```

#### GET /beacons/sessions
Get available sessions for Beacons to poll and respond to.

**Response:** `200 OK`
```json
{
  "sessions": [
    {
      "sessionId": "uuid",
      "intent": "Looking for wireless headphones under $100",
      "scoutId": "uuid",
      "createdAt": "2026-03-03T00:00:00Z",
      "_links": {
        "self": { "href": "/sessions/{sessionId}" },
        "submit-offer": { "href": "/sessions/{sessionId}/offers", "method": "POST" }
      }
    }
  ],
  "_links": {
    "self": { "href": "/beacons/sessions" }
  }
}
```

### Sessions (Commerce Flow)

#### POST /sessions
Create a new commerce session with NLP-parsed intent. AURA matches intent to compatible Beacons.

**Request:**
```json
{
  "scoutId": "uuid",
  "intent": "Looking for wireless headphones under $100",
  "metadata": {}
}
```

**Response:** `201 Created`
```json
{
  "sessionId": "uuid",
  "scoutId": "uuid",
  "intent": "Looking for wireless headphones under $100",
  "matchedBeacons": ["beacon-uuid-1", "beacon-uuid-2"],
  "state": "open",
  "createdAt": "2026-03-03T00:00:00Z",
  "_links": {
    "self": { "href": "/sessions/{sessionId}" },
    "offers": { "href": "/sessions/{sessionId}/offers" },
    "commit": { "href": "/sessions/{sessionId}/commit", "method": "POST" },
    "cancel": { "href": "/sessions/{sessionId}/cancel", "method": "POST" }
  }
}
```

#### GET /sessions/:sessionId
Get session state, offers, and transaction details.

**Response:** `200 OK`
```json
{
  "sessionId": "uuid",
  "scoutId": "uuid",
  "intent": "Looking for wireless headphones under $100",
  "state": "open|committed|cancelled",
  "offers": [
    {
      "offerId": "uuid",
      "beaconId": "uuid",
      "price": 89.99,
      "description": "Premium wireless headphones",
      "createdAt": "2026-03-03T00:00:00Z"
    }
  ],
  "transactionId": null,
  "createdAt": "2026-03-03T00:00:00Z",
  "_links": {
    "self": { "href": "/sessions/{sessionId}" },
    "offers": { "href": "/sessions/{sessionId}/offers" },
    "commit": { "href": "/sessions/{sessionId}/commit", "method": "POST" },
    "cancel": { "href": "/sessions/{sessionId}/cancel", "method": "POST" }
  }
}
```

#### POST /sessions/:sessionId/offers
Submit an offer from a Beacon in response to a session.

**Request:**
```json
{
  "beaconId": "uuid",
  "price": 89.99,
  "description": "Premium wireless headphones, black, 30W drivers",
  "terms": {
    "shipping": "free",
    "warranty": "2 years"
  }
}
```

**Response:** `201 Created`
```json
{
  "offerId": "uuid",
  "sessionId": "uuid",
  "beaconId": "uuid",
  "price": 89.99,
  "description": "Premium wireless headphones, black, 30W drivers",
  "terms": {
    "shipping": "free",
    "warranty": "2 years"
  },
  "createdAt": "2026-03-03T00:00:00Z",
  "_links": {
    "self": { "href": "/sessions/{sessionId}/offers/{offerId}" }
  }
}
```

#### GET /sessions/:sessionId/offers
List all offers in a session.

**Response:** `200 OK`
```json
{
  "offers": [
    {
      "offerId": "uuid",
      "beaconId": "uuid",
      "price": 89.99,
      "description": "Premium wireless headphones",
      "createdAt": "2026-03-03T00:00:00Z"
    },
    {
      "offerId": "uuid",
      "beaconId": "uuid",
      "price": 79.99,
      "description": "Standard wireless headphones",
      "createdAt": "2026-03-03T00:00:00Z"
    }
  ],
  "_links": {
    "self": { "href": "/sessions/{sessionId}/offers" }
  }
}
```

#### POST /sessions/:sessionId/commit
Commit to an offer, creating a transaction. Required to have at least one offer in the session.

**Request:**
```json
{
  "offerId": "uuid"
}
```

**Response:** `201 Created`
```json
{
  "transactionId": "uuid",
  "sessionId": "uuid",
  "offerId": "uuid",
  "beaconId": "uuid",
  "scoutId": "uuid",
  "state": "committed",
  "price": 89.99,
  "paymentStatus": "pending",
  "fulfillmentStatus": "pending",
  "createdAt": "2026-03-03T00:00:00Z",
  "_links": {
    "self": { "href": "/transactions/{transactionId}" },
    "update-fulfillment": { "href": "/transactions/{transactionId}/fulfillment", "method": "PUT" },
    "update-payment": { "href": "/transactions/{transactionId}/payment", "method": "PUT" }
  }
}
```

#### POST /sessions/:sessionId/cancel
Cancel an open session.

**Response:** `200 OK`
```json
{
  "sessionId": "uuid",
  "state": "cancelled",
  "cancelledAt": "2026-03-03T00:00:00Z",
  "_links": {
    "self": { "href": "/sessions/{sessionId}" }
  }
}
```

### Transactions (Post-Transaction Lifecycle)

#### GET /transactions/:transactionId
Get full transaction details including fulfillment and payment status.

**Response:** `200 OK`
```json
{
  "transactionId": "uuid",
  "sessionId": "uuid",
  "offerId": "uuid",
  "beaconId": "uuid",
  "scoutId": "uuid",
  "state": "committed|fulfilled|completed",
  "price": 89.99,
  "paymentStatus": "pending|charged|failed|refunded",
  "fulfillmentStatus": "pending|shipped|delivered",
  "createdAt": "2026-03-03T00:00:00Z",
  "committedAt": "2026-03-03T00:00:00Z",
  "fulfilledAt": null,
  "completedAt": null,
  "_links": {
    "self": { "href": "/transactions/{transactionId}" },
    "update-fulfillment": { "href": "/transactions/{transactionId}/fulfillment", "method": "PUT" },
    "update-payment": { "href": "/transactions/{transactionId}/payment", "method": "PUT" }
  }
}
```

#### PUT /transactions/:transactionId/fulfillment
Update fulfillment status. Auto-transitions transaction to 'fulfilled' when status is 'delivered'.

**Request:**
```json
{
  "status": "pending|shipped|delivered",
  "trackingNumber": "1Z999AA10123456784"
}
```

**Response:** `200 OK`
```json
{
  "transactionId": "uuid",
  "fulfillmentStatus": "shipped",
  "trackingNumber": "1Z999AA10123456784",
  "state": "committed",
  "fulfilledAt": null,
  "updatedAt": "2026-03-03T00:00:00Z",
  "_links": {
    "self": { "href": "/transactions/{transactionId}" }
  }
}
```

When fulfillmentStatus becomes 'delivered', the transaction automatically transitions:
```json
{
  "transactionId": "uuid",
  "fulfillmentStatus": "delivered",
  "state": "fulfilled",
  "fulfilledAt": "2026-03-03T00:00:00Z",
  "_links": {
    "self": { "href": "/transactions/{transactionId}" }
  }
}
```

#### PUT /transactions/:transactionId/payment
Update payment status. Auto-transitions transaction to 'completed' when both payment is 'charged' AND fulfillment is already 'delivered'.

**Request:**
```json
{
  "status": "pending|charged|failed|refunded"
}
```

**Response:** `200 OK`
```json
{
  "transactionId": "uuid",
  "paymentStatus": "charged",
  "state": "committed",
  "completedAt": null,
  "updatedAt": "2026-03-03T00:00:00Z",
  "_links": {
    "self": { "href": "/transactions/{transactionId}" }
  }
}
```

When paymentStatus becomes 'charged' AND fulfillmentStatus is already 'delivered', the transaction automatically transitions:
```json
{
  "transactionId": "uuid",
  "paymentStatus": "charged",
  "fulfillmentStatus": "delivered",
  "state": "completed",
  "completedAt": "2026-03-03T00:00:00Z",
  "_links": {
    "self": { "href": "/transactions/{transactionId}" }
  }
}
```

### WebSocket (Placeholder)

#### GET /ws/scout
WebSocket endpoint for Scouts. Currently a basic placeholder with limited functionality.

#### GET /ws/beacon
WebSocket endpoint for Beacons. Currently a basic placeholder with limited functionality.

## Transaction Lifecycle Diagram

```
┌─────────────┐
│   SESSION   │ (open)
│  (created)  │
└──────┬──────┘
       │ POST /commit (offer selected)
       ▼
┌──────────────────┐
│  TRANSACTION     │ (committed)
│   (NEW)          │
└──────┬───────────┘
       │
       ├─ PUT /fulfillment (status: shipped/delivered)
       │  └─ state → fulfilled (when delivered)
       │
       └─ PUT /payment (status: charged/failed/refunded)
          ├─ if charged + fulfilled → state → completed
          └─ if failed → can retry payment
```

**Key Transitions:**
- `committed` → `fulfilled`: Automatic when fulfillmentStatus = 'delivered'
- `fulfilled` → `completed`: Automatic when paymentStatus = 'charged' (given fulfilled state)
- `committed` or `fulfilled` → `completed`: Payment charged with fulfillment already delivered

## Webhook Events

When a Beacon registers with an `endpointUrl`, AURA dispatches webhook events for transaction state changes using fire-and-forget delivery:

**Delivery Guarantees:**
- Up to 3 retries with exponential backoff
- No response required from webhook endpoint

**Event: Transaction State Changed**

```
POST {beacon.endpointUrl}
Content-Type: application/json

{
  "event": "transaction.state_changed",
  "transactionId": "uuid",
  "previousState": "committed",
  "newState": "fulfilled",
  "timestamp": "2026-03-03T00:00:00Z",
  "transaction": {
    "transactionId": "uuid",
    "state": "fulfilled",
    "paymentStatus": "pending",
    "fulfillmentStatus": "delivered",
    "price": 89.99,
    "fulfilledAt": "2026-03-03T00:00:00Z"
  }
}
```

**Possible State Transitions in Webhooks:**
- `committed` → `fulfilled`
- `fulfilled` → `completed`
- `committed` → `completed`

## Error Codes

Standard HTTP status codes with AURA-specific error messages:

| Code | Name | Description |
|------|------|-------------|
| 400 | Bad Request | Malformed request body or invalid parameters |
| 401 | Unauthorized | Missing or invalid authentication |
| 404 | Not Found | Resource not found (session, beacon, etc.) |
| 409 | Conflict | Invalid state transition (e.g., committing when session is already committed) |
| 422 | Unprocessable Entity | Validation error (e.g., offer not in session) |
| 500 | Internal Server Error | Server error |

**Error Response Format:**
```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Cannot commit to offer: session already has a committed transaction",
    "details": {
      "sessionId": "uuid",
      "currentState": "committed"
    }
  }
}
```

## See Also

- [DEC-009 Agent Identity & Signature Specification](../protocol/DEC-009.md)
- [JSON Schemas](../../schemas/README.md)
- [Quickstart Guide](../QUICKSTART.md)
- [Webhook Documentation](./WEBHOOKS.md)
