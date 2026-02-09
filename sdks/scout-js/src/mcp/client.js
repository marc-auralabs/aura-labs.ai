/**
 * MCP Client for AURA Scout SDK
 *
 * Implements Model Context Protocol client functionality,
 * allowing Scouts to connect to MCP servers for additional
 * context (tools, databases, calendars, etc.)
 *
 * @see https://modelcontextprotocol.io/specification
 */

import { EventEmitter } from 'events';

/**
 * MCP Client - connects to MCP servers
 */
export class MCPClient extends EventEmitter {
  #connections = new Map();
  #config;
  #clientInfo;

  // MCP Protocol version
  static PROTOCOL_VERSION = '2024-11-05';

  constructor(config = {}) {
    super();
    this.#config = {
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      ...config,
    };

    this.#clientInfo = config.clientInfo || {
      name: 'aura-scout',
      version: '1.0.0',
    };
  }

  /**
   * Get client info
   */
  get clientInfo() {
    return this.#clientInfo;
  }

  /**
   * Get protocol version
   */
  get protocolVersion() {
    return MCPClient.PROTOCOL_VERSION;
  }

  /**
   * Check if any servers are connected
   */
  get isConnected() {
    return this.#connections.size > 0;
  }

  /**
   * Get supported capabilities
   */
  get capabilities() {
    return {
      tools: { listChanged: true },
      resources: { subscribe: false, listChanged: true },
      prompts: { listChanged: true },
      sampling: {},
    };
  }

  /**
   * Connect to an MCP server
   * @param {Object} server - Server configuration
   * @param {string} server.uri - MCP server URI (mcp://host or https://host)
   * @param {string} server.name - Human-readable server name
   * @param {Object} server.auth - Optional authentication
   */
  async connect(server) {
    const { uri, name, auth } = server;

    if (this.#connections.has(uri)) {
      return this.#connections.get(uri);
    }

    const connection = new MCPConnection({
      uri,
      name,
      auth,
      timeout: this.#config.timeout,
    });

    try {
      await connection.initialize();
      this.#connections.set(uri, connection);
      this.emit('connected', { uri, name });
      return connection;
    } catch (error) {
      this.emit('error', { uri, error });
      throw error;
    }
  }

  /**
   * Connect to multiple MCP servers
   */
  async connectAll(servers) {
    const results = await Promise.allSettled(
      servers.map(server => this.connect(server))
    );

    return results.map((result, i) => ({
      server: servers[i],
      status: result.status,
      connection: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason : null,
    }));
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(uri) {
    const connection = this.#connections.get(uri);
    if (connection) {
      await connection.close();
      this.#connections.delete(uri);
      this.emit('disconnected', { uri });
    }
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll() {
    const uris = Array.from(this.#connections.keys());
    await Promise.all(uris.map(uri => this.disconnect(uri)));
  }

  /**
   * Get all available tools from connected servers
   */
  async listAllTools() {
    const allTools = [];

    for (const [uri, connection] of this.#connections) {
      try {
        const tools = await connection.listTools();
        allTools.push(...tools.map(tool => ({
          ...tool,
          serverUri: uri,
          serverName: connection.name,
        })));
      } catch (error) {
        this.emit('error', { uri, error, operation: 'listTools' });
      }
    }

    return allTools;
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(serverUri, toolName, args) {
    const connection = this.#connections.get(serverUri);
    if (!connection) {
      throw new Error(`Not connected to server: ${serverUri}`);
    }
    return connection.callTool(toolName, args);
  }

  /**
   * Get all available resources from connected servers
   */
  async listAllResources() {
    const allResources = [];

    for (const [uri, connection] of this.#connections) {
      try {
        const resources = await connection.listResources();
        allResources.push(...resources.map(resource => ({
          ...resource,
          serverUri: uri,
          serverName: connection.name,
        })));
      } catch (error) {
        this.emit('error', { uri, error, operation: 'listResources' });
      }
    }

    return allResources;
  }

  /**
   * Read a resource from a specific server
   */
  async readResource(serverUri, resourceUri) {
    const connection = this.#connections.get(serverUri);
    if (!connection) {
      throw new Error(`Not connected to server: ${serverUri}`);
    }
    return connection.readResource(resourceUri);
  }

  /**
   * Aggregate context from all connected servers
   * Useful for providing rich context to intent parsing
   */
  async aggregateContext(query = {}) {
    const context = {
      tools: [],
      resources: [],
      data: {},
    };

    // Gather tools
    context.tools = await this.listAllTools();

    // Gather resources if requested
    if (query.includeResources !== false) {
      context.resources = await this.listAllResources();
    }

    // Gather specific data if query provided
    if (query.resourcePatterns) {
      for (const pattern of query.resourcePatterns) {
        const matches = context.resources.filter(r =>
          r.uri.includes(pattern) || r.name?.includes(pattern)
        );
        for (const match of matches) {
          try {
            const data = await this.readResource(match.serverUri, match.uri);
            context.data[match.uri] = data;
          } catch (error) {
            // Skip resources that fail to read
          }
        }
      }
    }

    return context;
  }

  get connections() {
    return Array.from(this.#connections.entries()).map(([uri, conn]) => ({
      uri,
      name: conn.name,
      status: conn.status,
    }));
  }
}

/**
 * Individual MCP Server Connection
 * Handles JSON-RPC 2.0 communication
 */
class MCPConnection extends EventEmitter {
  #uri;
  #name;
  #auth;
  #timeout;
  #status = 'disconnected';
  #capabilities = null;
  #messageId = 0;

  constructor({ uri, name, auth, timeout }) {
    super();
    this.#uri = uri;
    this.#name = name || uri;
    this.#auth = auth;
    this.#timeout = timeout;
  }

  get name() {
    return this.#name;
  }

  get status() {
    return this.#status;
  }

  get capabilities() {
    return this.#capabilities;
  }

  /**
   * Initialize connection to MCP server
   */
  async initialize() {
    this.#status = 'connecting';

    try {
      // Send initialize request
      const response = await this.#request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          resources: { subscribe: false },
        },
        clientInfo: {
          name: 'aura-scout',
          version: '0.1.0',
        },
      });

      this.#capabilities = response.capabilities;
      this.#status = 'connected';

      // Send initialized notification
      await this.#notify('notifications/initialized', {});

      return response;
    } catch (error) {
      this.#status = 'error';
      throw error;
    }
  }

  /**
   * List available tools
   */
  async listTools() {
    const response = await this.#request('tools/list', {});
    return response.tools || [];
  }

  /**
   * Call a tool
   */
  async callTool(name, args) {
    const response = await this.#request('tools/call', {
      name,
      arguments: args,
    });
    return response;
  }

  /**
   * List available resources
   */
  async listResources() {
    const response = await this.#request('resources/list', {});
    return response.resources || [];
  }

  /**
   * Read a resource
   */
  async readResource(uri) {
    const response = await this.#request('resources/read', { uri });
    return response.contents;
  }

  /**
   * Close connection
   */
  async close() {
    this.#status = 'disconnected';
    // Clean up any persistent connections
  }

  /**
   * Send JSON-RPC request
   */
  async #request(method, params) {
    const id = ++this.#messageId;

    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return this.#send(message);
  }

  /**
   * Send JSON-RPC notification (no response expected)
   */
  async #notify(method, params) {
    const message = {
      jsonrpc: '2.0',
      method,
      params,
    };

    return this.#send(message, false);
  }

  /**
   * Send message to server
   */
  async #send(message, expectResponse = true) {
    const url = this.#uri.replace(/^mcp:\/\//, 'https://');

    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.#auth?.type === 'bearer') {
      headers['Authorization'] = `Bearer ${this.#auth.token}`;
    } else if (this.#auth?.type === 'api-key') {
      headers['X-API-Key'] = this.#auth.key;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.#timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(message),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`MCP server error: ${response.status} ${response.statusText}`);
      }

      if (!expectResponse) {
        return null;
      }

      const result = await response.json();

      if (result.error) {
        throw new MCPError(result.error.code, result.error.message, result.error.data);
      }

      return result.result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`MCP request timeout after ${this.#timeout}ms`);
      }
      throw error;
    }
  }
}

/**
 * MCP Protocol Error
 */
export class MCPError extends Error {
  constructor(code, message, data) {
    super(message);
    this.name = 'MCPError';
    this.code = code;
    this.data = data;
  }
}

export default MCPClient;
