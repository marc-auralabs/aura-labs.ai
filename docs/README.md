# AURA Documentation

Welcome to the AURA Framework documentation. This guide will help you understand, integrate, and build with AURA.

## Quick Links

- **[Quickstart Guide](./QUICKSTART.md)** - Get your first Beacon running in 15 minutes
- **[Architecture Overview](./ARCHITECTURE.md)** - Understand the three-layer system

## Documentation Structure

### Getting Started
- [Quickstart Guide](./QUICKSTART.md) - Your first Beacon in 15 minutes
- [First Beacon Tutorial](./getting-started/first-beacon.md)
- [First Scout Tutorial](./getting-started/first-scout.md)
- [Testing Locally](./getting-started/testing-locally.md)

### Architecture
- [Architecture Overview](./ARCHITECTURE.md) - System design and principles
- [Component Registry](./architecture/COMPONENT_REGISTRY.md) - Detailed component specifications
- [Neutral Broker Architecture](./architecture/NEUTRAL_BROKER.md) - AURA Core deep dive

### Protocol
- [Protocol Specification](./protocol/PROTOCOL_SPECIFICATION.md) - Complete protocol reference
- [Reputation System](./protocol/REPUTATION_SPECIFICATION.md) - Trust and reputation mechanics
- [Message Formats](./protocol/messages.md) - Message schema documentation

### API Reference
- [API Overview](./api/README.md) - REST and WebSocket APIs
- [Core API](./api/core-api.md) - AURA Core endpoints
- [Beacon API](./api/beacon-api.md) - Beacon interface
- [Scout API](./api/scout-api.md) - Scout interface

### Integration Guides
- [Integration Overview](./integration-guides/README.md)
- [Shopify Integration](./integration-guides/shopify.md)
- [WooCommerce Integration](./integration-guides/woocommerce.md)
- [Custom Platform Guide](./integration-guides/custom-ecommerce.md)

### Tutorials
- [Tutorial Index](./tutorials/README.md)
- Step-by-step guides for common use cases

## Key Concepts

### The Three Layers

1. **Scout** - Buying agents that represent buyer intent
2. **AURA Core** - Neutral broker that matches intent to propositions
3. **Beacon** - Selling agents that signal market participation

### Core Principles

- **Identity Abstraction** - Buyers remain anonymous until transaction
- **Data Sovereignty** - Both parties control their own data
- **Explicit Consent** - Agents propose, humans decide
- **Platform Independence** - No forced data exposure to intermediaries

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines on contributing to AURA.

## Need Help?

- **GitHub Issues** - Bug reports and feature requests
- **Blog** - Technical deep-dives at [marcmassar.substack.com](https://marcmassar.substack.com)
