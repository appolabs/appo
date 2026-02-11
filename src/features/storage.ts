import type { StorageApi } from '../types';
import { sendMessage, isNativeEnvironment } from '../bridge';

/**
 * Creates the secure storage API.
 * Falls back to `localStorage` when not in a native environment.
 */
export function createStorageApi(): StorageApi {
  return {
    /**
     * Retrieves a value by key from native secure storage.
     * @param key - The storage key to look up.
     * @returns The stored string value, or `null` if not found. Uses `localStorage` in browser.
     */
    async get(key: string): Promise<string | null> {
      if (!isNativeEnvironment()) {
        return localStorage.getItem(key);
      }
      return sendMessage<string | null>('storage.get', { key });
    },

    /**
     * Stores a key-value pair in native secure storage.
     * @param key - The storage key.
     * @param value - The string value to store.
     * @returns Resolves when the value is persisted. Uses `localStorage` in browser.
     */
    async set(key: string, value: string): Promise<void> {
      if (!isNativeEnvironment()) {
        localStorage.setItem(key, value);
        return;
      }
      return sendMessage<void>('storage.set', { key, value });
    },

    /**
     * Removes a key-value pair from native secure storage.
     * @param key - The storage key to remove.
     * @returns Resolves when the value is deleted. Uses `localStorage` in browser.
     */
    async delete(key: string): Promise<void> {
      if (!isNativeEnvironment()) {
        localStorage.removeItem(key);
        return;
      }
      return sendMessage<void>('storage.delete', { key });
    },
  };
}
