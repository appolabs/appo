import type { DeviceApi, DeviceInfo } from '../types';
import { sendMessage, isNativeEnvironment } from '../bridge';
import { VERSION } from '../version';

/**
 * Creates the device information API.
 * Returns user agent-based fallback info when not in a native environment.
 */
export function createDeviceApi(): DeviceApi {
  return {
    /**
     * Retrieves device hardware and software information.
     * In browser, returns inferred values from the user agent string with `osVersion: 'web'`.
     * @returns The device info including platform, OS version, app version, and form factor.
     */
    async getInfo(): Promise<DeviceInfo> {
      if (!isNativeEnvironment()) {
        const userAgent = navigator.userAgent;
        const isTablet = /iPad|Android(?!.*Mobile)/i.test(userAgent);
        const isIOS = /iPad|iPhone|iPod/.test(userAgent);

        return {
          platform: isIOS ? 'ios' : 'android',
          osVersion: 'web',
          appVersion: VERSION,
          deviceId: 'web-browser',
          deviceName: navigator.userAgent.substring(0, 50),
          isTablet,
        };
      }
      return sendMessage<DeviceInfo>('device.getInfo');
    },
  };
}
