import { test, afterEach, expect } from 'vitest';
import { run } from '../../src/cli.mjs';
import {
  installMockFetch,
  resetMockFetch,
  lastRequest,
  requests,
  stubToken,
} from '../helpers/mockFetch.mjs';
import { clearConfig } from '../../src/config.mjs';

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


// 12. Regression: with a stored token, new still hits /api/v1/apps (authenticated path unchanged).
test('new --url with a stored token still hits /api/v1/apps (authenticated path unchanged)', async () => {
  stubToken();
  installMockFetch([
    { status: 201, body: { data: { id: 5, name: 'X', base_url: 'https://x.com' } } },
  ]);
  await captureLog(() => run(['new', '--url', 'https://x.com', '--name', 'X', ...API]));
  expect(lastRequest().path).toMatch(/\/api\/v1\/apps$/);
});

// No stored token: creation now requires an account. The anonymous
// /anonymous/create trial was removed server-side (247), so `new` with no token
// (non-interactive) errors before any HTTP and hits no create endpoint.
test('new with no token errors out and makes no request', async () => {
  clearConfig();
  installMockFetch([]);
  const { result, lines } = await captureAll(() =>
    run(['new', '--url', 'x.com', ...API]));
  expect(result).toBe(1);
  expect(lines.join('\n')).toMatch(/Not authenticated/i);
  expect(requests.length).toBe(0);
});
