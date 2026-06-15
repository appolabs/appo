---
phase: 05-test-suite-ci
fixed_at: 2026-06-15T00:00:00Z
review_path: .planning/phases/05-test-suite-ci/05-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 3
skipped: 3
status: partial
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-06-15
**Source review:** .planning/phases/05-test-suite-ci/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (all CR/WR/IN — fix_scope=all)
- Fixed: 3 (IN-01, IN-02, IN-04)
- Skipped: 3 (WR-01, WR-02 already resolved; IN-03 documented/no-fix)

## Fixed Issues

### IN-01: stubToken's saved-config restore is global, not per-test, and can no-op silently

**Files modified:** `test/helpers/mockFetch.mjs`
**Commit:** 1987f2a
**Applied fix:** Removed the module-level `savedConfigRaw` save/restore machinery
entirely. Since `setup.mjs` already points `APPO_CONFIG_HOME` at a per-worker temp
dir, `stubToken` writes only to the isolated config — the snapshot/restore of the
real `~/.appo/config.json` was dead weight and carried a `JSON.parse`-on-restore
throw surface. Dropped the now-unused `existsSync`/`readFileSync` imports and the
`clearConfig`/`configPath` imports; `resetMockFetch` now only restores
`globalThis.fetch` and clears `requests`. Real-config risk is not reintroduced —
worker isolation is the sole safeguard, by design. Verified: 187 tests green,
`node -c` clean.

### IN-02: lint script uses deprecated `--ext` and a redundant `.js` glob

**Files modified:** `package.json`
**Commit:** fc71478
**Applied fix:** Changed `eslint --ext .mjs,.js bin/ src/ test/` to
`eslint --ext .mjs bin/ src/ test/`. Confirmed via `find` that bin/src/test contain
only `.mjs` files, so `.js` was dead scope. Kept `--ext` (eslint 8 supports it; flat
-config migration deferred to the eslint-9 bump per the finding). Verified:
`npm run lint` exits clean.

### IN-04: CI does not declare least-privilege token permissions

**Files modified:** `.github/workflows/ci.yml`
**Commit:** cf2d334
**Applied fix:** Added a top-level `permissions:\n  contents: read` block so the
workflow's `GITHUB_TOKEN` is scoped read-only rather than inheriting the broader
repo default — this is sufficient for a checkout + install + lint/typecheck/test job.
The optional `npm audit` step was deliberately NOT added: per the task constraints it
would add advisory noise/risk to CI without a proportionate benefit (`npm ci` already
enforces lockfile integrity; runtime `dependencies` is empty). Verified: YAML
structure intact, permissions block present.

## Skipped Issues

### WR-01: afterEach deletes APPO_CONFIG_HOME, defeating setup.mjs's per-worker guard

**File:** `test/helpers/setup.mjs:20-22`
**Reason:** Already resolved (commit 3e2c951). `setup.mjs` now installs a global
`beforeEach` that re-asserts `APPO_CONFIG_HOME` to the worker default before every
test, so a prior file's `afterEach delete` can never expose the real config. The
current code already matches the finding's recommended fix. No further action.

### WR-02: setup.mjs leaks one temp dir per worker (never cleaned up)

**File:** `test/helpers/setup.mjs:21`
**Reason:** Already resolved (commit 3e2c951). `setup.mjs` now registers a
`process.on('exit', ...)` handler that `rmSync`-removes the worker's temp config home
on exit. Matches the finding's recommended fix. No further action.

### IN-03: No engines/Node floor check enforced for the typecheck/lint tooling

**File:** `package.json:22-24`, `tsconfig.json`
**Reason:** Documented and skipped — no safe minimal fix exists. The Node floor is
already enforced: `engines.node >= 18` is declared and CI runs the matrix [18, 20, 22].
The finding's only concrete suggestion was to "pin `lib` explicitly." That was
attempted (`"lib": ["ES2022"]`) and reverted: it breaks `npm run typecheck` because
TypeScript's default `lib` (derived from `target` plus `DOM`) supplies the
`fetch`/`Response` typings that `src/login.mjs` relies on; pinning `lib` to ES2022
only strips them and produces ~10 TS2339 errors. The residual gap (tsc's lib reflects
the build host's installed TypeScript rather than the matrix floor) is, per the
finding itself, "a low-risk consistency gap, not a bug." Introducing the change would
violate the keep-typecheck-green constraint, so it is left advisory.

---

_Fixed: 2026-06-15_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
