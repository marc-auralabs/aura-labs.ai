# AURA Examples

Complete integration examples demonstrating AURA in various environments.

## Example Projects

### Node.js Examples (`/nodejs`)

| Example | Description |
|---------|-------------|
| `basic-integration/` | Minimal Beacon setup |
| `ecommerce-platform/` | Full e-commerce integration |
| `marketplace-integration/` | Multi-vendor marketplace |

### Python Examples (`/python`)

| Example | Description |
|---------|-------------|
| `flask-beacon/` | Flask-based Beacon |
| `django-beacon/` | Django integration |
| `ml-pricing-engine/` | ML-powered dynamic pricing |

### Go Examples (`/go`) (Coming Soon)

| Example | Description |
|---------|-------------|
| `high-performance-beacon/` | Optimized for throughput |
| `microservices-beacon/` | Distributed architecture |

## Running Examples

Each example includes:
- `README.md` with setup instructions
- `package.json` or equivalent
- `.env.example` for configuration
- Working code you can run immediately

### General Steps

```bash
# Navigate to example
cd nodejs/basic-integration

# Install dependencies
npm install

# Configure
cp .env.example .env
# Edit .env with your credentials

# Run
npm start
```

## Example Walkthroughs

### Basic Integration (Node.js)

The simplest possible Beacon integration:

```javascript
const { AuraBeacon } = require('@aura-labs/beacon-sdk');

const beacon = new AuraBeacon({
  apiKey: process.env.AURA_API_KEY,
  merchantName: 'My Store'
});

beacon.setInventory([
  { id: 'prod-1', name: 'Widget', price: 29.99 }
]);

beacon.on('inquiry', (inquiry) => {
  return beacon.matchInventory(inquiry);
});

beacon.connect();
```

### E-commerce Platform Integration

Shows how to:
- Sync inventory from database
- Handle real orders
- Manage fulfillment
- Track analytics

### ML Pricing Engine (Python)

Demonstrates:
- Training pricing models
- Real-time price optimization
- A/B testing strategies
- Performance monitoring

## Creating Your Own Example

We welcome community examples! To contribute:

1. Create a new folder under the appropriate language
2. Include a comprehensive README
3. Add working, tested code
4. Submit a pull request

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

## See Also

- [Quickstart Guide](../docs/QUICKSTART.md)
- [Tutorials](../docs/tutorials/README.md)
- [API Reference](../docs/api/README.md)
