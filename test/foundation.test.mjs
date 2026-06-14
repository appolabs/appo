import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmGate } from '../src/cli.mjs';

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
