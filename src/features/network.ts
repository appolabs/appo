import type { NetworkApi, NetworkStatus } from '../types';
import { sendMessage, addEventListener, isNativeEnvironment } from '../bridge';

/**
 * Creates the network status API.
 * Falls back to browser `navigator.onLine` and `online`/`offline` events when not in a native environment.
 */
export function createNetworkApi(): NetworkApi {
  return {
    /**
     * Retrieves the current network connectivity status.
     * @returns The connection state and type. Returns `{ isConnected: navigator.onLine, type: 'unknown' }` in browser.
     */
    async getStatus(): Promise<NetworkStatus> {
      if (!isNativeEnvironment()) {
        return {
          isConnected: navigator.onLine,
          type: 'unknown',
        };
      }
      return sendMessage<NetworkStatus>('network.getStatus');
    },

    /**
     * Subscribes to network status changes on the `network.change` channel.
     * In browser, listens to the `online` and `offline` window events instead.
     * @param callback - Invoked with the updated network status on each change.
     * @returns Unsubscribe function to remove the listener.
     */
    onChange(callback: (status: NetworkStatus) => void): () => void {
      if (!isNativeEnvironment()) {
        const handleOnline = () => callback({ isConnected: true, type: 'unknown' });
        const handleOffline = () => callback({ isConnected: false, type: 'none' });

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
          window.removeEventListener('online', handleOnline);
          window.removeEventListener('offline', handleOffline);
        };
      }
      return addEventListener('network.change', (data) => {
        callback(data as NetworkStatus);
      });
    },
  };
}
