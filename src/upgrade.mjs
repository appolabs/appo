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

/** Dependency-free x.y.z compare (no semver dep): is `a` strictly newer than `b`? */
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
    try {
      const res = await fetchImpl(LATEST_URL, { headers: { Accept: 'application/json' } });
      if (res.ok) latest = (await res.json()).version;
      writeUpdateCache({ last_check_ms: now(), latest });
    } catch {
      return; // swallow EVERY network error — never block or crash the CLI
    }
  }
  if (latest && isNewer(latest, installed)) {
    process.stderr.write(`update available: v${installed} -> v${latest} (run: appo upgrade)\n`);
  }
}
