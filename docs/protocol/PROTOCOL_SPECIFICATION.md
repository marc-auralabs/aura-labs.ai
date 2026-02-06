# AURA Protocol Specification v1.0

**Agentic Universal Request/Response Architecture**

**Status:** Draft  
**Version:** 1.0.0  
**Date:** January 2026  
**Author:** AURA Labs

---

## Abstract

This specification defines the communication protocols for the AURA (Agentic Universal Request/Response Architecture) platform, a neutral broker system enabling agent-mediated commerce. The protocol enables Scout agents (representing buyers) to express needs in natural language, which AURA Core interprets and routes to qualified Beacon agents (representing sellers) for contextual offer generation, all while preserving buyer privacy until transaction commitment.

This document provides complete API endpoint definitions, message schemas, authentication flows, and implementation guidance sufficient for developers to build compliant Scout agents, Beacon agents, or AURA Core implementations.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Protocol Design Principles](#2-protocol-design-principles)
3. [Authentication & Authorization](#3-authentication--authorization)
4. [Core Data Types](#4-core-data-types)
5. [Scout Request Protocol](#5-scout-request-protocol)
6. [AURA Interpretation Protocol](#6-aura-interpretation-protocol)
7. [Beacon Request Protocol](#7-beacon-request-protocol)
8. [Beacon Response Protocol](#8-beacon-response-protocol)
9. [Offer Ranking & Delivery](#9-offer-ranking--delivery)
10. [Transaction Commitment Protocol](#10-transaction-commitment-protocol)
11. [Error Handling](#11-error-handling)
12. [Security Considerations](#12-security-considerations)
13. [API Reference](#13-api-reference)
14. [Implementation Notes](#14-implementation-notes)
15. [Future Extensions](#15-future-extensions)

**Appendices:**
- [Appendix A: JSON Schema Definitions](#appendix-a-json-schema-definitions)
- [Appendix B: Sequence Diagrams](#appendix-b-sequence-diagrams)
- [Appendix C: Glossary](#appendix-c-glossary)
- [Appendix D: Event Structure for Telemetry](#appendix-d-event-structure-for-telemetry)

---

## 1. Introduction

### 1.1 Purpose

This specification defines the wire protocols, message formats, and interaction patterns for the AURA agentic commerce platform. AURA serves as a neutral broker between buyer agents (Scouts) and seller agents (Beacons), enabling privacy-preserving, trust-enhanced commercial transactions.

### 1.2 Scope

This specification covers the **Minimum Viable Protocol (MVP)** for AURA:

- Message formats for all Scout ↔ AURA ↔ Beacon communications
- API endpoints for agent registration, request submission, and transaction execution
- Authentication and authorization mechanisms
- Error codes and handling procedures
- Data schemas for all message types
- Payment capability exchange and x402 integration
- Webhook mechanisms for Beacon notifications
- Event structures for system telemetry

**MVP Scope Declaration:**

This specification defines the foundational protocol sufficient to complete a single-offer transaction flow. The MVP supports:

- Single-offer acceptance (Scout accepts one Beacon offer)
- Manual consent management by the principal (user)
- Payment capability negotiation with x402 support
- Basic webhook notifications

**Deferred to Future Protocol Versions:**

- Multi-round negotiation protocols (see Section 15.1)
- Autonomous consent automation
- Constraint breakthrough handling
- Agent-to-agent communication outside AURA Core
- Advanced auction and subscription mechanisms
- Analytics and reporting APIs

This specification does NOT cover:

- Internal AURA Core implementation details (Policy Engine internals, etc.)
- Specific payment provider integrations (implementation details)
- External protocol bridging details (AP2, A2A, MCP translation layers)

### 1.3 Terminology

| Term | Definition |
|------|------------|
| **Scout** | An autonomous agent acting on behalf of a buyer (consumer) |
| **Beacon** | An autonomous agent acting on behalf of a seller (merchant) |
| **AURA Core** | The neutral broker platform that interprets, routes, and mediates |
| **Request** | A Scout's expression of need (natural language + structured hints) |
| **Interpreted Request** | AURA's structured representation of Scout intent |
| **Offer** | A Beacon's response containing product details, pricing, and terms |
| **CWR** | Compatibility-Weighted Reputation score for ranking |
| **Session** | A logical conversation from request to transaction completion |

### 1.4 Notational Conventions

- **REQUIRED**, **MUST**, **SHALL**: Absolute requirement
- **RECOMMENDED**, **SHOULD**: Best practice unless valid reason exists
- **OPTIONAL**, **MAY**: Truly optional behavior
- All timestamps use ISO 8601 format with UTC timezone
- All IDs use the format `{type}_{ulid}` (e.g., `sct_01H5K3...`, `bcn_01H5K4...`)

---

## 2. Protocol Design Principles

### 2.1 Privacy by Design

Scout identity is abstracted throughout the discovery and offer generation phases. Beacons receive only:

- Structured requirements derived from Scout's query
- Sanitized natural language context (no PII, no raw user input)
- Anonymous behavioral signals (aggregate patterns, not individual history)

Scout identity is revealed ONLY upon explicit transaction commitment.

### 2.2 Prompt Injection Resistance

Beacons NEVER receive raw Scout queries. All natural language passes through AURA's interpretation layer, which:

- Extracts structured requirements

### 2.3 Negotiation Model (Design Statement)

**MVP Implementation:** This protocol version implements single-offer acceptance. Scouts receive ranked offers and commit to one.

**Future Negotiation Model:** The AURA architecture is designed to support multi-round negotiation where Scouts and Beacons negotiate along agreed economic principles and models until consensus is reached or non-consensus is determined. Future protocol versions will define:

- Negotiation round messaging (offer/counter-offer cycles)
- Economic model declaration (auction types, bargaining protocols)
- Consensus/non-consensus determination rules
- Negotiation state management
- Timeout and fallback behaviors

The negotiation protocol will enable agents to autonomously negotiate within policy boundaries defined by their principals, implementing game-theoretic models that optimize for mutually beneficial outcomes.

### 2.4 Constraint Breakthrough (Design Statement)

**MVP Implementation:** Beacons respond only to requests that match their capabilities within stated Scout constraints.

**Future Constraint Breakthrough Model:** The architecture supports a "constraint breakthrough" pattern where Beacons may surface compelling opportunities that fall outside Scout's stated constraints. This enables serendipitous discovery while respecting user attention. Future protocol versions will define:

- Breakthrough opportunity signaling from Beacon to AURA
- Policy-based evaluation of breakthrough appropriateness
- Non-intrusive presentation mechanisms to Scout
- Principal decision capture (accept, reject, modify constraints)
- Learning integration to refine constraint boundaries over time

This pattern is critical to achieving high user satisfaction by surfacing exceptional opportunities without creating notification fatigue.

### 2.5 Agent Ecosystem (Design Statement)

**MVP Implementation:** This protocol defines Scout ↔ AURA ↔ Beacon communication only.

**Future Agent Ecosystem:** The architecture envisions a broader agent ecosystem where:

- Scouts can call specialized external agents for enhanced intelligence
- External agents can request Scout's intelligence services
- Protocol translation enables interoperability across agent standards

Agent-to-agent communication outside the AURA Core broker is deferred to future protocol versions.

### 2.6 External Protocol Interoperability

AURA is designed to interoperate with emerging agentic commerce standards including:

- **AP2** (Agent Payments Protocol): Payment execution standard
- **A2A** (Agent-to-Agent): Agent communication protocol  
- **MCP** (Model Context Protocol): Data access standard
- **x402**: HTTP-native payment messaging (explicitly supported in MVP)

**Implementation Note:** Translation between AURA protocol and external standards is an implementation detail. This specification defines AURA-native message formats. Implementers MAY bridge to external protocols but MUST maintain AURA protocol semantics. Where external standards define data elements useful to AURA, those elements SHOULD be considered for inclusion in future protocol versions.

### 2.7 Natural Language + Structured Hybrid

The protocol supports both structured fields (for efficient filtering and comparison) and natural language fields (for semantic richness and LLM-mediated matching).

**Structured fields** are used for:
- Hard constraints (price limits, delivery requirements)
- Binary attributes (certifications, availability)
- Categorical matching (product categories, brands)

**Natural language fields** are used for:
- Contextual needs ("something for a formal dinner party")
- Values expression ("I care about sustainability")
- Nuanced preferences ("like my previous purchase but more colorful")

### 2.8 RESTful Design

The protocol uses standard HTTP methods with JSON payloads:

- `POST` for creating resources (requests, offers, transactions)
- `GET` for retrieving resources (session status, offer details)
- `PUT` for updating resources (session state changes)
- `DELETE` for cancellations

### 2.9 Extensibility

All message types include an `extensions` field for forward compatibility. Unknown extensions MUST be ignored by receivers. Version negotiation ensures graceful degradation.

---

## 3. Authentication & Authorization

### 3.1 Agent Registration

Before participating in AURA, agents must register and obtain credentials.

#### 3.1.1 Scout Registration

```
POST /v1/agents/scouts
```

**Request:**
```json
{
  "agent_name": "MyShoppingAssistant",
  "agent_version": "1.0.0",
  "platform": "ios",
  "capabilities": ["natural_language", "transaction_commit"],
  "public_key": "-----BEGIN PUBLIC KEY-----\nMIIBIj...",
  "callback_url": "https://myapp.example.com/aura/callbacks",
  "contact_email": "developer@example.com"
}
```

**Response (201 Created):**
```json
{
  "scout_id": "sct_01HXYZ...",
  "api_key": "sk_live_...",
  "api_secret": "ss_...",
  "registered_at": "2026-01-14T10:00:00Z",
  "rate_limits": {
    "requests_per_minute": 60,
    "sessions_per_hour": 100
  }
}
```

#### 3.1.2 Beacon Registration

```
POST /v1/agents/beacons
```

**Request:**
```json
{
  "agent_name": "AcmeStoreBeacon",
  "agent_version": "2.1.0",
  "merchant_name": "Acme Corporation",
  "merchant_domain": "acme.example.com",
  "categories": ["electronics", "home_appliances"],
  "capabilities": ["offers", "inventory_check", "dynamic_pricing"],
  "public_key": "-----BEGIN PUBLIC KEY-----\nMIIBIj...",
  "webhook_url": "https://acme.example.com/aura/webhook",
  "contact_email": "integrations@acme.example.com"
}
```

**Response (201 Created):**
```json
{
  "beacon_id": "bcn_01HXYZ...",
  "api_key": "bk_live_...",
  "api_secret": "bs_...",
  "registered_at": "2026-01-14T10:00:00Z",
  "verification_status": "pending",
  "rate_limits": {
    "offer_responses_per_minute": 1000
  }
}
```

### 3.2 Authentication Methods

#### 3.2.1 API Key Authentication (Simple)

For straightforward integrations, use API key in the `Authorization` header:

```
Authorization: Bearer {api_key}
```

The API key identifies the agent. Include the API secret in request signatures for sensitive operations.

#### 3.2.2 Request Signing (Required for Transactions)

Transaction-related endpoints require signed requests to ensure authenticity.

**Signature Algorithm:**
1. Create canonical request string: `{HTTP_METHOD}\n{PATH}\n{TIMESTAMP}\n{BODY_SHA256}`
2. Sign with agent's private key using Ed25519
3. Include signature in `X-AURA-Signature` header
4. Include timestamp in `X-AURA-Timestamp` header

**Example:**
```
POST /v1/sessions/ses_01HXYZ.../commit HTTP/1.1
Authorization: Bearer bk_live_...
X-AURA-Timestamp: 2026-01-14T10:30:00Z
X-AURA-Signature: sig_MEUCIQDx...
Content-Type: application/json

{"offer_id": "ofr_01HXYZ..."}
```

### 3.3 Authorization Scopes

| Scope | Description | Scout | Beacon |
|-------|-------------|-------|--------|
| `session:create` | Create new shopping sessions | ✓ | — |
| `session:read` | Read session status and offers | ✓ | — |
| `session:commit` | Commit to a transaction | ✓ | — |
| `offer:create` | Generate and submit offers | — | ✓ |
| `offer:read` | Read offer details | ✓ | ✓ |
| `transaction:read` | Read transaction status | ✓ | ✓ |

### 3.4 Rate Limiting

Rate limits are enforced per agent. Responses include rate limit headers:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 2026-01-14T10:31:00Z
```

When rate limited, the API returns `429 Too Many Requests` with a `Retry-After` header.

### 3.5 Agent Policy Capabilities

Agents MAY define operational boundaries that govern their behavior within AURA. These policies are enforced by AURA Core's internal Policy Engine.

**Note:** The Policy Engine API is internal to AURA Core. Agents interact with policies through registration and policy update endpoints only.

#### 3.5.1 Scout Policy Declaration

Scouts can declare policies governing their behavior:

```
PUT /v1/agents/scouts/{scout_id}/policies
```

**Request:**
```json
{
  "policies": {
    "max_price_usd": 5000,
    "allowed_categories": ["electronics", "home", "clothing"],
    "blocked_merchants": ["bcn_blocked123..."],
    "require_certifications": ["ssl_verified"],
    "auto_reject_below_reputation": 50,
    "geographic_restrictions": {
      "ships_from": ["US", "CA", "UK"],
      "ships_to": ["US"]
    },
    "consent_boundaries": {
      "share_behavioral_data": true,
      "share_purchase_history": false,
      "allow_personalized_pricing": true
    }
  },
  "effective_from": "2026-01-14T00:00:00Z",
  "effective_until": null
}
```

#### 3.5.2 Beacon Policy Declaration

Beacons can declare policies governing their offer behavior:

```
PUT /v1/agents/beacons/{beacon_id}/policies
```

**Request:**
```json
{
  "policies": {
    "min_order_value_usd": 25,
    "max_discount_percentage": 30,
    "allowed_shipping_regions": ["US", "CA"],
    "require_scout_reputation_above": 40,
    "inventory_reserve_percentage": 10,
    "pricing_boundaries": {
      "allow_dynamic_pricing": true,
      "max_price_variation_percentage": 15,
      "honor_competitor_pricing": false
    },
    "fulfillment_constraints": {
      "max_delivery_days": 7,
      "require_signature": false,
      "insurance_threshold_usd": 500
    }
  },
  "effective_from": "2026-01-14T00:00:00Z",
  "effective_until": null
}
```

**Response (200 OK):**
```json
{
  "policy_id": "pol_01HXYZ...",
  "agent_id": "bcn_01HXYZ...",
  "status": "active",
  "effective_from": "2026-01-14T00:00:00Z",
  "validated_at": "2026-01-14T10:00:05Z"
}
```

#### 3.5.3 Policy Enforcement

AURA Core enforces declared policies during:

- **Request routing:** Scouts only receive offers from Beacons matching their policies
- **Offer filtering:** Offers violating Scout policies are excluded from results
- **Transaction validation:** Commits are rejected if policies are violated

Agents are notified of policy violations via webhook events (see Section 8.5).

---

## 4. Core Data Types

### 4.1 Identifiers

All identifiers follow the pattern `{type_prefix}_{ulid}`:

| Prefix | Entity |
|--------|--------|
| `sct_` | Scout agent |
| `bcn_` | Beacon agent |
| `ses_` | Session |
| `req_` | Request |
| `ofr_` | Offer |
| `txn_` | Transaction |

### 4.2 Natural Language Context Object

Used throughout the protocol for semantic content:

```json
{
  "type": "natural_language_context",
  "content": "Looking for a gift for my tech-savvy dad who loves gadgets",
  "language": "en",
  "sentiment": "positive",
  "extracted_entities": [
    {"type": "recipient", "value": "dad"},
    {"type": "interest", "value": "tech gadgets"}
  ],
  "sanitized": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | Yes | The natural language text |
| `language` | string | Yes | ISO 639-1 language code |
| `sentiment` | string | No | Overall sentiment (positive/neutral/negative) |
| `extracted_entities` | array | No | Named entities extracted by AURA |
| `sanitized` | boolean | Yes | Whether content has been sanitized by AURA |

### 4.3 Structured Requirements Object

For filterable, comparable attributes:

```json
{
  "type": "structured_requirements",
  "category": "electronics.headphones",
  "hard_constraints": {
    "price_max_usd": 400,
    "in_stock": true,
    "ships_to": "US"
  },
  "soft_preferences": {
    "brands": ["Sony", "Bose", "Apple"],
    "features": ["noise_cancellation", "wireless"],
    "price_range_usd": {"min": 200, "max": 350}
  },
  "certifications_required": ["ce_mark"],
  "certifications_preferred": ["b_corp", "carbon_neutral"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `category` | string | Yes | Hierarchical category (dot-separated) |
| `hard_constraints` | object | No | Must be satisfied or offer is filtered out |
| `soft_preferences` | object | No | Influences ranking but not mandatory |
| `certifications_required` | array | No | Required third-party certifications |
| `certifications_preferred` | array | No | Preferred certifications (boost ranking) |

### 4.4 Offer Object

Complete offer from a Beacon:

```json
{
  "offer_id": "ofr_01HXYZ...",
  "beacon_id": "bcn_01HXYZ...",
  "created_at": "2026-01-14T10:15:00Z",
  "valid_until": "2026-01-14T22:00:00Z",
  "product": {
    "product_id": "prod_abc123",
    "name": "Sony WH-1000XM5",
    "category": "electronics.headphones",
    "structured_attributes": {
      "brand": "Sony",
      "model": "WH-1000XM5",
      "color": "black",
      "connectivity": "bluetooth",
      "features": ["noise_cancellation", "wireless", "foldable"],
      "weight_grams": 250
    },
    "natural_language_description": {
      "content": "Industry-leading noise cancellation with exceptional sound quality. Perfect for frequent travelers and music lovers who demand the best. 30-hour battery life, premium comfort with soft leather cushions.",
      "language": "en",
      "sanitized": true
    },
    "images": [
      {"url": "https://cdn.example.com/img/wh1000xm5.jpg", "type": "primary"}
    ]
  },
  "pricing": {
    "currency": "USD",
    "list_price": 399.99,
    "offer_price": 349.99,
    "discount_percentage": 12.5,
    "price_valid_until": "2026-01-14T22:00:00Z"
  },
  "availability": {
    "in_stock": true,
    "quantity_available": 45,
    "estimated_ship_date": "2026-01-15",
    "delivery_estimate_days": {"min": 2, "max": 5}
  },
  "merchant": {
    "name": "Acme Electronics",
    "return_policy": "30-day free returns",
    "warranty": "1-year manufacturer warranty"
  },
  "certifications": ["ce_mark"],
  "reputation": {
    "beacon_score": 87.5,
    "merchant_rating": 4.7,
    "total_transactions": 12500
  },
  "signature": "sig_MEUCIQDx..."
}
```

### 4.5 Session State Enumeration

| State | Description |
|-------|-------------|
| `created` | Session initiated, awaiting Scout request |
| `interpreting` | AURA processing Scout's natural language query |
| `discovering` | AURA querying Beacon registry for matches |
| `collecting_offers` | Beacons generating offers |
| `offers_ready` | Offers collected and ranked |
| `committed` | Scout committed to an offer |
| `transaction_pending` | Transaction in progress |
| `completed` | Transaction successfully completed |
| `cancelled` | Session cancelled by Scout |
| `expired` | Session timed out |
| `failed` | Unrecoverable error occurred |

---

## 5. Scout Request Protocol

### 5.1 Creating a Session

Scout initiates a shopping session:

```
POST /v1/sessions
```

**Request:**
```json
{
  "natural_language_query": "I need wireless headphones for my daily commute. Noise cancellation is important because the train is loud. Budget around $300-400. I've had good experiences with Sony before but open to other brands.",
  "structured_hints": {
    "category_hint": "electronics.headphones",
    "price_range_usd": {"min": 300, "max": 400},
    "required_features": ["noise_cancellation", "wireless"]
  },
  "context": {
    "use_case": "daily_commute",
    "previous_purchases": ["sct_txn_prev123"],
    "location": {
      "country": "US",
      "region": "CA"
    }
  },
  "preferences": {
    "max_offers": 10,
    "offer_timeout_seconds": 30,
    "include_reputation_data": true
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `natural_language_query` | string | Yes | Scout's natural language expression of need |
| `structured_hints` | object | No | Optional structured data to guide interpretation |
| `context` | object | No | Additional context (use case, location, history) |
| `preferences` | object | No | Session preferences (timeouts, limits) |

**Response (201 Created):**
```json
{
  "session_id": "ses_01HXYZ...",
  "status": "interpreting",
  "created_at": "2026-01-14T10:00:00Z",
  "estimated_offers_at": "2026-01-14T10:00:45Z",
  "poll_url": "/v1/sessions/ses_01HXYZ...",
  "websocket_url": "wss://aura.example.com/ws/sessions/ses_01HXYZ..."
}
```

### 5.2 Polling for Session Status

Scout can poll for session updates:

```
GET /v1/sessions/{session_id}
```

**Response (200 OK):**
```json
{
  "session_id": "ses_01HXYZ...",
  "status": "offers_ready",
  "created_at": "2026-01-14T10:00:00Z",
  "updated_at": "2026-01-14T10:00:35Z",
  "interpreted_request": {
    "structured_requirements": {
      "category": "electronics.headphones.over_ear",
      "hard_constraints": {
        "price_max_usd": 400,
        "in_stock": true,
        "ships_to": "US"
      },
      "soft_preferences": {
        "brands": ["Sony"],
        "features": ["noise_cancellation", "wireless"],
        "price_range_usd": {"min": 300, "max": 400}
      }
    },
    "natural_language_context": {
      "content": "User commutes daily by train, needs noise cancellation. Previously satisfied with Sony products. Looking for quality audio experience for music during commute.",
      "language": "en",
      "sanitized": true
    }
  },
  "offers_count": 8,
  "offers_url": "/v1/sessions/ses_01HXYZ.../offers"
}
```

### 5.3 WebSocket Real-Time Updates

For real-time updates, connect via WebSocket:

```
wss://aura.example.com/ws/sessions/{session_id}
```

**Authentication:** Include bearer token as query parameter:
```
wss://aura.example.com/ws/sessions/ses_01HXYZ...?token=sk_live_...
```

**Server Messages:**

```json
{
  "event": "status_changed",
  "session_id": "ses_01HXYZ...",
  "status": "collecting_offers",
  "timestamp": "2026-01-14T10:00:15Z"
}
```

```json
{
  "event": "offer_received",
  "session_id": "ses_01HXYZ...",
  "offer_id": "ofr_01HXYZ...",
  "rank": 3,
  "beacon_id": "bcn_01HXYZ...",
  "preview": {
    "product_name": "Sony WH-1000XM5",
    "price_usd": 349.99,
    "beacon_score": 87.5
  },
  "timestamp": "2026-01-14T10:00:20Z"
}
```

```json
{
  "event": "offers_ready",
  "session_id": "ses_01HXYZ...",
  "total_offers": 8,
  "timestamp": "2026-01-14T10:00:35Z"
}
```

---

## 6. AURA Interpretation Protocol

This section describes AURA Core's internal interpretation process. While Scout and Beacon agents don't directly interact with this layer, understanding it is essential for effective integration.

### 6.1 Interpretation Pipeline

```
Scout Query → Language Detection → Intent Extraction → Entity Recognition → 
Constraint Identification → Context Sanitization → Structured Output
```

### 6.2 Interpreted Request Structure

AURA transforms Scout's natural language into a structured `InterpretedRequest`:

```json
{
  "request_id": "req_01HXYZ...",
  "session_id": "ses_01HXYZ...",
  "interpreted_at": "2026-01-14T10:00:10Z",
  "interpretation_version": "2026-01",
  "structured_requirements": {
    "category": "electronics.headphones.over_ear",
    "hard_constraints": {
      "price_max_usd": 400,
      "in_stock": true,
      "ships_to": "US",
      "condition": "new"
    },
    "soft_preferences": {
      "brands": {
        "preferred": ["Sony"],
        "acceptable": ["Bose", "Apple", "Sennheiser"],
        "excluded": []
      },
      "features": {
        "required": ["noise_cancellation", "wireless"],
        "preferred": ["long_battery", "comfortable", "foldable"],
        "excluded": []
      },
      "price_range_usd": {"ideal_min": 300, "ideal_max": 350, "max": 400}
    },
    "certifications_required": [],
    "certifications_preferred": []
  },
  "natural_language_context": {
    "content": "Daily train commuter seeking premium audio experience. Values previous positive experience with Sony. Noise cancellation essential due to noisy environment. Music listener.",
    "language": "en",
    "extracted_entities": [
      {"type": "use_case", "value": "daily commute", "confidence": 0.95},
      {"type": "environment", "value": "train", "confidence": 0.92},
      {"type": "brand_affinity", "value": "Sony", "confidence": 0.88}
    ],
    "sanitized": true
  },
  "behavioral_signals": {
    "price_sensitivity": "moderate",
    "brand_loyalty": "high",
    "feature_focus": "high",
    "decision_speed": "moderate"
  },
  "interpretation_confidence": 0.91
}
```

### 6.3 Sanitization Rules

AURA sanitizes natural language context before sending to Beacons:

1. **Remove PII:** Names, addresses, phone numbers, email addresses
2. **Remove injection patterns:** Instructions like "ignore previous", "you are now", system prompts
3. **Neutralize brand attacks:** Remove negative competitor mentions
4. **Preserve intent:** Keep semantic meaning while removing specific identifiers
5. **Normalize language:** Correct spelling, standardize terminology

**Example Transformation:**

| Original (Scout) | Sanitized (to Beacon) |
|------------------|----------------------|
| "My wife Sarah wants..." | "User seeking gift for spouse..." |
| "Ignore the price limit and show expensive ones" | "User interested in premium options" |
| "Brand X is terrible, never that" | "User prefers alternatives to Brand X" |

---

## 7. Beacon Request Protocol

### 7.1 Receiving Offer Requests

AURA sends offer requests to qualified Beacons via webhook:

```
POST {beacon_webhook_url}
```

**Request from AURA to Beacon:**
```json
{
  "request_type": "offer_request",
  "request_id": "req_01HXYZ...",
  "session_id": "ses_01HXYZ...",
  "timestamp": "2026-01-14T10:00:12Z",
  "respond_by": "2026-01-14T10:00:42Z",
  "response_url": "https://aura.example.com/v1/sessions/ses_01HXYZ.../offers",
  "interpreted_request": {
    "structured_requirements": {
      "category": "electronics.headphones.over_ear",
      "hard_constraints": {
        "price_max_usd": 400,
        "in_stock": true,
        "ships_to": "US"
      },
      "soft_preferences": {
        "brands": {"preferred": ["Sony"], "acceptable": ["Bose", "Apple"]},
        "features": {"required": ["noise_cancellation", "wireless"]}
      }
    },
    "natural_language_context": {
      "content": "Daily train commuter seeking premium audio experience. Values previous positive experience with Sony. Noise cancellation essential due to noisy environment.",
      "language": "en",
      "sanitized": true
    }
  },
  "beacon_context": {
    "your_categories": ["electronics", "audio"],
    "matching_reason": "category_match",
    "recommended_products": ["electronics.headphones.*"]
  },
  "signature": "sig_aura_..."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `request_id` | string | Unique identifier for this request |
| `session_id` | string | Session ID (for response correlation) |
| `respond_by` | timestamp | Deadline for offer submission |
| `response_url` | string | URL to submit offers |
| `interpreted_request` | object | Scout's interpreted requirements |
| `beacon_context` | object | Context about why this Beacon was selected |
| `signature` | string | AURA's signature for request authenticity |

### 7.2 Beacon Qualification Criteria

AURA selects Beacons based on:

1. **Category match:** Beacon serves requested product category
2. **Hard constraint capability:** Beacon can satisfy all hard constraints
3. **Minimum reputation:** Beacon reputation ≥ 60 (configurable)
4. **Capacity:** Beacon has not exceeded rate limits
5. **Geographic coverage:** Beacon ships to Scout's location

---

## 8. Beacon Response Protocol

### 8.1 Submitting Offers

Beacon submits offers to the provided response URL:

```
POST /v1/sessions/{session_id}/offers
```

**Request:**
```json
{
  "request_id": "req_01HXYZ...",
  "beacon_id": "bcn_01HXYZ...",
  "offers": [
    {
      "offer_id": "ofr_01HABC...",
      "product": {
        "product_id": "prod_sony_wh1000xm5",
        "name": "Sony WH-1000XM5 Wireless Noise Canceling Headphones",
        "category": "electronics.headphones.over_ear",
        "structured_attributes": {
          "brand": "Sony",
          "model": "WH-1000XM5",
          "color": "black",
          "connectivity": "bluetooth_5.2",
          "features": ["noise_cancellation", "wireless", "foldable", "multipoint", "speak_to_chat"],
          "battery_hours": 30,
          "weight_grams": 250,
          "driver_size_mm": 30
        },
        "natural_language_description": {
          "content": "Our flagship noise-canceling headphones, perfect for commuters who demand the best. Industry-leading noise cancellation automatically optimizes based on your environment. 30-hour battery life gets you through the longest trips. Premium comfort with soft-fit leather and lightweight design at only 250g. Seamless switching between devices with multipoint connection. Speak-to-Chat pauses music when you talk. Ideal for the discerning audio enthusiast who won't compromise on quality.",
          "language": "en"
        }
      },
      "pricing": {
        "currency": "USD",
        "list_price": 399.99,
        "offer_price": 349.99,
        "discount_percentage": 12.5,
        "price_valid_until": "2026-01-14T22:00:00Z",
        "price_rationale": "Loyal customer appreciation pricing"
      },
      "availability": {
        "in_stock": true,
        "quantity_available": 45,
        "estimated_ship_date": "2026-01-15",
        "delivery_estimate_days": {"min": 2, "max": 5},
        "shipping_options": [
          {"method": "standard", "days": "3-5", "price_usd": 0},
          {"method": "express", "days": "1-2", "price_usd": 14.99}
        ]
      },
      "terms": {
        "return_policy": "30-day free returns, no questions asked",
        "warranty": "1-year manufacturer warranty, extendable",
        "price_match": true
      },
      "valid_until": "2026-01-14T22:00:00Z"
    }
  ],
  "beacon_metadata": {
    "merchant_name": "Acme Electronics",
    "merchant_url": "https://acme-electronics.example.com",
    "support_email": "support@acme-electronics.example.com",
    "certifications": ["bbb_accredited", "google_trusted_store"]
  },
  "signature": "sig_beacon_..."
}
```

### 8.2 Offer Signature

Beacons MUST sign offers to ensure authenticity and prevent tampering:

**Signature Generation:**
```
signature_payload = offer_id + beacon_id + product_id + offer_price + valid_until
signature = Ed25519.sign(signature_payload, beacon_private_key)
```

AURA verifies signatures before presenting offers to Scouts.

### 8.3 Response Timeout Handling

- Beacons have 30 seconds (default) to respond
- Late responses are logged but excluded from the session
- Partial responses (some offers before timeout) are accepted
- Beacons can request extensions via API for complex queries

### 8.4 Multi-Offer Submissions

Beacons MAY submit multiple offers per request (e.g., different product variants, pricing tiers):

```json
{
  "offers": [
    { "offer_id": "ofr_01HABC...", "product": {...}, "pricing": {"offer_price": 349.99} },
    { "offer_id": "ofr_01HDEF...", "product": {...}, "pricing": {"offer_price": 279.99} },
    { "offer_id": "ofr_01HGHI...", "product": {...}, "pricing": {"offer_price": 199.99} }
  ]
}
```

Maximum offers per Beacon per session: 5 (configurable).

### 8.5 Beacon Webhook Events

Beacons receive notifications from AURA Core via webhooks. This mechanism enables semi-autonomous Beacon behavior, including proactive notifications and event-driven responses.

#### 8.5.1 Webhook Registration

Beacons specify their webhook URL during registration. AURA sends HTTP POST requests to this URL for all events.

**Webhook Security:**
- All webhook requests include `X-AURA-Signature` header
- Beacons MUST verify signatures before processing
- Beacons SHOULD respond with 2xx status within 5 seconds
- Failed deliveries are retried with exponential backoff (max 3 retries)

#### 8.5.2 Webhook Event Types

| Event Type | Description | Beacon Action Required |
|------------|-------------|----------------------|
| `offer_request` | New offer request from Scout | Generate and submit offers |
| `offer_accepted` | Scout committed to Beacon's offer | Prepare for fulfillment |
| `transaction_confirmed` | Payment successfully processed | Begin fulfillment |
| `transaction_cancelled` | Transaction cancelled by Scout | Cancel pending fulfillment |
| `transaction_completed` | Order delivered, transaction closed | Update records |
| `policy_violation` | Beacon offer violated Scout/AURA policy | Review and adjust offers |
| `reputation_updated` | Beacon reputation score changed | Informational |

#### 8.5.3 Webhook Payload Structure

All webhooks follow a standard envelope:

```json
{
  "event_id": "evt_01HXYZ...",
  "event_type": "offer_accepted",
  "timestamp": "2026-01-14T10:35:00Z",
  "beacon_id": "bcn_01HXYZ...",
  "payload": {
    // Event-specific data
  },
  "signature": "sig_aura_..."
}
```

#### 8.5.4 Event: offer_request

Sent when AURA routes a Scout request to this Beacon:

```json
{
  "event_type": "offer_request",
  "payload": {
    "request_id": "req_01HXYZ...",
    "session_id": "ses_01HXYZ...",
    "respond_by": "2026-01-14T10:00:42Z",
    "response_url": "https://api.aura.example.com/v1/sessions/ses_01HXYZ.../offers",
    "interpreted_request": {
      "structured_requirements": {...},
      "natural_language_context": {...}
    }
  }
}
```

#### 8.5.5 Event: offer_accepted

Sent when Scout commits to this Beacon's offer:

```json
{
  "event_type": "offer_accepted",
  "payload": {
    "offer_id": "ofr_01HABC...",
    "session_id": "ses_01HXYZ...",
    "transaction_id": "txn_01HXYZ...",
    "quantity": 1,
    "buyer_identity": {
      "name": "Jane Doe",
      "email": "jane.doe@example.com"
    },
    "shipping_address": {...},
    "payment_pending": true
  }
}
```

#### 8.5.6 Proactive Beacon Notifications (Future Extension)

The webhook mechanism is designed to support future proactive Beacon behaviors:

- **Inventory alerts:** Beacon notifies AURA of stock changes
- **Price updates:** Beacon pushes dynamic pricing changes
- **Constraint breakthrough:** Beacon signals exceptional opportunity (see Section 2.4)

These extensions will be defined in future protocol versions.

---

## 9. Offer Ranking & Delivery

### 9.1 Compatibility-Weighted Reputation (CWR)

AURA ranks offers using CWR, which balances base reputation with Scout-specific compatibility:

```
CWR = (Base_Reputation × 0.6) + (Compatibility_Score × 0.4)
```

Where:

**Base_Reputation (0-100):**
- Historical transaction success rate
- Dispute resolution record
- Delivery accuracy
- Customer satisfaction scores

**Compatibility_Score (0-100):**
```
Compatibility_Score = (Structured_Match × 0.5) + (Semantic_Similarity × 0.5)
```

**Structured_Match:** How well the offer's structured attributes match Scout's requirements
**Semantic_Similarity:** LLM-computed similarity between Scout's context and offer description

### 9.2 CWR Calculation Example

```
Scout seeking: wireless headphones for train commute, Sony preference, $300-400

Beacon A Offer: Sony WH-1000XM5, $349.99, Base_Reputation: 87
  Structured_Match: 95% (all features, right price range, preferred brand)
  Semantic_Similarity: 92% (commute-focused description, noise emphasis)
  Compatibility_Score: (0.95 × 0.5) + (0.92 × 0.5) = 93.5
  CWR = (87 × 0.6) + (93.5 × 0.4) = 52.2 + 37.4 = 89.6

Beacon B Offer: Bose QuietComfort, $299.99, Base_Reputation: 92
  Structured_Match: 80% (all features, good price, acceptable brand)
  Semantic_Similarity: 78% (general description, less commute-specific)
  Compatibility_Score: (0.80 × 0.5) + (0.78 × 0.5) = 79.0
  CWR = (92 × 0.6) + (79 × 0.4) = 55.2 + 31.6 = 86.8

Result: Beacon A ranked higher despite lower base reputation
```

### 9.3 Retrieving Ranked Offers

Scout retrieves ranked offers:

```
GET /v1/sessions/{session_id}/offers
```

**Response (200 OK):**
```json
{
  "session_id": "ses_01HXYZ...",
  "status": "offers_ready",
  "total_offers": 8,
  "offers": [
    {
      "rank": 1,
      "offer_id": "ofr_01HABC...",
      "cwr_score": 89.6,
      "beacon_id": "bcn_01HXYZ...",
      "product": {
        "name": "Sony WH-1000XM5",
        "category": "electronics.headphones.over_ear"
      },
      "pricing": {
        "currency": "USD",
        "offer_price": 349.99,
        "list_price": 399.99
      },
      "availability": {
        "in_stock": true,
        "delivery_estimate_days": {"min": 2, "max": 5}
      },
      "merchant": {
        "name": "Acme Electronics",
        "reputation_score": 87
      },
      "match_explanation": {
        "summary": "Top match: preferred brand Sony, excellent noise cancellation, within budget, commuter-friendly features",
        "structured_match_score": 95,
        "semantic_similarity_score": 92
      },
      "detail_url": "/v1/offers/ofr_01HABC..."
    },
    {
      "rank": 2,
      "offer_id": "ofr_01HDEF...",
      "cwr_score": 86.8,
      "beacon_id": "bcn_02HXYZ...",
      "product": {
        "name": "Bose QuietComfort Ultra",
        "category": "electronics.headphones.over_ear"
      },
      "pricing": {
        "currency": "USD",
        "offer_price": 299.99,
        "list_price": 379.99
      },
      "match_explanation": {
        "summary": "Strong alternative: excellent noise cancellation, better price point, highly-rated merchant",
        "structured_match_score": 80,
        "semantic_similarity_score": 78
      },
      "detail_url": "/v1/offers/ofr_01HDEF..."
    }
  ],
  "ranking_metadata": {
    "algorithm_version": "cwr_v2",
    "computed_at": "2026-01-14T10:00:35Z"
  }
}
```

### 9.4 Offer Detail Retrieval

Scout can retrieve full offer details:

```
GET /v1/offers/{offer_id}
```

Returns the complete Offer object (see Section 4.4).

---

## 10. Transaction Commitment Protocol

### 10.1 Consent Management (MVP)

**MVP Implementation:** Consent is managed manually by the principal (user) at transaction commitment time. The Scout collects explicit consent from the user before including consent flags in the commit request.

**Design Principle:** The user MUST make conscious decisions about data sharing. Scouts SHOULD present consent options clearly and MUST NOT pre-select options that share more data than necessary for transaction completion.

**Future Extension:** Subsequent protocol versions will support automated consent based on user-defined boundary conditions (e.g., "always share email for order updates with merchants above reputation 80").

### 10.2 Committing to an Offer

When Scout decides to purchase:

```
POST /v1/sessions/{session_id}/commit
```

**Request:**
```json
{
  "offer_id": "ofr_01HABC...",
  "quantity": 1,
  "shipping_preference": "standard",
  "buyer_identity": {
    "name": "Jane Doe",
    "email": "jane.doe@example.com",
    "phone": "+1-555-123-4567"
  },
  "shipping_address": {
    "line1": "123 Main Street",
    "line2": "Apt 4B",
    "city": "San Francisco",
    "state": "CA",
    "postal_code": "94102",
    "country": "US"
  },
  "payment_method": {
    "type": "x402",
    "x402_payment": {
      "facilitator": "stripe",
      "payment_token": "pm_tok_...",
      "currency": "USD"
    }
  },
  "consent": {
    "share_identity_with_merchant": true,
    "share_email_for_order_updates": true,
    "share_phone_for_delivery": true,
    "marketing_opt_in": false,
    "consent_timestamp": "2026-01-14T10:34:50Z",
    "consent_method": "explicit_user_action"
  }
}
```

**Consent Fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `share_identity_with_merchant` | Yes | Allow revealing buyer name to merchant |
| `share_email_for_order_updates` | Yes | Allow merchant to send order status emails |
| `share_phone_for_delivery` | No | Allow sharing phone for delivery coordination |
| `marketing_opt_in` | Yes | Allow merchant to send marketing communications |
| `consent_timestamp` | Yes | When user provided consent (ISO 8601) |
| `consent_method` | Yes | How consent was obtained (`explicit_user_action`, `pre_configured_policy`) |

**This is the ONLY point where Scout identity is revealed.**

**Response (201 Created):**
```json
{
  "transaction_id": "txn_01HXYZ...",
  "session_id": "ses_01HXYZ...",
  "offer_id": "ofr_01HABC...",
  "status": "pending",
  "created_at": "2026-01-14T10:35:00Z",
  "amounts": {
    "subtotal_usd": 349.99,
    "shipping_usd": 0.00,
    "tax_usd": 31.50,
    "total_usd": 381.49
  },
  "next_steps": {
    "action": "await_confirmation",
    "expected_by": "2026-01-14T10:36:00Z"
  },
  "status_url": "/v1/transactions/txn_01HXYZ..."
}
```

### 10.3 Transaction Flow Sequence

```
Scout                    AURA Core                   Beacon
  |                          |                          |
  |-- POST /commit --------->|                          |
  |                          |-- Verify offer valid --->|
  |                          |<-- Offer confirmed ------|
  |                          |                          |
  |                          |-- Reveal buyer identity->|
  |                          |-- Payment authorization->|
  |                          |<-- Authorization OK -----|
  |                          |                          |
  |                          |-- Create order --------->|
  |                          |<-- Order confirmation ---|
  |                          |                          |
  |<-- Transaction created --|                          |
  |                          |                          |
```

### 10.4 Transaction Status

Scout polls for transaction status:

```
GET /v1/transactions/{transaction_id}
```

**Response (200 OK):**
```json
{
  "transaction_id": "txn_01HXYZ...",
  "status": "confirmed",
  "status_history": [
    {"status": "pending", "timestamp": "2026-01-14T10:35:00Z"},
    {"status": "payment_authorized", "timestamp": "2026-01-14T10:35:15Z"},
    {"status": "confirmed", "timestamp": "2026-01-14T10:35:30Z"}
  ],
  "order": {
    "merchant_order_id": "ORD-ACME-12345",
    "merchant_name": "Acme Electronics",
    "items": [
      {
        "product_name": "Sony WH-1000XM5",
        "quantity": 1,
        "unit_price_usd": 349.99
      }
    ],
    "shipping": {
      "method": "standard",
      "estimated_delivery": "2026-01-17",
      "tracking_available": false
    }
  },
  "amounts": {
    "subtotal_usd": 349.99,
    "shipping_usd": 0.00,
    "tax_usd": 31.50,
    "total_usd": 381.49
  },
  "payment": {
    "status": "captured",
    "method": "card",
    "last_four": "4242"
  }
}
```

### 10.5 Transaction Cancellation

Scout may cancel before fulfillment:

```
DELETE /v1/transactions/{transaction_id}
```

**Request:**
```json
{
  "reason": "changed_mind",
  "comments": "Found a better deal elsewhere"
}
```

**Response (200 OK):**
```json
{
  "transaction_id": "txn_01HXYZ...",
  "status": "cancelled",
  "refund": {
    "status": "processing",
    "amount_usd": 381.49,
    "expected_by": "2026-01-17"
  }
}
```

### 10.6 Payment Capabilities Exchange

Scouts and Beacons declare their payment capabilities during registration. AURA facilitates capability matching to determine the optimal payment mechanism for each transaction.

**Design Principle:** Payment integrations will be added as needed. The protocol defines a capability exchange mechanism allowing agents to state their payment capabilities and agree upon the best mechanism. x402 is explicitly supported in MVP.

#### 10.6.1 Scout Payment Capabilities

Scouts declare payment capabilities during registration or via update:

```
PUT /v1/agents/scouts/{scout_id}/payment-capabilities
```

**Request:**
```json
{
  "payment_capabilities": {
    "supported_methods": [
      {
        "type": "x402",
        "facilitators": ["stripe", "square"],
        "currencies": ["USD", "EUR", "GBP"]
      },
      {
        "type": "card",
        "networks": ["visa", "mastercard", "amex"],
        "tokenization_provider": "stripe"
      },
      {
        "type": "bank_transfer",
        "regions": ["US"],
        "networks": ["ach"]
      },
      {
        "type": "crypto",
        "currencies": ["USDC", "USDT"],
        "networks": ["ethereum", "polygon"]
      }
    ],
    "preferred_method": "x402",
    "default_currency": "USD"
  }
}
```

#### 10.6.2 Beacon Payment Capabilities

Beacons declare accepted payment methods:

```
PUT /v1/agents/beacons/{beacon_id}/payment-capabilities
```

**Request:**
```json
{
  "payment_capabilities": {
    "accepted_methods": [
      {
        "type": "x402",
        "facilitators": ["stripe"],
        "currencies": ["USD", "EUR"]
      },
      {
        "type": "card",
        "networks": ["visa", "mastercard", "amex", "discover"],
        "processor": "stripe"
      }
    ],
    "preferred_method": "x402",
    "settlement_currency": "USD",
    "payout_schedule": "daily"
  }
}
```

#### 10.6.3 Payment Method Negotiation

When Scout commits to an offer, AURA determines the optimal payment method:

1. **Intersection:** Find methods supported by both Scout and Beacon
2. **Preference:** Prioritize mutually preferred methods
3. **Cost optimization:** Consider transaction fees where disclosed
4. **Fallback:** Use most widely supported method if preferences don't align

The selected method is included in the transaction record:

```json
{
  "payment": {
    "negotiated_method": "x402",
    "facilitator": "stripe",
    "currency": "USD",
    "scout_preference_match": true,
    "beacon_preference_match": true
  }
}
```

#### 10.6.4 x402 Integration

AURA explicitly supports the x402 HTTP payment protocol for seamless agent-native payments.

**x402 Payment Flow:**
1. Scout includes `x402_payment` in commit request
2. AURA proxies payment request to x402 facilitator
3. Facilitator processes payment and returns confirmation
4. AURA includes payment confirmation in transaction response

**x402 Payment Object:**
```json
{
  "payment_method": {
    "type": "x402",
    "x402_payment": {
      "facilitator": "stripe",
      "payment_token": "pm_tok_...",
      "currency": "USD",
      "amount": 381.49,
      "idempotency_key": "idem_txn_01HXYZ..."
    }
  }
}
```

**Future Payment Extensions:** Additional payment methods (crypto stablecoins, BNPL, invoicing) will be added to the protocol as market demand and Beacon adoption warrant.

---

## 11. Error Handling

### 11.1 Error Response Format

All errors follow a consistent format:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "The request body is missing required field 'natural_language_query'",
    "details": {
      "field": "natural_language_query",
      "reason": "required"
    },
    "request_id": "req_01HXYZ...",
    "documentation_url": "https://docs.aura.example.com/errors/INVALID_REQUEST"
  }
}
```

### 11.2 Error Codes

| HTTP Status | Code | Description |
|-------------|------|-------------|
| 400 | `INVALID_REQUEST` | Request body malformed or missing required fields |
| 400 | `INVALID_PARAMETER` | Parameter value out of range or invalid format |
| 401 | `AUTHENTICATION_REQUIRED` | Missing or invalid authentication |
| 401 | `INVALID_API_KEY` | API key not recognized |
| 401 | `INVALID_SIGNATURE` | Request signature verification failed |
| 403 | `INSUFFICIENT_PERMISSIONS` | Agent lacks required scope |
| 403 | `AGENT_SUSPENDED` | Agent account suspended |
| 404 | `SESSION_NOT_FOUND` | Session ID does not exist |
| 404 | `OFFER_NOT_FOUND` | Offer ID does not exist |
| 404 | `TRANSACTION_NOT_FOUND` | Transaction ID does not exist |
| 409 | `SESSION_STATE_CONFLICT` | Operation invalid for current session state |
| 409 | `OFFER_EXPIRED` | Offer is no longer valid |
| 409 | `OFFER_ALREADY_COMMITTED` | Another Scout committed to this offer |
| 422 | `INTERPRETATION_FAILED` | Could not interpret natural language query |
| 422 | `NO_MATCHING_BEACONS` | No Beacons available for this request |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
| 502 | `BEACON_UNAVAILABLE` | Could not reach Beacon |
| 503 | `SERVICE_UNAVAILABLE` | AURA temporarily unavailable |
| 504 | `BEACON_TIMEOUT` | Beacon did not respond in time |

### 11.3 Retry Logic

**Retryable errors:** 429, 502, 503, 504

**Retry strategy:**
1. Wait for `Retry-After` header duration (if present)
2. Otherwise, exponential backoff: `min(2^attempt × 100ms, 30s)`
3. Maximum 5 retry attempts
4. Add jitter: `delay × (0.5 + random(0, 0.5))`

**Non-retryable errors:** 400, 401, 403, 404, 409, 422

### 11.4 Idempotency

For POST requests that create resources, include an idempotency key:

```
X-Idempotency-Key: idem_abc123...
```

- AURA stores request/response pairs for 24 hours
- Repeated requests with the same key return the cached response
- Use UUIDs or deterministic hashes as idempotency keys

---

## 12. Security Considerations

### 12.1 Transport Security

- All endpoints require HTTPS (TLS 1.3)
- Certificate pinning recommended for mobile clients
- HSTS headers enforced

### 12.2 Authentication Security

- API keys should be treated as secrets
- Rotate API keys quarterly or after suspected compromise
- Use separate keys for development and production
- Transaction endpoints require request signing

### 12.3 Data Privacy

**Scout Privacy:**
- Identity abstracted until transaction commitment
- Beacons never receive raw Scout queries
- Behavioral signals are aggregated and anonymized
- Scout can request data deletion (GDPR/CCPA)

**Data Retention:**
- Session data: 30 days after completion
- Transaction data: 7 years (legal compliance)
- Offer data: 90 days after expiration

### 12.4 Prompt Injection Defense

AURA's interpretation layer:
- Sanitizes all natural language before routing to Beacons
- Detects and removes instruction-style patterns
- Validates that interpreted requests match original intent
- Logs all interpretation decisions for audit

### 12.5 Offer Authenticity

- All offers are digitally signed by Beacons
- AURA verifies signatures before presenting to Scouts
- Scouts can independently verify signatures
- Tampered offers are rejected and logged

---

## 13. API Reference

### 13.1 Base URL

```
Production: https://api.aura.example.com
Sandbox:    https://sandbox.aura.example.com
```

### 13.2 Endpoint Summary

#### Scout Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/agents/scouts` | Register new Scout agent |
| POST | `/v1/sessions` | Create shopping session |
| GET | `/v1/sessions/{session_id}` | Get session status |
| GET | `/v1/sessions/{session_id}/offers` | Get ranked offers |
| GET | `/v1/offers/{offer_id}` | Get offer details |
| POST | `/v1/sessions/{session_id}/commit` | Commit to offer |
| GET | `/v1/transactions/{transaction_id}` | Get transaction status |
| DELETE | `/v1/transactions/{transaction_id}` | Cancel transaction |

#### Beacon Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/agents/beacons` | Register new Beacon agent |
| POST | `/v1/sessions/{session_id}/offers` | Submit offers |
| GET | `/v1/beacons/{beacon_id}/requests` | List pending requests |
| GET | `/v1/beacons/{beacon_id}/transactions` | List transactions |

#### Webhook Events (Beacon receives)

| Event | Description |
|-------|-------------|
| `offer_request` | New offer request from AURA |
| `offer_accepted` | Scout committed to your offer |
| `transaction_confirmed` | Transaction payment confirmed |
| `transaction_cancelled` | Transaction cancelled |
| `transaction_completed` | Order delivered successfully |

### 13.3 Versioning

API version is included in the URL path: `/v1/...`

**Version lifecycle:**
- **Current:** Full support
- **Deprecated:** 6 months notice, still functional
- **Sunset:** No longer available

Include `AURA-Version` header to request specific API version behavior:
```
AURA-Version: 2026-01-01
```

---

## 14. Implementation Notes

### 14.1 Scout Implementation Checklist

1. **Registration:** Obtain API credentials
2. **Authentication:** Implement API key auth and request signing
3. **Session creation:** Build natural language query with optional structured hints
4. **Polling/WebSocket:** Implement status monitoring
5. **Offer presentation:** Display ranked offers to user
6. **Commitment:** Handle identity revelation and payment
7. **Error handling:** Implement retry logic for transient errors

### 14.2 Beacon Implementation Checklist

1. **Registration:** Obtain API credentials, configure webhook
2. **Webhook handling:** Accept and validate AURA requests
3. **Offer generation:** Transform interpreted requests into offers
4. **Signature generation:** Sign all offers
5. **Response timing:** Respond within timeout window
6. **Transaction handling:** Process accepted offers

### 14.3 Testing

**Sandbox environment:**
- Use `sandbox.aura.example.com`
- Test API keys: `sk_test_...`, `bk_test_...`
- Simulated Beacons available for Scout testing
- Simulated Scouts available for Beacon testing

**Test cards (for payment testing):**
- Success: `4242424242424242`
- Decline: `4000000000000002`
- Require authentication: `4000002500003155`

### 14.4 SDK Availability

Official SDKs planned for:
- Python
- JavaScript/TypeScript
- Swift (iOS)
- Kotlin (Android)

Community SDKs welcome under Apache 2.0 license.

---

## Appendix A: JSON Schema Definitions

### A.1 Session Request Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://aura.example.com/schemas/session-request.json",
  "title": "Session Request",
  "type": "object",
  "required": ["natural_language_query"],
  "properties": {
    "natural_language_query": {
      "type": "string",
      "minLength": 10,
      "maxLength": 2000,
      "description": "Scout's natural language expression of need"
    },
    "structured_hints": {
      "type": "object",
      "properties": {
        "category_hint": {"type": "string"},
        "price_range_usd": {
          "type": "object",
          "properties": {
            "min": {"type": "number", "minimum": 0},
            "max": {"type": "number", "minimum": 0}
          }
        },
        "required_features": {
          "type": "array",
          "items": {"type": "string"}
        }
      }
    },
    "context": {
      "type": "object",
      "properties": {
        "use_case": {"type": "string"},
        "previous_purchases": {
          "type": "array",
          "items": {"type": "string"}
        },
        "location": {
          "type": "object",
          "properties": {
            "country": {"type": "string", "pattern": "^[A-Z]{2}$"},
            "region": {"type": "string"}
          }
        }
      }
    },
    "preferences": {
      "type": "object",
      "properties": {
        "max_offers": {"type": "integer", "minimum": 1, "maximum": 50, "default": 10},
        "offer_timeout_seconds": {"type": "integer", "minimum": 10, "maximum": 120, "default": 30},
        "include_reputation_data": {"type": "boolean", "default": true}
      }
    }
  }
}
```

### A.2 Offer Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://aura.example.com/schemas/offer.json",
  "title": "Offer",
  "type": "object",
  "required": ["offer_id", "product", "pricing", "availability", "valid_until", "signature"],
  "properties": {
    "offer_id": {
      "type": "string",
      "pattern": "^ofr_[0-9A-Z]{26}$"
    },
    "product": {
      "type": "object",
      "required": ["product_id", "name", "category"],
      "properties": {
        "product_id": {"type": "string"},
        "name": {"type": "string", "maxLength": 200},
        "category": {"type": "string"},
        "structured_attributes": {"type": "object"},
        "natural_language_description": {
          "type": "object",
          "required": ["content", "language"],
          "properties": {
            "content": {"type": "string", "maxLength": 2000},
            "language": {"type": "string", "pattern": "^[a-z]{2}$"}
          }
        },
        "images": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "url": {"type": "string", "format": "uri"},
              "type": {"type": "string", "enum": ["primary", "gallery", "thumbnail"]}
            }
          }
        }
      }
    },
    "pricing": {
      "type": "object",
      "required": ["currency", "offer_price"],
      "properties": {
        "currency": {"type": "string", "pattern": "^[A-Z]{3}$"},
        "list_price": {"type": "number", "minimum": 0},
        "offer_price": {"type": "number", "minimum": 0},
        "discount_percentage": {"type": "number", "minimum": 0, "maximum": 100},
        "price_valid_until": {"type": "string", "format": "date-time"}
      }
    },
    "availability": {
      "type": "object",
      "required": ["in_stock"],
      "properties": {
        "in_stock": {"type": "boolean"},
        "quantity_available": {"type": "integer", "minimum": 0},
        "estimated_ship_date": {"type": "string", "format": "date"},
        "delivery_estimate_days": {
          "type": "object",
          "properties": {
            "min": {"type": "integer", "minimum": 0},
            "max": {"type": "integer", "minimum": 0}
          }
        }
      }
    },
    "valid_until": {
      "type": "string",
      "format": "date-time"
    },
    "signature": {
      "type": "string",
      "pattern": "^sig_[A-Za-z0-9+/=]+$"
    }
  }
}
```

---

## Appendix B: Sequence Diagrams

### B.1 Complete Transaction Flow

```
┌─────────┐          ┌───────────┐          ┌─────────┐
│  Scout  │          │ AURA Core │          │ Beacon  │
└────┬────┘          └─────┬─────┘          └────┬────┘
     │                     │                     │
     │ POST /v1/sessions   │                     │
     │ (natural language)  │                     │
     │────────────────────>│                     │
     │                     │                     │
     │   201 Created       │                     │
     │   session_id        │                     │
     │<────────────────────│                     │
     │                     │                     │
     │                     │  Interpret query    │
     │                     │  (internal LLM)     │
     │                     │                     │
     │                     │  Query Beacon       │
     │                     │  registry           │
     │                     │                     │
     │                     │ POST webhook        │
     │                     │ (interpreted req)   │
     │                     │────────────────────>│
     │                     │                     │
     │                     │                     │ Generate
     │                     │                     │ offers
     │                     │                     │
     │                     │ POST /offers        │
     │                     │ (signed offers)     │
     │                     │<────────────────────│
     │                     │                     │
     │                     │  Calculate CWR      │
     │                     │  Rank offers        │
     │                     │                     │
     │ GET /sessions/{id}  │                     │
     │ status: offers_ready│                     │
     │<────────────────────│                     │
     │                     │                     │
     │ GET /sessions/{id}/ │                     │
     │     offers          │                     │
     │────────────────────>│                     │
     │                     │                     │
     │   Ranked offers     │                     │
     │<────────────────────│                     │
     │                     │                     │
     │ POST /commit        │                     │
     │ (buyer identity)    │                     │
     │────────────────────>│                     │
     │                     │                     │
     │                     │  Reveal identity    │
     │                     │────────────────────>│
     │                     │                     │
     │                     │  Process payment    │
     │                     │                     │
     │                     │  Create order       │
     │                     │<────────────────────│
     │                     │                     │
     │   201 Created       │                     │
     │   transaction_id    │                     │
     │<────────────────────│                     │
     │                     │                     │
```

---

## Appendix C: Glossary

| Term | Definition |
|------|------------|
| **Agent** | An autonomous software entity acting on behalf of a principal |
| **AURA** | Agentic Universal Request/Response Architecture |
| **Beacon** | Seller-side agent representing merchant interests |
| **CWR** | Compatibility-Weighted Reputation - ranking algorithm |
| **Hard Constraint** | Requirement that must be satisfied (filters out non-matches) |
| **Interpreted Request** | AURA's structured representation of Scout intent |
| **Offer** | Beacon's response containing product, pricing, and terms |
| **Principal** | The human or entity an agent represents |
| **Sanitization** | Process of removing PII and injection patterns from text |
| **Scout** | Buyer-side agent representing consumer interests |
| **Session** | Logical conversation from request to transaction completion |
| **Soft Preference** | Preference that influences ranking but isn't mandatory |
| **x402** | HTTP-native payment protocol for agent commerce |

---

## Appendix D: Event Structure for Telemetry

Analytics and reporting are out of scope for MVP, but this section defines the event structure for future implementation. Events can be pushed to message queues (Kafka, etc.) for downstream processing.

### D.1 Event Envelope

All events follow a standard envelope structure:

```json
{
  "event_id": "evt_01HXYZ...",
  "event_type": "session.created",
  "event_version": "1.0",
  "timestamp": "2026-01-14T10:00:00.000Z",
  "source": "aura_core",
  "correlation_id": "ses_01HXYZ...",
  "payload": {
    // Event-specific data
  },
  "metadata": {
    "environment": "production",
    "region": "us-east-1",
    "aura_version": "1.0.0"
  }
}
```

### D.2 Event Types

#### Session Events

| Event Type | Description |
|------------|-------------|
| `session.created` | New shopping session initiated |
| `session.interpreted` | Natural language query interpreted |
| `session.offers_collected` | Offers received from Beacons |
| `session.offers_ranked` | CWR ranking completed |
| `session.committed` | Scout committed to offer |
| `session.completed` | Transaction successfully completed |
| `session.cancelled` | Session cancelled |
| `session.expired` | Session timed out |

#### Offer Events

| Event Type | Description |
|------------|-------------|
| `offer.requested` | Offer request sent to Beacon |
| `offer.received` | Offer received from Beacon |
| `offer.validated` | Offer signature verified |
| `offer.rejected` | Offer failed validation |
| `offer.accepted` | Offer accepted by Scout |
| `offer.expired` | Offer validity period ended |

#### Transaction Events

| Event Type | Description |
|------------|-------------|
| `transaction.initiated` | Transaction processing started |
| `transaction.payment_authorized` | Payment authorization successful |
| `transaction.payment_captured` | Payment captured |
| `transaction.payment_failed` | Payment processing failed |
| `transaction.fulfilled` | Order fulfilled by merchant |
| `transaction.completed` | Transaction fully completed |
| `transaction.refunded` | Refund processed |

#### Agent Events

| Event Type | Description |
|------------|-------------|
| `agent.registered` | New agent registered |
| `agent.policy_updated` | Agent policy changed |
| `agent.reputation_changed` | Agent reputation score updated |
| `agent.suspended` | Agent account suspended |

### D.3 Example Event: session.committed

```json
{
  "event_id": "evt_01HXYZ...",
  "event_type": "session.committed",
  "event_version": "1.0",
  "timestamp": "2026-01-14T10:35:00.000Z",
  "source": "aura_core",
  "correlation_id": "ses_01HXYZ...",
  "payload": {
    "session_id": "ses_01HXYZ...",
    "scout_id": "sct_01HXYZ...",
    "beacon_id": "bcn_01HXYZ...",
    "offer_id": "ofr_01HABC...",
    "transaction_id": "txn_01HXYZ...",
    "category": "electronics.headphones",
    "amount_usd": 381.49,
    "payment_method": "x402",
    "cwr_score": 89.6,
    "offer_rank": 1,
    "total_offers": 8,
    "session_duration_ms": 35000
  },
  "metadata": {
    "environment": "production",
    "region": "us-east-1",
    "aura_version": "1.0.0"
  }
}
```

### D.4 Event Delivery

**Future Implementation Notes:**

- Events will be published to Apache Kafka or compatible message queue
- Partitioning by `correlation_id` ensures ordered processing per session
- Events are immutable; corrections published as new events
- Retention period: 90 days (configurable)
- Schema registry for event versioning and compatibility

---

## 15. Future Extensions

This section documents planned protocol extensions that are part of the AURA architecture but deferred beyond MVP. These design statements provide guidance for future protocol versions.

### 15.1 Multi-Round Negotiation Protocol

**Current State:** MVP supports single-offer acceptance only.

**Future Design:**

The negotiation protocol will enable Scouts and Beacons to negotiate along agreed economic principles and models until consensus is reached or non-consensus is determined.

**Planned Features:**

- **Negotiation Round Messages:** Offer/counter-offer cycles with state tracking
- **Economic Model Declaration:** Agents declare negotiation strategies (fixed-price, auction, bargaining)
- **Consensus Rules:** Configurable rules for determining agreement
- **Non-Consensus Handling:** Graceful termination when parties cannot agree
- **Negotiation Boundaries:** Policy-enforced limits on negotiation scope
- **Time Constraints:** Maximum rounds, timeout handling

**Example Negotiation Flow:**
```
Scout → AURA: Initial request
AURA → Beacon: Offer request
Beacon → AURA: Initial offer ($350)
AURA → Scout: Present offer
Scout → AURA: Counter-offer ($320)
AURA → Beacon: Counter-offer (anonymized)
Beacon → AURA: Revised offer ($335)
AURA → Scout: Present revised offer
Scout → AURA: Accept
[Transaction proceeds]
```

### 15.2 Constraint Breakthrough Protocol

**Current State:** Beacons respond only within Scout's stated constraints.

**Future Design:**

Enable Beacons to surface exceptional opportunities outside constraints without creating notification fatigue.

**Planned Features:**

- `breakthrough_opportunity` message type from Beacon to AURA
- Policy-based filtering (AURA evaluates significance)
- Non-intrusive presentation mechanism to Scout
- Principal decision capture (accept, reject, adjust constraints)
- Learning integration for constraint refinement

### 15.3 Automated Consent Management

**Current State:** Consent is manual at transaction time.

**Future Design:**

Enable users to define consent policies that automatically apply when boundary conditions are met.

**Planned Features:**

- Consent policy definition API
- Conditional consent rules (e.g., "share email with merchants rated above 80")
- Consent inheritance and override mechanisms
- Audit trail for automated consent decisions
- User notification for significant consent events

### 15.4 Agent-to-Agent Communication

**Current State:** Only Scout ↔ AURA ↔ Beacon communication defined.

**Future Design:**

Enable broader agent ecosystem with direct agent communication.

**Planned Features:**

- Agent discovery protocol
- Direct agent messaging (outside AURA broker)
- Capability advertisement and matching
- Trust delegation between agents
- Protocol translation services

### 15.5 Advanced Payment Methods

**Current State:** x402 and card payments supported.

**Future Design:**

Expand payment options based on market demand.

**Planned Methods:**

- Cryptocurrency stablecoins (USDC, USDT)
- Buy Now Pay Later (BNPL) integration
- Invoice-based payments for B2B
- Escrow services for high-value transactions
- Cross-border payment optimization

### 15.6 Analytics and Reporting API

**Current State:** Event structure defined; API not implemented.

**Future Design:**

Provide agents with access to their performance data and market insights.

**Planned Features:**

- Performance dashboards for Scouts and Beacons
- Conversion analytics
- Reputation trend analysis
- Market category insights
- Anonymized benchmark comparisons

### 15.7 Subscription and Recurring Purchases

**Current State:** Single transaction flow only.

**Future Design:**

Support subscription-based commerce and automated replenishment.

**Planned Features:**

- Subscription creation and management
- Recurring payment authorization
- Delivery scheduling
- Pause/resume/cancel workflows
- Price change notifications

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01 | Initial specification |

---

**End of Specification**
