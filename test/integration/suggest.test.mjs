import { test, describe, afterEach, expect } from 'vitest';
import * as ops from '../../src/ops.mjs';
import { run } from '../../src/cli.mjs';
import {
  installMockFetch,
  resetMockFetch,
  lastRequest,
  requests,
  stubToken,
} from '../helpers/mockFetch.mjs';

afterEach(() => resetMockFetch());

const API_BASE = 'http://test.local';

describe('ops: 281-07 transport', () => {
  test('getAdaptationBrief issues GET with no body and returns the flat body', async () => {
    stubToken();
    installMockFetch({ status: 200, body: { app: 7, site: null } });
    const res = await ops.getAdaptationBrief(API_BASE, 7);
    expect(res).toEqual({ app: 7, site: null });
    expect(requests.length).toBe(1);
    expect(lastRequest().method).toBe('GET');
    expect(lastRequest().url).toBe('http://test.local/api/v1/apps/7/adaptation-brief');
    expect(lastRequest().body).toBeNull();
  });

  test('removeApp without confirm sends no query string', async () => {
    stubToken();
    installMockFetch({ status: 200, body: { will: 'delete', confirm_required: true } });
    await ops.removeApp(API_BASE, 7, { confirm: false });
    expect(lastRequest().method).toBe('DELETE');
    expect(lastRequest().url).toBe('http://test.local/api/v1/apps/7');
    expect(lastRequest().body).toBeNull();
  });

  test('removeApp with confirm sends ?confirm=1 and no body', async () => {
    stubToken();
    installMockFetch({ status: 200, body: { deleted: true } });
    const res = await ops.removeApp(API_BASE, 7, { confirm: true });
    expect(res).toEqual({ deleted: true });
    expect(lastRequest().url).toBe('http://test.local/api/v1/apps/7?confirm=1');
    expect(lastRequest().body).toBeNull();
  });

  test('customizeAppearance PATCHes the body and returns the flat body', async () => {
    stubToken();
    installMockFetch({ status: 200, body: { data: 'kept', applied: true } });
    const res = await ops.customizeAppearance(API_BASE, 7, { injected_css: 'a{}', confirm: true });
    expect(res).toEqual({ data: 'kept', applied: true });
    expect(lastRequest().method).toBe('PATCH');
    expect(lastRequest().url).toBe('http://test.local/api/v1/apps/7/appearance');
    expect(lastRequest().body).toEqual({ injected_css: 'a{}', confirm: true });
  });

  test('requestTestFlightBuild POSTs with no body and unwraps data', async () => {
    stubToken();
    installMockFetch({ status: 202, body: { data: { id: 3 } } });
    const res = await ops.requestTestFlightBuild(API_BASE, 7);
    expect(res).toEqual({ id: 3 });
    expect(lastRequest().method).toBe('POST');
    expect(lastRequest().url).toBe('http://test.local/api/v1/apps/7/builds/testflight');
    expect(lastRequest().body).toBeNull();
  });
});

async function captureLog(fn) {
  const original = console.log;
  const lines = [];
  console.log = (...args) => lines.push(args.join(' '));
  try {
    const result = await fn();
    return { result, lines };
  } finally {
    console.log = original;
  }
}

async function silentRun(argv) {
  const original = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args.join(' '));
  try {
    const result = await run(argv);
    return { result, errors };
  } finally {
    console.error = original;
  }
}

const API = ['--api', 'http://test.local'];

function brief(overrides = {}) {
  return {
    app: 7,
    base_url: 'https://example.com',
    prep_mode: 'self_managed',
    preparation: { mode: 'self_managed', status: 'in_progress' },
    reviewed_at: null,
    wrapper: [
      { id: 'syntax', statement: 'Write plain CSS and JavaScript with appo customize.' },
      { id: 'insets', statement: 'Safe-area insets arrive as CSS variables.' },
      { id: 'injection_timing', statement: 'Scripts run after the page has loaded.' },
      { id: 'cascade', statement: 'Injected CSS loads after the site stylesheets.' },
      { id: 'ascii', statement: 'Keep injected code in ASCII.' },
      { id: 'global_scope', statement: 'Scripts share the global scope; see appo customize.' },
    ],
    policy: [{ id: 'confirm_first', statement: 'Changes are written after the owner agrees.' }],
    cookie_check: { state: 'ok' },
    site: {
      reading_fetched_at: '2026-11-20T09:30:00+00:00',
      consent_managers: [],
      age_gate: null,
      findings: [
        { id: 'fixed_header', label: 'Fixed header', finding: 'The header sits under the status bar.', fix: 'Add top padding with the inset variable.' },
        { id: 'cookie_bar', label: 'Cookie bar', finding: 'A bar covers the bottom edge.', fix: 'Raise it above the bottom inset.' },
      ],
    },
    site_note: null,
    ...overrides,
  };
}

describe('appo suggest', () => {
  test('lists findings with their fix before any contract line, exit 0', async () => {
    stubToken();
    installMockFetch({ status: 200, body: brief() });
    const { result, lines } = await captureLog(() => run(['suggest', '7', ...API]));
    expect(result).toBe(0);
    const out = lines.join('\n');
    expect(out).toContain('- Fixed header: The header sits under the status bar.');
    expect(out).toContain('Fix: Add top padding with the inset variable.');
    expect(out).toContain('- Cookie bar: A bar covers the bottom edge.');
    expect(out.indexOf('Fixed header')).toBeLessThan(out.indexOf('Web view contract:'));
    expect(out.indexOf('Cookie bar')).toBeLessThan(out.indexOf('Web view contract:'));
  });

  test('prints the date of the stored reading', async () => {
    stubToken();
    installMockFetch({ status: 200, body: brief() });
    const { lines } = await captureLog(() => run(['suggest', '7', ...API]));
    expect(lines[0]).toBe('Site findings (stored reading of 2026-11-20):');
  });

  test('site null prints the server note and still the contract reference', async () => {
    stubToken();
    installMockFetch({ status: 200, body: brief({ site: null, site_note: 'No reading yet. Run appo apps check 7.' }) });
    const { result, lines } = await captureLog(() => run(['suggest', '7', ...API]));
    expect(result).toBe(0);
    const out = lines.join('\n');
    expect(out).toContain('No reading yet. Run appo apps check 7.');
    expect(out).toContain('Web view contract:');
  });

  test('site present without findings prints one line saying none bears on adapting', async () => {
    stubToken();
    installMockFetch({ status: 200, body: brief({ site: { reading_fetched_at: '2026-11-20T09:30:00+00:00', consent_managers: [], age_gate: null, findings: [] } }) });
    const { lines } = await captureLog(() => run(['suggest', '7', ...API]));
    expect(lines.filter((l) => l.includes('No finding bears on adapting the site.')).length).toBe(1);
  });

  test('contract reference prints the four wrapper entries and the json pointer', async () => {
    stubToken();
    installMockFetch({ status: 200, body: brief() });
    const { lines } = await captureLog(() => run(['suggest', '7', ...API]));
    const out = lines.join('\n');
    expect(out).toContain('insets: Safe-area insets arrive as CSS variables.');
    expect(out).toContain('injection_timing: Scripts run after the page has loaded.');
    expect(out).toContain('cascade: Injected CSS loads after the site stylesheets.');
    expect(out).toContain('ascii: Keep injected code in ASCII.');
    expect(out).not.toContain('syntax:');
    expect(out).toContain('Full contract and policy: appo suggest 7 --json');
  });

  test('preparation prints on one line', async () => {
    stubToken();
    installMockFetch({ status: 200, body: brief() });
    const { lines } = await captureLog(() => run(['suggest', '7', ...API]));
    expect(lines.filter((l) => l === 'Preparation: self_managed (in_progress)').length).toBe(1);
  });

  test('--json prints the body unchanged', async () => {
    stubToken();
    const body = brief();
    installMockFetch({ status: 200, body });
    const { result, lines } = await captureLog(() => run(['suggest', '7', '--json', ...API]));
    expect(result).toBe(0);
    const printed = JSON.parse(lines.join('\n'));
    expect(printed).toEqual(body);
    expect(printed.wrapper.find((w) => w.id === 'syntax').statement).toContain('appo customize');
    expect(printed.policy.map((p) => p.id)).not.toContain('assistant_writes');
    expect(lines.join('\n')).not.toMatch(/customize_appearance|preview|assistant/i);
  });

  test('human output carries no tool-surface vocabulary', async () => {
    stubToken();
    installMockFetch({ status: 200, body: brief() });
    const { lines } = await captureLog(() => run(['suggest', '7', ...API]));
    expect(lines.join('\n')).not.toMatch(/customize_appearance|preview|assistant/i);
  });

  test('sends exactly one GET', async () => {
    stubToken();
    installMockFetch({ status: 200, body: brief() });
    await captureLog(() => run(['suggest', '7', ...API]));
    expect(requests.length).toBe(1);
    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toBe('http://test.local/api/v1/apps/7/adaptation-brief');
  });

  test('server strings are stripped of control characters', async () => {
    stubToken();
    const b = brief();
    b.site.findings[0].finding = 'Bad\u001b[31m text';
    installMockFetch({ status: 200, body: b });
    const { lines } = await captureLog(() => run(['suggest', '7', ...API]));
    expect(lines.join('\n')).not.toContain('\u001b');
  });

  test('no id without a terminal exits 2 with usage', async () => {
    stubToken();
    installMockFetch({ status: 200, body: brief() });
    const { result, errors } = await silentRun(['suggest', ...API]);
    expect(result).toBe(2);
    expect(errors.join('\n')).toContain('Usage: appo suggest <id>');
    expect(requests.length).toBe(0);
  });

  test('API 404 exits 1', async () => {
    stubToken();
    installMockFetch({ status: 404, body: { message: 'Not found' } });
    const { result } = await silentRun(['suggest', '99', ...API]);
    expect(result).toBe(1);
  });
});
