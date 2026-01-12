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

export const VERSION = '1.0.0';

/**
 * Creates the Appo SDK instance
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
 * Initializes the Appo SDK and attaches it to window.appo
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
 * Gets the Appo SDK instance (initializes if needed)
 */
export function getAppo(): Appo {
  if (typeof window !== 'undefined' && window.appo) {
    return window.appo;
  }
  return initAppo();
}

// Export types
export type {
  Appo,
  PermissionStatus,
  PushMessage,
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
} from './types';

// Auto-initialize when loaded via script tag
if (typeof window !== 'undefined' && !window.appo) {
  initAppo();
}

export default getAppo;
