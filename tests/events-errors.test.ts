import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  addEventListener,
  handleNativeMessage,
  setLogger,
  initializeBridge,
  sendMessage,
} from '../src/bridge';

afterEach(() => {
  setLogger(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (globalThis as any).window?.ReactNativeWebView;
});

beforeEach(() => {
  if (typeof (globalThis as any).window === 'undefined') {
    (globalThis as any).window = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  }
});

/**
 * Helper: dispatch a native event message through handleNativeMessage
 */
function dispatchEvent(event: string, data: unknown): void {
  handleNativeMessage(
    new MessageEvent('message', {
      data: JSON.stringify({ event, data }),
    })
  );
}

describe('addEventListener() lifecycle', () => {
  it('returns an unsubscribe function', () => {
    const unsubscribe = addEventListener('test.event', vi.fn());
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('callback receives event data when matching event is dispatched', () => {
    const callback = vi.fn();
    addEventListener('test.event', callback);

    dispatchEvent('test.event', { foo: 'bar' });

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({ foo: 'bar' });
  });

  it('unsubscribe removes the listener', () => {
    const callback = vi.fn();
    const unsubscribe = addEventListener('test.event', callback);

    unsubscribe();
    dispatchEvent('test.event', { foo: 'bar' });

    expect(callback).not.toHaveBeenCalled();
  });

  it('multiple listeners on same event all receive data', () => {
    const callbackA = vi.fn();
    const callbackB = vi.fn();
    addEventListener('shared.event', callbackA);
    addEventListener('shared.event', callbackB);

    dispatchEvent('shared.event', { value: 42 });

    expect(callbackA).toHaveBeenCalledOnce();
    expect(callbackA).toHaveBeenCalledWith({ value: 42 });
    expect(callbackB).toHaveBeenCalledOnce();
    expect(callbackB).toHaveBeenCalledWith({ value: 42 });
  });

  it('listeners on different events are independent', () => {
    const callbackA = vi.fn();
    const callbackB = vi.fn();
    addEventListener('event.a', callbackA);
    addEventListener('event.b', callbackB);

    dispatchEvent('event.a', 'payload-a');

    expect(callbackA).toHaveBeenCalledOnce();
    expect(callbackB).not.toHaveBeenCalled();
  });
});

describe('handleNativeMessage() edge cases', () => {
  it('silently discards non-JSON string data', () => {
    expect(() => {
      handleNativeMessage(
        new MessageEvent('message', { data: 'not valid json{{{' })
      );
    }).not.toThrow();
  });

  it('silently discards messages with invalid structure', () => {
    expect(() => {
      handleNativeMessage(
        new MessageEvent('message', {
          data: JSON.stringify({ random: 'data' }),
        })
      );
    }).not.toThrow();
  });

  it('handles already-parsed object data', () => {
    const callback = vi.fn();
    addEventListener('obj.event', callback);

    handleNativeMessage(
      new MessageEvent('message', {
        data: { event: 'obj.event', data: { parsed: true } },
      })
    );

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({ parsed: true });
  });
});

describe('setLogger() callback', () => {
  it('logger receives debug log when sendMessage is called in native mode', () => {
    const logFn = vi.fn();
    setLogger(logFn);

    (globalThis as any).window.ReactNativeWebView = {
      postMessage: vi.fn(),
    };

    // sendMessage returns a promise; we don't await because we just need the log call
    sendMessage('test.action', {});

    expect(logFn).toHaveBeenCalledWith(
      'debug',
      'Sending message',
      expect.objectContaining({ type: 'test.action' })
    );
  });

  it('logger receives warn on timeout', async () => {
    vi.useFakeTimers();
    const logFn = vi.fn();
    setLogger(logFn);

    (globalThis as any).window.ReactNativeWebView = {
      postMessage: vi.fn(),
    };

    const promise = sendMessage('slow.action', {}, 100);

    vi.advanceTimersByTime(100);

    await expect(promise).rejects.toThrow('Request timed out');

    expect(logFn).toHaveBeenCalledWith(
      'warn',
      'Request timed out',
      expect.objectContaining({ type: 'slow.action' })
    );
  });

  it('logger receives warn on malformed JSON message', () => {
    const logFn = vi.fn();
    setLogger(logFn);

    handleNativeMessage(
      new MessageEvent('message', { data: '<<<invalid json>>>' })
    );

    expect(logFn).toHaveBeenCalledWith('warn', 'Failed to parse message', undefined);
  });

  it('setting logger to null disables logging', () => {
    const logFn = vi.fn();
    setLogger(logFn);
    setLogger(null);

    handleNativeMessage(
      new MessageEvent('message', { data: '<<<invalid json>>>' })
    );

    expect(logFn).not.toHaveBeenCalled();
  });
});
