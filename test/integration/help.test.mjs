import { test, expect, afterEach } from 'vitest';
import { run } from '../../src/cli.mjs';
import { installMockFetch, resetMockFetch, requests, stubToken } from '../helpers/mockFetch.mjs';

// Capture console.log output around an async call.
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

const LIFECYCLE_VERBS = [
  'new',
  'start',
  'install',
  'ship',
  'status',
  'push',
  'rejection',
  'fix-recipe',
  'download',
  'devices list',
  'mcp',
  'login',
  'logout',
  'whoami',
  'env list',
  'init',
  'upgrade',
];

afterEach(() => resetMockFetch());

test('--help returns 0 and lists one verb per act', async () => {
  const { result, lines } = await captureLog(() => run(['--help']));
  expect(result).toBe(0);
  const out = lines.join('\n');
  for (const verb of LIFECYCLE_VERBS) {
    expect(out).toMatch(new RegExp(`\\bappo ${verb.replace('-', '\\-')}\\b`));
  }
});

test('--help documents the exit-code taxonomy (0/1/2/3)', async () => {
  const { lines } = await captureLog(() => run(['--help']));
  const out = lines.join('\n');
  expect(out).toMatch(/Exit codes/);
  expect(out).toMatch(/\b0\b.*success/i);
  expect(out).toMatch(/\b1\b.*error/i);
  expect(out).toMatch(/\b2\b.*usage/i);
  expect(out).toMatch(/\b3\b.*confirm required/i);
});

test('-h short flag prints help and returns 0', async () => {
  const { result, lines } = await captureLog(() => run(['-h']));
  expect(result).toBe(0);
  expect(lines.join('\n')).toMatch(/appo — create and manage Appo apps/);
});

test('--help leads with the lifecycle and hides the old verbs', async () => {
  const { lines } = await captureLog(() => run(['--help']));
  const out = lines.join('\n');
  expect(out.indexOf('Start here:')).toBeGreaterThan(-1);
  expect(out.indexOf('Start here:')).toBeLessThan(out.indexOf('Auth:'));
  expect(out).not.toContain('apps create');
  expect(out).not.toContain('publish <id>');
  expect(out).not.toContain('appo run');
  expect(out.match(/apps update/g)).toHaveLength(1);
});

test('no args without a token prints the short help', async () => {
  const { result, lines } = await captureLog(() => run(['--api', 'http://nowhere.local', '--env', 'no-such-env']));
  expect(result).toBe(0);
  const out = lines.join('\n');
  expect(out.split('\n').length).toBeLessThanOrEqual(12);
  expect(out).toContain('appo --help for every command');
});

test('no args with zero apps prints the short help leading with new and start', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: [] } });
  const { result, lines } = await captureLog(() => run(['--api', 'http://test.local']));
  expect(result).toBe(0);
  const commands = lines.join('\n').split('\n').filter((l) => /^\s+appo /.test(l));
  expect(commands[0]).toMatch(/^\s+appo new <url>/);
  expect(commands[1]).toMatch(/^\s+appo start <url>/);
  expect(lines.join('\n').split('\n').length).toBeLessThanOrEqual(12);
});

test('no args with several apps prints the short help and the list', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: [
    { id: 7, name: 'Shop', base_url: 'https://shop.example' },
    { id: 9, name: 'Blog', base_url: 'https://blog.example' },
  ] } });
  const { result, lines } = await captureLog(() => run(['--api', 'http://test.local']));
  expect(result).toBe(0);
  const out = lines.join('\n');
  expect(out).toContain('appo new <url>');
  expect(out).toContain('Shop');
  expect(out).toContain('Blog');
});

test('no args with one app runs the start loop for it', async () => {
  stubToken();
  installMockFetch([
    { status: 200, body: { data: [{ id: 7, name: 'Shop', base_url: 'https://shop.example' }] } },
    { status: 200, body: { data: { id: 7, decision: null, install: { state: 'preparing', message: 'Appo is adapting the site.' } } } },
  ]);
  const { result, lines } = await captureLog(() => run(['--api', 'http://test.local']));
  expect(result).toBe(0);
  expect(requests[1].method).toBe('POST');
  expect(requests[1].path).toBe('/api/v1/apps/7/start');
  expect(lines.join('\n')).toContain('Appo is adapting the site.');
});

test('status prints sentences, not raw keys', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: {
    id: 7, name: 'Shop', base_url: 'https://shop.example', publication_state: 'in_review',
    primary_action: 'start', ios_bundle_id: 'com.x.y', android_package_name: 'com.x.y',
    decision: { key: 'fix', question: 'Who adapts the website?' },
    install: { state: 'preparing', message: 'Appo is adapting the site.' },
  } } });
  const { lines } = await captureLog(() => run(['status', '7', '--api', 'http://test.local']));
  const out = lines.join('\n');
  expect(out).toContain('Shop (https://shop.example)');
  expect(out).toContain('In review at Apple and Google.');
  expect(out).toContain('Next: start it on your phone with appo start');
  expect(out).toContain('Next question: Who adapts the website?');
  expect(out).toContain('Appo is adapting the site.');
  for (const key of ['publication_state', 'primary_action', 'ios_bundle_id', 'android_package']) {
    expect(out).not.toContain(key);
  }
});

test('--help carries no preview or try wording', async () => {
  const { lines } = await captureLog(() => run(['--help']));
  const out = lines.join('\n');
  expect(out).not.toMatch(/preview|\btry it\b|\btry\b/i);
});
