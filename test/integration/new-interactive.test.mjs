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
const { installMockFetch, resetMockFetch, requests, stubToken } = await import('../helpers/mockFetch.mjs');

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

test('y, y creates with both consents and asks no preparation question', async () => {
  stubToken();
  installMockFetch([created]);
  state.answers = ['y', 'y'];
  const { result, lines } = await capture(() => run(newArgs));
  expect(result).toBe(0);
  expect(requests[0].body).toEqual({ name: 'X', base_url: 'https://x.com', owner_authorized: true, accepted_tos: true });
  const shown = [...state.prompts, ...lines].join('\n');
  expect(shown).toContain('https://goappo.io/en/terms');
  expect(shown).not.toMatch(/maintain this website|prep/i);
  expect(state.prompts[0]).toMatch(/own this website/);
  expect(state.prompts[1]).toMatch(/Terms of Service/);
});

test('owner confirmed, Terms refused: nothing is created, exit 1', async () => {
  stubToken();
  installMockFetch([created]);
  state.answers = ['y', 'n'];
  const { result } = await capture(() => run(newArgs));
  expect(result).toBe(1);
  expect(requests.length).toBe(0);
});

test('owner not confirmed: nothing is created, exit 1', async () => {
  stubToken();
  installMockFetch([created]);
  state.answers = ['n'];
  const { result } = await capture(() => run(newArgs));
  expect(result).toBe(1);
  expect(requests.length).toBe(0);
});

test('the site URL is asked when missing', async () => {
  stubToken();
  installMockFetch([created]);
  state.answers = ['x.com', 'y', 'y'];
  const { result } = await capture(() => run(['new', ...API]));
  expect(result).toBe(0);
  expect(state.prompts[0]).toBe('Site URL: ');
  expect(requests[0].body.base_url).toBe('https://x.com');
});
