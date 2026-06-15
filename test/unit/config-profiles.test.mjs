// Unit suite for the profile-aware config gateway (src/config.mjs).
//
// Pure file-I/O coverage — no mock fetch. Isolation is provided by the lazy
// configPath() getter: a per-test beforeEach points APPO_CONFIG_HOME at a fresh
// mkdtemp dir, and because config.mjs resolves the path PER CALL, that env (set
// after ESM imports already ran) is honored on the very next read/write. The
// real ~/.appo/config.json is never touched.

import { test, beforeEach, afterEach, expect } from 'vitest';
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
} from '../../src/config.mjs';

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
  expect(configPath().file.startsWith(process.env.APPO_CONFIG_HOME)).toBeTruthy();

  writeConfig({ current: 'default', profiles: { default: { api_base: 'http://x.local', token: 't' } } });
  const cfg = readConfig();
  expect(cfg.current).toBe('default');
  expect(cfg.profiles.default.api_base).toBe('http://x.local');
  expect(cfg.profiles.default.token).toBe('t');
});

test('legacy normalization: flat config folds into profiles.default (no logout)', () => {
  // Write a FLAT config directly to the isolated path.
  writeConfig({ token: 'flat-tok', api_base: 'http://flat.local' });

  const cfg = readConfig();
  expect(cfg).toEqual({
    current: 'default',
    profiles: { default: { api_base: 'http://flat.local', token: 'flat-tok' } },
  });
  expect(storedToken('default')).toBe('flat-tok');
  expect(resolveApiBase(undefined, 'default')).toBe('http://flat.local');
});

test('empty config: readConfig returns { current:default, profiles:{} }', () => {
  const cfg = readConfig();
  expect(cfg.current).toBe('default');
  expect(cfg.profiles).toEqual({});
});

test('no clobber: writeProfile adds a profile without touching siblings', () => {
  writeConfig({
    current: 'production',
    profiles: { production: { api_base: 'http://prod.local', token: 'p-tok' } },
  });

  writeProfile('staging', { api_base: 'http://staging.local', token: 's-tok' });

  const cfg = readConfig();
  expect(cfg.profiles.production).toEqual({ api_base: 'http://prod.local', token: 'p-tok' });
  expect(cfg.profiles.staging).toEqual({ api_base: 'http://staging.local', token: 's-tok' });
});

test('first profile activates itself: writeProfile on an empty config sets current', () => {
  // First-ever `login --env staging` must make 'staging' the active profile, so
  // a subsequent bare `whoami` resolves to it (not the empty 'default' profile).
  writeProfile('staging', { api_base: 'http://staging.local', token: 's-tok' });

  expect(readConfig().current).toBe('staging');
});

test('non-first writeProfile leaves current untouched', () => {
  writeConfig({
    current: 'production',
    profiles: { production: { api_base: 'http://prod.local', token: 'p-tok' } },
  });
  writeProfile('staging', { api_base: 'http://staging.local', token: 's-tok' });

  expect(readConfig().current).toBe('production');
});

test('activeProfileName precedence: --env > APPO_ENV > current > default', () => {
  writeConfig({ current: 'production', profiles: {} });

  // flag wins over everything
  process.env.APPO_ENV = 'qa';
  expect(activeProfileName('staging')).toBe('staging');

  // no flag → APPO_ENV
  expect(activeProfileName()).toBe('qa');

  // no flag, no APPO_ENV → config current
  delete process.env.APPO_ENV;
  expect(activeProfileName()).toBe('production');

  // empty config → default
  clearConfig();
  expect(activeProfileName()).toBe('default');
});

test('resolveApiBase precedence: --api > APPO_API_BASE > profile > default (trailing slash stripped)', () => {
  writeConfig({ current: 'default', profiles: { default: { api_base: 'http://prof.local' } } });

  // flag wins
  process.env.APPO_API_BASE = 'http://env.local';
  expect(resolveApiBase('http://flag.local/', 'default')).toBe('http://flag.local');

  // no flag → env
  expect(resolveApiBase(undefined, 'default')).toBe('http://env.local');

  // no flag, no env → profile
  delete process.env.APPO_API_BASE;
  expect(resolveApiBase(undefined, 'default')).toBe('http://prof.local');

  // nothing set + unknown env → built-in default
  expect(resolveApiBase(undefined, 'nope')).toBe('http://localhost:8002');
});

test('storedToken precedence + non-persistence: APPO_TOKEN wins and is never written', () => {
  writeConfig({ current: 'default', profiles: { default: { api_base: 'http://d.local', token: 'disk-tok' } } });

  process.env.APPO_TOKEN = 'env-tok';
  expect(storedToken('default')).toBe('env-tok');

  // APPO_TOKEN must never reach disk.
  const raw = readFileSync(configPath().file, 'utf-8');
  expect(!raw.includes('env-tok')).toBeTruthy();

  // Without APPO_TOKEN, the disk token is returned.
  delete process.env.APPO_TOKEN;
  expect(storedToken('default')).toBe('disk-tok');
});

test('storedToken returns null when no token present', () => {
  writeConfig({ current: 'default', profiles: { default: { api_base: 'http://d.local' } } });
  expect(storedToken('default')).toBe(null);
});

test('clearProfileToken removes the token but keeps api_base', () => {
  writeConfig({ current: 'default', profiles: { default: { api_base: 'http://d.local', token: 'disk-tok' } } });

  clearProfileToken('default');

  const cfg = readConfig();
  expect(cfg.profiles.default.token).toBe(undefined);
  expect(cfg.profiles.default.api_base).toBe('http://d.local');
});

test('setCurrent sets top-level current and leaves profiles intact', () => {
  writeConfig({
    current: 'default',
    profiles: { default: { api_base: 'http://d.local' }, staging: { api_base: 'http://s.local' } },
  });

  setCurrent('staging');

  const cfg = readConfig();
  expect(cfg.current).toBe('staging');
  expect(cfg.profiles.default).toEqual({ api_base: 'http://d.local' });
  expect(cfg.profiles.staging).toEqual({ api_base: 'http://s.local' });
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
  expect(tokens.sort()).toEqual(['d-tok', 's-tok']);
  // Profile names (the render keys) carry no token strings.
  expect(Object.keys(cfg.profiles).sort()).toEqual(['default', 'staging']);
});
