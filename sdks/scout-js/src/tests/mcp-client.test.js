/**
 * MCP Client Tests
 *
 * Tests for Model Context Protocol client implementation.
 *
 * Run:
 *   node --test src/tests/mcp-client.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { MCPClient } from '../mcp/client.js';

// =============================================================================
// Client Initialization Tests
// =============================================================================

describe('MCP Client Initialization', () => {
  test('creates client with default config', () => {
    const client = new MCPClient();

    assert.ok(client);
    assert.strictEqual(client.isConnected, false);
  });

  test('creates client with custom config', () => {
    const client = new MCPClient({
      clientInfo: {
        name: 'test-client',
        version: '2.0.0',
      },
    });

    assert.ok(client);
    assert.strictEqual(client.clientInfo.name, 'test-client');
    assert.strictEqual(client.clientInfo.version, '2.0.0');
  });

  test('uses default client info when not provided', () => {
    const client = new MCPClient({});

    assert.strictEqual(client.clientInfo.name, 'aura-scout');
    assert.strictEqual(client.clientInfo.version, '1.0.0');
  });
});

// =============================================================================
// Connection State Tests
// =============================================================================

describe('MCP Client Connection State', () => {
  test('starts disconnected', () => {
    const client = new MCPClient();
    assert.strictEqual(client.isConnected, false);
  });

  test('returns empty tools list when not connected', async () => {
    const client = new MCPClient();
    const tools = await client.listAllTools();

    assert.deepStrictEqual(tools, []);
  });

  test('returns empty context when not connected', async () => {
    const client = new MCPClient();
    const context = await client.aggregateContext({ query: 'test' });

    assert.deepStrictEqual(context.tools, []);
    assert.deepStrictEqual(context.resources, []);
  });
});

// =============================================================================
// Event Emitter Tests
// =============================================================================

describe('MCP Client Events', () => {
  test('emits events as EventEmitter', () => {
    const client = new MCPClient();
    let eventReceived = false;

    client.on('test-event', () => {
      eventReceived = true;
    });

    client.emit('test-event');
    assert.strictEqual(eventReceived, true);
  });

  test('supports multiple event listeners', () => {
    const client = new MCPClient();
    const calls = [];

    client.on('multi-event', () => calls.push(1));
    client.on('multi-event', () => calls.push(2));

    client.emit('multi-event');
    assert.deepStrictEqual(calls, [1, 2]);
  });
});

// =============================================================================
// Tool Listing Tests
// =============================================================================

describe('MCP Client Tool Listing', () => {
  test('listAllTools returns array', async () => {
    const client = new MCPClient();
    const tools = await client.listAllTools();

    assert.ok(Array.isArray(tools));
  });

  test('listAllTools returns empty array with no servers', async () => {
    const client = new MCPClient();
    const tools = await client.listAllTools();

    assert.strictEqual(tools.length, 0);
  });
});

// =============================================================================
// Context Aggregation Tests
// =============================================================================

describe('MCP Client Context Aggregation', () => {
  test('aggregateContext returns context structure', async () => {
    const client = new MCPClient();
    const context = await client.aggregateContext({});

    assert.ok('tools' in context);
    assert.ok('resources' in context);
    assert.ok('data' in context);
  });

  test('aggregateContext accepts query parameter', async () => {
    const client = new MCPClient();
    const context = await client.aggregateContext({
      query: 'test query',
      includeResources: true,
    });

    // Should return empty context (no servers connected)
    assert.deepStrictEqual(context.tools, []);
    assert.deepStrictEqual(context.resources, []);
  });
});

// =============================================================================
// Tool Call Tests (Mock/Offline)
// =============================================================================

describe('MCP Client Tool Calls', () => {
  test('callTool throws when server not found', async () => {
    const client = new MCPClient();

    await assert.rejects(
      async () => {
        await client.callTool('unknown-server', 'test-tool', {});
      },
      { message: /not connected/i }
    );
  });
});

// =============================================================================
// Server Management Tests
// =============================================================================

describe('MCP Client Server Management', () => {
  test('disconnect returns immediately when not connected', async () => {
    const client = new MCPClient();

    // Should not throw
    await client.disconnect('some-server');
    assert.strictEqual(client.isConnected, false);
  });

  test('disconnectAll works with no servers', async () => {
    const client = new MCPClient();

    // Should not throw
    await client.disconnectAll();
    assert.strictEqual(client.isConnected, false);
  });
});

// =============================================================================
// Protocol Version Tests
// =============================================================================

describe('MCP Client Protocol', () => {
  test('uses correct protocol version', () => {
    const client = new MCPClient();
    assert.strictEqual(client.protocolVersion, '2024-11-05');
  });

  test('supports required capabilities', () => {
    const client = new MCPClient();
    const capabilities = client.capabilities;

    assert.ok(capabilities.tools);
    assert.ok(capabilities.resources);
    assert.ok(capabilities.prompts);
    assert.ok(capabilities.sampling);
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('MCP Client Error Handling', () => {
  test('handles connection errors gracefully', async () => {
    const client = new MCPClient();

    // Attempting to connect to invalid URL should reject
    await assert.rejects(
      async () => {
        await client.connect({ uri: 'https://invalid.example.com/mcp', name: 'invalid' });
      }
    );
  });
});
