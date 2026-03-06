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

## API Versioning

The API uses URL-path versioning. The version is a declared value in the URL path that agents include in every request:

```
https://aura-labsai-production.up.railway.app/v1/sessions
https://aura-labsai-production.up.railway.app/v1/agents/register
```

**Current version:** `v1` (stable)

### Version Discovery

`GET /` is unversioned and returns available API versions:

```json
{
  "name": "AURA Core API",
  "versions": {
    "v1": { "status": "current", "href": "/v1", "deprecated": false }
  },
  "_links": {
    "self": { "href": "/" },
    "health": { "href": "/health" },
    "current": { "href": "/v1" }
  }
}
```

`GET /v1` returns the HATEOAS navigation root for v1:

```json
{
  "name": "AURA Core API",
  "version": "v1",
  "_links": {
    "self": { "href": "/v1/" },
    "agents": { "href": "/v1/agents/register", "methods": ["POST"] },
    "sessions": { "href": "/v1/sessions", "methods": ["GET", "POST"] },
    "beacons": { "href": "/v1/beacons" }
  }
}
```

### HATEOAS Version Propagation

All `_links.href` values in API responses include the version prefix. When an agent follows links from a response, it automatically stays within its declared API version. This means agents that discover the API via HATEOAS never need to construct versioned URLs manually — the version propagates through the link graph.

### Unversioned Endpoints

Health checks and version discovery are intentionally unversioned:

- `GET /` — version discovery
- `GET /health` — system health
- `GET /health/ready` — readiness probe

### SDK Version Targeting

SDKs declare their target API version internally. The Beacon SDK, Scout SDK, and MCP Server Scout all include an `API_VERSION` constant (`/v1`) that is prepended to all request paths. When a new API version ships, a new SDK major version will target it.

## Authentication

### Agent Authentication (Recommended)
Agent requests use Ed25519 signatures as defined in DEC-009 specification:

1. Register agent with public key and signature proof via `POST /v1/agents/register`
2. Include agent signature in request headers for authenticated operations
3. No API keys needed for basic demo/dev scenarios

### Protected Endpoints
Protected endpoints require Ed25519 signature verification through the following headers:
- `X-Agent-ID`: The agent's unique identifier (UUID)
- `X-Signature`: Base64-encoded Ed25519 signature of the request body
- `X-Timestamp`: ISO 8601 timestamp of the request

These headers are verified by the `verifyAgent` preHandler on all protected endpoints. See [DEC-009](../protocol/DEC-009.md) for complete signature specification.

### Unauthenticated Endpoints
Some endpoints (health checks, root info) do not require authentication.

## Rate Limiting

All requests are subject to rate limiting to prevent abuse:

- **Per-Agent (Authenticated)**: 120 requests per minute, identified by `X-Agent-ID` header
- **Per-IP (Unauthenticated)**: 30 requests per minute, identified by client IP address

Rate limit status is returned in response headers:
- `X-RateLimit-Limit`: The rate limit ceiling for the given request
- `X-RateLimit-Remaining`: Number of requests left in the current window
- `X-RateLimit-Reset`: Unix timestamp when the rate limit window resets

When rate limit is exceeded, the API returns HTTP 429 (Too Many Requests).

## CORS

CORS is restricted to known origins to ensure secure cross-origin requests:

**Production:**
- `https://aura-labs.ai`
- `https://www.aura-labs.ai`
- `chrome-extension://*` (Scout Chrome extension)

**Development:**
- `http://localhost:*` (any localhost port)

Server-side agents and SDKs do not use CORS and can make direct API calls.

## Input Validation

Protected endpoints validate all request inputs:

- **Intent**: Must be a string between 1 and 2000 characters
- **Constraints**: Must be a valid JSON object under 10KB in size (if provided)

Invalid inputs return HTTP 400 (Bad Request) with detailed error messages.

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

### Root & Version Discovery

#### GET /
API version discovery (unversioned).

**Response:**
```json
{
  "name": "AURA Core API",
  "versions": {
    "v1": { "status": "current", "href": "/v1", "deprecated": false }
  },
  "_links": {
    "self": { "href": "/" },
    "health": { "href": "/health" },
    "current": { "href": "/v1", "title": "Current API version" },
    "docs": { "href": "https://aura-labs.ai/developers" }
  }
}
```

#### GET /v1
HATEOAS navigation root for API v1.

**Response:**
```json
{
  "name": "AURA Core API",
  "version": "v1",
  "_links": {
    "self": { "href": "/v1/" },
    "agents": { "href": "/v1/agents/register", "title": "Register agent", "methods": ["POST"] },
    "sessions": { "href": "/v1/sessions", "title": "Commerce sessions", "methods": ["GET", "POST"] },
    "beacons": { "href": "/v1/beacons", "title": "Beacon management" },
    "docs": { "href": "https://aura-labs.ai/developers" }
  }
}
```

### Agent Identity (Ed25519)

#### POST /v1/agents/register
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
    "self": { "href": "/v1/agents/{agentId}" },
    "revoke": { "href": "/v1/agents/{agentId}/revoke" }
  }
}
```

#### GET /v1/agents/:agentId
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
    "self": { "href": "/v1/agents/{agentId}" }
  }
}
```

#### POST /v1/agents/:agentId/revoke
Revoke an agent (invalidates future signatures).

**Response:** `200 OK`
```json
{
  "agentId": "uuid",
  "revokedAt": "2026-03-03T00:00:00Z",
  "_links": {
    "self": { "href": "/v1/agents/{agentId}" }
  }
}
```

### Scout Registration

Scouts register via the universal agent endpoint using Ed25519 proof-of-possession. The legacy `/scouts/register` endpoint has been removed (DEC-015).

#### POST /v1/agents/register (type: "scout")

See **Agent Registration** section above for the full request/response format. Scouts and beacons use the same registration flow with `type: "scout"` or `type: "beacon"` respectively.

### Beacon Registration

#### POST /v1/beacons/register
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
    "self": { "href": "/v1/beacons/{beaconId}" },
    "sessions": { "href": "/v1/beacons/sessions" }
  }
}
```

#### GET /v1/beacons/:beaconId
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
    "self": { "href": "/v1/beacons/{beaconId}" }
  }
}
```

#### GET /v1/beacons/sessions
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
        "self": { "href": "/v1/sessions/{sessionId}" },
        "submit-offer": { "href": "/v1/sessions/{sessionId}/offers", "method": "POST" }
      }
    }
  ],
  "_links": {
    "self": { "href": "/v1/beacons/sessions" }
  }
}
```

### Sessions (Commerce Flow)

#### POST /v1/sessions
Create a new commerce session with NLP-parsed intent. AURA matches intent to compatible Beacons.

**Request:**
```json
{
  "intent": "Looking for wireless headphones under $100",
  "constraints": {
    "maxPrice": 100,
    "category": "electronics"
  }
}
```

Agent identity comes from Ed25519 signature verification (X-Agent-ID, X-Signature, X-Timestamp headers), not from the request body.

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
    "self": { "href": "/v1/sessions/{sessionId}" },
    "offers": { "href": "/v1/sessions/{sessionId}/offers" },
    "commit": { "href": "/v1/sessions/{sessionId}/commit", "method": "POST" },
    "cancel": { "href": "/v1/sessions/{sessionId}/cancel", "method": "POST" }
  }
}
```

#### GET /v1/sessions/:sessionId
Get session state, offers, and transaction details.

**Response:** `200 OK`
```json
{
  "sessionId": "uuid",
  "scoutId": "uuid",
  "intent": "Looking for wireless headphones under $100",
  "state": "created|market_forming|collecting_offers|offers_available|committed|fulfilled|completed|cancelled",
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
    "self": { "href": "/v1/sessions/{sessionId}" },
    "offers": { "href": "/v1/sessions/{sessionId}/offers" },
    "commit": { "href": "/v1/sessions/{sessionId}/commit", "method": "POST" },
    "cancel": { "href": "/v1/sessions/{sessionId}/cancel", "method": "POST" }
  }
}
```

#### POST /v1/sessions/:sessionId/offers
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
    "self": { "href": "/v1/sessions/{sessionId}/offers/{offerId}" }
  }
}
```

#### GET /v1/sessions/:sessionId/offers
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
    "self": { "href": "/v1/sessions/{sessionId}/offers" }
  }
}
```

#### POST /v1/sessions/:sessionId/commit
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
  "agentId": "uuid",
  "state": "committed",
  "price": 89.99,
  "paymentStatus": "pending",
  "fulfillmentStatus": "pending",
  "createdAt": "2026-03-03T00:00:00Z",
  "_links": {
    "self": { "href": "/v1/transactions/{transactionId}" },
    "update-fulfillment": { "href": "/v1/transactions/{transactionId}/fulfillment", "method": "PUT" },
    "update-payment": { "href": "/v1/transactions/{transactionId}/payment", "method": "PUT" }
  }
}
```

Note: `agentId` is the primary identifier. `scoutId` is included for legacy compatibility.

#### POST /v1/sessions/:sessionId/cancel
Cancel an open session.

**Response:** `200 OK`
```json
{
  "sessionId": "uuid",
  "state": "cancelled",
  "cancelledAt": "2026-03-03T00:00:00Z",
  "_links": {
    "self": { "href": "/v1/sessions/{sessionId}" }
  }
}
```

### Transactions (Post-Transaction Lifecycle)

#### GET /v1/transactions/:transactionId
Get full transaction details including fulfillment and payment status.

**Response:** `200 OK`
```json
{
  "transactionId": "uuid",
  "sessionId": "uuid",
  "offerId": "uuid",
  "beaconId": "uuid",
  "scoutId": "uuid",
  "agentId": "uuid",
  "state": "committed|fulfilled|completed|cancelled",
  "price": 89.99,
  "paymentStatus": "pending|authorized|charged|failed|refunded",
  "fulfillmentStatus": "pending|processing|shipped|delivered|failed",
  "createdAt": "2026-03-03T00:00:00Z",
  "committedAt": "2026-03-03T00:00:00Z",
  "fulfilledAt": null,
  "completedAt": null,
  "_links": {
    "self": { "href": "/v1/transactions/{transactionId}" },
    "update-fulfillment": { "href": "/v1/transactions/{transactionId}/fulfillment", "method": "PUT" },
    "update-payment": { "href": "/v1/transactions/{transactionId}/payment", "method": "PUT" }
  }
}
```

#### PUT /v1/transactions/:transactionId/fulfillment
Update fulfillment status. Auto-transitions transaction to 'fulfilled' when status is 'delivered'.

**Request:**
```json
{
  "status": "pending|processing|shipped|delivered|failed",
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
    "self": { "href": "/v1/transactions/{transactionId}" }
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
    "self": { "href": "/v1/transactions/{transactionId}" }
  }
}
```

#### PUT /v1/transactions/:transactionId/payment
Update payment status. Auto-transitions transaction to 'completed' when both payment is 'charged' AND fulfillment is already 'delivered'.

**Request:**
```json
{
  "status": "pending|authorized|charged|refunded|failed"
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
    "self": { "href": "/v1/transactions/{transactionId}" }
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
    "self": { "href": "/v1/transactions/{transactionId}" }
  }
}
```

### WebSocket (Placeholder)

#### GET /v1/ws/scout
WebSocket endpoint for Scouts. Currently a basic placeholder with limited functionality.

#### GET /v1/ws/beacon
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
