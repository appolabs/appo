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
  'apps create', 'apps list', 'apps show', 'apps set-name',
  'build', 'status', 'configure', 'rejection', 'fix-recipe', 'publish', 'push', 'resubmit',
  'upgrade', 'version',
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

test('README + llms.txt do not document the deferred preview feature', () => {
  expect(README).not.toContain('appo preview');
  expect(LLMS).not.toContain('appo preview');
});
