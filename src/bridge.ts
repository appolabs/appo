import type { BridgeMessage, BridgeResponse, AppoLogger, AppoLogLevel } from './types';
import { isBridgeResponse, isBridgeEvent, AppoError, AppoErrorCode } from './types';

type ResponseCallback = (response: BridgeResponse) => void;
type EventCallback = (data: unknown) => void;

const pendingRequests = new Map<string, ResponseCallback>();
const eventListeners = new Map<string, Set<EventCallback>>();

let messageIdCounter = 0;
let logger: AppoLogger | null = null;

/**
 * Registers a callback to observe bridge activity. Pass `null` to disable.
 * The SDK produces no console output by default.
 * @param fn - Logger callback receiving level, message, and optional data, or `null` to disable.
 */
export function setLogger(fn: AppoLogger | null): void {
  logger = fn;
}

function log(level: AppoLogLevel, message: string, data?: unknown): void {
  logger?.(level, message, data);
}

/**
 * Generates a unique message ID for request/response correlation.
 */
function generateMessageId(): string {
  return `msg_${Date.now()}_${++messageIdCounter}`;
}

/**
 * Checks if running inside a React Native WebView.
 * @returns `true` if `window.ReactNativeWebView` exists.
 */
export function isNativeEnvironment(): boolean {
  return typeof window !== 'undefined' && !!window.ReactNativeWebView;
}

/**
 * Sends a message to the native layer and waits for a correlated response.
 * @param type - The bridge message type (e.g., `'push.requestPermission'`).
 * @param payload - Optional data to send with the message.
 * @param timeout - Maximum wait time in milliseconds before rejecting. Defaults to 30000.
 * @returns The response data from the native handler.
 * @throws {AppoError} With code `NOT_NATIVE` if not in a native environment.
 * @throws {AppoError} With code `TIMEOUT` if the native layer does not respond in time.
 * @throws {AppoError} With code `NATIVE_ERROR` if the native handler returns an error.
 */
export function sendMessage<T = unknown>(
  type: string,
  payload?: unknown,
  timeout = 30000
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!isNativeEnvironment()) {
      reject(new AppoError(AppoErrorCode.NOT_NATIVE, 'Not running in native environment'));
      return;
    }

    const id = generateMessageId();
    const message: BridgeMessage = { id, type, payload };

    log('debug', 'Sending message', { type, id });

    const timeoutId = setTimeout(() => {
      pendingRequests.delete(id);
      log('warn', 'Request timed out', { type, id });
      reject(new AppoError(AppoErrorCode.TIMEOUT, 'Request timed out', type));
    }, timeout);

    pendingRequests.set(id, (response: BridgeResponse) => {
      clearTimeout(timeoutId);
      pendingRequests.delete(id);

      if (response.success) {
        resolve(response.data as T);
      } else {
        reject(new AppoError(AppoErrorCode.NATIVE_ERROR, response.error || 'Unknown native error', type));
      }
    });

    window.ReactNativeWebView!.postMessage(JSON.stringify(message));
  });
}

/**
 * Sends a fire-and-forget message to the native layer. No response is expected.
 * @param type - The bridge message type (e.g., `'haptics.impact'`).
 * @param payload - Optional data to send with the message.
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
 * Subscribes to events broadcast from the native layer.
 * @param event - The event channel name (e.g., `'push.message'`, `'network.change'`).
 * @param callback - Invoked with the event data when the native layer broadcasts on this channel.
 * @returns Unsubscribe function to remove the listener.
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
 * Handles incoming messages from the native layer.
 * Routes responses to pending request callbacks and events to registered listeners.
 * Silently discards malformed messages.
 * @param event - The `MessageEvent` from the `window.onmessage` handler.
 */
export function handleNativeMessage(event: MessageEvent): void {
  let data: unknown;

  try {
    data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
  } catch {
    log('warn', 'Failed to parse message');
    return;
  }

  // Handle response to a pending request
  if (isBridgeResponse(data) && pendingRequests.has(data.id)) {
    log('debug', 'Received response', { id: data.id });
    const callback = pendingRequests.get(data.id);
    callback?.(data);
    return;
  }

  // Handle event broadcast from native
  if (isBridgeEvent(data)) {
    log('debug', 'Received event', { event: data.event });
    const listeners = eventListeners.get(data.event);
    if (listeners) {
      listeners.forEach((callback) => callback(data.data));
    }
    return;
  }

  log('warn', 'Invalid message structure');
}

/**
 * Initializes the bridge by registering the window message listener.
 */
export function initializeBridge(): void {
  if (typeof window !== 'undefined') {
    window.addEventListener('message', handleNativeMessage);
  }
}
