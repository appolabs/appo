import { test, afterEach, expect } from 'vitest';
import { pollBuild } from '../../src/cli.mjs';
import {
  installMockFetch,
  resetMockFetch,
  stubToken,
} from '../helpers/mockFetch.mjs';

afterEach(() => resetMockFetch());

// pollBuild unit cases — an injected no-op sleep keeps the loop instant. The
// multi-status sequence (building->building->ready) never reaches a real sleep.

// 9a. pollBuild unit: building->building->ready returns ready (no-op sleep, instant).
test('pollBuild observes building->building->ready and returns ready', async () => {
  stubToken();
  installMockFetch([
    { status: 200, body: { data: { status: 'building' } } },
    { status: 200, body: { data: { status: 'building' } } },
    { status: 200, body: { data: { status: 'ready' } } },
  ]);
  const res = await pollBuild('http://test.local', 5, 12, { sleep: async () => {}, intervalMs: 0 });
  expect(res.outcome).toBe('ready');
});

// 9b. pollBuild unit: failed is terminal.
test('pollBuild returns failed when status reaches failed', async () => {
  stubToken();
  installMockFetch([
    { status: 200, body: { data: { status: 'building' } } },
    { status: 200, body: { data: { status: 'failed' } } },
  ]);
  const res = await pollBuild('http://test.local', 5, 12, { sleep: async () => {}, intervalMs: 0 });
  expect(res.outcome).toBe('failed');
});

// 9c. pollBuild unit: timeoutMs 0 + non-terminal status returns timeout.
test('pollBuild returns timeout when timeoutMs elapses before terminal', async () => {
  stubToken();
  installMockFetch([
    { status: 200, body: { data: { status: 'building' } } },
  ]);
  const res = await pollBuild('http://test.local', 5, 12, { sleep: async () => {}, intervalMs: 0, timeoutMs: 0 });
  expect(res.outcome).toBe('timeout');
  expect(res.last_status).toBe('building');
});

// IN-02: pollBuild carries last_status on EVERY outcome (not just timeout), so a
// caller can read the last observed status without a null guard on res.build.
test('pollBuild carries last_status on the ready outcome (IN-02)', async () => {
  stubToken();
  installMockFetch([
    { status: 200, body: { data: { status: 'ready' } } },
  ]);
  const res = await pollBuild('http://test.local', 5, 12, { sleep: async () => {}, intervalMs: 0 });
  expect(res.outcome).toBe('ready');
  expect(res.last_status).toBe('ready');
});
