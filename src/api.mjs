import { storedToken } from './config.mjs';

/**
 * Authenticated call to the Appo v1 API. Returns parsed JSON (or null for 204).
 * Throws an Error carrying the v1 error envelope on non-2xx.
 *
 * The token is sourced for the resolved active environment via storedToken(env)
 * (APPO_TOKEN env > that profile's stored token). When `env` is undefined the
 * stored-token resolver falls back to the active profile.
 */
export async function apiFetch(apiBase, method, path, body, env) {
  const token = storedToken(env);
  if (!token) {
    throw new Error('Not authenticated. Run `appo login` first.');
  }
  return requestWithToken(apiBase, method, path, body, token, env);
}

/**
 * Like apiFetch but authenticates with an explicit `pat` instead of the stored
 * token. Used to validate a pasted PAT (`login --token`) before persisting it.
 * The 401 message names the env, never the token (D-13).
 */
export async function apiFetchWithToken(apiBase, method, path, body, pat, env) {
  return requestWithToken(apiBase, method, path, body, pat, env);
}

async function requestWithToken(apiBase, method, path, body, token, env) {
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
    // A 401 always surfaces the env-named re-login path (D-09); the envelope's
    // generic "unauthorized" text is never substituted and a token is never
    // interpolated (D-13). Other statuses prefer the server's message.
    const msg =
      res.status === 401
        ? `Token for env '${env ?? 'default'}' was rejected — run \`appo login\`.`
        : payload?.message || payload?.error || `Request failed (${res.status}).`;
    /** @type {Error & { status?: number, envelope?: unknown }} */
    const err = new Error(msg);
    err.status = res.status;
    err.envelope = payload;
    throw err;
  }

  return payload;
}
