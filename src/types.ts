/**
 * Permission status returned by native APIs
 */
export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

/**
 * Push notification message received from native
 */
export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Result from camera capture
 */
export interface CameraResult {
  uri: string;
  base64?: string;
  width: number;
  height: number;
}

/**
 * Geographic position
 */
export interface Position {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  timestamp: number;
}

/**
 * Options for native share sheet
 */
export interface ShareOptions {
  title?: string;
  message?: string;
  url?: string;
}

/**
 * Result from share action
 */
export interface ShareResult {
  success: boolean;
  action?: string;
}

/**
 * Network connectivity status
 */
export interface NetworkStatus {
  isConnected: boolean;
  type: 'wifi' | 'cellular' | 'none' | 'unknown';
}

/**
 * Device information
 */
export interface DeviceInfo {
  platform: 'ios' | 'android';
  osVersion: string;
  appVersion: string;
  deviceId: string;
  deviceName: string;
  isTablet: boolean;
}

/**
 * Haptic feedback intensity levels
 */
export type HapticImpactStyle = 'light' | 'medium' | 'heavy';

/**
 * Haptic notification types
 */
export type HapticNotificationType = 'success' | 'warning' | 'error';

/**
 * Push notifications API
 */
export interface PushApi {
  requestPermission(): Promise<PermissionStatus>;
  getToken(): Promise<string | null>;
  onMessage(callback: (message: PushMessage) => void): () => void;
}

/**
 * Biometric authentication API
 */
export interface BiometricsApi {
  isAvailable(): Promise<boolean>;
  authenticate(reason: string): Promise<boolean>;
}

/**
 * Camera API
 */
export interface CameraApi {
  requestPermission(): Promise<PermissionStatus>;
  takePicture(): Promise<CameraResult>;
}

/**
 * Location/GPS API
 */
export interface LocationApi {
  requestPermission(): Promise<PermissionStatus>;
  getCurrentPosition(): Promise<Position>;
}

/**
 * Haptic feedback API
 */
export interface HapticsApi {
  impact(style: HapticImpactStyle): void;
  notification(type: HapticNotificationType): void;
}

/**
 * Secure storage API
 */
export interface StorageApi {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Native share sheet API
 */
export interface ShareApi {
  open(options: ShareOptions): Promise<ShareResult>;
}

/**
 * Network status API
 */
export interface NetworkApi {
  getStatus(): Promise<NetworkStatus>;
  onChange(callback: (status: NetworkStatus) => void): () => void;
}

/**
 * Device info API
 */
export interface DeviceApi {
  getInfo(): Promise<DeviceInfo>;
}

/**
 * Main Appo SDK interface
 */
export interface Appo {
  /** Whether running inside a native Appo app */
  isNative: boolean;
  /** SDK version */
  version: string;
  /** Push notifications */
  push: PushApi;
  /** Biometric authentication (Face ID / Touch ID) */
  biometrics: BiometricsApi;
  /** Camera access */
  camera: CameraApi;
  /** GPS/Geolocation */
  location: LocationApi;
  /** Haptic feedback */
  haptics: HapticsApi;
  /** Secure storage */
  storage: StorageApi;
  /** Native share sheet */
  share: ShareApi;
  /** Network connectivity */
  network: NetworkApi;
  /** Device information */
  device: DeviceApi;
}

/**
 * Internal message format for bridge communication
 */
export interface BridgeMessage {
  id: string;
  type: string;
  payload?: unknown;
}

/**
 * Internal response format from native
 */
export interface BridgeResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

declare global {
  interface Window {
    appo?: Appo;
    ReactNativeWebView?: {
      postMessage(message: string): void;
    };
  }
}
