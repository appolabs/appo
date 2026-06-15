# Phase 5: Test suite & CI - Research

**Researched:** 2026-06-15
**Domain:** Test-runner migration (node:test → vitest), JS lint/typecheck tooling, GitHub Actions CI
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Adopt **vitest** as the test runner (`"test": "vitest run"`). Migrate all 9 existing `node:test` files to vitest, preserving every assertion — zero coverage regression (baseline 122 cases must all carry over).
- **D-02:** Migration is mechanical: `node:test` imports → vitest (`describe`/`it`/`test`/`expect`, `beforeEach`/`afterEach` from `vitest`); `node:assert/strict` → vitest `expect`. The `globalThis.fetch` stub and `APPO_CONFIG_HOME` isolation in `test/helpers/mockFetch.mjs` carry over unchanged.
- **D-03:** Drop `--test-concurrency=1`. Vitest isolates each test FILE in its own worker (separate `globalThis`/module graph) — cross-file collision is gone by default; keep per-test `beforeEach` config isolation. (CONFIRMED below.)
- **D-04:** Organize into `test/unit/` and `test/integration/`. unit (SC1): `parseArgs`, `config.mjs`, `login.mjs` poll loop, `ship`/`pollBuild` orchestration (HTTP mocked). integration (SC2): drive `run()` end-to-end across the command surface against mock fetch.
- **D-05:** Scripts mirror the SDK: `"test": "vitest run"`, `"test:integration": "vitest run test/integration/"`, `"test:watch": "vitest"`.
- **D-06:** eslint, matching the SDK's `.eslintrc.json` style. Lint targets `bin/`, `src/`, `test/` (`.mjs`/`.js`). Pin eslint to the SDK's major for config-format parity.
- **D-07:** Reuse the SDK's ruleset where applicable (JS-recommended + prettier-compat via `eslint-config-prettier`); no Prettier auto-format step required.
- **D-08:** Keep the CLI as JS. Add `tsconfig.json` with `{ allowJs: true, checkJs: true, noEmit: true, strict-ish, module/target for Node ≥18 ESM }`, run `tsc --noEmit`. Add JSDoc only where needed to pass.
- **D-09:** `.github/workflows/ci.yml` mirroring the SDK (triggers push/PR on main+master; checkout → setup-node (cache npm) → `npm ci` → lint → typecheck → test).
- **D-10:** Divergences from SDK: **npm** (not pnpm), **no build step**, Node matrix **[18, 20, 22]**. CI must be green.
- **D-11:** vitest, eslint (+ config), typescript added as **devDependencies only**. `files: [bin, src, README]` and zero `dependencies` unchanged. Commit a `package-lock.json` for `npm ci`.

### Claude's Discretion
- Exact eslint rule selections and any `.eslintignore`/flat-config form (match SDK where sensible).
- Whether unit/integration live in `test/unit`+`test/integration` vs a `tests/` rename (keep `test/`).
- JSDoc depth needed to satisfy `tsc --checkJs`.
- Whether to also add a coverage report (`vitest run --coverage`) — optional, not required by SC.

### Deferred Ideas (OUT OF SCOPE)
- Coverage reporting / thresholds (`vitest --coverage`).
- Prettier auto-format CI step.
- Release automation (`release.yml`, npm publish on tag) — Phase 6.
- `appo preview` tests — Phase 4.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLI-04 | Test suite & CI — vitest unit + integration (incl. `ship` orchestration), GitHub Actions, lint/typecheck | Migration mapping (assert→expect), vitest.config + isolation confirmation, eslintrc + tsconfig configs, ci.yml shape, all below |
</phase_requirements>

## Summary

This phase is a **mechanical port plus tooling addition**, not a feature build. The existing suite is 122 cases across 9 files using `node:test` + `node:assert/strict`. The harness (`test/helpers/mockFetch.mjs` — a `globalThis.fetch` stub + `APPO_CONFIG_HOME`-isolated config) is runner-agnostic plain JS and ports unchanged. The in-file helpers (`captureLog`/`captureError`/`captureAll`/`silentRun`) are plain functions and port unchanged. The only changes per test file are the two import lines and a 1:1 assertion substitution (six assert methods in use: `equal`, `match`, `deepEqual`, `doesNotMatch`, `ok`, `rejects`).

The `--test-concurrency=1` flag exists because `node:test` shares one process across files and the tests mutate shared globals (`globalThis.fetch`, `process.env.APPO_CONFIG_HOME`). **Vitest's default `isolate: true` runs each test FILE in its own worker with a separate module graph and global scope** (CONFIRMED via Context7), so the serial flag is no longer needed and is dropped without adding any vitest config to compensate.

The tooling (vitest, eslint, typescript) is pinned to the **SDK's majors** (not latest) for convention parity — the SDK uses eslint 8.57 which fully supports the `.eslintrc.json` format the SDK ships, so we mirror eslintrc directly rather than migrating to flat config. The realistic risk is `tsc --checkJs`: the `src/*.mjs` files currently have **zero JSDoc type tags**, so `strict: true` would surface many implicit-`any` errors. Recommendation: `checkJs: true` with `strict: false` (or `strict: false` + a few targeted options) to make SC4 achievable without a large annotation pass.

**Primary recommendation:** Port file-by-file with a fixed assert→expect substitution table; keep `test/helpers/mockFetch.mjs` byte-for-byte; add a minimal `vitest.config.mjs` (only `include` globs + `environment: 'node'` + `globals: true`); mirror the SDK's `.eslintrc.json` (eslint 8) adapted for `.mjs`; ship a lenient `tsconfig.json` (`checkJs` + `strict: false`); commit `package-lock.json`; CI is the SDK shape minus build, plus a `[18,20,22]` matrix on npm.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Unit assertions (parseArgs, config, login, pollBuild) | Test harness (vitest worker) | — | Pure functions; no I/O beyond mocked fetch and isolated config FS |
| HTTP mocking | `test/helpers/mockFetch.mjs` (globalThis stub) | vitest per-file isolation | Manual `globalThis.fetch` stub already owns this; vitest only guarantees file isolation |
| Config FS isolation | `APPO_CONFIG_HOME` env + lazy `configPath()` | per-test `beforeEach` mkdtemp | Isolation is in app code (lazy path), not the runner; vitest just doesn't break it |
| Lint | eslint (devDep, CI + local) | — | Static analysis over `bin`/`src`/`test` |
| Typecheck | `tsc --noEmit --checkJs` (devDep) | JSDoc in `src` | Type inference over `.mjs`; no emit, no runtime impact |
| CI orchestration | GitHub Actions (`ci.yml`) | npm `ci` + scripts | Runs lint→typecheck→test on the node matrix |

## Standard Stack

### Core (pin to SDK majors for parity — verified against registry 2026-06-15)

| Library | Version (recommend) | SDK pin | Latest on registry | Purpose | Why this version |
|---------|---------------------|---------|--------------------|---------|------------------|
| vitest | `^1.0.0` | `^1.0.0` | 4.1.8 | Test runner | [VERIFIED: npm view] Match SDK exactly; vitest 1.x is stable, supports the config/isolation we need. (Latest is 4.x — divergence would break "one toolchain" parity.) |
| eslint | `^8.57.0` | `^8.57.0` | 10.5.0 | Linter | [VERIFIED: npm view + WebSearch] eslint 8.57 fully supports `.eslintrc.json`; matches SDK config format. eslint 9/10 default to flat config. |
| typescript | `^5.4.0` | `^5.4.0` | 6.0.3 | `tsc --checkJs` typecheck | [VERIFIED: npm view] Match SDK; 5.4 supports `allowJs`/`checkJs`/NodeNext fine. |
| eslint-config-prettier | `^9.1.0` | `^9.1.0` | 10.1.8 | Disable formatting rules that conflict with prettier | [VERIFIED: npm view] Match SDK; v9 pairs with eslint 8. (v10 pairs with eslint 9 flat config.) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @typescript-eslint/parser | — (likely **NOT needed**) | TS parser for eslint | The SDK lints `.ts` so it needs this; **we lint `.mjs` (plain JS)** so the default espree parser suffices. Omit unless a rule requires it. `[ASSUMED — see A1]` |
| @typescript-eslint/eslint-plugin | — (likely **NOT needed**) | TS-specific rules | Same as above — TS rules don't apply to `.mjs`. Omit. `[ASSUMED — see A1]` |

**Note on @typescript-eslint:** The SDK's `.eslintrc.json` uses `@typescript-eslint/parser` + plugin because it lints TypeScript. Our targets are `.mjs` JavaScript. The minimal correct config drops the TS parser/plugin and uses `eslint:recommended` + `prettier`. Including them is harmless but adds two unused devDeps. Recommend dropping them; if the planner prefers maximal SDK parity, including them with no `@typescript-eslint/*` rules active is acceptable (they won't fire on `.mjs` without TS-aware parsing). `[ASSUMED — see A1]`

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| vitest ^1 | vitest ^4 (latest) | Newer features/perf, but breaks SDK parity (the explicit north star). Reject. |
| eslint 8 + eslintrc | eslint 9 + flat `eslint.config.js` | Future-proof, but diverges from SDK's eslintrc format. Reject for parity. |
| `tsc --checkJs` | `tsd` / no typecheck | SC4 mandates a typecheck command shaped like the SDK's `tsc --noEmit`. Keep tsc. |

**Installation:**
```bash
npm install --save-dev vitest@^1.0.0 eslint@^8.57.0 typescript@^5.4.0 eslint-config-prettier@^9.1.0
# This creates package-lock.json (first deps) — COMMIT it (D-11, needed for npm ci).
```

**Version verification (2026-06-15):** `npm view vitest version` → 4.1.8; `eslint` → 10.5.0; `typescript` → 6.0.3; `eslint-config-prettier` → 10.1.8. We deliberately pin BELOW latest to match the SDK's installed majors (vitest 1, eslint 8.57, typescript 5.4, eslint-config-prettier 9.1). [VERIFIED: npm registry]

## Architecture Patterns

### Recommended Project Structure
```
test/
├── helpers/
│   └── mockFetch.mjs          # UNCHANGED — runner-agnostic fetch stub + config isolation
├── unit/                       # SC1: pure-unit coverage of exported functions
│   ├── foundation.test.mjs     # parseArgs/confirmGate/renderError (mostly unit)
│   ├── config-profiles.test.mjs# config.mjs store (pure file I/O)
│   ├── auth.test.mjs           # apiFetch/loginWithToken units
│   └── ship.test.mjs (unit part) # pollBuild unit cases (injected sleep)
└── integration/                # SC2: drive run() end-to-end vs mock fetch
    ├── auth-cli.test.mjs
    ├── read-verbs.test.mjs
    ├── write-verbs.test.mjs
    ├── destructive-verbs.test.mjs
    ├── help.test.mjs
    └── ship.test.mjs (integration part)

vitest.config.mjs               # NEW — include globs, environment: node, globals
.eslintrc.json                  # NEW — mirror SDK, adapted for .mjs
tsconfig.json                   # NEW — allowJs/checkJs/noEmit, lenient strict
.github/workflows/ci.yml        # NEW — SDK shape, npm, no build, node [18,20,22]
package-lock.json               # NEW — committed
```

**Split caveat:** `foundation.test.mjs` and `ship.test.mjs` each contain BOTH unit and integration cases (e.g. ship has `pollBuild` units with injected `sleep` AND end-to-end `run()` flows). The planner must decide: either (a) split these two files across `unit/`/`integration/`, or (b) keep them whole and place by dominant flavor. Recommendation: split ship (the `pollBuild` units are clearly unit, the `run()` flows clearly integration); keep foundation in `unit/` (it's mostly `confirmGate`/`renderError`/`parseArgs` units with two `run()` smoke cases). Either choice preserves all 122 cases — the constraint is case-count parity, not file count.

### Pattern 1: node:test → vitest port (the bulk of the work)

**What:** Two import-line changes + 1:1 assertion substitution per file. No logic changes.

**Import substitution:**
```javascript
// BEFORE (node:test)
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// AFTER (vitest — with globals:true in config, the test/expect/hooks are global,
// but explicit import is clearer and lint-safe; recommend explicit import)
import { test, beforeEach, afterEach, expect } from 'vitest';
// (no assert import — replaced by expect)
```

**Assertion substitution table (these six are ALL that appear — verified by grep):**

| node:assert/strict | count | vitest expect |
|--------------------|-------|---------------|
| `assert.equal(a, b)` | 169 | `expect(a).toBe(b)` |
| `assert.match(s, re)` | 65 | `expect(s).toMatch(re)` |
| `assert.deepEqual(a, b)` | 27 | `expect(a).toEqual(b)` |
| `assert.doesNotMatch(s, re)` | 17 | `expect(s).not.toMatch(re)` |
| `assert.ok(x)` | 3 | `expect(x).toBeTruthy()` |
| `assert.rejects(fn, check)` | 2 | `await expect(fn()).rejects.toThrow()` + manual prop checks (see below) |

**`assert.rejects` is the one non-trivial case.** Two usages, both inspect error properties:
```javascript
// BEFORE
await assert.rejects(
  () => apiFetch('http://test.local', 'GET', '/api/v1/apps', null, 'production'),
  (err) => { assert.equal(err.status, 401); /* ... */ return true; },
);

// AFTER — capture the error and assert on it
await expect(
  apiFetch('http://test.local', 'GET', '/api/v1/apps', null, 'production'),
).rejects.toMatchObject({ status: 401 /* , ... */ });
// OR the explicit form (closest to original, no behavior drift):
let caught;
try { await apiFetch(...); } catch (e) { caught = e; }
expect(caught).toBeDefined();
expect(caught.status).toBe(401);
```
For `auth.test.mjs:126` (`assert.rejects(() => loginWithToken(...))` with no checker), use `await expect(loginWithToken(...)).rejects.toThrow();`.

**Source:** Vitest expect API, `/vitest-dev/vitest` [CITED].

### Pattern 2: vitest.config.mjs (minimal)

**What:** The smallest config that (a) finds unit + integration files, (b) sets the node environment, (c) optionally enables global `test`/`expect` so `test:integration test/integration/` glob works.

```javascript
// vitest.config.mjs
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',        // CLI is Node-only; no jsdom
    include: ['test/**/*.test.mjs'],
    globals: true,              // allow bare test/expect; explicit imports still work
    // isolate: true is the DEFAULT — do NOT set it; per-file isolation is what
    // replaces --test-concurrency=1. (Documented here as a comment, not a setting.)
  },
});
```
**Note:** `globals: true` is optional. If the ported files keep explicit `import { test, expect } from 'vitest'` (recommended for lint cleanliness), `globals` can be omitted. Keep it `true` only if the planner wants zero per-file import churn. Source: `/vitest-dev/vitest` [CITED].

### Pattern 3: SDK-mirrored `.eslintrc.json` adapted for `.mjs`

**What:** The SDK's eslintrc minus TS-specific parser/plugin (we lint JS), keeping `eslint:recommended` + `prettier` (eslint-config-prettier) + the `no-unused-vars` `^_` ignore.

```json
{
  "root": true,
  "extends": ["eslint:recommended", "prettier"],
  "parserOptions": { "ecmaVersion": 2022, "sourceType": "module" },
  "env": { "node": true, "es2022": true },
  "rules": {
    "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  },
  "ignorePatterns": ["node_modules/"]
}
```
**Lint script glob:** `"lint": "eslint bin/ src/ test/"` (eslint resolves `.mjs`/`.js` under those dirs). The SDK uses a quoted glob `'src/**/*.ts'`; for us `eslint bin/ src/ test/` is simpler and matches D-06's target list. Source: `../sdk/.eslintrc.json` [VERIFIED: file read].

### Pattern 4: lenient `tsconfig.json` for `checkJs` on `.mjs`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "allowJs": true,
    "checkJs": true,
    "noEmit": true,
    "strict": false,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  },
  "include": ["bin/**/*.mjs", "src/**/*.mjs", "test/**/*.mjs"]
}
```
**Why `strict: false`:** `src/*.mjs` has zero JSDoc tags today (verified). `strict: true` (the SDK's setting) turns on `noImplicitAny`/`strictNullChecks`, which would flag nearly every function parameter and config-shape access as an error, forcing a large annotation pass. `strict: false` keeps real type errors (wrong method on a known type, bad argument counts) while not demanding full annotation. This is the deliberate divergence from the SDK's `strict: true` (the SDK is authored TS; we're inferring over JS). `[VERIFIED: grep — 0 @param/@returns/@type tags in src/]`

**`module: NodeNext`** (vs SDK's `ESNext`/`bundler`): we run raw `.mjs` under Node ESM with no bundler, so NodeNext is the honest module/resolution mode. `target: ES2022` matches Node ≥18.

**`types: ["node"]`** requires `@types/node` — **add it as a devDep** so `globalThis.fetch`, `process`, `node:fs`, `node:http` are typed (otherwise checkJs errors on every Node builtin import). `npm view @types/node version` for current; pin a major matching Node 18+ (`^20` or `^22` is fine). `[VERIFIED: tsc needs @types/node for node builtins]`

### Anti-Patterns to Avoid
- **Setting `isolate: false` or `pool` overrides.** The default (`isolate: true`, `pool: forks`) is exactly what replaces `--test-concurrency=1`. Overriding `isolate: false` would RE-introduce the cross-file `globalThis.fetch`/`process.env` collision the old flag guarded against.
- **Migrating to eslint 9 flat config.** Diverges from SDK eslintrc parity for no benefit at this pin.
- **`strict: true` in tsconfig.** Triggers a massive JSDoc churn to satisfy SC4; not required.
- **Keeping both suites.** Per CLAUDE.md ("delete old code"), remove `--test-concurrency=1` and the `node:test` imports — no dual `node --test` + vitest. The migrated files replace the originals in place.
- **Mocking via vitest auto-mock (`vi.mock`).** Our HTTP boundary is a manual `globalThis.fetch` stub. Keep it. Do not introduce `vi.fn()`/`vi.mock` for fetch — it would duplicate working infrastructure and change request-capture semantics.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-file test isolation | A serial flag / manual global save-restore across files | vitest default `isolate: true` + forks pool | Built-in, free, per-file `globalThis`/module graph |
| Fetch mocking | A new `vi.mock` layer | Existing `test/helpers/mockFetch.mjs` | Already captures method/path/body/headers; works under vitest unchanged |
| JS type checking | Custom JSDoc validator | `tsc --checkJs --noEmit` | Standard, matches SDK command shape |
| Prettier/lint rule conflicts | Manual rule disabling | `eslint-config-prettier` | One extends entry turns off all formatting rules |

**Key insight:** Nearly everything this phase needs already exists in the codebase (the harness) or in the tools (isolation, mocking). The work is substitution and configuration, not construction.

## Runtime State Inventory

This is a tooling/refactor phase (test runner swap + config files), not a rename. The only "state" that changes outside source files:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — verified by inspection; tests use isolated `mkdtemp` dirs and never touch real `~/.appo`. | None |
| Live service config | None — no external services configured by this phase. | None |
| OS-registered state | None — no daemons/tasks/schedulers. | None |
| Secrets/env vars | CI uses no secrets (no publish in this phase — that's Phase 6). `APPO_CONFIG_HOME`/`APPO_TOKEN` are test-only env, set/cleared per test. | None |
| Build artifacts / installed packages | **`node_modules/` and `package-lock.json` are newly introduced** (first deps). `package-lock.json` MUST be committed; `node_modules/` MUST be gitignored. No prior lockfile exists to migrate. | Add `.gitignore` entry for `node_modules/`; commit `package-lock.json` |

**Canonical question — after every file is updated, what runtime systems still cache old state?** Nothing. There is no persisted `node:test` artifact; removing `--test-concurrency=1` from `package.json` and swapping imports fully transitions the suite. CI has no prior run history to invalidate (the workflow is new).

## Common Pitfalls

### Pitfall 1: `tsc --checkJs` surfaces a wall of errors on first run
**What goes wrong:** With `strict: true` (SDK's value), checkJs flags every untyped parameter and `config.profiles[env]`-style access as implicit `any` / possibly-undefined — potentially dozens of errors, making SC4 (typecheck passes) look like a huge JSDoc task.
**Why it happens:** `src/*.mjs` has zero JSDoc type tags; TS infers `any` everywhere strict mode forbids it.
**How to avoid:** Use `strict: false`. Then run `npx tsc --noEmit` once during planning's research-validation to get the REAL residual error count and add JSDoc only for those. Without `@types/node`, expect errors on every `node:` import — add `@types/node` first.
**Warning signs:** Hundreds of `TS7006`/`TS2532` errors → strict is on or `@types/node` missing.

### Pitfall 2: `npm ci` fails in CI without a committed lockfile
**What goes wrong:** CI step `npm ci` errors "can only install with an existing package-lock.json".
**Why it happens:** This phase introduces the first dependencies; if the lockfile isn't committed, CI has nothing to install from deterministically.
**How to avoid:** Run the install locally, commit `package-lock.json` (D-11). Add a `.gitignore` for `node_modules/`.
**Warning signs:** Green locally, red in CI on the install step.

### Pitfall 3: Split files lose cases (coverage regression)
**What goes wrong:** Splitting `foundation`/`ship` into unit+integration drops or duplicates a `test()`.
**Why it happens:** Manual cut/paste during the split.
**How to avoid:** Assert case-count parity (see Validation Architecture): total `test(`/`it(` count across all migrated files must equal 122. Run `vitest run` and confirm the reported passing count is ≥122.
**Warning signs:** `vitest run` reports <122 passing.

### Pitfall 4: `assert.rejects` checker semantics lost
**What goes wrong:** The original `assert.rejects(fn, checker)` ran assertions INSIDE the checker; a naive `.rejects.toThrow()` drops the `err.status === 401` / envelope checks.
**Why it happens:** `toThrow()` only verifies a throw, not the error shape.
**How to avoid:** Use `.rejects.toMatchObject({ status: 401, ... })` or the explicit try/catch + `expect(caught.status).toBe(401)` form. Two call sites only (`auth.test.mjs`).
**Warning signs:** Auth tests pass but no longer assert the error envelope (false green).

### Pitfall 5: eslint flags Node globals / unused `_` args
**What goes wrong:** `process`, `console`, `globalThis` reported as undef; `(_init)` params reported unused.
**Why it happens:** Missing `env.node`/`es2022` or the `argsIgnorePattern`.
**How to avoid:** The `.eslintrc.json` above sets `env: { node: true, es2022: true }` and `no-unused-vars` `^_` ignore (mirrors SDK).
**Warning signs:** `no-undef` on `process`/`console`.

## Code Examples

### Per-file isolation replacing `--test-concurrency=1` (no config needed)
```javascript
// vitest default: isolate=true, pool='forks'. Each FILE gets its own worker,
// its own globalThis, its own process.env snapshot. The shared-global mutation
// (globalThis.fetch stub, process.env.APPO_CONFIG_HOME) that forced serial node:test
// is now scoped to the file. Keep the per-test beforeEach/afterEach exactly as-is.
// Source: /vitest-dev/vitest — "every test file in Vitest runs in its own
// isolated module graph"; default pool 'forks' (node:child_process).
```

### Ported config-profiles beforeEach/afterEach (UNCHANGED logic)
```javascript
// Source: existing test/config-profiles.test.mjs — only the import lines change.
import { test, beforeEach, afterEach, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpDir = null;
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'appo-cfg-'));
  process.env.APPO_CONFIG_HOME = tmpDir;     // honored by lazy configPath() — unchanged
});
afterEach(() => {
  delete process.env.APPO_CONFIG_HOME;
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

test('beforeEach-set APPO_CONFIG_HOME is honored (lazy path)', () => {
  expect(configPath().file.startsWith(process.env.APPO_CONFIG_HOME)).toBeTruthy(); // was assert.ok
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `node --test --test-concurrency=1` | `vitest run` (per-file isolation) | This phase | Drops serial flag; parallel file execution |
| `node:assert/strict` | vitest `expect` | This phase | Richer matchers; SDK parity |
| eslintrc (eslint 8) | flat config (eslint 9 default, Apr 2024) | n/a here | We stay on eslint 8 + eslintrc for SDK parity |

**Deprecated/outdated:**
- eslintrc format: deprecated in eslint 9, slated for removal in eslint 10. Not a concern at our `^8.57` pin (matches SDK); revisit only if the SDK migrates.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@typescript-eslint/parser` + plugin are NOT needed because we lint `.mjs` (plain JS), so the default espree parser suffices. | Standard Stack / Supporting | If a planned rule needs type-aware parsing, lint would error; low risk — `eslint:recommended` rules are all syntactic. Easily fixed by adding the two devDeps. |
| A2 | `@types/node` is required for `checkJs` to not error on `node:` builtins and `globalThis.fetch`. | Pattern 4 | If omitted, `tsc` errors on every builtin import — but this is verifiable in one `tsc` run during planning; mitigation is trivial (add the devDep). |

**Verify A2 cheaply:** during planning, run `npm i -D @types/node typescript && npx tsc --noEmit` against the lenient tsconfig to get the real residual error list before writing JSDoc tasks.

## Open Questions

1. **Exact residual `tsc --checkJs` error count after `strict:false` + `@types/node`.**
   - What we know: zero JSDoc today; `strict:false` suppresses implicit-any; `@types/node` types the builtins.
   - What's unclear: how many real type errors remain (e.g. `config.profiles[env]` possibly-undefined accesses, `init.headers` typing in mockFetch).
   - Recommendation: planner adds a Wave-0 task "run `tsc --noEmit`, capture error list, add JSDoc only for those" — don't pre-write blanket JSDoc tasks. Realistic estimate: **0–15 errors**, fixable with a handful of `/** @type {...} */` or `@param` tags (under an hour), given the small, well-structured `src/` (config 131 lines, login 111, ops 46, api 60, cli 682).

2. **Split granularity of `foundation.test.mjs` / `ship.test.mjs`.**
   - What we know: both mix unit + integration cases.
   - Recommendation: split `ship` (clear pollBuild-unit vs run()-integration boundary at line ~191); keep `foundation` in `unit/`. Either way, assert 122-case parity.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | runtime + tests | ✓ | v22.12.0 (local) | CI matrix tests 18/20/22 |
| npm | install + scripts | ✓ | 11.0.0 | — |
| vitest | test runner | ✗ (to install) | — | none — it's the deliverable |
| eslint | lint | ✗ (to install) | — | none |
| typescript | typecheck | ✗ (to install) | — | none |
| GitHub Actions | CI | ✓ (provider) | — | — |

**Missing dependencies with no fallback:** vitest, eslint, typescript — these ARE the phase deliverables (installed as devDeps). Not a blocker; expected.

## Validation Architecture

> nyquist_validation not explicitly disabled → section included.

For THIS phase, the validation IS the deliverable: the suite runs green, lint passes, typecheck passes — locally and in CI.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest `^1.0.0` (to install) |
| Config file | `vitest.config.mjs` (to create — see Pattern 2) |
| Quick run command | `npm test` → `vitest run` |
| Full suite command | `npm test && npm run lint && npm run typecheck` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLI-04 SC1 | vitest units cover parseArgs, config store, login state machine, ship/pollBuild (HTTP mocked) | unit | `vitest run test/unit/` | ✅ (ported from existing) |
| CLI-04 SC2 | integration drives command surface vs mock API | integration | `vitest run test/integration/` | ✅ (ported from existing) |
| CLI-04 SC3 | GitHub Actions runs lint+typecheck+test on push/PR, green | CI | (push to branch; observe Actions) | ❌ Wave 0 — `.github/workflows/ci.yml` |
| CLI-04 SC4 | lint + typecheck pass | static | `npm run lint && npm run typecheck` | ❌ Wave 0 — `.eslintrc.json`, `tsconfig.json` |

### Coverage-regression guard (case-count parity)
The migration's invariant is **zero coverage loss**: 122 cases today must all survive.
- **Baseline:** 122 (`auth-cli` 19, `auth` 6, `config-profiles` 13, `destructive-verbs` 25, `foundation` 9, `help` 4, `read-verbs` 14, `ship` 18, `write-verbs` 14).
- **Planner verification:** after migration, `grep -rcE "^\s*(test|it)\(" test/**/*.test.mjs | <sum>` must equal 122, AND `vitest run` must report **≥122 passing, 0 failing**. A drop signals a lost case (Pitfall 3). The planner should include this count assertion as an explicit verification step, not rely on "tests pass."

### Sampling Rate
- **Per task commit:** `vitest run <changed-file>` (single-file fast feedback during the port).
- **Per wave merge:** `npm test` (full vitest run, expect ≥122 green).
- **Phase gate:** `npm test && npm run lint && npm run typecheck` all exit 0 locally; CI green on all three node versions before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `vitest.config.mjs` — include globs + node env (Pattern 2)
- [ ] `.eslintrc.json` — SDK-mirrored, `.mjs`-adapted (Pattern 3)
- [ ] `tsconfig.json` — `allowJs`/`checkJs`/`noEmit`, `strict:false` (Pattern 4)
- [ ] `.github/workflows/ci.yml` — SDK shape, npm, no build, node [18,20,22] (below)
- [ ] devDeps install + commit `package-lock.json` + `.gitignore node_modules/`
- [ ] Framework install: `npm i -D vitest@^1 eslint@^8.57 typescript@^5.4 eslint-config-prettier@^9 @types/node`

## Security Domain

> security_enforcement not disabled → section included. This phase adds NO runtime code paths, NO new inputs, NO auth surface — it's test/CI tooling. ASVS exposure is minimal.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth code changes; existing PAT-leak test sweeps are PRESERVED by the port (they're among the 122 cases). |
| V5 Input Validation | no | No new inputs; only test/config files. |
| V6 Cryptography | no | None added. |
| V14 Configuration | yes (supply-chain) | Pin devDeps to known majors; commit `package-lock.json` for reproducible `npm ci` (integrity-hashed). Do NOT add runtime deps (D-11). |

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious/typosquat devDep | Tampering | Pin to SDK-known packages (vitest/eslint/typescript/eslint-config-prettier); lockfile integrity hashes verified by `npm ci` |
| CI secret exposure | Info disclosure | No secrets needed this phase (no publish until Phase 6); workflow uses none |
| PAT leakage in test output | Info disclosure | Existing PAT-leak assertions (in the 122 cases) are preserved unchanged by the mechanical port — case-count parity guards them |

## GitHub Actions CI (D-09/D-10) — recommended `ci.yml`

```yaml
name: CI
on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```
**Divergences from SDK (by necessity, D-10):** npm + `npm ci` (SDK uses pnpm); **no `build` step** (CLI ships raw `.mjs`); **node matrix [18,20,22]** (SDK is single node-20) since `engines.node >=18` — test the floor. Mirrors SDK shape otherwise (triggers, checkout, setup-node cache, lint→typecheck→test order). Source: `../sdk/.github/workflows/ci.yml` [VERIFIED: file read].

## package.json scripts (D-05) — recommended

```json
"scripts": {
  "test": "vitest run",
  "test:integration": "vitest run test/integration/",
  "test:watch": "vitest",
  "lint": "eslint bin/ src/ test/",
  "typecheck": "tsc --noEmit"
}
```
Mirrors the SDK's script names exactly (`vitest run`, `test:integration`, `test:watch`, `lint`, `typecheck`). Source: `../sdk/package.json` [VERIFIED: file read].

## Sources

### Primary (HIGH confidence)
- `/vitest-dev/vitest` (Context7) — isolation defaults (`isolate: true` per-file, default pool `forks`/child_process), config (`include`, `environment`, `globals`), parallelism. Confirms D-03.
- `../sdk/package.json`, `../sdk/.eslintrc.json`, `../sdk/tsconfig.json`, `../sdk/.github/workflows/ci.yml` (read directly) — exact devDep pins, script names, lint config, CI shape.
- `test/*.test.mjs`, `test/helpers/mockFetch.mjs`, `src/*.mjs`, `package.json` (read directly) — case counts (122), assert-method inventory (6 methods), zero existing JSDoc, exported symbols, no node:test mock/describe/skip/only usage.
- npm registry (`npm view`) — current versions: vitest 4.1.8, eslint 10.5.0, typescript 6.0.3, eslint-config-prettier 10.1.8 (we pin below latest for SDK parity).

### Secondary (MEDIUM confidence)
- WebSearch — eslint 8.57 fully supports `.eslintrc.json`; eslint 9 (Apr 2024) defaults to flat config; eslintrc slated for removal in eslint 10. ([Migrate to ESLint 9.x](https://tduyng.com/blog/migrating-to-eslint9x/), [ESLint Config explained](https://jsonic.io/guides/eslint-config))

### Tertiary (LOW confidence)
- None requiring validation. A1/A2 assumptions are cheaply verifiable in one `tsc`/`eslint` run during planning.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against registry and pinned to SDK-read majors.
- Architecture / migration mechanics: HIGH — assert inventory and node:test feature scan done directly on the 9 files; vitest isolation confirmed via Context7.
- Pitfalls: HIGH for lockfile/case-parity/rejects; MEDIUM for exact `tsc --checkJs` residual error count (verifiable in planning, est. 0–15).

**Research date:** 2026-06-15
**Valid until:** ~30 days (stable tooling; pins are deliberate, not chasing latest)

Sources:
- [Migrate to ESLint 9.x](https://tduyng.com/blog/migrating-to-eslint9x/)
- [ESLint Config: .eslintrc.json and flat config explained](https://jsonic.io/guides/eslint-config)
