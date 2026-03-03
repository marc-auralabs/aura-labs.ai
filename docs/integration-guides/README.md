# AURA Integration Guides

Platform-specific guides for integrating AURA into existing merchant systems.

## E-commerce Platforms

### Shopify
- [Shopify Integration Guide](./shopify.md)
- Install the AURA Beacon plugin for Shopify
- Sync products as Beacon capabilities
- Process AURA transactions as Shopify orders
- Report fulfillment back to AURA Core

### WooCommerce
- [WooCommerce Integration Guide](./woocommerce.md)
- WordPress plugin installation
- Product catalog sync
- Order management

### Custom E-commerce
- [Custom Platform Guide](./custom-ecommerce.md)
- Direct SDK integration
- Inventory validation hooks
- Transaction lifecycle handling

## Enterprise Systems

### ERP Integration
- SAP integration patterns
- Oracle NetSuite connectivity
- Microsoft Dynamics sync

### Inventory Management
- Real-time stock validation via `beforeOffer` hooks
- Multi-warehouse support
- Low-stock handling with policy enforcement

### Payment Providers
- [Payment Integration Guide](./payment-providers.md)
- Stripe integration via `PUT /transactions/:id/payment`
- PayPal support
- Custom payment flows

## Integration Patterns

### Pattern 1: Direct SDK Integration

Best for custom-built platforms with development resources.

```javascript
import { createBeacon } from '@aura-labs/beacon';

const beacon = createBeacon({
  externalId: 'my-store-001',
  name: 'My Store',
  endpointUrl: 'https://mystore.com/webhooks/aura',
  capabilities: {
    category: 'electronics',
    products: ['headphones', 'speakers', 'microphones'],
    features: ['next-day delivery', '30-day returns'],
  },
});

// Enforce business rules
beacon.registerPolicies({
  minPrice: 10,
  maxQuantityPerOrder: 100,
  maxDeliveryDays: 14,
  deliveryRegions: ['US', 'CA', 'UK'],
});

// Validate inventory before committing to offers
beacon.beforeOffer(async (session, offer) => {
  const stock = await yourInventory.check(offer.product.sku);
  if (stock < offer.quantity) {
    throw new Error(`Only ${stock} units available`);
  }
});

// Handle committed transactions
beacon.onOfferAccepted(async (transaction) => {
  await yourSystem.createOrder(transaction);
});
```

### Pattern 2: Plugin/Extension

Best for platforms with extension ecosystems (Shopify, WooCommerce).

- Install official AURA plugin
- Configure capabilities through admin interface
- Automatic session handling and offer submission
- Fulfillment synced via webhooks

### Pattern 3: Middleware

Best for complex enterprise environments.

- Deploy AURA adapter service
- Connect to existing systems via APIs
- Centralized configuration and policy management

## Common Integration Tasks

### 1. Register Your Beacon

Declare what you sell — AURA matches sessions to your capabilities:

```javascript
const beacon = createBeacon({
  externalId: 'your-store-id',
  name: 'Your Store Name',
  endpointUrl: 'https://yourstore.com/webhooks/aura',
  capabilities: {
    category: 'coffee',
    products: ['organic coffee', 'espresso', 'cold brew'],
    features: ['free shipping', 'subscription available'],
    priceRange: '£5-£35 per bag',
  },
});

await beacon.register();
```

### 2. Respond to Sessions

Poll for matching sessions and submit offers dynamically:

```javascript
beacon.onSession(async (session, beacon) => {
  const intent = session.intent;
  const matchingProducts = searchInventory(intent.raw);

  if (matchingProducts.length > 0) {
    const product = matchingProducts[0];
    await beacon.submitOffer(session.sessionId, {
      product: { name: product.name, sku: product.sku },
      unitPrice: product.price,
      quantity: intent.parsed?.quantity?.amount || 1,
      currency: 'GBP',
      deliveryDate: calculateDeliveryDate(product),
    });
  }
});

await beacon.startPolling();
```

### 3. Fulfillment Tracking

Report order progress back to AURA Core:

```javascript
// When you ship the order
await beacon.updateFulfillment(transactionId, {
  fulfillmentStatus: 'shipped',
  fulfillmentReference: 'TRACK-12345',
});

// When the order is delivered — auto-transitions to 'fulfilled'
await beacon.updateFulfillment(transactionId, {
  fulfillmentStatus: 'delivered',
});
```

### 4. Payment Confirmation

Report payment via the REST API:

```bash
curl -X PUT https://aura-labsai-production.up.railway.app/transactions/{id}/payment \
  -H "Content-Type: application/json" \
  -d '{"paymentStatus": "charged", "paymentReference": "pi_xxx"}'
```

When payment is charged and the order has been delivered, the transaction auto-transitions to `completed`.

## Transaction Lifecycle

```
committed → shipped → delivered (→ fulfilled) → charged (→ completed)
```

Each state change dispatches a webhook to your `endpointUrl` with the event type and transaction details.

## Testing Your Integration

1. **Local Testing**: Run AURA Core locally (`node src/index.js` in `aura-core/services/core-api/`)
2. **Railway Deployment**: Test against `https://aura-labsai-production.up.railway.app`
3. **Demo Script**: Run `./demo.sh` for a full end-to-end walkthrough

## Support

- [GitHub Issues](https://github.com/aura-labs/aura-framework/issues)
- [Integration Examples](../../examples/README.md)
- [API Reference](../api/README.md)
- [Beacon SDK Documentation](../beacon/README.md)
- [Transaction Tutorial](../tutorials/beacon-transactions.md)
