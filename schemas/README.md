# AURA JSON Schemas

JSON Schema definitions for all AURA protocol messages and data structures.

## Usage

These schemas can be used for:
- **Validation** - Validate messages before sending
- **Code Generation** - Generate types for your language
- **Documentation** - Understand message formats

## Schema Categories

### Scout Schemas (`/scout`)
Messages sent by Scout agents.

| Schema | Description |
|--------|-------------|
| [intent.json](./scout/intent.json) | Intent registration payload |
| [inquiry.json](./scout/inquiry.json) | Discovery inquiry |
| [negotiation-request.json](./scout/negotiation-request.json) | Start negotiation |
| [transaction-request.json](./scout/transaction-request.json) | Complete transaction |

### Beacon Schemas (`/beacon`)
Messages sent by Beacon agents.

| Schema | Description |
|--------|-------------|
| [proposition.json](./beacon/proposition.json) | Product/service offering |
| [inquiry-response.json](./beacon/inquiry-response.json) | Response to Scout inquiry |
| [negotiation-offer.json](./beacon/negotiation-offer.json) | Pricing offer |
| [transaction-confirmation.json](./beacon/transaction-confirmation.json) | Transaction confirmed |

### Transaction Schemas (`/transactions`)
Transaction and fulfillment structures.

| Schema | Description |
|--------|-------------|
| [payment.json](./transactions/payment.json) | Payment details |
| [fulfillment.json](./transactions/fulfillment.json) | Delivery information |
| [refund.json](./transactions/refund.json) | Refund request |

### Shared Schemas (`/shared`)
Common structures used across messages.

| Schema | Description |
|--------|-------------|
| [identity.json](./shared/identity.json) | Identity structure |
| [preferences.json](./shared/preferences.json) | User preferences |
| [behavioral-data.json](./shared/behavioral-data.json) | Behavioral context |
| [price-range.json](./shared/price-range.json) | Price range structure |

## Validation Example

### JavaScript

```javascript
import Ajv from 'ajv';
import intentSchema from './scout/intent.json';

const ajv = new Ajv();
const validate = ajv.compile(intentSchema);

const intent = {
  category: 'electronics',
  description: 'wireless headphones',
  constraints: {
    priceRange: { min: 100, max: 300 }
  }
};

if (validate(intent)) {
  console.log('Valid intent');
} else {
  console.log('Validation errors:', validate.errors);
}
```

### Python

```python
import jsonschema
import json

with open('schemas/scout/intent.json') as f:
    schema = json.load(f)

intent = {
    "category": "electronics",
    "description": "wireless headphones",
    "constraints": {
        "priceRange": {"min": 100, "max": 300}
    }
}

jsonschema.validate(intent, schema)
```

## Schema Versioning

Schemas follow semantic versioning:
- **Major**: Breaking changes
- **Minor**: New optional fields
- **Patch**: Documentation/fixes

Current version: `1.0.0`

## Contributing

When modifying schemas:
1. Update the schema file
2. Update this README if needed
3. Run validation tests
4. Update CHANGELOG

## See Also

- [Protocol Specification](../docs/protocol/PROTOCOL_SPECIFICATION.md)
- [API Reference](../docs/api/README.md)
