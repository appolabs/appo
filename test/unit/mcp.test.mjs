import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { runMcpInstall, connectorUrl, addArgsFor, printManual } from '../../src/mcp.mjs';

// No real agent CLI is ever spawned: spawnSyncImpl fakes PATH detection and
// spawnImpl returns a fake child whose 'close' cb fires synchronously.

const URL_PROD = 'https://apps.goappo.io/mcp';

const CLAUDE_ARGS = ['mcp', 'add', '--transport', 'http', 'appo', URL_PROD];
const CODEX_ARGS = ['mcp', 'add', 'appo', '--url', URL_PROD];

/** spawnSync fake: the bins in `present` resolve; everything else is ENOENT. */
const detect = (present) => (bin) =>
  present.includes(bin) ? {} : { error: new Error('ENOENT') };

/** spawn fake: a child whose 'close' fires synchronously with `code`. */
const spawnWith = (code) =>
  vi.fn(() => ({ on: (ev, cb) => { if (ev === 'close') { cb(code); } } }));

let log; let lines;
beforeEach(() => { log = console.log; lines = []; console.log = (...a) => lines.push(a.join(' ')); });
afterEach(() => { console.log = log; });

test('connectorUrl derives the connector URL from the profile API base', () => {
  expect(connectorUrl('https://apps.goappo.io')).toBe(URL_PROD);
  expect(connectorUrl('http://localhost:8002')).toBe('http://localhost:8002/mcp');
});

test('connectorUrl normalises a trailing slash and drops any path', () => {
  expect(connectorUrl('https://apps.goappo.io/')).toBe(URL_PROD);
  expect(connectorUrl('https://apps.goappo.io/api/v1/')).toBe(URL_PROD);
});

test('connectorUrl refuses an unsafe connector URL', () => {
  expect(() => connectorUrl('https://x; rm -rf /')).toThrow(/api base/i);
  expect(() => connectorUrl('ftp://apps.goappo.io')).toThrow(/api base/i);
  expect(() => connectorUrl('not a url')).toThrow(/api base/i);
});

test('connectorUrl refuses shell metacharacters that survive URL parsing', () => {
  for (const base of [
    'https://apps.goappo.io/$(id)',
    'https://apps.goappo.io/`id`',
    'https://apps.goappo.io/a&b',
    'https://apps.goappo.io/a|b',
    'https://apps.goappo.io/%PATH%',
    'https://apps.goappo.io/a^b',
    'https://user:pw@apps.goappo.io',
  ]) {
    expect(() => connectorUrl(base)).toThrow(/api base/i);
  }
});

test('addArgsFor produces the HTTP-transport argv per client', () => {
  expect(addArgsFor('claude', URL_PROD)).toEqual(CLAUDE_ARGS);
  expect(addArgsFor('codex', URL_PROD)).toEqual(CODEX_ARGS);
  expect(() => addArgsFor(/** @type {any} */ ('cursor'), URL_PROD)).toThrow(/unsupported/i);
});

test('installs the remote connector into every present agent CLI, returns 0', async () => {
  const spawnImpl = spawnWith(0);
  const code = await runMcpInstall({ spawnImpl, spawnSyncImpl: detect(['claude', 'codex']), apiBase: 'https://apps.goappo.io' });
  expect(spawnImpl).toHaveBeenCalledWith('claude', CLAUDE_ARGS, expect.any(Object));
  expect(spawnImpl).toHaveBeenCalledWith('codex', CODEX_ARGS, expect.any(Object));
  expect(code).toBe(0);
  expect(lines.join('\n')).toMatch(/browser/i);
  expect(lines.join('\n')).not.toMatch(/appo login/);
});

test('uses the profile API base for the connector (local dev registers localhost)', async () => {
  const spawnImpl = spawnWith(0);
  await runMcpInstall({ spawnImpl, spawnSyncImpl: detect(['codex']), apiBase: 'http://localhost:8002' });
  expect(spawnImpl).toHaveBeenCalledWith('codex', ['mcp', 'add', 'appo', '--url', 'http://localhost:8002/mcp'], expect.any(Object));
});

test('only wires the agents that are on PATH', async () => {
  const spawnImpl = spawnWith(0);
  const code = await runMcpInstall({ spawnImpl, spawnSyncImpl: detect(['codex']), apiBase: 'https://apps.goappo.io' });
  expect(spawnImpl).toHaveBeenCalledTimes(1);
  expect(code).toBe(0);
});

test('no agent CLI present: prints manual with URL snippet and mcp-remote bridge, never spawns, returns 1', async () => {
  const spawnImpl = spawnWith(0);
  const code = await runMcpInstall({ spawnImpl, spawnSyncImpl: detect([]), apiBase: 'https://apps.goappo.io' });
  expect(spawnImpl).not.toHaveBeenCalled();
  expect(code).toBe(1);
  const out = lines.join('\n');
  expect(out).toContain('claude mcp add --transport http appo https://apps.goappo.io/mcp');
  expect(out).toContain('codex mcp add appo --url https://apps.goappo.io/mcp');
  expect(out).toContain('"url": "https://apps.goappo.io/mcp"');
  expect(out).toContain('npx mcp-remote https://apps.goappo.io/mcp');
  expect(out).not.toContain('@appolabs/appo-mcp');
});

test('present agent whose add fails (non-zero) does not count as installed', async () => {
  const spawnImpl = spawnWith(1);
  const code = await runMcpInstall({ spawnImpl, spawnSyncImpl: detect(['claude']), apiBase: 'https://apps.goappo.io' });
  expect(code).toBe(1);
});

test('unsafe API base aborts before any spawn', async () => {
  const spawnImpl = spawnWith(0);
  const spawnSyncImpl = vi.fn(detect(['claude']));
  await expect(runMcpInstall({ spawnImpl, spawnSyncImpl, apiBase: 'https://x; rm -rf /' })).rejects.toThrow();
  expect(spawnImpl).not.toHaveBeenCalled();
  expect(spawnSyncImpl).not.toHaveBeenCalled();
});

test('printManual is pure presentation', () => {
  printManual(URL_PROD);
  expect(lines.length).toBeGreaterThan(3);
});
