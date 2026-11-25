import { test, describe, afterEach, beforeEach, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from '../../src/cli.mjs';
import { installMockFetch, resetMockFetch, lastRequest, requests, stubToken } from '../helpers/mockFetch.mjs';

const API = ['--api', 'http://test.local'];
let tmp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'appo-customize-'));
});
afterEach(() => {
  resetMockFetch();
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function capture(argv) {
  const out = [];
  const err = [];
  const log = vi.spyOn(console, 'log').mockImplementation((...a) => out.push(a.join(' ')));
  const error = vi.spyOn(console, 'error').mockImplementation((...a) => err.push(a.join(' ')));
  try {
    const result = await run(argv);
    return { result, out: out.join('\n'), err: err.join('\n') };
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
}

function stubStdin(text) {
  const original = fs.readFileSync;
  vi.spyOn(fs, 'readFileSync').mockImplementation((p, ...rest) => (p === 0 ? text : original(p, ...rest)));
}

const block = { injected_css: 'a{color:red}', injected_javascript: null };
const readBody = { app: 7, fields: [], previous_block: block, css_bytes: 12, js_bytes: 0, limit_bytes: 50000, preparation: {} };
const dryBody = {
  will: 'customize', app: 7, fields: ['injected_css'], block: { injected_css: 'rewrite', injected_javascript: 'none' },
  css_bytes: 4, js_bytes: 0, limit_bytes: 50000, previous_block: block, confirm_required: true, note: 'Server note.',
};
const appliedBody = { customized: true, app: 7, fields: ['injected_css'], previous_block: block };

describe('appo customize', () => {
  test('read: one PATCH with empty body, prints the block and bytes, exit 0', async () => {
    stubToken();
    installMockFetch({ status: 200, body: readBody });
    const { result, out } = await capture(['customize', '7', ...API]);
    expect(result).toBe(0);
    expect(requests.length).toBe(1);
    expect(lastRequest().method).toBe('PATCH');
    expect(lastRequest().body).toEqual({});
    expect(out).toContain('CSS: 12 of 50000 bytes');
    expect(out).toContain('a{color:red}');
    expect(out).toContain('Current JavaScript block: none');
    expect(out).not.toMatch(/preview/i);
  });

  test('--out writes the block bodies to files and prints the paths', async () => {
    stubToken();
    installMockFetch({ status: 200, body: readBody });
    const { result, out } = await capture(['customize', '7', '--out', tmp, ...API]);
    expect(result).toBe(0);
    expect(fs.readFileSync(path.join(tmp, 'appo-assistant.css'), 'utf8')).toBe('a{color:red}');
    expect(fs.existsSync(path.join(tmp, 'appo-assistant.js'))).toBe(false);
    expect(out).toContain(path.join(tmp, 'appo-assistant.css'));
  });

  test('--out refuses to overwrite a differing file, identical content is kept', async () => {
    stubToken();
    fs.writeFileSync(path.join(tmp, 'appo-assistant.css'), 'edited');
    installMockFetch({ status: 200, body: readBody });
    const { result, err } = await capture(['customize', '7', '--out', tmp, ...API]);
    expect(result).toBe(2);
    expect(err).toContain('appo-assistant.css');
    expect(fs.readFileSync(path.join(tmp, 'appo-assistant.css'), 'utf8')).toBe('edited');

    fs.writeFileSync(path.join(tmp, 'appo-assistant.css'), 'a{color:red}');
    installMockFetch({ status: 200, body: readBody });
    const again = await capture(['customize', '7', '--out', tmp, ...API]);
    expect(again.result).toBe(0);
  });

  test('dry run: no confirm key, no mode key, actions and bytes printed, exit 3', async () => {
    stubToken();
    installMockFetch({ status: 200, body: dryBody });
    const { result, out } = await capture(['customize', '7', '--css', 'a{}', ...API]);
    expect(result).toBe(3);
    expect(lastRequest().body).toEqual({ injected_css: 'a{}' });
    expect('confirm' in lastRequest().body).toBe(false);
    expect('mode' in lastRequest().body).toBe(false);
    expect(out).toContain('Dry run: nothing written.');
    expect(out).toContain('CSS: rewrite the block; 4 of 50000 bytes');
    expect(out).toContain('JavaScript: no block, nothing removed');
    expect(out).toContain('a{color:red}');
    expect(out).toContain('Add --confirm to write it.');
    expect(out).not.toMatch(/preview/i);
  });

  test('action words for insert and remove', async () => {
    stubToken();
    installMockFetch({ status: 200, body: { ...dryBody, block: { injected_css: 'insert', injected_javascript: 'remove' } } });
    const { out } = await capture(['customize', '7', '--css', 'a{}', '--js', '', ...API]);
    expect(out).toContain('CSS: create the block');
    expect(out).toContain('JavaScript: remove the block');
  });

  test('--confirm sends confirm true and prints the written fields, exit 0', async () => {
    stubToken();
    installMockFetch({ status: 200, body: appliedBody });
    const { result, out } = await capture(['customize', '7', '--css', 'a{}', '--confirm', ...API]);
    expect(result).toBe(0);
    expect(lastRequest().body).toEqual({ injected_css: 'a{}', confirm: true });
    expect('mode' in lastRequest().body).toBe(false);
    expect(out).toContain('Written: CSS.');
    expect(out).not.toMatch(/preview/i);
  });

  test('no-op prints that nothing changed, exit 0', async () => {
    stubToken();
    installMockFetch({ status: 200, body: { customized: false, app: 7, fields: [], previous_block: block } });
    const { result, out } = await capture(['customize', '7', '--css', 'a{}', '--confirm', ...API]);
    expect(result).toBe(0);
    expect(out).toContain('Nothing changed.');
  });

  test('--css-file reads the file', async () => {
    stubToken();
    const file = path.join(tmp, 'x.css');
    fs.writeFileSync(file, 'b{}');
    installMockFetch({ status: 200, body: dryBody });
    await capture(['customize', '7', '--css-file', file, ...API]);
    expect(lastRequest().body).toEqual({ injected_css: 'b{}' });
  });

  test('--css-file - and --js-file - read stdin', async () => {
    stubToken();
    stubStdin('c{}');
    installMockFetch({ status: 200, body: dryBody });
    await capture(['customize', '7', '--css-file', '-', ...API]);
    expect(lastRequest().body).toEqual({ injected_css: 'c{}' });
    installMockFetch({ status: 200, body: dryBody });
    await capture(['customize', '7', '--js-file', '-', ...API]);
    expect(lastRequest().body).toEqual({ injected_javascript: 'c{}' });
  });

  test('both file flags set to - is exit 2 with no request', async () => {
    stubToken();
    installMockFetch({ status: 200, body: dryBody });
    const { result } = await capture(['customize', '7', '--css-file', '-', '--js-file', '-', ...API]);
    expect(result).toBe(2);
    expect(requests.length).toBe(0);
  });

  test('inline value with its file twin is exit 2', async () => {
    stubToken();
    installMockFetch({ status: 200, body: dryBody });
    expect((await capture(['customize', '7', '--css', 'a{}', '--css-file', 'x', ...API])).result).toBe(2);
    expect((await capture(['customize', '7', '--js', 'a', '--js-file', 'x', ...API])).result).toBe(2);
    expect(requests.length).toBe(0);
  });

  test('bare --css is exit 2', async () => {
    stubToken();
    installMockFetch({ status: 200, body: dryBody });
    const { result } = await capture(['customize', '7', '--css', ...API]);
    expect(result).toBe(2);
    expect(requests.length).toBe(0);
  });

  test('--css with an empty value sends an empty string', async () => {
    stubToken();
    installMockFetch({ status: 200, body: dryBody });
    await capture(['customize', '7', '--css', '', ...API]);
    expect(lastRequest().body).toEqual({ injected_css: '' });
  });

  test('--preset is sent with the code', async () => {
    stubToken();
    installMockFetch({ status: 200, body: dryBody });
    await capture(['customize', '7', '--css', 'a{}', '--preset', 'safe-area', ...API]);
    expect(lastRequest().body).toEqual({ injected_css: 'a{}', preset: 'safe-area' });
  });

  test('--out with --confirm is exit 2', async () => {
    stubToken();
    installMockFetch({ status: 200, body: appliedBody });
    const { result } = await capture(['customize', '7', '--out', tmp, '--confirm', ...API]);
    expect(result).toBe(2);
    expect(requests.length).toBe(0);
  });

  test('422 refusal prints the message, exit 1', async () => {
    stubToken();
    installMockFetch({ status: 422, body: { error: 'validation_error', code: 'too_large', message: 'The block is too large.' } });
    const { result, err } = await capture(['customize', '7', '--css', 'a{}', '--confirm', ...API]);
    expect(result).toBe(1);
    expect(err).toContain('Error: The block is too large.');
  });

  test('--json: dry run exits 3, read and confirmed exit 0, body printed', async () => {
    stubToken();
    installMockFetch({ status: 200, body: dryBody });
    const dry = await capture(['customize', '7', '--css', 'a{}', '--json', ...API]);
    expect(dry.result).toBe(3);
    expect(JSON.parse(dry.out)).toEqual(dryBody);
    installMockFetch({ status: 200, body: readBody });
    expect((await capture(['customize', '7', '--json', ...API])).result).toBe(0);
    installMockFetch({ status: 200, body: appliedBody });
    const done = await capture(['customize', '7', '--css', 'a{}', '--confirm', '--json', ...API]);
    expect(done.result).toBe(0);
    expect(JSON.parse(done.out)).toEqual(appliedBody);
  });

  test('missing id without a terminal is exit 2 with usage', async () => {
    stubToken();
    const { result, err } = await capture(['customize', ...API]);
    expect(result).toBe(2);
    expect(err).toContain('Usage: appo customize <id>');
  });

  test('unreadable --css-file is exit 2 naming the path', async () => {
    stubToken();
    installMockFetch({ status: 200, body: dryBody });
    const missing = path.join(tmp, 'nope.css');
    const { result, err } = await capture(['customize', '7', '--css-file', missing, ...API]);
    expect(result).toBe(2);
    expect(err).toContain(missing);
    expect(requests.length).toBe(0);
  });

  test('control characters in server text are stripped', async () => {
    stubToken();
    installMockFetch({ status: 200, body: { ...dryBody, note: 'ok\u001b[31mred' } });
    const { out } = await capture(['customize', '7', '--css', 'a{}', ...API]);
    expect(out).not.toContain('\u001b');
  });
});
