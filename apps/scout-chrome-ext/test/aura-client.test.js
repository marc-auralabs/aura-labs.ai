/**
 * AuraClient Tests
 *
 * Tests the HTTP client for AURA Core communication.
 * Uses mock fetch to verify request construction, error handling,
 * and response parsing without hitting the real API.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuraClient } from '../src/lib/aura-client.js';
import { AuthenticationError, ConnectionError, ScoutError } from '../src/shared/errors.js';
import { CORE_API_URL, SDK_VERSION } from '../src/shared/constants.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock AbortSignal.timeout (not available in all test environments)
if (!AbortSignal.timeout) {
  AbortSignal.timeout = (ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  };
}

/**
 * Build a mock Response object.
 */
function mockResponse(body, { status = 200, ok = true } = {}) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

describe('AuraClient', () => {
  let client;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new AuraClient();
  });

  describe('constructor', () => {
    it('should not require apiKey (zero-config)', () => {
      expect(() => new AuraClient()).not.toThrow();
    });

    it('should use default baseUrl and timeout', () => {
      const c = new AuraClient();
      expect(c.baseUrl).toBe(CORE_API_URL);
    });

    it('should accept custom baseUrl', () => {
      const c = new AuraClient({ baseUrl: 'https://custom.api.com' });
      expect(c.baseUrl).toBe('https://custom.api.com');
    });

    it('should accept optional apiKey for legacy auth', () => {
      const c = new AuraClient({ apiKey: 'legacy_key' });
      expect(c.baseUrl).toBe(CORE_API_URL);
    });
  });

  describe('createSession', () => {
    it('should POST to /sessions with intent, agentId, and constraints', async () => {
      const sessionData = { sessionId: 'sess_123', status: 'created' };
      mockFetch.mockResolvedValue(mockResponse(sessionData));

      const result = await client.createSession(
        'I need 10 keyboards',
        'agent_abc',
        { maxBudget: 1500, currency: 'USD' }
      );

      expect(result).toEqual(sessionData);
      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${CORE_API_URL}/sessions`);
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({
        intent: 'I need 10 keyboards',
        agentId: 'agent_abc',
        constraints: { maxBudget: 1500, currency: 'USD' },
      });
    });

    it('should include SDK version header', async () => {
      mockFetch.mockResolvedValue(mockResponse({ sessionId: 'sess_123' }));

      await client.createSession('test intent', 'agent_1');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['X-Scout-SDK']).toBe(SDK_VERSION);
    });

    it('should include Bearer token when apiKey is set', async () => {
      const legacyClient = new AuraClient({ apiKey: 'test_key_abc123' });
      mockFetch.mockResolvedValue(mockResponse({ sessionId: 'sess_123' }));

      await legacyClient.createSession('test intent', 'agent_1');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer test_key_abc123');
    });

    it('should include agent identity headers when identity is set', async () => {
      const signFn = vi.fn().mockResolvedValue('mock_signature_base64');
      client.setIdentity('agent-uuid-123', signFn);

      mockFetch.mockResolvedValue(mockResponse({ sessionId: 'sess_123' }));
      await client.createSession('test intent', 'agent-uuid-123');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['X-Agent-Id']).toBe('agent-uuid-123');
      expect(options.headers['X-Agent-Signature']).toBe('mock_signature_base64');
      expect(options.headers['X-Agent-Timestamp']).toBeDefined();
      // Should NOT have Bearer token when identity is set
      expect(options.headers['Authorization']).toBeUndefined();
    });
  });

  describe('registerAgent', () => {
    it('should POST to /agents/register with proof-of-possession', async () => {
      const agentData = { agentId: 'agent-123', status: 'active', keyId: 'abc' };
      mockFetch.mockResolvedValue(mockResponse(agentData));

      const signFn = vi.fn().mockResolvedValue('sig_base64');
      const result = await client.registerAgent({
        publicKey: 'pk_base64',
        type: 'scout',
        manifest: { name: 'Test' },
        signFn,
      });

      expect(result).toEqual(agentData);
      expect(signFn).toHaveBeenCalledOnce();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${CORE_API_URL}/agents/register`);
      expect(options.method).toBe('POST');
      expect(options.headers['X-Agent-Signature']).toBe('sig_base64');
    });
  });

  describe('getSession', () => {
    it('should GET /sessions/:id', async () => {
      const sessionData = { sessionId: 'sess_456', status: 'offers_available' };
      mockFetch.mockResolvedValue(mockResponse(sessionData));

      const result = await client.getSession('sess_456');

      expect(result).toEqual(sessionData);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${CORE_API_URL}/sessions/sess_456`);
      expect(options.method).toBe('GET');
    });
  });

  describe('getOffers', () => {
    it('should GET /sessions/:id/offers', async () => {
      const offersData = { sessionId: 'sess_789', offers: [{ id: 'offer_1' }] };
      mockFetch.mockResolvedValue(mockResponse(offersData));

      const result = await client.getOffers('sess_789');

      expect(result).toEqual(offersData);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(`${CORE_API_URL}/sessions/sess_789/offers`);
    });
  });

  describe('commitOffer', () => {
    it('should POST to /sessions/:id/commit with offerId', async () => {
      const txData = { transactionId: 'txn_abc', status: 'committed' };
      mockFetch.mockResolvedValue(mockResponse(txData));

      // Mock crypto.randomUUID for consistent test
      vi.stubGlobal('crypto', {
        randomUUID: () => 'uuid-1234',
        subtle: { digest: vi.fn() },
      });

      const result = await client.commitOffer('sess_1', 'offer_2');

      expect(result).toEqual(txData);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${CORE_API_URL}/sessions/sess_1/commit`);
      expect(JSON.parse(options.body)).toEqual({
        offerId: 'offer_2',
        idempotencyKey: 'uuid-1234',
      });
    });

    it('should use provided idempotencyKey', async () => {
      mockFetch.mockResolvedValue(mockResponse({ transactionId: 'txn_abc' }));

      await client.commitOffer('sess_1', 'offer_2', 'custom-key');

      const [, options] = mockFetch.mock.calls[0];
      expect(JSON.parse(options.body).idempotencyKey).toBe('custom-key');
    });
  });

  describe('cancelSession', () => {
    it('should POST to /sessions/:id/cancel', async () => {
      mockFetch.mockResolvedValue(mockResponse({ sessionId: 'sess_1', status: 'cancelled' }));

      const result = await client.cancelSession('sess_1');

      expect(result.status).toBe('cancelled');
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${CORE_API_URL}/sessions/sess_1/cancel`);
      expect(options.method).toBe('POST');
    });
  });

  describe('healthCheck', () => {
    it('should GET /health', async () => {
      mockFetch.mockResolvedValue(mockResponse({ status: 'ok' }));

      const result = await client.healthCheck();
      expect(result.status).toBe('ok');
    });
  });

  describe('error handling', () => {
    it('should throw AuthenticationError on 401', async () => {
      mockFetch.mockResolvedValue(mockResponse(
        { message: 'Invalid API key' },
        { status: 401, ok: false }
      ));

      await expect(client.getSession('sess_1'))
        .rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError on 403', async () => {
      mockFetch.mockResolvedValue(mockResponse(
        { message: 'Agent revoked' },
        { status: 403, ok: false }
      ));

      await expect(client.getSession('sess_1'))
        .rejects.toThrow(AuthenticationError);
    });

    it('should throw ScoutError with NOT_FOUND on 404', async () => {
      mockFetch.mockResolvedValue(mockResponse(
        { message: 'Session not found' },
        { status: 404, ok: false }
      ));

      await expect(client.getSession('nonexistent'))
        .rejects.toThrow(ScoutError);

      try {
        await client.getSession('nonexistent');
      } catch (e) {
        expect(e.code).toBe('NOT_FOUND');
      }
    });

    it('should throw ScoutError on generic server error', async () => {
      mockFetch.mockResolvedValue(mockResponse(
        { message: 'Internal server error' },
        { status: 500, ok: false }
      ));

      await expect(client.healthCheck())
        .rejects.toThrow(ScoutError);
    });

    it('should throw ConnectionError on network failure', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(client.healthCheck())
        .rejects.toThrow(ConnectionError);
    });

    it('should throw ConnectionError on timeout', async () => {
      const abortError = new DOMException('Signal timed out', 'TimeoutError');
      mockFetch.mockRejectedValue(abortError);

      await expect(client.healthCheck())
        .rejects.toThrow(ConnectionError);
    });

    it('should handle malformed error response body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      });

      await expect(client.healthCheck())
        .rejects.toThrow(ScoutError);
    });
  });
});
