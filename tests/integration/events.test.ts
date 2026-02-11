import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  setupIntegrationEnv,
  simulateNativeEvent,
  simulateNativeResponse,
  cleanupIntegrationEnv,
} from './setup';

type BridgeModule = typeof import('../../src/bridge');

describe('event broadcasting integration', () => {
  let postMessageSpy: Mock;
  let bridge: BridgeModule;

  beforeEach(async () => {
    const env = await setupIntegrationEnv();
    postMessageSpy = env.postMessageSpy as Mock;
    bridge = env.bridge;
  });

  afterEach(() => {
    cleanupIntegrationEnv();
  });

  it('push.message event reaches listener with correct data', () => {
    const callback = vi.fn();
    bridge.addEventListener('push.message', callback);

    simulateNativeEvent('push.message', {
      title: 'Hello',
      body: 'World',
      data: { key: 'value' },
    });

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({
      title: 'Hello',
      body: 'World',
      data: { key: 'value' },
    });
  });

  it('push.response event reaches listener with correct PushResponse shape', () => {
    const callback = vi.fn();
    bridge.addEventListener('push.response', callback);

    simulateNativeEvent('push.response', {
      title: 'Tapped',
      body: 'Notification',
      actionIdentifier: 'default',
      data: {},
    });

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({
      title: 'Tapped',
      body: 'Notification',
      actionIdentifier: 'default',
      data: {},
    });
  });

  it('network.change event reaches listener with NetworkStatus shape', () => {
    const callback = vi.fn();
    bridge.addEventListener('network.change', callback);

    simulateNativeEvent('network.change', {
      isConnected: true,
      type: 'wifi',
    });

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({
      isConnected: true,
      type: 'wifi',
    });
  });

  it('multiple listeners on same event all receive the broadcast', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    bridge.addEventListener('push.message', callback1);
    bridge.addEventListener('push.message', callback2);

    simulateNativeEvent('push.message', {
      title: 'Test',
      body: 'Multi',
      data: {},
    });

    expect(callback1).toHaveBeenCalledOnce();
    expect(callback2).toHaveBeenCalledOnce();
  });

  it('unsubscribe stops event delivery to that listener', () => {
    const callback = vi.fn();
    const unsubscribe = bridge.addEventListener('push.message', callback);

    unsubscribe();

    simulateNativeEvent('push.message', {
      title: 'After',
      body: 'Unsubscribe',
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('events do not interfere with pending requests', async () => {
    const eventCallback = vi.fn();
    bridge.addEventListener('push.message', eventCallback);

    // Fire a sendMessage request
    const promise = bridge.sendMessage<string>('test.action');
    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);

    // Simulate an event broadcast while request is pending
    simulateNativeEvent('push.message', { title: 'During', body: 'Request' });

    expect(eventCallback).toHaveBeenCalledOnce();
    expect(eventCallback).toHaveBeenCalledWith({ title: 'During', body: 'Request' });

    // Now resolve the pending request
    simulateNativeResponse({ id: sent.id, success: true, data: 'resolved' });
    const result = await promise;

    expect(result).toBe('resolved');
  });

  it('unknown event with no listener does not throw', () => {
    expect(() => {
      simulateNativeEvent('unknown.event', {});
    }).not.toThrow();
  });
});
