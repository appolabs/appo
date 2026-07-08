/** Type stubs for the exported library surface (`@appolabs/appo/api`).
 *  Hand-maintained: keep in sync with api.mjs exports. */

/**
 * Authenticated call to the Appo v1 API. Returns parsed JSON (or null for 204).
 * Throws an Error carrying the v1 error envelope (`err.status`, `err.envelope`)
 * on non-2xx. Token resolution: APPO_TOKEN env > the profile's stored token.
 */
export function apiFetch(
  apiBase: string,
  method: string,
  path: string,
  body?: unknown,
  env?: string,
): Promise<any>;

/** Like apiFetch but authenticates with an explicit PAT instead of the stored token. */
export function apiFetchWithToken(
  apiBase: string,
  method: string,
  path: string,
  body: unknown,
  pat: string,
  env?: string,
): Promise<any>;
