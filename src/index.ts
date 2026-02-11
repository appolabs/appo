/**
 * @module @appolabs/appo
 *
 * JavaScript bridge SDK for native app features in React Native WebViews.
 * Provides a unified API surface with automatic browser fallbacks.
 */

import type { Appo } from './types';
import { initializeBridge, isNativeEnvironment } from './bridge';
import {
  createPushApi,
  createBiometricsApi,
  createCameraApi,
  createLocationApi,
  createHapticsApi,
  createStorageApi,
  createShareApi,
  createNetworkApi,
  createDeviceApi,
} from './features';

import { VERSION } from './version';

export { VERSION };

/**
 * Creates the Appo SDK instance with all feature APIs initialized.
 */
function createAppo(): Appo {
  return {
    isNative: isNativeEnvironment(),
    version: VERSION,
    push: createPushApi(),
    biometrics: createBiometricsApi(),
    camera: createCameraApi(),
    location: createLocationApi(),
    haptics: createHapticsApi(),
    storage: createStorageApi(),
    share: createShareApi(),
    network: createNetworkApi(),
    device: createDeviceApi(),
  };
}

/**
 * Initializes the Appo SDK and attaches it to `window.appo`.
 * Returns the existing instance if already initialized.
 * @returns The singleton Appo SDK instance.
 * @throws {Error} If called outside a browser environment (no `window`).
 */
export function initAppo(): Appo {
  if (typeof window === 'undefined') {
    throw new Error('Appo SDK can only be initialized in a browser environment');
  }

  if (window.appo) {
    return window.appo;
  }

  initializeBridge();
  const appo = createAppo();
  window.appo = appo;

  return appo;
}

/**
 * Gets the Appo SDK instance, initializing it on first call.
 * Subsequent calls return the same singleton instance.
 * @returns The singleton Appo SDK instance.
 */
export function getAppo(): Appo {
  if (typeof window !== 'undefined' && window.appo) {
    return window.appo;
  }
  return initAppo();
}

// Export type guards, error types, and logger
export { isBridgeResponse, isBridgeEvent, AppoError, AppoErrorCode } from './types';
export { setLogger } from './bridge';

// Export types
export type {
  Appo,
  PermissionStatus,
  PushMessage,
  PushResponse,
  CameraResult,
  Position,
  ShareOptions,
  ShareResult,
  NetworkStatus,
  DeviceInfo,
  HapticImpactStyle,
  HapticNotificationType,
  PushApi,
  BiometricsApi,
  CameraApi,
  LocationApi,
  HapticsApi,
  StorageApi,
  ShareApi,
  NetworkApi,
  DeviceApi,
  BridgeResponse,
  BridgeEvent,
  AppoLogLevel,
  AppoLogger,
} from './types';

// Auto-initialize when loaded via script tag
if (typeof window !== 'undefined' && !window.appo) {
  initAppo();
}

export default getAppo;
