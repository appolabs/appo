import { spawn as nodeSpawn } from 'node:child_process';

// The Appo MCP server package, launched on demand via npx. Fixed argv — nothing
// here is interpolated from profile/env/user input (mirrors upgrade.mjs IN-03),
// so the win32 `shell:true` PATH workaround below stays injection-safe.
const MCP_PACKAGE = '@appolabs/appo-mcp';
const CLAUDE_ADD_ARGS = ['mcp', 'add', 'appo', '--', 'npx', '-y', MCP_PACKAGE];

/** One-line Cursor `.mcp.json` snippet — the manual path for editors the CLI
 *  cannot wire automatically. Pure presentation. */
function printCursorSnippet() {
  console.log('Using Cursor instead? Add this to .mcp.json:');
  console.log(
    `  { "mcpServers": { "appo": { "command": "npx", "args": ["-y", "${MCP_PACKAGE}"] } } }`,
  );
}

/**
 * Install the Appo MCP server for Claude Code by shelling out to `claude mcp
 * add`, so an AI editor can drive Appo. When the `claude` CLI is not on PATH
 * (spawn ENOENT), fall back to printing the manual command plus the Cursor
 * snippet. spawnImpl is injectable so tests assert the argv without spawning.
 *
 * @param {{ spawnImpl?: (cmd: string, args: string[], opts: object) => { on: (event: string, cb: (arg: any) => void) => unknown } }} [opts]
 * @returns {Promise<number>} 0 on success; 1 when claude is absent or the add fails
 */
export function runMcpInstall({ spawnImpl = nodeSpawn } = {}) {
  return new Promise((resolve) => {
    // INVARIANT (IN-03): every element of this argv MUST stay a compile-time
    // literal. The win32 `shell:true` workaround is injection-safe ONLY because
    // nothing here is interpolated from profile/env/user input.
    const child = spawnImpl('claude', CLAUDE_ADD_ARGS, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', () => {
      console.log("The 'claude' CLI is not on your PATH. Add the Appo MCP manually:");
      console.log(`  claude mcp add appo -- npx -y ${MCP_PACKAGE}`);
      console.log('');
      printCursorSnippet();
      resolve(1);
    });
    child.on('close', (code) => {
      if (code === 0) {
        console.log('');
        console.log('Appo MCP installed for Claude Code. Restart your editor, then ask it to build an app.');
        printCursorSnippet();
      }
      resolve(code ?? 1);
    });
  });
}
