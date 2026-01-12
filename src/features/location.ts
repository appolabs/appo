import type { LocationApi, Position, PermissionStatus } from '../types';
import { sendMessage, isNativeEnvironment } from '../bridge';

export function createLocationApi(): LocationApi {
  return {
    async requestPermission(): Promise<PermissionStatus> {
      if (!isNativeEnvironment()) {
        return 'denied';
      }
      return sendMessage<PermissionStatus>('location.requestPermission');
    },

    async getCurrentPosition(): Promise<Position> {
      if (!isNativeEnvironment()) {
        throw new Error('Location not available outside native environment');
      }
      return sendMessage<Position>('location.getCurrentPosition');
    },
  };
}
