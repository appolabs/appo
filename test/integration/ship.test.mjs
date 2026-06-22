import { test, afterEach, expect } from 'vitest';
import { run } from '../../src/cli.mjs';
import {
  installMockFetch,
  resetMockFetch,
  lastRequest,
  requests,
  stubToken,
} from '../helpers/mockFetch.mjs';

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

afterEach(() => resetMockFetch());

const API = ['--api', 'http://test.local'];

// Post-Phase-7 invariant (SC-1/SC-2): `ship` never triggers or polls a build.
// Builds are issued by Appo staff server-side. Every ship case below asserts the
// NEGATIVE: zero requests matching /\/builds$/ were issued. The mock FIFO returns
// the last queued response repeatedly, so a lingering build call would be silently
// absorbed — request-absence is the only reliable guard.

// 1. Happy path (new-app form): create -> publish-intent, exit 0, shipped. NO /builds.
test('ship --url --name --yes creates then publishes, NO /builds, exit 0', async () => {
  stubToken();
  installMockFetch([
    { status: 201, body: { data: { id: 5 } } },  // createApp
    { status: 204 },                              // publishApp (intent) — NO build, NO poll
  ]);
  const { result } = await captureLog(() =>
    run(['ship', '--url', 'https://x', '--name', 'X', '--yes', ...API]));
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.method).toBe('POST');
  expect(req.path).toMatch(/\/api\/v1\/apps\/5\/publish$/);
  expect(req.body).toEqual({ app_stores: ['apple_appstore', 'google_playstore'] });
  expect(requests.filter(r => /\/builds$/.test(r.path)).length).toBe(0);  // SC-1/SC-2 invariant
});

// 2. Existing-id skips create — the FIRST request is the publish POST, never a build.
test('ship <id> --yes skips create (first request is publish, NO /builds)', async () => {
  stubToken();
  installMockFetch([{ status: 204 }]);  // publishApp only
  const { result } = await captureLog(() => run(['ship', '5', '--yes', ...API]));
  expect(result).toBe(0);
  expect(requests[0].method).toBe('POST');
  expect(requests[0].path).toMatch(/\/api\/v1\/apps\/5\/publish$/);  // first request is publish, not create/build
  expect(requests.filter(r => /\/builds$/.test(r.path)).length).toBe(0);
});

// 3. no --yes -> exit 3, NO publish POST, NO /builds (the high-severity gate invariant).
test('ship <id> without --yes -> exit 3, NO publish POST, NO /builds', async () => {
  stubToken();
  installMockFetch([{ status: 204 }]);  // never reached — gate fires first
  const { result } = await captureLog(() => run(['ship', '5', ...API]));
  expect(result).toBe(3);
  expect(requests.filter(r => /\/publish$/.test(r.path)).length).toBe(0);  // gate: NO publish write
  expect(requests.filter(r => /\/builds$/.test(r.path)).length).toBe(0);
});

// 4. publish prerequisite_failed -> exit 1, Blocked + dashboard_url, surfaced app_id.
//    The block now fires on the publish step (no build step exists). NO /builds.
test('ship publish prerequisite_failed -> exit 1, Blocked + dashboard_url + resume app_id', async () => {
  stubToken();
  installMockFetch([
    { status: 201, body: { data: { id: 5 } } },                       // create ok
    { status: 422, body: { error: 'prerequisite_failed', code: 'APPLE_CREDENTIALS_MISSING',
                            message: 'Apple credentials required',
                            details: { next_action: 'open_dashboard', dashboard_url: 'https://dash/settings' } } },
  ]);
  const { result, lines } = await captureAll(() =>
    run(['ship', '--url', 'https://x', '--name', 'X', '--yes', ...API]));
  expect(result).toBe(1);
  expect(lines.join('\n')).toMatch(/Blocked/);
  expect(lines.join('\n')).toMatch(/dash\/settings/);
  expect(lines.join('\n')).toMatch(/ship 5/);   // resume hint surfaces the created app_id
  expect(requests.filter(r => /\/builds$/.test(r.path)).length).toBe(0);
});

// 5. usage error -> exit 2, no HTTP, for both plain and --json invocations.
test('ship with no id and no --url/--name -> exit 2, no HTTP (plain + --json)', async () => {
  stubToken();
  installMockFetch({ status: 200 });
  const result = await silentRun(['ship', ...API]);
  expect(result).toBe(2);
  expect(requests.length).toBe(0);
  // --json usage error is ALSO plain-text exit 2 (the single-object ledger contract
  // begins only once a pipeline step starts).
  const jsonResult = await silentRun(['ship', '--json', ...API]);
  expect(jsonResult).toBe(2);
  expect(requests.length).toBe(0);
});

// 6a. --json one-object ledger on success. final_state shipped, no build step in the ledger.
test('ship --json emits one {steps,final_state} object, final_state shipped, exit 0', async () => {
  stubToken();
  installMockFetch([{ status: 204 }]);  // publishApp
  const { result, lines } = await captureLog(() =>
    run(['ship', '5', '--yes', '--json', ...API]));
  expect(result).toBe(0);
  const out = JSON.parse(lines.join(''));            // exactly one JSON line
  expect(Array.isArray(out.steps)).toBeTruthy();
  expect(out.final_state).toBe('shipped');
  expect(out.steps.some((s) => s.step === 'build')).toBe(false);  // no build/poll steps
  expect(requests.filter(r => /\/builds$/.test(r.path)).length).toBe(0);
});

// 6b. --json gated: final_state gated, exit 3, no publish POST, no /builds.
test('ship --json without --yes -> final_state gated, exit 3, no publish POST', async () => {
  stubToken();
  installMockFetch([{ status: 204 }]);  // never reached — gate fires first
  const { result, lines } = await captureLog(() =>
    run(['ship', '5', '--json', ...API]));
  expect(result).toBe(3);
  const out = JSON.parse(lines.join(''));
  expect(out.final_state).toBe('gated');
  expect(requests.filter(r => /\/publish$/.test(r.path)).length).toBe(0);
  expect(requests.filter(r => /\/builds$/.test(r.path)).length).toBe(0);
});

// IN-01: a non-numeric id must echo the raw value in the gate preview, never NaN
// (human) nor the JSON literal null (--json). No write occurs (gate, exit 3).
test('publish --json gate echoes a non-numeric id verbatim, not null (IN-01)', async () => {
  stubToken();
  installMockFetch({ status: 200 });
  const { result, lines } = await captureLog(() =>
    run(['publish', 'my-slug', '--stores', 'apple', '--json', ...API]));
  expect(result).toBe(3);
  const out = JSON.parse(lines.join(''));
  expect(out.app_id).toBe('my-slug');                // raw string, not null
  expect(requests.filter(r => /\/publish$/.test(r.path)).length).toBe(0);
});

// IN-01: a numeric id is still coerced to a number in the preview (unchanged path).
test('publish --json gate coerces a numeric id to a number (IN-01)', async () => {
  stubToken();
  installMockFetch({ status: 200 });
  const { result, lines } = await captureLog(() =>
    run(['publish', '5', '--stores', 'apple', '--json', ...API]));
  expect(result).toBe(3);
  const out = JSON.parse(lines.join(''));
  expect(out.app_id).toBe(5);                        // number, preserves prior behaviour
});

// IN-03: the publish verb maps apple/google aliases via the SHARED parseStores
// (single alias definition). The POST body must still carry canonical tokens.
test('publish maps apple/google aliases to canonical tokens via parseStores (IN-03)', async () => {
  stubToken();
  installMockFetch([{ status: 204 }]);
  const result = await run(['publish', '5', '--stores', 'apple,google', '--confirm', ...API]);
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.path).toMatch(/\/api\/v1\/apps\/5\/publish$/);
  expect(req.body).toEqual({ app_stores: ['apple_appstore', 'google_playstore'] });
});

// WR-01: an empty/non-enveloped 2xx body must NOT throw a raw TypeError — the
// create result is guarded (|| {}); the run resolves to a controlled exit code.
test('ship create with empty 2xx body does not throw (WR-01 guard)', async () => {
  stubToken();
  installMockFetch([
    { status: 201, body: {} },                                       // create: empty body, no id
    { status: 422, body: { error: 'prerequisite_failed', code: 'X', message: 'blocked' } },
  ]);
  const { result } = await captureLog(() =>
    run(['ship', '--url', 'https://x', '--name', 'X', '--yes', '--json', ...API]));
  expect(result).toBe(1);   // blocked, not an uncaught TypeError
  expect(requests.filter(r => /\/builds$/.test(r.path)).length).toBe(0);
});

// WR-02: on a publish block for an EXISTING-id ship (no create step), the --json
// ledger must still carry app_id so a consumer can resume.
test('ship <id> publish block surfaces app_id in the --json ledger (WR-02)', async () => {
  stubToken();
  installMockFetch([
    { status: 422, body: { error: 'prerequisite_failed', code: 'APPLE_CREDENTIALS_MISSING', message: 'creds required' } },
  ]);
  const { result, lines } = await captureLog(() => run(['ship', '7', '--yes', '--json', ...API]));
  expect(result).toBe(1);
  const out = JSON.parse(lines.join(''));
  expect(out.final_state).toBe('blocked');
  const block = out.steps.find((s) => s.status === 'blocked');
  expect(block.app_id).toBe('7');   // resume id present even without a create step
  expect(requests.filter(r => /\/builds$/.test(r.path)).length).toBe(0);
});
