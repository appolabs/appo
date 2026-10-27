import { test, expect, vi, beforeEach } from 'vitest';

// runMcpInstall is replaced so the test observes only how `appo mcp` parses
// --agent-instructions; no agent CLI is spawned and no file is written.
vi.mock('../../src/mcp.mjs', () => ({ runMcpInstall: vi.fn(async () => 0) }));

const runMcpInstall = vi.mocked((await import('../../src/mcp.mjs')).runMcpInstall);
const { run } = await import('../../src/cli.mjs');

beforeEach(() => {
  runMcpInstall.mockClear();
});

async function consentFor(args) {
  await run(['mcp', '--json', ...args]);
  expect(runMcpInstall).toHaveBeenCalledTimes(1);
  return runMcpInstall.mock.calls[0][0].agentInstructions;
}

test.each([
  [[]],
  [['--agent-instructions=false']],
  [['--agent-instructions=no']],
  [['--agent-instructions=0']],
  [['--agent-instructions=']],
  [['--agent-instructions', 'false']],
  [['--agent-instructions=maybe']],
])('%j does not grant consent to write agent instruction files', async (args) => {
  expect(await consentFor(args)).toBe(false);
});

test.each([
  [['--agent-instructions']],
  [['--agent-instructions=true']],
  [['--agent-instructions=yes']],
  [['--agent-instructions=1']],
  [['--agent-instructions', 'YES']],
])('%j grants consent to write agent instruction files', async (args) => {
  expect(await consentFor(args)).toBe(true);
});
