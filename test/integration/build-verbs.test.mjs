import { test, afterEach, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../../src/cli.mjs';
import {
  installMockFetch,
  resetMockFetch,
  lastRequest,
  requests,
  stubToken,
} from '../helpers/mockFetch.mjs';

// Capture console.log output around an async call (verbs are async).
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

// Capture BOTH streams (error paths print to stderr).
async function captureAll(fn) {
  const origLog = console.log;
  const origErr = console.error;
  const lines = [];
  const errs = [];
  console.log = (...args) => lines.push(args.join(' '));
  console.error = (...args) => errs.push(args.join(' '));
  try {
    const result = await fn();
    return { result, lines, errs };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

afterEach(() => resetMockFetch());

const API = ['--api', 'http://test.local'];

// --- download -----------------------------------------------------------------

test('download resolves the newest ready build from the list, then fetches its artifact', async () => {
  stubToken();
  const dir = mkdtempSync(join(tmpdir(), 'appo-dl-'));
  const out = join(dir, 'app.apk');
  installMockFetch([
    { status: 200, body: { data: [
      { id: 44, status: 'building', artifact_url: null },
      { id: 42, status: 'ready', artifact_url: 'https://cdn.test/app.apk' },
    ] } },
    { status: 200, bytes: 'APKBYTES', url: 'https://cdn.test/artifacts/app-7.apk' },
  ]);
  const { result, lines } = await captureLog(() => run(['download', '7', '--output', out, ...API]));
  expect(result).toBe(0);
  expect(requests[0].path).toMatch(/\/api\/v1\/apps\/7\/builds$/);
  expect(requests[1].path).toMatch(/\/api\/v1\/apps\/7\/builds\/42\/download$/);
  expect(readFileSync(out, 'utf-8')).toBe('APKBYTES');
  expect(lines.join('\n')).toContain('build #42');
});

test('download --build skips the list and hits the download endpoint directly', async () => {
  stubToken();
  const dir = mkdtempSync(join(tmpdir(), 'appo-dl-'));
  const out = join(dir, 'app.ipa');
  installMockFetch({ status: 200, bytes: 'IPABYTES', url: 'https://cdn.test/app.ipa' });
  const { result } = await captureLog(() => run(['download', '7', '--build', '42', '--output', out, ...API]));
  expect(result).toBe(0);
  expect(requests.length).toBe(1);
  expect(requests[0].path).toMatch(/\/api\/v1\/apps\/7\/builds\/42\/download$/);
  expect(readFileSync(out, 'utf-8')).toBe('IPABYTES');
});

test('artifactFilename derives from the final URL path, ignoring the query string', async () => {
  const { artifactFilename } = await import('../../src/download.mjs');
  expect(artifactFilename('https://cdn.test/artifacts/build-42.apk?sig=abc', 7, 42)).toBe('build-42.apk');
  expect(artifactFilename('https://cdn.test/app%20name.ipa', 7, 42)).toBe('app name.ipa');
  expect(artifactFilename('https://cdn.test/no-extension', 7, 42)).toBe('app-7-build-42.bin');
  expect(artifactFilename('not a url', 7, 42)).toBe('app-7-build-42.bin');
});

test('download --json reports build_id, file and bytes', async () => {
  stubToken();
  const dir = mkdtempSync(join(tmpdir(), 'appo-dl-'));
  const out = join(dir, 'app.apk');
  installMockFetch({ status: 200, bytes: 'APKBYTES', url: 'https://cdn.test/app.apk' });
  const { lines } = await captureLog(() => run(['download', '7', '--build', '42', '--output', out, '--json', ...API]));
  expect(JSON.parse(lines.join(''))).toEqual({ build_id: 42, file: out, bytes: 8 });
});

test('download with no builds yet exits 1 and suggests appo preview', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: [] } });
  const { result, lines } = await captureLog(() => run(['download', '7', ...API]));
  expect(result).toBe(1);
  expect(lines.join('\n')).toContain('appo preview 7');
});

test('download with latest build not ready reports its status, exit 1', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: [{ id: 44, status: 'building', artifact_url: null }] } });
  const { result, lines } = await captureLog(() => run(['download', '7', ...API]));
  expect(result).toBe(1);
  const out = lines.join('\n');
  expect(out).toContain("'building'");
  expect(out).toContain('appo status 7 --build 44');
});

test('download 409 (artifact not ready, explicit --build) renders the server message, exit 1', async () => {
  stubToken();
  installMockFetch({
    status: 409,
    body: { error: 'conflict', code: 'resource_conflict', message: 'Artifact is not yet ready. Poll the build status endpoint.' },
  });
  const { result, errs } = await captureAll(() => run(['download', '7', '--build', '42', ...API]));
  expect(result).toBe(1);
  expect(errs.join('\n')).toContain('Artifact is not yet ready');
});

test('download without id is a usage error (2)', async () => {
  stubToken();
  installMockFetch({ status: 200, body: {} });
  const { result } = await captureAll(() => run(['download', ...API]));
  expect(result).toBe(2);
  expect(requests.length).toBe(0);
});

// --- devices ------------------------------------------------------------------

test('devices list hits GET /api/v1/devices/ad-hoc and prints rows', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: [
    { id: 1, udid: '00008030...ABCDEF12', device_name: 'iPhone di Alberto', status: 'ENABLED', last_built_at: null },
  ], message: 'OK' } });
  const { result, lines } = await captureLog(() => run(['devices', 'list', ...API]));
  expect(result).toBe(0);
  expect(lastRequest().path).toMatch(/\/api\/v1\/devices\/ad-hoc$/);
  const out = lines.join('\n');
  expect(out).toContain('iPhone di Alberto');
  expect(out).toContain('ENABLED');
});

test('devices list with no devices points at devices register, exit 0', async () => {
  stubToken();
  installMockFetch({ status: 200, body: { data: [], message: 'OK' } });
  const { result, lines } = await captureLog(() => run(['devices', 'list', ...API]));
  expect(result).toBe(0);
  expect(lines.join('\n')).toContain('appo devices register');
});

test('devices register prints the signed link and a QR', async () => {
  stubToken();
  const url = 'http://test.local/device-register/enroll?owner_id=1&signature=abc';
  installMockFetch({ status: 200, body: { data: { url }, message: 'OK' } });
  const { result, lines } = await captureLog(() => run(['devices', 'register', ...API]));
  expect(result).toBe(0);
  expect(lastRequest().path).toMatch(/\/api\/v1\/devices\/ad-hoc\/registration-url$/);
  const out = lines.join('\n');
  expect(out).toContain(url);
  // QR block renders with the forced-contrast ANSI prefix (same as preview).
  expect(out).toContain('\x1b[30;47m');
});

test('devices register --json prints the envelope verbatim', async () => {
  stubToken();
  const body = { data: { url: 'http://test.local/device-register/enroll?sig=x' }, message: 'OK' };
  installMockFetch({ status: 200, body });
  const { lines } = await captureLog(() => run(['devices', 'register', '--json', ...API]));
  expect(JSON.parse(lines.join(''))).toEqual(body);
});

test('devices with an unknown subcommand is a usage error (2)', async () => {
  stubToken();
  installMockFetch({ status: 200, body: {} });
  const { result } = await captureAll(() => run(['devices', 'bogus', ...API]));
  expect(result).toBe(2);
  expect(requests.length).toBe(0);
});
