/**
 * Chrome Storage Wrapper
 *
 * Provides async/await interface over chrome.storage.local.
 * Falls back to in-memory storage for testing environments
 * where chrome.storage is unavailable.
 */

import { StorageKeys } from '../shared/constants.js';

/** In-memory fallback for test environments */
const memoryStore = new Map();

/**
 * Detect whether chrome.storage is available.
 */
function hasChromeStorage() {
  return typeof chrome !== 'undefined'
    && chrome.storage
    && chrome.storage.local;
}

/**
 * Get a value from storage.
 *
 * @param {string} key - Storage key (use StorageKeys constants)
 * @returns {Promise<*>} The stored value, or null if not found
 */
export async function get(key) {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(key);
    return result[key] ?? null;
  }
  return memoryStore.get(key) ?? null;
}

/**
 * Set a value in storage.
 *
 * @param {string} key - Storage key
 * @param {*} value - Value to store (must be JSON-serialisable)
 * @returns {Promise<void>}
 */
export async function set(key, value) {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  memoryStore.set(key, value);
}

/**
 * Remove a value from storage.
 *
 * @param {string} key - Storage key to remove
 * @returns {Promise<void>}
 */
export async function remove(key) {
  if (hasChromeStorage()) {
    await chrome.storage.local.remove(key);
    return;
  }
  memoryStore.delete(key);
}

/**
 * Clear all AURA-related keys from storage.
 * Only removes keys defined in StorageKeys, not all extension storage.
 *
 * @returns {Promise<void>}
 */
export async function clearAll() {
  const keys = Object.values(StorageKeys);
  if (hasChromeStorage()) {
    await chrome.storage.local.remove(keys);
    return;
  }
  for (const key of keys) {
    memoryStore.delete(key);
  }
}

/**
 * Reset in-memory store (for testing only).
 */
export function _resetMemoryStore() {
  memoryStore.clear();
}
