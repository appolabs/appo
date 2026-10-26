import { test, afterEach, expect } from 'vitest';
import { run } from '../../src/cli.mjs';
import {
  installMockFetch,
  resetMockFetch,
  lastRequest,
  requests,
} from '../helpers/mockFetch.mjs';
import { stubToken } from '../helpers/mockFetch.mjs';

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
  expect(req.method).toBe('GET');
  expect(req.path).toMatch(/\/api\/v1\/apps\/7$/);
});

test('status overview returns 0', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: { id: 7, primary_action: 'publish' } } });
  const { result } = await captureLog(() => run(['status', '7', ...API]));
  expect(result).toBe(0);
});

test('status renders try options as plain lines, without tool names', async () => {
  stubToken();
  installMockFetch({
    status: 200,
    body: {
      data: {
        id: 7,
        preparation: {
          mode: 'appo_managed',
          status: 'in_progress',
        },
        try: {
          state: 'preparing',
          message: 'Appo is preparing the app.',
          options: [
            { action: 'wait', description: 'Wait for Appo to finish preparing the app.', tool: 'preview_app' },
            {
              action: 'self_prepare',
              description: 'Prepare the app yourself and try it now.',
              tool: 'configure_app',
              arguments: { prep_mode: 'self_managed' },
            },
            { action: 'malformed', tool: 'preview_app' },
          ],
        },
      },
    },
  });
  const { lines } = await captureLog(() => run(['status', '7', ...API]));
  const prep = lines.findIndex((l) => /preparation\s+appo_managed \(in_progress\)/.test(l));
  expect(prep).toBeGreaterThan(-1);
  expect(lines[prep + 1]).toMatch(/try\s+Appo is preparing the app\.$/);
  expect(lines[prep + 2]).toMatch(/^\s+- Wait for Appo to finish preparing the app\.$/);
  expect(lines[prep + 3]).toMatch(/^\s+- Prepare the app yourself and try it now\.$/);
  const out = lines.join('\n');
  expect(out).not.toMatch(/preview_app|configure_app|undefined/);
});

test('status without preparation options prints only the preparation line', async () => {
  stubToken();
  installMockFetch({
    status: 200,
    body: { data: { id: 7, preparation: { mode: 'self_managed', status: 'completed' } } },
  });
  const { lines } = await captureLog(() => run(['status', '7', ...API]));
  expect(lines.some((l) => /preparation\s+self_managed \(completed\)/.test(l))).toBe(true);
  expect(lines.some((l) => /^\s+- /.test(l))).toBe(false);
});

const demoStatus = async (demo_account) => {
  stubToken();
  installMockFetch({ status: 200, body: { data: { id: 7, demo_account } } });
  return (await captureLog(() => run(['status', '7', ...API]))).lines.join('\n');
};

test('status prints the demo_account line when needed and not provided', async () => {
  const out = await demoStatus({ needed: true, provided: false, url: 'http://x.test/apps/7' });
  expect(out).toMatch(/demo_account\s+needed, not provided: http:\/\/x\.test\/apps\/7/);
});

test('status prints provided when provided, needed or not', async () => {
  for (const needed of [false, true]) {
    const out = await demoStatus({ needed, provided: true, url: 'http://x.test/apps/7' });
    expect(out).toMatch(/demo_account\s+provided: http:\/\/x\.test\/apps\/7/);
    expect(out).not.toMatch(/not provided/);
    resetMockFetch();
  }
});

test('status prints no demo_account line when neither or absent', async () => {
  expect(await demoStatus({ needed: false, provided: false, url: null })).not.toMatch(/demo_account/);
  resetMockFetch();
  expect(await demoStatus(undefined)).not.toMatch(/demo_account/);
});

test('status --json keeps the demo_account envelope verbatim', async () => {
  stubToken();
  const body = { data: { id: 7, demo_account: { needed: true, provided: false, url: 'u' } } };
  installMockFetch({ status: 200, body });
  const { lines } = await captureLog(() => run(['status', '7', '--json', ...API]));
  expect(JSON.parse(lines.join(''))).toEqual(body);
});

test('status --build hits GET /api/v1/apps/{id}/builds/{buildId}', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: { id: 42, platform: 'ios', status: 'ready' } } });
  await captureLog(() => run(['status', '7', '--build', '42', ...API]));
  const req = lastRequest();
  expect(req.method).toBe('GET');
  expect(req.path).toMatch(/\/api\/v1\/apps\/7\/builds\/42$/);
});

test('status --json prints the stubbed body verbatim', async () => {
  stubToken();
  const body = { data: { id: 7, primary_action: 'publish' } };
  installMockFetch({ status: 200, body });
  const { result, lines } = await captureLog(() => run(['status', '7', '--json', ...API]));
  expect(result).toBe(0);
  expect(JSON.parse(lines.join(''))).toEqual(body);
});

test('status missing id returns 2', async () => {
  stubToken();
  const original = console.error;
  console.error = () => {};
  try {
    const result = await run(['status', ...API]);
    expect(result).toBe(2);
  } finally {
    console.error = original;
  }
});

// --- rejection ------------------------------------------------------------

test('rejection hits GET /api/v1/apps/{id}/rejection and returns 0', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: { status: 'rejected', required_action: 'fix metadata' } } });
  const { result } = await captureLog(() => run(['rejection', '7', ...API]));
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.method).toBe('GET');
  expect(req.path).toMatch(/\/api\/v1\/apps\/7\/rejection$/);
});

test('rejection 404 in human mode prints "No active rejection" and returns 1', async () => {
  stubToken();
  installMockFetch({ status: 404, body: { error: 'not_found', code: 'resource_not_found', message: 'Not found' } });
  const { result, lines } = await captureLog(() => run(['rejection', '7', ...API]));
  expect(result).toBe(1);
  expect(lines.join('\n')).toMatch(/No active rejection/);
});

test('rejection 404 with --json does NOT print "No active rejection" (envelope preserved)', async () => {
  stubToken();
  const env = { error: 'not_found', code: 'resource_not_found', message: 'Not found' };
  installMockFetch({ status: 404, body: env });
  const { result, lines } = await captureLog(() => run(['rejection', '7', '--json', ...API]));
  expect(result).toBe(1);
  const out = lines.join('\n');
  expect(out).not.toMatch(/No active rejection/);
  expect(JSON.parse(out)).toEqual(env);
});

// IN-04: a non-404 error under --json must still emit the raw envelope verbatim
// (D-08), not fall through to the human renderError line.
test('rejection 500 with --json emits the envelope verbatim and returns 1 (IN-04)', async () => {
  stubToken();
  const env = { error: 'server_error', code: 'internal', message: 'boom' };
  installMockFetch({ status: 500, body: env });
  const { result, lines } = await captureLog(() => run(['rejection', '7', '--json', ...API]));
  expect(result).toBe(1);
  expect(JSON.parse(lines.join(''))).toEqual(env);
});

test('rejection missing id returns 2', async () => {
  stubToken();
  const original = console.error;
  console.error = () => {};
  try {
    const result = await run(['rejection', ...API]);
    expect(result).toBe(2);
  } finally {
    console.error = original;
  }
});

// --- run: GET /preview and render the try block (detail in run.test.mjs) ---

const TRY_READY_BODY = {
  preview_url: 'https://app.appo.io/preview/tok',
  preview_ready: { ios: false, android: true },
  try: {
    state: 'ready',
    message_code: 'ready',
    message: 'Ready to try.',
    preview_url: 'https://app.appo.io/preview/tok',
    how_to_open: 'Open the link on your phone.',
    options: [],
  },
};

test('run hits GET /api/v1/apps/7/preview, returns 0', async () => {
  stubToken();
  installMockFetch({ status: 200, body: TRY_READY_BODY });
  const { result } = await captureLog(() => run(['run', '7', ...API]));
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.method).toBe('GET');
  expect(req.path).toMatch(/\/api\/v1\/apps\/7\/preview$/);
});

test('run 404 returns 1 (renderError)', async () => {
  stubToken();
  installMockFetch({
    status: 404,
    body: { error: 'not_found', code: 'resource_not_found', message: 'The requested resource was not found.' },
  });
  const originalErr = console.error;
  console.error = () => {};
  try {
    const result = await run(['run', '7', ...API]);
    expect(result).toBe(1);
  } finally {
    console.error = originalErr;
  }
});

// --- status: the try block is the readiness answer (D-04) -------------------

const SHOW_PREPARING = {
  data: {
    id: 7, name: 'Shop', base_url: 'https://shop.example',
    preparation: { mode: 'appo_managed', status: 'pending', options: [{ action: 'x', description: 'OLD OPTION LINE' }] },
    try: {
      state: 'preparing', message_code: 'preparing', message: 'Appo is adapting the site.',
      preview_url: null, how_to_open: null,
      options: [{ action: 'wait', description: 'Wait for it to finish.', tool: 'get_app_overview' }],
      recheck_after_minutes: 360,
    },
  },
};

test('status while preparing prints the try message, option descriptions and recheck line; no /preview request', async () => {
  stubToken();
  installMockFetch({ status: 200, body: SHOW_PREPARING });
  const { result, lines } = await captureLog(() => run(['status', '7', ...API]));
  expect(result).toBe(0);
  expect(requests.length).toBe(1);
  const out = lines.join('\n');
  expect(out).toContain('Appo is adapting the site.');
  expect(out).toContain('Wait for it to finish.');
  expect(out).toContain('check again in about 6 hours');
  expect(out).toContain('appo_managed (pending)');
  expect(out).not.toContain('OLD OPTION LINE');
  expect(out).not.toMatch(/[▀▄█]/);
});

test('status when ready fetches /preview and prints its try.preview_url, no QR', async () => {
  stubToken();
  installMockFetch([
    { status: 200, body: { data: { id: 7, name: 'Shop', try: { state: 'ready', message_code: 'ready_iphone_soon', message: 'Ready on Android; iPhone is being set up.', preview_url: null, how_to_open: null, options: [] } } } },
    { status: 200, body: TRY_READY_BODY },
  ]);
  const { result, lines } = await captureLog(() => run(['status', '7', ...API]));
  expect(result).toBe(0);
  expect(requests.length).toBe(2);
  expect(requests[1].method).toBe('GET');
  expect(requests[1].path).toMatch(/\/api\/v1\/apps\/7\/preview$/);
  const out = lines.join('\n');
  expect(out).toContain('Ready on Android; iPhone is being set up.');
  expect(out).toContain('https://app.appo.io/preview/tok');
  expect(out).not.toMatch(/[▀▄█]/);
});

test('status --json passes the payload through verbatim with a single request', async () => {
  stubToken();
  installMockFetch({ status: 200, body: SHOW_PREPARING });
  const { lines } = await captureLog(() => run(['status', '7', '--json', ...API]));
  expect(requests.length).toBe(1);
  expect(JSON.parse(lines.join(''))).toEqual(SHOW_PREPARING);
});

// --- run without id: app resolution ----------------------------------------

const RESOLVED_PREVIEW_BODY = {
  ios_testflight_url: null,
  android_deeplink: 'appo://preview?token=t',
  preview_url: 'https://app.appo.io/preview/tok',
  preview_ready: { ios: false, android: true },
  try: TRY_READY_BODY.try,
};

test('run with no id and a single app resolves it and hits its preview', async () => {
  stubToken();
  installMockFetch([
    { status: 200, body: { data: [{ id: 7, name: 'Shop', base_url: 'https://shop.example' }] } },
    { status: 200, body: RESOLVED_PREVIEW_BODY },
  ]);
  const { result, lines } = await captureLog(() => run(['run', ...API]));
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.method).toBe('GET');
  expect(req.path).toMatch(/\/api\/v1\/apps\/7\/preview$/);
  expect(lines.join('\n')).toContain('Using Shop (id 7)');
});

test('run with no id and no apps exits 1 with the create hint', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: [] } });
  const errors = [];
  const originalErr = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  let result;
  try {
    result = await run(['run', ...API]);
  } finally {
    console.error = originalErr;
  }
  expect(result).toBe(1);
  expect(errors.join('\n')).toContain('appo new --url');
});

test('run with no id and several apps (non-TTY) exits 2 listing them', async () => {
  stubToken();
  installMockFetch({
    status: 200,
    body: {
      data: [
        { id: 7, name: 'Shop', base_url: 'https://shop.example' },
        { id: 9, name: 'Blog', base_url: 'https://blog.example' },
      ],
    },
  });
  const errors = [];
  const originalErr = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  let result;
  try {
    result = await run(['run', ...API]);
  } finally {
    console.error = originalErr;
  }
  expect(result).toBe(2);
  const out = errors.join('\n');
  expect(out).toContain('appo run <id>');
  expect(out).not.toContain('appo preview');
  expect(out).toContain('Shop');
  expect(out).toContain('Blog');
});

// --- fix-recipe -----------------------------------------------------------

test('fix-recipe hits GET /api/v1/apps/{id}/rejection/recipe and returns 0', async () => {
  stubToken();
  installMockFetch({
    status: 200,
    body: { data: [{ slug: 'metadata-2-3-1', fix_type: 'manual', agent_steps: ['edit'], limitations: [] }] },
  });
  const { result } = await captureLog(() => run(['fix-recipe', '7', ...API]));
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.method).toBe('GET');
  expect(req.path).toMatch(/\/api\/v1\/apps\/7\/rejection\/recipe$/);
});

test('fix-recipe 404 in human mode reads as "No active rejection" and returns 1', async () => {
  stubToken();
  installMockFetch({ status: 404, body: { error: 'not_found', code: 'resource_not_found', message: 'Not found' } });
  const { result, lines } = await captureLog(() => run(['fix-recipe', '7', ...API]));
  expect(result).toBe(1);
  expect(lines.join('\n')).toMatch(/No active rejection/);
});

// IN-04: same envelope-passthrough guarantee for fix-recipe under --json.
test('fix-recipe 500 with --json emits the envelope verbatim and returns 1 (IN-04)', async () => {
  stubToken();
  const env = { error: 'server_error', code: 'internal', message: 'boom' };
  installMockFetch({ status: 500, body: env });
  const { result, lines } = await captureLog(() => run(['fix-recipe', '7', '--json', ...API]));
  expect(result).toBe(1);
  expect(JSON.parse(lines.join(''))).toEqual(env);
});

test('fix-recipe missing id returns 2', async () => {
  stubToken();
  const original = console.error;
  console.error = () => {};
  try {
    const result = await run(['fix-recipe', ...API]);
    expect(result).toBe(2);
  } finally {
    console.error = original;
  }
});
