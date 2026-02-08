# Frequently Asked Questions

Common questions about the AURA Framework.

## General

### What is AURA?

AURA (Agent Universal Resource Architecture) is the infrastructure for agentic commerce — enabling AI agents to discover, negotiate, and transact directly with each other using native protocols. AURA provides the resource architecture that agents use, while humans retain control over decisions through explicit consent frameworks.

### How is AURA different from existing e-commerce?

Traditional e-commerce requires humans to search, compare, and purchase manually. AURA enables:
- **Autonomous discovery**: Agents find products matching your intent
- **Privacy-first negotiation**: Your identity stays hidden until you commit
- **Dynamic pricing**: Personalized offers without discrimination
- **Explicit consent**: Agents propose, you decide

### Is AURA a marketplace?

No. AURA is infrastructure that enables agentic commerce. Think of it like email: AURA provides the protocol, while Scouts (buying agents) and Beacons (selling agents) are the applications that use it.

### Who controls my data?

You do. AURA's core principle is data sovereignty:
- **Buyers**: Your behavioral data stays with your Scout until you choose to share it
- **Sellers**: Your inventory and pricing logic stays with your Beacon
- **AURA Core**: Only sees anonymized intent and propositions needed for matching

## For Buyers

### What is a Scout?

A Scout is a buying agent that represents your interests. It:
- Captures your purchase intent
- Discovers matching products
- Negotiates on your behalf
- Presents options for your approval

Scouts are built into applications like shopping apps, browser extensions, or voice assistants.

### Will a Scout buy things without my permission?

No. AURA requires explicit consent for all transactions. Your Scout will:
1. Find options matching your criteria
2. Negotiate within your constraints
3. **Always ask for your approval** before committing

You control the level of autonomy.

### How does identity abstraction work?

When you search for products through a Scout:
1. Your Scout sends anonymized intent to AURA Core
2. Sellers see what you want, not who you are
3. Negotiation happens without revealing identity
4. Only when you approve a purchase is your identity shared for fulfillment

### Can sellers track me?

No. Sellers receive anonymized behavioral data (purchase history patterns, preferences) without personally identifiable information. They can offer personalized pricing without knowing who you are.

## For Sellers

### What is a Beacon?

A Beacon is a selling agent that:
- Signals your willingness to participate in markets
- Responds to buyer intent with propositions
- Negotiates pricing dynamically
- Processes transactions

Beacons integrate into your existing systems (e-commerce, ERP, inventory).

### Do I have to expose my inventory?

No. Unlike traditional platforms that require full catalog access:
- You define what markets you participate in
- You control what information is shared
- Pricing logic stays on your systems
- You respond to intent, not scraping bots

### How does dynamic pricing work?

When a Scout inquiry arrives, your Beacon receives:
- Intent description (what they're looking for)
- Anonymized behavioral data (purchase patterns)
- Constraints (budget, timing)

Your pricing logic decides the offer based on this context.

### What fees does AURA charge?

AURA is open source. Running your own infrastructure has no fees. Managed AURA Core services may have usage-based pricing (see [pricing page](#) when available).

## Technical

### What protocols does AURA use?

- **WebSocket**: Primary transport for real-time communication
- **REST API**: Secondary transport for stateless operations
- **JSON**: Message format
- **TLS 1.3**: Required encryption

### What languages are supported?

Official SDKs:
- JavaScript/Node.js (available now)
- Python (available now)
- Go (coming soon)

The REST API works with any language.

### How do I test my integration?

1. **Local testing**: Use the Scout/Beacon simulators
2. **Sandbox**: Test against sandbox AURA Core
3. **Production**: Deploy with production credentials

### What about rate limits?

| Client Type | Requests/min | Connections |
|-------------|--------------|-------------|
| Scout | 100 | 5 |
| Beacon | 500 | 10 |
| Enterprise | Custom | Custom |

### How does trust/reputation work?

AURA maintains trust scores for all participants based on:
- Transaction completion rate
- Dispute resolution
- Behavioral patterns

Low-trust participants may have limited visibility.

## Integration

### Can I integrate with Shopify/WooCommerce?

Yes. See [Integration Guides](./integration-guides/README.md) for:
- Shopify plugin
- WooCommerce extension
- Custom platform integration

### How long does integration take?

- **Simple Beacon**: 15 minutes (see [Quickstart](./QUICKSTART.md))
- **Basic integration**: 1-2 days
- **Full production deployment**: 1-2 weeks

### Do I need to modify my existing systems?

Minimal changes. Beacons integrate alongside your existing systems:
- Connect to your inventory API
- Map your products to propositions
- Handle orders through your existing flow

## Support

### Where can I get help?

- **Documentation**: You're here
- **GitHub Issues**: Bug reports and features
- **Blog**: [marcmassar.substack.com](https://marcmassar.substack.com)

### How do I report a security issue?

Email security@aura-labs.ai with details. Do not open public issues for security vulnerabilities.

### How can I contribute?

See [CONTRIBUTING.md](../CONTRIBUTING.md) for:
- Code contributions
- Documentation improvements
- Bug reports
- Feature requests
