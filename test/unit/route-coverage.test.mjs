import { test, describe, afterEach, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { run } from '../../src/cli.mjs';
import { installMockFetch, resetMockFetch, lastRequest, stubToken } from '../helpers/mockFetch.mjs';

// tool-routes.json is a byte copy of apps-web-app tests/fixtures/mcp/tool-routes.json:
// the API routes behind each MCP tool. Every route needs a CLI command that
// performs the same act.
const TOOL_ROUTES = JSON.parse(readFileSync('test/fixtures/tool-routes.json', 'utf-8'));

const COVERING_COMMAND = {
  'apps.store': 'appo new',
  'apps.show': 'appo status',
  'apps.install.show': 'appo install',
  'apps.rejection.show': 'appo rejection',
  'apps.rejection.recipe.show': 'appo fix-recipe',
  'apps.resubmit.store': 'appo ship',
  'apps.builds.testflight.store': 'appo testflight',
  'apps.update': 'appo apps update',
  'apps.site.check.store': 'appo apps check',
  'apps.publish.store': 'appo ship',
  'apps.push-notifications.store': 'appo push',
  'apps.icon.store': 'appo apps update',
  'apps.permissions.update': 'appo apps update',
  'apps.appearance.update': 'appo customize',
  'apps.adaptation-brief.show': 'appo suggest',
  'apps.destroy': 'appo apps remove',
};

const ROUTES = Object.entries(TOOL_ROUTES).flatMap(([tool, routes]) =>
  routes.map((r) => [tool, r.route, r.method]),
);

async function helpText() {
  const lines = [];
  const log = vi.spyOn(console, 'log').mockImplementation((...a) => lines.push(a.join(' ')));
  try {
    await run(['--help']);
  } finally {
    log.mockRestore();
  }
  return lines.join('\n');
}

afterEach(() => {
  resetMockFetch();
  vi.restoreAllMocks();
});

describe('route to covering command', () => {
  test.each(ROUTES)('%s: route %s (%s) has a covering command', (tool, route) => {
    expect(COVERING_COMMAND[route], `route ${route} of tool ${tool} has no covering command`).toBeTypeOf('string');
  });

  test('every covering command is listed in appo --help', async () => {
    const out = await helpText();
    for (const command of new Set(Object.values(COVERING_COMMAND))) {
      expect(out, `${command} missing from --help`).toContain(command);
    }
  });

  test('the table names only routes of the map', () => {
    const known = new Set(ROUTES.map(([, route]) => route));
    for (const route of Object.keys(COVERING_COMMAND)) {
      expect(known.has(route), `table route ${route} is not in the map`).toBe(true);
    }
  });
});

describe('routes called directly by the 281 commands', () => {
  const API = ['--api', 'http://test.local'];

  async function call(argv, body) {
    stubToken();
    installMockFetch({ status: 200, body });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await run([...argv, ...API]);
    } finally {
      log.mockRestore();
    }
    return lastRequest();
  }

  test('customize sends PATCH /api/v1/apps/7/appearance', async () => {
    const req = await call(['customize', '7', '--css', 'a{}', '--confirm'], { customized: true, app: 7, fields: ['injected_css'], previous_block: {} });
    expect(req.method).toBe('PATCH');
    expect(req.path).toBe('/api/v1/apps/7/appearance');
  });

  test('suggest sends GET /api/v1/apps/7/adaptation-brief', async () => {
    const req = await call(['suggest', '7'], { app: 7, site: null });
    expect(req.method).toBe('GET');
    expect(req.path).toBe('/api/v1/apps/7/adaptation-brief');
  });

  test('apps remove sends DELETE /api/v1/apps/7?confirm=1', async () => {
    const req = await call(['apps', 'remove', '7', '--confirm'], { deleted: true, app: 7, name: 'Shop', message: 'Shop was removed.' });
    expect(req.method).toBe('DELETE');
    expect(req.path).toBe('/api/v1/apps/7?confirm=1');
  });

  test('testflight sends POST /api/v1/apps/7/builds/testflight', async () => {
    const req = await call(['testflight', '7', '--confirm'], { data: { id: 3, status: 'queued', kind: 'testflight' } });
    expect(req.method).toBe('POST');
    expect(req.path).toBe('/api/v1/apps/7/builds/testflight');
  });
});
