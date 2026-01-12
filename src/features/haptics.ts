import type { HapticsApi, HapticImpactStyle, HapticNotificationType } from '../types';
import { postMessage, isNativeEnvironment } from '../bridge';

export function createHapticsApi(): HapticsApi {
  return {
    impact(style: HapticImpactStyle): void {
      if (!isNativeEnvironment()) {
        return;
      }
      postMessage('haptics.impact', { style });
    },

    notification(type: HapticNotificationType): void {
      if (!isNativeEnvironment()) {
        return;
      }
      postMessage('haptics.notification', { type });
    },
  };
}
