# @appolabs/appo SDK

JavaScript bridge SDK for native app features in React Native WebViews.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Web Application                         │
│                                                              │
│  window.appo.push.requestPermission()                        │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                 @appolabs/appo                       │    │
│  │                                                      │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │    │
│  │  │   push   │  │biometrics│  │  camera  │  ...     │    │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘          │    │
│  │       │             │             │                 │    │
│  │       └─────────────┼─────────────┘                 │    │
│  │                     ▼                               │    │
│  │            ┌──────────────┐                         │    │
│  │            │    bridge    │                         │    │
│  │            │  sendMessage │                         │    │
│  │            │ postMessage  │                         │    │
│  │            │ addEventListener                       │    │
│  │            └──────┬───────┘                         │    │
│  └───────────────────┼─────────────────────────────────┘    │
│                      │                                       │
└──────────────────────┼───────────────────────────────────────┘
                       │ window.ReactNativeWebView.postMessage()
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   React Native App                           │
│                                                              │
│  onMessage={(event) => handleWebViewMessage(event)}          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Core Concepts

### Bridge Communication (`src/bridge.ts`)

The bridge handles all communication with the native layer:

- **`sendMessage<T>(type, payload, timeout)`** - Request/response pattern with Promise
- **`postMessage(type, payload)`** - Fire-and-forget, no response expected
- **`addEventListener(event, callback)`** - Subscribe to native events, returns unsubscribe function
- **`isNativeEnvironment()`** - Checks for `window.ReactNativeWebView`

Message correlation uses unique IDs: `msg_{timestamp}_{counter}`

### Message Protocol

**Request (Web → Native):**
```json
{
  "id": "msg_1234567890_1",
  "type": "push.requestPermission",
  "payload": {}
}
```

**Response (Native → Web):**
```json
{
  "id": "msg_1234567890_1",
  "success": true,
  "data": "granted"
}
```

**Event Broadcast (Native → Web):**
```json
{
  "event": "push.message",
  "data": { "title": "Hello", "body": "World" }
}
```

### Graceful Fallbacks

All APIs provide browser fallbacks when not in native environment:

| API | Fallback Behavior |
|-----|-------------------|
| `push.requestPermission()` | Returns `'denied'` |
| `push.getToken()` | Returns `null` |
| `biometrics.isAvailable()` | Returns `false` |
| `biometrics.authenticate()` | Returns `false` |
| `camera.requestPermission()` | Returns `'denied'` |
| `location.requestPermission()` | Returns `'denied'` |
| `haptics.impact()` | No-op (silent) |
| `haptics.notification()` | No-op (silent) |
| `storage.*` | Uses `localStorage` |
| `share.open()` | Uses `navigator.share` or rejects |
| `network.getStatus()` | Returns `{ isConnected: true, type: 'unknown' }` |
| `device.getInfo()` | Returns user agent info |

## File Structure

```
packages/appo/
├── src/
│   ├── index.ts           # Main entry, exports, auto-init
│   ├── bridge.ts          # postMessage communication layer
│   ├── types.ts           # TypeScript interfaces
│   └── features/
│       ├── index.ts       # Feature exports
│       ├── push.ts        # Push notifications
│       ├── biometrics.ts  # Face ID / Touch ID
│       ├── camera.ts      # Camera access
│       ├── location.ts    # GPS/Geolocation
│       ├── haptics.ts     # Haptic feedback
│       ├── storage.ts     # Secure storage (localStorage fallback)
│       ├── share.ts       # Native share sheet
│       ├── network.ts     # Network status
│       └── device.ts      # Device info
├── tests/
│   └── index.test.ts      # Vitest tests
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Usage

```typescript
import { getAppo } from '@appolabs/appo';
// Or via script tag: window.appo is auto-initialized

const appo = getAppo();

// Check environment
if (appo.isNative) {
  // Request push permission
  const status = await appo.push.requestPermission();
  if (status === 'granted') {
    const token = await appo.push.getToken();
    // Send token to server
  }

  // Subscribe to push messages
  const unsubscribe = appo.push.onMessage((msg) => {
    console.log('Push received:', msg);
  });
}

// Storage works in both environments
await appo.storage.set('key', 'value');
const value = await appo.storage.get('key');
```

## Adding New Features

1. Create feature file in `src/features/`:
```typescript
// src/features/newfeature.ts
import { sendMessage, isNativeEnvironment } from '../bridge';
import type { NewFeatureApi } from '../types';

export function createNewFeatureApi(): NewFeatureApi {
  return {
    async doSomething(): Promise<Result> {
      if (!isNativeEnvironment()) {
        return fallbackValue; // Browser fallback
      }
      return sendMessage<Result>('newfeature.doSomething');
    },
  };
}
```

2. Add types to `src/types.ts`
3. Export from `src/features/index.ts`
4. Add to `Appo` interface and `createAppo()` in `src/index.ts`
5. Add tests to `tests/index.test.ts`

## React Native Handler

The native implementation is in `wrapper-mobile-app/.vendor/appolabs/react-native-webnavigationview`:

### Message Handling (`src/views/WebView.tsx`)

The WebView component handles both legacy events and the new request/response pattern:

```typescript
function handleMessage(event: WebViewMessageEvent) {
  const data = JSON.parse(event.nativeEvent.data);

  // Legacy event-based messages (backward compatible)
  if ('event' in data) {
    // Handled by onMessage callback
    return;
  }

  // New request/response pattern
  if ('id' in data && 'type' in data) {
    handleBridgeRequest(data);
  }
}

async function handleBridgeRequest(message: BridgeMessage) {
  const { id, type, payload } = message;
  try {
    const result = await dispatchToHandler(type, payload);
    sendBridgeResponse({ id, success: true, data: result });
  } catch (error) {
    sendBridgeResponse({ id, success: false, error: error.message });
  }
}
```

### Feature Handlers (`src/handlers/index.ts`)

All SDK features are implemented using Expo packages:

| SDK Feature | Native Implementation |
|-------------|----------------------|
| `push.*` | `expo-notifications` |
| `biometrics.*` | `expo-local-authentication` |
| `haptics.*` | `expo-haptics` |
| `storage.*` | `@react-native-async-storage/async-storage` |
| `location.*` | `expo-location` |
| `network.*` | `@react-native-community/netinfo` |
| `share.*` | React Native `Share` |
| `device.*` | `expo-device` |

### Event Broadcasts (`src/index.tsx`)

Native-initiated events are broadcast to the WebView:

```typescript
// Push notification received
Notifications.addNotificationReceivedListener(notification => {
  broadcastEvent({
    event: 'push.message',
    data: notification.request.content
  });
});

// Network status changed
NetInfo.addEventListener(state => {
  broadcastEvent({
    event: 'network.change',
    data: { isConnected: state.isConnected, type: state.type }
  });
});
```

## Commands

```bash
npm run build      # Build CJS + ESM + DTS
npm run dev        # Watch mode
npm run test       # Run vitest tests
npm run test:watch # Watch mode tests
```

## Key Implementation Details

- **Singleton pattern**: `window.appo` is created once, subsequent calls return same instance
- **Auto-initialization**: SDK initializes when script is loaded (for script tag usage)
- **Timeout handling**: All sendMessage calls have 30s default timeout
- **Type safety**: Full TypeScript with exported interfaces
- **Zero dependencies**: No runtime dependencies, only dev deps
