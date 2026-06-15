import { test, expect } from 'vitest';
import { run } from '../../src/cli.mjs';

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
  expect(result).toBe(0);
  const out = lines.join('\n');
  for (const verb of LIFECYCLE_VERBS) {
    expect(out).toMatch(new RegExp(`\\bappo ${verb.replace('-', '\\-')}\\b`));
  }
});

test('--help documents the exit-code taxonomy (0/1/2/3)', async () => {
  const { lines } = await captureLog(() => run(['--help']));
  const out = lines.join('\n');
  expect(out).toMatch(/Exit codes/);
  expect(out).toMatch(/\b0\b.*success/i);
  expect(out).toMatch(/\b1\b.*error/i);
  expect(out).toMatch(/\b2\b.*usage/i);
  expect(out).toMatch(/\b3\b.*confirm required/i);
});

test('-h short flag prints help and returns 0', async () => {
  const { result, lines } = await captureLog(() => run(['-h']));
  expect(result).toBe(0);
  expect(lines.join('\n')).toMatch(/appo — create and manage Appo apps/);
});

test('no args prints help and returns 0', async () => {
  const { result, lines } = await captureLog(() => run([]));
  expect(result).toBe(0);
  expect(lines.join('\n')).toMatch(/Lifecycle:/);
});
