import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

// Agent clients may load MCP tools on demand: at the start of a conversation
// the model then sees neither the connector's instructions nor its tool names,
// so "what is the status of my app" is read as a question about the working
// directory. The agent's user-level instructions file is always in context.
// Measured on Codex CLI 0.159 over three cold prompts, three runs each: this
// section 9/9 routed to Appo, a skill 3/9 at best, no hint 0/9. Claude Code
// receives the same section on the same grounds; it was not measured.

const START = '<!-- appo-start -->';
const END = '<!-- appo-end -->';

export const APPO_SECTION = `${START}
## Appo

The user has an Appo account connected through the \`appo\` MCP server. Requests about "my app" (its status, a mobile app for a website, trying it on a phone, App Store or Google Play publishing, store review) refer to that Appo app unless the working directory clearly holds the project meant. Use the appo MCP tools (search the tools for "appo"), starting with \`get_app_overview\`; do not inspect the filesystem for them.
${END}`;

/**
 * The user-level instructions file of a supported agent CLI: Codex reads
 * AGENTS.md under CODEX_HOME, Claude Code CLAUDE.md under CLAUDE_CONFIG_DIR.
 *
 * @param {'claude'|'codex'} bin
 * @param {{ home?: string, env?: Record<string, string|undefined> }} [opts]
 * @returns {string}
 */
export function instructionsPathFor(bin, { home = homedir(), env = process.env } = {}) {
  if (bin === 'codex') { return join(env.CODEX_HOME || join(home, '.codex'), 'AGENTS.md'); }
  if (bin === 'claude') { return join(env.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'CLAUDE.md'); }
  throw new Error(`Unsupported agent CLI: ${bin}`);
}

/**
 * The file content with the Appo section present exactly once: replaced in
 * place when the markers exist, appended otherwise. Text outside the markers
 * is never touched.
 *
 * @param {string} content
 * @returns {string}
 */
export function withAppoSection(content) {
  const start = content.indexOf(START);
  const end = content.indexOf(END);
  if (start !== -1 && end > start) {
    return content.slice(0, start) + APPO_SECTION + content.slice(end + END.length);
  }
  if (content.trim() === '') { return `${APPO_SECTION}\n`; }
  return `${content.replace(/\n*$/, '')}\n\n${APPO_SECTION}\n`;
}

/**
 * Write the Appo section into an agent's user-level instructions file. Returns
 * the path, or null when the file cannot be written: the connector works
 * without the section, so a failure is not fatal.
 *
 * @param {'claude'|'codex'} bin
 * @param {{ home?: string, env?: Record<string, string|undefined> }} [opts]
 * @returns {string|null}
 */
export function installInstructions(bin, opts) {
  try {
    const path = instructionsPathFor(bin, opts);
    mkdirSync(dirname(path), { recursive: true });
    const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
    writeFileSync(path, withAppoSection(current));
    return path;
  } catch {
    return null;
  }
}
