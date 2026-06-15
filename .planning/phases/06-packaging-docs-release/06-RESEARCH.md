# Phase 6: Packaging, docs & release - Research

**Researched:** 2026-06-15
**Domain:** npm package publishing (scoped, dependency-free Node ESM CLI), self-update, docs, OIDC trusted-publishing CI
**Confidence:** HIGH

## Summary

This phase makes `@appolabs/appo` publishable, self-updating, and documented — the final v0.1 phase.
Every implementation choice is constrained by two locked invariants: the package stays **RUNTIME
dependency-free** (`dependencies` empty; dev tooling only) and the executor **must not perform the actual
publish** (D-09). All four new runtime behaviors (`--version`, `appo init`, `appo upgrade`, update-check
notice) are achievable with Node built-ins (`node:module` `createRequire`, `node:child_process`, built-in
`fetch`, the existing `src/config.mjs` store). The metadata, `release.yml`, README, and `llms.txt` mirror
`@appolabs/sdk` exactly in shape, adapted for npm-not-pnpm and no-build.

The verification of the whole phase is achievable **without a real publish**: `npm pack --dry-run`
[VERIFIED — ran in this session] already produces a clean 8-file tarball (`bin/`, `src/`, `README.md`,
`package.json` — `.planning/`, `test/`, `node_modules`, lockfile, configs all correctly excluded by the
`files` whitelist). Adding `llms.txt` to `files` is the only tarball change. Network-dependent behaviors
(`upgrade`, update-check) are unit-tested by stubbing `child_process`/`fetch` exactly as Phase 1-5 stubbed
`globalThis.fetch` via `test/helpers/mockFetch.mjs`.

**Primary recommendation:** Read the version via `createRequire(import.meta.url)('../package.json').version`
from `src/cli.mjs`; spawn `npm install -g @appolabs/appo@latest` with `stdio: 'inherit'` for `upgrade`;
cache the update-check in the existing `~/.appo/config.json` store (best-effort, daily, never on `--json`);
mirror the SDK `release.yml` verbatim with `pnpm→npm` and the build step replaced by the lint/typecheck/test
gate; stop every release task at `npm pack`/`--dry-run`. The one-time npm trusted-publisher registration and
the first live publish are the user's documented manual actions.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 (package metadata):** Add `publishConfig: { access: "public" }` (required — scoped package),
  `repository` (`git+https://github.com/appolabs/appo.git`), `homepage` (`…/appo#readme`),
  `bugs` (`…/appo/issues`), `keywords` (appo, cli, mobile, app-store, publishing, ship, ios, android),
  `author`. `description` + `license: MIT` already present.
- **D-02 (publish gate + files):** Add `prepublishOnly` running `npm run lint && npm run typecheck && npm test`
  (SDK runs `npm run build`; we have no build — substitute quality gates). Add `llms.txt` to `files`.
  Confirm via `npm pack` the tarball contains ONLY `bin/`, `src/`, `README.md`, `llms.txt`, `package.json`.
- **D-03 (`--version`):** `appo --version` / `-v` prints the package version, read dependency-free relative
  to `bin/appo.mjs`. Format `appo/<version> node/<process.version>`. Handled in the arg layer before dispatch.
- **D-04 (`appo upgrade`):** spawns `npm install -g @appolabs/appo@latest` via `child_process`, reports
  outcome + new version. Plain, explicit, user-invoked.
- **D-05 (update-check notice):** best-effort, at most once/day (cache timestamp + latest-known version in
  `~/.appo/config.json`), compare installed vs npm-registry `latest`; if behind, print a one-line
  `update available: vX → vY (run: appo upgrade)` to **stderr**. Non-blocking, NEVER on `--json`, silently
  skipped on any network error. (SC3 met by `appo upgrade` alone; notice is the nicety, may be deferred.)
- **D-06 (`appo init`):** an `appo init` subcommand in THIS package (not a separate `create-appo`).
  Bootstraps config (ensure `~/.appo`, owner-only) + first login (device flow default, `--token <pat>` for
  non-interactive) + a confirming `whoami`. Idempotent: re-run on a configured env reports the active env
  rather than clobbering (honors no-clobber profiles rule).
- **D-07 (docs):** Rewrite `README.md` for the full surface: install, ship-first quickstart, `appo init`,
  complete command reference (every verb + flags), env vars (`APPO_TOKEN`/`APPO_ENV`/`APPO_API_BASE`), exit
  codes 0/1/2/3, multi-environment profiles, non-interactive/CI auth. Generate `llms.txt` in the SDK shape
  (`# title` + `> tagline` + `## section` README-anchor links) enumerating every command incl. `ship`.
  README is the single source; `llms.txt` links into it.
- **D-08 (release.yml):** Mirror the SDK's: trigger on push to `master`/`main`; read version, auto patch-bump
  if already tagged; lint → typecheck → test (NO build); create `vX.Y.Z` tag;
  `npm publish --provenance --access public` via trusted publishing (`permissions: id-token: write` — OIDC,
  no `NPM_TOKEN`); GitHub Release with generated notes. Use npm (not pnpm).
- **D-09 (autonomy boundary — NON-NEGOTIABLE):** This phase BUILDS and VERIFIES the release machinery
  (incl. `npm pack` dry-run) but the executor MUST NOT run `npm publish`, push a `vX.Y.Z` tag, or publish
  autonomously. First real release is the user's explicit action. One-time trusted-publishing setup is
  documented, not performed.

### Claude's Discretion
- Exact keyword list and README section ordering.
- Whether the update-check notice ships in v0.1 or is deferred (SC3 met by `appo upgrade` regardless).
- `appo init`'s exact prompts/flags beyond config-bootstrap + login.
- `llms.txt` granularity (per-command vs per-group anchors).

### Deferred Ideas (OUT OF SCOPE)
- A separate `create-appo` npm package — superseded by `appo init` (D-06).
- Richer update-check (auto-upgrade, release-channel selection).
- `appo preview` docs — Phase 4 (deferred/blocked on apps-web-app Phase 188).
- Homebrew / other distribution channels — npm only for v0.1.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLI-05 | Packaging, docs & release — npm publish `@appolabs/appo` + scaffolder, `appo upgrade`/update-check, README/command-reference/llms.txt | Standard Stack (metadata + Node built-ins) + Code Examples (`--version`/`upgrade`/update-check/`init`) + release.yml mirror + Validation Architecture (dry-run verification of SC1-SC4 without a real publish) |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `--version` reporting | CLI arg layer (`run()` in `src/cli.mjs`) | — | Handled before dispatch like `--help`; pure local read of `package.json` |
| `appo upgrade` | CLI command (`src/cli.mjs` → `node:child_process`) | OS package manager (global npm) | Shelling out to the user's npm is the only way to mutate a global install |
| update-check notice | CLI post-command hook (`run()`) + config store (`src/config.mjs`) | npm registry (network) | Best-effort read; cached locally; network is optional and swallowed |
| `appo init` | CLI command (`src/cli.mjs`) | config bootstrap (`src/config.mjs`) + first login (`src/login.mjs`) | Pure composition of existing subsystems — no new transport |
| package metadata / `files` | Build/packaging tier (`package.json`) | — | Static manifest; consumed by `npm pack`/`npm publish` |
| release workflow | CI tier (`.github/workflows/release.yml`) | npm registry (OIDC) | Runs only in GitHub Actions; the executor never triggers it |
| README / `llms.txt` | Docs tier (static files) | — | Shipped in tarball (`files`), source-of-truth = README |

## Standard Stack

### Core (all Node built-ins — zero runtime deps, satisfies the dependency-free invariant)
| Module | Version | Purpose | Why Standard |
|--------|---------|---------|--------------|
| `node:module` (`createRequire`) | built-in (Node ≥18) | Read `../package.json` version from ESM without an import-assertion or runtime dep | The canonical ESM way to `require()` JSON relative to a module URL; works repo-local and globally-installed [CITED: nodejs.org/api/module.html#modulecreaterequirefilename] |
| `node:child_process` (`spawn`) | built-in | `appo upgrade` → run global `npm install` | Already used in `src/login.mjs` (`exec` opens the browser); `spawn` with inherited stdio streams npm's own progress [VERIFIED: src/login.mjs:1,14] |
| global `fetch` | built-in (Node ≥18) | update-check: query npm registry `latest` | Already the project's HTTP client (`src/login.mjs`, `src/api.mjs`); no `node-fetch` dep [VERIFIED: src/login.mjs:26] |
| `src/config.mjs` (existing) | n/a | `appo init` config bootstrap + update-check cache | `readConfig`/`writeConfig`/`writeProfile`/`configPath` already provide owner-only `~/.appo/config.json` [VERIFIED: src/config.mjs] |
| `src/login.mjs` (existing) | n/a | `appo init` first login | `login()` (device) / `loginWithToken()` (`--token`) reused as-is [VERIFIED: src/login.mjs:25,98] |

### Supporting (devDeps — already present, unchanged)
| Package | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^1.6.1 | unit/integration tests, `prepublishOnly` gate | Already the test runner (122 cases) [VERIFIED: package.json] |
| eslint | ^8.57.1 | lint, `prepublishOnly` gate | Already configured [VERIFIED: package.json] |
| typescript | ^5.9.3 | `tsc --noEmit` typecheck, `prepublishOnly` gate | Already configured [VERIFIED: package.json] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `createRequire(...)('../package.json').version` | `readFileSync(new URL('../package.json', import.meta.url))` + `JSON.parse` | Both work and both are dependency-free. `readFileSync(new URL(...))` avoids constructing a `require`; `createRequire` is one line and caches. Either is robust globally-installed (see Pitfall 1). **Recommend `createRequire`** — fewer moving parts, no manual JSON.parse, no encoding arg. [ASSUMED — both verified to work in principle; see Pitfall 1 for the path-resolution proof] |
| `child_process.spawn` for `upgrade` | `child_process.exec` | `exec` buffers all output and hides npm's live progress; `spawn` with `stdio: 'inherit'` streams it. **Recommend `spawn`** for a long-running global install. |
| separate `create-appo` package | `appo init` subcommand | D-06 locks `appo init` — avoids a second published artifact. |

**Installation:** No new runtime dependencies. No `npm install` of runtime packages. (devDeps unchanged.)

**Version verification:**
- `@appolabs/appo` is NOT yet published [VERIFIED: `npm view @appolabs/appo version` errored / no result this session — confirms first-publish scenario, see Open Questions].
- `@appolabs/sdk` published version = **2.0.0** [VERIFIED: `npm view @appolabs/sdk version` and the registry manifest this session].
- Local toolchain this session: Node + npm present; `npm pack --dry-run` succeeds [VERIFIED].

## Architecture Patterns

### System Architecture Diagram

```
                          appo <command> [flags]
                                  |
                                  v
                        bin/appo.mjs  (run(argv))
                                  |
              +-------------------+--------------------+
              |                   |                    |
        --version / -v       command dispatch      update-check hook
        (before dispatch)    (switch in run())     (post-command, !--json,
              |                   |                  best-effort, daily cache)
              v                   |                    |
   createRequire('../package      |              fetch registry /latest
    .json').version               |              compare vs installed ver
   print appo/<v> node/<v>        |              read+write ~/.appo cache
   return 0                       |              print stderr notice or skip
                                  |
        +-------------+-----------+-----------+-------------------+
        |             |           |           |                   |
     case 'init'  case 'upgrade'  existing verbs (login/apps/   default
        |             |           ship/build/status/.../env)    (unknown -> 2)
        v             v
  ensure ~/.appo   spawn npm install -g
  (owner-only)     @appolabs/appo@latest
  login()/         stdio:'inherit'
  loginWithToken() report exit code +
  whoami confirm   resolved new version
  idempotent:      (re-read registry or
  if configured,   npm ls -g)
  report active env

  --- CI tier (executor never triggers) ---
  push master -> release.yml -> read ver -> patch-bump-if-tagged ->
    lint -> typecheck -> test -> tag vX.Y.Z -> npm publish --provenance
    --access public (OIDC id-token) -> GitHub Release
```

### Component Responsibilities
| File | Responsibility | Change |
|------|----------------|--------|
| `bin/appo.mjs` | entry shim | unchanged (delegates to `run()`) |
| `src/cli.mjs` | `--version`/`-v` branch, `case 'init'`, `case 'upgrade'`, update-check hook, USAGE extension | modified |
| `src/config.mjs` | update-check cache read/write (timestamp + last-known latest) | modified (add cache helpers) |
| `src/login.mjs` | reused by `appo init` | unchanged |
| `src/upgrade.mjs` (new, optional) | `runUpgrade()` + `checkForUpdate()` extracted for unit-testing with injectable `spawn`/`fetch` | created (recommended — keeps `run()` testable) |
| `package.json` | metadata, `prepublishOnly`, `files += llms.txt` | modified |
| `.github/workflows/release.yml` | release workflow | created |
| `README.md` | full-surface rewrite | rewritten (delete old, no append) |
| `llms.txt` | agent-facing condensed doc | created |

### Pattern 1: Dependency-free version read (D-03)
**What:** Read `version` from `package.json` relative to the module, not the CWD.
**When to use:** `--version` / `-v` and the update-check baseline.
```javascript
// Source: nodejs.org/api/module.html#modulecreaterequirefilename
// In src/cli.mjs (one dir below the package root, so ../package.json):
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { version } = require('../package.json'); // src/cli.mjs -> ../package.json == repo root
// --version output:
console.log(`appo/${version} node/${process.version}`);
```
Path note: from `src/cli.mjs`, `../package.json` is the repo root manifest. npm preserves the
`bin/` + `src/` + `package.json` layout on a global install (Pitfall 1), so `../package.json`
resolves identically when installed. [VERIFIED: tarball layout via `npm pack --dry-run` this session]

### Pattern 2: `appo upgrade` via spawn (D-04)
**What:** Shell out to the user's npm to replace the global install.
```javascript
// Source: nodejs.org/api/child_process.html#child_processspawncommand-args-options
import { spawn } from 'node:child_process';
function runUpgrade() {
  return new Promise((resolve) => {
    // shell:true lets Windows resolve npm.cmd off PATH; args array avoids injection.
    const child = spawn('npm', ['install', '-g', '@appolabs/appo@latest'], {
      stdio: 'inherit', shell: process.platform === 'win32',
    });
    child.on('error', (err) => { // npm not on PATH, ENOENT
      console.error(`Could not run npm: ${err.message}. Is npm on your PATH?`);
      resolve(1);
    });
    child.on('close', (code) => resolve(code ?? 1));
  });
}
```
After a 0 exit, report the resolved new version (re-query the registry `latest`, or read it back —
the registry query is the dependency-free option already needed for update-check).

### Pattern 3: Update-check notice (D-05)
**What:** Daily, best-effort registry comparison printed to stderr; never on `--json`.
```javascript
// Registry latest manifest for a scoped package (NOTE the %2F encoding of the scope slash):
const LATEST_URL = 'https://registry.npmjs.org/@appolabs%2Fappo/latest';
// [VERIFIED: the analogous https://registry.npmjs.org/@appolabs%2Fsdk/latest returned a valid
//  manifest with a "version" field this session]

async function checkForUpdate(installed, { fetchImpl = fetch, now = Date.now } = {}) {
  const cache = readUpdateCache();              // { last_check_ms, latest } from ~/.appo/config.json
  const DAY = 86_400_000;
  let latest = cache.latest;
  if (!cache.last_check_ms || now() - cache.last_check_ms > DAY) {
    try {
      const res = await fetchImpl(LATEST_URL, { headers: { Accept: 'application/json' } });
      if (res.ok) latest = (await res.json()).version;
      writeUpdateCache({ last_check_ms: now(), latest }); // persist even on no-change
    } catch { return; }                          // swallow ALL network errors silently
  }
  if (latest && isNewer(latest, installed)) {
    process.stderr.write(`update available: v${installed} -> v${latest} (run: appo upgrade)\n`);
  }
}

// Dependency-free x.y.z compare — numeric split is sufficient for our versions:
function isNewer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i]||0) > (pb[i]||0)) return true; if ((pa[i]||0) < (pb[i]||0)) return false; }
  return false;
}
```
Cache shape in `~/.appo/config.json` — store under a non-profile top-level key so it never collides
with `current`/`profiles` and survives the legacy-fold in `readConfig` (extend `readConfig`/`writeConfig`
to preserve unknown top-level keys, OR add a dedicated `update_check: { last_check_ms, latest }` key
written/read by new helpers): recommend `update_check: { last_check_ms, latest }`.
**Hook placement:** call once in `run()` AFTER the command completes, gated on `!flags.json`, awaited
non-fatally (wrap in try/catch). NEVER for `--json` output (D-05) and NEVER before the command (latency).

### Pattern 4: `appo init` composition (D-06)
**What:** Idempotent bootstrap = ensure config dir + first login + confirming whoami.
```javascript
case 'init': {
  // Idempotency: if the active env already has a token, report and stop (no clobber).
  if (storedToken(env)) {
    console.log(`Already configured — active env '${env}' (${apiBase}).`);
    // optional: run the whoami liveness probe and exit accordingly
    return 0;
  }
  // Config dir is created owner-only by writeProfile/writeConfig on first write — no extra mkdir
  // needed, but an explicit ensure is harmless. First login: token branch or device flow.
  if (typeof flags.token === 'string' && flags.token) {
    await loginWithToken(apiBase, env, flags.token);
  } else {
    await login(apiBase, env);
  }
  // Confirming whoami: reuse the existing whoami path (GET /api/v1/apps liveness + count).
  // ... print env / api_base / authenticated count ...
  return 0;
}
```
Note: `~/.appo` with `mode 0o700` and the config file `0o600` are already enforced by
`writeConfig` [VERIFIED: src/config.mjs:54-59] — `init` inherits owner-only writes for free.

### Anti-Patterns to Avoid
- **Importing `package.json` with an import assertion** (`import pkg from '../package.json' assert {...}`):
  syntax is unstable across Node 18/20/22 and adds friction; use `createRequire`. [ASSUMED]
- **Reading version from `process.env.npm_package_version`:** only set when run via an npm script, not
  when invoked as the global `appo` binary — would print `undefined`. Use the manifest read.
- **Update-check before/blocking the command:** adds latency + network to every invocation; must be
  post-command, cached, best-effort, swallowed on error (D-05).
- **Update-check on `--json`:** would corrupt machine-readable output. Hard skip (D-05).
- **`exec` for `upgrade`:** buffers and hides npm's live progress; use `spawn` + `stdio: 'inherit'`.
- **Appending to the old README:** delete-old-code rule — rewrite the README in full (D-07).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Read version from manifest | Hand-parse `package.json` by string offset | `createRequire(import.meta.url)('../package.json')` | Resolves relative to the module, works globally-installed |
| Global self-update | Re-implement npm install logic | `spawn('npm', ['install','-g','@appolabs/appo@latest'])` | npm owns global install perms/paths |
| Fetch latest version | Bundle an http client | built-in `fetch` against `registry.npmjs.org/<scoped>/latest` | Node ≥18 has fetch; no `node-fetch` dep |
| Owner-only config dir | New mkdir/chmod code | existing `writeConfig` (mode 0o700/0o600) | Already enforced and tested |
| First login flow | New device-flow code | existing `login()` / `loginWithToken()` | Battle-tested in Phases 1-3 |
| Tarball file selection | Manual `.npmignore` | `files` whitelist (already present) | Whitelist is stricter and already correct |
| semver compare (x.y.z) | a semver dependency | numeric split (`isNewer` above) | Dependency-free; our versions are plain `x.y.z`, no pre-release tags |

**Key insight:** The dependency-free invariant is not a constraint to work around here — every needed
capability already has a Node built-in or an existing project helper. Adding any runtime dep would
violate the locked invariant and gains nothing.

## Common Pitfalls

### Pitfall 1: `--version` path resolution when globally installed
**What goes wrong:** Reading `package.json` from the CWD or via a relative path that breaks once the
package lives in npm's global `node_modules`.
**Why it happens:** Developers test repo-local (`node bin/appo.mjs`) where CWD == repo root, then it
breaks under `npm i -g`.
**How to avoid:** Resolve relative to the MODULE (`import.meta.url`), not the CWD. From `src/cli.mjs`,
`../package.json` is the manifest. npm preserves the `bin/`+`src/`+`package.json` layout on global
install [VERIFIED: `npm pack --dry-run` tarball this session keeps exactly that layout], so the relative
path holds. Test both: `node bin/appo.mjs --version` AND `npm pack` → install the tarball globally in a
temp prefix → `appo --version` (see Validation Architecture).
**Warning signs:** `--version` prints `undefined` or throws `ENOENT` only after a global install.

### Pitfall 2: Scoped-package publish requires `access: public`
**What goes wrong:** `npm publish` defaults scoped packages to **restricted** (private), failing on a
free/public account.
**Why it happens:** Scoped names are private-by-default on npm.
**How to avoid:** Both belt and suspenders — `publishConfig.access: "public"` in package.json (D-01) AND
`--access public` on the publish command (D-08, mirrors SDK). [VERIFIED: SDK package.json has
`publishConfig.access:public` and its release.yml uses `--access public`]
**Warning signs:** `402 Payment Required` or `restricted` errors on first publish (a user-side failure,
not the executor's — the executor stops at dry-run).

### Pitfall 3: Trusted-publishing prerequisites (one-time, user-performed)
**What goes wrong:** `release.yml` fails OIDC auth because npm has no trusted publisher registered, or
the workflow filename / repo doesn't match exactly.
**Why it happens:** OIDC trusted publishing requires a one-time npmjs.com registration that the executor
cannot and must not perform (D-09).
**How to avoid:** Document (do not perform) the exact one-time setup in README/release notes:
1. The package must already exist on npm — i.e. a first manual publish, OR npm may need it created first
   (see Open Questions). [CITED: docs.npmjs.com/trusted-publishers — "Your package must already exist on npm"]
2. On npmjs.com → package Settings → Trusted Publisher: provider **GitHub Actions**; **Organization/user**
   = `appolabs`; **Repository** = `appo`; **Workflow filename** = `release.yml` (exact, case-sensitive,
   incl. `.yml`); **Environment** = (blank unless used). [CITED: docs.npmjs.com/trusted-publishers]
3. `package.json` `repository.url` must match the GitHub repo exactly. [CITED: same]
4. Workflow needs `permissions: id-token: write` and a recent npm (the SDK upgrades npm in-job:
   `npm install -g npm@latest`; npm docs require npm ≥ 11.5.1, Node ≥ 22.14.0).
   [CITED: docs.npmjs.com/trusted-publishers; VERIFIED: SDK release.yml step "Upgrade npm for trusted publishing"]
**Warning signs:** `npm error 401`/OIDC mismatch in the release job.

### Pitfall 4: Scoped registry URL encoding
**What goes wrong:** `https://registry.npmjs.org/@appolabs/appo/latest` (raw slash in scope) 404s.
**Why it happens:** The scope slash must be percent-encoded.
**How to avoid:** Use `https://registry.npmjs.org/@appolabs%2Fappo/latest`.
[VERIFIED: the analogous `@appolabs%2Fsdk/latest` returned a valid manifest with a `version` field this session]
**Warning signs:** update-check silently never fires (it swallows errors — so test the URL explicitly).

### Pitfall 5: `npm pack` including unexpected files
**What goes wrong:** Tests, `.planning/`, lockfile, configs leak into the tarball.
**Why it happens:** A missing/loose `files` whitelist or an `.npmignore` gap.
**How to avoid:** The `files: ["bin","src","README.md"]` whitelist ALREADY excludes everything else.
[VERIFIED: `npm pack --dry-run` this session produced exactly 8 files: `README.md`, `bin/appo.mjs`,
`package.json`, `src/{api,cli,config,login,ops}.mjs` — NO `.planning/`, `test/`, `node_modules`,
`package-lock.json`, `.eslintrc.json`, `tsconfig.json`, `vitest.config.mjs`]. Adding `llms.txt` to
`files` is the only intended addition (package.json is always included automatically). After the change,
re-assert the dry-run output contains exactly: `bin/appo.mjs`, `src/*.mjs`, `README.md`, `llms.txt`,
`package.json`.
**Warning signs:** `total files` count jumps; dry-run lists a test or planning file.

### Pitfall 6: `prepublishOnly` running where you don't want it
**What goes wrong:** `prepublishOnly` runs on every `npm publish` AND `npm pack` is NOT gated by it (pack
does not run prepublishOnly), so the gate can pass locally but the executor must still verify with pack.
**Why it happens:** npm lifecycle: `prepublishOnly` runs on `publish` only; `prepack`/`prepare` run on
`pack`. [ASSUMED — standard npm lifecycle; confirm if pack-time gating is desired]
**How to avoid:** D-02 puts the gate in `prepublishOnly` (publish-time), which is correct — it must not
block `npm pack --dry-run` (the executor's verification step). Keep the verification on pack/dry-run, and
let the real publish (user/CI) run the gate. Do NOT also wire the gate into `prepack` (would slow the
executor's dry-run and is redundant with CI).
**Warning signs:** the executor's `npm pack --dry-run` triggers a full lint/typecheck/test run.

## Code Examples

### `--version` / `-v` branch in `run()` (before dispatch, D-03)
```javascript
// In src/cli.mjs run(), alongside the --help branch:
if (flags.version || flags.v || positional[0] === 'version') {
  const require = createRequire(import.meta.url);
  const { version } = require('../package.json');
  console.log(`appo/${version} node/${process.version}`);
  return 0;
}
```
Note: extend `parseArgs` / the `-h` shorthand handling to also map `-v` → `flags.v` (the parser
currently special-cases only `-h`). [VERIFIED: src/cli.mjs:102-103]

### release.yml (mirror SDK, adapted: npm not pnpm, no build, quality gate)
```yaml
# Source: ../sdk/.github/workflows/release.yml (mirrored), adapted per D-08
name: Release
on:
  push:
    branches: [master, main]   # SDK uses [master]; appo CI uses [main, master]
jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write           # OIDC trusted publishing
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}
      - name: Get current version
        id: current
        run: echo "version=$(node -p "require('./package.json').version")" >> $GITHUB_OUTPUT
      - name: Check if version already released
        id: check
        run: |
          if git rev-parse "v${{ steps.current.outputs.version }}" >/dev/null 2>&1; then
            echo "needs_bump=true" >> $GITHUB_OUTPUT
          else
            echo "needs_bump=false" >> $GITHUB_OUTPUT
          fi
      - uses: actions/setup-node@v4
        with:
          node-version: '22'              # SDK uses 22; trusted publishing needs Node >= 22.14
          registry-url: 'https://registry.npmjs.org'
      - name: Upgrade npm for trusted publishing
        run: npm install -g npm@latest    # needs npm >= 11.5.1
      - name: Bump patch version
        if: steps.check.outputs.needs_bump == 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          npm version patch --no-git-tag-version
          git add package.json
          git commit -m "chore: bump version to $(node -p "require('./package.json').version")"
          git push
      - name: Get release version
        id: version
        run: echo "version=$(node -p "require('./package.json').version")" >> $GITHUB_OUTPUT
      - name: Install dependencies
        run: npm ci                       # npm, not pnpm
      - name: Lint
        run: npm run lint
      - name: Type check
        run: npm run typecheck
      - name: Test
        run: npm test
      # NO build step (appo has no build) — the quality gate replaces it (D-02/D-08)
      - name: Create tag
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git tag -a "v${{ steps.version.outputs.version }}" -m "Release v${{ steps.version.outputs.version }}"
          git push origin "v${{ steps.version.outputs.version }}"
      - name: Publish to npm
        run: npm publish --provenance --access public
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: v${{ steps.version.outputs.version }}
          generate_release_notes: true
```
Divergences from SDK, all forced: dropped `pnpm/action-setup`; `cache: 'pnpm'` → none (or `'npm'`);
`pnpm install --frozen-lockfile` → `npm ci`; `pnpm lint/typecheck/test` → `npm run …`; **removed the
`pnpm build` step entirely**; trigger `[master]` → `[master, main]`.

### llms.txt (mirror SDK shape, enumerate every appo command)
```
# @appolabs/appo

> The Appo CLI — create and manage native apps from the terminal or an agent.

## Quick Start

- [Install](README.md#install)
- [appo init](README.md#appo-init)
- [Ship an app](README.md#ship)

## Commands

- [appo ship](README.md#ship)
- [appo init](README.md#appo-init)
- [appo login / logout / whoami](README.md#auth)
- [appo env list / use](README.md#environments)
- [appo apps create / list / show / set-name](README.md#apps)
- [appo build](README.md#build)
- [appo status](README.md#status)
- [appo configure](README.md#configure)
- [appo rejection](README.md#rejection)
- [appo fix-recipe](README.md#fix-recipe)
- [appo publish](README.md#publish)
- [appo push](README.md#push)
- [appo resubmit](README.md#resubmit)
- [appo upgrade / --version](README.md#upgrade)

## Reference

- [Environment variables](README.md#environment-variables)
- [Exit codes](README.md#exit-codes)
- [Non-interactive / CI auth](README.md#ci-auth)
```
(Granularity is Claude's discretion per D-07; per-command anchors recommended so an agent can deep-link.)

## Authoritative command inventory (for README + llms.txt completeness)

Every command MUST appear in README and llms.txt. Source: USAGE in `src/cli.mjs` + phase SUMMARYs
[VERIFIED: src/cli.mjs:14-70].

- **Auth:** `login` (device), `login --token <pat>`, `logout`, `whoami`
- **Environments:** `env list`, `env use <name>`
- **Apps:** `apps create --name --url [--meta-name --meta-desc]`, `apps list`, `apps show <id>`,
  `apps set-name <id> <name>`
- **Lifecycle:** `ship <id>` / `ship --url --name [--stores --platform --timeout --yes]`,
  `status <id> [--build]`, `build <id> [--platform --branch]`,
  `configure <id> [--name --url --meta-name --meta-desc --injected-css --injected-js]`,
  `rejection <id>`, `fix-recipe <id>`,
  `publish <id> --stores … --confirm`, `push <id> --title --body [--target-url --image-path --scheduled-at] --confirm`,
  `resubmit <id> --confirm`
- **Packaging (new this phase):** `init [--token]`, `upgrade`, `--version`/`-v`
- **Global flags:** `--api`, `--env`, `--token`, `--json`, `--confirm`, `--yes`, `--timeout`, `--stores`,
  `--platform`, `-h/--help`
- **Env vars:** `APPO_TOKEN`, `APPO_ENV`, `APPO_API_BASE`
- **Exit codes:** `0` success, `1` runtime/API error, `2` usage error, `3` confirm required

## Runtime State Inventory

This is primarily an additive (greenfield-ish) phase, but it touches `~/.appo/config.json`:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `~/.appo/config.json` `{ current, profiles }` — update-check (D-05) adds a top-level `update_check` key | Code edit only (new key; `readConfig`/`writeConfig` must preserve unknown top-level keys, OR add dedicated cache helpers). No migration of existing records — existing profiles untouched. |
| Live service config | npm trusted-publisher registration on npmjs.com (NOT in git) | Manual, USER-performed, documented (D-09 / Pitfall 3) |
| OS-registered state | Global npm install of `appo` binary | `appo upgrade` re-installs it; no other OS registration |
| Secrets/env vars | None new — `APPO_TOKEN`/`APPO_ENV`/`APPO_API_BASE` unchanged; NO `NPM_TOKEN` secret (OIDC) | None |
| Build artifacts | None — no build step; `npm pack` produces a transient `.tgz` (gitignore it / clean up) | Clean up stray `appolabs-appo-*.tgz` from dry-runs |

## Validation Architecture

> nyquist_validation: no explicit `.planning/config.json` found this session; treat as ENABLED.
> Vitest is the framework (122 cases across `test/unit/`, `test/integration/`).
> All SC1-SC4 are verifiable WITHOUT a real publish, per D-09.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^1.6.1 |
| Config file | `vitest.config.mjs` (per-worker config isolation) |
| Quick run command | `npx vitest run test/unit/<file>.test.mjs` |
| Full suite command | `npm test` (`vitest run`) |
| Fetch/child-process stubbing | `test/helpers/mockFetch.mjs` (stubs `globalThis.fetch`); inject `spawn`/`fetch` into new `src/upgrade.mjs` fns |

### Phase Requirements → Test Map (verify SC1-SC4 without publishing)
| SC | Behavior | Test Type | Automated Command | File Exists? |
|----|----------|-----------|-------------------|-------------|
| SC1 | Tarball contains ONLY bin/ src/ README.md llms.txt package.json | integration (shell) | `npm pack --dry-run` then assert file list (8→9 files; grep -v test/.planning) | ❌ Wave 0 (new test/script) |
| SC1 | package.json has publishConfig.access, repository, homepage, bugs, keywords, author, prepublishOnly | unit | `node -e "const p=require('./package.json'); assert p.publishConfig.access==='public' && p.repository && p.scripts.prepublishOnly"` or a vitest manifest test | ❌ Wave 0 |
| SC1 | release.yml shape: id-token:write, no build step, npm not pnpm, --provenance --access public | integration (grep) | grep `id-token: write`, grep `npm publish --provenance --access public`, assert NO `pnpm`, assert NO `run: .*build` | ❌ Wave 0 |
| SC2 | `appo init` bootstraps config + first login + whoami; idempotent | unit (mock fetch + APPO_CONFIG_HOME tmp) | `npx vitest run test/unit/init.test.mjs` — stub device/token flow, assert profile written owner-only, re-run reports active env (no clobber) | ❌ Wave 0 |
| SC3 | `appo --version` prints `appo/<v> node/<v>` | unit | `npx vitest run test/unit/version.test.mjs`; also live `node bin/appo.mjs --version` | ❌ Wave 0 |
| SC3 | `appo --version` works globally-installed (path resolves) | integration (shell) | `npm pack` → `npm i -g --prefix $TMP ./*.tgz` → `$TMP/bin/appo --version` exits 0 | ❌ Wave 0 |
| SC3 | `appo upgrade` invokes `npm install -g @appolabs/appo@latest`, reports exit code | unit (inject spawn) | `npx vitest run test/unit/upgrade.test.mjs` — inject a fake spawn, assert argv == `['install','-g','@appolabs/appo@latest']`, assert reported code | ❌ Wave 0 |
| SC3 | update-check: daily cache, registry %2F URL, stderr notice, skip on --json, swallow net error | unit (inject fetch + tmp config) | `npx vitest run test/unit/update-check.test.mjs` — fake fetch returns higher version → assert stderr notice; `--json` → assert silent; fetch throws → assert silent + no crash; within-day → assert no fetch | ❌ Wave 0 |
| SC4 | README + llms.txt mention EVERY command | integration (grep) | for each of the inventory list above: `grep -q "appo ship" README.md && grep -q ship llms.txt` … (a single test iterating the command list) | ❌ Wave 0 |
| SC4 | llms.txt matches SDK shape (`# title`, `> tagline`, `## section`) | integration (grep) | grep `^# @appolabs/appo`, grep `^> `, grep `^## ` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run test/unit/<touched>.test.mjs`
- **Per wave merge:** `npm test` (full suite) + `npm pack --dry-run` file-list assertion
- **Phase gate:** full suite green + dry-run clean before `/gsd-verify-work`

### Inherently Manual (NOT executed by the executor — D-09)
- The real `npm publish` (live, irreversible) — user/CI only.
- Pushing a `vX.Y.Z` release tag — user/CI only.
- The one-time npm trusted-publisher registration on npmjs.com — user only.
- The first live `npm i -g @appolabs/appo` from the public registry — user, after the first real publish.
The executor's terminal verification is `npm pack --dry-run` (tarball inspection) and a LOCAL global
install of the produced `.tgz` into a temp prefix (proves the global-install path without touching npm).

### Wave 0 Gaps
- [ ] `test/unit/version.test.mjs` — covers SC3 (`--version` output + path)
- [ ] `test/unit/upgrade.test.mjs` — covers SC3 (`upgrade` spawn argv + exit code) [needs injectable spawn]
- [ ] `test/unit/update-check.test.mjs` — covers SC3 (cache/URL/notice/skip-json/swallow) [needs injectable fetch + tmp config]
- [ ] `test/unit/init.test.mjs` — covers SC2 (`init` bootstrap + idempotency) [reuses mockFetch + APPO_CONFIG_HOME]
- [ ] `test/integration/packaging.test.mjs` — covers SC1/SC4 (`npm pack --dry-run` file list, manifest fields, release.yml grep, README/llms.txt command-coverage grep)
- [ ] `src/upgrade.mjs` — extract `runUpgrade()` + `checkForUpdate()` with injectable `spawn`/`fetch` so they're unit-testable (otherwise `run()` is hard to test)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node ≥18 | runtime (fetch, createRequire) | ✓ | present this session | — |
| npm | `appo upgrade`, `npm pack`, CI | ✓ | present this session (`npm pack --dry-run` ran) | — |
| `registry.npmjs.org` reachability | update-check, real publish | ✓ (verified via @appolabs/sdk manifest fetch) | — | update-check swallows failure (D-05) |
| GitHub Actions OIDC | release.yml trusted publishing | n/a (CI-only) | — | not exercised by executor (D-09) |
| `@appolabs/appo` published on npm | `appo upgrade` resolving `@latest` | ✗ not yet published | — | upgrade is a no-op / errors until first publish (acceptable pre-v0.1) |

**Missing dependencies with no fallback:** None blocking the executor (the publish itself is out of scope).
**Missing with fallback:** `@appolabs/appo` is unpublished — `appo upgrade` can't resolve `@latest` until
the user's first publish; that's expected and not a blocker for building/verifying the machinery.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Publish with a long-lived `NPM_TOKEN` GH secret | OIDC trusted publishing (`id-token: write`, no secret) + `--provenance` | npm trusted publishers GA (2024-2025) | No token secret to rotate/leak; provenance attestation. Requires npm ≥ 11.5.1, Node ≥ 22.14, one-time npmjs.com registration [CITED: docs.npmjs.com/trusted-publishers] |
| `import pkg from './package.json' assert {…}` | `createRequire(import.meta.url)('…')` | import-assertions churned to import-attributes (`with`) across Node versions | createRequire is stable across 18/20/22 [ASSUMED] |

**Deprecated/outdated:**
- `NPM_TOKEN`-based publish — superseded by OIDC for this project (D-08 mandates trusted publishing).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `createRequire` is more robust than import-assertions across Node 18/20/22 | Alternatives / Anti-Patterns | Low — both `createRequire` and `readFileSync(new URL())` are verified-correct fallbacks |
| A2 | `npm pack` runs `prepack`/`prepare` but NOT `prepublishOnly`, so the D-02 gate won't slow the executor's dry-run | Pitfall 6 | Low — if wrong, move the verification to a script that skips lifecycle scripts (`npm pack --dry-run` still lists files) |
| A3 | Numeric `x.y.z` split is sufficient for version compare (no pre-release tags in our versioning) | Pattern 3 / Don't Hand-Roll | Low — releases are auto patch-bumped `x.y.z`; if pre-release tags are ever introduced, revisit |
| A4 | npm trusted publishing requires the package to already exist before registration (first publish may need a manual/token publish) | Open Questions / Pitfall 3 | Medium — affects the user's documented first-release runbook; does NOT affect the executor (out of scope) |

## Open Questions (RESOLVED)

1. **First publish under trusted publishing**
   - What we know: npm docs say "Your package must already exist on npm" to configure a trusted publisher;
     the settings flow is on an existing package's page [CITED: docs.npmjs.com/trusted-publishers].
   - What's unclear: whether OIDC trusted publishing can create a brand-new package (first-ever publish),
     or whether the very first `@appolabs/appo` publish must be done manually with a token, THEN trusted
     publishing registered for subsequent releases. The docs in this session did not state the first-publish
     case explicitly.
   - RESOLVED: Document BOTH paths in the release runbook and let the user choose; the executor does
     neither (D-09). Default guidance: do one manual `npm publish --access public` (or `npm publish` via a
     local OIDC-capable npm) for v0.1.0, then rely on `release.yml` for subsequent patch releases. Confirm
     with the user before the first release. (Threaded into Plan 06-03's RELEASING runbook.)

2. **`update_check` cache key vs `readConfig` legacy-fold**
   - What we know: `readConfig` returns `{ current, profiles }` and folds legacy flat keys; it currently
     drops unknown top-level keys on the next `writeConfig`.
   - What's unclear: whether to extend `readConfig`/`writeConfig` to preserve a top-level `update_check`
     key, or add dedicated `readUpdateCache`/`writeUpdateCache` helpers that round-trip the whole file.
   - RESOLVED: dedicated helpers that read the raw file, mutate only `update_check`, and write back —
     avoids touching the profile-fold logic and keeps the cache orthogonal to auth state. ADDITIONALLY,
     to honor the "a profile write never drops the cache" invariant, `readConfig`/`writeProfile` must
     preserve a top-level `update_check` key (carry it through the normalize→write round-trip) rather
     than dropping it — see Plan 06-01 (the cache must survive an `init`/`login`/`set-name` profile write).

## Project Constraints (from CLAUDE.md)

- **RUNTIME dependency-free** (non-negotiable): zero `dependencies`; dev tooling stays devDeps. Every new
  capability uses Node built-ins or existing helpers. NO new runtime package.
- **Delete old code completely:** rewrite `README.md` in full (D-07) — do not append to the MVP README.
  No versioned names, no migration code, no "removed code" comments.
- **Always run lint + tests before committing** (git rule): `prepublishOnly` mirrors this at publish time;
  the executor runs `npm run lint && npm run typecheck && npm test` before any commit.
- **Never add co-author / "Generated with Claude" lines** to commits.
- **Repository docs read as neutral / potentially public:** README + llms.txt are public-facing; keep the
  voice neutral architectural documentation (no internal strategy phrasing).
- **Ask before starting a server:** N/A for this phase (no server needed).

## Sources

### Primary (HIGH confidence)
- `../sdk/package.json` — publishConfig.access:public, repository/homepage/bugs/keywords, prepublish gate shape [VERIFIED: read this session]
- `../sdk/.github/workflows/release.yml` — release workflow to mirror [VERIFIED: read this session]
- `../sdk/llms.txt` — llms.txt format [VERIFIED: read this session]
- `src/cli.mjs`, `src/config.mjs`, `src/login.mjs`, `bin/appo.mjs`, `package.json`, `README.md` — current code [VERIFIED: read this session]
- `npm pack --dry-run` — tarball contents (8 files, clean) [VERIFIED: ran this session]
- `npm view @appolabs/sdk version` → 2.0.0; `@appolabs/appo` unpublished [VERIFIED: ran this session]
- `https://registry.npmjs.org/@appolabs%2Fsdk/latest` — scoped %2F URL returns valid manifest [VERIFIED: fetched this session]

### Secondary (MEDIUM confidence)
- docs.npmjs.com/trusted-publishers — OIDC one-time setup fields, npm/Node version requirements, package-must-exist prerequisite [CITED — fetched this session]
- nodejs.org/api/module.html, nodejs.org/api/child_process.html — createRequire / spawn [CITED — standard Node docs]

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all Node built-ins + existing helpers verified in-repo this session
- Metadata / packaging: HIGH — SDK package.json + live `npm pack --dry-run` verified
- release.yml: HIGH — SDK workflow read verbatim; divergences (npm/no-build) are mechanical
- Trusted publishing: MEDIUM — official docs cited; first-publish case is an Open Question (A4)
- `--version` path: HIGH — tarball layout verified preserves `src/`+`package.json`
- Update-check / upgrade: HIGH (mechanism) — built-in fetch/spawn verified; registry URL encoding verified

**Research date:** 2026-06-15
**Valid until:** 2026-07-15 (npm trusted-publishing requirements are evolving — re-verify npm/Node version
floors and the first-publish flow before the live release)
