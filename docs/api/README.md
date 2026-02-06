# AURA API Reference

Complete API documentation for integrating with AURA.

## Transport Options

### WebSocket API (Primary)
Real-time bidirectional communication for Scouts and Beacons.

**Endpoint:** `wss://api.aura-labs.ai`

```javascript
const ws = new WebSocket('wss://api.aura-labs.ai');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'AUTHENTICATE',
    payload: { apiKey: 'your-api-key' }
  }));
};
```

### REST API (Secondary)
Stateless operations for configuration and queries.

**Base URL:** `https://api.aura-labs.ai/v1`

## Authentication

All API requests require authentication via API key:

```bash
# WebSocket
{ "type": "AUTHENTICATE", "payload": { "apiKey": "..." } }

# REST
Authorization: Bearer your-api-key
```

## API Sections

### Core API
- [Core API Reference](./core-api.md) - AURA Core endpoints
- Registration and authentication
- Market queries
- System status

### Beacon API
- [Beacon API Reference](./beacon-api.md) - Beacon interface
- Proposition management
- Inquiry handling
- Transaction processing

### Scout API
- [Scout API Reference](./scout-api.md) - Scout interface
- Intent registration
- Discovery requests
- Negotiation management

## Common Message Types

### Scout Messages

| Type | Description |
|------|-------------|
| `INTENT_REGISTER` | Register purchase intent |
| `DISCOVERY_REQUEST` | Search for matching Beacons |
| `NEGOTIATION_REQUEST` | Start negotiation |
| `NEGOTIATION_ACCEPT` | Accept an offer |
| `TRANSACTION_REQUEST` | Complete transaction |

### Beacon Messages

| Type | Description |
|------|-------------|
| `BEACON_REGISTER` | Register with AURA Core |
| `PROPOSITION_UPDATE` | Update available offerings |
| `INQUIRY_RESPONSE` | Respond to Scout inquiry |
| `NEGOTIATION_OFFER` | Make pricing offer |
| `TRANSACTION_CONFIRM` | Confirm transaction |

### System Messages

| Type | Description |
|------|-------------|
| `HEARTBEAT` | Keep connection alive |
| `ERROR` | Error response |
| `ACK` | Acknowledgment |

## Error Codes

| Code | Description |
|------|-------------|
| `AUTH_FAILED` | Authentication failure |
| `RATE_LIMITED` | Too many requests |
| `INVALID_MESSAGE` | Malformed message |
| `NOT_FOUND` | Resource not found |
| `NEGOTIATION_EXPIRED` | Negotiation timed out |

## Rate Limits

| Client Type | Requests/min | Connections |
|-------------|--------------|-------------|
| Scout | 100 | 5 |
| Beacon | 500 | 10 |
| Enterprise | Custom | Custom |

## See Also

- [Protocol Specification](../protocol/PROTOCOL_SPECIFICATION.md)
- [JSON Schemas](../../schemas/README.md)
- [Quickstart Guide](../QUICKSTART.md)
