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

// Integration tests queue a SINGLE `ready` getBuild so the poll loop never reaches
// a real sleep (terminal on the first poll). The multi-status sequence is reserved
// for the pollBuild unit tests with an injected no-op sleep.

// 1. Happy path: create -> build -> poll(ready) -> publish, exit 0, shipped.
test('ship --yes runs create->build->poll(ready)->publish, exit 0, final_state shipped', async () => {
  stubToken();
  installMockFetch([
    { status: 201, body: { data: { id: 5 } } },                    // createApp
    { status: 202, body: { data: { id: 12, status: 'queued' } } }, // triggerBuild
    { status: 200, body: { data: { status: 'ready' } } },          // getBuild -> terminal (no sleep)
    { status: 204 },                                               // publishApp
  ]);
  const { result } = await captureLog(() =>
    run(['ship', '--url', 'https://x', '--name', 'X', '--yes', '--timeout', '60', ...API]));
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.method).toBe('POST');
  expect(req.path).toMatch(/\/api\/v1\/apps\/5\/publish$/);
  expect(req.body).toEqual({ app_stores: ['apple_appstore', 'google_playstore'] });
});

// 2. Existing-id skips create (first request is the build POST).
test('ship <id> --yes skips create (no create POST)', async () => {
  stubToken();
  installMockFetch([
    { status: 202, body: { data: { id: 12, status: 'queued' } } }, // triggerBuild (first call)
    { status: 200, body: { data: { status: 'ready' } } },          // getBuild -> terminal
    { status: 204 },                                               // publish
  ]);
  await captureLog(() => run(['ship', '5', '--yes', ...API]));
  expect(requests[0].path).toMatch(/\/api\/v1\/apps\/5\/builds$/);   // first request is build, not create
});

// 2b. `reship <id>` is the operator-facing verb for "rebuild and republish an
// existing app" — same pipeline as `ship <id>` (skips create, build is first).
test('reship <id> --yes skips create and publishes (exit 0)', async () => {
  stubToken();
  installMockFetch([
    { status: 202, body: { data: { id: 12, status: 'queued' } } }, // triggerBuild (first call)
    { status: 200, body: { data: { status: 'ready' } } },          // getBuild -> terminal
    { status: 204 },                                               // publish
  ]);
  const { result } = await captureLog(() => run(['reship', '5', '--yes', ...API]));
  expect(result).toBe(0);
  expect(requests[0].path).toMatch(/\/api\/v1\/apps\/5\/builds$/);   // first request is build, not create
});

// 2c. reship requires an id — the create form is ship-only.
test('reship without an id -> exit 2, no HTTP', async () => {
  stubToken();
  installMockFetch({ status: 200 });
  const result = await silentRun(['reship', ...API]);
  expect(result).toBe(2);
  expect(requests.length).toBe(0);
});

// 2d. reship never forwards a build platform/branch — the trigger body is empty
// (the operator decides the platform server-side; the user ships an outcome).
test('reship triggers a build with an empty body (no platform/branch leak)', async () => {
  stubToken();
  installMockFetch([
    { status: 202, body: { data: { id: 12, status: 'queued' } } },
    { status: 200, body: { data: { status: 'ready' } } },
    { status: 204 },
  ]);
  await captureLog(() => run(['reship', '5', '--yes', ...API]));
  expect(requests[0].body).toEqual({});   // build trigger carries no platform/branch
});

// 3. build failed -> exit 1, hint fix-recipe / rejection.
test('ship build failed -> exit 1 with fix-recipe/rejection hint', async () => {
  stubToken();
  installMockFetch([
    { status: 202, body: { data: { id: 12 } } },
    { status: 200, body: { data: { status: 'failed' } } },
  ]);
  const { result, lines } = await captureLog(() => run(['ship', '5', '--yes', ...API]));
  expect(result).toBe(1);
  expect(lines.join('\n')).toMatch(/fix-recipe|rejection/);
});

// 4. poll timeout -> exit 1, resume hints. --timeout 0 returns timeout on first
//    non-terminal status without sleeping.
test('ship poll timeout -> exit 1 with appo status resume hints', async () => {
  stubToken();
  installMockFetch([
    { status: 202, body: { data: { id: 12 } } },
    { status: 200, body: { data: { status: 'building' } } },
  ]);
  const { result, lines } = await captureLog(() =>
    run(['ship', '5', '--yes', '--timeout', '0', ...API]));
  expect(result).toBe(1);
  expect(lines.join('\n')).toMatch(/appo status 5 --build/);
  expect(lines.join('\n')).toMatch(/appo status 5/);
});

// 5. no --yes -> exit 3, NO publish POST (the high-severity gate invariant).
test('ship without --yes -> exit 3 and issues NO publish POST', async () => {
  stubToken();
  installMockFetch([
    { status: 202, body: { data: { id: 12 } } },
    { status: 200, body: { data: { status: 'ready' } } },
  ]);
  const { result } = await captureLog(() => run(['ship', '5', ...API]));
  expect(result).toBe(3);
  expect(requests.filter(r => /\/publish$/.test(r.path)).length).toBe(0);  // gate: NO publish write
});

// 6. build prerequisite_failed -> exit 1, Blocked + dashboard_url, surfaced app_id.
test('ship build prerequisite_failed -> exit 1, Blocked + dashboard_url + resume app_id', async () => {
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
});

// 7. usage error -> exit 2, no HTTP, for both plain and --json invocations.
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

// 8a. --json one-object ledger on success.
test('ship --json emits one {steps,final_state} object, final_state shipped, exit 0', async () => {
  stubToken();
  installMockFetch([
    { status: 202, body: { data: { id: 12 } } },
    { status: 200, body: { data: { status: 'ready' } } },
    { status: 204 },
  ]);
  const { result, lines } = await captureLog(() =>
    run(['ship', '5', '--yes', '--json', ...API]));
  expect(result).toBe(0);
  const out = JSON.parse(lines.join(''));            // exactly one JSON line
  expect(Array.isArray(out.steps)).toBeTruthy();
  expect(out.final_state).toBe('shipped');
});

// 8b. --json gated: final_state gated, exit 3, no publish POST.
test('ship --json without --yes -> final_state gated, exit 3, no publish POST', async () => {
  stubToken();
  installMockFetch([
    { status: 202, body: { data: { id: 12 } } },
    { status: 200, body: { data: { status: 'ready' } } },
  ]);
  const { result, lines } = await captureLog(() =>
    run(['ship', '5', '--json', ...API]));
  expect(result).toBe(3);
  const out = JSON.parse(lines.join(''));
  expect(out.final_state).toBe('gated');
  expect(requests.filter(r => /\/publish$/.test(r.path)).length).toBe(0);
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
});

// WR-02: on a build-trigger block for an EXISTING-id ship (no create step), the
// --json ledger must still carry app_id so a consumer can resume.
test('ship <id> build block surfaces app_id in the --json ledger (WR-02)', async () => {
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
});
