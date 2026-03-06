/**
 * Tests for Agent Authentication — Ed25519 Signature Verification
 *
 * Tests cover: key conversion, fingerprinting, registration signatures,
 * request signatures, timestamp validation, and the Fastify middleware hook.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  rawPublicKeyToKeyObject,
  computeKeyFingerprint,
  verifyRegistrationSignature,
  buildSigningString,
  verifyRequestSignature,
  createSignatureVerifier,
} from './agent-auth.js';

// ---------------------------------------------------------------------------
// Test helpers: generate Ed25519 key pairs in both raw and Node.js formats
// ---------------------------------------------------------------------------

/**
 * Generate an Ed25519 key pair and return raw base64-encoded keys
 * (mimicking tweetnacl.js output format)
 */
function generateTestKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

  // Extract raw 32-byte public key from SPKI DER
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  const rawPublic = spkiDer.subarray(spkiDer.length - 32);

  return {
    publicKeyBase64: rawPublic.toString('base64'),
    privateKeyObject: privateKey,
    publicKeyObject: publicKey,
  };
}

/**
 * Sign data with a Node.js Ed25519 private key, return base64 signature
 */
function signData(privateKeyObject, data) {
  const signature = crypto.sign(null, Buffer.from(data), privateKeyObject);
  return signature.toString('base64');
}

// ---------------------------------------------------------------------------
// rawPublicKeyToKeyObject
// ---------------------------------------------------------------------------

describe('rawPublicKeyToKeyObject', () => {
  it('should convert a valid 32-byte raw Ed25519 public key to KeyObject', () => {
    const { publicKeyBase64 } = generateTestKeyPair();
    const keyObject = rawPublicKeyToKeyObject(publicKeyBase64);

    assert.equal(keyObject.type, 'public');
    assert.equal(keyObject.asymmetricKeyType, 'ed25519');
  });

  it('should reject keys that are not 32 bytes', () => {
    const tooShort = Buffer.alloc(16).toString('base64');
    assert.throws(
      () => rawPublicKeyToKeyObject(tooShort),
      /expected 32 bytes, got 16/
    );
  });

  it('should reject empty key', () => {
    assert.throws(
      () => rawPublicKeyToKeyObject(''),
      /expected 32 bytes, got 0/
    );
  });

  it('should reject key that is 64 bytes (private key size)', () => {
    const tooLong = Buffer.alloc(64).toString('base64');
    assert.throws(
      () => rawPublicKeyToKeyObject(tooLong),
      /expected 32 bytes, got 64/
    );
  });
});

// ---------------------------------------------------------------------------
// computeKeyFingerprint
// ---------------------------------------------------------------------------

describe('computeKeyFingerprint', () => {
  it('should return a 64-char hex string (SHA-256)', () => {
    const { publicKeyBase64 } = generateTestKeyPair();
    const fp = computeKeyFingerprint(publicKeyBase64);

    assert.equal(fp.length, 64);
    assert.match(fp, /^[0-9a-f]{64}$/);
  });

  it('should produce different fingerprints for different keys', () => {
    const key1 = generateTestKeyPair();
    const key2 = generateTestKeyPair();

    const fp1 = computeKeyFingerprint(key1.publicKeyBase64);
    const fp2 = computeKeyFingerprint(key2.publicKeyBase64);

    assert.notEqual(fp1, fp2);
  });

  it('should produce the same fingerprint for the same key', () => {
    const { publicKeyBase64 } = generateTestKeyPair();
    const fp1 = computeKeyFingerprint(publicKeyBase64);
    const fp2 = computeKeyFingerprint(publicKeyBase64);

    assert.equal(fp1, fp2);
  });
});

// ---------------------------------------------------------------------------
// verifyRegistrationSignature
// ---------------------------------------------------------------------------

describe('verifyRegistrationSignature', () => {
  it('should verify a valid proof-of-possession signature', () => {
    const { publicKeyBase64, privateKeyObject } = generateTestKeyPair();
    const body = JSON.stringify({ publicKey: publicKeyBase64, type: 'scout' });
    const signature = signData(privateKeyObject, body);

    const result = verifyRegistrationSignature(publicKeyBase64, signature, body);
    assert.equal(result, true);
  });

  it('should reject signature from a different key', () => {
    const agent1 = generateTestKeyPair();
    const agent2 = generateTestKeyPair();
    const body = JSON.stringify({ publicKey: agent1.publicKeyBase64, type: 'scout' });
    // Sign with agent2's key but claim agent1's public key
    const signature = signData(agent2.privateKeyObject, body);

    const result = verifyRegistrationSignature(agent1.publicKeyBase64, signature, body);
    assert.equal(result, false);
  });

  it('should reject signature over different data', () => {
    const { publicKeyBase64, privateKeyObject } = generateTestKeyPair();
    const realBody = JSON.stringify({ publicKey: publicKeyBase64, type: 'scout' });
    const fakeBody = JSON.stringify({ publicKey: publicKeyBase64, type: 'beacon' });
    const signature = signData(privateKeyObject, realBody);

    const result = verifyRegistrationSignature(publicKeyBase64, signature, fakeBody);
    assert.equal(result, false);
  });

  it('should reject malformed signature', () => {
    const { publicKeyBase64 } = generateTestKeyPair();
    const body = JSON.stringify({ publicKey: publicKeyBase64 });

    const result = verifyRegistrationSignature(publicKeyBase64, 'not-a-signature', body);
    assert.equal(result, false);
  });

  it('should reject malformed public key gracefully', () => {
    const body = JSON.stringify({ publicKey: 'bad-key' });
    const result = verifyRegistrationSignature('bad-key', 'bad-sig', body);
    assert.equal(result, false);
  });
});

// ---------------------------------------------------------------------------
// buildSigningString
// ---------------------------------------------------------------------------

describe('buildSigningString', () => {
  it('should build canonical string with body', () => {
    const result = buildSigningString('POST', '/sessions', '1700000000000', '{"intent":"buy"}');
    const bodyDigest = crypto.createHash('sha256').update('{"intent":"buy"}').digest('base64');

    assert.equal(result, `POST\n/sessions\n1700000000000\n${bodyDigest}`);
  });

  it('should build canonical string without body', () => {
    const result = buildSigningString('GET', '/sessions/abc', '1700000000000', null);
    assert.equal(result, 'GET\n/sessions/abc\n1700000000000\n');
  });

  it('should produce different strings for different methods', () => {
    const get = buildSigningString('GET', '/foo', '123', null);
    const post = buildSigningString('POST', '/foo', '123', null);
    assert.notEqual(get, post);
  });

  it('should produce different strings for different paths', () => {
    const a = buildSigningString('GET', '/a', '123', null);
    const b = buildSigningString('GET', '/b', '123', null);
    assert.notEqual(a, b);
  });
});

// ---------------------------------------------------------------------------
// verifyRequestSignature
// ---------------------------------------------------------------------------

describe('verifyRequestSignature', () => {
  let keyPair;

  beforeEach(() => {
    keyPair = generateTestKeyPair();
  });

  it('should verify a valid signed GET request', () => {
    const timestamp = Date.now().toString();
    const signingString = buildSigningString('GET', '/sessions/123', timestamp, null);
    const signature = signData(keyPair.privateKeyObject, signingString);

    const result = verifyRequestSignature({
      publicKeyBase64: keyPair.publicKeyBase64,
      signatureBase64: signature,
      method: 'GET',
      path: '/sessions/123',
      timestamp,
      body: null,
    });

    assert.equal(result.valid, true);
  });

  it('should verify a valid signed POST request', () => {
    const timestamp = Date.now().toString();
    const body = JSON.stringify({ intent: 'buy widgets' });
    const signingString = buildSigningString('POST', '/sessions', timestamp, body);
    const signature = signData(keyPair.privateKeyObject, signingString);

    const result = verifyRequestSignature({
      publicKeyBase64: keyPair.publicKeyBase64,
      signatureBase64: signature,
      method: 'POST',
      path: '/sessions',
      timestamp,
      body,
    });

    assert.equal(result.valid, true);
  });

  it('should reject request with stale timestamp (6 minutes old)', () => {
    const staleTimestamp = (Date.now() - 6 * 60 * 1000).toString();
    const signingString = buildSigningString('GET', '/health', staleTimestamp, null);
    const signature = signData(keyPair.privateKeyObject, signingString);

    const result = verifyRequestSignature({
      publicKeyBase64: keyPair.publicKeyBase64,
      signatureBase64: signature,
      method: 'GET',
      path: '/health',
      timestamp: staleTimestamp,
      body: null,
    });

    assert.equal(result.valid, false);
    assert.match(result.reason, /too far from server time/);
  });

  it('should reject request with future timestamp (6 minutes ahead)', () => {
    const futureTimestamp = (Date.now() + 6 * 60 * 1000).toString();
    const signingString = buildSigningString('GET', '/health', futureTimestamp, null);
    const signature = signData(keyPair.privateKeyObject, signingString);

    const result = verifyRequestSignature({
      publicKeyBase64: keyPair.publicKeyBase64,
      signatureBase64: signature,
      method: 'GET',
      path: '/health',
      timestamp: futureTimestamp,
      body: null,
    });

    assert.equal(result.valid, false);
    assert.match(result.reason, /too far from server time/);
  });

  it('should reject non-numeric timestamp', () => {
    const result = verifyRequestSignature({
      publicKeyBase64: keyPair.publicKeyBase64,
      signatureBase64: 'dummysig',
      method: 'GET',
      path: '/health',
      timestamp: 'not-a-number',
      body: null,
    });

    assert.equal(result.valid, false);
    assert.match(result.reason, /Invalid timestamp/);
  });

  it('should reject tampered body', () => {
    const timestamp = Date.now().toString();
    const originalBody = JSON.stringify({ intent: 'buy widgets' });
    const tamperedBody = JSON.stringify({ intent: 'buy widgets', maxBudget: 999999 });

    const signingString = buildSigningString('POST', '/sessions', timestamp, originalBody);
    const signature = signData(keyPair.privateKeyObject, signingString);

    const result = verifyRequestSignature({
      publicKeyBase64: keyPair.publicKeyBase64,
      signatureBase64: signature,
      method: 'POST',
      path: '/sessions',
      timestamp,
      body: tamperedBody,
    });

    assert.equal(result.valid, false);
  });

  it('should reject signature from wrong key', () => {
    const otherKeyPair = generateTestKeyPair();
    const timestamp = Date.now().toString();
    const signingString = buildSigningString('GET', '/health', timestamp, null);
    const signature = signData(otherKeyPair.privateKeyObject, signingString);

    const result = verifyRequestSignature({
      publicKeyBase64: keyPair.publicKeyBase64, // agent1's key
      signatureBase64: signature,                // signed by agent2
      method: 'GET',
      path: '/health',
      timestamp,
      body: null,
    });

    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// createSignatureVerifier (Fastify middleware)
// ---------------------------------------------------------------------------

describe('createSignatureVerifier', () => {
  /**
   * Build a minimal mock Fastify request/reply pair
   */
  function mockRequest(headers = {}, overrides = {}) {
    return {
      headers,
      method: overrides.method || 'GET',
      url: overrides.url || '/health',
      rawBody: overrides.rawBody || null,
    };
  }

  function mockReply() {
    let statusCode = 200;
    let body = null;
    return {
      code(c) { statusCode = c; return this; },
      send(b) { body = b; return this; },
      get statusCode() { return statusCode; },
      get body() { return body; },
    };
  }

  function mockDb(rows = [], status = 'active') {
    return {
      query: async (sql, params) => {
        if (sql.includes('SELECT')) {
          return { rows: rows.map(r => ({ ...r, status: r.status || status })) };
        }
        return { rows: [] };
      },
    };
  }

  it('should skip verification when no agent headers are present', async () => {
    const verifier = createSignatureVerifier(mockDb());
    const request = mockRequest({});
    const reply = mockReply();

    const result = await verifier(request, reply);

    // Should not set an error response
    assert.equal(reply.body, null);
  });

  it('should reject when only partial agent headers are present', async () => {
    const verifier = createSignatureVerifier(mockDb());
    const request = mockRequest({ 'x-agent-id': 'some-id' });
    const reply = mockReply();

    await verifier(request, reply);

    assert.equal(reply.statusCode, 401);
    assert.equal(reply.body.error, 'missing_auth_headers');
  });

  it('should reject unknown agent', async () => {
    const verifier = createSignatureVerifier(mockDb([])); // empty results
    const request = mockRequest({
      'x-agent-id': 'non-existent',
      'x-agent-signature': 'sig',
      'x-agent-timestamp': Date.now().toString(),
    });
    const reply = mockReply();

    await verifier(request, reply);

    assert.equal(reply.statusCode, 401);
    assert.equal(reply.body.error, 'unknown_agent');
  });

  it('should reject revoked agent with 403', async () => {
    const agent = { id: 'agent-1', public_key: 'key', status: 'revoked' };
    const verifier = createSignatureVerifier(mockDb([agent]));
    const request = mockRequest({
      'x-agent-id': 'agent-1',
      'x-agent-signature': 'sig',
      'x-agent-timestamp': Date.now().toString(),
    });
    const reply = mockReply();

    await verifier(request, reply);

    assert.equal(reply.statusCode, 403);
    assert.equal(reply.body.error, 'agent_revoked');
  });

  it('should reject suspended agent with 403', async () => {
    const agent = { id: 'agent-1', public_key: 'key', status: 'suspended' };
    const verifier = createSignatureVerifier(mockDb([agent]));
    const request = mockRequest({
      'x-agent-id': 'agent-1',
      'x-agent-signature': 'sig',
      'x-agent-timestamp': Date.now().toString(),
    });
    const reply = mockReply();

    await verifier(request, reply);

    assert.equal(reply.statusCode, 403);
    assert.equal(reply.body.error, 'agent_suspended');
  });

  it('should accept a valid signed request and attach agent to request', async () => {
    const keyPair = generateTestKeyPair();
    const timestamp = Date.now().toString();
    const signingString = buildSigningString('GET', '/health', timestamp, null);
    const signature = signData(keyPair.privateKeyObject, signingString);

    const agent = { id: 'agent-1', public_key: keyPair.publicKeyBase64, status: 'active' };
    const verifier = createSignatureVerifier(mockDb([agent]));

    const request = mockRequest(
      {
        'x-agent-id': 'agent-1',
        'x-agent-signature': signature,
        'x-agent-timestamp': timestamp,
      },
      { method: 'GET', url: '/health' }
    );
    const reply = mockReply();

    await verifier(request, reply);

    // Should not set error response
    assert.equal(reply.body, null);
    // Should attach agent to request
    assert.deepEqual(request.agent, { id: 'agent-1', status: 'active' });
  });

  it('should reject invalid signature on otherwise valid request', async () => {
    const keyPair = generateTestKeyPair();
    const agent = { id: 'agent-1', public_key: keyPair.publicKeyBase64, status: 'active' };
    const verifier = createSignatureVerifier(mockDb([agent]));

    const request = mockRequest(
      {
        'x-agent-id': 'agent-1',
        'x-agent-signature': Buffer.alloc(64).toString('base64'), // wrong sig
        'x-agent-timestamp': Date.now().toString(),
      },
      { method: 'GET', url: '/health' }
    );
    const reply = mockReply();

    await verifier(request, reply);

    assert.equal(reply.statusCode, 401);
    assert.equal(reply.body.error, 'invalid_signature');
  });
});
