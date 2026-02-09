/**
 * MCP Protocol Scenario Tests
 *
 * Real-world scenario tests for Model Context Protocol (MCP).
 * These tests verify client initialization, server connection, and tool usage.
 *
 * Run:
 *   node --test src/tests/scenarios/mcp-scenarios.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { MCPClient, MCPError } from '../../mcp/client.js';

// =============================================================================
// Scenario 1: Client Initialization
// =============================================================================

describe('Scenario: MCP Client Initialization', () => {
  test('Creates client with default configuration', () => {
    const client = new MCPClient();

    assert.strictEqual(client.isConnected, false);
    assert.strictEqual(client.protocolVersion, '2024-11-05');
    assert.strictEqual(client.clientInfo.name, 'aura-scout');
    assert.strictEqual(client.clientInfo.version, '1.0.0');
  });

  test('Creates client with custom configuration', () => {
    const client = new MCPClient({
      timeout: 60000,
      clientInfo: {
        name: 'custom-shopping-agent',
        version: '2.0.0',
      },
    });

    assert.strictEqual(client.clientInfo.name, 'custom-shopping-agent');
    assert.strictEqual(client.clientInfo.version, '2.0.0');
  });

  test('Client exposes required capabilities', () => {
    const client = new MCPClient();
    const caps = client.capabilities;

    assert.ok(caps.tools, 'Should have tools capability');
    assert.ok(caps.resources, 'Should have resources capability');
    assert.ok(caps.prompts, 'Should have prompts capability');
    assert.ok(caps.sampling, 'Should have sampling capability');
  });

  test('Client is an EventEmitter', () => {
    const client = new MCPClient();
    let eventFired = false;

    client.on('test', () => {
      eventFired = true;
    });

    client.emit('test');
    assert.strictEqual(eventFired, true);
  });
});

// =============================================================================
// Scenario 2: Tool Discovery (Offline Mode)
// =============================================================================

describe('Scenario: Tool Discovery Without Servers', () => {
  test('Returns empty tools list when disconnected', async () => {
    const client = new MCPClient();
    const tools = await client.listAllTools();

    assert.ok(Array.isArray(tools));
    assert.strictEqual(tools.length, 0);
  });

  test('Returns empty resources list when disconnected', async () => {
    const client = new MCPClient();
    const resources = await client.listAllResources();

    assert.ok(Array.isArray(resources));
    assert.strictEqual(resources.length, 0);
  });

  test('Context aggregation returns empty structure when disconnected', async () => {
    const client = new MCPClient();
    const context = await client.aggregateContext({});

    assert.deepStrictEqual(context.tools, []);
    assert.deepStrictEqual(context.resources, []);
    assert.deepStrictEqual(context.data, {});
  });
});

// =============================================================================
// Scenario 3: Server Connection Management
// =============================================================================

describe('Scenario: Server Connection Management', () => {
  test('Tracks connection status', () => {
    const client = new MCPClient();

    assert.strictEqual(client.isConnected, false);
    assert.deepStrictEqual(client.connections, []);
  });

  test('Disconnect is safe when not connected', async () => {
    const client = new MCPClient();

    // Should not throw
    await client.disconnect('non-existent-server');
    assert.strictEqual(client.isConnected, false);
  });

  test('DisconnectAll is safe with no connections', async () => {
    const client = new MCPClient();

    // Should not throw
    await client.disconnectAll();
    assert.strictEqual(client.isConnected, false);
  });

  test('Connection errors are handled gracefully', async () => {
    const client = new MCPClient();

    await assert.rejects(
      async () => {
        await client.connect({
          uri: 'https://invalid.mcp-server.example.com/sse',
          name: 'invalid-server',
        });
      },
      /failed|error|ENOTFOUND/i
    );
  });
});

// =============================================================================
// Scenario 4: Tool Calls
// =============================================================================

describe('Scenario: Tool Calls', () => {
  test('Tool call fails when server not connected', async () => {
    const client = new MCPClient();

    await assert.rejects(
      async () => {
        await client.callTool('https://mcp.example.com', 'search', { query: 'test' });
      },
      /not connected/i
    );
  });

  test('Resource read fails when server not connected', async () => {
    const client = new MCPClient();

    await assert.rejects(
      async () => {
        await client.readResource('https://mcp.example.com', 'resource://test');
      },
      /not connected/i
    );
  });
});

// =============================================================================
// Scenario 5: Event Handling
// =============================================================================

describe('Scenario: Event Handling', () => {
  test('Emits events for connection lifecycle', () => {
    const client = new MCPClient();
    const events = [];

    client.on('connected', (data) => events.push({ type: 'connected', data }));
    client.on('disconnected', (data) => events.push({ type: 'disconnected', data }));
    client.on('error', (data) => events.push({ type: 'error', data }));

    // Simulate events
    client.emit('connected', { uri: 'test://server' });
    client.emit('error', { error: new Error('test') });
    client.emit('disconnected', { uri: 'test://server' });

    assert.strictEqual(events.length, 3);
    assert.strictEqual(events[0].type, 'connected');
    assert.strictEqual(events[1].type, 'error');
    assert.strictEqual(events[2].type, 'disconnected');
  });

  test('Supports multiple listeners per event', () => {
    const client = new MCPClient();
    let count = 0;

    client.on('test-event', () => count++);
    client.on('test-event', () => count++);
    client.on('test-event', () => count++);

    client.emit('test-event');
    assert.strictEqual(count, 3);
  });

  test('Removes listeners with off/removeListener', () => {
    const client = new MCPClient();
    let count = 0;

    const listener = () => count++;
    client.on('test-event', listener);
    client.emit('test-event');
    assert.strictEqual(count, 1);

    client.removeListener('test-event', listener);
    client.emit('test-event');
    assert.strictEqual(count, 1); // Still 1, listener removed
  });
});

// =============================================================================
// Scenario 6: Context Aggregation
// =============================================================================

describe('Scenario: Context Aggregation', () => {
  test('Aggregates context with query parameters', async () => {
    const client = new MCPClient();

    const context = await client.aggregateContext({
      includeResources: true,
      resourcePatterns: ['calendar://', 'file://'],
    });

    assert.ok('tools' in context);
    assert.ok('resources' in context);
    assert.ok('data' in context);
  });

  test('Handles includeResources: false', async () => {
    const client = new MCPClient();

    const context = await client.aggregateContext({
      includeResources: false,
    });

    // Resources should still exist but be empty (no servers)
    assert.ok('resources' in context);
  });
});

// =============================================================================
// Scenario 7: MCP Error Handling
// =============================================================================

describe('Scenario: MCP Error Handling', () => {
  test('MCPError has correct structure', () => {
    const error = new MCPError(-32600, 'Invalid Request', { field: 'method' });

    assert.strictEqual(error.name, 'MCPError');
    assert.strictEqual(error.code, -32600);
    assert.strictEqual(error.message, 'Invalid Request');
    assert.deepStrictEqual(error.data, { field: 'method' });
  });

  test('MCPError is instance of Error', () => {
    const error = new MCPError(-32600, 'Test');
    assert.ok(error instanceof Error);
  });

  test('Standard JSON-RPC error codes', () => {
    const errorCodes = {
      PARSE_ERROR: -32700,
      INVALID_REQUEST: -32600,
      METHOD_NOT_FOUND: -32601,
      INVALID_PARAMS: -32602,
      INTERNAL_ERROR: -32603,
    };

    // Verify codes are in expected range
    Object.values(errorCodes).forEach(code => {
      assert.ok(code >= -32700 && code <= -32600);
    });
  });
});

// =============================================================================
// Scenario 8: Protocol Compliance
// =============================================================================

describe('Scenario: MCP Protocol Compliance', () => {
  test('Uses correct protocol version', () => {
    const client = new MCPClient();
    assert.strictEqual(client.protocolVersion, '2024-11-05');
  });

  test('JSON-RPC 2.0 message format', () => {
    // Test that we understand the expected format
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    };

    assert.strictEqual(request.jsonrpc, '2.0');
    assert.ok(Number.isInteger(request.id));
    assert.ok(typeof request.method === 'string');
    assert.ok(typeof request.params === 'object');
  });

  test('Notification format (no id)', () => {
    const notification = {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    };

    assert.strictEqual(notification.jsonrpc, '2.0');
    assert.ok(!('id' in notification), 'Notifications should not have id');
  });

  test('Response format with result', () => {
    const response = {
      jsonrpc: '2.0',
      id: 1,
      result: {
        tools: [
          { name: 'search', description: 'Search products' },
        ],
      },
    };

    assert.strictEqual(response.jsonrpc, '2.0');
    assert.ok('result' in response);
    assert.ok(!('error' in response), 'Success response should not have error');
  });

  test('Response format with error', () => {
    const errorResponse = {
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: -32601,
        message: 'Method not found',
      },
    };

    assert.strictEqual(errorResponse.jsonrpc, '2.0');
    assert.ok('error' in errorResponse);
    assert.ok(!('result' in errorResponse), 'Error response should not have result');
  });
});

// =============================================================================
// Scenario 9: Multiple Server Support (Structure Test)
// =============================================================================

describe('Scenario: Multiple Server Architecture', () => {
  test('Client tracks multiple connections', () => {
    const client = new MCPClient();

    // Test the structure supports multiple connections
    const connections = client.connections;
    assert.ok(Array.isArray(connections));
  });

  test('ConnectAll handles multiple servers', async () => {
    const client = new MCPClient();

    // This will fail (no servers), but tests the interface
    const results = await client.connectAll([
      { uri: 'https://server1.invalid', name: 'Server 1' },
      { uri: 'https://server2.invalid', name: 'Server 2' },
    ]);

    assert.strictEqual(results.length, 2);
    results.forEach((result, i) => {
      assert.ok('status' in result);
      assert.ok('server' in result);
    });
  });
});

// =============================================================================
// Scenario 10: AURA Integration Patterns
// =============================================================================

describe('Scenario: AURA Integration Patterns', () => {
  test('Scout can use MCP for external context', async () => {
    // This test documents the expected integration pattern
    const client = new MCPClient({
      clientInfo: {
        name: 'aura-scout',
        version: '1.0.0',
      },
    });

    // Scout would connect to various context servers:
    // - Calendar server for scheduling
    // - CRM for customer data
    // - Inventory systems

    // Verify client is ready for this pattern
    assert.strictEqual(client.clientInfo.name, 'aura-scout');
    assert.ok(client.capabilities.tools);
    assert.ok(client.capabilities.resources);
  });

  test('Context can be passed to intent parsing', async () => {
    const client = new MCPClient();

    // Aggregate context (empty in offline mode)
    const context = await client.aggregateContext({
      includeResources: true,
    });

    // Context has expected shape for intent enrichment
    assert.ok('tools' in context, 'Should have tools for capability awareness');
    assert.ok('resources' in context, 'Should have resources for context');
    assert.ok('data' in context, 'Should have data for specific lookups');
  });
});
