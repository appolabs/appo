import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/cli.mjs';
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

// --- publish (POST -> 204, confirm-gated) ---------------------------------

test('publish without --confirm issues NO write and returns 3', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  const { result } = await captureLog(() => run(['publish', '7', '--stores', 'apple_appstore', ...API]));
  assert.equal(result, 3);
  assert.equal(requests.length, 0); // T-01-13: gate before any POST
});

test('publish without --confirm prints a preview (no write performed notice)', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  const { lines } = await captureLog(() =>
    run(['publish', '7', '--stores', 'apple_appstore', ...API]),
  );
  const out = lines.join('\n');
  assert.match(out, /publish/);
  assert.match(out, /no write performed/i);
});

test('publish with --confirm POSTs /publish body {app_stores:[...]} and returns 0', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  const { result } = await captureLog(() =>
    run(['publish', '7', '--stores', 'apple_appstore', '--confirm', ...API]),
  );
  assert.equal(result, 0);
  const req = lastRequest();
  assert.equal(req.method, 'POST');
  assert.match(req.path, /\/api\/v1\/apps\/7\/publish$/);
  assert.deepEqual(req.body, { app_stores: ['apple_appstore'] });
});

test('publish maps friendly aliases apple/google to canonical tokens', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  await captureLog(() =>
    run(['publish', '7', '--stores', 'apple,google', '--confirm', ...API]),
  );
  const req = lastRequest();
  assert.deepEqual(req.body, { app_stores: ['apple_appstore', 'google_playstore'] });
});

test('publish --json on a 204 prints "null" and returns 0', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  const { result, lines } = await captureLog(() =>
    run(['publish', '7', '--stores', 'apple_appstore', '--confirm', '--json', ...API]),
  );
  assert.equal(result, 0);
  assert.equal(lines.join('').trim(), 'null');
});

test('publish missing --stores returns 2', async () => {
  stubToken();
  const result = await silentRun(['publish', '7', ...API]);
  assert.equal(result, 2);
});

test('publish missing id returns 2', async () => {
  stubToken();
  const result = await silentRun(['publish', ...API]);
  assert.equal(result, 2);
});

// --- resubmit (POST -> 200, confirm-gated, no body) -----------------------

test('resubmit without --confirm issues NO write and returns 3', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: { status: 'in_review' } } });
  const { result } = await captureLog(() => run(['resubmit', '7', ...API]));
  assert.equal(result, 3);
  assert.equal(requests.length, 0); // T-01-13
});

test('resubmit preview mentions the Apple credential requirement', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: { status: 'in_review' } } });
  const { lines } = await captureLog(() => run(['resubmit', '7', ...API]));
  assert.match(lines.join('\n'), /Apple Developer credential/i);
});

test('resubmit with --confirm POSTs /resubmit with no body and returns 0', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: { status: 'in_review' } } });
  const { result } = await captureLog(() => run(['resubmit', '7', '--confirm', ...API]));
  assert.equal(result, 0);
  const req = lastRequest();
  assert.equal(req.method, 'POST');
  assert.match(req.path, /\/api\/v1\/apps\/7\/resubmit$/);
  assert.equal(req.body, null); // no body sent
});

test('resubmit CUSTOMER_ASC_CREDENTIAL_MISSING renders blocked-state with dashboard_url, returns 1', async () => {
  stubToken();
  installMockFetch({
    status: 422,
    body: {
      error: 'prerequisite_failed',
      code: 'CUSTOMER_ASC_CREDENTIAL_MISSING',
      message: 'Connect your Apple Developer account',
      details: { next_action: 'complete_enrollment', dashboard_url: 'https://dash.example/connect' },
    },
  });
  const { result, lines } = await captureAll(() => run(['resubmit', '7', '--confirm', ...API]));
  assert.equal(result, 1);
  const out = lines.join('\n');
  assert.match(out, /Blocked/);
  assert.match(out, /https:\/\/dash\.example\/connect/);
});

test('resubmit missing id returns 2', async () => {
  stubToken();
  const result = await silentRun(['resubmit', ...API]);
  assert.equal(result, 2);
});
