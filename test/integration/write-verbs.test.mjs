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

// Capture both stdout (console.log) and stderr (console.error) — the icon 422 path
// writes the surfaced message via renderError to stderr.
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

// --- apps update (merged configure + set-name) ----------------------------

test('apps update PATCHes /api/v1/apps/{id} with only supplied fields and returns 0', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  const { result, lines } = await captureLog(() => run(['apps', 'update', '7', '--name', 'New', ...API]));
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.method).toBe('PATCH');
  expect(req.path).toMatch(/\/api\/v1\/apps\/7$/);
  expect(req.body).toEqual({ name: 'New' });
  expect(lines.join('\n')).toMatch(/Updated app 7\./);
});

test('apps update --icon POSTs /icon with icon_url and reports it', async () => {
  stubToken();
  installMockFetch([{ status: 200, body: { icon_url: 'https://cdn/x.png' } }]);
  const { result, lines } = await captureLog(() =>
    run(['apps', 'update', '7', '--icon', 'https://src/x.png', ...API]));
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.method).toBe('POST');
  expect(req.path).toMatch(/\/api\/v1\/apps\/7\/icon$/);
  expect(req.body).toEqual({ icon_url: 'https://src/x.png' });
  expect(lines.join('\n')).toMatch(/cdn\/x\.png/);
});

test('apps update --icon 422 (SSRF reject) -> exit 1, surfaces the message', async () => {
  stubToken();
  installMockFetch([{ status: 422, body: { message: 'The icon URL must use https.', errors: { icon_url: ['The icon URL must use https.'] } } }]);
  const { result, lines } = await captureAll(() =>
    run(['apps', 'update', '7', '--icon', 'http://insecure/x.png', ...API]));
  expect(result).toBe(1);
  expect(lines.join('\n')).toMatch(/must use https/);
});

test('apps update --name --icon runs PATCH then POST /icon in order', async () => {
  stubToken();
  installMockFetch([
    { status: 204 },                                          // PATCH
    { status: 200, body: { icon_url: 'https://cdn/x.png' } }, // POST /icon
  ]);
  await captureLog(() => run(['apps', 'update', '7', '--name', 'New', '--icon', 'https://src/x.png', ...API]));
  expect(requests[0].method).toBe('PATCH');
  expect(requests[0].path).toMatch(/\/api\/v1\/apps\/7$/);
  expect(requests[1].method).toBe('POST');
  expect(requests[1].path).toMatch(/\/api\/v1\/apps\/7\/icon$/);
});

test('apps update --json on a 204 prints "null" and returns 0', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  const { result, lines } = await captureLog(() => run(['apps', 'update', '7', '--name', 'New', '--json', ...API]));
  expect(result).toBe(0);
  expect(lines.join('').trim()).toBe('null');
});

test('apps update with no recognized flag returns 2 (no write)', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  const result = await silentRun(['apps', 'update', '7', ...API]);
  expect(result).toBe(2);
  expect(requests.length).toBe(0);
});

test('apps update missing id returns 2', async () => {
  stubToken();
  const result = await silentRun(['apps', 'update', ...API]);
  expect(result).toBe(2);
});

// --- apps update --permission (native permission toggles) -----------------

test('apps update --permission camera=on PATCHes /permissions with { camera: true }', async () => {
  stubToken();
  installMockFetch([{ status: 200, body: { permissions: { camera: { enabled: true } } } }]);
  const { result, lines } = await captureLog(() =>
    run(['apps', 'update', '7', '--permission', 'camera=on', ...API]));
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.method).toBe('PATCH');
  expect(req.path).toMatch(/\/api\/v1\/apps\/7\/permissions$/);
  expect(req.body).toEqual({ camera: true });
  expect(lines.join('\n')).toMatch(/camera=on/);
});

test('apps update --permission is repeatable and merges into one body', async () => {
  stubToken();
  installMockFetch([{ status: 200, body: { permissions: {} } }]);
  const { result } = await captureLog(() =>
    run(['apps', 'update', '7', '--permission', 'camera=on', '--permission', 'nfc=off', ...API]));
  expect(result).toBe(0);
  expect(lastRequest().body).toEqual({ camera: true, nfc: false });
});

test('apps update --name --icon --permission runs PATCH, POST /icon, PATCH /permissions in order', async () => {
  stubToken();
  installMockFetch([
    { status: 204 },                                          // PATCH name/url
    { status: 200, body: { icon_url: 'https://cdn/x.png' } }, // POST /icon
    { status: 200, body: { permissions: {} } },               // PATCH /permissions
  ]);
  await captureLog(() =>
    run(['apps', 'update', '7', '--name', 'New', '--icon', 'https://src/x.png', '--permission', 'camera=on', ...API]));
  expect(requests[0].path).toMatch(/\/api\/v1\/apps\/7$/);
  expect(requests[1].path).toMatch(/\/api\/v1\/apps\/7\/icon$/);
  expect(requests[2].path).toMatch(/\/api\/v1\/apps\/7\/permissions$/);
  expect(requests[2].body).toEqual({ camera: true });
});

test('apps update --permission with an unknown name returns 2 (no write)', async () => {
  stubToken();
  installMockFetch({ status: 200 });
  const result = await silentRun(['apps', 'update', '7', '--permission', 'flashlight=on', ...API]);
  expect(result).toBe(2);
  expect(requests.length).toBe(0);
});

test('apps update --permission with a non on|off value returns 2 (no write)', async () => {
  stubToken();
  installMockFetch({ status: 200 });
  const result = await silentRun(['apps', 'update', '7', '--permission', 'camera=maybe', ...API]);
  expect(result).toBe(2);
  expect(requests.length).toBe(0);
});

test('apps update --permission --json prints the permissions envelope', async () => {
  stubToken();
  installMockFetch([{ status: 200, body: { permissions: { camera: { enabled: true } } } }]);
  const { result, lines } = await captureLog(() =>
    run(['apps', 'update', '7', '--permission', 'camera=on', '--json', ...API]));
  expect(result).toBe(0);
  expect(JSON.parse(lines.join('').trim()).permissions).toEqual({ camera: { enabled: true } });
});
