/**
 * Tests for Agent Key Manager — Ed25519 Identity Management
 *
 * Covers: key generation, persistence via storage adapter, signing,
 * request signing, fingerprints, and idempotent initialization.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { KeyManager, MemoryStorage } from './key-manager.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Convert raw 32-byte base64 public key to Node.js KeyObject for verification */
function rawPublicKeyToKeyObject(base64Key) {
  const prefix = Buffer.from('302a300506032b6570032100', 'hex');
  const rawBytes = Buffer.from(base64Key, 'base64');
  const derKey = Buffer.concat([prefix, rawBytes]);
  return crypto.createPublicKey({ key: derKey, format: 'der', type: 'spki' });
}

/** Verify an Ed25519 signature using a raw base64 public key */
function verifySignature(publicKeyBase64, data, signatureBase64) {
  const keyObject = rawPublicKeyToKeyObject(publicKeyBase64);
  const message = Buffer.from(data);
  const signature = Buffer.from(signatureBase64, 'base64');
  return crypto.verify(null, message, keyObject, signature);
}

// ---------------------------------------------------------------------------
// MemoryStorage
// ---------------------------------------------------------------------------

describe('MemoryStorage', () => {
  it('should get/set/remove values', async () => {
    const storage = new MemoryStorage();

    assert.equal(await storage.get('missing'), null);

    await storage.set('key1', 'value1');
    assert.equal(await storage.get('key1'), 'value1');

    await storage.remove('key1');
    assert.equal(await storage.get('key1'), null);
  });
});

// ---------------------------------------------------------------------------
// KeyManager — Initialization
// ---------------------------------------------------------------------------

describe('KeyManager init', () => {
  let km;

  beforeEach(() => {
    km = new KeyManager();
  });

  it('should generate a new key pair on first init', async () => {
    const { publicKey, isNew } = await km.init();

    assert.equal(isNew, true);
    assert.equal(typeof publicKey, 'string');

    // Public key should be 32 bytes base64
    const rawBytes = Buffer.from(publicKey, 'base64');
    assert.equal(rawBytes.length, 32);
  });

  it('should return isNew=false on subsequent init calls', async () => {
    const first = await km.init();
    const second = await km.init();

    assert.equal(first.isNew, true);
    assert.equal(second.isNew, false);
    assert.equal(first.publicKey, second.publicKey);
  });

  it('should load existing keys from storage on new KeyManager instance', async () => {
    const storage = new MemoryStorage();
    const km1 = new KeyManager({ storage });
    const { publicKey: pk1 } = await km1.init();

    // New KeyManager with same storage should load the same key
    const km2 = new KeyManager({ storage });
    const { publicKey: pk2, isNew } = await km2.init();

    assert.equal(pk2, pk1);
    assert.equal(isNew, false);
  });

  it('should use custom storage prefix', async () => {
    const storage = new MemoryStorage();
    const km1 = new KeyManager({ storage, storagePrefix: 'app1:' });
    const km2 = new KeyManager({ storage, storagePrefix: 'app2:' });

    await km1.init();
    await km2.init();

    // Different prefixes should produce different keys
    assert.notEqual(km1.publicKey, km2.publicKey);
  });
});

// ---------------------------------------------------------------------------
// KeyManager — Signing
// ---------------------------------------------------------------------------

describe('KeyManager sign', () => {
  let km;

  beforeEach(async () => {
    km = new KeyManager();
    await km.init();
  });

  it('should produce a valid Ed25519 signature', () => {
    const data = 'hello world';
    const sig = km.sign(data);

    // Signature should be 64 bytes base64
    const sigBytes = Buffer.from(sig, 'base64');
    assert.equal(sigBytes.length, 64);

    // Should verify with the public key
    const valid = verifySignature(km.publicKey, data, sig);
    assert.equal(valid, true);
  });

  it('should produce different signatures for different data', () => {
    const sig1 = km.sign('data1');
    const sig2 = km.sign('data2');
    assert.notEqual(sig1, sig2);
  });

  it('should produce consistent signatures (deterministic Ed25519)', () => {
    const sig1 = km.sign('same data');
    const sig2 = km.sign('same data');
    // Ed25519 is deterministic — same key + same data = same signature
    assert.equal(sig1, sig2);
  });

  it('should throw if not initialized', () => {
    const uninit = new KeyManager();
    assert.throws(() => uninit.sign('data'), /not initialized/);
  });
});

// ---------------------------------------------------------------------------
// KeyManager — Request Signing
// ---------------------------------------------------------------------------

describe('KeyManager signRequest', () => {
  let km;

  beforeEach(async () => {
    km = new KeyManager();
    await km.init();
  });

  it('should return signature and timestamp for GET request', () => {
    const result = km.signRequest({ method: 'GET', path: '/health', body: null });

    assert.equal(typeof result.signature, 'string');
    assert.equal(typeof result.timestamp, 'string');
    assert.equal(Buffer.from(result.signature, 'base64').length, 64);

    // Timestamp should be a recent unix ms
    const ts = parseInt(result.timestamp, 10);
    assert.ok(Math.abs(Date.now() - ts) < 1000);
  });

  it('should produce verifiable signature for POST request', () => {
    const body = JSON.stringify({ intent: 'buy widgets' });
    const { signature, timestamp } = km.signRequest({
      method: 'POST',
      path: '/sessions',
      body,
    });

    // Reconstruct the signing string server-side would build
    const bodyDigest = crypto.createHash('sha256').update(body).digest('base64');
    const signingString = `POST\n/sessions\n${timestamp}\n${bodyDigest}`;

    const valid = verifySignature(km.publicKey, signingString, signature);
    assert.equal(valid, true);
  });

  it('should produce verifiable signature for GET (no body)', () => {
    const { signature, timestamp } = km.signRequest({
      method: 'GET',
      path: '/sessions/123',
      body: null,
    });

    const signingString = `GET\n/sessions/123\n${timestamp}\n`;
    const valid = verifySignature(km.publicKey, signingString, signature);
    assert.equal(valid, true);
  });
});

// ---------------------------------------------------------------------------
// KeyManager — Fingerprint
// ---------------------------------------------------------------------------

describe('KeyManager fingerprint', () => {
  it('should return SHA-256 hex of the public key', async () => {
    const km = new KeyManager();
    await km.init();

    const fp = km.fingerprint;
    assert.equal(fp.length, 64);
    assert.match(fp, /^[0-9a-f]{64}$/);

    // Should match manual computation
    const expected = crypto.createHash('sha256')
      .update(Buffer.from(km.publicKey, 'base64'))
      .digest('hex');
    assert.equal(fp, expected);
  });
});

// ---------------------------------------------------------------------------
// KeyManager — Agent ID storage
// ---------------------------------------------------------------------------

describe('KeyManager agentId storage', () => {
  it('should store and retrieve agentId', async () => {
    const km = new KeyManager();
    await km.init();

    assert.equal(await km.getAgentId(), null);

    await km.setAgentId('test-uuid-123');
    assert.equal(await km.getAgentId(), 'test-uuid-123');
  });

  it('should persist agentId across KeyManager instances with shared storage', async () => {
    const storage = new MemoryStorage();
    const km1 = new KeyManager({ storage });
    await km1.init();
    await km1.setAgentId('my-agent-id');

    const km2 = new KeyManager({ storage });
    await km2.init();
    assert.equal(await km2.getAgentId(), 'my-agent-id');
  });
});

// ---------------------------------------------------------------------------
// KeyManager — Cross-compatibility with server verification
// ---------------------------------------------------------------------------

describe('KeyManager cross-compat with agent-auth.js signing scheme', () => {
  it('should produce registration signatures the server can verify', async () => {
    const km = new KeyManager();
    await km.init();

    const body = JSON.stringify({
      publicKey: km.publicKey,
      type: 'scout',
      manifest: { name: 'test' },
    });

    const signature = km.sign(body);

    // Server-side verification: verifyRegistrationSignature(publicKey, sig, body)
    const valid = verifySignature(km.publicKey, body, signature);
    assert.equal(valid, true);
  });

  it('should produce request signatures the server can verify', async () => {
    const km = new KeyManager();
    await km.init();

    const body = JSON.stringify({ intent: 'test intent' });
    const { signature, timestamp } = km.signRequest({
      method: 'POST',
      path: '/sessions',
      body,
    });

    // Server reconstructs: buildSigningString(method, path, timestamp, body)
    const bodyDigest = crypto.createHash('sha256').update(body).digest('base64');
    const signingString = `POST\n/sessions\n${timestamp}\n${bodyDigest}`;

    const valid = verifySignature(km.publicKey, signingString, signature);
    assert.equal(valid, true);
  });
});
