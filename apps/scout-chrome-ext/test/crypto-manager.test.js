/**
 * CryptoManager Tests
 *
 * Tests Ed25519 key generation, signing, and verification
 * using tweetnacl. Verifies storage integration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateKeyPair,
  getOrCreateKeyPair,
  sign,
  verify,
  getPublicKeyHex,
  getKeyId,
  deleteKeyPair,
} from '../src/lib/crypto-manager.js';

// Mock storage with persistent Map that survives clearAllMocks
const store = new Map();

vi.mock('../src/lib/storage.js', () => ({
  get: vi.fn((key) => Promise.resolve(store.get(key) ?? null)),
  set: vi.fn((key, value) => { store.set(key, value); return Promise.resolve(); }),
  remove: vi.fn((key) => { store.delete(key); return Promise.resolve(); }),
}));

import * as storage from '../src/lib/storage.js';

describe('CryptoManager', () => {
  beforeEach(() => {
    store.clear();
    // Re-implement mock functions after clearing
    storage.get.mockImplementation((key) => Promise.resolve(store.get(key) ?? null));
    storage.set.mockImplementation((key, value) => { store.set(key, value); return Promise.resolve(); });
    storage.remove.mockImplementation((key) => { store.delete(key); return Promise.resolve(); });
  });

  describe('generateKeyPair', () => {
    it('should generate a valid Ed25519 key pair', () => {
      const pair = generateKeyPair();

      expect(pair.publicKey).toBeDefined();
      expect(pair.secretKey).toBeDefined();
      expect(typeof pair.publicKey).toBe('string');
      expect(typeof pair.secretKey).toBe('string');
    });

    it('should generate different key pairs each time', () => {
      const pair1 = generateKeyPair();
      const pair2 = generateKeyPair();

      expect(pair1.publicKey).not.toBe(pair2.publicKey);
    });
  });

  describe('getOrCreateKeyPair', () => {
    it('should create and store a key pair on first call', async () => {
      const pair = await getOrCreateKeyPair();

      expect(pair.publicKey).toBeDefined();
      expect(pair.secretKey).toBeDefined();
      expect(storage.set).toHaveBeenCalled();
    });

    it('should return stored key pair on subsequent calls', async () => {
      const first = await getOrCreateKeyPair();

      // Clear mock call history but keep stored data
      vi.clearAllMocks();

      const second = await getOrCreateKeyPair();

      expect(second.publicKey).toBe(first.publicKey);
      expect(storage.set).not.toHaveBeenCalled();
    });
  });

  describe('sign and verify', () => {
    it('should produce a valid signature', async () => {
      const data = 'test message to sign';
      const signature = await sign(data);

      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);
    });

    it('should verify a valid signature', async () => {
      const data = 'verify this message';
      const signature = await sign(data);
      const pair = await getOrCreateKeyPair();

      const isValid = verify(data, signature, pair.publicKey);
      expect(isValid).toBe(true);
    });

    it('should reject a tampered message', async () => {
      const data = 'original message';
      const signature = await sign(data);
      const pair = await getOrCreateKeyPair();

      const isValid = verify('tampered message', signature, pair.publicKey);
      expect(isValid).toBe(false);
    });

    it('should reject a wrong public key', async () => {
      const data = 'test message';
      const signature = await sign(data);

      const otherPair = generateKeyPair();
      const isValid = verify(data, signature, otherPair.publicKey);
      expect(isValid).toBe(false);
    });
  });

  describe('getPublicKeyHex', () => {
    it('should return a hex string', async () => {
      const hex = await getPublicKeyHex();

      expect(typeof hex).toBe('string');
      expect(hex).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('getKeyId', () => {
    it('should return first 16 chars of hex public key', async () => {
      const keyId = await getKeyId();

      expect(keyId).toHaveLength(16);
      expect(keyId).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('deleteKeyPair', () => {
    it('should remove the stored key pair', async () => {
      await getOrCreateKeyPair();
      await deleteKeyPair();

      expect(storage.remove).toHaveBeenCalled();
    });
  });
});
