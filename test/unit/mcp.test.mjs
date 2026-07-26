import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { runMcpInstall } from '../../src/mcp.mjs';

// No real agent CLI is ever spawned: spawnSyncImpl fakes PATH detection and
// spawnImpl returns a fake child whose 'close' cb fires synchronously.

const ADD_ARGS = ['mcp', 'add', 'appo', '--', 'npx', '-y', '@appolabs/appo-mcp'];

/** spawnSync fake: the bins in `present` resolve; everything else is ENOENT. */
const detect = (present) => (bin) =>
  present.includes(bin) ? {} : { error: new Error('ENOENT') };

/** spawn fake: a child whose 'close' fires synchronously with `code`. */
const spawnWith = (code) =>
  vi.fn(() => ({ on: (ev, cb) => { if (ev === 'close') { cb(code); } } }));

let log;
beforeEach(() => { log = console.log; console.log = () => {}; });
afterEach(() => { console.log = log; });

test('installs into every present agent CLI with the exact argv, returns 0', async () => {
  const spawnImpl = spawnWith(0);
  const code = await runMcpInstall({ spawnImpl, spawnSyncImpl: detect(['claude', 'codex']) });
  expect(spawnImpl).toHaveBeenCalledWith('claude', ADD_ARGS, expect.any(Object));
  expect(spawnImpl).toHaveBeenCalledWith('codex', ADD_ARGS, expect.any(Object));
  expect(code).toBe(0);
});

test('only wires the agents that are on PATH', async () => {
  const spawnImpl = spawnWith(0);
  const code = await runMcpInstall({ spawnImpl, spawnSyncImpl: detect(['codex']) });
  expect(spawnImpl).toHaveBeenCalledTimes(1);
  expect(spawnImpl).toHaveBeenCalledWith('codex', ADD_ARGS, expect.any(Object));
  expect(code).toBe(0);
});

test('no agent CLI present: prints manual, never spawns, returns 1', async () => {
  const spawnImpl = spawnWith(0);
  const code = await runMcpInstall({ spawnImpl, spawnSyncImpl: detect([]) });
  expect(spawnImpl).not.toHaveBeenCalled();
  expect(code).toBe(1);
});

test('present agent whose add fails (non-zero) does not count as installed', async () => {
  const spawnImpl = spawnWith(1);
  const code = await runMcpInstall({ spawnImpl, spawnSyncImpl: detect(['claude']) });
  expect(code).toBe(1);
});
