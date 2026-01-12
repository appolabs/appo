import type { BridgeMessage, BridgeResponse } from './types';

type ResponseCallback = (response: BridgeResponse) => void;
type EventCallback = (data: unknown) => void;

const pendingRequests = new Map<string, ResponseCallback>();
const eventListeners = new Map<string, Set<EventCallback>>();

let messageIdCounter = 0;

/**
 * Generates a unique message ID for request/response correlation
 */
function generateMessageId(): string {
  return `msg_${Date.now()}_${++messageIdCounter}`;
}

/**
 * Checks if running inside a React Native WebView
 */
export function isNativeEnvironment(): boolean {
  return typeof window !== 'undefined' && !!window.ReactNativeWebView;
}

/**
 * Sends a message to the native layer and waits for a response
 */
export function sendMessage<T = unknown>(
  type: string,
  payload?: unknown,
  timeout = 30000
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!isNativeEnvironment()) {
      reject(new Error('Not running in native environment'));
      return;
    }

    const id = generateMessageId();
    const message: BridgeMessage = { id, type, payload };

    const timeoutId = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Request timed out: ${type}`));
    }, timeout);

    pendingRequests.set(id, (response: BridgeResponse) => {
      clearTimeout(timeoutId);
      pendingRequests.delete(id);

      if (response.success) {
        resolve(response.data as T);
      } else {
        reject(new Error(response.error || 'Unknown native error'));
      }
    });

    window.ReactNativeWebView!.postMessage(JSON.stringify(message));
  });
}

/**
 * Sends a fire-and-forget message to native (no response expected)
 */
export function postMessage(type: string, payload?: unknown): void {
  if (!isNativeEnvironment()) {
    return;
  }

  const id = generateMessageId();
  const message: BridgeMessage = { id, type, payload };
  window.ReactNativeWebView!.postMessage(JSON.stringify(message));
}

/**
 * Subscribes to events from the native layer
 */
export function addEventListener(event: string, callback: EventCallback): () => void {
  if (!eventListeners.has(event)) {
    eventListeners.set(event, new Set());
  }
  eventListeners.get(event)!.add(callback);

  return () => {
    const listeners = eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        eventListeners.delete(event);
      }
    }
  };
}

/**
 * Handles messages from the native layer (called from window.onmessage)
 */
export function handleNativeMessage(event: MessageEvent): void {
  let data: BridgeResponse | { event: string; data: unknown };

  try {
    data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
  } catch {
    return;
  }

  // Handle response to a pending request
  if ('id' in data && pendingRequests.has(data.id)) {
    const callback = pendingRequests.get(data.id);
    callback?.(data as BridgeResponse);
    return;
  }

  // Handle event broadcast from native
  if ('event' in data && data.event) {
    const listeners = eventListeners.get(data.event);
    if (listeners) {
      listeners.forEach((callback) => callback(data.data));
    }
  }
}

/**
 * Initializes the bridge message handler
 */
export function initializeBridge(): void {
  if (typeof window !== 'undefined') {
    window.addEventListener('message', handleNativeMessage);
  }
}
