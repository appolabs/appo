import { test, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EnvironmentError, fromFetchFailure, fromWriteFailure } from '../../src/environment-errors.mjs';
import { run } from '../../src/cli.mjs';
import { installInstructions } from '../../src/agent-instructions.mjs';
import { checkForUpdate } from '../../src/upgrade.mjs';
import { stubToken, resetMockFetch } from '../helpers/mockFetch.mjs';

const NETWORK_LINE =
  'Appo could not reach the network from here. If an AI agent ran this command, ask the user to run it in their own terminal or to approve network access for it.';
const CONFIG_LINE =
  'Appo could not save its settings here (the folder is read-only). If an AI agent ran this command, ask the user to run it in their own terminal or to allow writing to it.';

const fetchFailed = (code) => new TypeError('fetch failed', { cause: code ? { code } : undefined });

afterEach(() => resetMockFetch());

async function capture(fn) {
  const log = console.log;
  const error = console.error;
  const out = [];
  const err = [];
  console.log = (...a) => out.push(a.join(' '));
  console.error = (...a) => err.push(a.join(' '));
  try {
    const result = await fn();
    return { result, out, err };
  } finally {
    console.log = log;
    console.error = error;
  }
}

test.each(['EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT', 'EPERM', 'EACCES'])(
  'fromFetchFailure classifies %s as network_unavailable',
  (code) => {
    const e = fromFetchFailure(fetchFailed(code));
    expect(e).toBeInstanceOf(EnvironmentError);
    expect(e.code).toBe('network_unavailable');
    expect(e.message).toBe(NETWORK_LINE);
  },
);

test('fromFetchFailure classifies a fetch failed TypeError without a cause code', () => {
  expect(fromFetchFailure(fetchFailed()).code).toBe('network_unavailable');
});

test('fromFetchFailure returns unrelated errors unchanged', () => {
  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
  expect(fromFetchFailure(abort)).toBe(abort);
});

test('fromWriteFailure classifies EROFS, EACCES, EPERM and returns others unchanged', () => {
  for (const code of ['EROFS', 'EACCES', 'EPERM']) {
    const e = fromWriteFailure(Object.assign(new Error('x'), { code }));
    expect(e.code).toBe('config_not_writable');
    expect(e.message).toBe(CONFIG_LINE);
  }
  const other = Object.assign(new Error('x'), { code: 'ENOENT' });
  expect(fromWriteFailure(other)).toBe(other);
});

test('a verb with fetch rejecting EAI_AGAIN prints exactly the network line and exits 1', async () => {
  stubToken('secret-token-value');
  globalThis.fetch = async () => { throw fetchFailed('EAI_AGAIN'); };
  const { result, err, out } = await capture(() => run(['status', '7', '--api', 'http://test.local']));
  expect(result).toBe(1);
  expect(out).toEqual([]);
  expect(err.join('\n').trim()).toBe(NETWORK_LINE);
  const text = err.join('\n');
  expect(text).not.toMatch(/Bearer|secret-token-value|\n\s+at /);
});

test('under --json the network failure is one environment envelope on stdout', async () => {
  stubToken();
  globalThis.fetch = async () => { throw fetchFailed('ENOTFOUND'); };
  const { result, out, err } = await capture(() => run(['status', '7', '--json', '--api', 'http://test.local']));
  expect(result).toBe(1);
  expect(err).toEqual([]);
  expect(out).toHaveLength(1);
  expect(JSON.parse(out[0])).toEqual({ error: 'environment', code: 'network_unavailable', message: NETWORK_LINE });
});

test('writeConfig failing with EACCES surfaces config_not_writable through login --token', async () => {
  if (process.getuid?.() === 0) { return; }
  stubToken();
  globalThis.fetch = /** @type {typeof globalThis.fetch} */ (/** @type {unknown} */ (async () => ({ status: 200, ok: true, async json() { return { data: [] }; } })));
  const file = join(process.env.APPO_CONFIG_HOME, 'config.json');
  chmodSync(file, 0o400);
  try {
    const { result, err } = await capture(() => run(['login', '--token', 'abc', '--api', 'http://test.local']));
    expect(result).toBe(1);
    expect(err.join('\n').trim()).toBe(CONFIG_LINE);
  } finally {
    chmodSync(file, 0o600);
  }
});

test('installInstructions throws config_not_writable when the agent folder is not writable', () => {
  if (process.getuid?.() === 0) { return; }
  const home = mkdtempSync(join(tmpdir(), 'appo-sandbox-'));
  try {
    mkdirSync(join(home, '.codex'));
    chmodSync(join(home, '.codex'), 0o500);
    let caught;
    try { installInstructions('codex', { home, env: {} }); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(EnvironmentError);
    expect(caught.envelope.code).toBe('config_not_writable');
  } finally {
    chmodSync(join(home, '.codex'), 0o700);
    rmSync(home, { recursive: true, force: true });
  }
});

test('checkForUpdate stays silent when the registry is unreachable', async () => {
  const chunks = [];
  const original = process.stderr.write;
  process.stderr.write = (c) => { chunks.push(String(c)); return true; };
  try {
    await expect(checkForUpdate('1.0.0', { fetchImpl: async () => { throw fetchFailed('EAI_AGAIN'); }, now: () => 1e12 })).resolves.toBeUndefined();
  } finally {
    process.stderr.write = original;
  }
  expect(chunks.join('')).toBe('');
});
