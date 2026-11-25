import { test, describe, afterEach, expect } from 'vitest';
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

test('publish against a 200 body with demo_account succeeds like the 204 did', async () => {
  stubToken();
  const body = { data: { demo_account: { needed: true, provided: false, url: 'u' } } };
  installMockFetch({ status: 200, body });
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

test('publish without --stores defaults to both stores and gates (exit 3, no write)', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  const { result } = await captureLog(() => run(['publish', '7', ...API]));
  expect(result).toBe(3);
  expect(requests.length).toBe(0); // gate before any POST
});

test('publish --confirm without --stores POSTs both canonical stores', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  const { result } = await captureLog(() => run(['publish', '7', '--confirm', ...API]));
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.body).toEqual({ app_stores: ['apple_appstore', 'google_playstore'] });
});

test('publish missing id returns 2', async () => {
  stubToken();
  const result = await silentRun(['publish', ...API]);
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

// --- apps remove (DELETE, server-side dry run) -----------------------------

describe('apps remove', () => {
  const dryRun = { will: 'delete', app: 7, name: 'Shop', confirm_required: true, note: 'This removes Shop for good.' };
  const removed = { deleted: true, app: 7, name: 'Shop', message: 'Shop was removed.' };

  test('without --confirm sends one DELETE without a query and exits 3', async () => {
    stubToken();
    installMockFetch({ status: 200, body: dryRun });
    const { result, lines } = await captureLog(() => run(['apps', 'remove', '7', ...API]));
    expect(result).toBe(3);
    expect(requests.length).toBe(1);
    expect(lastRequest().method).toBe('DELETE');
    expect(lastRequest().url.endsWith('/api/v1/apps/7')).toBe(true);
    expect(lines.join('\n')).toContain('This removes Shop for good.');
    expect(lines).toContain('Add --confirm to remove it.');
  });

  test('with --confirm sends ?confirm=1, prints the message, exits 0', async () => {
    stubToken();
    installMockFetch({ status: 200, body: removed });
    const { result, lines } = await captureLog(() => run(['apps', 'remove', '7', '--confirm', ...API]));
    expect(result).toBe(0);
    expect(requests.length).toBe(1);
    expect(lastRequest().url.endsWith('/api/v1/apps/7?confirm=1')).toBe(true);
    expect(lines.join('\n')).toContain('Shop was removed.');
  });

  test('--json dry run prints the body and exits 3', async () => {
    stubToken();
    installMockFetch({ status: 200, body: dryRun });
    const { result, lines } = await captureLog(() => run(['apps', 'remove', '7', '--json', ...API]));
    expect(result).toBe(3);
    expect(JSON.parse(lines.join('\n'))).toEqual(dryRun);
  });

  test('--json --confirm prints the body and exits 0', async () => {
    stubToken();
    installMockFetch({ status: 200, body: removed });
    const { result, lines } = await captureLog(() => run(['apps', 'remove', '7', '--json', '--confirm', ...API]));
    expect(result).toBe(0);
    expect(JSON.parse(lines.join('\n'))).toEqual(removed);
  });

  test('refused removal prints Blocked and Next, exits 1, no second request', async () => {
    stubToken();
    installMockFetch({
      status: 422,
      body: {
        error: 'prerequisite_failed',
        code: 'app_published',
        message: 'The app is published.',
        details: { next_action: 'Contact support', dashboard_url: 'https://example.test/apps/7' },
      },
    });
    const original = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args.join(' '));
    let result;
    try {
      result = await run(['apps', 'remove', '7', '--confirm', ...API]);
    } finally {
      console.error = original;
    }
    expect(result).toBe(1);
    expect(requests.length).toBe(1);
    const out = errors.join('\n');
    expect(out).toContain('Blocked: The app is published.');
    expect(out).toContain('Next: Contact support -> https://example.test/apps/7');
  });

  test('404 exits 1', async () => {
    stubToken();
    installMockFetch({ status: 404, body: { message: 'Not found' } });
    expect(await silentRun(['apps', 'remove', '99', '--confirm', ...API])).toBe(1);
  });

  test('missing id without a terminal exits 2 with usage', async () => {
    stubToken();
    installMockFetch({ status: 200, body: dryRun });
    const original = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args.join(' '));
    let result;
    try {
      result = await run(['apps', 'remove', ...API]);
    } finally {
      console.error = original;
    }
    expect(result).toBe(2);
    expect(errors.join('\n')).toContain('Usage: appo apps remove <id> [--confirm]');
    expect(requests.length).toBe(0);
  });
});
