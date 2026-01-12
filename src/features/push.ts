import type { PushApi, PushMessage, PermissionStatus } from '../types';
import { sendMessage, addEventListener, isNativeEnvironment } from '../bridge';

export function createPushApi(): PushApi {
  return {
    async requestPermission(): Promise<PermissionStatus> {
      if (!isNativeEnvironment()) {
        return 'denied';
      }
      return sendMessage<PermissionStatus>('push.requestPermission');
    },

    async getToken(): Promise<string | null> {
      if (!isNativeEnvironment()) {
        return null;
      }
      return sendMessage<string | null>('push.getToken');
    },

    onMessage(callback: (message: PushMessage) => void): () => void {
      return addEventListener('push.message', (data) => {
        callback(data as PushMessage);
      });
    },
  };
}
