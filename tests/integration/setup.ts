import { vi } from 'vitest';

type BridgeModule = typeof import('../../src/bridge');

/**
 * Holds the dynamically imported bridge module for the current test.
 * Each setupIntegrationEnv() call resets modules and re-imports to get
 * fresh module-level state (pendingRequests, eventListeners, counter).
 */
let bridgeModule: BridgeModule | null = null;

/**
 * Creates a window mock with real addEventListener/removeEventListener,
 * a ReactNativeWebView.postMessage spy, initializes the bridge, and
 * returns the postMessage spy.
 *
 * Uses vi.resetModules() + dynamic import so each test gets fresh
 * bridge module state (pendingRequests, eventListeners cleared).
 */
export async function setupIntegrationEnv(): Promise<{
  postMessageSpy: ReturnType<typeof vi.fn>;
  bridge: BridgeModule;
}> {
  const listeners: Array<{ type: string; handler: EventListener }> = [];
  const postMessageSpy = vi.fn();

  (globalThis as any).window = {
    addEventListener(type: string, handler: EventListener) {
      listeners.push({ type, handler });
    },
    removeEventListener(type: string, handler: EventListener) {
      const idx = listeners.findIndex(
        (l) => l.type === type && l.handler === handler,
      );
      if (idx !== -1) listeners.splice(idx, 1);
    },
    ReactNativeWebView: { postMessage: postMessageSpy },
    appo: undefined,
  };

  // Reset module registry so the bridge's module-level Maps are fresh
  vi.resetModules();
  bridgeModule = await import('../../src/bridge');
  bridgeModule.initializeBridge();

  return { postMessageSpy, bridge: bridgeModule };
}

/**
 * Simulates a native response by dispatching through handleNativeMessage.
 * Takes {id, success, data?, error?} matching the BridgeResponse shape.
 */
export function simulateNativeResponse(response: {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}): void {
  if (!bridgeModule) {
    throw new Error('setupIntegrationEnv() must be called before simulateNativeResponse()');
  }
  const event = new MessageEvent('message', {
    data: JSON.stringify(response),
  });
  bridgeModule.handleNativeMessage(event);
}

/**
 * Simulates a native event broadcast (e.g. push.message, network.change)
 * by dispatching through handleNativeMessage with {event, data} shape.
 */
export function simulateNativeEvent(event: string, data: unknown): void {
  if (!bridgeModule) {
    throw new Error('setupIntegrationEnv() must be called before simulateNativeEvent()');
  }
  const messageEvent = new MessageEvent('message', {
    data: JSON.stringify({ event, data }),
  });
  bridgeModule.handleNativeMessage(messageEvent);
}

/**
 * Cleans up the integration environment by removing the window mock.
 * Must be called in afterEach to prevent leaks between tests.
 */
export function cleanupIntegrationEnv(): void {
  bridgeModule = null;
  delete (globalThis as any).window;
}
