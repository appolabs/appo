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
export async function createApp(apiBase, { name, base_url, prep_mode }, env) {
  const body = { name, base_url };
  if (prep_mode) body.prep_mode = prep_mode;
  return unwrap(await apiFetch(apiBase, 'POST', '/api/v1/apps', body, env));
}

// GET /api/v1/apps/{id} -> 200 { data: AppResource }
export async function getApp(apiBase, id, env) {
  return unwrap(await apiFetch(apiBase, 'GET', `/api/v1/apps/${id}`, null, env));
}

// GET /api/v1/apps -> 200 { data: AppResource[] }
export async function listApps(apiBase, env) {
  return unwrap(await apiFetch(apiBase, 'GET', '/api/v1/apps', null, env)) || [];
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

// POST /api/v1/apps/{id}/icon -> 200 { icon_url } (flat, NOT a {data:} envelope).
// 422 { message, errors: { icon_url: [...] } } on SSRF/validation reject (apiFetch throws).
// Do NOT unwrap — the body is flat. Read res.icon_url at the call site.
export async function setIcon(apiBase, id, icon_url, env) {
  return apiFetch(apiBase, 'POST', `/api/v1/apps/${id}/icon`, { icon_url }, env);
}

// PATCH /api/v1/apps/{id}/permissions -> 200 { permissions } (flat, NOT a {data:} envelope).
// Partial merge: only the supplied keys change; every other toggle and all messages
// are preserved server-side. `permissions` is a subset of
// { tracking, camera, microphone, nfc } to booleans. An unknown key -> 422 (apiFetch throws).
// Do NOT unwrap — the body is flat. Read res.permissions at the call site.
export async function setPermissions(apiBase, id, permissions, env) {
  return apiFetch(apiBase, 'PATCH', `/api/v1/apps/${id}/permissions`, permissions, env);
}
