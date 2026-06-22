import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// README.md + llms.txt ship in the published tarball and document the full v0.1
// command surface. These assertions keep both docs in lockstep with the
// authoritative command inventory (06-RESEARCH.md lines 508-527) — a verb added
// to the CLI but missing from either doc fails CI.
const README = readFileSync('README.md', 'utf-8');
const LLMS = readFileSync('llms.txt', 'utf-8');

const COMMANDS = [
  'ship', 'init', 'login', 'logout', 'whoami', 'env list', 'env use',
  'apps create', 'apps list', 'apps show', 'apps update',
  'status', 'rejection', 'fix-recipe', 'publish', 'push',
  'upgrade', 'version', 'preview',
];

test.each(COMMANDS)('README documents "%s"', (cmd) => {
  expect(README).toContain(cmd);
});

test.each(COMMANDS)('llms.txt references "%s"', (cmd) => {
  expect(LLMS).toContain(cmd);
});

test('llms.txt matches the SDK shape (title, tagline, sections, README anchors)', () => {
  expect(LLMS).toMatch(/^# @appolabs\/appo/m);
  expect(LLMS).toMatch(/^> /m);
  expect(LLMS).toMatch(/^## /m);
  expect(LLMS).toMatch(/README\.md#/);
});

// Negative regression guards (SC-2/SC-4): the COMMANDS greps above check command
// NAMES only, so flag-body drift would ship silently. These lock the removed flags
// and build-trigger code paths out of the docs and src/ — CI fails if any reappear.
test('README drops removed flags/wording', () => {
  expect(README).not.toContain('--meta-name');
  expect(README).not.toContain('--meta-desc');
  expect(README).not.toContain('--timeout');
  expect(README).not.toMatch(/create\s*→\s*build\s*→\s*poll\s*→\s*publish/);
  expect(LLMS).not.toContain('--meta-name');
  expect(LLMS).not.toContain('--meta-desc');
  expect(LLMS).not.toContain('--timeout');
});

test('src/ has no build-trigger code paths', () => {
  const cli = readFileSync('src/cli.mjs', 'utf-8');
  const ops = readFileSync('src/ops.mjs', 'utf-8');
  expect(cli + ops).not.toMatch(/triggerBuild|pollBuild/);
});

