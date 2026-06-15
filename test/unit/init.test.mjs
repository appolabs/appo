import { test, beforeEach, afterEach, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  installMockFetch,
  resetMockFetch,
} from '../helpers/mockFetch.mjs';
import { run } from '../../src/cli.mjs';
import { storedToken, readConfig, writeProfile } from '../../src/config.mjs';

// Capture both console.log and console.error around an async call.
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

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'appo-init-'));
  process.env.APPO_CONFIG_HOME = tmpDir;
});

afterEach(() => {
  resetMockFetch();
  const dir = tmpDir;
  delete process.env.APPO_TOKEN;
  delete process.env.APPO_ENV;
  delete process.env.APPO_API_BASE;
  delete process.env.APPO_CONFIG_HOME;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test('init --token bootstraps the profile + confirming whoami, returns 0', async () => {
  // Two 200s: the loginWithToken validation probe, then the confirming whoami.
  installMockFetch([
    { status: 200, body: { data: [] } },
    { status: 200, body: { data: [] } },
  ]);

  const { result, lines } = await captureAll(() =>
    run(['init', '--token', 'good-pat', '--api', 'http://test.local']),
  );

  expect(result).toBe(0);
  expect(storedToken('default')).toBe('good-pat');
  expect(lines.join('\n')).not.toMatch(/good-pat/); // token never echoed
});

test('init is idempotent: already configured env is not clobbered', async () => {
  // Seed the active 'default' profile and a sibling 'production' profile.
  writeProfile('default', { api_base: 'http://test.local', token: 'existing-tok' });
  writeProfile('production', { api_base: 'http://prod.local', token: 'prod-tok' });

  const { result, lines } = await captureAll(() => run(['init']));

  expect(result).toBe(0);
  expect(lines.join('\n')).toMatch(/[Aa]lready configured/);
  // No clobber: both the active token and the sibling profile are untouched.
  expect(storedToken('default')).toBe('existing-tok');
  const prod = readConfig().profiles.production;
  expect(prod.token).toBe('prod-tok');
  expect(prod.api_base).toBe('http://prod.local');
});

test('init --token refuses a rejected PAT (401): stores nothing, returns 1', async () => {
  installMockFetch({ status: 401, body: { error: 'unauthorized' } });

  const { result } = await captureAll(() =>
    run(['init', '--token', 'bad-pat', '--api', 'http://test.local']),
  );

  expect(result).toBe(1);
  expect(storedToken('default')).toBeNull();
});
