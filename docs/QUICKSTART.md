# AURA Framework - Quick Start Guide

This guide will help you get your first Beacon up and running in under 15 minutes.

## Prerequisites

- Node.js 18 or higher
- Basic understanding of JavaScript and APIs
- A code editor (VS Code, Sublime, etc.)

## Step 1: Set Up Your Environment

```bash
# Clone the repository
git clone https://github.com/aura-labs/aura-framework.git
cd aura-framework

# Navigate to the simple beacon example
cd beacons/simple-beacon

# Install dependencies
npm install
```

## Step 2: Understand the Beacon Structure

A Beacon has five main responsibilities:

1. **Register with AURA Core** - Announce your presence in the ecosystem
2. **Manage Inventory** - Keep track of what you're offering
3. **Handle Inquiries** - Respond when Scouts are looking for products
4. **Negotiate Pricing** - Offer dynamic pricing based on behavior and constraints
5. **Process Transactions** - Complete the sale when terms are agreed

## Step 3: Configure Your Beacon

Create a `.env` file in the `beacons/simple-beacon` directory:

```bash
# Beacon identification
BEACON_ID=my-first-beacon
PORT=3000

# AURA Core connection
AURA_CORE_URL=ws://localhost:8080
AURA_API_KEY=your-api-key-here

# Merchant details
MERCHANT_NAME=My Demo Store
MERCHANT_CATEGORY=electronics
```

## Step 4: Run Your Beacon

```bash
npm start
```

You should see:

```
✓ Loaded 3 items into inventory
Connecting to AURA Core at ws://localhost:8080...
✓ Connected to AURA Core
✓ Beacon registered with AURA Core

🚀 Simple Beacon started
   Beacon ID: my-first-beacon
   Merchant: My Demo Store
   API Server: http://localhost:3000

✓ Beacon is ready to receive Scout inquiries
```

## Step 5: Test Your Beacon

Open another terminal and test the health endpoint:

```bash
curl http://localhost:3000/health
```

You should get:

```json
{
  "status": "healthy",
  "beaconId": "my-first-beacon",
  "connected": true,
  "inventory": 3,
  "activeNegotiations": 0
}
```

Check your inventory:

```bash
curl http://localhost:3000/inventory
```

## Step 6: Understand the Negotiation Flow

Let's walk through what happens when a Scout discovers your Beacon:

### 6.1 Scout Inquiry

A Scout sends an inquiry through AURA Core:

```javascript
{
  "type": "SCOUT_INQUIRY",
  "payload": {
    "scoutId": "sct_abc123",
    "inquiryId": "inq_xyz789",
    "intent": {
      "category": "electronics",
      "description": "wireless headphones",
      "keywords": ["ANC", "over-ear"]
    },
    "preferences": {
      "priceRange": { "min": 100, "max": 400 }
    },
    "behavioralData": {
      "purchaseHistory": {
        "totalPurchases": 5,
        "averageOrderValue": 350
      }
    }
  }
}
```

**Note**: The Scout's identity is abstracted - you don't know who the person is, only their shopping behavior.

### 6.2 Your Beacon Responds

Your Beacon's `handleScoutInquiry()` method:

1. Searches your inventory for matches
2. Prepares propositions (offers) with price ranges
3. Sends back available options

```javascript
{
  "type": "INQUIRY_RESPONSE",
  "payload": {
    "available": true,
    "propositions": [
      {
        "propositionId": "prop_...",
        "name": "Wireless Headphones Pro",
        "priceRange": { "min": 240, "max": 300 },
        "available": true
      }
    ]
  }
}
```

### 6.3 Negotiation

If the Scout is interested, they'll request negotiation:

```javascript
{
  "type": "NEGOTIATION_REQUEST",
  "payload": {
    "propositionId": "prop_...",
    "constraints": {
      "maxPrice": 350
    }
  }
}
```

Your Beacon's `calculateDynamicPricing()` method considers:

- **Loyalty**: Has this Scout bought from you before?
- **Inventory**: Do you need to move stock?
- **Constraints**: Can you meet their budget?

Then makes an offer:

```javascript
{
  "type": "NEGOTIATION_OFFER",
  "payload": {
    "price": 285.99,
    "discount": 15,
    "incentives": [
      {
        "type": "loyalty-discount",
        "description": "15% off for loyal customers"
      }
    ],
    "validUntil": "2025-01-15T11:00:00Z"
  }
}
```

### 6.4 Transaction

If the Scout accepts, they send a transaction request:

```javascript
{
  "type": "TRANSACTION_REQUEST",
  "payload": {
    "negotiationId": "neg_...",
    // NOW identity is revealed for fulfillment
    "userIdentity": {
      "name": "Jane Doe",
      "email": "jane@example.com"
    },
    "shippingAddress": { /* ... */ },
    "paymentMethod": { /* ... */ }
  }
}
```

Your Beacon confirms the transaction and processes the order.

## Step 7: Customize Your Beacon

### Add Your Own Products

Edit `simple-beacon.js` and modify the `loadInventory()` method:

```javascript
loadInventory() {
  const myProducts = [
    {
      name: 'My Awesome Product',
      category: 'my-category',
      basePrice: 99.99,
      stock: 100,
      description: 'The best product ever',
      features: ['feature1', 'feature2'],
    },
    // Add more products...
  ];
  
  myProducts.forEach(product => {
    const item = this.createInventoryItem(product);
    this.inventory.set(item.id, item);
  });
}
```

### Customize Pricing Strategy

Modify the `calculateDynamicPricing()` method to implement your pricing logic:

```javascript
calculateDynamicPricing(propositionId, behavioralData, constraints) {
  const item = this.inventory.get(propositionId);
  let discount = 5; // Base discount
  
  // Your custom logic here
  if (behavioralData.purchaseHistory.totalPurchases > 10) {
    discount = 20; // VIP discount
  }
  
  if (item.stock < 5) {
    discount = 0; // No discount for low stock
  }
  
  // ... more custom logic
  
  return {
    basePrice: item.basePrice,
    offeredPrice: item.basePrice * (1 - discount / 100),
    discountPercent: discount,
    incentives: [],
  };
}
```

## Step 8: Add Monitoring

The Beacon comes with basic monitoring. Access these endpoints:

```bash
# Check health
curl http://localhost:3000/health

# View inventory
curl http://localhost:3000/inventory

# View active negotiations
curl http://localhost:3000/negotiations
```

## Step 9: Deploy to Production

### Environment Variables

Set these in your production environment:

```bash
BEACON_ID=your-production-beacon-id
PORT=3000
AURA_CORE_URL=wss://api.aura-network.com
AURA_API_KEY=your-production-api-key
MERCHANT_NAME=Your Store Name
MERCHANT_CATEGORY=your-category
```

### Database Integration

Replace the in-memory `Map` objects with a real database:

```javascript
// Replace this:
this.inventory = new Map();

// With this:
this.inventory = {
  get: (id) => database.query('SELECT * FROM inventory WHERE id = ?', [id]),
  set: (id, item) => database.query('INSERT INTO inventory ...', [id, item]),
  // ... other methods
};
```

### Production Checklist

- [ ] Use environment variables for all config
- [ ] Replace in-memory storage with database
- [ ] Implement proper logging (Winston, Bunyan, etc.)
- [ ] Add error monitoring (Sentry, Rollbar, etc.)
- [ ] Set up health check monitoring
- [ ] Configure load balancing
- [ ] Enable HTTPS/WSS
- [ ] Set up automated backups
- [ ] Implement rate limiting per client
- [ ] Add request validation

## Next Steps

### Learn More

- Read the [Architecture Documentation](../../docs/ARCHITECTURE.md)
- Explore [AURA Protocol Specification](../../docs/protocol/README.md)
- Review [Integration Guides](../../docs/integration-guides/README.md)

### Advanced Features

- **Multi-location Beacons**: Serve different inventory by location
- **Real-time Inventory Sync**: Connect to your existing inventory system
- **Advanced Negotiation**: Implement ML-based pricing optimization
- **Analytics Dashboard**: Track Scout behavior and optimize offerings

### Join the Community

- **Discord**: [discord.gg/aura-framework](https://discord.gg/aura-framework)
- **Forum**: [discussions.aura-framework.org](https://discussions.aura-framework.org)
- **GitHub**: [github.com/aura-labs/aura-framework](https://github.com/aura-labs/aura-framework)

## Troubleshooting

### Beacon won't connect to AURA Core

**Check**:
- Is AURA Core running?
- Is the WebSocket URL correct?
- Is your API key valid?
- Check firewall/network settings

### Inventory not loading

**Check**:
- Look for errors in console
- Verify `loadInventory()` is called
- Check data format matches `createInventoryItem()` schema

### No Scout inquiries

**Check**:
- Is your Beacon registered? (check logs)
- Is your category correct?
- Do you have available inventory?
- Check your trust score (new Beacons start low)

### Performance Issues

**Solutions**:
- Move to database storage
- Implement caching
- Use connection pooling
- Scale horizontally

## Getting Help

Stuck? We're here to help:

1. **Check the docs**: Most questions are answered in [ARCHITECTURE.md](../../docs/ARCHITECTURE.md)
2. **Search issues**: Someone may have had the same problem
3. **Ask on Discord**: Quick help from the community
4. **Open an issue**: For bugs or feature requests

Happy building! 🚀
