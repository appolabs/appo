import { test, describe, afterEach, expect, vi } from 'vitest';
import { run } from '../../src/cli.mjs';
import { installMockFetch, resetMockFetch, lastRequest, requests, stubToken } from '../helpers/mockFetch.mjs';

const API = ['--api', 'http://test.local'];

afterEach(() => {
  resetMockFetch();
  vi.restoreAllMocks();
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

describe('appo testflight', () => {
  test('without --confirm: zero requests, hint, exit 3', async () => {
    stubToken();
    installMockFetch({ status: 202, body: { data: { id: 3, status: 'queued' } } });
    const { result, out } = await capture(['testflight', '7', ...API]);
    expect(result).toBe(3);
    expect(requests.length).toBe(0);
    expect(out).toContain('re-run with --confirm');
  });

  test('--json without --confirm prints the gate body, exit 3', async () => {
    stubToken();
    installMockFetch({ status: 202, body: { data: { id: 3 } } });
    const { result, out } = await capture(['testflight', '7', '--json', ...API]);
    expect(result).toBe(3);
    expect(requests.length).toBe(0);
    expect(JSON.parse(out)).toEqual({ will: 'testflight_build', app_id: '7', confirm_required: true });
  });

  test('--confirm posts once with no body and prints the two lines', async () => {
    stubToken();
    installMockFetch({ status: 202, body: { data: { id: 3, status: 'queued', kind: 'testflight' } } });
    const { result, out } = await capture(['testflight', '7', '--confirm', ...API]);
    expect(result).toBe(0);
    expect(requests.length).toBe(1);
    expect(lastRequest().method).toBe('POST');
    expect(lastRequest().url).toBe('http://test.local/api/v1/apps/7/builds/testflight');
    expect(lastRequest().body).toBeNull();
    expect(out).toContain('TestFlight build 3 started (queued).');
    expect(out).toContain('appo status 7 shows when it is ready.');
  });

  test('--json with --confirm prints the build object', async () => {
    stubToken();
    installMockFetch({ status: 202, body: { data: { id: 3, status: 'queued' } } });
    const { result, out } = await capture(['testflight', '7', '--confirm', '--json', ...API]);
    expect(result).toBe(0);
    expect(JSON.parse(out)).toEqual({ id: 3, status: 'queued' });
  });

  test('409 prints the server message, exit 1; 404 exit 1', async () => {
    stubToken();
    installMockFetch({ status: 409, body: { error: 'conflict', message: 'A TestFlight build is already active.' } });
    const conflict = await capture(['testflight', '7', '--confirm', ...API]);
    expect(conflict.result).toBe(1);
    expect(conflict.err).toContain('A TestFlight build is already active.');
    installMockFetch({ status: 404, body: { error: 'not_found', message: 'Not found.' } });
    expect((await capture(['testflight', '7', '--confirm', ...API])).result).toBe(1);
  });

  test('missing id: exit 2 with usage', async () => {
    stubToken();
    const { result, err } = await capture(['testflight', ...API]);
    expect(result).toBe(2);
    expect(err).toContain('Usage: appo testflight <id> --confirm');
  });
});
