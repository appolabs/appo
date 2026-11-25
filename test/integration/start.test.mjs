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
const ops = await import('../../src/ops.mjs');
const { installMockFetch, resetMockFetch, lastRequest, requests, stubToken } = await import('../helpers/mockFetch.mjs');

const API = ['--api', 'http://test.local'];
const realTty = { in: process.stdin.isTTY, out: process.stdout.isTTY };

async function capture(fn) {
  const log = console.log;
  const err = console.error;
  const out = [];
  const errs = [];
  console.log = (...a) => out.push(a.join(' '));
  console.error = (...a) => errs.push(a.join(' '));
  try {
    return { result: await fn(), out, errs, all: [...out, ...errs].join('\n') };
  } finally {
    console.log = log;
    console.error = err;
  }
}

function setTty(on) {
  process.stdin.isTTY = on;
  process.stdout.isTTY = on;
}

beforeEach(() => {
  state.answers = [];
  state.prompts = [];
  setTty(false);
});

afterEach(() => {
  process.stdin.isTTY = realTty.in;
  process.stdout.isTTY = realTty.out;
  resetMockFetch();
});

export const fixDecision = {
  key: 'fix',
  question: 'Who adapts the website to the app?',
  assistant_may_answer: true,
  options: [
    { key: 'fix=self', value: 'self', label: 'I will', wait: 'now', mcp: { tool: 'start_app', arguments: {} }, cli: { flags: ['--fix', 'self'] } },
    { key: 'fix=appo', value: 'appo', label: 'Appo does', wait: '24-48 hours', mcp: { tool: 'start_app', arguments: {} }, cli: { flags: ['--fix', 'appo'] } },
  ],
};

test('ops.startApp posts only the answers given and returns the unwrapped data', async () => {
  stubToken();
  installMockFetch([{ status: 200, body: { data: { id: 7, decision: null } } }]);
  const data = await ops.startApp('http://test.local', 7, { fix: 'self', phone: undefined, install_only: true });
  expect(lastRequest().method).toBe('POST');
  expect(lastRequest().path).toBe('/api/v1/apps/7/start');
  expect(lastRequest().body).toEqual({ fix: 'self', install_only: true });
  expect(data).toEqual({ id: 7, decision: null });
});

test('an invalid answer flag exits 2 naming the values, before any request', async () => {
  stubToken();
  installMockFetch([]);
  const { result, errs } = await capture(() => run(['start', '7', '--fix', 'maybe', ...API]));
  expect(result).toBe(2);
  expect(errs.join('\n')).toMatch(/--fix .*self or appo/);
  expect(requests.length).toBe(0);
});

test('a pending decision under --json is one input_required envelope, exit 2', async () => {
  stubToken();
  installMockFetch([{ status: 200, body: { data: { id: 7, decision: fixDecision, try: null } } }]);
  const { result, out } = await capture(() => run(['start', '7', '--json', ...API]));
  expect(result).toBe(2);
  expect(JSON.parse(out.join(''))).toEqual({
    error: 'input_required',
    code: 'decision_required',
    message: 'Who adapts the website to the app?',
    details: {
      decision: 'fix',
      question: 'Who adapts the website to the app?',
      assistant_may_answer: true,
      answers: [
        { answer: 'I will', key: 'fix=self', wait: 'now', flags: ['--fix', 'self'] },
        { answer: 'Appo does', key: 'fix=appo', wait: '24-48 hours', flags: ['--fix', 'appo'] },
      ],
    },
  });
});

test('without a terminal the question and each answer with its flags go to stderr, no colour', async () => {
  stubToken();
  installMockFetch([{ status: 200, body: { data: { id: 7, decision: fixDecision, try: null } } }]);
  const { result, errs, all } = await capture(() => run(['start', '7', ...API]));
  expect(result).toBe(2);
  const text = errs.join('\n');
  expect(text).toContain('Who adapts the website to the app?');
  expect(text).toContain('I will: --fix self');
  expect(text).toContain('Appo does: --fix appo');
  expect(all).not.toContain('\x1b');
});

test('the flags of each answer are copied from the server hint', async () => {
  stubToken();
  const odd = { ...fixDecision, options: [{ ...fixDecision.options[0], cli: { flags: ['--fix', 'self', '--extra', 'x'] } }] };
  installMockFetch([{ status: 200, body: { data: { id: 7, decision: odd, try: null } } }]);
  const { out } = await capture(() => run(['start', '7', '--json', ...API]));
  expect(JSON.parse(out.join('')).details.answers[0].flags).toEqual(['--fix', 'self', '--extra', 'x']);
});

const phoneDecision = {
  key: 'phone',
  question: 'Which phone will you try it on?',
  assistant_may_answer: true,
  options: [
    { key: 'phone=iphone', value: 'iphone', label: 'iPhone', wait: 'a few minutes', cli: { flags: ['--phone', 'iphone'] } },
    { key: 'phone=android', value: 'android', label: 'Android', wait: 'now', cli: { flags: ['--phone', 'android'] } },
  ],
};
const helpDecision = {
  key: 'appo_help',
  question: 'Do you want Appo to help with the next steps?',
  assistant_may_answer: false,
  options: [
    { key: 'appo_help=yes', value: 'yes', label: 'Yes', wait: 'a day', cli: { flags: ['--appo-help', 'yes'] } },
    { key: 'appo_help=no', value: 'no', label: 'No', wait: 'none', cli: { flags: ['--appo-help', 'no'] } },
  ],
};
const readyTry = { state: 'ready', message_code: 'ready', message: 'The app is ready to open.', preview_url: 'https://p.example/abc', how_to_open: 'Open the link on your phone.' };
const started = (extra) => ({ status: 200, body: { data: { id: 5, name: 'X', base_url: 'https://x.com', decision: null, try: null, ...extra } } });
const created = { status: 201, body: { data: { id: 5, name: 'X', base_url: 'https://x.com' } } };
const startBodies = () => requests.filter((r) => r.path.endsWith('/start')).map((r) => r.body);

test('new on a terminal walks consent, fix, phone, the link, Enter and the offer of help', async () => {
  stubToken();
  setTty(true);
  installMockFetch([
    created,
    started({ decision: fixDecision }),
    started({ decision: phoneDecision }),
    started({ try: readyTry }),
    started({ try: readyTry, decision: helpDecision }),
    started({ try: readyTry }),
  ]);
  state.answers = ['y', 'y', '1', '2', '', '2'];
  const { result, out } = await capture(() => run(['new', 'https://x.com', ...API]));
  expect(result).toBe(0);
  expect(requests[0].body).toEqual({ name: 'X', base_url: 'https://x.com', owner_authorized: true, accepted_tos: true });
  const bodies = startBodies();
  expect(bodies[0]).toEqual({});
  expect(bodies[1]).toEqual({ fix: 'self' });
  expect(bodies[2]).toEqual({ fix: 'self', phone: 'android' });
  expect(bodies[4]).toEqual({ fix: 'self', phone: 'android', appo_help: 'no' });
  const text = out.join('\n');
  expect(text).toContain('1) I will (now)');
  expect(text).toContain('https://p.example/abc');
  expect(state.prompts.some((p) => p.includes('Press Enter once the app is open on your phone'))).toBe(true);
  expect(text).toContain('Next time: appo start https://x.com --fix self --phone android --appo-help no');
});

test('new without a terminal creates, starts and stops at the decision envelope', async () => {
  stubToken();
  installMockFetch([created, started({ decision: fixDecision })]);
  const { result, errs } = await capture(() => run(['new', 'https://x.com', '--owner-authorized', '--accept-tos', ...API]));
  expect(result).toBe(2);
  expect(errs.join('\n')).toContain('Appo does: --fix appo');
  expect(requests.map((r) => r.path)).toEqual(['/api/v1/apps', '/api/v1/apps/5/start']);
});

test('start on an existing address resumes it with the answers from the flags', async () => {
  stubToken();
  installMockFetch([
    { status: 200, body: { data: [{ id: 5, name: 'X', base_url: 'https://www.x.com/' }] } },
    started({ try: readyTry }),
  ]);
  const { result, all } = await capture(() => run(['start', 'https://x.com', '--fix', 'self', '--phone', 'android', ...API]));
  expect(result).toBe(0);
  expect(requests.map((r) => r.method + ' ' + r.path)).toEqual(['GET /api/v1/apps', 'POST /api/v1/apps/5/start']);
  expect(startBodies()).toEqual([{ fix: 'self', phone: 'android' }]);
  expect(all).toContain('https://p.example/abc');
  expect(all).not.toContain('\x1b');
});

test('start on an unknown address without consent flags returns attestation_required and creates nothing', async () => {
  stubToken();
  installMockFetch([{ status: 200, body: { data: [] } }]);
  const { result, errs } = await capture(() => run(['start', 'https://new.com', ...API]));
  expect(result).toBe(2);
  expect(errs.join('\n')).toContain('--owner-authorized --accept-tos');
  expect(requests.some((r) => r.method === 'POST')).toBe(false);
});

test('install posts install_only, prints the link and does not wait', async () => {
  stubToken();
  setTty(true);
  installMockFetch([started({ try: readyTry })]);
  const { result, out } = await capture(() => run(['install', '7', '--phone', 'iphone', '--iphone', 'direct', ...API]));
  expect(result).toBe(0);
  expect(startBodies()).toEqual([{ phone: 'iphone', iphone_try: 'direct', install_only: true }]);
  expect(out.join('\n')).toContain('https://p.example/abc');
  expect(state.prompts.length).toBe(0);
});

test('a state that is not ready prints the message and when to check again', async () => {
  stubToken();
  installMockFetch([started({ try: { state: 'preparing', message: 'Appo is adapting the site.', recheck_after_minutes: 360 } })]);
  const { result, out } = await capture(() => run(['start', '5', ...API]));
  expect(result).toBe(0);
  expect(out.join('\n')).toContain('Appo is adapting the site.');
  expect(out.join('\n')).toContain('Check again in about 6 hours');
});

test('--json on a ready start prints exactly the V1 response body', async () => {
  stubToken();
  const body = { data: { id: 5, decision: null, try: readyTry } };
  installMockFetch([{ status: 200, body }]);
  const { result, out } = await capture(() => run(['start', '5', '--json', ...API]));
  expect(result).toBe(0);
  expect(out.length).toBe(1);
  expect(JSON.parse(out[0])).toEqual(body);
});

const consent422 = { status: 422, body: { error: 'validation_failed', message: 'Consent missing.', details: { owner_authorized: ['required'], accepted_tos: ['required'] } } };

test('a consent 422 on a terminal asks the two questions and retries the same start', async () => {
  stubToken();
  setTty(true);
  installMockFetch([consent422, started({ try: readyTry })]);
  state.answers = ['y', 'y', ''];
  const { result } = await capture(() => run(['start', '5', '--fix', 'appo', ...API]));
  expect(result).toBe(0);
  const bodies = startBodies();
  expect(bodies[0]).toEqual({ fix: 'appo' });
  expect(bodies[1]).toEqual({ fix: 'appo', owner_authorized: true, accepted_tos: true });
});

test('a consent 422 without a terminal prints attestation_required, exit 2', async () => {
  stubToken();
  installMockFetch([consent422]);
  const { result, errs } = await capture(() => run(['start', '5', '--fix', 'appo', ...API]));
  expect(result).toBe(2);
  expect(errs.join('\n')).toContain('--owner-authorized --accept-tos');
  expect(startBodies().length).toBe(1);
});

test('a refusal of the consent exits 1 and sends nothing more', async () => {
  stubToken();
  setTty(true);
  installMockFetch([consent422]);
  state.answers = ['n'];
  const { result } = await capture(() => run(['start', '5', '--fix', 'appo', ...API]));
  expect(result).toBe(1);
  expect(startBodies().length).toBe(1);
});

test('start with no argument resolves the only app; with none it asks the address on a terminal', async () => {
  stubToken();
  installMockFetch([
    { status: 200, body: { data: [{ id: 7, name: 'Pizza', base_url: 'https://pizza.it' }] } },
    started({ try: readyTry }),
  ]);
  const one = await capture(() => run(['start', ...API]));
  expect(one.result).toBe(0);
  expect(one.out.join('\n')).toContain('Using Pizza (id 7), your only app.');
  expect(requests[1].path).toBe('/api/v1/apps/7/start');

  resetMockFetch();
  setTty(true);
  installMockFetch([{ status: 200, body: { data: [] } }]);
  state.answers = ['https://new.com', 'n'];
  const none = await capture(() => run(['start', ...API]));
  expect(state.prompts[0]).toBe('Site URL: ');
  expect(none.result).toBe(1);

  resetMockFetch();
  setTty(false);
  installMockFetch([{ status: 200, body: { data: [] } }]);
  const quiet = await capture(() => run(['start', ...API]));
  expect(quiet.result).toBe(1);
  expect(quiet.errs.join('\n')).toContain('No apps yet. Run: appo start <url>');
});
