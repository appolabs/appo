import { test, describe, afterEach, expect } from 'vitest';
import * as ops from '../../src/ops.mjs';
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
