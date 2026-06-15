import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/cli.mjs';
import {
  installMockFetch,
  resetMockFetch,
  lastRequest,
} from './helpers/mockFetch.mjs';
import { stubToken } from './helpers/mockFetch.mjs';

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

afterEach(() => resetMockFetch());

const API = ['--api', 'http://test.local'];

// --- status ---------------------------------------------------------------

test('status overview hits GET /api/v1/apps/{id}', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: { id: 7, primary_action: 'publish' } } });
  await captureLog(() => run(['status', '7', ...API]));
  const req = lastRequest();
  assert.equal(req.method, 'GET');
  assert.match(req.path, /\/api\/v1\/apps\/7$/);
});

test('status overview returns 0', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: { id: 7, primary_action: 'publish' } } });
  const { result } = await captureLog(() => run(['status', '7', ...API]));
  assert.equal(result, 0);
});

test('status --build hits GET /api/v1/apps/{id}/builds/{buildId}', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: { id: 42, platform: 'ios', status: 'ready' } } });
  await captureLog(() => run(['status', '7', '--build', '42', ...API]));
  const req = lastRequest();
  assert.equal(req.method, 'GET');
  assert.match(req.path, /\/api\/v1\/apps\/7\/builds\/42$/);
});

test('status --json prints the stubbed body verbatim', async () => {
  stubToken();
  const body = { data: { id: 7, primary_action: 'publish' } };
  installMockFetch({ status: 200, body });
  const { result, lines } = await captureLog(() => run(['status', '7', '--json', ...API]));
  assert.equal(result, 0);
  assert.deepEqual(JSON.parse(lines.join('')), body);
});

test('status missing id returns 2', async () => {
  stubToken();
  const original = console.error;
  console.error = () => {};
  try {
    const result = await run(['status', ...API]);
    assert.equal(result, 2);
  } finally {
    console.error = original;
  }
});

// --- rejection ------------------------------------------------------------

test('rejection hits GET /api/v1/apps/{id}/rejection and returns 0', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: { status: 'rejected', required_action: 'fix metadata' } } });
  const { result } = await captureLog(() => run(['rejection', '7', ...API]));
  assert.equal(result, 0);
  const req = lastRequest();
  assert.equal(req.method, 'GET');
  assert.match(req.path, /\/api\/v1\/apps\/7\/rejection$/);
});

test('rejection 404 in human mode prints "No active rejection" and returns 1', async () => {
  stubToken();
  installMockFetch({ status: 404, body: { error: 'not_found', code: 'resource_not_found', message: 'Not found' } });
  const { result, lines } = await captureLog(() => run(['rejection', '7', ...API]));
  assert.equal(result, 1);
  assert.match(lines.join('\n'), /No active rejection/);
});

test('rejection 404 with --json does NOT print "No active rejection" (envelope preserved)', async () => {
  stubToken();
  const env = { error: 'not_found', code: 'resource_not_found', message: 'Not found' };
  installMockFetch({ status: 404, body: env });
  const { result, lines } = await captureLog(() => run(['rejection', '7', '--json', ...API]));
  assert.equal(result, 1);
  const out = lines.join('\n');
  assert.doesNotMatch(out, /No active rejection/);
  assert.deepEqual(JSON.parse(out), env);
});

// IN-04: a non-404 error under --json must still emit the raw envelope verbatim
// (D-08), not fall through to the human renderError line.
test('rejection 500 with --json emits the envelope verbatim and returns 1 (IN-04)', async () => {
  stubToken();
  const env = { error: 'server_error', code: 'internal', message: 'boom' };
  installMockFetch({ status: 500, body: env });
  const { result, lines } = await captureLog(() => run(['rejection', '7', '--json', ...API]));
  assert.equal(result, 1);
  assert.deepEqual(JSON.parse(lines.join('')), env);
});

test('rejection missing id returns 2', async () => {
  stubToken();
  const original = console.error;
  console.error = () => {};
  try {
    const result = await run(['rejection', ...API]);
    assert.equal(result, 2);
  } finally {
    console.error = original;
  }
});

// --- fix-recipe -----------------------------------------------------------

test('fix-recipe hits GET /api/v1/apps/{id}/rejection/recipe and returns 0', async () => {
  stubToken();
  installMockFetch({
    status: 200,
    body: { data: [{ slug: 'metadata-2-3-1', fix_type: 'manual', agent_steps: ['edit'], limitations: [] }] },
  });
  const { result } = await captureLog(() => run(['fix-recipe', '7', ...API]));
  assert.equal(result, 0);
  const req = lastRequest();
  assert.equal(req.method, 'GET');
  assert.match(req.path, /\/api\/v1\/apps\/7\/rejection\/recipe$/);
});

test('fix-recipe 404 in human mode reads as "No active rejection" and returns 1', async () => {
  stubToken();
  installMockFetch({ status: 404, body: { error: 'not_found', code: 'resource_not_found', message: 'Not found' } });
  const { result, lines } = await captureLog(() => run(['fix-recipe', '7', ...API]));
  assert.equal(result, 1);
  assert.match(lines.join('\n'), /No active rejection/);
});

// IN-04: same envelope-passthrough guarantee for fix-recipe under --json.
test('fix-recipe 500 with --json emits the envelope verbatim and returns 1 (IN-04)', async () => {
  stubToken();
  const env = { error: 'server_error', code: 'internal', message: 'boom' };
  installMockFetch({ status: 500, body: env });
  const { result, lines } = await captureLog(() => run(['fix-recipe', '7', '--json', ...API]));
  assert.equal(result, 1);
  assert.deepEqual(JSON.parse(lines.join('')), env);
});

test('fix-recipe missing id returns 2', async () => {
  stubToken();
  const original = console.error;
  console.error = () => {};
  try {
    const result = await run(['fix-recipe', ...API]);
    assert.equal(result, 2);
  } finally {
    console.error = original;
  }
});
