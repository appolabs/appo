import type { ShareApi, ShareOptions, ShareResult } from '../types';
import { sendMessage, isNativeEnvironment } from '../bridge';

/**
 * Creates the native share sheet API.
 * Falls back to `navigator.share` (Web Share API) when not in a native environment.
 */
export function createShareApi(): ShareApi {
  return {
    /**
     * Opens the native share sheet with the specified content.
     * In browser, delegates to `navigator.share` if available; otherwise returns `{ success: false }`.
     * @param options - The content to share (title, message, and/or URL).
     * @returns The share result indicating success or failure.
     */
    async open(options: ShareOptions): Promise<ShareResult> {
      if (!isNativeEnvironment()) {
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
