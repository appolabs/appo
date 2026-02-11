/**
 * Categorized error codes for bridge failures
 */
export enum AppoErrorCode {
  NOT_NATIVE = 'NOT_NATIVE',
  TIMEOUT = 'TIMEOUT',
  NATIVE_ERROR = 'NATIVE_ERROR',
  BRIDGE_UNAVAILABLE = 'BRIDGE_UNAVAILABLE',
}

/**
 * Structured error with code and optional detail for programmatic handling
 */
export class AppoError extends Error {
  readonly code: AppoErrorCode;
  readonly detail?: string;

  constructor(code: AppoErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'AppoError';
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Log severity levels for bridge activity observation
 */
export type AppoLogLevel = 'debug' | 'warn' | 'error';

/**
 * Callback for observing bridge activity without SDK emitting console output
 */
export interface AppoLogger {
  (level: AppoLogLevel, message: string, data?: unknown): void;
}

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
 * Push notification response when user taps a notification
 */
export interface PushResponse {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  actionIdentifier: string;
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
  onResponse(callback: (response: PushResponse) => void): () => void;
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

/**
 * Event broadcast from native layer
 */
export interface BridgeEvent {
  event: string;
  data: unknown;
}

/**
 * Type guard for BridgeResponse envelope validation
 */
export function isBridgeResponse(data: unknown): data is BridgeResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    typeof (data as BridgeResponse).id === 'string' &&
    'success' in data &&
    typeof (data as BridgeResponse).success === 'boolean'
  );
}

/**
 * Type guard for BridgeEvent validation
 */
export function isBridgeEvent(data: unknown): data is BridgeEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'event' in data &&
    typeof (data as BridgeEvent).event === 'string'
  );
}

declare global {
  interface Window {
    appo?: Appo;
    ReactNativeWebView?: {
      postMessage(message: string): void;
    };
  }
}
