import { test, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { runMcpInstall } from '../../src/mcp.mjs';

// No real `claude` is ever spawned: spawnImpl is injected and returns a fake
// child (an EventEmitter) whose 'close'/'error' events drive the exit code.

test('runMcpInstall spawns the exact claude argv and resolves the close code', async () => {
  const child = new EventEmitter();
  const spawnImpl = vi.fn(() => child);
  const original = console.log;
  console.log = () => {};
  try {
    const p = runMcpInstall({ spawnImpl });
    expect(spawnImpl).toHaveBeenCalledWith(
      'claude',
      ['mcp', 'add', 'appo', '--', 'npx', '-y', '@appolabs/appo-mcp'],
      expect.any(Object),
    );
    child.emit('close', 0);
    expect(await p).toBe(0);
  } finally {
    console.log = original;
  }
});

test('runMcpInstall resolves 1 on spawn error (claude not on PATH)', async () => {
  const child = new EventEmitter();
  const original = console.log;
  console.log = () => {};
  try {
    const p = runMcpInstall({ spawnImpl: () => child });
    child.emit('error', new Error('ENOENT'));
    expect(await p).toBe(1);
  } finally {
    console.log = original;
  }
});

test('runMcpInstall resolves 1 when close fires with a null code', async () => {
  const child = new EventEmitter();
  const p = runMcpInstall({ spawnImpl: () => child });
  child.emit('close', null);
  expect(await p).toBe(1);
});
