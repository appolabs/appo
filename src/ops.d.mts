/** Type stubs for the exported library surface (`@appolabs/appo/ops`).
 *  Hand-maintained: keep in sync with ops.mjs exports. */

/** Unwrap a v1 `{ data: ... }` envelope to its payload; pass through anything else. */
export function unwrap(payload: unknown): any;

export function createApp(
  apiBase: string,
  input: { name: string; base_url: string },
  env?: string,
): Promise<any>;

export function getApp(apiBase: string, id: string | number, env?: string): Promise<any>;

export function listApps(apiBase: string, env?: string): Promise<any[]>;

export function getBuild(
  apiBase: string,
  id: string | number,
  buildId: string | number,
  env?: string,
): Promise<any>;

/** Resolves on success (204 -> null). */
export function publishApp(
  apiBase: string,
  id: string | number,
  app_stores: string[],
  env?: string,
): Promise<null>;

/** Flat payload: { ios_testflight_url, android_deeplink, preview_url, preview_ready }. */
export function getPreview(apiBase: string, id: string | number, env?: string): Promise<any>;

/** Flat payload: { icon_url }. */
export function setIcon(
  apiBase: string,
  id: string | number,
  icon_url: string,
  env?: string,
): Promise<any>;
