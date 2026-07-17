import { test, afterEach, expect } from 'vitest';
import { run } from '../../src/cli.mjs';
import {
  installMockFetch,
  resetMockFetch,
  lastRequest,
  requests,
  stubToken,
} from '../helpers/mockFetch.mjs';
import { readConfig, clearConfig } from '../../src/config.mjs';

// Capture console.log output around an async call (verbs are async).
async function captureLog(fn) {
  const original = console.log;
  const lines = [];
  console.log = (...args) => lines.push(args.join(' '));
  try {
    const result = await fn();
    return { result, lines };
  } finally {
    console.log = original;
  }
}

// Capture both stdout (console.log) and stderr (console.error).
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

afterEach(() => resetMockFetch());

const API = ['--api', 'http://test.local'];

// `appo new` is the creation verb — the app on your phone; `appo ship <id>` is
// the store verb. Single-step (no ledger): plain output, top-level renderError.

// 1. Happy path with an explicit --name: one POST /api/v1/apps, human output
//    points at the two canonical next steps (preview + ship).
test('new --url --name creates the app and prints preview/ship next steps', async () => {
  stubToken();
  installMockFetch([
    { status: 201, body: { data: { id: 5, name: 'X', base_url: 'https://x.com' } } },
  ]);
  const { result, lines } = await captureLog(() =>
    run(['new', '--url', 'https://x.com', '--name', 'X', ...API]));
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.method).toBe('POST');
  expect(req.path).toMatch(/\/api\/v1\/apps$/);
  expect(req.body).toEqual({ name: 'X', base_url: 'https://x.com' });
  const out = lines.join('\n');
  expect(out).toMatch(/Created app #5 — X/);
  expect(out).toMatch(/appo preview 5/);
  expect(out).toMatch(/appo ship 5/);
});

// 2. The canonical one-liner: a bare domain gets https:// prepended client-side
//    and the name derives from the first hostname label, capitalized.
test('new --url tuosito.com derives name Tuosito and prepends https://', async () => {
  stubToken();
  installMockFetch([
    { status: 201, body: { data: { id: 6, name: 'Tuosito', base_url: 'https://tuosito.com' } } },
  ]);
  const { result } = await captureLog(() => run(['new', '--url', 'tuosito.com', ...API]));
  expect(result).toBe(0);
  expect(lastRequest().body).toEqual({ name: 'Tuosito', base_url: 'https://tuosito.com' });
});

// 3. A leading `www.` is stripped BEFORE the first label is taken.
test('new strips a leading www. before deriving the name', async () => {
  stubToken();
  installMockFetch([
    { status: 201, body: { data: { id: 7, name: 'Pizza-mario', base_url: 'https://www.pizza-mario.it' } } },
  ]);
  const { result } = await captureLog(() =>
    run(['new', '--url', 'https://www.pizza-mario.it', ...API]));
  expect(result).toBe(0);
  expect(lastRequest().body).toEqual({ name: 'Pizza-mario', base_url: 'https://www.pizza-mario.it' });
});

// 4. Usage error: missing --url (or a bare valueless --url) -> exit 2, no HTTP.
test('new without --url -> exit 2 with usage line, no HTTP', async () => {
  stubToken();
  installMockFetch({ status: 201 });
  const { result, lines } = await captureAll(() => run(['new', ...API]));
  expect(result).toBe(2);
  expect(lines.join('\n')).toMatch(/Usage: appo new --url <u>/);
  expect(requests.length).toBe(0);
  // A bare `--url` (no value) parses as boolean true — same usage error, no HTTP.
  const bare = await captureAll(() => run(['new', '--url', ...API]));
  expect(bare.result).toBe(2);
  expect(requests.length).toBe(0);
});

// 5. --json passthrough (D-08): the raw creation response envelope, verbatim.
test('new --json emits the raw creation envelope verbatim, exit 0', async () => {
  stubToken();
  installMockFetch([
    { status: 201, body: { data: { id: 9, name: 'Tuosito', base_url: 'https://tuosito.com' }, extra: 'kept' } },
  ]);
  const { result, lines } = await captureLog(() =>
    run(['new', '--url', 'tuosito.com', '--json', ...API]));
  expect(result).toBe(0);
  expect(JSON.parse(lines.join(''))).toEqual({
    data: { id: 9, name: 'Tuosito', base_url: 'https://tuosito.com' },
    extra: 'kept',
  });
});

// 6. --prepare flag: body must include prep_mode=appo_managed.
test('new --url --prepare sends prep_mode=appo_managed in body', async () => {
  stubToken();
  installMockFetch([
    { status: 201, body: { data: { id: 10, name: 'X', base_url: 'https://x.com' } } },
  ]);
  const { result } = await captureLog(() =>
    run(['new', '--url', 'https://x.com', '--name', 'X', '--prepare', ...API]));
  expect(result).toBe(0);
  expect(lastRequest().body).toEqual({ name: 'X', base_url: 'https://x.com', prep_mode: 'appo_managed' });
});

// 7. Without --prepare: body must NOT contain prep_mode.
test('new --url without --prepare does not send prep_mode', async () => {
  stubToken();
  installMockFetch([
    { status: 201, body: { data: { id: 11, name: 'Y', base_url: 'https://y.com' } } },
  ]);
  await captureLog(() => run(['new', '--url', 'https://y.com', '--name', 'Y', ...API]));
  expect(lastRequest().body).toEqual({ name: 'Y', base_url: 'https://y.com' });
  expect(lastRequest().body.prep_mode).toBeUndefined();
});

// ─── Anonymous path (no stored token) ────────────────────────────────────────
// Each anonymous test calls clearConfig() first to wipe any token written by
// the authenticated tests above (stubToken writes to the shared worker config;
// resetMockFetch does not clear it).

const ANON_BODY = {
  id: 9,
  name: 'X',
  base_url: 'https://x.com',
  build_id: 1,
  status_url: 'https://x.test/s',
  claim_token: 'a'.repeat(40),
};

// 8. No token → POSTs to /anonymous/create with no Authorization header and
//    body {url, platform:'android'} (default). Regression: does NOT hit /api/v1/apps.
test('new --url with no token posts to /anonymous/create with platform=android default', async () => {
  clearConfig(); // ensure no stale token from previous tests
  installMockFetch([{ status: 200, body: ANON_BODY }]);
  const { result } = await captureLog(() =>
    run(['new', '--url', 'x.com', ...API]));
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.path).toMatch(/\/anonymous\/create$/);
  expect(req.method).toBe('POST');
  expect(req.body).toEqual({ url: 'https://x.com', platform: 'android' });
  // No Authorization header must be present on the anonymous request.
  expect(req.headers['Authorization']).toBeUndefined();
});

// 9. Anonymous happy path (android default): prints created app and claim link.
test('new anonymous prints created app + claim link (android default)', async () => {
  clearConfig();
  installMockFetch([{ status: 200, body: ANON_BODY }]);
  const { result, lines } = await captureLog(() =>
    run(['new', '--url', 'x.com', ...API]));
  expect(result).toBe(0);
  const out = lines.join('\n');
  expect(out).toMatch(/Created anonymous app #9/);
  expect(out).toMatch(/register\?claim_token=/);
  // ios_note is dead — must not be printed.
  expect(out).not.toMatch(/ios_note|iOS requires/i);
});

// 10. Anonymous happy path: persists anonymous_claim_token to the CLI config.
test('new anonymous persists the claim token to config', async () => {
  clearConfig();
  installMockFetch([{ status: 200, body: ANON_BODY }]);
  await captureLog(() => run(['new', '--url', 'x.com', ...API]));
  const cfg = readConfig();
  // The active profile (determined by env) should carry the claim token.
  const profiles = cfg.profiles;
  const hasToken = Object.values(profiles).some(
    (p) => p && p.anonymous_claim_token === 'a'.repeat(40),
  );
  expect(hasToken).toBe(true);
});

// 11. Anonymous 409 (one-per-device limit): prints the limit message, exits 1.
test('new anonymous 409 prints limit message and exits 1', async () => {
  clearConfig();
  installMockFetch([{
    status: 409,
    body: { message: 'limit', register_url: 'https://x.test/register' },
  }]);
  const { result, lines } = await captureAll(() =>
    run(['new', '--url', 'x.com', ...API]));
  expect(result).toBe(1);
  const out = lines.join('\n');
  expect(out).toMatch(/limit/);
});

// 12. Regression: with a stored token, new still hits /api/v1/apps (authenticated path unchanged).
test('new --url with a stored token still hits /api/v1/apps (authenticated path unchanged)', async () => {
  stubToken();
  installMockFetch([
    { status: 201, body: { data: { id: 5, name: 'X', base_url: 'https://x.com' } } },
  ]);
  await captureLog(() => run(['new', '--url', 'https://x.com', '--name', 'X', ...API]));
  expect(lastRequest().path).toMatch(/\/api\/v1\/apps$/);
});

// ─── Platform flag (--platform) ───────────────────────────────────────────────

// 13. --platform ios sends platform=ios in the POST body.
test('new --platform ios sends platform=ios in POST body', async () => {
  clearConfig();
  const iosCreateBody = {
    id: 20,
    name: 'X',
    base_url: 'https://x.com',
    status_url: 'https://x.test/status',
    claim_token: 'b'.repeat(40),
    platform: 'ios',
    registration_url: 'https://x.test/register-device',
  };
  // Provide status response so the poll exits immediately with 'ready'.
  const iosStatusBody = { status: 'ready', install_url: 'https://x.test/install' };
  installMockFetch([
    { status: 201, body: iosCreateBody },
    { status: 200, body: iosStatusBody },
  ]);
  const { result } = await captureLog(() =>
    run(['new', '--url', 'x.com', '--platform', 'ios', ...API]));
  expect(result).toBe(0);
  // First request must have platform=ios in body.
  const req = requests[0];
  expect(req.path).toMatch(/\/anonymous\/create$/);
  expect(req.body).toEqual({ url: 'https://x.com', platform: 'ios' });
});

// 14. ios_full response (200 with ios_full:true): prints degradation message, exits 0.
test('new anonymous ios_full response prints slots-full message and exits 0', async () => {
  clearConfig();
  installMockFetch([{
    status: 200,
    body: { ios_full: true, platform: 'ios', message: 'iOS trial slots are full right now. Try --platform android instead.' },
  }]);
  const { result, lines } = await captureLog(() =>
    run(['new', '--url', 'x.com', '--platform', 'ios', ...API]));
  expect(result).toBe(0);
  const out = lines.join('\n');
  expect(out).toMatch(/iOS trial slots are full/);
});

// 15. Invalid --platform value: usage error, exit 2, no HTTP.
test('new --platform with invalid value exits 2 with usage line, no HTTP', async () => {
  clearConfig();
  installMockFetch([{ status: 200, body: ANON_BODY }]);
  const { result, lines } = await captureAll(() =>
    run(['new', '--url', 'x.com', '--platform', 'windows', ...API]));
  expect(result).toBe(2);
  expect(lines.join('\n')).toMatch(/ios\|android/);
  expect(requests.length).toBe(0);
});
