# @appolabs/appo

JavaScript bridge SDK for accessing native device features from web apps running inside React Native WebViews.

## Installation

```bash
npm install @appolabs/appo
```

```bash
pnpm add @appolabs/appo
```

```bash
yarn add @appolabs/appo
```

Or include via script tag (auto-initializes `window.appo`):

```html
<script src="https://unpkg.com/@appolabs/appo"></script>
```

## Quick Start

```typescript
import { getAppo } from '@appolabs/appo';

const appo = getAppo();

if (appo.isNative) {
  const status = await appo.push.requestPermission();
  if (status === 'granted') {
    const token = await appo.push.getToken();
  }
}
```

## Initialization

The SDK provides two initialization functions and a singleton pattern:

```typescript
import { getAppo, initAppo } from '@appolabs/appo';

// Option 1: getAppo() - initializes on first call, returns existing instance after
const appo = getAppo();

// Option 2: initAppo() - explicit initialization, attaches to window.appo
const appo = initAppo();
```

When loaded via `<script>` tag, the SDK auto-initializes and attaches to `window.appo`. Subsequent calls to `getAppo()` or `initAppo()` return the same singleton instance.

The `isNative` property indicates whether the SDK is running inside a native Appo container (`true`) or a regular browser (`false`).

```typescript
const appo = getAppo();
console.log(appo.isNative);  // true inside Appo app, false in browser
console.log(appo.version);   // SDK version string
```

## API Reference

### Push Notifications

```typescript
interface PushApi {
  requestPermission(): Promise<PermissionStatus>;
  getToken(): Promise<string | null>;
  onMessage(callback: (message: PushMessage) => void): () => void;
  onResponse(callback: (response: PushResponse) => void): () => void;
}
```

Request permission and retrieve the push token:

```typescript
const status = await appo.push.requestPermission();
// status: 'granted' | 'denied' | 'undetermined'

if (status === 'granted') {
  const token = await appo.push.getToken();
  // token: string | null
}
```

Subscribe to incoming push notifications:

```typescript
const unsubscribe = appo.push.onMessage((message) => {
  console.log(message.title, message.body, message.data);
});

// Later: stop listening
unsubscribe();
```

Subscribe to notification tap events (when user taps a notification):

```typescript
const unsubscribe = appo.push.onResponse((response) => {
  console.log(response.title, response.body, response.actionIdentifier);
});
```

### Biometrics

```typescript
interface BiometricsApi {
  isAvailable(): Promise<boolean>;
  authenticate(reason: string): Promise<boolean>;
}
```

```typescript
const available = await appo.biometrics.isAvailable();
if (available) {
  const success = await appo.biometrics.authenticate('Confirm your identity');
}
```

### Camera

```typescript
interface CameraApi {
  requestPermission(): Promise<PermissionStatus>;
  takePicture(): Promise<CameraResult>;
}
```

```typescript
const status = await appo.camera.requestPermission();
if (status === 'granted') {
  const result = await appo.camera.takePicture();
  // result: { uri: string, base64?: string, width: number, height: number }
}
```

### Location

```typescript
interface LocationApi {
  requestPermission(): Promise<PermissionStatus>;
  getCurrentPosition(): Promise<Position>;
}
```

```typescript
const status = await appo.location.requestPermission();
if (status === 'granted') {
  const position = await appo.location.getCurrentPosition();
  // position: { latitude, longitude, altitude?, accuracy?, timestamp }
}
```

### Haptics

```typescript
interface HapticsApi {
  impact(style: HapticImpactStyle): void;
  notification(type: HapticNotificationType): void;
}
```

```typescript
appo.haptics.impact('light');        // 'light' | 'medium' | 'heavy'
appo.haptics.notification('success'); // 'success' | 'warning' | 'error'
```

### Storage

```typescript
interface StorageApi {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
```

```typescript
await appo.storage.set('auth_token', 'abc123');
const token = await appo.storage.get('auth_token');
await appo.storage.delete('auth_token');
```

### Share

```typescript
interface ShareApi {
  open(options: ShareOptions): Promise<ShareResult>;
}
```

```typescript
const result = await appo.share.open({
  title: 'Check this out',
  message: 'Content to share',
  url: 'https://example.com',
});
// result: { success: boolean, action?: string }
```

### Network

```typescript
interface NetworkApi {
  getStatus(): Promise<NetworkStatus>;
  onChange(callback: (status: NetworkStatus) => void): () => void;
}
```

```typescript
const status = await appo.network.getStatus();
// status: { isConnected: boolean, type: 'wifi' | 'cellular' | 'none' | 'unknown' }

const unsubscribe = appo.network.onChange((status) => {
  console.log('Network changed:', status.isConnected, status.type);
});
```

### Device

```typescript
interface DeviceApi {
  getInfo(): Promise<DeviceInfo>;
}
```

```typescript
const info = await appo.device.getInfo();
// info: { platform, osVersion, appVersion, deviceId, deviceName, isTablet }
```

## Error Handling

All bridge operations that require a native environment throw `AppoError` with categorized error codes:

```typescript
import { AppoError, AppoErrorCode } from '@appolabs/appo';

try {
  const token = await appo.push.getToken();
} catch (error) {
  if (error instanceof AppoError) {
    switch (error.code) {
      case AppoErrorCode.NOT_NATIVE:
        // Not running inside a native Appo app
        break;
      case AppoErrorCode.TIMEOUT:
        // Native layer did not respond within 30s
        break;
      case AppoErrorCode.NATIVE_ERROR:
        // Native handler returned an error
        break;
      case AppoErrorCode.BRIDGE_UNAVAILABLE:
        // Bridge communication channel unavailable
        break;
    }
    console.log(error.message, error.detail);
  }
}
```

`AppoError` extends `Error`, so existing `catch` blocks continue to work without modification.

```typescript
class AppoError extends Error {
  readonly code: AppoErrorCode;
  readonly detail?: string;
}

enum AppoErrorCode {
  NOT_NATIVE = 'NOT_NATIVE',
  TIMEOUT = 'TIMEOUT',
  NATIVE_ERROR = 'NATIVE_ERROR',
  BRIDGE_UNAVAILABLE = 'BRIDGE_UNAVAILABLE',
}
```

## Logging

The SDK produces no console output by default. Use `setLogger` to observe bridge activity:

```typescript
import { setLogger } from '@appolabs/appo';

setLogger((level, message, data) => {
  // level: 'debug' | 'warn' | 'error'
  console.log(`[appo:${level}]`, message, data);
});

// Disable logging
setLogger(null);
```

Log events include message sends, responses received, timeouts, and parse failures. Payloads are excluded from log data to prevent leaking sensitive information.

## Browser Fallbacks

All APIs provide fallback behavior when running outside a native Appo container:

| Feature | Method | Fallback |
|---------|--------|----------|
| Push | `requestPermission()` | Returns `'denied'` |
| Push | `getToken()` | Returns `null` |
| Push | `onMessage()` | Returns no-op unsubscribe |
| Push | `onResponse()` | Returns no-op unsubscribe |
| Biometrics | `isAvailable()` | Returns `false` |
| Biometrics | `authenticate()` | Returns `false` |
| Camera | `requestPermission()` | Returns `'denied'` |
| Camera | `takePicture()` | Throws `Error` |
| Location | `requestPermission()` | Returns `'denied'` |
| Location | `getCurrentPosition()` | Throws `Error` |
| Haptics | `impact()` | No-op |
| Haptics | `notification()` | No-op |
| Storage | `get()` / `set()` / `delete()` | Uses `localStorage` |
| Share | `open()` | Uses `navigator.share` if available, otherwise `{ success: false }` |
| Network | `getStatus()` | Returns `{ isConnected: navigator.onLine, type: 'unknown' }` |
| Network | `onChange()` | Listens to browser `online`/`offline` events |
| Device | `getInfo()` | Returns user agent-based info with `osVersion: 'web'` |

## TypeScript

All types are exported for use in consuming applications:

```typescript
import type {
  // Core
  Appo,
  PermissionStatus,

  // Push
  PushApi,
  PushMessage,
  PushResponse,

  // Camera
  CameraApi,
  CameraResult,

  // Location
  LocationApi,
  Position,

  // Haptics
  HapticsApi,
  HapticImpactStyle,
  HapticNotificationType,

  // Storage
  StorageApi,

  // Share
  ShareApi,
  ShareOptions,
  ShareResult,

  // Network
  NetworkApi,
  NetworkStatus,

  // Device
  DeviceApi,
  DeviceInfo,

  // Biometrics
  BiometricsApi,

  // Bridge internals
  BridgeResponse,
  BridgeEvent,

  // Logging
  AppoLogLevel,
  AppoLogger,
} from '@appolabs/appo';

// Value exports
import {
  getAppo,
  initAppo,
  setLogger,
  AppoError,
  AppoErrorCode,
  isBridgeResponse,
  isBridgeEvent,
  VERSION,
} from '@appolabs/appo';
```

## Architecture

The SDK communicates with the native React Native layer through `window.ReactNativeWebView.postMessage()`:

```
Web App (SDK)                          React Native App
─────────────────                      ─────────────────
sendMessage(type, payload)
  │
  ├─ Generate unique ID
  ├─ Register pending callback
  ├─ postMessage({ id, type, payload })
  │                                    onMessage(event)
  │                                      ├─ Parse message
  │                                      ├─ Dispatch to handler
  │                                      └─ Send response ──────┐
  │                                                              │
  ◄──────────────────── { id, success, data } ──────────────────┘
  │
  ├─ Match response to pending request by ID
  ├─ Resolve/reject promise
  └─ Return data to caller
```

Event broadcasts flow from native to web:

```
React Native App                       Web App (SDK)
─────────────────                      ─────────────────
Native event fires
  │
  ├─ broadcastEvent({ event, data })
  │                                    handleNativeMessage()
  │                                      ├─ Detect event (no id field)
  │                                      └─ Notify registered listeners
  │
  └─ Example events:
     'push.message'    → push.onMessage() callbacks
     'push.response'   → push.onResponse() callbacks
     'network.change'  → network.onChange() callbacks
```

All `sendMessage` calls have a default 30-second timeout. Message IDs use the format `msg_{timestamp}_{counter}` for correlation.

## License

MIT
