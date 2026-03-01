/**
 * Cryptographic Key Manager
 *
 * Manages Ed25519 key pairs for TAP signing and AP2 mandates.
 * Uses tweetnacl for Ed25519 operations (browser-compatible, no Node.js deps).
 * Keys are persisted in chrome.storage.local.
 *
 * SECURITY: Private keys are stored in chrome.storage.local which is
 * encrypted at rest by Chrome. Keys never leave the extension context.
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8 } from 'tweetnacl-util';
import * as storage from './storage.js';
import { StorageKeys } from '../shared/constants.js';
import { CryptoError } from '../shared/errors.js';

/**
 * Generate a new Ed25519 key pair.
 *
 * @returns {Object} { publicKey, secretKey } as base64 strings
 */
export function generateKeyPair() {
  const pair = nacl.sign.keyPair();
  return {
    publicKey: encodeBase64(pair.publicKey),
    secretKey: encodeBase64(pair.secretKey),
  };
}

/**
 * Get or create the extension's Ed25519 key pair.
 * Lazy-initialises on first call, then returns the stored pair.
 *
 * @returns {Promise<Object>} { publicKey, secretKey } as base64 strings
 */
export async function getOrCreateKeyPair() {
  const stored = await storage.get(StorageKeys.KEY_PAIR);
  if (stored && stored.publicKey && stored.secretKey) {
    return stored;
  }

  const pair = generateKeyPair();
  await storage.set(StorageKeys.KEY_PAIR, pair);
  return pair;
}

/**
 * Sign arbitrary data with the extension's private key.
 *
 * @param {string} data - Data to sign (will be UTF-8 encoded)
 * @returns {Promise<string>} Base64-encoded signature
 * @throws {CryptoError} If key pair is unavailable or signing fails
 */
export async function sign(data) {
  const keyPair = await getOrCreateKeyPair();

  try {
    const secretKey = new Uint8Array(decodeBase64(keyPair.secretKey));
    const message = new Uint8Array(new TextEncoder().encode(data));
    const signature = nacl.sign.detached(message, secretKey);
    return encodeBase64(signature);
  } catch (error) {
    throw new CryptoError(`Signing failed: ${error.message}`);
  }
}

/**
 * Verify a signature against a public key.
 *
 * @param {string} data - Original signed data
 * @param {string} signatureBase64 - Base64-encoded signature
 * @param {string} publicKeyBase64 - Base64-encoded public key
 * @returns {boolean} True if signature is valid
 */
export function verify(data, signatureBase64, publicKeyBase64) {
  try {
    const message = new Uint8Array(new TextEncoder().encode(data));
    const signature = new Uint8Array(decodeBase64(signatureBase64));
    const publicKey = new Uint8Array(decodeBase64(publicKeyBase64));
    return nacl.sign.detached.verify(message, signature, publicKey);
  } catch {
    return false;
  }
}

/**
 * Get the public key as a base64 string (for agent registration).
 *
 * tweetnacl Ed25519 public keys are 32 bytes, which is the raw format
 * expected by AURA Core's /agents/register endpoint.
 *
 * @returns {Promise<string>} Base64-encoded raw 32-byte Ed25519 public key
 */
export async function getPublicKeyBase64() {
  const keyPair = await getOrCreateKeyPair();
  return keyPair.publicKey;
}

/**
 * Get the public key as a hex string (for key IDs and display).
 *
 * @returns {Promise<string>} Hex-encoded public key
 */
export async function getPublicKeyHex() {
  const keyPair = await getOrCreateKeyPair();
  const bytes = decodeBase64(keyPair.publicKey);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a short key ID from the public key (first 16 hex chars).
 *
 * @returns {Promise<string>} Key ID
 */
export async function getKeyId() {
  const hex = await getPublicKeyHex();
  return hex.substring(0, 16);
}

/**
 * Delete the stored key pair (for key rotation or reset).
 *
 * @returns {Promise<void>}
 */
export async function deleteKeyPair() {
  await storage.remove(StorageKeys.KEY_PAIR);
}
