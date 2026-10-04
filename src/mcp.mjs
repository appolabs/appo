import { spawn as nodeSpawn, spawnSync as nodeSpawnSync } from 'node:child_process';
import { resolveApiBase } from './config.mjs';
import { installCodexInstructions } from './agent-instructions.mjs';

// The Appo MCP is the remote connector served by the Appo API host (OAuth 2.1,
// dynamic client registration): every agent client registers it over HTTP.
// Argv shapes: Claude Code (`--transport http <name> <url>`), Codex CLI
// (`<name> --url <url>`). A new agent CLI only needs a row here. `instructions`
// is set for a client that does not put the connector in the model's initial
// context, and writes the note that routes app requests to it.
const CLI_AGENTS = [
  { bin: 'claude', label: 'Claude Code', args: (url) => ['mcp', 'add', '--transport', 'http', 'appo', url] },
  { bin: 'codex', label: 'Codex', args: (url) => ['mcp', 'add', 'appo', '--url', url], instructions: installCodexInstructions },
];

const ON_WIN = process.platform === 'win32';

// Characters an API base may contain: scheme, host, port, path. Everything
// else (whitespace, quotes, shell and cmd.exe metacharacters, userinfo `@`,
// query, fragment) is refused.
const SAFE_API_BASE = /^https?:\/\/[A-Za-z0-9.:/_[\]-]+$/;

/**
 * The connector URL for an API base: its origin plus `/mcp`. Only http(s)
 * bases made of a safe charset are accepted, so the value can be interpolated
 * into a spawn argv even with the win32 `shell:true` workaround (IN-03).
 *
 * @param {string} apiBase
 * @returns {string}
 */
export function connectorUrl(apiBase) {
  const invalid = () => new Error(`Invalid API base for the MCP connector: ${apiBase}`);
  if (typeof apiBase !== 'string' || !SAFE_API_BASE.test(apiBase)) { throw invalid(); }
  let parsed;
  try { parsed = new URL(apiBase); } catch { throw invalid(); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) { throw invalid(); }
  const url = `${parsed.origin}/mcp`;
  if (!SAFE_API_BASE.test(url)) { throw invalid(); }
  return url;
}

/**
 * The `mcp add` argv for a supported agent CLI.
 *
 * @param {'claude'|'codex'} bin
 * @param {string} url
 * @returns {string[]}
 */
export function addArgsFor(bin, url) {
  const agent = CLI_AGENTS.find((a) => a.bin === bin);
  if (!agent) { throw new Error(`Unsupported agent CLI: ${bin}`); }
  return agent.args(url);
}

/** Is an agent CLI on PATH? A harmless `<bin> --version` probe; ENOENT -> absent. */
function isPresent(bin, spawnSyncImpl) {
  const res = spawnSyncImpl(bin, ['--version'], { stdio: 'ignore', shell: ON_WIN });
  return !res.error;
}

/** Run the agent's `mcp add`; resolve the exit code. */
function addTo(agent, url, spawnImpl) {
  return new Promise((resolve) => {
    // INVARIANT (IN-03): argv elements are compile-time literals plus `url`,
    // which connectorUrl() has validated as an http(s) origin restricted to a
    // safe charset. The win32 `shell:true` workaround is injection-safe only
    // while nothing else is interpolated.
    const child = spawnImpl(agent.bin, agent.args(url), { stdio: 'inherit', shell: ON_WIN });
    child.on('error', () => resolve(1));
    child.on('close', (code) => resolve(code ?? 1));
  });
}

/**
 * The manual fallback: per-agent commands, the file-based snippet, and the
 * stdio bridge for clients that cannot speak HTTP. Pure presentation.
 *
 * @param {string} url
 */
export function printManual(url) {
  console.log('Add the Appo MCP connector to your AI agent:');
  console.log(`  Claude Code:  claude mcp add --transport http appo ${url}`);
  console.log(`  Codex:        codex mcp add appo --url ${url}`);
  console.log('  Cursor / Windsurf / VS Code (.mcp.json):');
  console.log(`    { "mcpServers": { "appo": { "url": "${url}" } } }`);
  console.log('  Clients that only accept stdio servers:');
  console.log(`    { "mcpServers": { "appo": { "command": "npx", "args": ["mcp-remote", "${url}"] } } }`);
  console.log(`    (bridge: npx mcp-remote ${url})`);
  console.log('Sign-in happens in the browser the first time the agent uses Appo; no key is needed.');
}

/**
 * Register the Appo MCP connector with every supported agent CLI found on PATH
 * (Claude Code, Codex); for Codex it also writes the Appo section of the
 * user-level AGENTS.md. Editors without a CLI installer get the printed
 * snippet. spawnImpl / spawnSyncImpl / writeInstructions / apiBase are
 * injectable so tests assert behavior without spawning anything, writing to
 * the home directory or reading a profile; apiBase defaults to the active
 * profile's base. writeInstructions receives the agent row and returns the
 * path written, or null.
 *
 * @param {{ spawnImpl?: Function, spawnSyncImpl?: Function, writeInstructions?: Function, apiBase?: string }} [opts]
 * @returns {Promise<number>} 0 if at least one agent was wired; 1 if none were
 */
export async function runMcpInstall({ spawnImpl = nodeSpawn, spawnSyncImpl = nodeSpawnSync, writeInstructions = (agent) => agent.instructions?.() ?? null, apiBase } = {}) {
  const url = connectorUrl(apiBase ?? resolveApiBase(undefined));
  const present = CLI_AGENTS.filter((a) => isPresent(a.bin, spawnSyncImpl));

  if (present.length === 0) {
    console.log('No supported agent CLI found on your PATH (looked for: claude, codex).');
    console.log('');
    printManual(url);
    return 1;
  }

  const installed = [];
  const notes = [];
  for (const agent of present) {
    if ((await addTo(agent, url, spawnImpl)) === 0) {
      installed.push(agent.label);
      const path = writeInstructions(agent);
      if (path) { notes.push(`${agent.label}: ${path}`); }
    }
  }

  console.log('');
  if (installed.length > 0) {
    console.log(`Appo MCP connector registered for ${installed.join(' and ')}.`);
    console.log('The first time the agent uses Appo, a browser window asks you to sign in and approve the connection; that is the only sign-in step.');
    for (const note of notes) {
      console.log(`A short Appo section was added to your agent instructions so it knows your app lives in Appo (${note}); edit or remove it freely.`);
    }
    console.log('Restart your editor, then ask it to build an app.');
  }
  console.log(`Other editors (Cursor, Windsurf, VS Code), add to .mcp.json: { "mcpServers": { "appo": { "url": "${url}" } } }`);
  return installed.length > 0 ? 0 : 1;
}
