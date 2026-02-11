import type { PushApi, PushMessage, PushResponse, PermissionStatus } from '../types';
import { sendMessage, addEventListener, isNativeEnvironment } from '../bridge';

/**
 * Creates the push notifications API.
 * Returns browser fallbacks when not in a native environment.
 */
export function createPushApi(): PushApi {
  return {
    /**
     * Requests push notification permission from the native layer.
     * @returns The granted/denied/undetermined permission status. Returns `'denied'` in browser.
     */
    async requestPermission(): Promise<PermissionStatus> {
      if (!isNativeEnvironment()) {
        return 'denied';
      }
      return sendMessage<PermissionStatus>('push.requestPermission');
    },

    /**
     * Retrieves the device push token for remote notification delivery.
     * @returns The push token string, or `null` if unavailable. Returns `null` in browser.
     */
    async getToken(): Promise<string | null> {
      if (!isNativeEnvironment()) {
        return null;
      }
      return sendMessage<string | null>('push.getToken');
    },

    /**
     * Subscribes to incoming push notification events on the `push.message` channel.
     * @param callback - Invoked with the push message content when a notification is received.
     * @returns Unsubscribe function to remove the listener.
     */
    onMessage(callback: (message: PushMessage) => void): () => void {
      return addEventListener('push.message', (data) => {
        callback(data as PushMessage);
      });
    },

    /**
     * Subscribes to notification tap events on the `push.response` channel.
     * Fires when the user taps a notification, including cold-start launches.
     * @param callback - Invoked with the tap response data including `actionIdentifier`.
     * @returns Unsubscribe function to remove the listener.
     */
    onResponse(callback: (response: PushResponse) => void): () => void {
      return addEventListener('push.response', (data) => {
        callback(data as PushResponse);
      });
    },
  };
}
