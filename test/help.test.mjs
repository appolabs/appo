import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/cli.mjs';

// Capture console.log output around an async call.
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

const LIFECYCLE_VERBS = [
  'build',
  'status',
  'publish',
  'push',
  'configure',
  'rejection',
  'fix-recipe',
  'resubmit',
];

test('--help returns 0 and enumerates all 8 lifecycle verbs', async () => {
  const { result, lines } = await captureLog(() => run(['--help']));
  assert.equal(result, 0);
  const out = lines.join('\n');
  for (const verb of LIFECYCLE_VERBS) {
    assert.match(out, new RegExp(`\\bappo ${verb.replace('-', '\\-')}\\b`), `help should mention "appo ${verb}"`);
  }
});

test('--help documents the exit-code taxonomy (0/1/2/3)', async () => {
  const { lines } = await captureLog(() => run(['--help']));
  const out = lines.join('\n');
  assert.match(out, /Exit codes/);
  assert.match(out, /\b0\b.*success/i);
  assert.match(out, /\b1\b.*error/i);
  assert.match(out, /\b2\b.*usage/i);
  assert.match(out, /\b3\b.*confirm required/i);
});

test('-h short flag prints help and returns 0', async () => {
  const { result, lines } = await captureLog(() => run(['-h']));
  assert.equal(result, 0);
  assert.match(lines.join('\n'), /appo — create and manage Appo apps/);
});

test('no args prints help and returns 0', async () => {
  const { result, lines } = await captureLog(() => run([]));
  assert.equal(result, 0);
  assert.match(lines.join('\n'), /Lifecycle:/);
});
