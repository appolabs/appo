import type { LocationApi, Position, PermissionStatus } from '../types';
import { sendMessage, isNativeEnvironment } from '../bridge';

/**
 * Creates the location/GPS API.
 * Returns browser fallbacks when not in a native environment.
 */
export function createLocationApi(): LocationApi {
  return {
    /**
     * Requests location permission from the native layer.
     * @returns The granted/denied/undetermined permission status. Returns `'denied'` in browser.
     */
    async requestPermission(): Promise<PermissionStatus> {
      if (!isNativeEnvironment()) {
        return 'denied';
      }
      return sendMessage<PermissionStatus>('location.requestPermission');
    },

    /**
     * Retrieves the device's current geographic position.
     * @returns The position with latitude, longitude, optional altitude/accuracy, and timestamp.
     * @throws {Error} When called outside a native environment.
     */
    async getCurrentPosition(): Promise<Position> {
      if (!isNativeEnvironment()) {
        throw new Error('Location not available outside native environment');
      }
      return sendMessage<Position>('location.getCurrentPosition');
    },
  };
}
