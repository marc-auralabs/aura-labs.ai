# AURA Beacon Implementations

Reference implementations and examples of AURA Beacons.

## What is a Beacon?

A Beacon is a selling agent that:
- Signals willingness to participate in markets
- Responds to Scout inquiries with propositions
- Negotiates pricing dynamically
- Processes transactions when terms are agreed

Beacons integrate into seller systems (e-commerce, ERP, inventory management) to enable agentic commerce.

## Available Implementations

### Simple Beacon
**Location:** `./simple-beacon/`

A minimal, well-documented Beacon implementation for learning and prototyping.

- Single-file JavaScript implementation
- In-memory inventory
- Basic dynamic pricing
- Full protocol support

```bash
cd simple-beacon
npm install
npm start
```

[View Simple Beacon Documentation](./simple-beacon/README.md)

### Retail Beacon (Coming Soon)
**Location:** `./retail-beacon/`

Production-ready Beacon for e-commerce platforms.

- Database-backed inventory
- Advanced pricing strategies
- Multi-location support
- Analytics integration

### Travel Beacon (Coming Soon)
**Location:** `./travel-beacon/`

Specialized Beacon for travel and hospitality.

- Availability calendar
- Dynamic pricing based on demand
- Booking management
- Cancellation handling

### Service Beacon (Coming Soon)
**Location:** `./service-beacon/`

Beacon for service providers.

- Scheduling and capacity management
- Service catalog
- Provider matching
- Appointment booking

## Building Your Own Beacon

### Required Components

1. **AURA Core Connection**
   ```javascript
   const ws = new WebSocket('wss://api.aura-labs.ai');
   ```

2. **Registration Handler**
   ```javascript
   function register() {
     send({ type: 'BEACON_REGISTER', payload: { ... } });
   }
   ```

3. **Inquiry Handler**
   ```javascript
   function handleInquiry(inquiry) {
     const matches = searchInventory(inquiry.intent);
     return createPropositions(matches);
   }
   ```

4. **Negotiation Handler**
   ```javascript
   function handleNegotiation(request) {
     const price = calculatePrice(request);
     return makeOffer(price);
   }
   ```

5. **Transaction Handler**
   ```javascript
   function handleTransaction(transaction) {
     processOrder(transaction);
     return confirm(transaction);
   }
   ```

### Best Practices

- **Stateless where possible** - Use external storage
- **Idempotent operations** - Handle retries gracefully
- **Graceful degradation** - Handle AURA Core disconnection
- **Logging** - Track all interactions for debugging
- **Rate limiting** - Respect AURA Core limits

## Testing

Each Beacon includes a test suite:

```bash
cd simple-beacon
npm test
```

Use the Scout Simulator for integration testing:

```bash
cd ../tools/simulators/scout-simulator
npm start
```

## See Also

- [Quickstart Guide](../docs/QUICKSTART.md)
- [Beacon API Reference](../docs/api/beacon-api.md)
- [Protocol Specification](../docs/protocol/PROTOCOL_SPECIFICATION.md)
