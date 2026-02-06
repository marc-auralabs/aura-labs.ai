# Beacon SDK Documentation

Build selling agents that connect your inventory to the AURA ecosystem.

## What is a Beacon?

A Beacon is a selling agent that:
- Signals willingness to participate in markets
- Receives anonymized buyer intent
- Responds with propositions (offerings)
- Negotiates pricing dynamically
- Processes transactions

Beacons integrate into seller systems: e-commerce platforms, ERP systems, inventory management, booking systems.

## Quick Start

### Installation

```bash
npm install @aura-labs/beacon-sdk
```

### Basic Usage

```javascript
import { Beacon } from '@aura-labs/beacon-sdk';

// Initialize Beacon
const beacon = new Beacon({
  apiKey: process.env.AURA_API_KEY,
  merchantName: 'My Store',
  category: 'electronics'
});

// Connect to AURA Core
await beacon.connect();

// Register propositions (your inventory)
beacon.registerPropositions([
  {
    id: 'sku-123',
    name: 'Wireless Headphones Pro',
    category: 'electronics',
    priceRange: { min: 250, max: 350 },
    available: true
  }
]);

// Handle Scout inquiries
beacon.on('inquiry', async (inquiry) => {
  const matches = beacon.matchInventory(inquiry.intent);
  return matches;
});

// Handle negotiation
beacon.on('negotiation', async (request) => {
  const price = calculatePrice(request);
  return beacon.makeOffer(request.id, price);
});

// Handle transactions
beacon.on('transaction', async (transaction) => {
  await processOrder(transaction);
  return beacon.confirmTransaction(transaction.id);
});
```

## Core Concepts

### Propositions

A proposition is an offering you're willing to sell:

```javascript
const proposition = {
  id: 'your-sku',              // Your internal identifier
  name: 'Product Name',
  category: 'electronics',
  description: 'Detailed description',
  priceRange: {
    min: 90,                   // Lowest you'll accept
    max: 120,                  // List price
    currency: 'USD'
  },
  available: true,
  stock: 50,                   // Optional, for your tracking
  attributes: {
    color: 'black',
    size: 'medium',
    features: ['wireless', 'ANC']
  },
  fulfillment: {
    shippingOptions: [
      { method: 'standard', days: 5, price: 0 },
      { method: 'express', days: 2, price: 15 }
    ],
    locations: ['US', 'CA', 'UK']
  }
};
```

### Inventory Management

Keep AURA in sync with your inventory:

```javascript
// Initial load
beacon.registerPropositions(yourInventory.map(toProposition));

// Real-time updates
yourInventory.on('change', (item) => {
  beacon.updateProposition(item.id, {
    available: item.stock > 0,
    stock: item.stock
  });
});

// Bulk update
beacon.syncInventory(getCurrentInventory());
```

### Inquiry Handling

When a Scout is looking for something you might have:

```javascript
beacon.on('inquiry', async (inquiry) => {
  // inquiry contains:
  // - intent: what they're looking for
  // - behavioralData: anonymized buyer context
  // - constraints: their requirements

  // Search your inventory
  const matches = searchInventory(inquiry.intent);

  // Filter by constraints
  const filtered = matches.filter(item =>
    item.price <= inquiry.constraints.priceRange.max
  );

  // Return matching propositions
  return filtered.map(item => ({
    propositionId: item.id,
    name: item.name,
    priceRange: item.priceRange,
    available: true
  }));
});
```

### Dynamic Pricing

Price based on context, not identity:

```javascript
beacon.on('negotiation', async (request) => {
  const { propositionId, behavioralData, constraints } = request;

  const item = getItem(propositionId);
  let price = item.basePrice;
  let discount = 0;
  const incentives = [];

  // Loyalty pricing (based on behavior, not identity)
  if (behavioralData.loyaltyIndicators?.repeatCustomer) {
    discount += 10;
    incentives.push({
      type: 'loyalty',
      description: '10% returning customer discount'
    });
  }

  // Inventory-based pricing
  if (item.stock > 100) {
    discount += 5;
    incentives.push({
      type: 'overstock',
      description: '5% inventory clearance'
    });
  }

  // Meet their constraints if possible
  if (constraints.maxPrice && price * (1 - discount/100) > constraints.maxPrice) {
    // Can we meet their budget?
    const maxDiscount = ((price - constraints.maxPrice) / price) * 100;
    if (maxDiscount <= 20) { // Our maximum allowed discount
      discount = maxDiscount;
    }
  }

  const finalPrice = price * (1 - discount / 100);

  return beacon.makeOffer(request.id, {
    price: finalPrice,
    discount,
    incentives,
    validFor: 300000 // 5 minutes
  });
});
```

### Transaction Processing

When a deal is accepted:

```javascript
beacon.on('transaction', async (transaction) => {
  // NOW you receive buyer identity for fulfillment
  const { identity, shippingAddress, paymentMethod } = transaction;

  try {
    // Reserve inventory
    await reserveStock(transaction.propositionId);

    // Create order in your system
    const order = await createOrder({
      customer: identity,
      items: [{ sku: transaction.propositionId, price: transaction.price }],
      shipping: shippingAddress
    });

    // Process payment
    await processPayment(paymentMethod, transaction.price);

    // Confirm with AURA
    return beacon.confirmTransaction(transaction.id, {
      orderId: order.id,
      estimatedDelivery: order.deliveryDate,
      trackingAvailable: true
    });

  } catch (error) {
    // Release inventory and report failure
    await releaseStock(transaction.propositionId);
    return beacon.failTransaction(transaction.id, error.message);
  }
});
```

## API Reference

### Beacon Class

#### Constructor

```javascript
new Beacon(config)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `apiKey` | string | AURA API key |
| `merchantName` | string | Your business name |
| `category` | string | Primary category |
| `subcategories` | string[] | Additional categories |

#### Methods

| Method | Description |
|--------|-------------|
| `connect()` | Connect to AURA Core |
| `disconnect()` | Disconnect |
| `registerPropositions(items)` | Register inventory |
| `updateProposition(id, updates)` | Update single item |
| `syncInventory(items)` | Full inventory sync |
| `makeOffer(requestId, offer)` | Make pricing offer |
| `confirmTransaction(txId, details)` | Confirm transaction |
| `failTransaction(txId, reason)` | Report failure |

#### Events

| Event | Description |
|-------|-------------|
| `connected` | Connected to AURA Core |
| `registered` | Beacon registered |
| `inquiry` | Scout inquiry received |
| `negotiation` | Negotiation request |
| `transaction` | Transaction to process |
| `error` | Error occurred |

## Best Practices

### Inventory

- Keep propositions in sync with actual inventory
- Update availability in real-time
- Handle out-of-stock gracefully

### Pricing

- Set realistic price ranges
- Don't discriminate based on identity (you don't have it)
- Use behavioral data ethically

### Reliability

- Handle AURA Core disconnections
- Implement idempotent transaction handling
- Log all transactions for reconciliation

## Integration Guides

- [Shopify Integration](../integration-guides/shopify.md)
- [WooCommerce Integration](../integration-guides/woocommerce.md)
- [Custom Platform Guide](../integration-guides/custom-ecommerce.md)

## Examples

See [Beacon Implementations](../../beacons/) for:
- Simple Beacon (learning/prototyping)
- Retail Beacon (e-commerce)
- Travel Beacon (hospitality)
- Service Beacon (appointments)

## See Also

- [Protocol Specification](../protocol/PROTOCOL_SPECIFICATION.md)
- [API Reference](../api/README.md)
- [Tutorials](../tutorials/README.md)
