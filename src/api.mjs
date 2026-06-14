import { storedToken } from './config.mjs';

/**
 * Authenticated call to the Appo v1 API. Returns parsed JSON (or null for 204).
 * Throws an Error carrying the v1 error envelope on non-2xx.
 */
export async function apiFetch(apiBase, method, path, body) {
  const token = storedToken();
  if (!token) {
    throw new Error('Not authenticated. Run `appo login` first.');
  }

  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) {
    return null;
  }

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const msg =
      payload?.message ||
      payload?.error ||
      (res.status === 401 ? 'Token rejected — run `appo login` again.' : `Request failed (${res.status}).`);
    const err = new Error(msg);
    err.status = res.status;
    err.envelope = payload;
    throw err;
  }

  return payload;
}
