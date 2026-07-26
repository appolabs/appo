import { spawn as nodeSpawn, spawnSync as nodeSpawnSync } from 'node:child_process';

const MCP_PACKAGE = '@appolabs/appo-mcp';

// Every supported agent CLI adds a stdio MCP server with the SAME argv shape:
//   <bin> mcp add appo -- npx -y @appolabs/appo-mcp
// Verified for Claude Code and OpenAI Codex (2026-07). A new CLI agent that
// follows this convention only needs a row here.
const ADD_ARGS = ['mcp', 'add', 'appo', '--', 'npx', '-y', MCP_PACKAGE];
const CLI_AGENTS = [
  { bin: 'claude', label: 'Claude Code' },
  { bin: 'codex', label: 'Codex' },
];

const ON_WIN = process.platform === 'win32';

// The raw server spec every file-based MCP client accepts (Cursor, Windsurf,
// VS Code): a single line the user pastes into .mcp.json.
const JSON_SNIPPET = `  { "mcpServers": { "appo": { "command": "npx", "args": ["-y", "${MCP_PACKAGE}"] } } }`;

/** Is an agent CLI on PATH? A harmless `<bin> --version` probe; ENOENT -> absent. */
function isPresent(bin, spawnSyncImpl) {
  const res = spawnSyncImpl(bin, ['--version'], { stdio: 'ignore', shell: ON_WIN });
  return !res.error;
}

/** Run `<bin> mcp add appo -- npx -y @appolabs/appo-mcp`; resolve the exit code. */
function addTo(bin, spawnImpl) {
  return new Promise((resolve) => {
    // INVARIANT (IN-03): every element of this argv MUST stay a compile-time
    // literal. The win32 `shell:true` workaround is injection-safe ONLY because
    // nothing here is interpolated from profile/env/user input.
    const child = spawnImpl(bin, ADD_ARGS, { stdio: 'inherit', shell: ON_WIN });
    child.on('error', () => resolve(1));
    child.on('close', (code) => resolve(code ?? 1));
  });
}

/** The manual fallback: per-agent commands + the universal .mcp.json snippet,
 *  for when no supported agent CLI is on PATH. Pure presentation. */
function printManual() {
  console.log('Add the Appo MCP to your AI editor:');
  console.log(`  Claude Code:  claude mcp add appo -- npx -y ${MCP_PACKAGE}`);
  console.log(`  Codex:        codex mcp add appo -- npx -y ${MCP_PACKAGE}`);
  console.log('  Cursor / Windsurf / VS Code (.mcp.json):');
  console.log(JSON_SNIPPET);
}

/**
 * Install the Appo MCP server into every supported agent CLI found on PATH
 * (Claude Code, Codex) so an AI editor can drive Appo. Editors without a CLI
 * installer get the printed .mcp.json snippet. spawnImpl / spawnSyncImpl are
 * injectable so tests assert behavior without spawning anything.
 *
 * @param {{ spawnImpl?: Function, spawnSyncImpl?: Function }} [opts]
 * @returns {Promise<number>} 0 if at least one agent was wired; 1 if none were
 */
export async function runMcpInstall({ spawnImpl = nodeSpawn, spawnSyncImpl = nodeSpawnSync } = {}) {
  const present = CLI_AGENTS.filter((a) => isPresent(a.bin, spawnSyncImpl));

  if (present.length === 0) {
    console.log('No supported agent CLI found on your PATH (looked for: claude, codex).');
    console.log('');
    printManual();
    return 1;
  }

  const installed = [];
  for (const agent of present) {
    if ((await addTo(agent.bin, spawnImpl)) === 0) { installed.push(agent.label); }
  }

  console.log('');
  if (installed.length > 0) {
    console.log(
      `Appo MCP installed for ${installed.join(' and ')}. Restart your editor, then ask it to build an app.`,
    );
  }
  console.log('Other editors (Cursor, Windsurf, VS Code) — add to .mcp.json:');
  console.log(JSON_SNIPPET);
  return installed.length > 0 ? 0 : 1;
}
