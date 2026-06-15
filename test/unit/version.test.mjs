import { test, expect } from 'vitest';
import { run } from '../../src/cli.mjs';

// Capture console.log output around an async call (analog help.test.mjs).
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

const VERSION_LINE = /^appo\/\d+\.\d+\.\d+ node\//;

test('--version prints appo/<v> node/<v> and returns 0', async () => {
  const { result, lines } = await captureLog(() => run(['--version']));
  expect(result).toBe(0);
  expect(lines.join('\n')).toMatch(VERSION_LINE);
});

test('-v prints the version line and returns 0', async () => {
  const { result, lines } = await captureLog(() => run(['-v']));
  expect(result).toBe(0);
  expect(lines.join('\n')).toMatch(VERSION_LINE);
});

test('version subcommand prints the version line and returns 0', async () => {
  const { result, lines } = await captureLog(() => run(['version']));
  expect(result).toBe(0);
  expect(lines.join('\n')).toMatch(VERSION_LINE);
});
