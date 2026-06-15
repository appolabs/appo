// REQUIRES `--test-concurrency=1` (pinned in package.json's `test` script).
// This suite mutates shared process-global state — process.env.APPO_CONFIG_HOME
// in beforeEach/afterEach and globalThis.fetch via the mock — with isolation
// provided only by serial ordering. Running `node --test` directly (no
// concurrency flag) interleaves tests and corrupts the shared env/fetch. Always
// run via `npm test`.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  installMockFetch,
  resetMockFetch,
  lastRequest,
  requests,
} from './helpers/mockFetch.mjs';
import { apiFetch } from '../src/api.mjs';
import { loginWithToken } from '../src/login.mjs';
import { storedToken, readConfig, writeProfile, configPath } from '../src/config.mjs';

// Capture both console.log and console.error around an async call so token-leak
// assertions can inspect everything the unit might have emitted.
async function captureAll(fn) {
  const log = console.log;
  const err = console.error;
  const lines = [];
  console.log = (...args) => lines.push(args.join(' '));
  console.error = (...args) => lines.push(args.join(' '));
  try {
    const result = await fn();
    return { result, lines };
  } finally {
    console.log = log;
    console.error = err;
  }
}

let tmpDir;

// Lazy config path: config.mjs resolves configPath() per call, so setting
// APPO_CONFIG_HOME here in beforeEach is honored on the next read/write despite
// ESM import hoisting. Each test gets a fresh isolated config dir.
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'appo-auth-'));
  process.env.APPO_CONFIG_HOME = tmpDir;
});

afterEach(() => {
  resetMockFetch();
  const dir = tmpDir;
  delete process.env.APPO_TOKEN;
  delete process.env.APPO_ENV;
  delete process.env.APPO_API_BASE;
  delete process.env.APPO_CONFIG_HOME;
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- env-named 401 (D-09, T-03-06) ----------------------------------------

test('apiFetch 401 names the active env and never leaks the token', async () => {
  writeProfile('production', { api_base: 'http://test.local', token: 'test-pat' });
  installMockFetch({ status: 401, body: { error: 'unauthorized', code: 'unauthenticated' } });

  await assert.rejects(
    () => apiFetch('http://test.local', 'GET', '/api/v1/apps', null, 'production'),
    (err) => {
      assert.equal(err.status, 401);
      assert.match(err.message, /env 'production'.*appo login/);
      assert.doesNotMatch(err.message, /test-pat/);
      return true;
    },
  );
});

// --- APPO_TOKEN on the wire (D-06/D-08, T-03-07) ---------------------------

test('apiFetch sends APPO_TOKEN as Bearer, env wins over disk', async () => {
  writeProfile('default', { api_base: 'http://test.local', token: 'disk-tok' });
  process.env.APPO_TOKEN = 'env-tok';
  installMockFetch({ status: 200, body: { data: [] } });

  await apiFetch('http://test.local', 'GET', '/api/v1/apps', null, 'default');

  assert.equal(lastRequest().headers.Authorization, 'Bearer env-tok');
});

test('APPO_TOKEN is never persisted to the on-disk config', async () => {
  writeProfile('default', { api_base: 'http://test.local', token: 'disk-tok' });
  process.env.APPO_TOKEN = 'env-tok';
  installMockFetch({ status: 200, body: { data: [] } });

  await apiFetch('http://test.local', 'GET', '/api/v1/apps', null, 'default');

  const file = configPath().file;
  const bytes = existsSync(file) ? readFileSync(file, 'utf-8') : '';
  assert.doesNotMatch(bytes, /env-tok/);
});

// --- loginWithToken 200-store (D-07, T-03-08) ------------------------------

test('loginWithToken validates the pasted PAT then stores it on 200', async () => {
  installMockFetch({ status: 200, body: { data: [] } });

  await loginWithToken('http://test.local', 'staging', 'good-pat');

  assert.equal(requests.length, 1);
  const req = lastRequest();
  assert.equal(req.method, 'GET');
  assert.match(req.path, /\/api\/v1\/apps$/);
  assert.equal(req.headers.Authorization, 'Bearer good-pat');

  assert.equal(storedToken('staging'), 'good-pat');
  assert.equal(readConfig().profiles.staging.api_base, 'http://test.local');
});

// --- loginWithToken 401-refuse (D-07, T-03-08/T-03-09) ---------------------

test('loginWithToken refuses on 401: stores nothing, no second call, no PAT echo', async () => {
  installMockFetch({ status: 401, body: { error: 'unauthorized' } });

  const before = storedToken('staging');
  const { lines } = await captureAll(async () => {
    await assert.rejects(() => loginWithToken('http://test.local', 'staging', 'bad-pat'));
  });

  assert.equal(storedToken('staging'), before);
  assert.equal(requests.length, 1); // only the validation probe, no write-call
  assert.doesNotMatch(lines.join('\n'), /bad-pat/);
});

// --- no-clobber on store (T-03-10) ----------------------------------------

test('loginWithToken leaves sibling profiles untouched', async () => {
  writeProfile('production', { api_base: 'http://prod.local', token: 'prod-tok' });
  installMockFetch({ status: 200, body: { data: [] } });

  await loginWithToken('http://test.local', 'staging', 'good-pat');

  const prod = readConfig().profiles.production;
  assert.equal(prod.api_base, 'http://prod.local');
  assert.equal(prod.token, 'prod-tok');
});
