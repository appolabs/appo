import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  sendMessage,
  postMessage,
  isNativeEnvironment,
  initializeBridge,
  handleNativeMessage,
} from '../src/bridge';
import { AppoError, AppoErrorCode } from '../src/types';

beforeEach(() => {
  // Reset window mock with no ReactNativeWebView by default
  (globalThis as any).window = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    ReactNativeWebView: null,
    appo: undefined,
  };
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Helper: configure window as native environment with a postMessage spy
 */
function setupNativeEnv() {
  const postMessageSpy = vi.fn();
  (globalThis as any).window.ReactNativeWebView = { postMessage: postMessageSpy };
  return postMessageSpy;
}

/**
 * Helper: simulate a native response by dispatching through handleNativeMessage
 */
function simulateNativeResponse(response: {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}) {
  const event = new MessageEvent('message', {
    data: JSON.stringify(response),
  });
  handleNativeMessage(event);
}

describe('bridge', () => {
  describe('isNativeEnvironment()', () => {
    it('returns false when ReactNativeWebView is null', () => {
      expect(isNativeEnvironment()).toBe(false);
    });

    it('returns true when ReactNativeWebView is present', () => {
      setupNativeEnv();
      expect(isNativeEnvironment()).toBe(true);
    });
  });

  describe('sendMessage() request/response flow', () => {
    it('sends correctly formatted JSON via postMessage', async () => {
      const postMessageSpy = setupNativeEnv();
      initializeBridge();

      const payload = { key: 'value' };
      const promise = sendMessage('test.action', payload);

      expect(postMessageSpy).toHaveBeenCalledOnce();
      const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);

      expect(sent).toHaveProperty('id');
      expect(sent.id).toMatch(/^msg_/);
      expect(sent.type).toBe('test.action');
      expect(sent.payload).toEqual(payload);

      // Resolve the pending request to avoid dangling promise
      simulateNativeResponse({ id: sent.id, success: true, data: 'ok' });
      await promise;
    });

    it('resolves with response.data on success', async () => {
      const postMessageSpy = setupNativeEnv();
      initializeBridge();

      const promise = sendMessage<string>('test.success');
      const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);

      simulateNativeResponse({ id: sent.id, success: true, data: 'granted' });

      const result = await promise;
      expect(result).toBe('granted');
    });

    it('rejects with AppoError(NATIVE_ERROR) on failure response', async () => {
      const postMessageSpy = setupNativeEnv();
      initializeBridge();

      const promise = sendMessage('test.fail');
      const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);

      simulateNativeResponse({
        id: sent.id,
        success: false,
        error: 'Permission denied',
      });

      try {
        await promise;
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppoError);
        expect((err as AppoError).code).toBe(AppoErrorCode.NATIVE_ERROR);
        expect((err as AppoError).message).toBe('Permission denied');
      }
    });

    it('rejects with AppoError(NOT_NATIVE) when not in native environment', async () => {
      // ReactNativeWebView is null by default from beforeEach
      try {
        await sendMessage('test.nonative');
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppoError);
        expect((err as AppoError).code).toBe(AppoErrorCode.NOT_NATIVE);
      }
    });
  });

  describe('sendMessage() timeout handling', () => {
    it('rejects with AppoError(TIMEOUT) after specified timeout', async () => {
      vi.useFakeTimers();
      setupNativeEnv();
      initializeBridge();

      const promise = sendMessage('test.timeout', undefined, 50);

      vi.advanceTimersByTime(50);

      try {
        await promise;
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppoError);
        expect((err as AppoError).code).toBe(AppoErrorCode.TIMEOUT);
      }
    });

    it('cleans up pending request on timeout so subsequent messages work', async () => {
      vi.useFakeTimers();
      const postMessageSpy = setupNativeEnv();
      initializeBridge();

      // First message: let it timeout
      const promise1 = sendMessage('test.timeout1', undefined, 50);
      vi.advanceTimersByTime(50);

      try {
        await promise1;
      } catch {
        // expected timeout
      }

      // Second message: respond normally
      const promise2 = sendMessage<string>('test.timeout2', undefined, 5000);
      // postMessageSpy has been called twice now (once for each sendMessage)
      const sent2 = JSON.parse(postMessageSpy.mock.calls[postMessageSpy.mock.calls.length - 1][0]);

      simulateNativeResponse({ id: sent2.id, success: true, data: 'works' });

      const result = await promise2;
      expect(result).toBe('works');
    });
  });

  describe('postMessage() fire-and-forget', () => {
    it('calls ReactNativeWebView.postMessage with correct JSON structure', () => {
      const postMessageSpy = setupNativeEnv();

      postMessage('analytics.track', { event: 'click' });

      expect(postMessageSpy).toHaveBeenCalledOnce();
      const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
      expect(sent).toHaveProperty('id');
      expect(sent.id).toMatch(/^msg_/);
      expect(sent.type).toBe('analytics.track');
      expect(sent.payload).toEqual({ event: 'click' });
    });

    it('does nothing when not in native environment', () => {
      // ReactNativeWebView is null by default
      expect(() => postMessage('analytics.track')).not.toThrow();
    });
  });

  describe('message ID uniqueness', () => {
    it('generates different IDs for consecutive messages', () => {
      const postMessageSpy = setupNativeEnv();
      initializeBridge();

      postMessage('msg.one');
      postMessage('msg.two');

      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      const id1 = JSON.parse(postMessageSpy.mock.calls[0][0]).id;
      const id2 = JSON.parse(postMessageSpy.mock.calls[1][0]).id;

      expect(id1).not.toBe(id2);
    });
  });
});
