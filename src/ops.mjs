// Thin async transport layer over apiFetch — one function per lifecycle v1 call.
// Single definition of each request, consumed by the Phase 1 verbs (src/cli.mjs)
// and the `ship` orchestrator (Plan 02). No console, no exit codes, no arg
// parsing: ops only wrap apiFetch and let its throw (err.status/err.envelope on
// non-2xx) propagate to the caller.
import { apiFetch } from './api.mjs';

/** Unwrap a v1 `{ data: ... }` envelope to its payload; pass through anything else. */
export function unwrap(payload) {
  return payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
}

// POST /api/v1/apps -> 201 { data: AppResource }
export async function createApp(apiBase, { name, base_url, metadata_name, metadata_description }) {
  const body = { name, base_url };
  if (metadata_name) body.metadata_name = metadata_name;
  if (metadata_description) body.metadata_description = metadata_description;
  return unwrap(await apiFetch(apiBase, 'POST', '/api/v1/apps', body));
}

// POST /api/v1/apps/{id}/builds -> 202 { data: AppBuildResource }
export async function triggerBuild(apiBase, id, { platform, branch } = {}) {
  const body = {};
  if (platform) body.platform = platform;   // ios|android|all (server-validated)
  if (branch) body.branch = branch;          // /^[A-Za-z0-9._\/-]+$/ (server-validated)
  return unwrap(await apiFetch(apiBase, 'POST', `/api/v1/apps/${id}/builds`, body));
}

// GET /api/v1/apps/{id} -> 200 { data: AppResource }
export async function getApp(apiBase, id) {
  return unwrap(await apiFetch(apiBase, 'GET', `/api/v1/apps/${id}`));
}

// GET /api/v1/apps/{id}/builds/{buildId} -> 200 { data: AppBuildResource }
export async function getBuild(apiBase, id, buildId) {
  return unwrap(await apiFetch(apiBase, 'GET', `/api/v1/apps/${id}/builds/${buildId}`));
}

// POST /api/v1/apps/{id}/publish -> 204 (apiFetch returns null). Resolving == success. Do NOT unwrap.
export async function publishApp(apiBase, id, app_stores) {
  return apiFetch(apiBase, 'POST', `/api/v1/apps/${id}/publish`, { app_stores });
}
