// Artifact download for self-serve test builds.
//
// GET /api/v1/apps/{id}/builds/{buildId}/download responds 302 -> artifact URL
// when the build is ready. fetch follows the redirect (undici strips the
// Authorization header on the cross-origin hop) and the final response body is
// the installable binary — so this cannot go through apiFetch, whose contract
// is JSON-only. Error semantics mirror api.mjs: non-2xx throws an Error
// carrying status + the v1 envelope (409 not-ready, 403 capability_denied,
// 404 not_found).
import { storedToken } from './config.mjs';
import { writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

/**
 * Download a build artifact to disk. Returns { file, bytes }.
 * `output` overrides the filename; otherwise it derives from the final
 * (post-redirect) URL path, falling back to app-{id}-build-{buildId}.bin.
 */
export async function downloadArtifact(apiBase, appId, buildId, env, output) {
  const token = storedToken(env);
  if (!token) {
    throw new Error('Not authenticated. Run `appo login` first.');
  }

  const res = await fetch(`${apiBase}/api/v1/apps/${appId}/builds/${buildId}/download`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    redirect: 'follow',
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
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

  const buffer = Buffer.from(await res.arrayBuffer());
  const file = output || artifactFilename(res.url, appId, buildId);
  await writeFile(file, buffer);
  return { file, bytes: buffer.length };
}

/** Filename from the final artifact URL path; extension-less or unparsable
 *  URLs fall back to a deterministic name. basename() strips any path
 *  segments, so a hostile redirect target cannot steer the write location.
 *  Exported for unit tests only — the CLI goes through downloadArtifact. */
export function artifactFilename(finalUrl, appId, buildId) {
  try {
    const name = decodeURIComponent(basename(new URL(finalUrl).pathname));
    if (name && extname(name)) {
      return basename(name);
    }
  } catch {
    // fall through to the deterministic fallback
  }
  return `app-${appId}-build-${buildId}.bin`;
}
