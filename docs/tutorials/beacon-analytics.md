# Beacon Analytics Tutorial

## Overview

Understanding your Beacon's performance is critical to growing your business on Aura Labs. Analytics help you track session activity, measure offer performance, analyze Scout intent patterns, and identify optimization opportunities.

Unlike built-in analytics dashboards, the Beacon SDK gives you the flexibility to instrument your own analytics layer. This tutorial teaches you how to track key metrics, build a conversion funnel, and generate insights from your Beacon's activity.

**Key insights you'll gain:**
- How many Scouts are viewing your offers and at what acceptance rate
- What products and price points resonate most
- Which keywords and intents drive the highest conversion
- Where your conversion funnel leaks and how to improve it

## What You'll Learn

- How to track session activity (sessions seen, matched, skipped)
- How to measure offer metrics (submissions, acceptances, pricing)
- How to build a conversion funnel from sessions to fulfilled transactions
- How to analyze Scout intent patterns from raw intent data
- How to measure pricing effectiveness across different offers
- How to build a lightweight metrics dashboard with periodic reporting
- Best practices for analytics instrumentation

## Prerequisites

- Node.js 18+ installed
- A registered Beacon with valid credentials
- Familiarity with the Beacon SDK (see beacon-registration.md)
- Basic understanding of async/await and event handlers

## Estimated Time

~45 minutes

---

## Step 1: Track Session Activity

Every session represents a Scout viewing your offer. Start by counting sessions and categorizing them.

```javascript
import { createBeacon } from '@aura-labs/beacon';
import * as fs from 'fs';

const beacon = createBeacon({
  externalId: 'my-store-001',
  name: 'My Store',
  description: 'Analytics-enabled storefront',
  coreUrl: process.env.AURA_CORE_URL || 'https://aura-labsai-production.up.railway.app',
});

// Analytics state
const analytics = {
  sessions: {
    seen: 0,
    matched: 0,
    skipped: 0
  },
  offers: {
    submitted: 0,
    accepted: 0
  }
};

beacon.onSession(async (session) => {
  analytics.sessions.seen++;
  console.log(`Session ${session.sessionId}: "${session.intent.raw}"`);

  // Log to file for audit trail
  fs.appendFileSync('analytics.jsonl',
    JSON.stringify({ type: 'session_seen', sessionId: session.sessionId, intent: session.intent.raw, timestamp: new Date() }) + '\n'
  );
});

await beacon.register();
await beacon.startPolling();
```

## Step 2: Track Offer Metrics

Monitor every offer you submit and track acceptance rates.

```javascript
beacon.beforeOffer(async (session, proposedOffer) => {
  analytics.sessions.matched++;
  // Modify offer logic here if needed
  return proposedOffer;
});

beacon.onOfferAccepted(async (transaction) => {
  analytics.offers.accepted++;
  const revenue = transaction.offer.totalPrice;

  fs.appendFileSync('analytics.jsonl',
    JSON.stringify({
      type: 'offer_accepted',
      transactionId: transaction.transactionId,
      product: transaction.offer.product.name,
      quantity: transaction.offer.quantity,
      unitPrice: transaction.offer.unitPrice,
      revenue: revenue,
      timestamp: new Date()
    }) + '\n'
  );
});

// In your offer submission logic:
const submitOffer = async (session, offer) => {
  await beacon.submitOffer(session.sessionId, offer);
  analytics.offers.submitted++;

  fs.appendFileSync('analytics.jsonl',
    JSON.stringify({
      type: 'offer_submitted',
      sessionId: session.sessionId,
      product: offer.product.name,
      unitPrice: offer.unitPrice,
      timestamp: new Date()
    }) + '\n'
  );
};
```

## Step 3: Measure Conversion Funnel

Track how Scouts move through your conversion funnel.

```javascript
const funnel = {
  sessions_seen: 0,
  offers_made: 0,
  offers_accepted: 0,
  transactions_fulfilled: 0,
  transactions_completed: 0
};

beacon.onSession(async (session) => {
  funnel.sessions_seen++;
});

const submitOffer = async (session, offer) => {
  await beacon.submitOffer(session.sessionId, offer);
  funnel.offers_made++;
};

beacon.onOfferAccepted(async (transaction) => {
  funnel.offers_accepted++;
});

// Register transaction update handler separately (not nested inside other handlers)
beacon.onTransactionUpdate(async (event) => {
  if (event.status === 'fulfilled') {
    funnel.transactions_fulfilled++;
  }
  if (event.status === 'completed') {
    funnel.transactions_completed++;
  }
});

const reportFunnel = () => {
  const conversionRate = funnel.sessions_seen > 0
    ? ((funnel.offers_accepted / funnel.sessions_seen) * 100).toFixed(2)
    : 0;

  console.log('\n=== Conversion Funnel ===');
  console.log(`Sessions Seen: ${funnel.sessions_seen}`);
  console.log(`Offers Made: ${funnel.offers_made}`);
  console.log(`Offers Accepted: ${funnel.offers_accepted}`);
  console.log(`Conversion Rate: ${conversionRate}%`);
};
```

## Step 4: Analyze Intent Patterns

Extract keywords from Scout intents to understand what they're searching for.

```javascript
const intentKeywords = new Map(); // word -> count

const extractKeywords = (intent) => {
  const words = intent.toLowerCase().split(/\s+/);
  words.forEach(word => {
    const cleaned = word.replace(/[^\w-]/g, '');
    if (cleaned.length > 2) {
      intentKeywords.set(cleaned, (intentKeywords.get(cleaned) || 0) + 1);
    }
  });
};

beacon.onSession(async (session) => {
  extractKeywords(session.intent.raw);
});

const reportIntents = () => {
  const sorted = Array.from(intentKeywords.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  console.log('\n=== Top Intent Keywords ===');
  sorted.forEach(([keyword, count]) => {
    console.log(`${keyword}: ${count} occurrences`);
  });
};
```

## Step 5: Track Pricing Effectiveness

Understand which price points drive acceptance.

```javascript
const priceAnalysis = new Map(); // pricePoint -> { submitted, accepted }

const trackPricePoint = (offer, accepted = false) => {
  const pricePoint = offer.unitPrice;
  if (!priceAnalysis.has(pricePoint)) {
    priceAnalysis.set(pricePoint, { submitted: 0, accepted: 0 });
  }
  const stats = priceAnalysis.get(pricePoint);
  stats.submitted++;
  if (accepted) stats.accepted++;
};

const submitOffer = async (session, offer) => {
  await beacon.submitOffer(session.sessionId, offer);
  trackPricePoint(offer, false);
};

beacon.onOfferAccepted(async (transaction) => {
  trackPricePoint(transaction.offer, true);
});

const reportPricing = () => {
  console.log('\n=== Price Point Performance ===');
  priceAnalysis.forEach((stats, price) => {
    const rate = ((stats.accepted / stats.submitted) * 100).toFixed(1);
    console.log(`$${price}: ${stats.submitted} submitted, ${stats.accepted} accepted (${rate}%)`);
  });
};
```

## Step 6: Build a Metrics Dashboard

Create a periodic reporting system that aggregates all metrics.

```javascript
const createAnalyticsDashboard = () => {
  setInterval(() => {
    console.log('\n' + '='.repeat(50));
    console.log('BEACON ANALYTICS REPORT');
    console.log('='.repeat(50));

    reportFunnel();
    reportIntents();
    reportPricing();

    console.log('\n=== Summary ===');
    console.log(`Total Sessions: ${analytics.sessions.seen}`);
    console.log(`Offers Submitted: ${analytics.offers.submitted}`);
    console.log(`Offers Accepted: ${analytics.offers.accepted}`);
    if (analytics.offers.submitted > 0) {
      const acceptanceRate = ((analytics.offers.accepted / analytics.offers.submitted) * 100).toFixed(2);
      console.log(`Acceptance Rate: ${acceptanceRate}%`);
    }
    console.log('='.repeat(50) + '\n');
  }, 3600000); // Report every hour
};
```

## Complete Working Example

Here's a complete Beacon implementation with integrated analytics:

```javascript
import { createBeacon } from '@aura-labs/beacon';
import * as fs from 'fs';

const beacon = createBeacon({
  externalId: 'analytics-store-001',
  name: 'Analytics Store',
  description: 'Full-featured store with analytics instrumentation',
  coreUrl: process.env.AURA_CORE_URL || 'https://aura-labsai-production.up.railway.app',
  capabilities: {
    products: ['electronics', 'accessories', 'office supplies'],
    maxOrder: 100,
    deliveryDays: 5,
  },
});

// Analytics collections
const analytics = {
  sessions: { seen: 0, matched: 0 },
  offers: { submitted: 0, accepted: 0, revenue: 0 },
  funnel: { sessions: 0, offers_made: 0, offers_accepted: 0 },
  intents: new Map(),
  prices: new Map()
};

const logEvent = (event) => {
  fs.appendFileSync('beacon-analytics.jsonl',
    JSON.stringify({ ...event, timestamp: new Date().toISOString() }) + '\n'
  );
};

beacon.onSession(async (session) => {
  analytics.sessions.seen++;
  analytics.funnel.sessions++;

  // Extract intent keywords
  session.intent.raw.toLowerCase().split(/\s+/).forEach(word => {
    const cleaned = word.replace(/[^\w-]/g, '');
    if (cleaned.length > 2) {
      analytics.intents.set(cleaned, (analytics.intents.get(cleaned) || 0) + 1);
    }
  });

  logEvent({ type: 'session_view', sessionId: session.sessionId, intent: session.intent.raw });
});

beacon.beforeOffer(async (session, offer) => {
  analytics.sessions.matched++;
  return offer;
});

const submitOffer = async (session, offer) => {
  await beacon.submitOffer(session.sessionId, offer);
  analytics.offers.submitted++;
  analytics.funnel.offers_made++;

  // Track price point
  const price = offer.unitPrice;
  if (!analytics.prices.has(price)) {
    analytics.prices.set(price, { submitted: 0, accepted: 0 });
  }
  analytics.prices.get(price).submitted++;

  logEvent({ type: 'offer_submitted', sessionId: session.sessionId, price, product: offer.product.name });
};

beacon.onOfferAccepted(async (transaction) => {
  analytics.offers.accepted++;
  analytics.funnel.offers_accepted++;
  const revenue = transaction.offer.totalPrice;
  analytics.offers.revenue += revenue;

  // Update price tracking
  const price = transaction.offer.unitPrice;
  if (analytics.prices.has(price)) {
    analytics.prices.get(price).accepted++;
  }

  logEvent({
    type: 'offer_accepted',
    transactionId: transaction.transactionId,
    revenue,
    price: transaction.offer.unitPrice
  });
});

const reportAnalytics = () => {
  const acceptanceRate = analytics.offers.submitted > 0
    ? ((analytics.offers.accepted / analytics.offers.submitted) * 100).toFixed(2)
    : 0;

  console.log('\n' + '='.repeat(50));
  console.log('BEACON ANALYTICS REPORT');
  console.log('='.repeat(50));
  console.log(`Sessions: ${analytics.funnel.sessions} | Offers: ${analytics.offers.submitted} | Accepted: ${analytics.offers.accepted}`);
  console.log(`Acceptance Rate: ${acceptanceRate}% | Revenue: $${analytics.offers.revenue.toFixed(2)}`);
  console.log('='.repeat(50) + '\n');
};

setInterval(reportAnalytics, 3600000); // Report hourly

await beacon.register();
await beacon.startPolling();
```

## Best Practices

**1. Log Everything to Files**
Use JSONL format for machine-readable audit trails. Each line is a complete JSON event.

**2. Use Structured Events**
Always include `type`, `timestamp`, and relevant IDs. This makes querying and debugging easier.

**3. Separate Metrics from Business Logic**
Keep analytics in a separate module. Don't let instrumentation clutter your offer logic.

**4. Review Metrics Weekly**
Set up recurring report intervals (hourly/daily) and review trends. Look for drops in acceptance rates or shifts in intent keywords.

**5. Correlate Multiple Metrics**
Connect pricing changes to acceptance rate changes. Link intent patterns to offer performance. Use JSONL logs to do historical analysis.

## Troubleshooting

**Q: My analytics numbers look wrong**
A: Check your JSONL log file format. Ensure each line is valid JSON. Use `cat beacon-analytics.jsonl | jq .` to validate.

**Q: High sessions but low offers submitted**
A: Your `beforeOffer` handler may be filtering too many sessions. Review your offer logic and thresholds.

**Q: Acceptance rate is low**
A: Analyze your price points and intent keywords. Are you offering products that match Scout intents? Try adjusting pricing based on price point analysis.

**Q: Missing transaction updates**
A: Ensure you've registered `onTransactionUpdate` handler. Polling must be active with `startPolling()`.

## Next Steps

- **beacon-pricing.md** – Learn to dynamically adjust prices based on acceptance rate trends
- **beacon-transactions.md** – Master the complete transaction lifecycle and fulfillment flow
- **Advanced:** Build a real analytics dashboard by parsing JSONL logs and creating visualizations

---

**Questions?** Reach out to hello@aura-labs.ai
