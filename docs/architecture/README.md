# AURA Architecture Documentation

Detailed architecture documentation for the AURA Framework.

## Contents

- **[Component Registry](./COMPONENT_REGISTRY.md)** - Comprehensive component specifications
- **[Neutral Broker Architecture](./NEUTRAL_BROKER.md)** - Deep dive into AURA Core

## Architecture Overview

AURA is built on a three-layer architecture designed for privacy, trust, and autonomous negotiation.

```
┌─────────────────────────────────────────────────────────────────┐
│                        BUYER LAYER                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Scout   │  │  Scout   │  │  Scout   │  │  Scout   │        │
│  │(Shopping)│  │ (Procure)│  │ (Voice)  │  │ (Mobile) │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
└───────┼─────────────┼─────────────┼─────────────┼───────────────┘
        │             │             │             │
        └─────────────┴──────┬──────┴─────────────┘
                             │ Intent
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        AURA CORE                                 │
│  ┌────────────────────────────────────────────────────────┐     │
│  │                   Neutral Broker                        │     │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │     │
│  │  │  Intent  │ │ Matching │ │  Trust   │ │ Protocol │  │     │
│  │  │ Registry │ │  Engine  │ │  System  │ │  Enforce │  │     │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ Propositions
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       SELLER LAYER                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Beacon  │  │  Beacon  │  │  Beacon  │  │  Beacon  │        │
│  │ (Retail) │  │ (Travel) │  │(Services)│  │  (B2B)   │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
└───────┼─────────────┼─────────────┼─────────────┼───────────────┘
        │             │             │             │
        ▼             ▼             ▼             ▼
   [Inventory]   [Bookings]   [Capacity]    [Catalog]
```

## Design Principles

### 1. Identity Abstraction
Buyer identity is separated from intent. Scouts negotiate on behalf of users without revealing who they are until transaction commitment.

### 2. Data Sovereignty
Neither buyers nor sellers are forced to expose private data. Buyers keep behavioral data private. Sellers keep inventory and pricing private.

### 3. Neutral Brokerage
AURA Core has no stake in transaction outcomes. It enforces protocol rules without favoring either side.

### 4. Explicit Consent
Every action requires user approval. Agents propose, humans decide.

### 5. Platform Independence
Sellers are protected from platform extraction. No forced exposure of inventory or pricing to intermediaries.

### 6. Framework-First
Scout and Beacon are integration frameworks, not standalone apps. They embed into existing systems.

## Component Deep Dives

- [Component Registry](./COMPONENT_REGISTRY.md) - All system components
- [Neutral Broker](./NEUTRAL_BROKER.md) - AURA Core internals

## See Also

- [Protocol Specification](../protocol/PROTOCOL_SPECIFICATION.md)
- [API Reference](../api/README.md)
