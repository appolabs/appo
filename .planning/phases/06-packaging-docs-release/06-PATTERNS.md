# Phase 6: Packaging, docs & release - Pattern Map

**Mapped:** 2026-06-15
**Files analyzed:** 7 (3 new, 4 modified/rewritten) + 5 new test files
**Analogs found:** 12 / 12

All twelve files have a concrete in-repo or sibling-SDK analog. There is no
"no analog" gap — every new runtime behavior maps to an existing Node-built-in
usage or an existing project helper (the dependency-free invariant guarantees this).

Path conventions used below:
- `appo/...` = `/Users/alberto/repositories/appolabs/appo/...`
- `sdk/...`  = `/Users/alberto/repositories/appolabs/sdk/...`

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `package.json` (MODIFY) | config (manifest) | static | `sdk/package.json` | exact (sibling convention source) |
| `src/upgrade.mjs` (NEW) | utility/service | request-response (network) + process-spawn | `src/login.mjs` (`exec` + `fetch`) + `src/api.mjs` (`fetch`) | role-match (composed from two analogs) |
| `src/cli.mjs` (MODIFY) | controller (dispatcher) | request-response | `src/cli.mjs` self (`case 'login'`, `--help` branch) | exact (same file, established pattern) |
| `src/config.mjs` (MODIFY — cache helpers) | store | file-I/O | `src/config.mjs` self (`readConfig`/`writeConfig`) | exact (same file) |
| `.github/workflows/release.yml` (NEW) | config (CI) | event-driven (push trigger) | `sdk/.github/workflows/release.yml` (shape) + `appo/.github/workflows/ci.yml` (npm shape) | exact shape + exact toolchain |
| `README.md` (REWRITE) | docs | static | `sdk/README.md` structure + `src/cli.mjs` USAGE (command inventory) | role-match |
| `llms.txt` (NEW) | docs | static | `sdk/llms.txt` | exact (sibling convention source) |
| `test/unit/version.test.mjs` (NEW) | test | unit | `test/integration/help.test.mjs` (`run()` + captureLog) | role-match |
| `test/unit/upgrade.test.mjs` (NEW) | test | unit (injected spawn) | `test/unit/auth.test.mjs` (mock/inject + assert argv) | role-match |
| `test/unit/update-check.test.mjs` (NEW) | test | unit (injected fetch + tmp config) | `test/unit/auth.test.mjs` (APPO_CONFIG_HOME tmp + mockFetch) | exact pattern |
| `test/unit/init.test.mjs` (NEW) | test | unit (mockFetch + tmp config) | `test/unit/auth.test.mjs` (loginWithToken store + no-clobber) | exact pattern |
| `test/integration/packaging.test.mjs` (NEW) | test | integration (shell + grep) | `test/integration/help.test.mjs` (iterate command list) | role-match |

---

## Pattern Assignments

### `package.json` (config, static)

**Analog:** `sdk/package.json` (the locked convention source for `@appolabs/*` publish metadata).

**Fields to ADD, mirrored from the SDK** (`sdk/package.json:6-25, 76-78`):
```jsonc
// from sdk/package.json — copy the SHAPE, swap sdk -> appo
"repository": {
  "type": "git",
  "url": "git+https://github.com/appolabs/appo.git"   // sdk: .../sdk.git
},
"homepage": "https://github.com/appolabs/appo#readme", // sdk: .../sdk#readme
"bugs": {
  "url": "https://github.com/appolabs/appo/issues"     // sdk: .../sdk/issues
},
"keywords": [
  "appo", "cli", "mobile", "app-store", "publishing", "ship", "ios", "android"
],                                                      // sdk has its own keyword set
"publishConfig": {
  "access": "public"                                    // sdk/package.json:76-78 verbatim
}
```

**`author`** — D-01 requires it; the SDK has no `author` field to copy, so set it
plainly (e.g. `"author": "Appolabs"`). Neutral voice (CLAUDE.md public-doc rule).

**`prepublishOnly` — DELTA from SDK.** SDK runs a build gate (`sdk/package.json:58`):
```jsonc
"prepublishOnly": "npm run build"   // SDK — appo has NO build
```
Appo substitutes the quality gate (D-02), reusing the EXISTING script names
(`appo/package.json:11,14,15` — `test`, `lint`, `typecheck`):
```jsonc
"prepublishOnly": "npm run lint && npm run typecheck && npm test"
```

**`files` array — DELTA.** Current `appo/package.json:17-21` is `["bin","src","README.md"]`.
Add `llms.txt` (D-02), keeping the whitelist (NOT an `.npmignore`):
```jsonc
"files": ["bin", "src", "README.md", "llms.txt"]
```

**Do NOT touch:** `name`, `version`, `license`, `type`, `bin`, `engines`,
`devDependencies`, the existing `scripts`. The package MUST stay zero-`dependencies`
(no `dependencies` key) — runtime-dependency-free invariant.

---

### `src/upgrade.mjs` (utility/service, network + process-spawn) — NEW

Two exported functions, both with **injectable** transports so unit tests never
hit the network or spawn npm. This is the research-recommended extraction
(RESEARCH.md line 177, 589).

**Analog A — `child_process` usage:** `src/login.mjs:1,7-15`. login uses `exec`
to open a browser, best-effort, fire-and-forget:
```javascript
// src/login.mjs:1
import { exec } from 'node:child_process';
// src/login.mjs:7-15 — the established child_process idiom (platform branch + best-effort)
function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? `open "${url}"`
    : process.platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {}); // best-effort
}
```
`runUpgrade()` uses `spawn` (not `exec`) — D-04/Pitfall-"exec hides progress" —
but inherits login.mjs's `process.platform === 'win32'` branch idiom for the
`shell:` option. Make `spawn` injectable for tests:
```javascript
import { spawn as nodeSpawn } from 'node:child_process';
export function runUpgrade({ spawnImpl = nodeSpawn } = {}) {
  return new Promise((resolve) => {
    const child = spawnImpl('npm', ['install', '-g', '@appolabs/appo@latest'], {
      stdio: 'inherit', shell: process.platform === 'win32',
    });
    child.on('error', (err) => { console.error(`Could not run npm: ${err.message}. Is npm on your PATH?`); resolve(1); });
    child.on('close', (code) => resolve(code ?? 1));
  });
}
```

**Analog B — `fetch` usage:** `src/login.mjs:26-30` and `src/api.mjs:29-37`. Both
call the built-in `fetch` with an `Accept: application/json` header; api.mjs guards
on `res.ok`/`res.status` and `res.json().catch(...)`:
```javascript
// src/api.mjs:29-37 — the established fetch idiom (headers, then res.ok / res.json)
const res = await fetch(`${apiBase}${path}`, { method, headers: { Accept: 'application/json', ... } });
if (res.status === 204) return null;
const payload = await res.json().catch(() => null);
```
`checkForUpdate()` mirrors this but swallows ALL errors (D-05) and uses the
**percent-encoded scoped URL** (Pitfall 4 — `%2F`, not a raw slash):
```javascript
const LATEST_URL = 'https://registry.npmjs.org/@appolabs%2Fappo/latest';
export async function checkForUpdate(installed, { fetchImpl = fetch, now = Date.now } = {}) {
  const cache = readUpdateCache();                 // from src/config.mjs (new helper, below)
  const DAY = 86_400_000;
  let latest = cache.latest;
  if (!cache.last_check_ms || now() - cache.last_check_ms > DAY) {
    try {
      const res = await fetchImpl(LATEST_URL, { headers: { Accept: 'application/json' } });
      if (res.ok) latest = (await res.json()).version;
      writeUpdateCache({ last_check_ms: now(), latest });
    } catch { return; }                            // swallow EVERY network error (D-05)
  }
  if (latest && isNewer(latest, installed)) {
    process.stderr.write(`update available: v${installed} -> v${latest} (run: appo upgrade)\n`);
  }
}
function isNewer(a, b) {                            // dependency-free x.y.z compare (no semver dep)
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i]||0) > (pb[i]||0)) return true; if ((pa[i]||0) < (pb[i]||0)) return false; }
  return false;
}
```

**Injection contract for tests:** both functions take an options bag with
`spawnImpl` / `fetchImpl` / `now` defaulting to the real impls — exactly the
`test/helpers/mockFetch.mjs` philosophy but as a parameter rather than a
`globalThis` override, so `upgrade.test.mjs` passes a fake without monkey-patching.

---

### `src/cli.mjs` (controller/dispatcher, request-response) — MODIFY

**Analog:** `src/cli.mjs` itself. Four established sub-patterns to copy from.

**1. `--version` / `-v` branch** — copy the `--help` early-return shape at
`src/cli.mjs:285-288`:
```javascript
// src/cli.mjs:285-288 — the pre-dispatch early-return analog
if (flags.help || positional[0] === 'help' || positional.length === 0) {
  console.log(USAGE);
  return 0;
}
```
New branch (D-03), placed alongside it, using `createRequire` (RESEARCH Pattern 1):
```javascript
import { createRequire } from 'node:module';          // add to import block
// inside run(), before dispatch:
if (flags.version || flags.v || positional[0] === 'version') {
  const require = createRequire(import.meta.url);
  const { version } = require('../package.json');      // src/cli.mjs -> ../package.json = repo root
  console.log(`appo/${version} node/${process.version}`);
  return 0;
}
```
**Parser DELTA:** `parseArgs` special-cases only `-h` (`src/cli.mjs:102-103`):
```javascript
} else if (a === '-h') {
  flags.help = true;
```
Extend it to map `-v` -> `flags.v` the same way.

**2. `case 'init'`** — compose existing subsystems (D-06). Copy three things:
- the token-vs-device branch from `case 'login'` (`src/cli.mjs:317-336`):
```javascript
// src/cli.mjs:320-333 — the login branch to reuse verbatim
if (typeof flags.token === 'string' && flags.token) {
  await loginWithToken(apiBase, env, flags.token);   // src/login.mjs:98
  ...
}
const { apiBase: base } = await login(apiBase, env); // src/login.mjs:25
```
- the idempotency guard via `storedToken(env)` (already imported, used at
  `src/cli.mjs:355`) — if a token exists, report the active env and return 0 (no clobber).
- the confirming whoami: reuse the `case 'whoami'` body (`src/cli.mjs:354-376`)
  which does `unwrap(await apiFetch(apiBase, 'GET', '/api/v1/apps', null, env))`
  and prints `env / api_base / status` via the `line(k,v)` idiom.
Config dir is created owner-only for free by `writeProfile`/`writeConfig`
(`src/config.mjs:54-59`) — no extra mkdir needed.

**3. `case 'upgrade'`** — thin dispatch to `src/upgrade.mjs`:
```javascript
case 'upgrade': {
  const code = await runUpgrade();
  return code;
}
```
Copy the minimal `case` shape from any non-sub verb (e.g. `case 'logout'`
`src/cli.mjs:338-352`).

**4. update-check hook** — call `checkForUpdate()` once, POST-command, gated on
`!flags.json`, wrapped non-fatally (D-05). The natural seam is the `bin/appo.mjs`
`.then()` or a wrapper in `run()` after the switch resolves but before returning.
NEVER before dispatch (latency) and NEVER under `--json` (corrupts output).

**5. USAGE** — extend the `USAGE` constant (`src/cli.mjs:14-70`) with the three
new verbs (`init`, `upgrade`, `--version`/`-v`) following the existing
two-column `appo <verb> <args>   Description` formatting. The exit-code taxonomy
block (`src/cli.mjs:54-58`) and env-vars block (`src/cli.mjs:63-69`) already exist
— they become the README's exit-codes / env-vars sections (single source).

---

### `src/config.mjs` (store, file-I/O) — MODIFY (add cache helpers)

**Analog:** `src/config.mjs` itself — `readConfig`/`writeConfig` (`:30-59`).

Add a dedicated `readUpdateCache` / `writeUpdateCache` pair (RESEARCH Open
Question 2 recommendation) that round-trips the raw file and mutates ONLY a
top-level `update_check` key — orthogonal to the `{ current, profiles }`
profile-fold, so it never collides with auth state. Reuse the same fs primitives
already imported (`src/config.mjs:1-3`) and the same lazy `configPath()`
resolution (`src/config.mjs:15-18`) so `APPO_CONFIG_HOME` test isolation works:
```javascript
// mirror readConfig's existsSync/JSON.parse/try-catch (src/config.mjs:30-51)
export function readUpdateCache() {
  const { file } = configPath();
  if (!existsSync(file)) return {};
  try { return (JSON.parse(readFileSync(file, 'utf-8')).update_check) || {}; }
  catch { return {}; }
}
// mirror writeConfig's mkdir(0o700)/write/chmod(0o600) (src/config.mjs:54-59)
export function writeUpdateCache(update_check) {
  const { file } = configPath();
  const raw = existsSync(file) ? (() => { try { return JSON.parse(readFileSync(file,'utf-8')); } catch { return {}; } })() : {};
  raw.update_check = update_check;
  // reuse writeConfig so owner-only perms are reapplied
}
```
Note: `readConfig` currently DROPS unknown top-level keys on the next
`writeConfig` (`src/config.mjs:50` returns only `{ current, profiles }`). The
dedicated-helper approach sidesteps this — the cache helpers read/write the raw
file directly, and the planner should ensure a `writeProfile`/`writeConfig` round
trip doesn't clobber `update_check` (either preserve it in `writeConfig`, or have
`writeUpdateCache` re-read+merge as shown). Prefer the dedicated helpers; do not
touch the profile-fold logic.

---

### `.github/workflows/release.yml` (config/CI, event-driven) — NEW

**Primary analog (shape):** `sdk/.github/workflows/release.yml` (the locked
convention source — mirror it step-for-step).
**Secondary analog (toolchain):** `appo/.github/workflows/ci.yml` — already proves
the npm shape (`cache: 'npm'`, `npm ci`, `npm run lint/typecheck`, `npm test`,
trigger `[main, master]`).

**Copy verbatim from SDK** (`sdk/.github/workflows/release.yml`):
- `name: Release` (:1), `on: push` (:3-5), `permissions: { contents: write, id-token: write }` (:10-12)
- checkout with `fetch-depth: 0` + `token` (:14-17)
- "Get current version" (:19-21), "Check if version already released" (:23-30)
- setup-node `node-version: '22'` + `registry-url` (:36-40)
- "Upgrade npm for trusted publishing" (:42-43)
- "Bump patch version" git config + `npm version patch --no-git-tag-version` (:45-53)
- "Get release version" (:55-57)
- "Create tag" (:74-79), "Publish to npm" `npm publish --provenance --access public` (:81-82)
- "Create GitHub Release" `softprops/action-gh-release@v2` (:84-88)

**DELTAS from SDK (all forced, all carry over from Phase 5):**
| SDK (`sdk/.../release.yml`) | appo release.yml | Why |
|---|---|---|
| `branches: [master]` (:5) | `branches: [master, main]` | appo CI uses both (ci.yml:3-4) |
| `pnpm/action-setup@v4` (:32-34) | **remove entirely** | appo uses npm, not pnpm |
| `cache: 'pnpm'` (:39) | `cache: 'npm'` (or omit) | npm toolchain (ci.yml:18) |
| `pnpm install --frozen-lockfile` (:59-60) | `npm ci` | ci.yml:19 |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` (:62-69) | `npm run lint` / `npm run typecheck` / `npm test` | ci.yml:20-22 |
| `- name: Build / run: pnpm build` (:71-72) | **remove entirely** | appo has NO build (the prepublishOnly quality gate replaces it, D-02/D-08) |

The full adapted YAML is pre-written in RESEARCH.md lines 397-466 — the planner
can cite it directly.

**D-09 boundary:** this file is CREATED and shape-VERIFIED (grep for
`id-token: write`, `npm publish --provenance --access public`, assert NO `pnpm`,
NO build step) but NEVER triggered by the executor. The one-time npm
trusted-publisher registration is documented in README, not performed.

---

### `README.md` (docs, static) — REWRITE (delete old, no append)

**Structure analog:** `sdk/README.md` is referenced as the voice/structure
reference (sectioned, anchor-able, neutral). Mirror its `## Section` heading
discipline so `llms.txt` anchors resolve.
**Command-inventory analog:** the `USAGE` constant `src/cli.mjs:14-70` IS the
authoritative command list (auth / apps / lifecycle / options / exit-codes /
env-vars blocks). The exit-codes block (`:54-58`) and env-vars block (`:63-69`)
transcribe directly into README sections.

Required sections (D-07), each needing a stable anchor `llms.txt` links to:
`#install`, `#ship` (the headline quickstart: install -> `appo init` -> `appo ship`),
`#appo-init`, `#auth` (login/logout/whoami), `#environments` (env list/use),
`#apps`, `#build`, `#status`, `#configure`, `#rejection`, `#fix-recipe`,
`#publish`, `#push`, `#resubmit`, `#upgrade`, `#environment-variables`,
`#exit-codes`, `#ci-auth`.

The full command inventory to cover is enumerated in RESEARCH.md lines 508-527
(every verb + flags). Current README (`appo/README.md`) only covers login + apps
— it is DELETED and rewritten in full (CLAUDE.md delete-old-code rule). Keep the
voice neutral/public (CLAUDE.md public-doc rule). Do NOT document `appo preview`
(Phase 4, deferred).

---

### `llms.txt` (docs, static) — NEW

**Analog:** `sdk/llms.txt` — copy its exact three-part shape:
```
# @appolabs/sdk                          <- sdk/llms.txt:1   (title `# <name>`)

> JavaScript bridge SDK for ...          <- sdk/llms.txt:3   (`> ` one-line tagline)

## Quick Start                           <- sdk/llms.txt:8   (`## Section` blocks of
- [Getting Started](README.md#quick-start)     README-anchor links)
```
Appo version (RESEARCH.md lines 471-505 has the full draft):
```
# @appolabs/appo

> The Appo CLI — create and manage native apps from the terminal or an agent.

## Quick Start
- [Install](README.md#install)
- [appo init](README.md#appo-init)
- [Ship an app](README.md#ship)

## Commands
- [appo ship](README.md#ship)
- ... every verb incl. ship ...

## Reference
- [Environment variables](README.md#environment-variables)
- [Exit codes](README.md#exit-codes)
- [Non-interactive / CI auth](README.md#ci-auth)
```
Per-command anchors recommended (D-07 granularity is discretion). Every command
in the inventory MUST appear (the packaging integration test greps for this).

---

### Test files (unit + integration)

**Shared test harness (apply to ALL new test files):** `test/unit/auth.test.mjs`
is the canonical analog.
- tmp-config isolation (`auth.test.mjs:32-52`): `mkdtempSync` +
  `process.env.APPO_CONFIG_HOME = tmpDir` in `beforeEach`; `resetMockFetch()` +
  delete env vars + `rmSync` in `afterEach`. This is load-bearing because
  `configPath()` resolves lazily (`src/config.mjs:15-18`).
- output capture (`auth.test.mjs:17-30` `captureAll`, or
  `help.test.mjs:5-15` `captureLog`) for asserting on stdout/stderr.
- fetch stubbing via `test/helpers/mockFetch.mjs` `installMockFetch([...])` +
  `lastRequest()` / `requests` (`auth.test.mjs:56-82`).

**`test/unit/version.test.mjs`** — analog `help.test.mjs:28-35` (call `run([...])`,
assert exit code + captured output). Assert `run(['--version'])` returns 0 and
prints `/^appo\/\d+\.\d+\.\d+ node\//`.

**`test/unit/upgrade.test.mjs`** — analog `auth.test.mjs:98-111` (assert the exact
request shape). Inject a fake `spawnImpl` into `runUpgrade`, assert it was called
with `('npm', ['install','-g','@appolabs/appo@latest'], ...)` and that the
resolved value equals the faked `close` code. No real spawn.

**`test/unit/update-check.test.mjs`** — analog `auth.test.mjs` tmp-config + an
injected `fetchImpl`/`now`. Cases (RESEARCH.md line 566): higher version ->
stderr notice; `--json` -> silent; `fetchImpl` throws -> silent + no crash;
within-day cache -> `fetchImpl` NOT called. Assert the `%2F` URL is requested.

**`test/unit/init.test.mjs`** — analog `auth.test.mjs:98-139` (loginWithToken
stores on 200; no-clobber leaves siblings untouched). Stub the device/token flow
via mockFetch + APPO_CONFIG_HOME tmp; assert a profile is written owner-only;
re-run on a configured env reports the active env without clobbering.

**`test/integration/packaging.test.mjs`** — analog `help.test.mjs:17-35` (iterate
a command list and grep). Covers SC1/SC4 (RESEARCH.md lines 559-568):
- `npm pack --dry-run` -> assert the file list is exactly
  `bin/appo.mjs`, `src/*.mjs`, `README.md`, `llms.txt`, `package.json` (no test/.planning).
- manifest field asserts (`publishConfig.access==='public'`, `repository`,
  `homepage`, `bugs`, `keywords`, `prepublishOnly`).
- grep `release.yml` for `id-token: write`, `npm publish --provenance --access public`,
  assert NO `pnpm`, assert NO build step.
- grep README + llms.txt for EVERY command in the inventory; grep llms.txt for
  `^# @appolabs/appo`, `^> `, `^## `.

---

## Shared Patterns

### Injectable transports for testability
**Source:** the `pollBuild` precedent in `src/cli.mjs:230-244` (injectable
`sleep`/`intervalMs`/`timeoutMs` so tests run instantly) + `test/helpers/mockFetch.mjs`.
**Apply to:** `src/upgrade.mjs` (`spawnImpl`, `fetchImpl`, `now`). The project's
established testability idiom is "default to the real impl, accept an override in
an options bag" — follow it so `run()` stays testable and tests never touch the
network or npm.

### Owner-only config writes
**Source:** `src/config.mjs:54-59` — `mkdirSync(dir, { mode: 0o700 })` +
`chmodSync(file, 0o600)`.
**Apply to:** `appo init` (inherited for free via `writeProfile`) and the
update-check cache helpers (`writeUpdateCache` must reuse `writeConfig` so the
0o700/0o600 discipline is reapplied — tokens live in the same file).

### Lazy config-path resolution for test isolation
**Source:** `src/config.mjs:15-18` (`configPath()` reads `APPO_CONFIG_HOME` per
call) + `test/unit/auth.test.mjs:37-40`.
**Apply to:** every new test (`init`, `update-check`) and every new config helper.
Never cache the path at module load.

### Error handling — best-effort vs. surfaced
**Source:** two project conventions:
- best-effort/swallow: `src/login.mjs:14` (`exec(cmd, () => {})`).
- surfaced via top-level catch: `src/cli.mjs:685-687` -> `renderError`
  (`src/cli.mjs:198-209`).
**Apply to:** `checkForUpdate` and the update-check hook = best-effort/swallow
(D-05, NEVER throws). `runUpgrade` reports the npm exit code (surfaced) but its
own `spawn` `error` event is swallowed into a friendly message + exit 1
(mirrors login.mjs's tolerance of a missing OS command).

### Neutral public-doc voice
**Source:** CLAUDE.md "Repository documents must read as neutral" +
`sdk/README.md` / `sdk/llms.txt` voice.
**Apply to:** README + llms.txt — architectural documentation, no internal
strategy phrasing, no "killer feature"/"the bet" trigger phrases.

---

## No Analog Found

None. Every file maps to an in-repo or sibling-SDK analog. The two genuinely new
behaviors with no prior in-repo line (`spawn` for upgrade, `%2F` registry fetch)
are composed from the existing `child_process`/`fetch` idioms in `src/login.mjs`
and `src/api.mjs` plus the verified patterns in RESEARCH.md (Patterns 2-3).

---

## Autonomy Boundary (D-09 — carry into every release-touching plan)

Release tasks STOP at `npm pack --dry-run` (tarball inspection) and an optional
LOCAL global install of the produced `.tgz` into a temp prefix. The executor MUST
NOT run `npm publish`, push a `vX.Y.Z` tag, register the trusted publisher, or
trigger `release.yml`. The first real release and the one-time npmjs.com trusted-
publisher setup are the user's documented manual actions.

---

## Metadata

**Analog search scope:** `appo/{package.json, bin/, src/, test/, .github/workflows/, README.md}`;
`sdk/{package.json, .github/workflows/release.yml, llms.txt}`.
**Files scanned:** 17 (7 appo source/config, 6 appo tests, 3 sdk convention sources, 1 appo ci.yml).
**Pattern extraction date:** 2026-06-15
