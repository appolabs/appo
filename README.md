# @appolabs/appo

Access native device features from your web app running in Appo.

## Installation

```bash
npm install @appolabs/appo
```

Or include via script tag:

```html
<script src="https://unpkg.com/@appolabs/appo"></script>
```

## Usage

```typescript
import { getAppo } from '@appolabs/appo';

const appo = getAppo();

// Check if running in native app
if (appo.isNative) {
  // Request push notification permission
  const status = await appo.push.requestPermission();

  if (status === 'granted') {
    const token = await appo.push.getToken();
    // Send token to your server
  }
}
```

## Features

### Push Notifications

```typescript
await appo.push.requestPermission(); // 'granted' | 'denied'
await appo.push.getToken();          // Expo push token

// Listen for incoming notifications
appo.push.onMessage((msg) => {
  console.log('Push received:', msg.title, msg.body);
});
```

### Biometrics (Face ID / Touch ID)

```typescript
const available = await appo.biometrics.isAvailable();
if (available) {
  const success = await appo.biometrics.authenticate('Confirm your identity');
}
```

### Haptic Feedback

```typescript
appo.haptics.impact('light');   // 'light' | 'medium' | 'heavy'
appo.haptics.notification('success'); // 'success' | 'warning' | 'error'
```

### Secure Storage

```typescript
await appo.storage.set('key', 'value');
const value = await appo.storage.get('key');
await appo.storage.delete('key');
```

### Location

```typescript
const status = await appo.location.requestPermission();
if (status === 'granted') {
  const position = await appo.location.getCurrentPosition();
  console.log(position.latitude, position.longitude);
}
```

### Network Status

```typescript
const status = await appo.network.getStatus();
console.log(status.isConnected, status.type);

// Listen for network changes
appo.network.onStatusChange((status) => {
  console.log('Network changed:', status.isConnected);
});
```

### Native Share

```typescript
await appo.share.open({
  title: 'Check this out',
  message: 'Amazing content',
  url: 'https://example.com'
});
```

### Device Info

```typescript
const device = await appo.device.getInfo();
console.log(device.platform);     // 'ios' | 'android'
console.log(device.model);        // 'iPhone 15 Pro'
console.log(device.osVersion);    // '17.0'
```

## Browser Fallbacks

All APIs gracefully degrade when not running in the native app:

| API | Fallback |
|-----|----------|
| `push.requestPermission()` | Returns `'denied'` |
| `biometrics.isAvailable()` | Returns `false` |
| `haptics.*` | No-op (silent) |
| `storage.*` | Uses `localStorage` |
| `network.getStatus()` | Returns `{ isConnected: true, type: 'unknown' }` |

## TypeScript

Full TypeScript support with exported types:

```typescript
import type {
  Appo,
  PushMessage,
  DeviceInfo,
  NetworkStatus
} from '@appolabs/appo';
```

## License

MIT
