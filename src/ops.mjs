// Thin async transport layer over apiFetch — one function per lifecycle v1 call.
// Single definition of each request, consumed by the Phase 1 verbs (src/cli.mjs)
// and the `ship` orchestrator (Plan 02). No console, no exit codes, no arg
// parsing: ops only wrap apiFetch and let its throw (err.status/err.envelope on
// non-2xx) propagate to the caller.
//
// Every op takes a trailing `env` (active profile name) forwarded to apiFetch as
// its 5th argument so the request uses the SELECTED profile's token (WR-01). The
// caller resolves env once via activeProfileName(flags.env) and threads it here.
import { apiFetch } from './api.mjs';

/** Unwrap a v1 `{ data: ... }` envelope to its payload; pass through anything else. */
export function unwrap(payload) {
  return payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
}

// POST /api/v1/apps -> 201 { data: AppResource }
export async function createApp(apiBase, { name, base_url, metadata_name, metadata_description }, env) {
  const body = { name, base_url };
  if (metadata_name) body.metadata_name = metadata_name;
  if (metadata_description) body.metadata_description = metadata_description;
  return unwrap(await apiFetch(apiBase, 'POST', '/api/v1/apps', body, env));
}

// POST /api/v1/apps/{id}/builds -> 202 { data: AppBuildResource }
/**
 * @param {string} apiBase
 * @param {string} id
 * @param {{ platform?: string, branch?: string }} [opts]
 * @param {string} [env]
 */
export async function triggerBuild(apiBase, id, { platform, branch } = {}, env) {
  const body = {};
  if (platform) body.platform = platform;   // ios|android|all (server-validated)
  if (branch) body.branch = branch;          // /^[A-Za-z0-9._\/-]+$/ (server-validated)
  return unwrap(await apiFetch(apiBase, 'POST', `/api/v1/apps/${id}/builds`, body, env));
}

// GET /api/v1/apps/{id} -> 200 { data: AppResource }
export async function getApp(apiBase, id, env) {
  return unwrap(await apiFetch(apiBase, 'GET', `/api/v1/apps/${id}`, null, env));
}

// GET /api/v1/apps/{id}/builds/{buildId} -> 200 { data: AppBuildResource }
export async function getBuild(apiBase, id, buildId, env) {
  return unwrap(await apiFetch(apiBase, 'GET', `/api/v1/apps/${id}/builds/${buildId}`, null, env));
}

// POST /api/v1/apps/{id}/publish -> 204 (apiFetch returns null). Resolving == success. Do NOT unwrap.
export async function publishApp(apiBase, id, app_stores, env) {
  return apiFetch(apiBase, 'POST', `/api/v1/apps/${id}/publish`, { app_stores }, env);
}

// GET /api/v1/apps/{id}/preview -> 200 { ios_testflight_url, android_deeplink, preview_url, preview_ready }
// Flat object (no {data:} envelope) — unwrap is a harmless no-op here.
export async function getPreview(apiBase, id, env) {
  return unwrap(await apiFetch(apiBase, 'GET', `/api/v1/apps/${id}/preview`, null, env));
}
