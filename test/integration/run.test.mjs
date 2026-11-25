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

// --- run: the one-link verb (D-13) -------------------------------------------

const READY_PREVIEW = {
  android: { state: 'ready' },
  ios: { mode: 'appo', state: 'ready' },
  ios_testflight_url: null,
  android_deeplink: null,
  preview_url: 'https://app.appo.io/preview/tok',
  preview_ready: { ios: false, android: true },
  try: {
    state: 'ready',
    message_code: 'ready_iphone_soon',
    message: 'Ready on Android. iPhone testing is being set up.',
    preview_url: 'https://app.appo.io/preview/tok',
    how_to_open: 'Open the link on your phone.',
    options: [],
  },
};

const PREPARING_PREVIEW = {
  preview_url: 'https://app.appo.io/preview/tok',
  preview_ready: { ios: false, android: false },
  try: {
    state: 'preparing',
    message_code: 'preparing',
    message: 'Appo is adapting the site to the app.',
    preview_url: null,
    how_to_open: null,
    options: [{ action: 'wait', description: 'Wait for the adaptation to finish.', tool: 'get_app_overview' }],
    recheck_after_minutes: 360,
  },
};

const startBody = (tryBlock) => ({ data: { id: 7, decision: null, try: tryBlock } });

test('run <id> is the hidden alias of start: one POST to /start, link and how-to-open, no QR without a terminal', async () => {
  stubToken();
  installMockFetch({ status: 200, body: startBody(READY_PREVIEW.try) });
  const { result, lines } = await captureLog(() => run(['run', '7', ...API]));
  expect(result).toBe(0);
  expect(requests.length).toBe(1);
  expect(requests[0].method).toBe('POST');
  expect(requests[0].path).toMatch(/\/api\/v1\/apps\/7\/start$/);
  const out = lines.join('\n');
  expect(out).toContain('Ready on Android. iPhone testing is being set up.');
  expect(out).toContain('https://app.appo.io/preview/tok');
  expect(out).toContain('Open the link on your phone.');
  expect(out).not.toMatch(/[▀▄█]/);
  expect(out).not.toMatch(/^\s*(ios|android)\b/m);
});

test('install <id> while preparing prints the message and when to check again, no QR, exit 0', async () => {
  stubToken();
  installMockFetch({ status: 200, body: startBody(PREPARING_PREVIEW.try) });
  const { result, lines } = await captureLog(() => run(['install', '7', ...API]));
  expect(result).toBe(0);
  const out = lines.join('\n');
  expect(out).toContain('Appo is adapting the site to the app.');
  expect(out).not.toContain('get_app_overview');
  expect(out).not.toMatch(/[▀▄█]/);
});

test('install <id> strips control characters from server text', async () => {
  stubToken();
  const tryBlock = structuredClone(PREPARING_PREVIEW.try);
  tryBlock.message = 'Hello\x1b[31m red';
  installMockFetch({ status: 200, body: startBody(tryBlock) });
  const { lines } = await captureLog(() => run(['install', '7', ...API]));
  const out = lines.join('\n');
  expect(out).toContain('Hello[31m red');
  // eslint-disable-next-line no-control-regex
  expect(out).not.toMatch(/\x1b\[31m|\x07/);
});

test('run <id> --json prints the start body', async () => {
  stubToken();
  const body = startBody(READY_PREVIEW.try);
  installMockFetch({ status: 200, body });
  const { result, lines } = await captureLog(() => run(['run', '7', '--json', ...API]));
  expect(result).toBe(0);
  expect(JSON.parse(lines.join(''))).toEqual(body);
});

test('run <id> on a 404 goes through the existing error path, returns 1', async () => {
  stubToken();
  installMockFetch({ status: 404, body: { error: 'not_found', code: 'resource_not_found', message: 'The requested resource was not found.' } });
  const { result } = await captureAll(() => run(['run', '7', ...API]));
  expect(result).toBe(1);
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

test('devices register hint says "appo install", never "appo preview"', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: { url: 'http://test.local/device-register/enroll?sig=x' }, message: 'OK' } });
  const { lines } = await captureLog(() => run(['devices', 'register', ...API]));
  const out = lines.join('\n');
  expect(out).toContain('appo install <id>');
  expect(out).not.toContain('appo preview');
});

test('ship success line says "phone: appo install", never "appo preview"', async () => {
  stubToken();
  installMockFetch([{ status: 204 }]); // publishApp only
  const { lines } = await captureLog(() => run(['ship', '5', '--yes', ...API]));
  const out = lines.join('\n');
  expect(out).toContain('appo install 5');
  expect(out).not.toContain('appo preview');
});
