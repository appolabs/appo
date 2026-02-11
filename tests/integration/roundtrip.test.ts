import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  setupIntegrationEnv,
  simulateNativeResponse,
  cleanupIntegrationEnv,
} from './setup';

type BridgeModule = typeof import('../../src/bridge');

describe('bridge round-trip integration', () => {
  let postMessageSpy: Mock;
  let bridge: BridgeModule;

  beforeEach(async () => {
    const env = await setupIntegrationEnv();
    postMessageSpy = env.postMessageSpy as Mock;
    bridge = env.bridge;
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanupIntegrationEnv();
  });

  it('resolves with data on success round-trip', async () => {
    const promise = bridge.sendMessage<string>('test.action');

    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
    simulateNativeResponse({ id: sent.id, success: true, data: 'result-value' });

    const result = await promise;
    expect(result).toBe('result-value');
  });

  it('rejects with AppoError(NATIVE_ERROR) on error round-trip', async () => {
    const { AppoError, AppoErrorCode } = await import('../../src/types');

    const promise = bridge.sendMessage('test.fail');
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
      expect((err as InstanceType<typeof AppoError>).code).toBe(AppoErrorCode.NATIVE_ERROR);
    }
  });

  it('rejects with AppoError(TIMEOUT) after specified timeout', async () => {
    vi.useFakeTimers();
    const { AppoError, AppoErrorCode } = await import('../../src/types');

    const promise = bridge.sendMessage('test.timeout', undefined, 100);
    vi.advanceTimersByTime(100);

    try {
      await promise;
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppoError);
      expect((err as InstanceType<typeof AppoError>).code).toBe(AppoErrorCode.TIMEOUT);
    }
  });

  it('sends correctly formatted message with id, type, and payload', async () => {
    const promise = bridge.sendMessage('push.requestPermission', { key: 'val' });

    expect(postMessageSpy).toHaveBeenCalledOnce();
    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);

    expect(sent.id).toMatch(/^msg_/);
    expect(sent.type).toBe('push.requestPermission');
    expect(sent.payload).toEqual({ key: 'val' });

    // Resolve to avoid dangling promise
    simulateNativeResponse({ id: sent.id, success: true, data: 'granted' });
    await promise;
  });

  it('resolves multiple concurrent requests independently', async () => {
    const promise1 = bridge.sendMessage<string>('req.one');
    const promise2 = bridge.sendMessage<string>('req.two');

    expect(postMessageSpy).toHaveBeenCalledTimes(2);

    const sent1 = JSON.parse(postMessageSpy.mock.calls[0][0]);
    const sent2 = JSON.parse(postMessageSpy.mock.calls[1][0]);

    expect(sent1.id).not.toBe(sent2.id);

    // Respond in reverse order
    simulateNativeResponse({ id: sent2.id, success: true, data: 'two' });
    simulateNativeResponse({ id: sent1.id, success: true, data: 'one' });

    expect(await promise1).toBe('one');
    expect(await promise2).toBe('two');
  });

  it('silently discards late response after timeout', async () => {
    vi.useFakeTimers();

    const promise = bridge.sendMessage('test.late', undefined, 100);
    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);

    vi.advanceTimersByTime(100);

    try {
      await promise;
    } catch {
      // expected timeout
    }

    // Late response after timeout should not throw
    expect(() => {
      simulateNativeResponse({ id: sent.id, success: true, data: 'too-late' });
    }).not.toThrow();
  });
});
