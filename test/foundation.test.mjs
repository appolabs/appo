import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmGate, renderError, run } from '../src/cli.mjs';
import {
  installMockFetch,
  resetMockFetch,
  lastRequest,
  requests,
} from './helpers/mockFetch.mjs';
import { stubToken } from './helpers/mockFetch.mjs';

// Capture console.log output around a synchronous call.
function captureLog(fn) {
  const original = console.log;
  const lines = [];
  console.log = (...args) => lines.push(args.join(' '));
  try {
    const result = fn();
    return { result, lines };
  } finally {
    console.log = original;
  }
}

// Capture console.error output around a (possibly async) call.
async function captureError(fn) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args.join(' '));
  try {
    const result = await fn();
    return { result, lines };
  } finally {
    console.error = original;
  }
}

test('confirmGate proceeds (null) when --confirm present', () => {
  const { result } = captureLog(() =>
    confirmGate({ confirm: true }, { will: 'publish', app_id: 1 }),
  );
  assert.equal(result, null);
});

test('confirmGate gates (exit 3) when --confirm absent, no write', () => {
  const { result } = captureLog(() => confirmGate({}, { will: 'publish', app_id: 1 }));
  assert.equal(result, 3);
});

test('confirmGate --json gated path emits confirm_required:true', () => {
  const { result, lines } = captureLog(() =>
    confirmGate({ json: true }, { will: 'publish', app_id: 1, target_stores: ['apple_appstore'] }),
  );
  assert.equal(result, 3);
  const obj = JSON.parse(lines.join(''));
  assert.equal(obj.confirm_required, true);
  assert.equal(obj.will, 'publish');
  assert.deepEqual(obj.target_stores, ['apple_appstore']);
});

test('confirmGate human gated path prints a readable preview + no-write notice', () => {
  const { result, lines } = captureLog(() =>
    confirmGate({}, { will: 'resubmit', app_id: 7, current_state: 'rejected', target_state: 'in_review' }),
  );
  assert.equal(result, 3);
  const out = lines.join('\n');
  assert.match(out, /resubmit/);
  assert.match(out, /no write performed/);
});

test('renderError renders prerequisite_failed as actionable block, exit 1', async () => {
  /** @type {Error & { status?: number, envelope?: unknown }} */
  const err = new Error('Connect your Apple Developer account');
  err.status = 422;
  err.envelope = {
    error: 'prerequisite_failed',
    code: 'CUSTOMER_ASC_CREDENTIAL_MISSING',
    message: 'Connect your Apple Developer account',
    details: { next_action: 'complete_enrollment', dashboard_url: 'https://x' },
  };
  const { result, lines } = await captureError(() => renderError(err));
  assert.equal(result, 1);
  const out = lines.join('\n');
  assert.match(out, /Blocked: Connect your Apple Developer account/);
  assert.match(out, /Next: complete_enrollment -> https:\/\/x/);
});

test('renderError falls back to plain Error, exit 1 (unchanged path)', async () => {
  const err = new Error('Token rejected — run `appo login` again.');
  const { result, lines } = await captureError(() => renderError(err));
  assert.equal(result, 1);
  assert.match(lines.join('\n'), /Error: Token rejected/);
});

test('run() surfaces a prerequisite envelope as a blocked state, exit 1', async () => {
  stubToken();
  installMockFetch([
    {
      status: 422,
      body: {
        error: 'prerequisite_failed',
        code: 'CUSTOMER_ASC_CREDENTIAL_MISSING',
        message: 'Connect your Apple Developer account',
        details: { next_action: 'complete_enrollment', dashboard_url: 'https://x' },
      },
    },
  ]);
  try {
    const { result, lines } = await captureError(() =>
      run(['whoami', '--api', 'http://test.local']),
    );
    assert.equal(result, 1);
    assert.match(lines.join('\n'), /Blocked: Connect your Apple Developer account/);
  } finally {
    resetMockFetch();
  }
});

test('confirmGate issues NO fetch when gated (T-01-03)', async () => {
  stubToken();
  installMockFetch({ status: 204, body: null });
  try {
    const before = requests.length;
    const gated = confirmGate({}, { will: 'publish', app_id: 1 });
    assert.equal(gated, 3);
    assert.equal(requests.length, before);
    assert.equal(lastRequest(), null);
  } finally {
    resetMockFetch();
  }
});

// WR-01: a value-less `--api` parses as boolean true. It must surface as a usage
// error (exit 2), not an uncaught TypeError from resolveApiBase outside the try.
test('value-less --api returns exit 2 without throwing (WR-01)', async () => {
  const { result, lines } = await captureError(() => run(['status', '7', '--api']));
  assert.equal(result, 2);
  assert.match(lines.join('\n'), /--api <url> requires a value/);
});
