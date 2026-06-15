// Dependency-free fetch stub for the Appo CLI tests.
//
// Lets `apiFetch` (src/api.mjs) run UNCHANGED against canned responses so every
// verb is verifiable without a live `/api/v1`. The stub captures the exact
// request the CLI issued (method/path/url/body/headers) for contract assertions
// and returns a `fetch`-Response-shaped object apiFetch consumes (status, ok,
// json()). The real ~/.appo/config.json is never touched: setup.mjs points
// APPO_CONFIG_HOME at a per-worker temp dir, so stubToken writes there only.

import { readConfig, writeConfig } from '../../src/config.mjs';

/** Recorded requests, FIFO. Each entry: { method, path, url, body, headers }. */
export const requests = [];

let originalFetch = null;

/** Most recently recorded request, or null if none issued. */
export function lastRequest() {
  return requests.length > 0 ? requests[requests.length - 1] : null;
}

/**
 * Stub globalThis.fetch. `responses` is a single { status, body } or an array
 * consumed FIFO across calls (a verb making N calls gets N canned responses).
 * Each call records the request and returns a Response-like object.
 */
export function installMockFetch(responses) {
  if (originalFetch === null) {
    originalFetch = globalThis.fetch;
  }
  const queue = Array.isArray(responses) ? [...responses] : [responses];

  globalThis.fetch = /** @type {typeof globalThis.fetch} */ (async (url, init = {}) => {
    const method = init.method || 'GET';
    const rawBody = init.body;
    let body = null;
    if (typeof rawBody === 'string') {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = rawBody;
      }
    }
    const path = pathFromUrl(url);
    requests.push({ method, path, url: String(url), body, headers: init.headers || {} });

    const canned = queue.length > 1 ? queue.shift() : queue[0];
    const status = canned?.status ?? 200;
    return {
      status,
      ok: status >= 200 && status < 300,
      async json() {
        return canned?.body ?? null;
      },
    };
  });
}

/** Path portion of a URL string (so tests assert on /api/v1/... not the base). */
function pathFromUrl(url) {
  const s = String(url);
  const schemeIdx = s.indexOf('://');
  if (schemeIdx === -1) return s;
  const afterScheme = s.slice(schemeIdx + 3);
  const slashIdx = afterScheme.indexOf('/');
  return slashIdx === -1 ? '/' : afterScheme.slice(slashIdx);
}

/**
 * Write a test token + api_base so apiFetch passes its `if (!token)` guard.
 * Writes into the per-worker temp config (APPO_CONFIG_HOME, set by setup.mjs),
 * never the real ~/.appo/config.json. Never writes a real credential (T-01-02).
 */
export function stubToken(token = 'test-pat') {
  writeConfig({ ...readConfig(), token, api_base: 'http://test.local' });
}

/** Restore globalThis.fetch and clear recorded requests. */
export function resetMockFetch() {
  if (originalFetch !== null) {
    globalThis.fetch = originalFetch;
    originalFetch = null;
  }
  requests.length = 0;
}
