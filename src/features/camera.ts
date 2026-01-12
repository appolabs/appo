import type { CameraApi, CameraResult, PermissionStatus } from '../types';
import { sendMessage, isNativeEnvironment } from '../bridge';

export function createCameraApi(): CameraApi {
  return {
    async requestPermission(): Promise<PermissionStatus> {
      if (!isNativeEnvironment()) {
        return 'denied';
      }
      return sendMessage<PermissionStatus>('camera.requestPermission');
    },

    async takePicture(): Promise<CameraResult> {
      if (!isNativeEnvironment()) {
        throw new Error('Camera not available outside native environment');
      }
      return sendMessage<CameraResult>('camera.takePicture');
    },
  };
}
