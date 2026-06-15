import { test, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// SC1: the npm pack whitelist must ship only the runtime files — no tests,
// no .planning notes, no lockfile, no dev configs leak into the published tarball.
test('npm pack ships only the whitelisted runtime files', () => {
  const out = JSON.parse(execSync('npm pack --dry-run --json', { encoding: 'utf-8' }));
  const paths = out[0].files.map((f) => f.path);
  for (const p of [
    'bin/appo.mjs',
    'src/api.mjs',
    'src/cli.mjs',
    'src/config.mjs',
    'src/login.mjs',
    'src/ops.mjs',
    'README.md',
    'package.json',
  ]) {
    expect(paths).toContain(p);
  }
  for (const banned of [
    /^test\//,
    /\.planning/,
    /package-lock\.json/,
    /\.eslintrc/,
    /tsconfig\.json/,
    /vitest\.config/,
  ]) {
    expect(paths.some((p) => banned.test(p))).toBe(false);
  }
});

// SC1: publish metadata + build-free quality gate + runtime-dependency-free invariant.
test('package.json carries the publish metadata + build-free quality gate + no runtime deps', () => {
  const p = JSON.parse(readFileSync('package.json', 'utf-8'));
  expect(p.publishConfig.access).toBe('public');
  expect(p.repository && p.homepage && p.bugs && p.author).toBeTruthy();
  expect(Array.isArray(p.keywords) && p.keywords.length).toBeTruthy();
  expect(p.scripts.prepublishOnly).toBe('npm run lint && npm run typecheck && npm test');
  expect(p.scripts.prepublishOnly).not.toMatch(/build/);
  expect(p.files).toContain('llms.txt');
  expect((p.dependencies && Object.keys(p.dependencies).length) || 0).toBe(0);
});

// SC1: release.yml mirrors the SDK trusted-publishing flow, adapted to npm with no build step.
test('release.yml mirrors the SDK trusted-publishing flow (npm, no build)', () => {
  const yml = readFileSync('.github/workflows/release.yml', 'utf-8');
  expect(yml).toMatch(/id-token: write/);
  expect(yml).toMatch(/npm publish --provenance --access public/);
  expect(yml).toMatch(/npm ci/);
  expect(yml).not.toMatch(/pnpm/i);
  expect(yml).not.toMatch(/run: .*build/);
});
