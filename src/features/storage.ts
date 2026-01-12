import type { StorageApi } from '../types';
import { sendMessage, isNativeEnvironment } from '../bridge';

export function createStorageApi(): StorageApi {
  return {
    async get(key: string): Promise<string | null> {
      if (!isNativeEnvironment()) {
        // Fallback to localStorage when not in native
        return localStorage.getItem(key);
      }
      return sendMessage<string | null>('storage.get', { key });
    },

    async set(key: string, value: string): Promise<void> {
      if (!isNativeEnvironment()) {
        // Fallback to localStorage when not in native
        localStorage.setItem(key, value);
        return;
      }
      return sendMessage<void>('storage.set', { key, value });
    },

    async delete(key: string): Promise<void> {
      if (!isNativeEnvironment()) {
        // Fallback to localStorage when not in native
        localStorage.removeItem(key);
        return;
      }
      return sendMessage<void>('storage.delete', { key });
    },
  };
}
