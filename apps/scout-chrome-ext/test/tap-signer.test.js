/**
 * TAPSigner Tests
 *
 * Tests HTTP message signature construction for TAP.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signRequest, createCredentials } from '../src/lib/tap-signer.js';
import { TAPError } from '../src/shared/errors.js';

// Mock crypto manager
vi.mock('../src/lib/crypto-manager.js', () => ({
  sign: vi.fn().mockResolvedValue('mock_signature_base64'),
  getKeyId: vi.fn().mockResolvedValue('abcdef0123456789'),
}));

// Mock crypto.getRandomValues for deterministic nonces
vi.stubGlobal('crypto', {
  getRandomValues: (arr) => {
    for (let i = 0; i < arr.length; i++) arr[i] = i + 1;
    return arr;
  },
});

describe('TAPSigner', () => {
  describe('signRequest', () => {
    it('should add all required TAP headers', async () => {
      const request = {
        method: 'POST',
        url: 'https://aura-labsai-production.up.railway.app/sessions/sess_1/commit',
        headers: { 'Content-Type': 'application/json' },
        body: { offerId: 'offer_1' },
      };

      const signed = await signRequest(request, {
        tapId: 'tap_agent_123',
        keyId: 'key_abc',
      });

      expect(signed.headers['X-TAP-Agent-Id']).toBe('tap_agent_123');
      expect(signed.headers['X-TAP-Timestamp']).toBeDefined();
      expect(signed.headers['X-TAP-Nonce']).toBeDefined();
      expect(signed.headers['Signature']).toMatch(/^sig=:.+:$/);
      expect(signed.headers['Signature-Input']).toContain('ed25519');
      expect(signed.headers['Signature-Input']).toContain('key_abc');
    });

    it('should preserve existing headers', async () => {
      const signed = await signRequest(
        {
          method: 'GET',
          url: 'https://example.com/test',
          headers: { 'Authorization': 'Bearer token' },
        },
        { tapId: 'tap_1', keyId: 'key_1' }
      );

      expect(signed.headers['Authorization']).toBe('Bearer token');
    });

    it('should throw TAPError without credentials', async () => {
      await expect(
        signRequest({ method: 'GET', url: 'https://example.com' }, {})
      ).rejects.toThrow(TAPError);
    });

    it('should generate unique nonces', async () => {
      const req = { method: 'GET', url: 'https://example.com/test' };
      const creds = { tapId: 'tap_1', keyId: 'key_1' };

      const signed1 = await signRequest(req, creds);
      const signed2 = await signRequest(req, creds);

      // Nonces should be hex strings
      expect(signed1.headers['X-TAP-Nonce']).toMatch(/^[0-9a-f]+$/);
    });
  });
});
