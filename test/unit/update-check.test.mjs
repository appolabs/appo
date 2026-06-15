import { test, beforeEach, afterEach, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkForUpdate } from '../../src/upgrade.mjs';
import {
  readUpdateCache,
  writeUpdateCache,
  writeProfile,
  readConfig,
} from '../../src/config.mjs';

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'appo-update-'));
  process.env.APPO_CONFIG_HOME = tmpDir;
});

afterEach(() => {
  const dir = tmpDir;
  delete process.env.APPO_CONFIG_HOME;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

// Capture process.stderr.write around an async call (the update notice goes to
// stderr, not console.error).
async function captureStderr(fn) {
  const original = process.stderr.write;
  const chunks = [];
  process.stderr.write = (chunk) => { chunks.push(String(chunk)); return true; };
  try {
    const result = await fn();
    return { result, text: chunks.join('') };
  } finally {
    process.stderr.write = original;
  }
}

test('checkForUpdate hits the percent-encoded scoped URL and prints a notice when newer', async () => {
  const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ version: '9.9.9' }) }));
  const { text } = await captureStderr(() =>
    checkForUpdate('0.1.0', { fetchImpl, now: () => 1_000_000 }),
  );
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl.mock.calls[0][0]).toBe('https://registry.npmjs.org/@appolabs%2Fappo/latest');
  expect(text).toMatch(/update available: v0\.1\.0 -> v9\.9\.9/);
});

test('checkForUpdate sends NO Authorization header to the registry (PAT stays local)', async () => {
  writeProfile('default', { api_base: 'http://x', token: 'secret-pat' });
  const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ version: '9.9.9' }) }));
  await captureStderr(() => checkForUpdate('0.1.0', { fetchImpl, now: () => 1_000_000 }));
  const init = fetchImpl.mock.calls[0][1] || {};
  const headers = init.headers || {};
  expect(headers.Authorization).toBeUndefined();
  expect(JSON.stringify(init)).not.toMatch(/secret-pat|Bearer/);
});

test('checkForUpdate prints no notice when installed is current or newer', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ version: '0.1.0' }) });
  const { text } = await captureStderr(() =>
    checkForUpdate('0.1.0', { fetchImpl, now: () => 1_000_000 }),
  );
  expect(text).not.toMatch(/update available/);
});

test('checkForUpdate swallows network errors: no throw, no notice', async () => {
  const fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
  const { text } = await captureStderr(() =>
    checkForUpdate('0.1.0', { fetchImpl, now: () => 1_000_000 }),
  );
  expect(text).not.toMatch(/update available/);
});

test('checkForUpdate does not fetch within the daily cache window', async () => {
  writeUpdateCache({ last_check_ms: 1_000_000, latest: '0.1.0' });
  const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ version: '9.9.9' }) }));
  // now is only 1 hour after the cached check → within the day → no fetch.
  await captureStderr(() =>
    checkForUpdate('0.1.0', { fetchImpl, now: () => 1_000_000 + 3_600_000 }),
  );
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('checkForUpdate uses the cached latest within the day to drive the notice', async () => {
  writeUpdateCache({ last_check_ms: 1_000_000, latest: '9.9.9' });
  const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ version: '0.0.1' }) }));
  const { text } = await captureStderr(() =>
    checkForUpdate('0.1.0', { fetchImpl, now: () => 1_000_000 + 3_600_000 }),
  );
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(text).toMatch(/update available: v0\.1\.0 -> v9\.9\.9/);
});

// --- the Open Q2 invariant: the cache survives a profile write ---------------

test('the update_check cache survives a profile write (writeProfile preserves it)', () => {
  writeUpdateCache({ last_check_ms: 42, latest: '9.9.9' });
  writeProfile('default', { token: 't', api_base: 'http://x' });
  expect(readUpdateCache().latest).toBe('9.9.9');
});

test('readConfig carries update_check through the normalize round-trip', () => {
  writeUpdateCache({ last_check_ms: 42, latest: '9.9.9' });
  expect(readConfig().update_check?.latest).toBe('9.9.9');
});

test('a cache write never drops sibling profiles', () => {
  writeProfile('production', { token: 'prod', api_base: 'http://prod' });
  writeUpdateCache({ last_check_ms: 42, latest: '9.9.9' });
  expect(readConfig().profiles.production.token).toBe('prod');
});
