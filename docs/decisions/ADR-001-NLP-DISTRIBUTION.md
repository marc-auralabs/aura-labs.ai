# ADR-001: Natural Language Processing Distribution

**Status:** Accepted
**Date:** 2026-02-12
**Decision Makers:** Marc Massar
**Context:** Architectural decision for AURA platform

---

## Context

AURA is a three-party system: Scouts (buyers), Core (broker), and Beacons (sellers). Natural language flows through the system at multiple points:

1. **User → Scout:** "I need 50 ergonomic keyboards under $5000"
2. **Scout → Core:** Intent transmission for matching
3. **Core → Beacon:** Query broadcast to relevant vendors
4. **Beacon → Core → Scout:** Offer responses and negotiation

The question: **Where should NLP/intent parsing happen?**

---

## Options Considered

### Option A: Scout-Heavy Processing
Scout does all NLP locally, sends only structured constraints to Core.

| Pros | Cons |
|------|------|
| Works offline | Inconsistent across implementations |
| Privacy (raw intent stays local) | Harder to upgrade/improve |
| Lower latency | Scout bloat (requires LLM) |
| Resilient to Core outages | User experience varies by Scout quality |

### Option B: Core-Heavy Processing (Centralized)
Raw intent flows to Core, Core does all semantic analysis.

| Pros | Cons |
|------|------|
| Consistent parsing | Single point of failure |
| Single upgrade point | Latency on every request |
| Market-aware context | Privacy concern (raw intent to Core) |
| Easier to debug/audit | Core must scale with demand |

### Option C: Beacon-Heavy Processing
Beacons receive raw intent and interpret it themselves.

| Pros | Cons |
|------|------|
| Domain expertise | Inconsistent interpretation |
| Distributed load | Unfair offer comparison |
| Beacons know their products best | Security risk (raw user data to vendors) |

### Option D: Tiered Processing (Selected)
Distribute NLP across all three layers with clear responsibilities.

---

## Decision

**We will implement Tiered Processing (Option D)** with the following distribution:

### Layer 1 — Scout (20% of processing)
**Responsibility:** Basic extraction, user confirmation

- Extract obvious structure: numbers, dates, quantities, currencies
- Regex/pattern matching (no LLM required)
- Present extracted constraints to user for confirmation/correction
- Send semi-structured intent (raw text + extracted fields) to Core

**Rationale:** Scouts should work without an LLM. Basic extraction is deterministic and fast. User confirmation catches errors early.

### Layer 2 — Core (70% of processing)
**Responsibility:** Semantic understanding, categorization, matching

- Deep NLP via Granite (or fallback LLM)
- Category classification
- Keyword extraction for Beacon matching
- Constraint normalization (convert "next week" → ISO date)
- Confidence scoring

**Rationale:** Core is the brain of the system. Centralized NLP ensures consistent interpretation. Market-aware context improves matching. Single upgrade point for improvements.

### Layer 3 — Beacon (10% of processing)
**Responsibility:** Domain-specific interpretation (optional)

- Receives BOTH structured query AND raw intent
- Can use domain expertise for nuance (furniture Beacon knows "mid-century modern")
- Must respond with STRUCTURED offer (for fair comparison)
- No requirement to do NLP — can work purely on structured query

**Rationale:** Beacons have domain expertise Scouts and Core lack. Providing raw intent allows sophisticated Beacons to add value. Structured response requirement ensures fair comparison.

---

## Protocol Negotiation Model

**For MVP:** All communication through Core (Option A below)

```
Scout ←→ Core ←→ Beacon
```

**For V2:** Core brokers introduction, direct negotiation with audit trail

```
Scout ←→ Core ←→ Beacon    [matching phase]
Scout ←────────→ Beacon    [negotiation phase]
         ↓
       Core                [receives signed audit trail]
```

### Rationale for MVP

- Simpler implementation
- Easier debugging and monitoring
- All data flows through single point for audit
- Core can enforce protocol compliance
- Build trust before decentralizing

### Rationale for V2 Direct Negotiation

- Reduced latency in negotiation
- Survives temporary Core outages
- Scales better (Core not bottleneck)
- More resilient architecture
- Maintains audit trail via signed transcripts

---

## Data Flow Specification

### Scout → Core Request
```json
{
  "raw_intent": "I need 50 ergonomic keyboards under $5000, delivery by end of month",
  "extracted": {
    "quantity": 50,
    "max_budget": 5000,
    "currency": "USD",
    "delivery_by": "2026-02-28"
  },
  "user_confirmed": true,
  "scout_version": "1.0.0"
}
```

### Core → Beacon Query
```json
{
  "session_id": "abc123",
  "raw_intent": "I need 50 ergonomic keyboards...",
  "structured": {
    "category": "office_equipment.keyboards",
    "keywords": ["ergonomic", "keyboard"],
    "quantity": 50,
    "max_unit_price": 100,
    "currency": "USD",
    "delivery_by": "2026-02-28"
  },
  "confidence": 0.92
}
```

### Beacon → Core Response
```json
{
  "offer_id": "offer_xyz",
  "beacon_id": "beacon_456",
  "product": {
    "name": "ErgoKey Pro Wireless",
    "sku": "EKP-2026",
    "unit_price": 89.99,
    "quantity_available": 200
  },
  "total_price": 4499.50,
  "currency": "USD",
  "delivery_estimate": "2026-02-25",
  "confidence": 0.88,
  "interpretation_notes": "Matched 'ergonomic keyboards' to ErgoKey Pro line"
}
```

---

## Failure Modes

| Scenario | Behavior |
|----------|----------|
| Scout can't extract anything | Send raw intent only, Core handles all parsing |
| Core NLP fails | Return error, Scout can retry or ask user to rephrase |
| Beacon can't interpret | Respond with null offer or low-confidence match |
| Core unavailable | Scout shows cached results or offline message |

---

## Implementation Notes

### Granite Integration (Core)
- Primary: IBM Granite via Replicate
- Fallback: Rule-based extraction
- Future: Fine-tuned model on commerce intent

### Scout Extraction (No LLM)
```javascript
// Example: Scout-side extraction (regex/patterns)
function extractBasicConstraints(intent) {
  return {
    quantity: extractNumber(intent, /(\d+)\s*(units?|items?|pieces?)?/i),
    max_budget: extractCurrency(intent, /under\s*\$?([\d,]+)/i),
    delivery_by: extractDate(intent, /(by|before|within)\s+(.+)/i),
  };
}
```

### Beacon Domain Expertise (Optional)
Beacons MAY implement their own NLP for competitive advantage but MUST respond with structured offers.

---

## Consequences

### Positive
- Resilient: System works even if one layer's NLP fails
- Scalable: Load distributed across layers
- Upgradeable: Can improve each layer independently
- Privacy-conscious: Raw intent only goes to Core (trusted), not directly to Beacons
- Fair: Structured offers enable apples-to-apples comparison

### Negative
- Complexity: Three NLP touch points to maintain
- Potential inconsistency: Different layers might interpret differently
- Latency: Multiple parsing steps add time

### Mitigations
- Confidence scores at each layer
- User confirmation of extracted constraints
- Structured response requirement for Beacons
- Audit trail of interpretations for debugging

---

## Related Decisions

- ADR-002: Protocol Negotiation (pending)
- ADR-003: Granite Integration (pending)
- ADR-004: Offline/Degraded Mode Behavior (pending)

---

## References

- [AURA Architecture Specification](../ARCHITECTURE.md)
- [Protocol Specification](../protocol/PROTOCOL_SPECIFICATION.md)
- [MCP Server Implementation](../../sdks/mcp-server-scout/)
