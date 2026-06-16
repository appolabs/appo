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

test('apps update maps --url and --meta-name to v1 body fields', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  await captureLog(() => run(['apps', 'update', '7', '--url', 'https://x', '--meta-name', 'Store Name', ...API]));
  const req = lastRequest();
  expect(req.body).toEqual({ base_url: 'https://x', metadata_name: 'Store Name' });
});

test('apps update maps --meta-desc to metadata_description', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  await captureLog(() => run(['apps', 'update', '7', '--meta-desc', 'A great app', ...API]));
  const req = lastRequest();
  expect(req.body).toEqual({ metadata_description: 'A great app' });
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
