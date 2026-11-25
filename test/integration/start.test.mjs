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

// No real agent CLI is looked up, no real browser login is started.
const agents = vi.hoisted(() => ({ found: [], install: null, login: null }));

vi.mock('../../src/mcp.mjs', async (importOriginal) => {
  const original = /** @type {Record<string, any>} */ (await importOriginal());
  return {
    ...original,
    detectAgents: () => agents.found,
    runMcpInstall: (...a) => agents.install(...a),
  };
});

vi.mock('../../src/login.mjs', async (importOriginal) => {
  const original = /** @type {Record<string, any>} */ (await importOriginal());
  return { ...original, login: (...a) => agents.login(...a) };
});

const { run } = await import('../../src/cli.mjs');
const ops = await import('../../src/ops.mjs');
const { writeConfig } = await import('../../src/config.mjs');
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
  agents.found = [];
  agents.install = vi.fn(async () => 0);
  agents.login = vi.fn(async () => ({ apiBase: 'http://test.local' }));
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
  installMockFetch([{ status: 200, body: { data: { id: 7, decision: fixDecision, install: null } } }]);
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
  installMockFetch([{ status: 200, body: { data: { id: 7, decision: fixDecision, install: null } } }]);
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
  installMockFetch([{ status: 200, body: { data: { id: 7, decision: odd, install: null } } }]);
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
const readyTry = { state: 'ready', message_code: 'ready', message: 'The app is ready to open.', install_url: 'https://p.example/abc', how_to_open: 'Open the link on your phone.' };
const started = (extra) => ({ status: 200, body: { data: { id: 5, name: 'X', base_url: 'https://x.com', decision: null, install: null, ...extra } } });
const created = { status: 201, body: { data: { id: 5, name: 'X', base_url: 'https://x.com' } } };
const startBodies = () => requests.filter((r) => r.path.endsWith('/start')).map((r) => r.body);

test('new on a terminal walks consent, fix, phone, the link, Enter and the offer of help', async () => {
  stubToken();
  setTty(true);
  installMockFetch([
    created,
    started({ decision: fixDecision }),
    started({ decision: phoneDecision }),
    started({ install: readyTry }),
    started({ install: readyTry, decision: helpDecision }),
    started({ install: readyTry }),
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
    started({ install: readyTry }),
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
  installMockFetch([started({ install: readyTry })]);
  const { result, out } = await capture(() => run(['install', '7', '--phone', 'iphone', '--iphone', 'direct', ...API]));
  expect(result).toBe(0);
  expect(startBodies()).toEqual([{ phone: 'iphone', iphone_install: 'direct', install_only: true }]);
  expect(out.join('\n')).toContain('https://p.example/abc');
  expect(state.prompts.length).toBe(0);
});

test('a state that is not ready prints the message and when to check again', async () => {
  stubToken();
  installMockFetch([started({ install: { state: 'preparing', message: 'Appo is adapting the site.', recheck_after_minutes: 360 } })]);
  const { result, out } = await capture(() => run(['start', '5', ...API]));
  expect(result).toBe(0);
  expect(out.join('\n')).toContain('Appo is adapting the site.');
  expect(out.join('\n')).toContain('Check again in about 6 hours');
});

test('--json on a ready start prints exactly the V1 response body', async () => {
  stubToken();
  const body = { data: { id: 5, decision: null, install: readyTry } };
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
  installMockFetch([consent422, started({ install: readyTry })]);
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
    started({ install: readyTry }),
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

test('the link is printed without ANSI or QR rows when there is no terminal', async () => {
  stubToken();
  installMockFetch([started({ install: readyTry })]);
  const { result, all } = await capture(() => run(['install', '7', ...API]));
  expect(result).toBe(0);
  expect(all).toContain('https://p.example/abc');
  expect(all).not.toContain('\x1b');
  expect(all).not.toMatch(/[▀▄█]/);
});

test('on a terminal the QR rows carry the contrast escape, except under NO_COLOR', async () => {
  stubToken();
  setTty(true);
  installMockFetch([started({ install: readyTry })]);
  const coloured = await capture(() => run(['install', '7', ...API]));
  expect(coloured.all).toContain('\x1b[30;47m');

  resetMockFetch();
  installMockFetch([started({ install: readyTry })]);
  process.env.NO_COLOR = '1';
  try {
    const plain = await capture(() => run(['install', '7', ...API]));
    expect(plain.all).toMatch(/[▀▄█]/);
    expect(plain.all).not.toContain('\x1b');
  } finally {
    delete process.env.NO_COLOR;
  }
});

// --- agent offer (D-14) -------------------------------------------------------

async function startWithFixAnswer(answer, answers) {
  stubToken();
  setTty(true);
  installMockFetch([
    started({ decision: fixDecision }),
    started({ install: readyTry }),
  ]);
  state.answers = answers;
  return capture(() => run(['install', '7', ...API]));
}

test('after fix=self with claude on PATH the CLI names the agent and installs on yes', async () => {
  agents.found = [{ bin: 'claude', name: 'Claude Code' }];
  await startWithFixAnswer('self', ['1', 'y']);
  expect(state.prompts).toContain('Do you want Claude Code to make the fixes? [y/N] ');
  expect(agents.install).toHaveBeenCalledTimes(1);
});

test('the agent offer stays silent with no agent, after fix=appo and without a terminal', async () => {
  await startWithFixAnswer('self', ['1']);
  expect(state.prompts.some((p) => p.includes('make the fixes'))).toBe(false);

  resetMockFetch();
  state.prompts = [];
  agents.found = [{ bin: 'claude', name: 'Claude Code' }];
  await startWithFixAnswer('appo', ['2']);
  expect(state.prompts.some((p) => p.includes('make the fixes'))).toBe(false);

  resetMockFetch();
  state.prompts = [];
  setTty(false);
  installMockFetch([started({ decision: fixDecision })]);
  await capture(() => run(['install', '7', ...API]));
  expect(state.prompts).toEqual([]);
  expect(agents.install).not.toHaveBeenCalled();
});

test('a declined agent offer installs nothing', async () => {
  agents.found = [{ bin: 'codex', name: 'Codex' }];
  await startWithFixAnswer('self', ['1', 'n']);
  expect(state.prompts).toContain('Do you want Codex to make the fixes? [y/N] ');
  expect(agents.install).not.toHaveBeenCalled();
});

// --- sign-up handoff (phase 280 D-09/D-10) -----------------------------------

test('start without a token on a terminal asks whether an account exists and signs up on no', async () => {
  writeConfig({});
  setTty(true);
  installMockFetch([]);
  state.answers = ['n'];
  await capture(() => run(['start', 'https://x.com', ...API]));
  expect(state.prompts[0]).toBe('Do you already have one? [y/N] ');
  expect(agents.login).toHaveBeenCalledWith('http://test.local', expect.anything(), { signup: true });
});

test('answering yes logs in without the sign-up option', async () => {
  writeConfig({});
  setTty(true);
  installMockFetch([]);
  state.answers = ['y'];
  await capture(() => run(['new', 'https://x.com', ...API]));
  expect(agents.login).toHaveBeenCalledWith('http://test.local', expect.anything(), {});
});

test('without a terminal and without a token the CLI exits 1 with the login hint', async () => {
  writeConfig({});
  installMockFetch([]);
  const { result, errs } = await capture(() => run(['start', 'https://x.com', ...API]));
  expect(result).toBe(1);
  expect(errs.join('\n')).toContain('Not authenticated. Run: appo login');
  expect(agents.login).not.toHaveBeenCalled();
});
