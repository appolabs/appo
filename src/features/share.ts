import type { ShareApi, ShareOptions, ShareResult } from '../types';
import { sendMessage, isNativeEnvironment } from '../bridge';

export function createShareApi(): ShareApi {
  return {
    async open(options: ShareOptions): Promise<ShareResult> {
      if (!isNativeEnvironment()) {
        // Fallback to Web Share API if available
        if (navigator.share) {
          try {
            await navigator.share({
              title: options.title,
              text: options.message,
              url: options.url,
            });
            return { success: true };
          } catch {
            return { success: false };
          }
        }
        return { success: false };
      }
      return sendMessage<ShareResult>('share.open', options);
    },
  };
}
