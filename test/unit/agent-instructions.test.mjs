import { test, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APPO_SECTION, instructionsPathFor, installInstructions, withAppoSection } from '../../src/agent-instructions.mjs';

test('instructionsPathFor resolves each agent\'s user-level file and honours its home override', () => {
  expect(instructionsPathFor('codex', { home: '/h', env: {} })).toBe('/h/.codex/AGENTS.md');
  expect(instructionsPathFor('codex', { home: '/h', env: { CODEX_HOME: '/x' } })).toBe('/x/AGENTS.md');
  expect(instructionsPathFor('claude', { home: '/h', env: {} })).toBe('/h/.claude/CLAUDE.md');
  expect(instructionsPathFor('claude', { home: '/h', env: { CLAUDE_CONFIG_DIR: '/y' } })).toBe('/y/CLAUDE.md');
  expect(() => instructionsPathFor(/** @type {any} */ ('cursor'), { home: '/h', env: {} })).toThrow(/unsupported/i);
});

test('withAppoSection appends to existing instructions without altering them', () => {
  const out = withAppoSection('# Mine\n\nKeep this.\n');
  expect(out.startsWith('# Mine\n\nKeep this.\n\n')).toBe(true);
  expect(out).toContain(APPO_SECTION);
});

test('withAppoSection replaces a previous section in place, exactly once', () => {
  const stale = '# Mine\n\n<!-- appo-start -->\nold text\n<!-- appo-end -->\n\n## After\n';
  const out = withAppoSection(stale);
  expect(out).not.toContain('old text');
  expect(out.split('<!-- appo-start -->').length).toBe(2);
  expect(out.startsWith('# Mine\n\n')).toBe(true);
  expect(out.endsWith('\n\n## After\n')).toBe(true);
  expect(withAppoSection(out)).toBe(out);
});

test('withAppoSection on an empty file yields just the section', () => {
  expect(withAppoSection('')).toBe(`${APPO_SECTION}\n`);
});

test('installInstructions creates the file, and preserves user content on a rerun', () => {
  const home = mkdtempSync(join(tmpdir(), 'appo-agents-'));
  try {
    const path = /** @type {string} */ (installInstructions('codex', { home, env: {} }));
    expect(readFileSync(path, 'utf8')).toContain('get_app_overview');
    writeFileSync(path, `# Mine\n\n${readFileSync(path, 'utf8')}`);
    installInstructions('codex', { home, env: {} });
    const body = readFileSync(path, 'utf8');
    expect(body.startsWith('# Mine\n')).toBe(true);
    expect(body.split('<!-- appo-start -->').length).toBe(2);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('installInstructions writes Claude Code\'s CLAUDE.md', () => {
  const home = mkdtempSync(join(tmpdir(), 'appo-agents-'));
  try {
    const path = installInstructions('claude', { home, env: {} });
    expect(path).toBe(join(home, '.claude', 'CLAUDE.md'));
    expect(readFileSync(/** @type {string} */ (path), 'utf8')).toContain('<!-- appo-start -->');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('installInstructions returns null instead of throwing when the path cannot be written', () => {
  const home = mkdtempSync(join(tmpdir(), 'appo-agents-'));
  try {
    mkdirSync(join(home, '.codex', 'AGENTS.md'), { recursive: true });
    expect(installInstructions('codex', { home, env: {} })).toBeNull();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
