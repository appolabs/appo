import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  setupIntegrationEnv,
  simulateNativeResponse,
  cleanupIntegrationEnv,
} from './setup';

/**
 * Feature-level integration tests. Each test calls a feature API method,
 * intercepts the postMessage call to extract the message ID, simulates
 * a native response, and asserts the promise resolves with correct data.
 *
 * Feature factories are dynamically imported AFTER setupIntegrationEnv()
 * so they share the same bridge module instance that was initialized.
 */

describe('feature integration: push', () => {
  let postMessageSpy: Mock;

  beforeEach(async () => {
    const env = await setupIntegrationEnv();
    postMessageSpy = env.postMessageSpy as Mock;
  });

  afterEach(() => {
    cleanupIntegrationEnv();
  });

  it('requestPermission() sends correct type and resolves with granted', async () => {
    const { createPushApi } = await import('../../src/features/push');
    const push = createPushApi();

    const promise = push.requestPermission();

    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
    expect(sent.type).toBe('push.requestPermission');

    simulateNativeResponse({ id: sent.id, success: true, data: 'granted' });
    const result = await promise;
    expect(result).toBe('granted');
  });

  it('getToken() sends correct type and resolves with token string', async () => {
    const { createPushApi } = await import('../../src/features/push');
    const push = createPushApi();

    const promise = push.getToken();

    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
    expect(sent.type).toBe('push.getToken');

    simulateNativeResponse({
      id: sent.id,
      success: true,
      data: 'ExponentPushToken[xxx]',
    });
    const result = await promise;
    expect(result).toBe('ExponentPushToken[xxx]');
  });

  it('getToken() resolves with null when no token available', async () => {
    const { createPushApi } = await import('../../src/features/push');
    const push = createPushApi();

    const promise = push.getToken();

    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
    simulateNativeResponse({ id: sent.id, success: true, data: null });

    const result = await promise;
    expect(result).toBeNull();
  });
});

describe('feature integration: biometrics', () => {
  let postMessageSpy: Mock;

  beforeEach(async () => {
    const env = await setupIntegrationEnv();
    postMessageSpy = env.postMessageSpy as Mock;
  });

  afterEach(() => {
    cleanupIntegrationEnv();
  });

  it('isAvailable() sends correct type and resolves with boolean', async () => {
    const { createBiometricsApi } = await import('../../src/features/biometrics');
    const biometrics = createBiometricsApi();

    const promise = biometrics.isAvailable();

    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
    expect(sent.type).toBe('biometrics.isAvailable');

    simulateNativeResponse({ id: sent.id, success: true, data: true });
    const result = await promise;
    expect(result).toBe(true);
  });

  it('authenticate() sends reason in payload and resolves with true', async () => {
    const { createBiometricsApi } = await import('../../src/features/biometrics');
    const biometrics = createBiometricsApi();

    const promise = biometrics.authenticate('Confirm');

    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
    expect(sent.type).toBe('biometrics.authenticate');
    expect(sent.payload).toEqual({ reason: 'Confirm' });

    simulateNativeResponse({ id: sent.id, success: true, data: true });
    const result = await promise;
    expect(result).toBe(true);
  });

  it('authenticate() rejects with AppoError(NATIVE_ERROR) on cancellation', async () => {
    const { createBiometricsApi } = await import('../../src/features/biometrics');
    const { AppoError, AppoErrorCode } = await import('../../src/types');
    const biometrics = createBiometricsApi();

    const promise = biometrics.authenticate('Confirm');

    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
    simulateNativeResponse({
      id: sent.id,
      success: false,
      error: 'User cancelled',
    });

    try {
      await promise;
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppoError);
      expect((err as InstanceType<typeof AppoError>).code).toBe(
        AppoErrorCode.NATIVE_ERROR,
      );
    }
  });
});

describe('feature integration: camera', () => {
  let postMessageSpy: Mock;

  beforeEach(async () => {
    const env = await setupIntegrationEnv();
    postMessageSpy = env.postMessageSpy as Mock;
  });

  afterEach(() => {
    cleanupIntegrationEnv();
  });

  it('requestPermission() sends correct type and resolves with granted', async () => {
    const { createCameraApi } = await import('../../src/features/camera');
    const camera = createCameraApi();

    const promise = camera.requestPermission();

    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
    expect(sent.type).toBe('camera.requestPermission');

    simulateNativeResponse({ id: sent.id, success: true, data: 'granted' });
    const result = await promise;
    expect(result).toBe('granted');
  });

  it('takePicture() rejects with AppoError on native failure', async () => {
    const { createCameraApi } = await import('../../src/features/camera');
    const { AppoError, AppoErrorCode } = await import('../../src/types');
    const camera = createCameraApi();

    const promise = camera.takePicture();

    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
    simulateNativeResponse({
      id: sent.id,
      success: false,
      error: 'Camera unavailable',
    });

    try {
      await promise;
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppoError);
      expect((err as InstanceType<typeof AppoError>).code).toBe(
        AppoErrorCode.NATIVE_ERROR,
      );
    }
  });

  it('takePicture() resolves with CameraResult matching native shape', async () => {
    const { createCameraApi } = await import('../../src/features/camera');
    const camera = createCameraApi();

    const promise = camera.takePicture();

    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
    expect(sent.type).toBe('camera.takePicture');

    const nativeResponse = {
      uri: 'file:///photo.jpg',
      base64: undefined,
      width: 4032,
      height: 3024,
    };
    simulateNativeResponse({ id: sent.id, success: true, data: nativeResponse });

    const result = await promise;
    expect(result).toEqual(nativeResponse);
  });
});

describe('feature integration: location', () => {
  let postMessageSpy: Mock;

  beforeEach(async () => {
    const env = await setupIntegrationEnv();
    postMessageSpy = env.postMessageSpy as Mock;
  });

  afterEach(() => {
    cleanupIntegrationEnv();
  });

  it('requestPermission() sends correct type and resolves with granted', async () => {
    const { createLocationApi } = await import('../../src/features/location');
    const location = createLocationApi();

    const promise = location.requestPermission();

    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
    expect(sent.type).toBe('location.requestPermission');

    simulateNativeResponse({ id: sent.id, success: true, data: 'granted' });
    const result = await promise;
    expect(result).toBe('granted');
  });

  it('getCurrentPosition() rejects with AppoError on native failure', async () => {
    const { createLocationApi } = await import('../../src/features/location');
    const { AppoError, AppoErrorCode } = await import('../../src/types');
    const location = createLocationApi();

    const promise = location.getCurrentPosition();

    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
    simulateNativeResponse({
      id: sent.id,
      success: false,
      error: 'Location permission denied',
    });

    try {
      await promise;
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppoError);
      expect((err as InstanceType<typeof AppoError>).code).toBe(
        AppoErrorCode.NATIVE_ERROR,
      );
    }
  });

  it('getCurrentPosition() resolves with Position matching native shape', async () => {
    const { createLocationApi } = await import('../../src/features/location');
    const location = createLocationApi();

    const promise = location.getCurrentPosition();

    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
    expect(sent.type).toBe('location.getCurrentPosition');

    const nativeResponse = {
      latitude: 40.7128,
      longitude: -74.006,
      altitude: 10.5,
      accuracy: 5.0,
      timestamp: 1707500000000,
    };
    simulateNativeResponse({ id: sent.id, success: true, data: nativeResponse });

    const result = await promise;
    expect(result).toEqual(nativeResponse);
  });
});

describe('feature integration: haptics (fire-and-forget)', () => {
  let postMessageSpy: Mock;

  beforeEach(async () => {
    const env = await setupIntegrationEnv();
    postMessageSpy = env.postMessageSpy as Mock;
  });

  afterEach(() => {
    cleanupIntegrationEnv();
  });

  it('impact() sends correct type and payload via postMessage', async () => {
    const { createHapticsApi } = await import('../../src/features/haptics');
    const haptics = createHapticsApi();

    haptics.impact('medium');

    expect(postMessageSpy).toHaveBeenCalledOnce();
    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
    expect(sent.type).toBe('haptics.impact');
    expect(sent.payload).toEqual({ style: 'medium' });
  });

  it('notification() sends correct type and payload via postMessage', async () => {
    const { createHapticsApi } = await import('../../src/features/haptics');
    const haptics = createHapticsApi();

    haptics.notification('success');

    expect(postMessageSpy).toHaveBeenCalledOnce();
    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
    expect(sent.type).toBe('haptics.notification');
    expect(sent.payload).toEqual({ type: 'success' });
  });
});

describe('feature integration: storage', () => {
  let postMessageSpy: Mock;

  beforeEach(async () => {
    const env = await setupIntegrationEnv();
    postMessageSpy = env.postMessageSpy as Mock;
  });

  afterEach(() => {
    cleanupIntegrationEnv();
  });

  it('get() sends correct type/payload and resolves with stored value', async () => {
    const { createStorageApi } = await import('../../src/features/storage');
    const storage = createStorageApi();

    const promise = storage.get('key');

    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
    expect(sent.type).toBe('storage.get');
    expect(sent.payload).toEqual({ key: 'key' });

    simulateNativeResponse({ id: sent.id, success: true, data: 'stored-value' });
    const result = await promise;
    expect(result).toBe('stored-value');
  });

  it('set() sends correct type/payload and resolves', async () => {
    const { createStorageApi } = await import('../../src/features/storage');
    const storage = createStorageApi();

    const promise = storage.set('key', 'value');

    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
    expect(sent.type).toBe('storage.set');
    expect(sent.payload).toEqual({ key: 'key', value: 'value' });

    simulateNativeResponse({ id: sent.id, success: true, data: undefined });
    await promise;
  });

  it('delete() sends correct type/payload and resolves', async () => {
    const { createStorageApi } = await import('../../src/features/storage');
    const storage = createStorageApi();

    const promise = storage.delete('key');

    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
    expect(sent.type).toBe('storage.delete');
    expect(sent.payload).toEqual({ key: 'key' });

    simulateNativeResponse({ id: sent.id, success: true, data: undefined });
    await promise;
  });

  it('get() resolves with null for missing key', async () => {
    const { createStorageApi } = await import('../../src/features/storage');
    const storage = createStorageApi();

    const promise = storage.get('nonexistent');

    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
    simulateNativeResponse({ id: sent.id, success: true, data: null });

    const result = await promise;
    expect(result).toBeNull();
  });
});

describe('feature integration: share', () => {
  let postMessageSpy: Mock;

  beforeEach(async () => {
    const env = await setupIntegrationEnv();
    postMessageSpy = env.postMessageSpy as Mock;
  });

  afterEach(() => {
    cleanupIntegrationEnv();
  });

  it('open() sends correct type/payload and resolves with ShareResult', async () => {
    const { createShareApi } = await import('../../src/features/share');
    const share = createShareApi();

    const options = { title: 'Share', url: 'https://example.com' };
    const promise = share.open(options);

    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
    expect(sent.type).toBe('share.open');
    expect(sent.payload).toEqual(options);

    const nativeResponse = { success: true, action: 'shared' };
    simulateNativeResponse({ id: sent.id, success: true, data: nativeResponse });

    const result = await promise;
    expect(result).toEqual(nativeResponse);
  });
});

describe('feature integration: network', () => {
  let postMessageSpy: Mock;

  beforeEach(async () => {
    const env = await setupIntegrationEnv();
    postMessageSpy = env.postMessageSpy as Mock;
  });

  afterEach(() => {
    cleanupIntegrationEnv();
  });

  it('getStatus() sends correct type and resolves with NetworkStatus', async () => {
    const { createNetworkApi } = await import('../../src/features/network');
    const network = createNetworkApi();

    const promise = network.getStatus();

    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
    expect(sent.type).toBe('network.getStatus');

    const nativeResponse = { isConnected: true, type: 'wifi' };
    simulateNativeResponse({ id: sent.id, success: true, data: nativeResponse });

    const result = await promise;
    expect(result).toEqual(nativeResponse);
  });
});

describe('feature integration: device', () => {
  let postMessageSpy: Mock;

  beforeEach(async () => {
    const env = await setupIntegrationEnv();
    postMessageSpy = env.postMessageSpy as Mock;
  });

  afterEach(() => {
    cleanupIntegrationEnv();
  });

  it('getInfo() sends correct type and resolves with DeviceInfo shape', async () => {
    const { createDeviceApi } = await import('../../src/features/device');
    const device = createDeviceApi();

    const promise = device.getInfo();

    const sent = JSON.parse(postMessageSpy.mock.calls[0][0]);
    expect(sent.type).toBe('device.getInfo');

    const nativeResponse = {
      platform: 'ios',
      osVersion: '17.2',
      appVersion: '1.0.0',
      deviceId: 'iPhone15,2',
      deviceName: 'iPhone 15 Pro',
      isTablet: false,
    };
    simulateNativeResponse({ id: sent.id, success: true, data: nativeResponse });

    const result = await promise;
    expect(result).toEqual(nativeResponse);
  });
});
