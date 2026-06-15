import { test, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { runUpgrade } from '../../src/upgrade.mjs';

// No real npm is ever spawned: spawnImpl is injected and returns a fake child
// (an EventEmitter) whose 'close'/'error' events drive the resolved exit code.

test('runUpgrade spawns the exact npm argv and resolves the close code', async () => {
  const child = new EventEmitter();
  const spawnImpl = vi.fn(() => child);
  const p = runUpgrade({ spawnImpl });
  expect(spawnImpl).toHaveBeenCalledWith(
    'npm',
    ['install', '-g', '@appolabs/appo@latest'],
    expect.any(Object),
  );
  child.emit('close', 7);
  expect(await p).toBe(7);
});

test('runUpgrade resolves 1 on spawn error (npm not on PATH)', async () => {
  const child = new EventEmitter();
  const original = console.error;
  console.error = () => {};
  try {
    const p = runUpgrade({ spawnImpl: () => child });
    child.emit('error', new Error('ENOENT'));
    expect(await p).toBe(1);
  } finally {
    console.error = original;
  }
});

test('runUpgrade resolves 1 when close fires with a null code', async () => {
  const child = new EventEmitter();
  const p = runUpgrade({ spawnImpl: () => child });
  child.emit('close', null);
  expect(await p).toBe(1);
});
