import { test, afterEach, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { login } from '../../src/login.mjs';

const realFetch = globalThis.fetch;
let tmpDir;

function stubDeviceFlow() {
  tmpDir = mkdtempSync(join(tmpdir(), 'appo-login-'));
  process.env.APPO_CONFIG_HOME = tmpDir;
  globalThis.fetch = /** @type {any} */ (vi.fn(async (url) => {
    if (String(url).endsWith('/device/code')) {
      return { ok: true, json: async () => ({
        device_code: 'dc', user_code: 'ABCD-1234', verification_uri: 'http://test.local/oauth/device',
        verification_uri_complete: 'http://test.local/oauth/device?user_code=ABCD-1234', interval: 0.001, expires_in: 60,
      }) };
    }
    return { ok: true, json: async () => ({ access_token: 'tok' }) };
  }));
}

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.APPO_CONFIG_HOME;
  if (tmpDir) { rmSync(tmpDir, { recursive: true, force: true }); tmpDir = undefined; }
});

async function quiet(fn) {
  const log = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = log; }
}

test('login with signup opens the verification URL ending in &signup=1', async () => {
  stubDeviceFlow();
  const open = vi.fn();
  await quiet(() => login('http://test.local', 'default', { signup: true, open }));
  expect(open).toHaveBeenCalledWith('http://test.local/oauth/device?user_code=ABCD-1234&signup=1');
});

test('login without the option opens the URL unchanged', async () => {
  stubDeviceFlow();
  const open = vi.fn();
  await quiet(() => login('http://test.local', 'default', { open }));
  expect(open).toHaveBeenCalledWith('http://test.local/oauth/device?user_code=ABCD-1234');
});
