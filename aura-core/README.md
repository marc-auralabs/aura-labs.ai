# AURA Core

Backend services for the AURA (Agent Universal Resource Architecture) platform — Infrastructure for Agentic Commerce.

## Architecture

```
aura-core/
├── services/
│   ├── core-api/        # REST API + WebSocket gateway (public)
│   ├── core-worker/     # Session management, protocol execution (internal)
│   └── intent-svc/      # Natural language intent parsing (internal)
├── shared/
│   └── schemas/         # Shared JSON schemas
└── migrations/
    └── postgres/        # Database migrations
```

## Quick Start (Local Development)

```bash
cd services/core-api
npm install
npm run dev
```

Visit http://localhost:3000 to see the HATEOAS API root.

## Deploy to Railway

### Step 1: Create Railway Account

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub

### Step 2: Create New Project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project (run from aura-core directory)
railway init
```

Or use the Railway dashboard:
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose your repository
4. Select the `aura-core` directory

### Step 3: Add Services

In Railway dashboard:

1. Click "+ New" → "Database" → "PostgreSQL"
2. Click "+ New" → "Database" → "Redis"
3. Click "+ New" → "GitHub Repo" → Select `services/core-api`

### Step 4: Configure Environment Variables

For `core-api` service, add these variables (Railway auto-fills database URLs):

```
PORT=3000
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
```

### Step 5: Add Custom Domain

1. Go to core-api service → Settings → Domains
2. Click "Generate Domain" for a railway.app subdomain
3. Or add your custom domain: `api.aura-labs.ai`

## API Endpoints

### Root (HATEOAS entry point)
```
GET /
```

### Health Check
```
GET /health
GET /health/ready
```

### Scouts
```
POST /scouts/register
WS   /ws/scout
```

### Beacons
```
POST /beacons/register
WS   /ws/beacon
```

### Sessions
```
POST /sessions          # Create new session with intent
GET  /sessions/:id      # Get session status
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | No (default: 3000) |
| `NODE_ENV` | Environment | No (default: development) |
| `DATABASE_URL` | PostgreSQL connection string | Yes (for production) |
| `REDIS_URL` | Redis connection string | Yes (for production) |
| `INTENT_SERVICE_URL` | Intent parsing service URL | No |
| `WORKER_SERVICE_URL` | Worker service URL | No |

## Development

### Run locally
```bash
cd services/core-api
npm install
npm run dev
```

### Test endpoints
```bash
# Health check
curl http://localhost:3000/health

# API root
curl http://localhost:3000/

# Create session
curl -X POST http://localhost:3000/sessions \
  -H "Content-Type: application/json" \
  -d '{"intent": "I want 500 widgets, max $100 each"}'
```

### WebSocket test
```javascript
const ws = new WebSocket('ws://localhost:3000/ws/scout');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

## License

Business Source License 1.1 - See LICENSE file.
