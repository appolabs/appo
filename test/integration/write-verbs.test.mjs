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

// --- build ----------------------------------------------------------------

test('build default POSTs /api/v1/apps/{id}/builds with body {} and returns 0', async () => {
  stubToken();
  installMockFetch({ status: 202, body: { data: { id: 9, platform: 'all' } } });
  const { result } = await captureLog(() => run(['build', '7', ...API]));
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.method).toBe('POST');
  expect(req.path).toMatch(/\/api\/v1\/apps\/7\/builds$/);
  expect(req.body).toEqual({});
});

test('build issues exactly one request — never waits (D-03)', async () => {
  stubToken();
  installMockFetch({ status: 202, body: { data: { id: 9, platform: 'all' } } });
  await captureLog(() => run(['build', '7', ...API]));
  expect(requests.length).toBe(1);
});

test('build with flags POSTs body { platform, branch }', async () => {
  stubToken();
  installMockFetch({ status: 202, body: { data: { id: 9, platform: 'ios' } } });
  await captureLog(() => run(['build', '7', '--platform', 'ios', '--branch', 'main', ...API]));
  const req = lastRequest();
  expect(req.body).toEqual({ platform: 'ios', branch: 'main' });
});

test('build --json prints the stubbed 202 body verbatim and returns 0', async () => {
  stubToken();
  const body = { data: { id: 9, platform: 'all' } };
  installMockFetch({ status: 202, body });
  const { result, lines } = await captureLog(() => run(['build', '7', '--json', ...API]));
  expect(result).toBe(0);
  expect(JSON.parse(lines.join(''))).toEqual(body);
});

test('build prints the build id + poll hint in human mode', async () => {
  stubToken();
  installMockFetch({ status: 202, body: { data: { id: 9, platform: 'all' } } });
  const { lines } = await captureLog(() => run(['build', '7', ...API]));
  const out = lines.join('\n');
  expect(out).toMatch(/Build #9/);
  expect(out).toMatch(/Poll: appo status 7 --build 9/);
});

test('build prerequisite_failed (APP_BLOCKED) returns 1', async () => {
  stubToken();
  installMockFetch({
    status: 422,
    body: {
      error: 'prerequisite_failed',
      code: 'APP_BLOCKED',
      message: 'App is blocked',
      details: { next_action: 'contact_support', dashboard_url: 'https://x' },
    },
  });
  const original = console.error;
  console.error = () => {};
  try {
    const result = await run(['build', '7', ...API]);
    expect(result).toBe(1);
  } finally {
    console.error = original;
  }
});

// IN-02: a 2xx with an empty/unexpected body must not throw a TypeError.
test('build with an empty 2xx body returns 0 without throwing (IN-02)', async () => {
  stubToken();
  installMockFetch({ status: 202, body: null });
  const { result, lines } = await captureLog(() => run(['build', '7', ...API]));
  expect(result).toBe(0);
  expect(lines.join('\n')).toMatch(/Build #undefined started/);
});

test('build missing id returns 2', async () => {
  stubToken();
  const result = await silentRun(['build', ...API]);
  expect(result).toBe(2);
});

// --- configure ------------------------------------------------------------

test('configure PATCHes /api/v1/apps/{id} with only supplied fields and returns 0', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  const { result, lines } = await captureLog(() => run(['configure', '7', '--name', 'New', ...API]));
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.method).toBe('PATCH');
  expect(req.path).toMatch(/\/api\/v1\/apps\/7$/);
  expect(req.body).toEqual({ name: 'New' });
  expect(lines.join('\n')).toMatch(/Updated app 7\./);
});

test('configure maps --url and --injected-js to v1 body fields', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  await captureLog(() => run(['configure', '7', '--url', 'https://x', '--injected-js', 'x()', ...API]));
  const req = lastRequest();
  expect(req.body).toEqual({ base_url: 'https://x', injected_javascript: 'x()' });
});

test('configure maps --injected-css to injected_css', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  await captureLog(() => run(['configure', '7', '--injected-css', 'body{}', ...API]));
  const req = lastRequest();
  expect(req.body).toEqual({ injected_css: 'body{}' });
});

test('configure --json on a 204 prints "null" and returns 0', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  const { result, lines } = await captureLog(() => run(['configure', '7', '--name', 'New', '--json', ...API]));
  expect(result).toBe(0);
  expect(lines.join('').trim()).toBe('null');
});

test('configure with no recognized flag returns 2 (no write)', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  const result = await silentRun(['configure', '7', ...API]);
  expect(result).toBe(2);
  expect(requests.length).toBe(0);
});

test('configure missing id returns 2', async () => {
  stubToken();
  const result = await silentRun(['configure', ...API]);
  expect(result).toBe(2);
});
