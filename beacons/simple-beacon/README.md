# Simple Beacon

A minimal, well-documented AURA Beacon implementation for learning and prototyping.

## Overview

This Simple Beacon demonstrates all core Beacon functionality:
- Connecting to AURA Core
- Registering as a Beacon
- Managing inventory
- Handling Scout inquiries
- Dynamic pricing based on behavioral data
- Processing transactions

## Quick Start

```bash
# Install dependencies
npm install

# Configure (copy and edit .env)
cp .env.example .env

# Start the Beacon
npm start
```

## Configuration

Create a `.env` file:

```bash
# Beacon identification
BEACON_ID=my-store-beacon
PORT=3000

# AURA Core connection
AURA_CORE_URL=wss://api.aura-labs.ai
AURA_API_KEY=your-api-key

# Merchant details
MERCHANT_NAME=My Demo Store
MERCHANT_CATEGORY=electronics
```

## How It Works

### 1. Connection & Registration

On startup, the Beacon:
1. Connects to AURA Core via WebSocket
2. Authenticates with API key
3. Registers with merchant details
4. Begins listening for inquiries

### 2. Inventory Management

Products are loaded into memory with:
- Unique proposition ID
- Name, description, category
- Base price and price range
- Stock quantity
- Attributes (features, specs)

### 3. Inquiry Handling

When a Scout inquiry arrives:
1. Search inventory for matches
2. Filter by availability
3. Create propositions with price ranges
4. Return matching propositions

### 4. Dynamic Pricing

When negotiation starts:
1. Receive Scout's behavioral data
2. Apply pricing rules:
   - Loyalty discounts
   - Inventory-based adjustments
   - Constraint matching
3. Return personalized offer

### 5. Transaction Processing

When Scout accepts:
1. Receive identity (now revealed)
2. Validate stock availability
3. Reserve inventory
4. Confirm transaction
5. Begin fulfillment

## File Structure

```
simple-beacon/
├── README.md           # This file
├── package.json        # Dependencies
├── simple-beacon.js    # Main implementation
├── .env.example        # Configuration template
└── test/
    └── simple-beacon.test.js
```

## API Endpoints

The Beacon also exposes a REST API for monitoring:

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /inventory` | List all inventory |
| `GET /negotiations` | Active negotiations |

## Customization

### Adding Products

Edit `loadInventory()`:

```javascript
loadInventory() {
  const products = [
    {
      name: 'Your Product',
      category: 'your-category',
      basePrice: 99.99,
      stock: 100,
      description: 'Description here',
      features: ['feature1', 'feature2']
    }
  ];
  // ...
}
```

### Custom Pricing Logic

Edit `calculateDynamicPricing()`:

```javascript
calculateDynamicPricing(propositionId, behavioralData, constraints) {
  // Your pricing logic here
  let discount = 5;

  if (behavioralData.purchaseHistory.totalPurchases > 10) {
    discount = 20;
  }

  // ...
}
```

## Testing

```bash
# Run tests
npm test

# Test with Scout Simulator
npm run test:integration
```

## Production Notes

This implementation uses in-memory storage. For production:

1. **Replace storage** with database
2. **Add proper logging** (Winston, Bunyan)
3. **Implement monitoring** (Prometheus, DataDog)
4. **Add error tracking** (Sentry)
5. **Scale horizontally** behind load balancer

## See Also

- [Quickstart Guide](../../docs/QUICKSTART.md)
- [Beacon API Reference](../../docs/api/beacon-api.md)
- [Advanced Beacon Patterns](../../docs/tutorials/beacon-advanced.md)
