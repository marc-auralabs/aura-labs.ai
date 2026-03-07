/**
 * AURA Core - Client Management Module
 * 
 * This module manages the registration, authentication, and lifecycle of
 * clients (Scouts and Beacons) within the AURA ecosystem.
 * 
 * Key Responsibilities:
 * 1. Client registration and onboarding
 * 2. Authentication and authorization
 * 3. Capability verification and validation
 * 4. Connection health monitoring
 * 5. Trust scoring and reputation management
 * 6. Rate limiting and quota enforcement
 * 
 * @module ClientManagement
 * @version 1.0.0
 */

const crypto = require('crypto');
const { EventEmitter } = require('events');

// ============================================================================
// CLIENT TYPES
// ============================================================================

const ClientType = {
  SCOUT: 'scout',
  BEACON: 'beacon',
  THIRD_PARTY_AGENT: 'third_party_agent',
};

const ClientStatus = {
  PENDING: 'pending',           // Registration submitted, not verified
  ACTIVE: 'active',             // Verified and operational
  SUSPENDED: 'suspended',       // Temporarily disabled
  DEACTIVATED: 'deactivated',   // Permanently disabled
};

// ============================================================================
// CLIENT MANAGER CLASS
// ============================================================================

/**
 * ClientManager handles all client lifecycle operations.
 * It maintains a registry of all clients and their current states.
 */
class ClientManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Trust scoring thresholds
      minTrustScore: config.minTrustScore || 0.5,
      maxTrustScore: config.maxTrustScore || 1.0,
      
      // Rate limiting
      defaultRateLimit: config.defaultRateLimit || 100, // requests per minute
      
      // Connection monitoring
      heartbeatTimeout: config.heartbeatTimeout || 60000, // 60 seconds
      heartbeatInterval: config.heartbeatInterval || 30000, // 30 seconds
      
      // Registration
      requireManualApproval: config.requireManualApproval || false,
    };
    
    // In-memory storage (use database in production)
    this.clients = new Map();
    this.sessions = new Map();
    this.trustScores = new Map();
    this.rateLimits = new Map();
    
    // Monitoring
    this.heartbeatTimers = new Map();
    
    this.startMonitoring();
  }

  // ==========================================================================
  // CLIENT REGISTRATION
  // ==========================================================================

  /**
   * Register a new client (Scout, Beacon, or third-party agent).
   * 
   * @param {Object} registrationData - Client registration information
   * @param {String} registrationData.type - Client type (scout|beacon|third_party_agent)
   * @param {String} registrationData.name - Client/merchant name
   * @param {Object} registrationData.capabilities - Declared capabilities
   * @param {Object} registrationData.metadata - Additional metadata
   * @returns {Object} Registration result with client credentials
   */
  async registerClient(registrationData) {
    const { type, name, capabilities, metadata } = registrationData;
    
    // Validate client type
    if (!Object.values(ClientType).includes(type)) {
      throw new Error(`Invalid client type: ${type}`);
    }
    
    // Generate client credentials
    const clientId = this.generateClientId(type);
    const apiKey = this.generateApiKey();
    const apiSecret = this.generateApiSecret();
    
    // Create client record
    const client = {
      clientId,
      type,
      name,
      capabilities: capabilities || [],
      metadata: metadata || {},
      
      // Authentication
      apiKey,
      apiSecretHash: this.hashSecret(apiSecret),
      
      // Status
      status: this.config.requireManualApproval ? ClientStatus.PENDING : ClientStatus.ACTIVE,
      
      // Trust and reputation
      trustScore: this.config.minTrustScore, // Start with minimum trust
      reputationData: {
        transactionCount: 0,
        successfulTransactions: 0,
        failedTransactions: 0,
        averageResponseTime: 0,
        reportedIssues: 0,
      },
      
      // Timestamps
      registeredAt: new Date().toISOString(),
      lastActiveAt: null,
      
      // Limits
      rateLimit: this.config.defaultRateLimit,
    };
    
    // Store client
    this.clients.set(clientId, client);
    this.trustScores.set(clientId, client.trustScore);
    
    // Initialize rate limiter
    this.rateLimits.set(clientId, {
      requests: [],
      limit: client.rateLimit,
    });
    
    // Emit registration event
    this.emit('client:registered', {
      clientId,
      type,
      name,
      status: client.status,
    });
    
    console.log(`✓ Registered ${type}: ${name} (${clientId})`);
    
    // Return credentials (only returned once, store securely!)
    return {
      clientId,
      apiKey,
      apiSecret, // Only returned on registration
      status: client.status,
      message: client.status === ClientStatus.PENDING
        ? 'Registration pending approval'
        : 'Registration successful',
    };
  }

  /**
   * Approve a pending client registration.
   * 
   * @param {String} clientId - Client ID to approve
   * @returns {Boolean} Success status
   */
  async approveClient(clientId) {
    const client = this.clients.get(clientId);
    
    if (!client) {
      throw new Error('Client not found');
    }
    
    if (client.status !== ClientStatus.PENDING) {
      throw new Error('Client is not pending approval');
    }
    
    client.status = ClientStatus.ACTIVE;
    this.emit('client:approved', { clientId, type: client.type });
    
    console.log(`✓ Approved client: ${clientId}`);
    return true;
  }

  // ==========================================================================
  // AUTHENTICATION & AUTHORIZATION
  // ==========================================================================

  /**
   * Authenticate a client using API key and secret.
   * 
   * @param {String} apiKey - Client's API key
   * @param {String} apiSecret - Client's API secret
   * @returns {Object|null} Client data if authenticated, null otherwise
   */
  authenticate(apiKey, apiSecret) {
    // Find client by API key
    const client = Array.from(this.clients.values())
      .find(c => c.apiKey === apiKey);
    
    if (!client) {
      return null;
    }
    
    // Verify secret
    const secretHash = this.hashSecret(apiSecret);
    if (secretHash !== client.apiSecretHash) {
      return null;
    }
    
    // Check if client is active
    if (client.status !== ClientStatus.ACTIVE) {
      return null;
    }
    
    // Update last active timestamp
    client.lastActiveAt = new Date().toISOString();
    
    return {
      clientId: client.clientId,
      type: client.type,
      name: client.name,
      capabilities: client.capabilities,
      trustScore: client.trustScore,
    };
  }

  /**
   * Create a session for an authenticated client.
   * 
   * @param {String} clientId - Client ID
   * @returns {String} Session token
   */
  createSession(clientId) {
    const client = this.clients.get(clientId);
    
    if (!client) {
      throw new Error('Client not found');
    }
    
    const sessionToken = this.generateSessionToken();
    const session = {
      sessionToken,
      clientId,
      type: client.type,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      lastActivityAt: new Date().toISOString(),
    };
    
    this.sessions.set(sessionToken, session);
    
    // Start heartbeat monitoring
    this.startHeartbeatMonitoring(clientId, sessionToken);
    
    return sessionToken;
  }

  /**
   * Validate a session token.
   * 
   * @param {String} sessionToken - Session token to validate
   * @returns {Object|null} Session data if valid, null otherwise
   */
  validateSession(sessionToken) {
    const session = this.sessions.get(sessionToken);
    
    if (!session) {
      return null;
    }
    
    // Check if session has expired
    if (new Date() > new Date(session.expiresAt)) {
      this.sessions.delete(sessionToken);
      return null;
    }
    
    // Update last activity
    session.lastActivityAt = new Date().toISOString();
    
    return session;
  }

  /**
   * Check if a client has a specific capability.
   * 
   * @param {String} clientId - Client ID
   * @param {String} capability - Capability to check
   * @returns {Boolean} True if client has capability
   */
  hasCapability(clientId, capability) {
    const client = this.clients.get(clientId);
    return client && client.capabilities.includes(capability);
  }

  // ==========================================================================
  // TRUST & REPUTATION MANAGEMENT
  // ==========================================================================

  /**
   * Calculate and update a client's trust score.
   * Trust scores are dynamic and based on:
   * - Transaction success rate
   * - Response time consistency
   * - Reported issues
   * - Time in ecosystem
   * - Peer reviews
   * 
   * @param {String} clientId - Client ID
   * @returns {Number} Updated trust score (0.0 - 1.0)
   */
  updateTrustScore(clientId) {
    const client = this.clients.get(clientId);
    
    if (!client) {
      throw new Error('Client not found');
    }
    
    const { reputationData } = client;
    let score = this.config.minTrustScore;
    
    // Factor 1: Transaction success rate (40% weight)
    if (reputationData.transactionCount > 0) {
      const successRate = reputationData.successfulTransactions / reputationData.transactionCount;
      score += successRate * 0.4;
    }
    
    // Factor 2: Response time consistency (20% weight)
    if (reputationData.averageResponseTime > 0) {
      // Assume good response time is under 500ms
      const responseScore = Math.max(0, 1 - (reputationData.averageResponseTime / 1000));
      score += responseScore * 0.2;
    }
    
    // Factor 3: Issue reporting (20% weight, negative impact)
    if (reputationData.reportedIssues > 0) {
      const issueRate = Math.min(1, reputationData.reportedIssues / 10);
      score -= issueRate * 0.2;
    }
    
    // Factor 4: Time in ecosystem (10% weight)
    const daysSinceRegistration = (new Date() - new Date(client.registeredAt)) / (1000 * 60 * 60 * 24);
    const tenureScore = Math.min(1, daysSinceRegistration / 90); // Max out at 90 days
    score += tenureScore * 0.1;
    
    // Factor 5: Volume (10% weight)
    const volumeScore = Math.min(1, reputationData.transactionCount / 100); // Max out at 100 transactions
    score += volumeScore * 0.1;
    
    // Clamp score between min and max
    score = Math.max(this.config.minTrustScore, Math.min(this.config.maxTrustScore, score));
    
    // Update stored score
    client.trustScore = score;
    this.trustScores.set(clientId, score);
    
    this.emit('trust:updated', { clientId, oldScore: client.trustScore, newScore: score });
    
    return score;
  }

  /**
   * Record a transaction outcome for reputation tracking.
   * 
   * @param {String} clientId - Client ID
   * @param {Boolean} successful - Whether transaction was successful
   * @param {Number} responseTime - Response time in milliseconds
   */
  recordTransaction(clientId, successful, responseTime) {
    const client = this.clients.get(clientId);
    
    if (!client) {
      return;
    }
    
    // Update transaction counts
    client.reputationData.transactionCount++;
    if (successful) {
      client.reputationData.successfulTransactions++;
    } else {
      client.reputationData.failedTransactions++;
    }
    
    // Update average response time
    const currentAvg = client.reputationData.averageResponseTime;
    const count = client.reputationData.transactionCount;
    client.reputationData.averageResponseTime = 
      ((currentAvg * (count - 1)) + responseTime) / count;
    
    // Recalculate trust score
    this.updateTrustScore(clientId);
  }

  /**
   * Report an issue with a client.
   * 
   * @param {String} clientId - Client ID
   * @param {Object} issue - Issue details
   */
  reportIssue(clientId, issue) {
    const client = this.clients.get(clientId);
    
    if (!client) {
      return;
    }
    
    client.reputationData.reportedIssues++;
    
    this.emit('issue:reported', { clientId, issue });
    
    // Recalculate trust score
    this.updateTrustScore(clientId);
    
    // Auto-suspend if trust score drops too low
    if (client.trustScore < this.config.minTrustScore) {
      this.suspendClient(clientId, 'Trust score below minimum threshold');
    }
  }

  // ==========================================================================
  // RATE LIMITING
  // ==========================================================================

  /**
   * Check if a client has exceeded their rate limit.
   * 
   * @param {String} clientId - Client ID
   * @returns {Boolean} True if within rate limit, false if exceeded
   */
  checkRateLimit(clientId) {
    const client = this.clients.get(clientId);
    const rateLimitData = this.rateLimits.get(clientId);
    
    if (!client || !rateLimitData) {
      return false;
    }
    
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Remove old requests
    rateLimitData.requests = rateLimitData.requests.filter(
      timestamp => timestamp > oneMinuteAgo
    );
    
    // Check if under limit
    if (rateLimitData.requests.length >= rateLimitData.limit) {
      this.emit('ratelimit:exceeded', { clientId });
      return false;
    }
    
    // Record this request
    rateLimitData.requests.push(now);
    return true;
  }

  /**
   * Update a client's rate limit.
   * 
   * @param {String} clientId - Client ID
   * @param {Number} newLimit - New rate limit (requests per minute)
   */
  updateRateLimit(clientId, newLimit) {
    const client = this.clients.get(clientId);
    const rateLimitData = this.rateLimits.get(clientId);
    
    if (!client || !rateLimitData) {
      throw new Error('Client not found');
    }
    
    client.rateLimit = newLimit;
    rateLimitData.limit = newLimit;
    
    this.emit('ratelimit:updated', { clientId, newLimit });
  }

  // ==========================================================================
  // CONNECTION MONITORING
  // ==========================================================================

  /**
   * Start monitoring client connections via heartbeats.
   */
  startMonitoring() {
    console.log('✓ Client monitoring started');
  }

  /**
   * Start heartbeat monitoring for a specific client session.
   * 
   * @param {String} clientId - Client ID
   * @param {String} sessionToken - Session token
   */
  startHeartbeatMonitoring(clientId, sessionToken) {
    const timer = setTimeout(() => {
      this.handleMissedHeartbeat(clientId, sessionToken);
    }, this.config.heartbeatTimeout);
    
    this.heartbeatTimers.set(sessionToken, timer);
  }

  /**
   * Record a heartbeat from a client.
   * 
   * @param {String} sessionToken - Session token
   */
  recordHeartbeat(sessionToken) {
    const session = this.sessions.get(sessionToken);
    
    if (!session) {
      return;
    }
    
    // Reset the heartbeat timer
    const existingTimer = this.heartbeatTimers.get(sessionToken);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    this.startHeartbeatMonitoring(session.clientId, sessionToken);
    
    // Update last activity
    session.lastActivityAt = new Date().toISOString();
  }

  /**
   * Handle a missed heartbeat (connection likely lost).
   * 
   * @param {String} clientId - Client ID
   * @param {String} sessionToken - Session token
   */
  handleMissedHeartbeat(clientId, sessionToken) {
    console.warn(`⚠ Missed heartbeat from client: ${clientId}`);
    
    // End the session
    this.sessions.delete(sessionToken);
    this.heartbeatTimers.delete(sessionToken);
    
    this.emit('connection:lost', { clientId, sessionToken });
  }

  // ==========================================================================
  // CLIENT MANAGEMENT
  // ==========================================================================

  /**
   * Get a client by ID.
   * 
   * @param {String} clientId - Client ID
   * @returns {Object|null} Client data
   */
  getClient(clientId) {
    const client = this.clients.get(clientId);
    
    if (!client) {
      return null;
    }
    
    // Return sanitized client data (no secrets)
    return {
      clientId: client.clientId,
      type: client.type,
      name: client.name,
      capabilities: client.capabilities,
      status: client.status,
      trustScore: client.trustScore,
      reputationData: client.reputationData,
      registeredAt: client.registeredAt,
      lastActiveAt: client.lastActiveAt,
    };
  }

  /**
   * Get all clients, optionally filtered by type or status.
   * 
   * @param {Object} filters - Filter criteria
   * @returns {Array} Array of client data
   */
  getClients(filters = {}) {
    const clients = Array.from(this.clients.values());
    
    let filtered = clients;
    
    if (filters.type) {
      filtered = filtered.filter(c => c.type === filters.type);
    }
    
    if (filters.status) {
      filtered = filtered.filter(c => c.status === filters.status);
    }
    
    if (filters.minTrustScore !== undefined) {
      filtered = filtered.filter(c => c.trustScore >= filters.minTrustScore);
    }
    
    // Return sanitized data
    return filtered.map(client => this.getClient(client.clientId));
  }

  /**
   * Suspend a client.
   * 
   * @param {String} clientId - Client ID
   * @param {String} reason - Suspension reason
   */
  suspendClient(clientId, reason) {
    const client = this.clients.get(clientId);
    
    if (!client) {
      throw new Error('Client not found');
    }
    
    client.status = ClientStatus.SUSPENDED;
    
    // Terminate all active sessions
    for (const [sessionToken, session] of this.sessions.entries()) {
      if (session.clientId === clientId) {
        this.sessions.delete(sessionToken);
        const timer = this.heartbeatTimers.get(sessionToken);
        if (timer) {
          clearTimeout(timer);
          this.heartbeatTimers.delete(sessionToken);
        }
      }
    }
    
    this.emit('client:suspended', { clientId, reason });
    
    console.log(`⚠ Suspended client: ${clientId} (${reason})`);
  }

  /**
   * Reactivate a suspended client.
   * 
   * @param {String} clientId - Client ID
   */
  reactivateClient(clientId) {
    const client = this.clients.get(clientId);
    
    if (!client) {
      throw new Error('Client not found');
    }
    
    if (client.status !== ClientStatus.SUSPENDED) {
      throw new Error('Client is not suspended');
    }
    
    client.status = ClientStatus.ACTIVE;
    
    this.emit('client:reactivated', { clientId });
    
    console.log(`✓ Reactivated client: ${clientId}`);
  }

  /**
   * Deactivate a client permanently.
   * 
   * @param {String} clientId - Client ID
   * @param {String} reason - Deactivation reason
   */
  deactivateClient(clientId, reason) {
    const client = this.clients.get(clientId);
    
    if (!client) {
      throw new Error('Client not found');
    }
    
    client.status = ClientStatus.DEACTIVATED;
    
    // Terminate all active sessions
    for (const [sessionToken, session] of this.sessions.entries()) {
      if (session.clientId === clientId) {
        this.sessions.delete(sessionToken);
        const timer = this.heartbeatTimers.get(sessionToken);
        if (timer) {
          clearTimeout(timer);
          this.heartbeatTimers.delete(sessionToken);
        }
      }
    }
    
    this.emit('client:deactivated', { clientId, reason });
    
    console.log(`✗ Deactivated client: ${clientId} (${reason})`);
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  /**
   * Generate a unique client ID.
   * 
   * @param {String} type - Client type
   * @returns {String} Client ID
   */
  generateClientId(type) {
    const prefix = type === ClientType.SCOUT ? 'sct' :
                   type === ClientType.BEACON ? 'bcn' : 'tpa';
    const random = crypto.randomBytes(16).toString('hex');
    return `${prefix}_${random}`;
  }

  /**
   * Generate an API key.
   * 
   * @returns {String} API key
   */
  generateApiKey() {
    return `ak_${crypto.randomBytes(32).toString('hex')}`;
  }

  /**
   * Generate an API secret.
   * 
   * @returns {String} API secret
   */
  generateApiSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate a session token.
   * 
   * @returns {String} Session token
   */
  generateSessionToken() {
    return `st_${crypto.randomBytes(32).toString('hex')}`;
  }

  /**
   * Hash a secret using SHA-256.
   * 
   * @param {String} secret - Secret to hash
   * @returns {String} Hashed secret
   */
  hashSecret(secret) {
    return crypto.createHash('sha256').update(secret).digest('hex');
  }

  /**
   * Get statistics about registered clients.
   * 
   * @returns {Object} Statistics
   */
  getStatistics() {
    const clients = Array.from(this.clients.values());
    
    return {
      total: clients.length,
      scouts: clients.filter(c => c.type === ClientType.SCOUT).length,
      beacons: clients.filter(c => c.type === ClientType.BEACON).length,
      thirdParty: clients.filter(c => c.type === ClientType.THIRD_PARTY_AGENT).length,
      active: clients.filter(c => c.status === ClientStatus.ACTIVE).length,
      pending: clients.filter(c => c.status === ClientStatus.PENDING).length,
      suspended: clients.filter(c => c.status === ClientStatus.SUSPENDED).length,
      deactivated: clients.filter(c => c.status === ClientStatus.DEACTIVATED).length,
      activeSessions: this.sessions.size,
      averageTrustScore: clients.reduce((sum, c) => sum + c.trustScore, 0) / clients.length || 0,
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  ClientManager,
  ClientType,
  ClientStatus,
};
