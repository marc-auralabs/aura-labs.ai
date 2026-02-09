# Scout SDK Tests

This directory contains tests for the AURA Scout SDK protocol implementations.

## Test Structure

```
tests/
├── mcp-client.test.js       # Unit tests for MCP Client
├── ap2-mandates.test.js     # Unit tests for AP2 Mandates
├── visa-tap.test.js         # Unit tests for Visa TAP
├── run-protocol-tests.js    # Runner for unit tests
└── scenarios/               # Real-world scenario tests
    ├── index.js             # Scenario test runner
    ├── ap2-scenarios.test.js
    ├── tap-scenarios.test.js
    ├── mcp-scenarios.test.js
    └── integration-scenarios.test.js
```

## Running Tests

### All Tests
```bash
npm test
```

### Protocol Unit Tests
```bash
npm run test:protocols
```

### Scenario Tests
```bash
# All scenarios
npm run test:scenarios

# Individual protocol scenarios
npm run test:ap2
npm run test:tap
npm run test:mcp
npm run test:integration
```

### Direct Node.js Execution
```bash
node --test src/tests/scenarios/ap2-scenarios.test.js
```

## Test Categories

### Unit Tests (`*.test.js`)
Basic functionality tests for each protocol implementation:
- Function inputs/outputs
- Data structures
- Error handling
- API compliance

### Scenario Tests (`scenarios/*.test.js`)
Real-world usage scenario tests:

#### AP2 Scenarios (`ap2-scenarios.test.js`)
- Complete shopping flow (Intent → Cart → Payment)
- Budget limit enforcement
- Category restrictions
- Merchant allowlist/blocklist
- Time-limited authorization
- Currency handling
- Multiple constraint violations
- Signature verification

#### TAP Scenarios (`tap-scenarios.test.js`)
- Agent registration flow
- Payment request signing
- Request verification by merchants
- Multiple agent identities
- Key rotation
- Replay attack protection
- Different HTTP request types
- Error handling

#### MCP Scenarios (`mcp-scenarios.test.js`)
- Client initialization
- Tool discovery
- Server connection management
- Event handling
- Context aggregation
- Protocol compliance
- Multiple server support
- AURA integration patterns

#### Integration Scenarios (`integration-scenarios.test.js`)
- Complete agentic shopping flow (MCP + AP2 + TAP)
- Multi-offer comparison with constraints
- Payment network verification
- MCP context enriching intent
- Error recovery in protocol chain
- Time-sensitive transactions
- Agent capabilities advertisement

## Test on Railway (Remote)

For environments without local Node.js, tests can be run via the Core API:

```bash
# Check dev routes enabled
curl https://aura-labsai-production.up.railway.app/dev/status

# Run inline protocol tests
curl https://aura-labsai-production.up.railway.app/dev/test/protocols
```

## Writing New Tests

### Unit Test Template
```javascript
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { SomeModule } from '../path/to/module.js';

describe('Module Name', () => {
  test('does something specific', () => {
    const result = SomeModule.doSomething();
    assert.strictEqual(result, expected);
  });
});
```

### Scenario Test Template
```javascript
import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('Scenario: Real World Use Case', () => {
  let sharedState;

  test('Step 1: Setup', async () => {
    sharedState = await setupSomething();
    assert.ok(sharedState);
  });

  test('Step 2: Action', async () => {
    const result = await doAction(sharedState);
    assert.strictEqual(result.status, 'success');
  });

  test('Step 3: Verify', () => {
    assert.ok(sharedState.completed);
  });
});
```

## Protocol References

- **MCP**: [Model Context Protocol Specification](https://modelcontextprotocol.io/specification)
- **AP2**: [Google Agent Payments Protocol](https://ap2-protocol.org/specification/)
- **Visa TAP**: [Visa Trusted Agent Protocol](https://usa.visa.com/about-visa/newsroom/press-releases.releaseId.21716.html)
