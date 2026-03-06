/**
 * SessionManager Tests
 *
 * Tests the session lifecycle state machine, polling behaviour,
 * and event dispatching. Uses mock AuraClient and CryptoManager
 * to avoid real API calls and key generation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../src/lib/session-manager.js';
import { UIState, SessionStatus, StorageKeys } from '../src/shared/constants.js';
import { SessionError } from '../src/shared/errors.js';

// Mock the storage module
const storageStore = new Map();
vi.mock('../src/lib/storage.js', () => ({
  get: vi.fn((key) => Promise.resolve(storageStore.get(key) ?? null)),
  set: vi.fn((key, value) => { storageStore.set(key, value); return Promise.resolve(); }),
  remove: vi.fn((key) => { storageStore.delete(key); return Promise.resolve(); }),
}));

// Mock crypto-manager — provides Ed25519 key generation and signing
vi.mock('../src/lib/crypto-manager.js', () => ({
  getOrCreateKeyPair: vi.fn().mockResolvedValue({
    publicKey: 'dGVzdF9wdWJsaWNfa2V5X2Jhc2U2NF8zMmJ5dGVz',
    secretKey: 'dGVzdF9zZWNyZXRfa2V5X2Jhc2U2NF82NGJ5dGVz',
  }),
  sign: vi.fn().mockResolvedValue('mock_signature_base64'),
  getPublicKeyBase64: vi.fn().mockResolvedValue('dGVzdF9wdWJsaWNfa2V5X2Jhc2U2NF8zMmJ5dGVz'),
}));

// Mock AuraClient — intercept the constructor
vi.mock('../src/lib/aura-client.js', () => ({
  AuraClient: vi.fn().mockImplementation(() => ({
    createSession: vi.fn(),
    getSession: vi.fn(),
    getOffers: vi.fn(),
    commitOffer: vi.fn(),
    cancelSession: vi.fn(),
    healthCheck: vi.fn(),
    setIdentity: vi.fn(),
    registerAgent: vi.fn().mockResolvedValue({
      agentId: 'agent_uuid_123',
      status: 'active',
      keyId: 'fingerprint_abc',
    }),
  })),
}));

import { AuraClient } from '../src/lib/aura-client.js';
import * as storage from '../src/lib/storage.js';

describe('SessionManager', () => {
  let manager;
  let mockClient;

  beforeEach(async () => {
    vi.useFakeTimers();
    storageStore.clear();

    manager = new SessionManager();
    await manager.init();

    // Get the mock client instance that was created
    mockClient = AuraClient.mock.results[AuraClient.mock.results.length - 1].value;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('initialisation', () => {
    it('should start in IDLE state', () => {
      expect(manager.state).toBe(UIState.IDLE);
    });

    it('should not be ready before init()', () => {
      const m = new SessionManager();
      expect(m.isReady).toBe(false);
    });

    it('should be ready after init()', () => {
      expect(manager.isReady).toBe(true);
    });

    it('should have an agentId after init()', () => {
      expect(manager.agentId).toBe('agent_uuid_123');
    });

    it('should register with AURA Core on first init', () => {
      expect(mockClient.registerAgent).toHaveBeenCalledOnce();
      expect(mockClient.setIdentity).toHaveBeenCalledWith(
        'agent_uuid_123',
        expect.any(Function)
      );
    });

    it('should persist agentId to storage', () => {
      expect(storageStore.get(StorageKeys.AGENT_ID)).toBe('agent_uuid_123');
    });

    it('should load stored agentId instead of re-registering', async () => {
      // Clear mocks and set stored agent ID
      vi.clearAllMocks();
      storageStore.set(StorageKeys.AGENT_ID, 'existing_agent_id');

      const m = new SessionManager();
      await m.init();

      // Should NOT call registerAgent since agentId was in storage
      const client = AuraClient.mock.results[AuraClient.mock.results.length - 1].value;
      expect(client.registerAgent).not.toHaveBeenCalled();
      expect(m.agentId).toBe('existing_agent_id');
    });

    it('should throw SessionError if startSession called before init', async () => {
      const m = new SessionManager();
      await expect(m.startSession('test'))
        .rejects.toThrow(SessionError);
    });
  });

  describe('startSession', () => {
    it('should transition to SEARCHING state', async () => {
      const states = [];
      manager.addEventListener('state-change', (e) => states.push(e.detail.current));

      mockClient.createSession.mockResolvedValue({
        sessionId: 'sess_1',
        status: 'created',
      });

      await manager.startSession('I need keyboards');

      expect(states[0]).toBe(UIState.SEARCHING);
      expect(manager.state).toBe(UIState.SEARCHING);
    });

    it('should call createSession with intent, agentId, and constraints', async () => {
      mockClient.createSession.mockResolvedValue({ sessionId: 'sess_1', status: 'created' });

      await manager.startSession('10 keyboards', { maxBudget: 1500 });

      expect(mockClient.createSession).toHaveBeenCalledWith(
        '10 keyboards',
        'agent_uuid_123',
        { maxBudget: 1500 }
      );
    });

    it('should persist session ID to storage', async () => {
      mockClient.createSession.mockResolvedValue({ sessionId: 'sess_42', status: 'created' });

      await manager.startSession('test');

      expect(storage.set).toHaveBeenCalledWith(StorageKeys.CURRENT_SESSION, 'sess_42');
    });

    it('should transition to ERROR on API failure', async () => {
      mockClient.createSession.mockRejectedValue(new Error('Network error'));

      await expect(manager.startSession('test')).rejects.toThrow();
      expect(manager.state).toBe(UIState.ERROR);
    });
  });

  describe('polling', () => {
    beforeEach(async () => {
      mockClient.createSession.mockResolvedValue({ sessionId: 'sess_1', status: 'created' });
      await manager.startSession('keyboards');
    });

    it('should transition to OFFERS_READY when offers arrive', async () => {
      mockClient.getSession.mockResolvedValue({
        sessionId: 'sess_1',
        status: SessionStatus.OFFERS_AVAILABLE,
      });
      mockClient.getOffers.mockResolvedValue({
        offers: [{ id: 'offer_1', totalPrice: 500 }],
      });

      await vi.advanceTimersByTimeAsync(2000);

      expect(manager.state).toBe(UIState.OFFERS_READY);
      expect(manager.offers).toHaveLength(1);
    });

    it('should emit offers-ready event', async () => {
      const handler = vi.fn();
      manager.addEventListener('offers-ready', handler);

      mockClient.getSession.mockResolvedValue({
        sessionId: 'sess_1',
        status: SessionStatus.OFFERS_AVAILABLE,
      });
      mockClient.getOffers.mockResolvedValue({
        offers: [{ id: 'offer_1' }],
      });

      await vi.advanceTimersByTimeAsync(2000);

      expect(handler).toHaveBeenCalledOnce();
    });

    it('should transition to ERROR on poll timeout', async () => {
      mockClient.getSession.mockResolvedValue({
        sessionId: 'sess_1',
        status: SessionStatus.MARKET_FORMING,
      });

      // Advance past poll timeout (30s) in increments to allow async resolution
      for (let i = 0; i < 16; i++) {
        await vi.advanceTimersByTimeAsync(2000);
      }

      expect(manager.state).toBe(UIState.ERROR);
    });

    it('should stop polling when session enters terminal state', async () => {
      mockClient.getSession.mockResolvedValue({
        sessionId: 'sess_1',
        status: SessionStatus.CANCELLED,
      });

      await vi.advanceTimersByTimeAsync(2000);

      expect(manager.state).toBe(UIState.ERROR);
    });
  });

  describe('selectOffer', () => {
    beforeEach(async () => {
      mockClient.createSession.mockResolvedValue({ sessionId: 'sess_1', status: 'created' });
      mockClient.getSession.mockResolvedValue({
        sessionId: 'sess_1',
        status: SessionStatus.OFFERS_AVAILABLE,
      });
      mockClient.getOffers.mockResolvedValue({
        offers: [
          { id: 'offer_a', totalPrice: 500, beaconName: 'Vendor A' },
          { id: 'offer_b', totalPrice: 450, beaconName: 'Vendor B' },
        ],
      });

      await manager.startSession('keyboards');
      await vi.advanceTimersByTimeAsync(2000);
    });

    it('should transition to MANDATE_FLOW', () => {
      manager.selectOffer('offer_a');
      expect(manager.state).toBe(UIState.MANDATE_FLOW);
      expect(manager.selectedOffer.id).toBe('offer_a');
    });

    it('should throw SessionError for unknown offer', () => {
      expect(() => manager.selectOffer('nonexistent'))
        .toThrow(SessionError);
    });
  });

  describe('commitOffer', () => {
    it('should transition to CONFIRMATION on success', async () => {
      mockClient.createSession.mockResolvedValue({ sessionId: 'sess_1', status: 'created' });
      mockClient.getSession.mockResolvedValue({
        sessionId: 'sess_1',
        status: SessionStatus.OFFERS_AVAILABLE,
      });
      mockClient.getOffers.mockResolvedValue({
        offers: [{ id: 'offer_a', totalPrice: 500 }],
      });
      mockClient.commitOffer.mockResolvedValue({
        transactionId: 'txn_1',
        status: 'committed',
      });

      await manager.startSession('keyboards');
      await vi.advanceTimersByTimeAsync(2000);
      manager.selectOffer('offer_a');

      const tx = await manager.commitOffer();

      expect(tx.transactionId).toBe('txn_1');
      expect(manager.state).toBe(UIState.CONFIRMATION);
    });
  });

  describe('cancelSession', () => {
    it('should reset to IDLE', async () => {
      mockClient.createSession.mockResolvedValue({ sessionId: 'sess_1', status: 'created' });
      await manager.startSession('keyboards');

      await manager.cancelSession();

      expect(manager.state).toBe(UIState.IDLE);
      expect(manager.session).toBeNull();
    });
  });

  describe('newSession', () => {
    it('should reset and transition to INTENT_INPUT', () => {
      manager.newSession();
      expect(manager.state).toBe(UIState.INTENT_INPUT);
    });
  });
});
