import type { CameraApi, CameraResult, PermissionStatus } from '../types';
import { sendMessage, isNativeEnvironment } from '../bridge';

/**
 * Creates the camera API.
 * Returns browser fallbacks when not in a native environment.
 */
export function createCameraApi(): CameraApi {
  return {
    /**
     * Requests camera permission from the native layer.
     * @returns The granted/denied/undetermined permission status. Returns `'denied'` in browser.
     */
    async requestPermission(): Promise<PermissionStatus> {
      if (!isNativeEnvironment()) {
        return 'denied';
      }
      return sendMessage<PermissionStatus>('camera.requestPermission');
    },

    /**
     * Opens the native camera to capture a photo.
     * @returns The captured image data including URI, dimensions, and optional base64.
     * @throws {Error} When called outside a native environment.
     */
    async takePicture(): Promise<CameraResult> {
      if (!isNativeEnvironment()) {
        throw new Error('Camera not available outside native environment');
      }
      return sendMessage<CameraResult>('camera.takePicture');
    },
  };
}
