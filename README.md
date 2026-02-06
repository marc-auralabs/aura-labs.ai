# AURA Framework

> **A**gent **U**niversal **R**esource **A**ccess - The open standard for agentic commerce

## Overview

AURA is an open framework that enables AI agents to discover, negotiate, and transact with merchants on behalf of consumers. This repository provides reference implementations, code samples, and integration guides for building AURA-compatible components.

## Why AURA?

Traditional e-commerce operates on a 0.05% conversion model - 99.95% waste. AURA enables **agent-first commerce** where AI agents (Scouts) represent consumers and interact with merchant services (Beacons) through a standardized protocol, achieving conversion potentials of ~75%.

### Key Statistics
- **33%** of Gen Z prefer AI platforms for product research
- **27%** of Millennials trust AI over human shopping recommendations  
- **71%** of consumers want AI integrated into shopping experiences
- **1,500x** higher conversion when agents are engaged

## Architecture

The AURA ecosystem consists of three primary components:

### 1. **AURA Core** (This Repository's Focus)
The central coordination layer that:
- Manages client integration (Scouts and Beacons)
- Maintains the Proposition Universe gateway
- Handles model management and protocol standards
- Provides trust, identity, and preference management

### 2. **Scout** (User Agent)
User-sovereign AI agents that:
- Represent consumer interests and preferences
- Discover and negotiate with Beacons
- Execute purchases with full user consent
- Learn and adapt to user behavior

### 3. **Beacon** (Merchant Service)
Merchant-operated services that:
- Broadcast product/service availability
- Negotiate with Scouts in real-time
- Honor AURA protocol standards
- Provide fulfillment capabilities

## Repository Structure

```
aura-framework/
├── docs/                           # Documentation and guides
│   ├── architecture/              # Architecture diagrams and specs
│   ├── getting-started/           # Quick start guides
│   ├── protocol/                  # Protocol specifications
│   └── integration-guides/        # Platform-specific guides
│
├── core/                          # AURA Core components
│   ├── client-management/        # Scout & Beacon registration
│   ├── proposition-gateway/      # Proposition Universe access
│   ├── model-management/         # Protocol and schema management
│   └── shared/                   # Common utilities
│
├── beacons/                      # Beacon reference implementations
│   ├── simple-beacon/           # Basic Beacon example
│   ├── retail-beacon/           # E-commerce Beacon
│   ├── travel-beacon/           # Travel/hospitality Beacon
│   └── service-beacon/          # Service provider Beacon
│
├── examples/                     # Full integration examples
│   ├── nodejs/                  # Node.js examples
│   ├── python/                  # Python examples
│   └── go/                      # Go examples
│
├── tools/                       # Developer tools
│   ├── validators/             # Protocol validators
│   ├── simulators/             # Testing simulators
│   └── monitoring/             # Monitoring tools
│
└── schemas/                    # JSON schemas and contracts
    ├── beacon/                # Beacon message schemas
    ├── scout/                 # Scout message schemas
    └── transactions/          # Transaction schemas
```

## Quick Start

### For Beacon Developers

```bash
# Clone the repository
git clone https://github.com/aura-labs/aura-framework.git
cd aura-framework

# Start with the simple beacon example
cd beacons/simple-beacon
npm install
npm start
```

### For AURA Core Contributors

```bash
# Install dependencies
npm install

# Run tests
npm test

# Start development server
npm run dev
```

## Core Concepts

### Beacons
Beacons are merchant-operated services that expose inventory and capabilities to the AURA network. They:
- Broadcast availability without requiring active searches
- Negotiate pricing and terms dynamically with Scouts
- Support identity abstraction during negotiation
- Reveal identity only at transaction completion

### Proposition Universe
A dynamic catalog of offerings across all registered Beacons, enabling:
- Real-time discovery without constant polling
- Category-based and intent-based filtering
- Trust score and reputation filtering
- Competitive intelligence gathering

### Identity Abstraction
AURA enables privacy-preserving commerce where:
- Scouts negotiate without revealing consumer identity
- Beacons see behavior patterns, not personal data
- Identity is revealed only when necessary for fulfillment
- Pricing is merit-based, not discrimination-based

## Development Principles

All code in this repository follows these principles:

1. **Well-Commented**: Every module includes comprehensive inline documentation
2. **Modular**: Components are independent and composable
3. **Standards-Compliant**: Adheres to AURA protocol specifications
4. **Production-Ready**: Includes error handling, logging, and monitoring
5. **Test-Covered**: Unit and integration tests for all components

## Getting Started

### Prerequisites
- Node.js 18+ or Python 3.9+ or Go 1.21+
- Basic understanding of REST APIs and WebSockets
- Familiarity with async/await patterns

### Your First Beacon

Follow our [Simple Beacon Tutorial](./docs/getting-started/first-beacon.md) to:
1. Set up a basic Beacon service
2. Register with AURA Core
3. Broadcast your first proposition
4. Handle Scout inquiries
5. Process a transaction

### Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for:
- Code style guidelines
- Pull request process
- Testing requirements
- Documentation standards

## License

This project is licensed under the MIT License - see [LICENSE](./LICENSE) for details.

## Community

- **Discord**: [Join our community](https://discord.gg/aura-framework)
- **Forum**: [discussions.aura-framework.org](https://discussions.aura-framework.org)
- **Twitter**: [@AuraFramework](https://twitter.com/AuraFramework)

## Roadmap

- [x] Core protocol specification
- [x] Simple Beacon reference implementation
- [ ] Scout SDK (Q1 2026)
- [ ] Multi-language support (Python, Go)
- [ ] Advanced negotiation protocols
- [ ] Blockchain integration for trust
- [ ] Federated learning for preferences

## Acknowledgments

Built on insights from:
- Commerce/Future Commerce 2024 Research
- Capgemini Research Institute 2025
- Mintel Consumer AI Adoption Study 2024

---

**Built with ❤️ by the AURA Community**
