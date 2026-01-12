import type { BiometricsApi } from '../types';
import { sendMessage, isNativeEnvironment } from '../bridge';

export function createBiometricsApi(): BiometricsApi {
  return {
    async isAvailable(): Promise<boolean> {
      if (!isNativeEnvironment()) {
        return false;
      }
      return sendMessage<boolean>('biometrics.isAvailable');
    },

    async authenticate(reason: string): Promise<boolean> {
      if (!isNativeEnvironment()) {
        return false;
      }
      return sendMessage<boolean>('biometrics.authenticate', { reason });
    },
  };
}
