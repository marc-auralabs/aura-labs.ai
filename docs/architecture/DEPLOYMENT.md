# AURA Core Deployment Architecture

## Overview

This document describes the deployment architecture for AURA Core, optimized for a solo founder/small team using Railway as the primary platform.

## Why Railway

- **Zero DevOps**: Push to GitHub, it deploys
- **Integrated databases**: Postgres, Redis with one click
- **WebSocket support**: Native, no configuration needed
- **Autoscaling**: Handles traffic spikes automatically
- **Cost-effective**: ~$5-50/month for dev, scales with usage
- **No Kubernetes**: Focus on building, not infrastructure

## Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Railway Project                         │
│                        "aura-core-dev"                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   core-api      │  │   core-worker   │  │   intent-svc    │ │
│  │                 │  │                 │  │                 │ │
│  │ • REST API      │  │ • Session mgmt  │  │ • Granite LLM   │ │
│  │ • WebSocket     │  │ • Market forming│  │ • Intent parse  │ │
│  │ • HATEOAS       │  │ • Protocol exec │  │ • Clarification │ │
│  │                 │  │                 │  │                 │ │
│  │ Port: 3000      │  │ Internal only   │  │ Internal only   │ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘ │
│           │                    │                    │          │
│           └────────────────────┼────────────────────┘          │
│                                │                               │
│                                ▼                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Internal Network                      │   │
│  │              (Railway private networking)                │   │
│  └─────────────────────────────┬───────────────────────────┘   │
│                                │                               │
│           ┌────────────────────┼────────────────────┐          │
│           │                    │                    │          │
│           ▼                    ▼                    ▼          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   PostgreSQL    │  │     Redis       │  │  (Future)       │ │
│  │                 │  │                 │  │  Cassandra      │ │
│  │ • Sessions      │  │ • Pub/Sub       │  │                 │ │
│  │ • Users         │  │ • Cache         │  │ • Beacon state  │ │
│  │ • Transactions  │  │ • Rate limiting │  │ • Event log     │ │
│  │                 │  │                 │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     External Services                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   Replicate     │  │   Supabase      │  │   Cloudflare    │ │
│  │                 │  │                 │  │                 │ │
│  │ • Granite API   │  │ • Dev portal    │  │ • CDN           │ │
│  │ • LLM fallback  │  │ • Auth          │  │ • DDoS protect  │ │
│  │                 │  │ • API keys DB   │  │ • SSL           │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Services Breakdown

### 1. core-api (Public-facing)

The main entry point for Scouts and Beacons.

**Responsibilities:**
- REST API with HATEOAS
- WebSocket connections for real-time updates
- Authentication/authorization
- Request routing to internal services

**Tech stack:**
- Node.js + Fastify (or Scala + Akka HTTP later)
- WebSocket support built-in

**Environment variables:**
```
PORT=3000
DATABASE_URL=${POSTGRES_URL}
REDIS_URL=${REDIS_URL}
INTENT_SERVICE_URL=http://intent-svc.railway.internal:3001
WORKER_SERVICE_URL=http://core-worker.railway.internal:3002
JWT_SECRET=${RAILWAY_SECRET}
```

### 2. core-worker (Internal)

Handles session lifecycle and protocol execution.

**Responsibilities:**
- Session state management
- Market formation
- Protocol enforcement
- Beacon matching

**Tech stack:**
- Node.js or Scala/Akka (actor model fits well here)
- Communicates via Redis pub/sub

**Environment variables:**
```
DATABASE_URL=${POSTGRES_URL}
REDIS_URL=${REDIS_URL}
INTENT_SERVICE_URL=http://intent-svc.railway.internal:3001
```

### 3. intent-svc (Internal)

Handles natural language intent extraction.

**Responsibilities:**
- Parse Scout intent to structured format
- Tiered LLM routing (Granite → fallback → clarification)
- Confidence scoring

**Tech stack:**
- Python (better ML ecosystem) or Node.js
- Calls Replicate API for Granite

**Environment variables:**
```
REPLICATE_API_TOKEN=${REPLICATE_TOKEN}
FALLBACK_LLM_API_KEY=${ANTHROPIC_API_KEY}
CONFIDENCE_THRESHOLD=0.85
```

### 4. PostgreSQL (Managed by Railway)

**Tables:**
- `sessions` - Active and historical sessions
- `transactions` - Completed transactions
- `beacon_registrations` - Registered Beacons and capabilities
- `scout_profiles` - Scout metadata

### 5. Redis (Managed by Railway)

**Uses:**
- Pub/Sub for internal service communication
- Session cache for fast lookups
- Rate limiting counters
- WebSocket connection state

## Deployment Flow

```
Developer pushes to GitHub
         │
         ▼
┌─────────────────────────┐
│   Railway detects push  │
│   (GitHub integration)  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Build each service    │
│   (Dockerfile or        │
│    auto-detected)       │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Health checks pass    │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Traffic shifts to     │
│   new deployment        │
│   (zero downtime)       │
└─────────────────────────┘
```

## Repository Structure

```
aura-core/
├── services/
│   ├── core-api/
│   │   ├── src/
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── railway.json
│   │
│   ├── core-worker/
│   │   ├── src/
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   └── railway.json
│   │
│   └── intent-svc/
│       ├── src/
│       ├── requirements.txt
│       ├── Dockerfile
│       └── railway.json
│
├── shared/
│   ├── schemas/           # JSON schemas
│   ├── proto/             # Protocol definitions
│   └── types/             # Shared TypeScript types
│
├── migrations/
│   └── postgres/          # Database migrations
│
├── railway.toml           # Railway project config
└── README.md
```

## Railway Configuration

### railway.toml (root)
```toml
[project]
name = "aura-core-dev"

[environments.dev]
[environments.production]
```

### services/core-api/railway.json
```json
{
  "build": {
    "builder": "dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "on_failure"
  }
}
```

## Estimated Costs (Dev Environment)

| Service | Railway Cost | Notes |
|---------|--------------|-------|
| core-api | ~$5/mo | Small instance, low traffic |
| core-worker | ~$5/mo | Small instance |
| intent-svc | ~$5/mo | Small instance |
| PostgreSQL | ~$5/mo | 1GB included |
| Redis | ~$5/mo | 100MB included |
| **Subtotal** | **~$25/mo** | Railway services |
| Replicate (Granite) | ~$10-20/mo | Pay per inference |
| **Total** | **~$35-45/mo** | Full dev environment |

## Getting Started

### Step 1: Create Railway Project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create new project
railway init
```

### Step 2: Add Services

```bash
# In Railway dashboard or CLI:
railway add --service core-api
railway add --service core-worker
railway add --service intent-svc
railway add --database postgres
railway add --database redis
```

### Step 3: Connect GitHub

1. Go to Railway dashboard
2. Connect GitHub repo
3. Map branches to environments:
   - `main` → production
   - `develop` → dev

### Step 4: Set Environment Variables

In Railway dashboard, set variables for each service (see above).

### Step 5: Deploy

```bash
git push origin main
# Railway automatically deploys
```

### Step 6: Custom Domain

1. In Railway dashboard → Settings → Domains
2. Add `api.aura-labs.ai`
3. Update DNS CNAME to Railway-provided value

## Monitoring

Railway provides built-in:
- **Logs**: Real-time log streaming
- **Metrics**: CPU, memory, network
- **Alerts**: Set up via integrations (Slack, email)

For more detailed monitoring, add:
- **Sentry** for error tracking
- **Axiom** or **Datadog** for advanced observability

## Scaling Path

```
Solo founder (now)          Small team              Growth
─────────────────────────────────────────────────────────────
Railway (simple)     →      Railway (scaled)   →   Kubernetes
Single region        →      Multi-region       →   Global
$35-45/mo            →      $100-300/mo        →   $1000+/mo
```

When you need to migrate to Kubernetes:
- Services are already containerized (Dockerfiles)
- Environment variables are externalized
- Databases can migrate to managed services (RDS, Cloud SQL)

## Next Steps

1. [ ] Create Railway account and project
2. [ ] Set up GitHub repo with service structure
3. [ ] Create core-api skeleton with health check
4. [ ] Add PostgreSQL and Redis
5. [ ] Deploy first version
6. [ ] Add intent-svc with Replicate integration
7. [ ] Add core-worker with session management
8. [ ] Connect custom domain
