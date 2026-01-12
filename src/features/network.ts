import type { NetworkApi, NetworkStatus } from '../types';
import { sendMessage, addEventListener, isNativeEnvironment } from '../bridge';

export function createNetworkApi(): NetworkApi {
  return {
    async getStatus(): Promise<NetworkStatus> {
      if (!isNativeEnvironment()) {
        // Fallback to navigator.onLine when not in native
        return {
          isConnected: navigator.onLine,
          type: 'unknown',
        };
      }
      return sendMessage<NetworkStatus>('network.getStatus');
    },

    onChange(callback: (status: NetworkStatus) => void): () => void {
      if (!isNativeEnvironment()) {
        // Fallback to browser online/offline events
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
