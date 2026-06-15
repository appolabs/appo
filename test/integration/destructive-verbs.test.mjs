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

// --- publish (POST -> 204, confirm-gated) ---------------------------------

test('publish without --confirm issues NO write and returns 3', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  const { result } = await captureLog(() => run(['publish', '7', '--stores', 'apple_appstore', ...API]));
  expect(result).toBe(3);
  expect(requests.length).toBe(0); // T-01-13: gate before any POST
});

test('publish without --confirm prints a preview (no write performed notice)', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  const { lines } = await captureLog(() =>
    run(['publish', '7', '--stores', 'apple_appstore', ...API]),
  );
  const out = lines.join('\n');
  expect(out).toMatch(/publish/);
  expect(out).toMatch(/no write performed/i);
});

test('publish with --confirm POSTs /publish body {app_stores:[...]} and returns 0', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  const { result } = await captureLog(() =>
    run(['publish', '7', '--stores', 'apple_appstore', '--confirm', ...API]),
  );
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.method).toBe('POST');
  expect(req.path).toMatch(/\/api\/v1\/apps\/7\/publish$/);
  expect(req.body).toEqual({ app_stores: ['apple_appstore'] });
});

test('publish maps friendly aliases apple/google to canonical tokens', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  await captureLog(() =>
    run(['publish', '7', '--stores', 'apple,google', '--confirm', ...API]),
  );
  const req = lastRequest();
  expect(req.body).toEqual({ app_stores: ['apple_appstore', 'google_playstore'] });
});

test('publish --json on a 204 prints "null" and returns 0', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  const { result, lines } = await captureLog(() =>
    run(['publish', '7', '--stores', 'apple_appstore', '--confirm', '--json', ...API]),
  );
  expect(result).toBe(0);
  expect(lines.join('').trim()).toBe('null');
});

// IN-01: an explicit empty --stores must not forward [''] — reject as usage err.
test('publish empty --stores returns 2 and issues NO write (IN-01)', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  const result = await silentRun(['publish', '7', '--stores', '', '--confirm', ...API]);
  expect(result).toBe(2);
  expect(requests.length).toBe(0);
});

test('publish --stores with only commas returns 2 (IN-01)', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  const result = await silentRun(['publish', '7', '--stores=,,', '--confirm', ...API]);
  expect(result).toBe(2);
  expect(requests.length).toBe(0);
});

test('publish missing --stores returns 2', async () => {
  stubToken();
  const result = await silentRun(['publish', '7', ...API]);
  expect(result).toBe(2);
});

test('publish missing id returns 2', async () => {
  stubToken();
  const result = await silentRun(['publish', ...API]);
  expect(result).toBe(2);
});

// --- resubmit (POST -> 200, confirm-gated, no body) -----------------------

test('resubmit without --confirm issues NO write and returns 3', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: { status: 'in_review' } } });
  const { result } = await captureLog(() => run(['resubmit', '7', ...API]));
  expect(result).toBe(3);
  expect(requests.length).toBe(0); // T-01-13
});

test('resubmit preview mentions the Apple credential requirement', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: { status: 'in_review' } } });
  const { lines } = await captureLog(() => run(['resubmit', '7', ...API]));
  expect(lines.join('\n')).toMatch(/Apple Developer credential/i);
});

test('resubmit with --confirm POSTs /resubmit with no body and returns 0', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: { status: 'in_review' } } });
  const { result } = await captureLog(() => run(['resubmit', '7', '--confirm', ...API]));
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.method).toBe('POST');
  expect(req.path).toMatch(/\/api\/v1\/apps\/7\/resubmit$/);
  expect(req.body).toBe(null); // no body sent
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
  expect(result).toBe(1);
  const out = lines.join('\n');
  expect(out).toMatch(/Blocked/);
  expect(out).toMatch(/https:\/\/dash\.example\/connect/);
});

test('resubmit missing id returns 2', async () => {
  stubToken();
  const result = await silentRun(['resubmit', ...API]);
  expect(result).toBe(2);
});

// --- push (POST -> 201 with recipients_count, confirm-gated) --------------

test('push without --confirm issues NO write and returns 3', async () => {
  stubToken();
  installMockFetch({ status: 201, body: { data: { id: 1 }, recipients_count: 42 } });
  const { result } = await captureLog(() =>
    run(['push', '7', '--title', 'Hi', '--body', 'There', ...API]),
  );
  expect(result).toBe(3);
  expect(requests.length).toBe(0); // T-01-13
});

test('push preview omits the recipient count (Pitfall 2)', async () => {
  stubToken();
  installMockFetch({ status: 201, body: { data: { id: 1 }, recipients_count: 42 } });
  const { lines } = await captureLog(() =>
    run(['push', '7', '--title', 'Hi', '--body', 'There', ...API]),
  );
  const out = lines.join('\n');
  expect(out).not.toMatch(/recipients_count/);
  expect(out).not.toMatch(/\b42\b/); // no audience-size leak pre-send
});

test('push with --confirm POSTs /push-notifications body {title,body} and returns 0', async () => {
  stubToken();
  installMockFetch({ status: 201, body: { data: { id: 1 }, recipients_count: 42 } });
  const { result } = await captureLog(() =>
    run(['push', '7', '--title', 'Hi', '--body', 'There', '--confirm', ...API]),
  );
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.method).toBe('POST');
  expect(req.path).toMatch(/\/api\/v1\/apps\/7\/push-notifications$/);
  expect(req.body).toEqual({ title: 'Hi', body: 'There' });
});

test('push includes optional fields in the body when supplied', async () => {
  stubToken();
  installMockFetch({ status: 201, body: { data: { id: 1 }, recipients_count: 1 } });
  await captureLog(() =>
    run([
      'push', '7', '--title', 'Hi', '--body', 'There',
      '--target-url', 'https://x', '--image-path', '/p.png', '--scheduled-at', '2026-07-01T10:00:00Z',
      '--confirm', ...API,
    ]),
  );
  const req = lastRequest();
  expect(req.body).toEqual({
    title: 'Hi',
    body: 'There',
    target_url: 'https://x',
    image_path: '/p.png',
    scheduled_at: '2026-07-01T10:00:00Z',
  });
});

test('push human render reads recipients_count off the envelope sibling', async () => {
  stubToken();
  installMockFetch({ status: 201, body: { data: { id: 1 }, recipients_count: 42 } });
  const { lines } = await captureLog(() =>
    run(['push', '7', '--title', 'Hi', '--body', 'There', '--confirm', ...API]),
  );
  expect(lines.join('\n')).toMatch(/Sent to 42 device\(s\)\./);
});

test('push --confirm --json prints the full 201 envelope verbatim', async () => {
  stubToken();
  const body = { data: { id: 1, title: 'Hi' }, recipients_count: 42 };
  installMockFetch({ status: 201, body });
  const { result, lines } = await captureLog(() =>
    run(['push', '7', '--title', 'Hi', '--body', 'There', '--confirm', '--json', ...API]),
  );
  expect(result).toBe(0);
  expect(JSON.parse(lines.join(''))).toEqual(body);
});

// WR-02: a value beginning with `--` must be representable, not swallowed as a
// flag. The `--key=value` form escapes it inline.
test('push --body=--value sends a body that begins with -- (WR-02 key=value)', async () => {
  stubToken();
  installMockFetch({ status: 201, body: { data: { id: 1 }, recipients_count: 1 } });
  await captureLog(() =>
    run(['push', '7', '--title', 'Hi', '--body=--see attached', '--confirm', ...API]),
  );
  const req = lastRequest();
  expect(req.body).toEqual({ title: 'Hi', body: '--see attached' });
});

// WR-02: the `--` sentinel ends option parsing; later tokens are positional.
test('-- sentinel ends option parsing (WR-02)', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: { id: 7 } } });
  await captureLog(() => run(['status', ...API, '--', '7']));
  const req = lastRequest();
  expect(req.path).toMatch(/\/api\/v1\/apps\/7$/);
});

// IN-02: a 2xx with no recipients_count must not throw — report 0.
test('push with an empty 2xx body reports 0 device(s) without throwing (IN-02)', async () => {
  stubToken();
  installMockFetch({ status: 201, body: null });
  const { result, lines } = await captureLog(() =>
    run(['push', '7', '--title', 'Hi', '--body', 'There', '--confirm', ...API]),
  );
  expect(result).toBe(0);
  expect(lines.join('\n')).toMatch(/Sent to 0 device\(s\)\./);
});

test('push missing --title returns 2', async () => {
  stubToken();
  const result = await silentRun(['push', '7', '--body', 'There', ...API]);
  expect(result).toBe(2);
});

test('push missing --body returns 2', async () => {
  stubToken();
  const result = await silentRun(['push', '7', '--title', 'Hi', ...API]);
  expect(result).toBe(2);
});
