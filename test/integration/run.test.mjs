import { test, afterEach, expect } from 'vitest';
import { run } from '../../src/cli.mjs';
import {
  installMockFetch,
  resetMockFetch,
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

// Capture BOTH streams (error paths print to stderr, e.g. renderError).
async function captureAll(fn) {
  const origLog = console.log;
  const origErr = console.error;
  const lines = [];
  const errs = [];
  console.log = (...args) => lines.push(args.join(' '));
  console.error = (...args) => errs.push(args.join(' '));
  try {
    const result = await fn();
    return { result, lines, errs };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

afterEach(() => resetMockFetch());

const API = ['--api', 'http://test.local'];

// --- run: trigger + show target --------------------------------------------

// D-05: `run` triggers directly (no --confirm) then shows the on-device target.
// The mock FIFO repeats its last queued item once exhausted (see mockFetch.mjs),
// so a single canned preview-shaped body serves BOTH the trigger POST (whose
// body is never read) and the following GET /preview (whose body IS read).
test('run <id> triggers the TestFlight build (POST first), then shows the target when ready', async () => {
  stubToken();
  installMockFetch({
    status: 200,
    body: {
      ios_testflight_url: 'https://testflight.apple.com/join/XXXX',
      android_deeplink: null,
      preview_url: 'https://app.appo.io/preview/tok',
      preview_ready: { ios: true, android: false },
    },
  });
  const { result, lines } = await captureLog(() => run(['run', '7', ...API]));
  expect(result).toBe(0);
  expect(requests.length).toBe(2);
  expect(requests[0].method).toBe('POST');
  expect(requests[0].path).toMatch(/\/api\/v1\/apps\/7\/builds\/testflight$/);
  expect(requests[1].method).toBe('GET');
  expect(requests[1].path).toMatch(/\/api\/v1\/apps\/7\/preview$/);
  const out = lines.join('\n');
  expect(out).toContain('TestFlight build triggered.');
  expect(out).toContain('https://testflight.apple.com/join/XXXX');
  expect(out).toMatch(/[▀▄█]/); // a QR was rendered — the target is shown
});

test('run <id> --json emits the trigger response verbatim (single POST, no target fetch)', async () => {
  stubToken();
  const body = { data: { platform: 'ios', status: 'preparing', kind: 'testflight' } };
  installMockFetch({ status: 202, body });
  const { result, lines } = await captureLog(() => run(['run', '7', '--json', ...API]));
  expect(result).toBe(0);
  expect(requests.length).toBe(1);
  expect(requests[0].method).toBe('POST');
  expect(requests[0].path).toMatch(/\/api\/v1\/apps\/7\/builds\/testflight$/);
  expect(JSON.parse(lines.join(''))).toEqual(body);
});

// D-06/D-08: a 409 (concurrency in-flight, or the app not yet ASC-ready) is not
// swallowed — it renders via the EXISTING error path, never a bespoke one.
test('run <id> --json on a 409 conflict emits the envelope verbatim and returns 1', async () => {
  stubToken();
  const env = { error: 'conflict', code: 'resource_conflict', message: 'A device build is already in progress for this app — wait for it to finish before starting another.' };
  installMockFetch({ status: 409, body: env });
  const { result, lines } = await captureLog(() => run(['run', '7', '--json', ...API]));
  expect(result).toBe(1);
  expect(JSON.parse(lines.join(''))).toEqual(env);
});

test('run <id> (human) on a 409 conflict renders the server message via renderError, returns 1, no target fetch', async () => {
  stubToken();
  const message = "We're still preparing this app for on-device testing. If it doesn't clear shortly, reach out to support.";
  installMockFetch({ status: 409, body: { error: 'conflict', code: 'resource_conflict', message } });
  const { result, errs } = await captureAll(() => run(['run', '7', ...API]));
  expect(result).toBe(1);
  expect(errs.join('\n')).toContain(message);
  expect(requests.length).toBe(1); // the trigger POST only — no GET /preview follow-up on failure
});

test('run <id> propagates a non-conflict error (e.g. 404 app not found) to the existing error path', async () => {
  stubToken();
  installMockFetch({ status: 404, body: { error: 'not_found', code: 'resource_not_found', message: 'The requested resource was not found.' } });
  const { result } = await captureAll(() => run(['run', '7', ...API]));
  expect(result).toBe(1);
});

// D-02/D-05: the run case never gates behind --confirm.
test('run <id> never emits a confirm-required gate (exit 3)', async () => {
  stubToken();
  installMockFetch({ status: 202, body: { data: { platform: 'ios' } } });
  const { result } = await captureLog(() => run(['run', '7', ...API]));
  expect(result).not.toBe(3);
});

// --- printBuild: curated 9-key set only (D-04) -------------------------------

test('status --build prints only the curated fields, never the removed id/kind/artifact_url/error_message', async () => {
  stubToken();
  installMockFetch({
    status: 200,
    body: {
      data: {
        platform: 'ios',
        status: 'ready_to_try',
        failed: false,
        message_code: 'ready',
        message: 'Ready',
        testflight_url: 'https://testflight.apple.com/join/XXXX',
        created_at: '2026-09-26T10:00:00Z',
        started_at: '2026-09-26T10:01:00Z',
        finished_at: '2026-09-26T10:05:00Z',
        // A build resource that still carried the removed fields (e.g. from a
        // stale cache/mock) must never leak them into the printed output.
        id: 42,
        kind: 'testflight',
        artifact_url: 'https://cdn.test/app.ipa',
        error_message: 'should never print',
      },
    },
  });
  const { result, lines } = await captureLog(() => run(['status', '7', '--build', '42', ...API]));
  expect(result).toBe(0);
  const out = lines.join('\n');
  for (const curated of ['platform', 'status', 'failed', 'message_code', 'message', 'testflight_url', 'created_at', 'started_at', 'finished_at']) {
    expect(out).toMatch(new RegExp(`^\\s*${curated}\\b`, 'm'));
  }
  for (const removed of ['id', 'kind', 'artifact_url', 'error_message']) {
    expect(out).not.toMatch(new RegExp(`^\\s*${removed}\\b`, 'm'));
  }
  expect(out).not.toContain('should never print');
});

// --- Full-file rename sweep: regression coverage for the two previously
// untested `appo preview` string spots the rename must also fix ------------

test('devices register hint says "appo run", never "appo preview"', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: { url: 'http://test.local/device-register/enroll?sig=x' }, message: 'OK' } });
  const { lines } = await captureLog(() => run(['devices', 'register', ...API]));
  const out = lines.join('\n');
  expect(out).toContain('appo run <id>');
  expect(out).not.toContain('appo preview');
});

test('ship success line says "run: appo run", never "appo preview"', async () => {
  stubToken();
  installMockFetch([{ status: 204 }]); // publishApp only
  const { lines } = await captureLog(() => run(['ship', '5', '--yes', ...API]));
  const out = lines.join('\n');
  expect(out).toContain('appo run 5');
  expect(out).not.toContain('appo preview');
});
