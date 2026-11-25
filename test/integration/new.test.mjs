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

test('new prints the try message of the creation response', async () => {
  stubToken();
  installMockFetch([
    { status: 201, body: { data: { id: 5, name: 'X', base_url: 'https://x.com', install: { state: 'preparing', message_code: 'preparing', message: 'Appo is getting the app ready.', install_url: null, how_to_open: null, options: [] } } } },
  ]);
  const { result, lines } = await captureLog(() =>
    run(['new', '--url', 'https://x.com', '--name', 'X', '--owner-authorized', '--accept-tos', ...API]));
  expect(result).toBe(0);
  expect(lines.join('\n')).toContain('Appo is getting the app ready.');
  expect(requests[1].path).toBe('/api/v1/apps/5/start');
});

// 1. Happy path with an explicit --name: one create, then the start session.
test('new --url --name creates the app and continues into start', async () => {
  stubToken();
  installMockFetch([
    { status: 201, body: { data: { id: 5, name: 'X', base_url: 'https://x.com' } } },
  ]);
  const { result, lines } = await captureLog(() =>
    run(['new', '--url', 'https://x.com', '--name', 'X', '--owner-authorized', '--accept-tos', ...API]));
  expect(result).toBe(0);
  expect(requests[0].method).toBe('POST');
  expect(requests[0].path).toMatch(/\/api\/v1\/apps$/);
  expect(requests[0].body).toEqual({ name: 'X', base_url: 'https://x.com', owner_authorized: true, accepted_tos: true });
  expect(requests[1].path).toBe('/api/v1/apps/5/start');
  expect(lines.join('\n')).toMatch(/Created X\./);
});

// 2. The canonical one-liner: a bare domain gets https:// prepended client-side
//    and the name derives from the first hostname label, capitalized.
test('new --url tuosito.com derives name Tuosito and prepends https://', async () => {
  stubToken();
  installMockFetch([
    { status: 201, body: { data: { id: 6, name: 'Tuosito', base_url: 'https://tuosito.com' } } },
  ]);
  const { result } = await captureLog(() => run(['new', '--url', 'tuosito.com', '--owner-authorized', '--accept-tos', ...API]));
  expect(result).toBe(0);
  expect(requests[0].body).toEqual({ name: 'Tuosito', base_url: 'https://tuosito.com', owner_authorized: true, accepted_tos: true });
});

// 3. A leading `www.` is stripped BEFORE the first label is taken.
test('new strips a leading www. before deriving the name', async () => {
  stubToken();
  installMockFetch([
    { status: 201, body: { data: { id: 7, name: 'Pizza-mario', base_url: 'https://www.pizza-mario.it' } } },
  ]);
  const { result } = await captureLog(() =>
    run(['new', '--url', 'https://www.pizza-mario.it', '--owner-authorized', '--accept-tos', ...API]));
  expect(result).toBe(0);
  expect(requests[0].body).toEqual({ name: 'Pizza-mario', base_url: 'https://www.pizza-mario.it', owner_authorized: true, accepted_tos: true });
});

// 4. Usage error: missing --url (or a bare valueless --url) -> exit 2, no HTTP.
test('new without --url -> exit 2 with usage line, no HTTP', async () => {
  stubToken();
  installMockFetch({ status: 201 });
  const { result, lines } = await captureAll(() => run(['new', ...API]));
  expect(result).toBe(2);
  expect(lines.join('\n')).toMatch(/Usage: appo new <url>/);
  expect(requests.length).toBe(0);
  // A bare `--url` (no value) parses as boolean true — same usage error, no HTTP.
  const bare = await captureAll(() => run(['new', '--url', ...API]));
  expect(bare.result).toBe(2);
  expect(requests.length).toBe(0);
});

// 5. --json: only the last V1 response body (the start response) is printed.
test('new --json prints the start response body as one JSON line, exit 0', async () => {
  stubToken();
  installMockFetch([
    { status: 201, body: { data: { id: 9, name: 'Tuosito', base_url: 'https://tuosito.com' } } },
    { status: 200, body: { data: { id: 9, name: 'Tuosito', decision: null, install: { state: 'ready', message: 'ok', install_url: 'https://p' } } } },
  ]);
  const { result, lines } = await captureLog(() =>
    run(['new', '--url', 'tuosito.com', '--owner-authorized', '--accept-tos', '--json', ...API]));
  expect(result).toBe(0);
  expect(lines.length).toBe(1);
  expect(JSON.parse(lines[0])).toEqual({
    data: { id: 9, name: 'Tuosito', decision: null, install: { state: 'ready', message: 'ok', install_url: 'https://p' } },
  });
});

// Consent is asked at every creation: both flags, or an attestation_required envelope.
test('new sends the attestation and no preparation field', async () => {
  stubToken();
  installMockFetch([
    { status: 201, body: { data: { id: 10, name: 'X', base_url: 'https://x.com' } } },
  ]);
  const { result } = await captureLog(() =>
    run(['new', '--url', 'https://x.com', '--name', 'X', '--owner-authorized', '--accept-tos', ...API]));
  expect(result).toBe(0);
  expect(requests[0].body).toEqual({
    name: 'X', base_url: 'https://x.com', owner_authorized: true, accepted_tos: true,
  });
  expect(JSON.stringify(requests[0].body)).not.toContain('prep_mode');
});

test('new without the consent flags and without a terminal returns attestation_required, exit 2, no HTTP', async () => {
  stubToken();
  installMockFetch([]);
  const { result, lines } = await captureLog(() =>
    run(['new', '--url', 'https://x.com', '--accept-tos', '--json', ...API]));
  expect(result).toBe(2);
  expect(requests.length).toBe(0);
  const env = JSON.parse(lines.join(''));
  expect(env.error).toBe('input_required');
  expect(env.code).toBe('attestation_required');
  expect(env.details.questions.length).toBe(2);
  expect(env.details.flags).toEqual(['--owner-authorized', '--accept-tos']);
  expect(env.details.terms_of_service_url).toBe('https://goappo.io/en/terms');
});

test('new with an invalid answer flag exits 2 with no HTTP', async () => {
  stubToken();
  installMockFetch([]);
  const { result } = await captureAll(() => run(['new', '--url', 'https://x.com', '--fix', 'maybe', ...API]));
  expect(result).toBe(2);
  expect(requests.length).toBe(0);
});

test('apps create settles consent the same way', async () => {
  stubToken();
  installMockFetch([{ status: 201, body: { data: { id: 3, name: 'n', base_url: 'https://x.com' } } }]);
  const none = await captureAll(() => run(['apps', 'create', '--name', 'n', '--url', 'https://x.com', ...API]));
  expect(none.result).toBe(2);
  expect(requests.length).toBe(0);
  const on = await captureAll(() =>
    run(['apps', 'create', '--name', 'n', '--url', 'https://x.com', '--owner-authorized', '--accept-tos', ...API]));
  expect(on.result).toBe(0);
  expect(lastRequest().body).toEqual({
    name: 'n', base_url: 'https://x.com', owner_authorized: true, accepted_tos: true,
  });
});

// 12. Regression: with a stored token, new still hits /api/v1/apps (authenticated path unchanged).
test('new --url with a stored token still hits /api/v1/apps (authenticated path unchanged)', async () => {
  stubToken();
  installMockFetch([
    { status: 201, body: { data: { id: 5, name: 'X', base_url: 'https://x.com' } } },
  ]);
  await captureLog(() => run(['new', '--url', 'https://x.com', '--name', 'X', '--owner-authorized', '--accept-tos', ...API]));
  expect(requests[0].path).toMatch(/\/api\/v1\/apps$/);
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

// Site readiness refusal (268): findings, fix and next step come from the server.
const REFUSAL = {
  error: 'site_not_ready',
  code: 'site_blocking_findings',
  message: 'The site cannot be turned into an app yet.',
  details: {
    findings: [
      { id: 'a', label: 'A', finding: 'The site blocks automated visits.', fix: 'Allow the Appo crawler.\u001b[31m' },
      { id: 'b', label: 'B', finding: 'The site is not served over HTTPS.', fix: 'Serve it over HTTPS.' },
    ],
    platform_note: 'Hosted on a closed platform.',
    next: 'Fix these and run the command again.',
    recheck: null,
    kept_address: 'https://old.example',
  },
};

test('new prints refusal findings and exits 1', async () => {
  stubToken();
  installMockFetch([{ status: 422, body: REFUSAL }]);
  const { result, lines } = await captureAll(() =>
    run(['new', '--url', 'https://bad.example', '--owner-authorized', '--accept-tos', ...API]));
  expect(result).toBe(1);
  const out = lines.join('\n');
  expect(out).toContain('The site cannot be turned into an app yet.');
  expect(out).toContain('- The site blocks automated visits.');
  expect(out).toContain('    Allow the Appo crawler.');
  expect(out).toContain('Hosted on a closed platform.');
  expect(out).toContain('Next: Fix these and run the command again.');
  expect(out).not.toContain('\u001b');
});

test('new --json prints the refusal envelope on stdout and exits 1', async () => {
  stubToken();
  installMockFetch([{ status: 422, body: REFUSAL }]);
  const { result, lines } = await captureAll(() =>
    run(['new', '--url', 'https://bad.example', '--owner-authorized', '--accept-tos', '--json', ...API]));
  expect(result).toBe(1);
  expect(JSON.parse(lines.join('')).error).toBe('site_not_ready');
});

test('apps create prints refusal findings', async () => {
  stubToken();
  installMockFetch([{ status: 422, body: REFUSAL }]);
  const { result, lines } = await captureAll(() =>
    run(['apps', 'create', '--name', 'n', '--url', 'https://bad.example', '--owner-authorized', '--accept-tos', ...API]));
  expect(result).toBe(1);
  expect(lines.join('\n')).toContain('- The site is not served over HTTPS.');
});

test('apps update prints refusal findings and the kept address', async () => {
  stubToken();
  installMockFetch([{ status: 422, body: REFUSAL }]);
  const { result, lines } = await captureAll(() =>
    run(['apps', 'update', '7', '--url', 'https://bad.example', ...API]));
  expect(result).toBe(1);
  expect(lines.join('\n')).toContain('The app keeps https://old.example.');
});

test('apps check prints the sentence and remaining findings', async () => {
  stubToken();
  installMockFetch([{ status: 200, body: { site: { status: 'blocked', recheck: { sentence: 'One problem remains.' }, findings: [{ finding: 'No HTTPS.', fix: 'Enable HTTPS.' }] } } }]);
  const { result, lines } = await captureAll(() => run(['apps', 'check', '7', ...API]));
  expect(result).toBe(0);
  expect(lastRequest().path).toMatch(/\/api\/v1\/apps\/7\/site\/check$/);
  const out = lines.join('\n');
  expect(out).toContain('One problem remains.');
  expect(out).toContain('- No HTTPS.');
});

test('apps check on a first decided check prints a status line and that the app is closed', async () => {
  stubToken();
  installMockFetch([{ status: 200, body: { site: { status: 'blocked', closed: true, closed_by: null, recheck: null, findings: [{ finding: 'No HTTPS.', fix: 'Enable HTTPS.' }], notes: [{ finding: 'No privacy page.' }] } } }]);
  const { result, lines } = await captureAll(() => run(['apps', 'check', '7', ...API]));
  expect(result).toBe(0);
  const out = lines.join('\n');
  expect(out).toContain('Site checked: findings to fix.');
  expect(out).toContain('- No HTTPS.');
  expect(out).toContain('Notes:');
  expect(out).toContain('- No privacy page.');
  expect(out).toContain('The install link and Publish stay closed until the site is fixed.');
});

test('apps check on a pending check says the site is still being read', async () => {
  stubToken();
  installMockFetch([{ status: 200, body: { site: { status: 'pending', closed: false, recheck: null, findings: [], notes: [] } } }]);
  const { result, lines } = await captureAll(() => run(['apps', 'check', '7', ...API]));
  expect(result).toBe(0);
  const out = lines.join('\n');
  expect(out).toContain('The site is still being read');
  expect(out).toContain('The site does not close the install link or Publish.');
});

test('apps check on an unverified check of a closed app prints the cause and the closing findings', async () => {
  stubToken();
  installMockFetch([{ status: 200, body: { site: {
    status: 'unverified',
    closed: true,
    recheck: null,
    findings: [],
    notes: [],
    unverified: { cause: 'unreachable', text: 'The site could not be reached.' },
    closed_by: { checked_at: null, findings: [{ finding: 'The certificate expired.', fix: 'Renew it.' }], platform_note: null },
  } } }]);
  const { result, lines } = await captureAll(() => run(['apps', 'check', '7', ...API]));
  expect(result).toBe(0);
  const out = lines.join('\n');
  expect(out).toContain('The site could not be reached.');
  expect(out).toContain('The app was closed because of:');
  expect(out).toContain('- The certificate expired.');
  expect(out).toContain('The install link and Publish stay closed until the site is fixed.');
});

test('apps check prints the message when no site is stored', async () => {
  stubToken();
  installMockFetch([{ status: 200, body: { site: null, message: 'No site check on record.' } }]);
  const { result, lines } = await captureAll(() => run(['apps', 'check', '7', ...API]));
  expect(result).toBe(0);
  expect(lines.join('\n')).toContain('No site check on record.');
});

test('apps check on a rate limit prints the wait and exits 1', async () => {
  stubToken();
  installMockFetch([{ status: 429, body: { error: 'rate_limited', code: 'site_check_limited', message: 'Too many checks.', details: { retry_after: 42, window: 60 } } }]);
  const { result, lines } = await captureAll(() => run(['apps', 'check', '7', ...API]));
  expect(result).toBe(1);
  const out = lines.join('\n');
  expect(out).toContain('Too many checks.');
  expect(out).toContain('Retry in 42 seconds.');
});

test('apps check without an id in a non-interactive run exits 2', async () => {
  stubToken();
  const { result, lines } = await captureAll(() => run(['apps', 'check', ...API]));
  expect(result).toBe(2);
  expect(lines.join('\n')).toContain('Usage: appo apps check <id>');
});
