import { spawn as nodeSpawn } from 'node:child_process';
import { readUpdateCache, writeUpdateCache } from './config.mjs';

// Percent-encoded scoped package URL — `@appolabs/appo` must encode the `/` as
// %2F or the registry treats it as a path segment (Pitfall 4). No Authorization
// header is ever sent here (T-06-02): the PAT never leaves the machine.
const LATEST_URL = 'https://registry.npmjs.org/@appolabs%2Fappo/latest';
const DAY = 86_400_000;

/**
 * Run `npm install -g @appolabs/appo@latest`, streaming npm's output. The argv
 * is a FIXED array (no shell-string interpolation, T-06-01); `shell:true` only
 * on win32 to resolve npm.cmd off PATH, and even then the args stay a literal
 * array. spawnImpl is injectable so tests assert the argv without spawning npm.
 *
 * @param {{ spawnImpl?: (cmd: string, args: string[], opts: object) => { on: (event: string, cb: (arg: any) => void) => unknown } }} [opts]
 * @returns {Promise<number>} the child exit code (1 on spawn error / null code)
 */
export function runUpgrade({ spawnImpl = nodeSpawn } = {}) {
  return new Promise((resolve) => {
    // INVARIANT (IN-03): every element of this argv MUST stay a compile-time
    // literal. The win32 `shell:true` workaround below is injection-safe ONLY
    // because nothing here is interpolated from profile/env/user input. If the
    // package spec ever becomes configurable, drop `shell:true` and resolve the
    // npm binary explicitly instead of interpolating into a shell argv.
    const child = spawnImpl('npm', ['install', '-g', '@appolabs/appo@latest'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', (err) => {
      console.error(`Could not run npm: ${err.message}. Is npm on your PATH?`);
      resolve(1);
    });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

/**
 * Dependency-free x.y.z compare (no semver dep): is `a` strictly newer than `b`?
 * LIMITATION (IN-02): pre-release/non-numeric segments (e.g. `1.0.0-beta`) parse
 * to NaN and collapse to 0, so this is correct ONLY for the project's plain
 * numeric x.y.z releases. The project does not publish pre-releases; if that ever
 * changes, parse the leading numeric triple via split(/[.-]/) and treat any
 * tagged version as not-newer. Worst case today is a wrong one-line hint, no crash.
 */
function isNewer(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

/**
 * Best-effort daily update check. Hits the registry at most once per day
 * (cached in ~/.appo), prints a one-line `update available:` notice to stderr
 * when a newer version exists, and swallows every network error (D-05). Sends
 * NO Authorization header so the PAT never reaches the registry (T-06-02).
 * fetchImpl/now are injectable so tests run without hitting the network.
 *
 * @param {string} installed the currently installed version
 * @param {{ fetchImpl?: (url: string, init?: object) => Promise<{ ok: boolean, json: () => Promise<any> }>, now?: () => number }} [opts]
 */
export async function checkForUpdate(installed, { fetchImpl = fetch, now = Date.now } = {}) {
  const cache = readUpdateCache(); // { last_check_ms?, latest? }
  let latest = cache.latest;
  if (!cache.last_check_ms || now() - cache.last_check_ms > DAY) {
    // Bound the registry call so a stalled (not failed) endpoint can never hang
    // CLI exit (WR-01) — the bin hook awaits this before process.exit.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 1500);
    try {
      const res = await fetchImpl(LATEST_URL, { headers: { Accept: 'application/json' }, signal: ac.signal });
      // Only stamp last_check_ms on a successful response (IN-01): a transient
      // registry failure (e.g. 503) must retry on the next run, not be suppressed
      // for a full day by a fresh timestamp.
      if (res.ok) {
        latest = (await res.json()).version;
        writeUpdateCache({ last_check_ms: now(), latest });
      }
    } catch {
      return; // swallow EVERY network/timeout error — never block or crash the CLI
    } finally {
      clearTimeout(timer);
    }
  }
  if (latest && isNewer(latest, installed)) {
    process.stderr.write(`update available: v${installed} -> v${latest} (run: appo upgrade)\n`);
  }
}
