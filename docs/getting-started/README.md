# Getting Started with AURA

Step-by-step guides to help you start building with the AURA Framework.

## Choose Your Path

### For Sellers (Beacon Development)

Building a selling agent to connect your inventory to the AURA network.

1. **[First Beacon Tutorial](./first-beacon.md)** - Create your first Beacon
2. **[Inventory Integration](./inventory-integration.md)** - Connect your product catalog
3. **[Dynamic Pricing](./dynamic-pricing.md)** - Implement pricing strategies
4. **[Production Deployment](./deployment.md)** - Go live

### For Buyers (Scout Development)

Building a buying agent to help users discover and purchase.

1. **[First Scout Tutorial](./first-scout.md)** - Create your first Scout
2. **[Intent Modeling](./intent-modeling.md)** - Capture user preferences
3. **[Negotiation Strategies](./negotiation-strategies.md)** - Optimize for users
4. **[User Consent](./user-consent.md)** - Handle approvals properly

### For Platform Integrators

Adding AURA capabilities to existing platforms.

1. **[Platform Overview](./platform-integration.md)** - Integration approaches
2. **[E-commerce Plugins](../integration-guides/README.md)** - Shopify, WooCommerce, etc.
3. **[Custom Integration](../integration-guides/custom-ecommerce.md)** - Build your own

## Quick Start

The fastest way to get started:

```bash
# Clone the repository
git clone https://github.com/aura-labs/aura-framework
cd aura-framework

# Run the simple Beacon example
cd beacons/simple-beacon
npm install
npm start
```

See the full [Quickstart Guide](../QUICKSTART.md) for detailed instructions.

## Prerequisites

- **Node.js 18+** or Python 3.9+ or Go 1.21+
- Basic understanding of REST APIs and WebSockets
- Familiarity with async/await patterns

## Development Environment

### Recommended Setup

1. **Code Editor**: VS Code with extensions:
   - ESLint
   - Prettier
   - REST Client

2. **Testing Tools**:
   - Postman or Insomnia for API testing
   - WebSocket testing tools

3. **Local Development**:
   - Docker for running AURA Core locally
   - Node.js for running examples

## Next Steps

After completing the getting started guides:

- Read the [Architecture Overview](../ARCHITECTURE.md)
- Explore the [Protocol Specification](../protocol/PROTOCOL_SPECIFICATION.md)
- Check out [Example Projects](../../examples/README.md)
- Join the community on GitHub

## Need Help?

- **Documentation**: You're in the right place
- **GitHub Issues**: Bug reports and questions
- **Blog**: [marcmassar.substack.com](https://marcmassar.substack.com)
