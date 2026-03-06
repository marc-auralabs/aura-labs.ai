# AURA Core

The central coordination layer of the AURA Framework.

## Overview

AURA Core is the neutral broker that:
- Manages Scout and Beacon connections
- Matches buyer intent to seller propositions
- Routes messages between participants
- Enforces protocol rules
- Maintains trust and reputation

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        AURA Core                             │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │    Client    │  │   Message    │  │    Trust     │      │
│  │  Management  │  │   Router     │  │   System     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Proposition  │  │   Protocol   │  │   Session    │      │
│  │   Gateway    │  │   Enforcer   │  │   Manager    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Components

### Client Management (`/src/client-management`)

Handles Scout and Beacon registration, authentication, and lifecycle.

- **client-manager.js** - Core client registration and management
- **authentication.js** - API key validation and JWT handling
- **session-manager.js** - Connection session tracking
- **rate-limiter.js** - Request rate limiting

### Message Router

Routes messages between Scouts, Beacons, and internal services.

### Proposition Gateway

Manages the "Proposition Universe" - the index of all available offerings.

### Trust System

Calculates and maintains trust scores for all participants.

### Protocol Enforcer

Validates messages and enforces protocol rules.

## Development

### Prerequisites

- Node.js 18+
- Redis (for production)
- PostgreSQL (for production)

### Local Development

```bash
cd core
npm install
npm run dev
```

### Testing

```bash
npm test
npm run test:integration
```

## Configuration

Environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | WebSocket port | 8080 |
| `API_PORT` | REST API port | 3000 |
| `REDIS_URL` | Redis connection | localhost:6379 |
| `DATABASE_URL` | PostgreSQL connection | - |
| `LOG_LEVEL` | Logging verbosity | info |

## Deployment

See [Infrastructure](../infrastructure/) for deployment options:
- Docker
- Kubernetes
- Terraform (AWS, GCP, Azure)

## See Also

- [Architecture Documentation](../docs/architecture/README.md)
- [Protocol Specification](../docs/protocol/PROTOCOL_SPECIFICATION.md)
- [API Reference](../docs/api/README.md)
