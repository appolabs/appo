import type { BiometricsApi } from '../types';
import { sendMessage, isNativeEnvironment } from '../bridge';

/**
 * Creates the biometric authentication API.
 * Returns browser fallbacks when not in a native environment.
 */
export function createBiometricsApi(): BiometricsApi {
  return {
    /**
     * Checks whether biometric authentication (Face ID / Touch ID) is available on the device.
     * @returns `true` if biometrics are enrolled and available. Returns `false` in browser.
     */
    async isAvailable(): Promise<boolean> {
      if (!isNativeEnvironment()) {
        return false;
      }
      return sendMessage<boolean>('biometrics.isAvailable');
    },

    /**
     * Prompts the user for biometric authentication.
     * @param reason - Description displayed to the user explaining why authentication is requested.
     * @returns `true` if authentication succeeded. Returns `false` in browser.
     */
    async authenticate(reason: string): Promise<boolean> {
      if (!isNativeEnvironment()) {
        return false;
      }
      return sendMessage<boolean>('biometrics.authenticate', { reason });
    },
  };
}
