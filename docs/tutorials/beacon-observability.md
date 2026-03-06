# Observability: Monitoring Your Beacon and Scout

## Overview

When you deploy a Beacon or Scout into production, you need to know what's happening inside it. Which sessions arrived? How long did offer submission take? Which validators are rejecting? What's your acceptance rate over time?

The AURA SDKs include a built-in activity logger that records every action your agent takes as a structured event — with timestamps, durations, correlation IDs, and outcome metadata. No external dependencies required; it works out of the box.

This tutorial covers how to use the activity logger on both the Beacon (seller) and Scout (buyer) sides, how to integrate with external logging systems, and how to build a real-time operations view.

**What you get without writing any code:**
- Every lifecycle event (registration, polling, sessions, offers, fulfillment) is recorded automatically
- Request-level timing with correlation IDs that trace through to Core API
- Running counters for sessions, offers, acceptance rate, and request latency
- In-memory event buffer you can query with filters

## What You'll Learn

- How to access summary stats from your Beacon or Scout
- How to subscribe to real-time activity events
- How to query the event log with filters
- How to connect to pino, winston, or any external logger
- How to correlate Beacon/Scout activity with Core API logs
- How to build a lightweight operations dashboard

## Prerequisites

- Node.js 18+ installed
- Familiarity with Beacon basics (see beacon-basics.md)
- A running Beacon or Scout (even in local dev mode)

## Estimated Time

~30 minutes

---

## Step 1: Activity Is Already On

Every Beacon and Scout automatically records activity events from the moment you create them. No opt-in required.

```javascript
import { createBeacon } from '@aura-labs/beacon';

const beacon = createBeacon({
  externalId: 'observable-store-001',
  name: 'Observable Store',
  description: 'Store with built-in observability',
  coreUrl: process.env.AURA_CORE_URL || 'https://aura-labsai-production.up.railway.app',
});

// The activity logger is already recording
console.log(beacon.activity.getSummary());
// → { beacon: { externalId: 'observable-store-001', name: 'Observable Store' },
//     sessions: { received: 0, skipped: 0, handled: 0, handlerErrors: 0 },
//     offers: { submitted: 0, accepted: 0, ... },
//     ... }
```

The `beacon.activity` property gives you access to the `ActivityLogger` — the single source of truth for what your Beacon has done.

---

## Step 2: Get Summary Stats

After running for a while, pull aggregate stats:

```javascript
await beacon.register();
beacon.onSession(async (session) => {
  await beacon.submitOffer(session.sessionId, {
    product: { name: 'Widget', sku: 'WDG-001' },
    unitPrice: 85.00,
    quantity: 500,
  });
});
await beacon.startPolling();

// After some activity...
const stats = beacon.activity.getSummary();

console.log(`Sessions received: ${stats.sessions.received}`);
console.log(`Offers submitted: ${stats.offers.submitted}`);
console.log(`Offers accepted: ${stats.offers.accepted}`);
console.log(`Acceptance rate: ${stats.offers.acceptanceRate}%`);
console.log(`Avg request latency: ${stats.requests.avgDurationMs}ms`);
console.log(`Request failures: ${stats.requests.failed}`);
console.log(`Poll cycles: ${stats.polls.cycles}`);
```

The summary includes:
- **sessions** — received, skipped, handled, handler errors
- **offers** — submitted, accepted, validation failures, submission failures, acceptance rate
- **polls** — total cycles, errors
- **requests** — total, succeeded, failed, average duration
- **fulfillment** — updates sent, failures

---

## Step 3: Subscribe to Real-Time Events

Listen for specific events as they happen:

```javascript
// Track every offer submission
beacon.activity.on('offer.submitted', (event) => {
  console.log(`[${event.timestamp}] Offer submitted to session ${event.sessionId}`);
  console.log(`  Duration: ${event.durationMs}ms`);
  console.log(`  Product: ${event.metadata.product}`);
  console.log(`  Price: $${event.metadata.unitPrice}`);
});

// Track errors across all event types
beacon.activity.on('*', (event) => {
  if (event.error) {
    console.error(`[ERROR] ${event.type}: ${event.error}`);
  }
});

// Track all session events using wildcard prefix
beacon.activity.on('session.*', (event) => {
  console.log(`Session event: ${event.type} - ${event.sessionId}`);
});
```

Supported listener patterns:
- `'offer.submitted'` — exact match
- `'offer.*'` — prefix wildcard (matches `offer.submitted`, `offer.accepted`, etc.)
- `'*'` — global wildcard (every event)

---

## Step 4: Query the Event Log

The activity logger keeps the last 5,000 events in memory. Query them with filters:

```javascript
// Get all offer-related events
const offerEvents = beacon.activity.getEvents({ type: 'offer.*' });

// Get events for a specific session
const sessionEvents = beacon.activity.getEvents({
  sessionId: 'session-uuid-here',
});

// Get events from the last hour
const recentEvents = beacon.activity.getEvents({
  since: new Date(Date.now() - 3600000).toISOString(),
});

// Get the last 10 errors
const errors = beacon.activity.getEvents({ type: 'request.failed', limit: 10 });

// Trace a single request using correlation ID
const trace = beacon.activity.getEvents({
  correlationId: 'request-uuid-here',
});
```

Each event includes:
- `id` — unique event ID
- `type` — event type (e.g., `offer.submitted`)
- `timestamp` — ISO 8601 timestamp
- `durationMs` — how long the operation took (for timed events)
- `correlationId` — ties request start/complete together (and to Core API)
- `sessionId` / `transactionId` — context IDs
- `success` — boolean outcome
- `error` — error message (when failed)
- `metadata` — event-specific data (product name, price, handler index, etc.)
- `beaconId`, `beaconExternalId`, `beaconName` — who generated the event

---

## Step 5: Connect an External Logger

For production, you'll want events forwarded to your logging infrastructure. Pass a `logger` option when creating your Beacon:

```javascript
import pino from 'pino';

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty', // or your production transport
  },
});

const beacon = createBeacon({
  externalId: 'prod-store-001',
  name: 'Production Store',
  coreUrl: process.env.AURA_CORE_URL,
  logger: logger, // All activity events are forwarded here
});
```

When a `logger` is set:
- Every event calls `logger.info()` with the full structured event data
- Error events call `logger.error()` instead
- The log message format is `[beacon] event.type`

This works with any logger that has `info()` and `error()` methods — pino, winston, console, or a custom adapter.

---

## Step 6: Correlate with Core API Logs

Every HTTP request from your Beacon includes an `X-Request-ID` header. This same ID appears in Core API logs, so you can trace a request from your Beacon all the way through to the database.

```javascript
// When you see a slow offer submission:
beacon.activity.on('offer.submitted', (event) => {
  if (event.durationMs > 2000) {
    console.warn(`Slow offer submission: ${event.durationMs}ms`);
    console.warn(`Correlation ID: ${event.correlationId}`);
    // Search Core API logs for this correlation ID to trace the full path
  }
});

// The request events show the correlation IDs explicitly:
beacon.activity.on('request.complete', (event) => {
  console.log(`${event.metadata.method} ${event.metadata.path} → ${event.metadata.statusCode} (${event.durationMs}ms) [${event.correlationId}]`);
});
```

In Core API logs (via Fastify/pino), every request includes the same `requestId`, so you can search:
```
requestId: "abc-123-def" → shows the exact Core handler execution
```

---

## Step 7: Scout-Side Observability

The Scout SDK has the same observability model:

```javascript
import { createScout } from '@aura-labs/scout';

const scout = createScout({
  coreUrl: process.env.AURA_CORE_URL,
  logger: myLogger, // Optional external logger
});

await scout.ready();

// Access Scout activity
const stats = scout.activity.getSummary();
// → { sessions: { created: 0, committed: 0, cancelled: 0 },
//     offers: { received: 0, evaluated: 0, committed: 0 },
//     transactions: { created: 0, fulfilled: 0, timedOut: 0 },
//     requests: { total: N, succeeded: N, failed: 0, avgDurationMs: N } }

// Listen for session events
scout.activity.on('session.committed', (event) => {
  console.log(`Committed session ${event.sessionId} in ${event.durationMs}ms`);
});

// Listen for transaction fulfillment
scout.activity.on('transaction.*', (event) => {
  console.log(`Transaction ${event.type}: ${event.transactionId}`);
});
```

Scout event types include:
- `scout.created`, `scout.ready`, `scout.registered`
- `intent.created`, `intent.failed`
- `session.created`, `session.committed`, `session.cancelled`, `session.refreshed`
- `offers.wait_complete`, `offers.wait_failed`
- `transaction.created`, `transaction.refreshed`, `transaction.wait_complete`
- `request.start`, `request.complete`, `request.failed`

---

## Step 8: Build a Periodic Status Report

Combine the summary with a periodic reporter:

```javascript
const reportInterval = setInterval(() => {
  const s = beacon.activity.getSummary();

  console.log('\n' + '='.repeat(60));
  console.log(`BEACON STATUS: ${s.beacon.name} (${s.beacon.beaconId || 'unregistered'})`);
  console.log('='.repeat(60));
  console.log(`Sessions:   ${s.sessions.received} received | ${s.sessions.handled} handled | ${s.sessions.handlerErrors} errors`);
  console.log(`Offers:     ${s.offers.submitted} submitted | ${s.offers.accepted} accepted (${s.offers.acceptanceRate}%)`);
  console.log(`Requests:   ${s.requests.total} total | ${s.requests.failed} failed | avg ${s.requests.avgDurationMs}ms`);
  console.log(`Polling:    ${s.polls.cycles} cycles | ${s.polls.errors} errors`);
  console.log(`Events:     ${s.eventsRecorded} recorded (${s.oldestEvent} → ${s.newestEvent})`);
  console.log('='.repeat(60) + '\n');
}, 60000); // Every minute

// Clean up on shutdown
process.on('SIGINT', () => {
  clearInterval(reportInterval);
  beacon.stopPolling();
  process.exit(0);
});
```

---

## Event Type Reference

### Beacon Events

| Event Type | When | Key Metadata |
|---|---|---|
| `beacon.created` | Beacon instance created | externalId, name, coreUrl |
| `beacon.registered` | Successfully registered with Core | beaconId, status |
| `beacon.registration_failed` | Registration failed | error |
| `poll.started` | Polling loop started | intervalMs |
| `poll.stopped` | Polling loop stopped | totalCycles |
| `poll.cycle` | Single poll completed | totalSessions, newSessions |
| `poll.error` | Poll cycle failed | error |
| `session.received` | New session from Core | intent, region |
| `session.handler_complete` | Handler finished processing | handlerIndex, durationMs |
| `session.handler_error` | Handler threw error | handlerIndex, error |
| `offer.validating` | Starting validator chain | validatorCount, product |
| `offer.validator_pass` | Validator passed | validatorIndex |
| `offer.validator_fail` | Validator rejected offer | validatorIndex, error |
| `offer.submitted` | Offer posted to Core | offerId, totalPrice, durationMs |
| `offer.submission_failed` | Offer post failed | error |
| `offer.accepted` | Core notified offer was committed | transactionId |
| `fulfillment.updated` | Fulfillment status reported | fulfillmentStatus |
| `request.start` | HTTP request initiated | method, path |
| `request.complete` | HTTP request succeeded | statusCode, durationMs |
| `request.failed` | HTTP request failed | statusCode, error |

### Scout Events

| Event Type | When | Key Metadata |
|---|---|---|
| `scout.created` | Scout instance created | coreUrl |
| `scout.ready` | Keys generated and registered | durationMs |
| `scout.registered` | Registered with Core | agentId |
| `intent.created` | Purchase intent submitted | sessionId, intentText |
| `session.created` | Session created from intent | sessionId, status |
| `session.committed` | Committed to an offer | transactionId, offerId |
| `session.cancelled` | Session cancelled | sessionId |
| `offers.wait_complete` | Offer polling finished | offersCount, durationMs |
| `transaction.created` | Transaction object created | status, paymentStatus |
| `transaction.refreshed` | Transaction state refreshed | fulfillmentStatus |
| `transaction.wait_complete` | Fulfillment wait finished | fulfillmentStatus |
| `request.start` | HTTP request initiated | method, path |
| `request.complete` | HTTP request succeeded | statusCode, durationMs |
| `request.failed` | HTTP request failed | statusCode, error |

---

## Best Practices

**1. Use the summary for dashboards, events for debugging.** The `getSummary()` counters are cheap aggregates. The `getEvents()` log is for drilling down into specific incidents.

**2. Set a reasonable `maxActivityEvents`.** The default (5,000) works for most cases. For high-throughput Beacons, increase it or pipe events to an external store via the logger.

**3. Forward to your logging stack in production.** Pass `logger: pinoInstance` to get structured events in your logging pipeline. This is the primary way to get observability into Datadog, Elastic, CloudWatch, etc.

**4. Use correlation IDs to trace across systems.** When investigating latency or failures, grab the `correlationId` from the SDK event and search for it in Core API logs.

**5. Monitor acceptance rate trends.** A dropping `acceptanceRate` in the summary is the earliest signal that your pricing or inventory strategy needs adjustment.

**6. Watch for handler errors.** `sessions.handlerErrors > 0` means your session handler is throwing. These are silent unless you listen for them — they don't crash your Beacon.

---

## Troubleshooting

**Q: I'm not seeing any events**
A: Events start recording on `createBeacon()` / `createScout()`. If `getSummary()` shows all zeros, your agent hasn't done anything yet. Check that `register()` and `startPolling()` are being called.

**Q: Events are being pruned too quickly**
A: Increase `maxActivityEvents` in your config: `createBeacon({ ..., maxActivityEvents: 20000 })`.

**Q: My external logger isn't receiving events**
A: Verify your logger has `.info()` and `.error()` methods. The SDK calls `logger.info(eventData, message)` using pino's API convention (object first, message second).

**Q: How do I clear the event buffer?**
A: Call `beacon.activity.clearEvents()` to clear events but keep counters, or `beacon.activity.reset()` to clear everything.

---

## Next Steps

- **beacon-analytics.md** — Build business-level analytics (conversion funnels, intent analysis)
- **beacon-pricing.md** — Monitor pricing effectiveness using activity data
- **Advanced:** Export JSONL event logs and build Grafana dashboards from activity data

---

**Questions?** Reach out to hello@aura-labs.ai
