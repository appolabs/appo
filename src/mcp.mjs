import { spawn as nodeSpawn, spawnSync as nodeSpawnSync } from 'node:child_process';
import { resolveApiBase } from './config.mjs';
import { installInstructions, instructionsPathFor } from './agent-instructions.mjs';

// The Appo MCP is the remote connector served by the Appo API host (OAuth 2.1,
// dynamic client registration): every agent client registers it over HTTP.
// Argv shapes: Claude Code (`--transport http --scope user <name> <url>`; user
// scope, so the connector is available in every directory, as Codex's is), Codex CLI
// (`<name> --url <url>`). A new agent CLI needs a row here and its
// instructions file in agent-instructions.mjs.
const CLI_AGENTS = [
  {
    bin: /** @type {const} */ ('claude'),
    label: 'Claude Code',
    args: (url) => ['mcp', 'add', '--transport', 'http', '--scope', 'user', 'appo', url],
    // A local- or project-scope entry works in one directory only.
    coversEveryDirectory: (description) => /Scope:\s*User/i.test(description),
  },
  {
    bin: /** @type {const} */ ('codex'),
    label: 'Codex',
    args: (url) => ['mcp', 'add', 'appo', '--url', url],
    coversEveryDirectory: () => true,
    // Its `mcp add` stays open for a browser sign-in; this completes one later.
    signIn: 'codex mcp login appo',
  },
];

// Without a terminal nobody can complete a browser sign-in, so an `mcp add`
// that stays open is given this long to record its entry, then ended.
const REGISTRATION_POLL_MS = 500;
const REGISTRATION_WAIT_MS = 15_000;

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

/**
 * Read the agent's own record of the connector with `mcp get`: the reliable
 * read, since `mcp add` exits non-zero when the entry already exists (a rerun)
 * and when the browser sign-in it starts is not completed, although the entry
 * is in place in both cases.
 *
 * @returns {{ registered: boolean, everywhere: boolean }} `everywhere` is true
 *   when the entry is available from any directory, so adding it again would
 *   only start a new sign-in.
 */
function registrationOf(agent, spawnSyncImpl) {
  const res = spawnSyncImpl(agent.bin, ['mcp', 'get', 'appo'], { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8', shell: ON_WIN });
  const registered = !res.error && res.status === 0;
  return { registered, everywhere: registered && agent.coversEveryDirectory(String(res.stdout ?? '')) };
}

/**
 * Run the agent's `mcp add`; resolve the exit code. An add may stay open for a
 * browser sign-in (Codex). With a terminal the person completes it and the add
 * is waited for. Without one it is ended as soon as the agent's own record
 * shows the entry, or after REGISTRATION_WAIT_MS, and null is resolved; its
 * output is not shown, since the sign-in link it prints dies with it.
 *
 * @returns {Promise<number|null>}
 */
function addTo(agent, url, { spawnImpl, spawnSyncImpl, interactive }) {
  return new Promise((resolve) => {
    // INVARIANT (IN-03): argv elements are compile-time literals plus `url`,
    // which connectorUrl() has validated as an http(s) origin restricted to a
    // safe charset. The win32 `shell:true` workaround is injection-safe only
    // while nothing else is interpolated.
    const child = spawnImpl(agent.bin, agent.args(url), { stdio: interactive ? 'inherit' : 'ignore', shell: ON_WIN });
    let settled = false;
    let poll;
    const settle = (code) => { settled = true; clearInterval(poll); resolve(code); };
    child.on('error', () => settle(1));
    child.on('close', (code) => settle(code ?? 1));
    if (interactive || settled) { return; }

    const deadline = Date.now() + REGISTRATION_WAIT_MS;
    poll = setInterval(() => {
      if (!registrationOf(agent, spawnSyncImpl).everywhere && Date.now() < deadline) { return; }
      child.kill();
      settle(null);
    }, REGISTRATION_POLL_MS);
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
  console.log(`  Claude Code:  claude mcp add --transport http --scope user appo ${url}`);
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
 * (Claude Code, Codex) and write the Appo section of each one's user-level
 * instructions file (CLAUDE.md, AGENTS.md). Editors without a CLI installer get the printed
 * snippet. spawnImpl / spawnSyncImpl / writeInstructions / apiBase are
 * injectable so tests assert behavior without spawning anything, writing to
 * the home directory or reading a profile; apiBase defaults to the active
 * profile's base. writeInstructions receives the agent row and returns the
 * path written, or null. interactive (a person at a terminal) defaults to
 * the process's own stdin and stdout.
 *
 * The instructions files are written only with consent: interactive runs ask
 * through confirmInstructions(agent, path), which resolves false by default;
 * non-interactive runs write only when agentInstructions is true and
 * otherwise print one line naming the flag. Registration is unaffected.
 *
 * @param {{ spawnImpl?: Function, spawnSyncImpl?: Function, writeInstructions?: Function, apiBase?: string, interactive?: boolean, confirmInstructions?: (agent: any, path: string) => Promise<boolean>, agentInstructions?: boolean }} [opts]
 * @returns {Promise<number>} 0 if at least one agent was wired; 1 if none were
 */
export async function runMcpInstall({ spawnImpl = nodeSpawn, spawnSyncImpl = nodeSpawnSync, writeInstructions = (agent) => installInstructions(agent.bin), apiBase, interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY), confirmInstructions = async () => false, agentInstructions = false } = {}) {
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
  const signInLeft = [];
  const failed = [];
  const skipped = [];
  for (const agent of present) {
    let wired = registrationOf(agent, spawnSyncImpl).everywhere;
    if (!wired) {
      const code = await addTo(agent, url, { spawnImpl, spawnSyncImpl, interactive });
      wired = code === 0 || registrationOf(agent, spawnSyncImpl).registered;
      if (wired && code === null && agent.signIn) { signInLeft.push(agent); }
    }
    if (!wired) { failed.push(agent); continue; }
    installed.push(agent.label);
    const target = instructionsPathFor(agent.bin);
    const consent = interactive ? await confirmInstructions(agent, target) : agentInstructions;
    if (!consent) { skipped.push(target); continue; }
    const path = writeInstructions(agent);
    if (path) { notes.push(`${agent.label}: ${path}`); }
  }

  console.log('');
  if (installed.length > 0) {
    console.log(`Appo MCP connector registered for ${installed.join(' and ')}.`);
    console.log('The first time the agent uses Appo, a browser window asks you to sign in and approve the connection; that is the only sign-in step.');
    for (const note of notes) {
      console.log(`A short Appo section was added to your agent instructions so it knows your app lives in Appo (${note}); edit or remove it freely.`);
    }
    for (const agent of signInLeft) {
      console.log(`${agent.label}: the sign-in was left for later; complete it with: ${agent.signIn}`);
    }
    console.log('Restart your editor, then ask it to build an app.');
  }
  if (skipped.length > 0) {
    console.log(interactive
      ? `Agent instructions not written (${skipped.join(', ')}).`
      : `Agent instructions not written; run appo mcp --agent-instructions to add the Appo section to ${skipped.join(', ')}.`);
  }
  for (const agent of failed) {
    console.log(`${agent.label}: the connector was not registered. To see why, run: ${agent.bin} ${agent.args(url).join(' ')}`);
  }
  console.log(`Other editors (Cursor, Windsurf, VS Code), add to .mcp.json: { "mcpServers": { "appo": { "url": "${url}" } } }`);
  return installed.length > 0 ? 0 : 1;
}
