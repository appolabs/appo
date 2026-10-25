import { test, afterEach, beforeEach, expect, vi } from 'vitest';

// Scripted answers for askLine: each readline question consumes the next answer.
const state = vi.hoisted(() => ({ answers: [], prompts: [] }));

vi.mock('node:readline/promises', () => ({
  createInterface: () => ({
    once: () => {},
    close: () => {},
    question: (q) => {
      state.prompts.push(q);
      return Promise.resolve(state.answers.shift() ?? '');
    },
  }),
}));

const { run } = await import('../../src/cli.mjs');
const { installMockFetch, resetMockFetch, lastRequest, requests, stubToken } = await import('../helpers/mockFetch.mjs');

const API = ['--api', 'http://test.local'];
const realTty = { in: process.stdin.isTTY, out: process.stdout.isTTY };

async function capture(fn) {
  const log = console.log;
  const err = console.error;
  const lines = [];
  console.log = (...a) => lines.push(a.join(' '));
  console.error = (...a) => lines.push(a.join(' '));
  try {
    return { result: await fn(), lines };
  } finally {
    console.log = log;
    console.error = err;
  }
}

beforeEach(() => {
  state.answers = [];
  state.prompts = [];
  process.stdin.isTTY = true;
  process.stdout.isTTY = true;
});

afterEach(() => {
  process.stdin.isTTY = realTty.in;
  process.stdout.isTTY = realTty.out;
  resetMockFetch();
});

const created = { status: 201, body: { data: { id: 5, name: 'X', base_url: 'https://x.com' } } };
const newArgs = ['new', '--url', 'https://x.com', '--name', 'X', ...API];

test('a developer maintains the code: y creates self_managed', async () => {
  stubToken();
  installMockFetch([created]);
  state.answers = ['y', 'n'];
  const { result } = await capture(() => run(newArgs));
  expect(result).toBe(0);
  expect(lastRequest().body).toEqual({ name: 'X', base_url: 'https://x.com', prep_mode: 'self_managed' });
});

test('n then y, y creates appo_managed with the attestation and shows the Terms link', async () => {
  stubToken();
  installMockFetch([created]);
  state.answers = ['n', 'y', 'y', 'n'];
  const { result, lines } = await capture(() => run(newArgs));
  expect(result).toBe(0);
  expect(lastRequest().body).toEqual({
    name: 'X', base_url: 'https://x.com', prep_mode: 'appo_managed', owner_authorized: true, accepted_tos: true,
  });
  const shown = [...state.prompts, ...lines].join('\n');
  expect(shown).toContain('https://goappo.io/en/terms');
  expect(shown).toContain('24-48 hours');
  expect(state.prompts.length).toBeGreaterThanOrEqual(3);
});

test('the user-facing text never uses the internal terms', async () => {
  stubToken();
  installMockFetch([created]);
  state.answers = ['n', 'y', 'y', 'n'];
  const { lines } = await capture(() => run(newArgs));
  const shown = [...state.prompts, ...lines.filter((l) => !/^Created app|url:|appo (run|ship)/.test(l))].join('\n');
  expect(shown).not.toMatch(/prep/i);
});

test('n then n creates nothing and exits 1', async () => {
  stubToken();
  installMockFetch([created]);
  state.answers = ['n', 'n'];
  const { result } = await capture(() => run(newArgs));
  expect(result).toBe(1);
  expect(requests.length).toBe(0);
});

test('n, y, n (Terms refused) creates nothing and exits 1', async () => {
  stubToken();
  installMockFetch([created]);
  state.answers = ['n', 'y', 'n'];
  const { result } = await capture(() => run(newArgs));
  expect(result).toBe(1);
  expect(requests.length).toBe(0);
});
