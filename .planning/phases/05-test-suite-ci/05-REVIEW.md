---
phase: 05-test-suite-ci
reviewed: 2026-06-15T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - .github/workflows/ci.yml
  - vitest.config.mjs
  - .eslintrc.json
  - tsconfig.json
  - test/helpers/setup.mjs
  - test/helpers/mockFetch.mjs
  - package.json
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-06-15
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 5 wires up the vitest/eslint/tsc toolchain plus a GitHub Actions CI workflow.
The headline non-negotiables hold: runtime `dependencies` is absent (effectively empty),
`files: [bin, src, README.md]` is unchanged, all of vitest/eslint/typescript/@types/node/
eslint-config-prettier are caret-pinned devDependencies (no `*`/`latest` floats), and
`package-lock.json` is committed so `npm ci` in CI is reproducible. The CI matrix
[18,20,22] with steps lint -> typecheck -> test and no build step matches the spec, and
triggers fire on push/PR to both main and master.

The worker-isolation design is sound in the happy path: `config.mjs` resolves `configPath()`
lazily per call, and `setup.mjs` seeds a unique `APPO_CONFIG_HOME` per worker before any
test runs. However there is one real isolation hole created by the interaction between
`setup.mjs` (runs once at worker start) and the per-test files that `delete
process.env.APPO_CONFIG_HOME` in `afterEach` — this leaves a window where config reads can
fall through to the real `~/.appo/config.json`. That is the most important finding below.
No critical (security/data-loss/secret) issues were found; the PAT is never logged and
`stubToken` never persists a real credential.

## Warnings

### WR-01: afterEach deletes APPO_CONFIG_HOME, defeating setup.mjs's per-worker guard

**File:** `test/helpers/setup.mjs:20-22` (in concert with `test/unit/auth.test.mjs:48`, `test/unit/config-profiles.test.mjs:38`, `test/integration/auth-cli.test.mjs:67`)
**Issue:** `setup.mjs` sets `APPO_CONFIG_HOME` exactly once per worker, guarded by
`if (!process.env.APPO_CONFIG_HOME)`. Several test files then `delete
process.env.APPO_CONFIG_HOME` in their `afterEach`. setupFiles do **not** re-run between
tests within a file, so after the first such `afterEach` the variable is gone for the rest
of that file's lifetime in the worker. Any config read that happens *outside* a `beforeEach`
(e.g. at top-of-file describe-time, in a test that does not set it, in a helper invoked
between tests, or in another test file scheduled onto the same worker after isolation is
relaxed) will fall back to the real `~/.appo/config.json` — exactly the race setup.mjs was
built to prevent. The current suite happens to be safe only because every affected test
re-sets the var in its own `beforeEach`; the safety net is not actually load-bearing where
it matters.
**Fix:** Do not delete `APPO_CONFIG_HOME` in test teardown — restore it to the worker
default instead, or stop touching it entirely (let `beforeEach` overwrite it). Simplest
robust fix: in the affected `afterEach` blocks, replace
`delete process.env.APPO_CONFIG_HOME;` with re-seeding to a worker-scoped fallback, or have
`setup.mjs` install a `beforeEach` that re-asserts the value:
```js
// setup.mjs
import { beforeEach } from 'vitest';
const WORKER_HOME = process.env.APPO_CONFIG_HOME || mkdtempSync(join(tmpdir(), 'appo-worker-'));
process.env.APPO_CONFIG_HOME = WORKER_HOME;
beforeEach(() => {
  if (!process.env.APPO_CONFIG_HOME) process.env.APPO_CONFIG_HOME = WORKER_HOME;
});
```
This guarantees no test ever starts with the var unset, regardless of a prior file's teardown.

### WR-02: setup.mjs leaks one temp dir per worker (never cleaned up)

**File:** `test/helpers/setup.mjs:21`
**Issue:** Each worker `mkdtempSync(...'appo-worker-')` creates a temp directory that is
never removed. With the `forks` pool spawning a process per file, a full run leaves one
`appo-worker-*` dir per worker in `os.tmpdir()` for every CI run and every local run. These
accumulate (CI runners are ephemeral, but local dev and self-hosted runners are not). The
config file written into it (mode 0600, may contain `test-pat`) persists on disk after the
run.
**Fix:** Register cleanup so the worker removes its dir on exit:
```js
import { rmSync } from 'node:fs';
const home = mkdtempSync(join(tmpdir(), 'appo-worker-'));
process.env.APPO_CONFIG_HOME = home;
process.on('exit', () => { try { rmSync(home, { recursive: true, force: true }); } catch {} });
```

## Info

### IN-01: stubToken's saved-config restore is global, not per-test, and can no-op silently

**File:** `test/helpers/mockFetch.mjs:76-99`
**Issue:** `savedConfigRaw` is module-level. `stubToken` only snapshots the real config the
*first* time it is called (guard `if (savedConfigRaw === null)`); `resetMockFetch` restores
and nulls it. Within a single test that calls `stubToken` twice, or across an
install/reset/install sequence, the first snapshot is the only one preserved — fine — but if
`stubToken` is ever called after a reset within the same test without a fresh install, the
second snapshot captures the *already-stubbed* state. Combined with per-worker
`APPO_CONFIG_HOME`, the "restore the real ~/.appo" rationale in the docstring is now moot
(the path points at a temp dir), so the save/restore machinery is dead weight that adds a
JSON.parse failure surface (line 96 throws if the saved bytes are not valid JSON).
**Fix:** Since `APPO_CONFIG_HOME` already isolates every worker from the real config, the
save/restore of `savedConfigRaw` can be dropped entirely; `resetMockFetch` only needs to
restore `globalThis.fetch` and clear `requests`. This removes the dead branch and the
throw-on-parse risk.

### IN-02: lint script uses deprecated `--ext` and a redundant `.js` glob

**File:** `package.json:14`
**Issue:** `eslint --ext .mjs,.js bin/ src/ test/` — the repo contains only `.mjs` files
(no `.js` under bin/src/test), so `.js` is dead scope. `--ext` is also a legacy flag slated
for removal in the flat-config era; on eslint 8 it works but emits no warning today,
masking a future break when the project moves to eslint 9 flat config.
**Fix:** `eslint bin/ src/ test/ --ext .mjs` (drop `.js`), and plan the flat-config
migration before bumping eslint to 9.x.

### IN-03: No `engines`/Node floor check enforced for the typecheck/lint tooling

**File:** `package.json:22-24`, `tsconfig.json`
**Issue:** `engines.node >= 18` is declared and CI tests on 18/20/22, but `tsconfig.json`
targets/`module: NodeNext` which resolves differently across Node majors. typecheck runs
only against the matrix's default-installed TypeScript; there is no guard that `tsc`'s
`lib`/module resolution matches the *oldest* supported runtime (18). This is a low-risk
consistency gap, not a bug.
**Fix:** Optional — pin `"lib"` explicitly or add a note that typecheck reflects the build
host's Node, not the matrix floor.

### IN-04: CI does not run `npm test` with any concurrency/isolation override or audit step

**File:** `.github/workflows/ci.yml:19-22`
**Issue:** `npm ci` is correct, but there is no `npm audit`/`npm audit signatures` step and
no `--frozen`/integrity assertion beyond `npm ci`'s default. Also no `permissions:` block —
the workflow inherits the repo-default `GITHUB_TOKEN` scope, which is broader than this
read-only test job needs.
**Fix:** Add a least-privilege block and (optionally) an audit step:
```yaml
permissions:
  contents: read
```

---

_Reviewed: 2026-06-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
