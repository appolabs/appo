import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/cli.mjs';
import {
  installMockFetch,
  resetMockFetch,
  lastRequest,
  requests,
} from './helpers/mockFetch.mjs';
import {
  storedToken,
  readConfig,
  writeProfile,
  writeConfig,
} from '../src/config.mjs';

// Capture both console.log and console.error around an async call so the logout
// warning (emitted via console.error) and the PAT-leak sweep can inspect
// everything the verb might have emitted. The copied harness intercepts ONLY
// console.log + console.error (NOT console.warn) — the cli warning path uses
// console.error to be captured here.
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

// Run with console.error muted (usage-guard branches write to stderr).
async function silentRun(argv) {
  const original = console.error;
  console.error = () => {};
  try {
    return await run(argv);
  } finally {
    console.error = original;
  }
}

let tmpDir;

// Lazy config path: config.mjs resolves configPath() per call, so setting
// APPO_CONFIG_HOME here in beforeEach is honored on the next read/write despite
// ESM import hoisting. Each test gets a fresh isolated config dir — the real
// ~/.appo/config.json is never touched.
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'appo-cli-'));
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

const API = ['--api', 'http://test.local'];

// --- logout: revoke + always-clear (D-10/D-11) ----------------------------

test('logout 204 issues DELETE /user/tokens/current and clears the local token', async () => {
  writeProfile('default', { api_base: 'http://test.local', token: 'disk-tok' });
  installMockFetch({ status: 204, body: null });

  const { result, lines } = await captureAll(() => run(['logout', ...API]));

  assert.equal(result, 0);
  assert.equal(lastRequest().method, 'DELETE');
  assert.match(lastRequest().path, /\/api\/v1\/user\/tokens\/current$/);
  assert.equal(storedToken('default'), null);
  assert.match(lines.join('\n'), /default/);
});

test('logout 401 (already invalid) still clears the local token + warns, exit 0', async () => {
  writeProfile('default', { api_base: 'http://test.local', token: 'disk-tok' });
  installMockFetch({ status: 401, body: { error: 'unauthorized' } });

  const { result, lines } = await captureAll(() => run(['logout', ...API]));

  assert.equal(result, 0);
  assert.equal(storedToken('default'), null); // cleared anyway (finally)
  const out = lines.join('\n');
  assert.match(out, /Could not confirm/i);
  assert.doesNotMatch(out, /disk-tok/);
});

test('logout network error still clears the local token + warns, exit 0', async () => {
  writeProfile('default', { api_base: 'http://test.local', token: 'disk-tok' });
  // One-off throwing fetch; resetMockFetch/afterEach restores globalThis.fetch.
  installMockFetch({ status: 204, body: null });
  globalThis.fetch = async () => {
    throw new Error('network');
  };

  const { result, lines } = await captureAll(() => run(['logout', ...API]));

  assert.equal(result, 0);
  assert.equal(storedToken('default'), null);
  const out = lines.join('\n');
  assert.match(out, /Could not confirm/i);
  assert.doesNotMatch(out, /disk-tok/);
});

test('logout --env staging clears only staging, siblings untouched (per-env)', async () => {
  writeProfile('default', { api_base: 'http://test.local', token: 'default-tok' });
  writeProfile('staging', { api_base: 'http://test.local', token: 'stg-tok' });
  installMockFetch({ status: 204, body: null });

  const result = await run(['logout', '--env', 'staging', ...API]);

  assert.equal(result, 0);
  assert.equal(storedToken('staging'), null);
  assert.equal(storedToken('default'), 'default-tok'); // sibling untouched
});

// --- whoami: env + api_base + liveness (D-12) ------------------------------

test('whoami 200 reports env + api_base + app count, never the token', async () => {
  writeProfile('default', { api_base: 'http://test.local', token: 'disk-tok' });
  installMockFetch({ status: 200, body: { data: [{ id: 1 }, { id: 2 }] } });

  const { result, lines } = await captureAll(() => run(['whoami', ...API]));

  assert.equal(result, 0);
  const out = lines.join('\n');
  assert.match(out, /default/);
  assert.match(out, /test\.local/);
  assert.match(out, /2 app\(s\)/);
  assert.doesNotMatch(out, /disk-tok/);
});

test('whoami 401 names the env + appo login, exit 1, no token printed', async () => {
  writeProfile('default', { api_base: 'http://test.local', token: 'disk-tok' });
  installMockFetch({ status: 401, body: { error: 'unauthorized' } });

  const { result, lines } = await captureAll(() => run(['whoami', ...API]));

  assert.equal(result, 1);
  const out = lines.join('\n');
  assert.match(out, /default/);
  assert.match(out, /appo login/);
  assert.doesNotMatch(out, /disk-tok/);
});

test('whoami with no token returns 1 and makes no network call', async () => {
  writeConfig({ current: 'default', profiles: {} });
  installMockFetch({ status: 200, body: { data: [] } });

  const { result, lines } = await captureAll(() => run(['whoami', ...API]));

  assert.equal(result, 1);
  assert.equal(requests.length, 0);
  assert.match(lines.join('\n'), /appo login/);
});

// --- env list / env use (D-04/D-13) ---------------------------------------

test('env list marks the active profile and prints no token', async () => {
  writeProfile('production', { api_base: 'http://prod.local', token: 'prod-tok' });
  writeProfile('staging', { api_base: 'http://stg.local', token: 'stg-tok' });
  writeConfig({ ...readConfig(), current: 'staging' });

  const { result, lines } = await captureAll(() => run(['env', 'list']));

  assert.equal(result, 0);
  const out = lines.join('\n');
  assert.match(out, /production/);
  assert.match(out, /staging/);
  assert.match(out, /\*\s+staging/); // active marked
  assert.doesNotMatch(out, /prod-tok/);
  assert.doesNotMatch(out, /stg-tok/);
});

test('env use <name> sets current; unknown -> 2; missing -> 2', async () => {
  writeProfile('staging', { api_base: 'http://stg.local', token: 'stg-tok' });

  const ok = await run(['env', 'use', 'staging']);
  assert.equal(ok, 0);
  assert.equal(readConfig().current, 'staging');

  const unknown = await silentRun(['env', 'use', 'nope']);
  assert.equal(unknown, 2);

  const missing = await silentRun(['env', 'use']);
  assert.equal(missing, 2);
});

// --- --env override (Pitfall 7) -------------------------------------------

test('--env staging overrides current for both token and api_base', async () => {
  writeProfile('production', { api_base: 'http://prod.local', token: 'prod-tok' });
  writeProfile('staging', { api_base: 'http://stg.local', token: 'stg-tok' });
  writeConfig({ ...readConfig(), current: 'production' });
  installMockFetch({ status: 200, body: { data: [] } });

  // No --api so the staging profile's api_base is used.
  await silentRun(['whoami', '--env', 'staging']);

  const req = lastRequest();
  assert.equal(req.headers.Authorization, 'Bearer stg-tok');
  assert.match(req.url, /stg\.local/);
  assert.doesNotMatch(req.url, /prod\.local/);
});

// WR-01: ops-routed verbs (apps create / build / ship) must also honor --env.
// The ops.* wrappers previously called apiFetch WITHOUT env, so storedToken()
// re-resolved to `current` — sending the WRONG profile's token to the --env host.
test('--env staging is honored by an ops-routed verb (apps create) — WR-01', async () => {
  writeProfile('production', { api_base: 'http://prod.local', token: 'prod-tok' });
  writeProfile('staging', { api_base: 'http://stg.local', token: 'stg-tok' });
  writeConfig({ ...readConfig(), current: 'production' });
  installMockFetch({ status: 201, body: { data: { id: 9 } } });

  await silentRun(['apps', 'create', '--env', 'staging', '--name', 'X', '--url', 'https://x']);

  const req = lastRequest();
  assert.equal(req.headers.Authorization, 'Bearer stg-tok');   // staging token, not production's
  assert.match(req.url, /stg\.local/);
  assert.doesNotMatch(req.url, /prod\.local/);
});

// --- login --token (D-07) -------------------------------------------------

test('login --token stores on 200 without echoing the PAT', async () => {
  installMockFetch({ status: 200, body: { data: [] } });

  const { result, lines } = await captureAll(() =>
    run(['login', '--token', 'good-pat', ...API]),
  );

  assert.equal(result, 0);
  assert.equal(storedToken('default'), 'good-pat');
  assert.doesNotMatch(lines.join('\n'), /good-pat/);
});

test('login --token refuses on 401: stores nothing, single probe, no PAT echo', async () => {
  installMockFetch({ status: 401, body: { error: 'unauthorized' } });

  const before = storedToken('default');
  const { result, lines } = await captureAll(() =>
    run(['login', '--token', 'bad-pat', ...API]),
  );

  assert.equal(result, 1);
  assert.equal(storedToken('default'), before);
  assert.equal(requests.length, 1); // only the validation probe
  assert.doesNotMatch(lines.join('\n'), /bad-pat/);
});

// --- value-less flag guards -----------------------------------------------

test('value-less --env returns a usage error (exit 2)', async () => {
  const result = await silentRun(['whoami', '--env']);
  assert.equal(result, 2);
});

// --- PAT-never-printed sweep ----------------------------------------------

test('no auth verb ever prints a stored token (cross-verb sweep)', async () => {
  writeProfile('production', { api_base: 'http://prod.local', token: 'prod-tok' });
  writeProfile('staging', { api_base: 'http://stg.local', token: 'stg-tok' });
  writeConfig({ ...readConfig(), current: 'production' });

  const all = [];

  installMockFetch({ status: 200, body: { data: [{ id: 1 }] } });
  const w = await captureAll(() => run(['whoami', ...API]));
  all.push(...w.lines);

  const e = await captureAll(() => run(['env', 'list']));
  all.push(...e.lines);

  installMockFetch({ status: 204, body: null });
  const l = await captureAll(() => run(['logout', ...API]));
  all.push(...l.lines);

  installMockFetch({ status: 200, body: { data: [] } });
  const t = await captureAll(() => run(['login', '--token', 'good-pat', ...API]));
  all.push(...t.lines);

  const out = all.join('\n');
  for (const tok of ['prod-tok', 'stg-tok', 'good-pat']) {
    assert.doesNotMatch(out, new RegExp(tok), `token "${tok}" leaked in output`);
  }
});
