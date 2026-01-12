import type { DeviceApi, DeviceInfo } from '../types';
import { sendMessage, isNativeEnvironment } from '../bridge';

export function createDeviceApi(): DeviceApi {
  return {
    async getInfo(): Promise<DeviceInfo> {
      if (!isNativeEnvironment()) {
        // Return browser-based fallback info
        const userAgent = navigator.userAgent;
        const isTablet = /iPad|Android(?!.*Mobile)/i.test(userAgent);
        const isIOS = /iPad|iPhone|iPod/.test(userAgent);

        return {
          platform: isIOS ? 'ios' : 'android',
          osVersion: 'web',
          appVersion: '1.0.0',
          deviceId: 'web-browser',
          deviceName: navigator.userAgent.substring(0, 50),
          isTablet,
        };
      }
      return sendMessage<DeviceInfo>('device.getInfo');
    },
  };
}
