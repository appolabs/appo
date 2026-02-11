import type { HapticsApi, HapticImpactStyle, HapticNotificationType } from '../types';
import { postMessage, isNativeEnvironment } from '../bridge';

/**
 * Creates the haptic feedback API.
 * All methods are no-ops when not in a native environment.
 */
export function createHapticsApi(): HapticsApi {
  return {
    /**
     * Triggers a haptic impact feedback.
     * No-op in browser.
     * @param style - The impact intensity: `'light'`, `'medium'`, or `'heavy'`.
     */
    impact(style: HapticImpactStyle): void {
      if (!isNativeEnvironment()) {
        return;
      }
      postMessage('haptics.impact', { style });
    },

    /**
     * Triggers a haptic notification feedback.
     * No-op in browser.
     * @param type - The notification type: `'success'`, `'warning'`, or `'error'`.
     */
    notification(type: HapticNotificationType): void {
      if (!isNativeEnvironment()) {
        return;
      }
      postMessage('haptics.notification', { type });
    },
  };
}
