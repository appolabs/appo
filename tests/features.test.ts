import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/bridge', () => ({
  sendMessage: vi.fn(),
  postMessage: vi.fn(),
  addEventListener: vi.fn(() => vi.fn()),
  isNativeEnvironment: vi.fn(() => true),
  initializeBridge: vi.fn(),
  handleNativeMessage: vi.fn(),
  setLogger: vi.fn(),
}));

import {
  sendMessage,
  postMessage,
  addEventListener,
  isNativeEnvironment,
} from '../src/bridge';
import { createPushApi } from '../src/features/push';
import { createBiometricsApi } from '../src/features/biometrics';
import { createCameraApi } from '../src/features/camera';
import { createLocationApi } from '../src/features/location';
import { createHapticsApi } from '../src/features/haptics';
import { createStorageApi } from '../src/features/storage';
import { createShareApi } from '../src/features/share';
import { createNetworkApi } from '../src/features/network';
import { createDeviceApi } from '../src/features/device';
import { isBridgeResponse, isBridgeEvent } from '../src/types';

const mockSendMessage = vi.mocked(sendMessage);
const mockPostMessage = vi.mocked(postMessage);
const mockAddEventListener = vi.mocked(addEventListener);
const mockIsNative = vi.mocked(isNativeEnvironment);

beforeEach(() => {
  vi.clearAllMocks();
  mockIsNative.mockReturnValue(true);
});

describe('Feature native paths', () => {
  describe('Push API', () => {
    it('requestPermission sends push.requestPermission message', async () => {
      mockSendMessage.mockResolvedValue('granted');
      const push = createPushApi();
      const result = await push.requestPermission();
      expect(mockSendMessage).toHaveBeenCalledWith('push.requestPermission');
      expect(result).toBe('granted');
    });

    it('getToken sends push.getToken message', async () => {
      mockSendMessage.mockResolvedValue('token-abc-123');
      const push = createPushApi();
      const result = await push.getToken();
      expect(mockSendMessage).toHaveBeenCalledWith('push.getToken');
      expect(result).toBe('token-abc-123');
    });

    it('onMessage subscribes to push.message events', () => {
      const mockUnsub = vi.fn();
      mockAddEventListener.mockReturnValue(mockUnsub);
      const push = createPushApi();
      const callback = vi.fn();
      const unsub = push.onMessage(callback);
      expect(mockAddEventListener).toHaveBeenCalledWith(
        'push.message',
        expect.any(Function),
      );
      expect(unsub).toBe(mockUnsub);
    });
  });

  describe('Biometrics API', () => {
    it('isAvailable sends biometrics.isAvailable message', async () => {
      mockSendMessage.mockResolvedValue(true);
      const bio = createBiometricsApi();
      const result = await bio.isAvailable();
      expect(mockSendMessage).toHaveBeenCalledWith('biometrics.isAvailable');
      expect(result).toBe(true);
    });

    it('authenticate sends biometrics.authenticate with reason payload', async () => {
      mockSendMessage.mockResolvedValue(true);
      const bio = createBiometricsApi();
      const result = await bio.authenticate('Confirm identity');
      expect(mockSendMessage).toHaveBeenCalledWith('biometrics.authenticate', {
        reason: 'Confirm identity',
      });
      expect(result).toBe(true);
    });
  });

  describe('Camera API', () => {
    it('requestPermission sends camera.requestPermission message', async () => {
      mockSendMessage.mockResolvedValue('granted');
      const camera = createCameraApi();
      const result = await camera.requestPermission();
      expect(mockSendMessage).toHaveBeenCalledWith('camera.requestPermission');
      expect(result).toBe('granted');
    });

    it('takePicture sends camera.takePicture message', async () => {
      const photo = { uri: 'file://photo.jpg', width: 1920, height: 1080 };
      mockSendMessage.mockResolvedValue(photo);
      const camera = createCameraApi();
      const result = await camera.takePicture();
      expect(mockSendMessage).toHaveBeenCalledWith('camera.takePicture');
      expect(result).toEqual(photo);
    });
  });

  describe('Location API', () => {
    it('requestPermission sends location.requestPermission message', async () => {
      mockSendMessage.mockResolvedValue('granted');
      const location = createLocationApi();
      const result = await location.requestPermission();
      expect(mockSendMessage).toHaveBeenCalledWith(
        'location.requestPermission',
      );
      expect(result).toBe('granted');
    });

    it('getCurrentPosition sends location.getCurrentPosition message', async () => {
      const pos = { latitude: 40.7, longitude: -74.0, timestamp: 1000 };
      mockSendMessage.mockResolvedValue(pos);
      const location = createLocationApi();
      const result = await location.getCurrentPosition();
      expect(mockSendMessage).toHaveBeenCalledWith(
        'location.getCurrentPosition',
      );
      expect(result).toEqual(pos);
    });
  });

  describe('Haptics API', () => {
    it('impact sends haptics.impact with style payload', () => {
      const haptics = createHapticsApi();
      haptics.impact('medium');
      expect(mockPostMessage).toHaveBeenCalledWith('haptics.impact', {
        style: 'medium',
      });
    });

    it('notification sends haptics.notification with type payload', () => {
      const haptics = createHapticsApi();
      haptics.notification('success');
      expect(mockPostMessage).toHaveBeenCalledWith('haptics.notification', {
        type: 'success',
      });
    });
  });

  describe('Storage API', () => {
    it('get sends storage.get with key payload', async () => {
      mockSendMessage.mockResolvedValue('stored-value');
      const storage = createStorageApi();
      const result = await storage.get('my-key');
      expect(mockSendMessage).toHaveBeenCalledWith('storage.get', {
        key: 'my-key',
      });
      expect(result).toBe('stored-value');
    });

    it('set sends storage.set with key and value payload', async () => {
      mockSendMessage.mockResolvedValue(undefined);
      const storage = createStorageApi();
      await storage.set('my-key', 'my-value');
      expect(mockSendMessage).toHaveBeenCalledWith('storage.set', {
        key: 'my-key',
        value: 'my-value',
      });
    });

    it('delete sends storage.delete with key payload', async () => {
      mockSendMessage.mockResolvedValue(undefined);
      const storage = createStorageApi();
      await storage.delete('my-key');
      expect(mockSendMessage).toHaveBeenCalledWith('storage.delete', {
        key: 'my-key',
      });
    });
  });

  describe('Share API', () => {
    it('open sends share.open with options payload', async () => {
      const shareResult = { success: true, action: 'shared' };
      mockSendMessage.mockResolvedValue(shareResult);
      const share = createShareApi();
      const options = { title: 'Check this', url: 'https://example.com' };
      const result = await share.open(options);
      expect(mockSendMessage).toHaveBeenCalledWith('share.open', options);
      expect(result).toEqual(shareResult);
    });
  });

  describe('Network API', () => {
    it('getStatus sends network.getStatus message', async () => {
      const status = { isConnected: true, type: 'wifi' };
      mockSendMessage.mockResolvedValue(status);
      const network = createNetworkApi();
      const result = await network.getStatus();
      expect(mockSendMessage).toHaveBeenCalledWith('network.getStatus');
      expect(result).toEqual(status);
    });

    it('onChange subscribes to network.change events', () => {
      const mockUnsub = vi.fn();
      mockAddEventListener.mockReturnValue(mockUnsub);
      const network = createNetworkApi();
      const callback = vi.fn();
      const unsub = network.onChange(callback);
      expect(mockAddEventListener).toHaveBeenCalledWith(
        'network.change',
        expect.any(Function),
      );
      expect(unsub).toBe(mockUnsub);
    });
  });

  describe('Device API', () => {
    it('getInfo sends device.getInfo message', async () => {
      const info = {
        platform: 'ios',
        osVersion: '17.0',
        appVersion: '1.0.0',
        deviceId: 'abc',
        deviceName: 'iPhone',
        isTablet: false,
      };
      mockSendMessage.mockResolvedValue(info);
      const device = createDeviceApi();
      const result = await device.getInfo();
      expect(mockSendMessage).toHaveBeenCalledWith('device.getInfo');
      expect(result).toEqual(info);
    });
  });
});

describe('Type guards', () => {
  it('isBridgeResponse returns true for valid response', () => {
    expect(isBridgeResponse({ id: 'msg_1', success: true })).toBe(true);
  });

  it('isBridgeResponse returns false for invalid data', () => {
    expect(isBridgeResponse({ random: 'data' })).toBe(false);
  });

  it('isBridgeEvent returns true for valid event', () => {
    expect(isBridgeEvent({ event: 'push.message', data: {} })).toBe(true);
  });

  it('isBridgeEvent returns false for response object', () => {
    expect(isBridgeEvent({ id: 'msg_1', success: true })).toBe(false);
  });
});
