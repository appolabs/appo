import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { run, pollBuild } from '../src/cli.mjs';
import {
  installMockFetch,
  resetMockFetch,
  lastRequest,
  requests,
  stubToken,
} from './helpers/mockFetch.mjs';

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
  assert.equal(result, 0);
  const req = lastRequest();
  assert.equal(req.method, 'POST');
  assert.match(req.path, /\/api\/v1\/apps\/5\/publish$/);
  assert.deepEqual(req.body, { app_stores: ['apple_appstore', 'google_playstore'] });
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
  assert.match(requests[0].path, /\/api\/v1\/apps\/5\/builds$/);   // first request is build, not create
});

// 3. build failed -> exit 1, hint fix-recipe / rejection.
test('ship build failed -> exit 1 with fix-recipe/rejection hint', async () => {
  stubToken();
  installMockFetch([
    { status: 202, body: { data: { id: 12 } } },
    { status: 200, body: { data: { status: 'failed' } } },
  ]);
  const { result, lines } = await captureLog(() => run(['ship', '5', '--yes', ...API]));
  assert.equal(result, 1);
  assert.match(lines.join('\n'), /fix-recipe|rejection/);
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
  assert.equal(result, 1);
  assert.match(lines.join('\n'), /appo status 5 --build/);
  assert.match(lines.join('\n'), /appo status 5/);
});

// 5. no --yes -> exit 3, NO publish POST (the high-severity gate invariant).
test('ship without --yes -> exit 3 and issues NO publish POST', async () => {
  stubToken();
  installMockFetch([
    { status: 202, body: { data: { id: 12 } } },
    { status: 200, body: { data: { status: 'ready' } } },
  ]);
  const { result } = await captureLog(() => run(['ship', '5', ...API]));
  assert.equal(result, 3);
  assert.equal(requests.filter(r => /\/publish$/.test(r.path)).length, 0);  // gate: NO publish write
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
  assert.equal(result, 1);
  assert.match(lines.join('\n'), /Blocked/);
  assert.match(lines.join('\n'), /dash\/settings/);
  assert.match(lines.join('\n'), /ship 5/);   // resume hint surfaces the created app_id
});

// 7. usage error -> exit 2, no HTTP, for both plain and --json invocations.
test('ship with no id and no --url/--name -> exit 2, no HTTP (plain + --json)', async () => {
  stubToken();
  installMockFetch({ status: 200 });
  const result = await silentRun(['ship', ...API]);
  assert.equal(result, 2);
  assert.equal(requests.length, 0);
  // --json usage error is ALSO plain-text exit 2 (the single-object ledger contract
  // begins only once a pipeline step starts).
  const jsonResult = await silentRun(['ship', '--json', ...API]);
  assert.equal(jsonResult, 2);
  assert.equal(requests.length, 0);
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
  assert.equal(result, 0);
  const out = JSON.parse(lines.join(''));            // exactly one JSON line
  assert.ok(Array.isArray(out.steps));
  assert.equal(out.final_state, 'shipped');
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
  assert.equal(result, 3);
  const out = JSON.parse(lines.join(''));
  assert.equal(out.final_state, 'gated');
  assert.equal(requests.filter(r => /\/publish$/.test(r.path)).length, 0);
});

// 9a. pollBuild unit: building->building->ready returns ready (no-op sleep, instant).
test('pollBuild observes building->building->ready and returns ready', async () => {
  stubToken();
  installMockFetch([
    { status: 200, body: { data: { status: 'building' } } },
    { status: 200, body: { data: { status: 'building' } } },
    { status: 200, body: { data: { status: 'ready' } } },
  ]);
  const res = await pollBuild('http://test.local', 5, 12, { sleep: async () => {}, intervalMs: 0 });
  assert.equal(res.outcome, 'ready');
});

// 9b. pollBuild unit: failed is terminal.
test('pollBuild returns failed when status reaches failed', async () => {
  stubToken();
  installMockFetch([
    { status: 200, body: { data: { status: 'building' } } },
    { status: 200, body: { data: { status: 'failed' } } },
  ]);
  const res = await pollBuild('http://test.local', 5, 12, { sleep: async () => {}, intervalMs: 0 });
  assert.equal(res.outcome, 'failed');
});

// 9c. pollBuild unit: timeoutMs 0 + non-terminal status returns timeout.
test('pollBuild returns timeout when timeoutMs elapses before terminal', async () => {
  stubToken();
  installMockFetch([
    { status: 200, body: { data: { status: 'building' } } },
  ]);
  const res = await pollBuild('http://test.local', 5, 12, { sleep: async () => {}, intervalMs: 0, timeoutMs: 0 });
  assert.equal(res.outcome, 'timeout');
  assert.equal(res.last_status, 'building');
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
  assert.equal(result, 1);   // blocked, not an uncaught TypeError
});

// WR-02: on a build-trigger block for an EXISTING-id ship (no create step), the
// --json ledger must still carry app_id so a consumer can resume.
test('ship <id> build block surfaces app_id in the --json ledger (WR-02)', async () => {
  stubToken();
  installMockFetch([
    { status: 422, body: { error: 'prerequisite_failed', code: 'APPLE_CREDENTIALS_MISSING', message: 'creds required' } },
  ]);
  const { result, lines } = await captureLog(() => run(['ship', '7', '--yes', '--json', ...API]));
  assert.equal(result, 1);
  const out = JSON.parse(lines.join(''));
  assert.equal(out.final_state, 'blocked');
  const block = out.steps.find((s) => s.status === 'blocked');
  assert.equal(block.app_id, '7');   // resume id present even without a create step
});
