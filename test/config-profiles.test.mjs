// Unit suite for the profile-aware config gateway (src/config.mjs).
//
// Pure file-I/O coverage — no mock fetch. Isolation is provided by the lazy
// configPath() getter: a per-test beforeEach points APPO_CONFIG_HOME at a fresh
// mkdtemp dir, and because config.mjs resolves the path PER CALL, that env (set
// after ESM imports already ran) is honored on the very next read/write. The
// real ~/.appo/config.json is never touched.
//
// REQUIRES `--test-concurrency=1` (pinned in package.json's `test` script):
// the shared process.env.APPO_CONFIG_HOME is set/cleared per test with no other
// isolation, so parallel runs would interleave and corrupt it. Always run via
// `npm test`, never bare `node --test`.

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readConfig,
  writeConfig,
  clearConfig,
  resolveApiBase,
  storedToken,
  activeProfileName,
  writeProfile,
  clearProfileToken,
  setCurrent,
  configPath,
} from '../src/config.mjs';

let tmpDir = null;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'appo-cfg-'));
  process.env.APPO_CONFIG_HOME = tmpDir;
});

afterEach(() => {
  const dir = tmpDir;
  delete process.env.APPO_TOKEN;
  delete process.env.APPO_ENV;
  delete process.env.APPO_API_BASE;
  delete process.env.APPO_CONFIG_HOME;
  tmpDir = null;
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('isolation seam: beforeEach-set APPO_CONFIG_HOME is honored (lazy path)', () => {
  // The env was set in beforeEach, AFTER imports ran. A lazy configPath() must
  // still land inside the temp dir — proving no import-time path capture.
  assert.ok(configPath().file.startsWith(process.env.APPO_CONFIG_HOME));

  writeConfig({ current: 'default', profiles: { default: { api_base: 'http://x.local', token: 't' } } });
  const cfg = readConfig();
  assert.equal(cfg.current, 'default');
  assert.equal(cfg.profiles.default.api_base, 'http://x.local');
  assert.equal(cfg.profiles.default.token, 't');
});

test('legacy normalization: flat config folds into profiles.default (no logout)', () => {
  // Write a FLAT config directly to the isolated path.
  writeConfig({ token: 'flat-tok', api_base: 'http://flat.local' });

  const cfg = readConfig();
  assert.deepEqual(cfg, {
    current: 'default',
    profiles: { default: { api_base: 'http://flat.local', token: 'flat-tok' } },
  });
  assert.equal(storedToken('default'), 'flat-tok');
  assert.equal(resolveApiBase(undefined, 'default'), 'http://flat.local');
});

test('empty config: readConfig returns { current:default, profiles:{} }', () => {
  const cfg = readConfig();
  assert.equal(cfg.current, 'default');
  assert.deepEqual(cfg.profiles, {});
});

test('no clobber: writeProfile adds a profile without touching siblings', () => {
  writeConfig({
    current: 'production',
    profiles: { production: { api_base: 'http://prod.local', token: 'p-tok' } },
  });

  writeProfile('staging', { api_base: 'http://staging.local', token: 's-tok' });

  const cfg = readConfig();
  assert.deepEqual(cfg.profiles.production, { api_base: 'http://prod.local', token: 'p-tok' });
  assert.deepEqual(cfg.profiles.staging, { api_base: 'http://staging.local', token: 's-tok' });
});

test('first profile activates itself: writeProfile on an empty config sets current', () => {
  // First-ever `login --env staging` must make 'staging' the active profile, so
  // a subsequent bare `whoami` resolves to it (not the empty 'default' profile).
  writeProfile('staging', { api_base: 'http://staging.local', token: 's-tok' });

  assert.equal(readConfig().current, 'staging');
});

test('non-first writeProfile leaves current untouched', () => {
  writeConfig({
    current: 'production',
    profiles: { production: { api_base: 'http://prod.local', token: 'p-tok' } },
  });
  writeProfile('staging', { api_base: 'http://staging.local', token: 's-tok' });

  assert.equal(readConfig().current, 'production');
});

test('activeProfileName precedence: --env > APPO_ENV > current > default', () => {
  writeConfig({ current: 'production', profiles: {} });

  // flag wins over everything
  process.env.APPO_ENV = 'qa';
  assert.equal(activeProfileName('staging'), 'staging');

  // no flag → APPO_ENV
  assert.equal(activeProfileName(), 'qa');

  // no flag, no APPO_ENV → config current
  delete process.env.APPO_ENV;
  assert.equal(activeProfileName(), 'production');

  // empty config → default
  clearConfig();
  assert.equal(activeProfileName(), 'default');
});

test('resolveApiBase precedence: --api > APPO_API_BASE > profile > default (trailing slash stripped)', () => {
  writeConfig({ current: 'default', profiles: { default: { api_base: 'http://prof.local' } } });

  // flag wins
  process.env.APPO_API_BASE = 'http://env.local';
  assert.equal(resolveApiBase('http://flag.local/', 'default'), 'http://flag.local');

  // no flag → env
  assert.equal(resolveApiBase(undefined, 'default'), 'http://env.local');

  // no flag, no env → profile
  delete process.env.APPO_API_BASE;
  assert.equal(resolveApiBase(undefined, 'default'), 'http://prof.local');

  // nothing set + unknown env → built-in default
  assert.equal(resolveApiBase(undefined, 'nope'), 'http://localhost:8002');
});

test('storedToken precedence + non-persistence: APPO_TOKEN wins and is never written', () => {
  writeConfig({ current: 'default', profiles: { default: { api_base: 'http://d.local', token: 'disk-tok' } } });

  process.env.APPO_TOKEN = 'env-tok';
  assert.equal(storedToken('default'), 'env-tok');

  // APPO_TOKEN must never reach disk.
  const raw = readFileSync(configPath().file, 'utf-8');
  assert.ok(!raw.includes('env-tok'));

  // Without APPO_TOKEN, the disk token is returned.
  delete process.env.APPO_TOKEN;
  assert.equal(storedToken('default'), 'disk-tok');
});

test('storedToken returns null when no token present', () => {
  writeConfig({ current: 'default', profiles: { default: { api_base: 'http://d.local' } } });
  assert.equal(storedToken('default'), null);
});

test('clearProfileToken removes the token but keeps api_base', () => {
  writeConfig({ current: 'default', profiles: { default: { api_base: 'http://d.local', token: 'disk-tok' } } });

  clearProfileToken('default');

  const cfg = readConfig();
  assert.equal(cfg.profiles.default.token, undefined);
  assert.equal(cfg.profiles.default.api_base, 'http://d.local');
});

test('setCurrent sets top-level current and leaves profiles intact', () => {
  writeConfig({
    current: 'default',
    profiles: { default: { api_base: 'http://d.local' }, staging: { api_base: 'http://s.local' } },
  });

  setCurrent('staging');

  const cfg = readConfig();
  assert.equal(cfg.current, 'staging');
  assert.deepEqual(cfg.profiles.default, { api_base: 'http://d.local' });
  assert.deepEqual(cfg.profiles.staging, { api_base: 'http://s.local' });
});

test('data shape: tokens live only on profile objects (render path must elide them)', () => {
  writeConfig({
    current: 'default',
    profiles: {
      default: { api_base: 'http://d.local', token: 'd-tok' },
      staging: { api_base: 'http://s.local', token: 's-tok' },
    },
  });

  const cfg = readConfig();
  const tokens = Object.values(cfg.profiles).map((p) => p.token);
  assert.deepEqual(tokens.sort(), ['d-tok', 's-tok']);
  // Profile names (the render keys) carry no token strings.
  assert.deepEqual(Object.keys(cfg.profiles).sort(), ['default', 'staging']);
});
