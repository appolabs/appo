---
phase: 05-test-suite-ci
plan: 02
subsystem: testing
tags: [vitest, node-test-migration, unit-integration-split, test-isolation, parallel-forks, assert-to-expect]

# Dependency graph
requires:
  - phase: 05-01
    provides: vitest/eslint/tsc devDeps + vitest.config.mjs/.eslintrc.json/tsconfig.json + SDK-mirrored scripts (lint+typecheck green)
provides:
  - 122-case vitest suite split into test/unit/ (28) and test/integration/ (94)
  - single test runner (node:test fully removed; 0 node:test/node:assert imports)
  - ship.test.mjs split 18 -> 4 pollBuild units + 14 run() integration cases
  - per-worker APPO_CONFIG_HOME isolation (test/helpers/setup.mjs) for parallel forks
affects: [05-03-ci-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "assert->expect 1:1 substitution (toBe/toMatch/toEqual/not.toMatch/toBeTruthy)"
    - "assert.rejects -> capture-then-assert (preserves status + message + PAT-leak checks)"
    - "per-file worker isolation replaces --test-concurrency=1 (vitest default isolate:true/pool:forks)"
    - "per-worker config-home setup file replaces serial-process filesystem isolation"

key-files:
  created:
    - test/unit/foundation.test.mjs
    - test/unit/config-profiles.test.mjs
    - test/unit/auth.test.mjs
    - test/unit/ship.test.mjs
    - test/integration/ship.test.mjs
    - test/integration/auth-cli.test.mjs
    - test/integration/read-verbs.test.mjs
    - test/integration/write-verbs.test.mjs
    - test/integration/destructive-verbs.test.mjs
    - test/integration/help.test.mjs
    - test/helpers/setup.mjs
  modified:
    - vitest.config.mjs

key-decisions:
  - "Added test/helpers/setup.mjs (vitest setupFiles) to give each parallel worker an isolated APPO_CONFIG_HOME — fixes a cross-process config race that vitest's parallel forks exposed (stubToken files hit the real ~/.appo/config.json)"
  - "auth.test.mjs assert.rejects site 1 ported as capture-then-assert (not .rejects.toThrow) to keep all three inner checks: status 401, env-named message, no PAT leak"
  - "Kept vitest default isolate:true/pool:forks — did NOT set isolate:false (would re-introduce cross-file global collision)"

patterns-established:
  - "Migrated test files import { test[, hooks], expect } from 'vitest'; no node:assert"
  - "Files moved one level deeper use ../helpers/mockFetch.mjs and ../../src/* import depths"
  - "ship split: pollBuild (injected sleep) -> unit; run()-driven flows -> integration; helpers copied into both halves so each runs standalone"

requirements-completed: [CLI-04]

# Metrics
duration: 7 min
completed: 2026-06-15
---

# Phase 5 Plan 2: Test migration to vitest Summary

**All 9 node:test files ported to vitest and reorganized into test/unit/ (28 cases) + test/integration/ (94 cases), ship.test.mjs split 18 -> 4 pollBuild units + 14 run() integration cases, the 2 assert.rejects sites ported as capture-then-assert preserving their 401/message/PAT-leak checks, originals deleted — `npm test` reports 122 passed / 0 failing under a single runner with lint + typecheck still green.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-15T03:44:01Z
- **Completed:** 2026-06-15T03:51:06Z
- **Tasks:** 3
- **Files modified:** 12 (11 created, 1 modified) + 9 deleted

## Accomplishments
- Ported all 9 `node:test` + `node:assert/strict` files to vitest via the Shared Pattern A (imports) + B (assert->expect) substitution; the runner-agnostic harness (`mockFetch.mjs`, in-file capture helpers) carried over unchanged.
- Split `ship.test.mjs` (18 cases) along its documented boundary into `test/unit/ship.test.mjs` (4 pollBuild units, injected sleep) and `test/integration/ship.test.mjs` (14 run()-driven flows) with the shared helpers/afterEach/API copied into each half — 4 + 14 = 18, no case lost.
- Ported the two `assert.rejects` sites in auth: site 1 (apiFetch 401) as capture-then-assert keeping `status === 401`, the env-named message match, and the `not.toMatch(/test-pat/)` PAT-leak guard; site 2 (loginWithToken) as `.rejects.toThrow()`.
- Deleted the 9 root originals (single runner, no dual suite) and proved zero coverage regression: summed `test()`/`it()` count == 122 AND `npm test` reports 122 passed / 0 failing.
- Kept `npm run lint` + `npm run typecheck` at exit 0.

## Final Case Counts

| Directory | Files | Cases |
|-----------|-------|-------|
| test/unit/ | foundation 9, config-profiles 13, auth 6, ship 4 | **32** |
| test/integration/ | auth-cli 19, read-verbs 14, write-verbs 14, destructive-verbs 25, help 4, ship 14 | **90** |
| **Total** | 10 files | **122** |

- ship split confirmed: 18 -> 4 unit (pollBuild) + 14 integration (run()).
- assert.rejects sites: 2, both in test/unit/auth.test.mjs, inner checks preserved.
- `npm test` passing count: **122 passed (122)**, 0 failing, 10 test files.

## Task Commits

Each task was committed atomically:

1. **Task 1: migrate unit files (foundation, config-profiles, auth + Pattern C/D)** - `97440a5` (test)
2. **Task 2: split ship + migrate integration files + worker isolation** - `eed42c3` (test)
3. **Task 3: delete 9 originals, assert single-runner + 122-case parity** - `69d2412` (test)

**Plan metadata:** (docs commit, this SUMMARY + STATE + ROADMAP + REQUIREMENTS)

## Files Created/Modified
- `test/unit/foundation.test.mjs` - 9 cases (confirmGate/renderError/parseArgs + 2 run() smokes)
- `test/unit/config-profiles.test.mjs` - 13 cases (config store file-I/O)
- `test/unit/auth.test.mjs` - 6 cases (apiFetch/loginWithToken; 2 Pattern-C rejects sites)
- `test/unit/ship.test.mjs` - 4 pollBuild unit cases (injected sleep)
- `test/integration/ship.test.mjs` - 14 run()-driven ship/publish flow cases
- `test/integration/auth-cli.test.mjs` - 19 auth-CLI run() cases
- `test/integration/read-verbs.test.mjs` - 14 status/rejection/fix-recipe cases
- `test/integration/write-verbs.test.mjs` - 14 build/configure cases
- `test/integration/destructive-verbs.test.mjs` - 25 publish/resubmit/push cases
- `test/integration/help.test.mjs` - 4 help/usage cases
- `test/helpers/setup.mjs` - per-worker APPO_CONFIG_HOME isolation (vitest setupFiles)
- `vitest.config.mjs` - added `setupFiles: ['test/helpers/setup.mjs']`
- (deleted) `test/{foundation,config-profiles,auth,ship,auth-cli,read-verbs,write-verbs,destructive-verbs,help}.test.mjs` - 9 node:test originals

## Decisions Made
- **Per-worker config isolation via a setup file.** Vitest's default `pool: forks` runs each test FILE in a separate process IN PARALLEL. The `stubToken`-based files (foundation, ship-integration, read/write/destructive-verbs) have no per-test `mkdtemp` and resolve `configPath()` to the real `~/.appo/config.json`. Multiple workers writing that one file concurrently corrupted it mid-write. `test/helpers/setup.mjs` sets `APPO_CONFIG_HOME` to a unique per-worker temp dir before any test runs, so every file is isolated and the real config is never touched. Files that set `APPO_CONFIG_HOME` in their own `beforeEach` override it per test, unchanged.
- **assert.rejects site 1 as capture-then-assert** (not a bare `.rejects.toThrow()`) so the 401 status, env-named message, and PAT-leak checks all survive (RESEARCH Pitfall 4 / T-05-05).
- **Did not set `isolate:false` / pool overrides** — the default per-file isolation is what replaces `--test-concurrency=1`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cross-process config-file race under vitest parallel forks**
- **Found during:** Task 2 (running the migrated stubToken-based files together)
- **Issue:** With all migrated files run as a suite, `resetMockFetch()` failed with `SyntaxError: Unexpected end of JSON input` in 13 cases across unit/ship + read/write/destructive-verbs. Root cause: vitest's default `pool: forks` runs each test file in a parallel worker process; the `stubToken`-based files have no `APPO_CONFIG_HOME` mkdtemp isolation, so they all read/write the same real `~/.appo/config.json` concurrently — one worker reads a half-written file (empty) and `JSON.parse` throws. The old single-process `--test-concurrency=1` runner masked this by serializing every test in one process. Each file passes in isolation; only the parallel-suite run fails — so the migration cannot reach 122 green without fixing it.
- **Fix:** Added `test/helpers/setup.mjs` (a vitest `setupFiles` entry) that sets `APPO_CONFIG_HOME` to a unique per-worker `mkdtemp` dir before any test runs, when it isn't already set. Wired it into `vitest.config.mjs`. No per-file churn; the documented per-file-isolation + APPO_CONFIG_HOME strategy is preserved and the real config is never touched.
- **Files modified:** test/helpers/setup.mjs (new), vitest.config.mjs
- **Verification:** `npm test` → 122 passed (122), 0 failing; `npm run lint` + `npm run typecheck` exit 0.
- **Committed in:** `eed42c3` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** The fix is required for the plan's own parity guard (122 passing under one runner) and is config-level only — it changes no test logic, drops no assertion, and strictly improves isolation (the real `~/.appo/config.json` is never read or written during the suite). No scope creep.

## TDD Gate Compliance
N/A — plan type is `execute` (a mechanical port), not `tdd`. All commits are `test(...)` since the deliverable is the migrated suite itself; no production code changed.

## Known Stubs
None — this plan ports existing tests; no UI or data-bearing code, no placeholders introduced.

## Threat Flags
None — no new network endpoints, auth paths, or schema changes. The threat-model mitigations were honored: T-05-04 (122-case parity asserted), T-05-05 (PAT-leak checks preserved via capture-then-assert), T-05-06 (isolation kept at vitest default + per-worker config home, never weakened).

## Issues Encountered
None beyond the one auto-fixed blocking deviation above.

## User Setup Required
None - no external service configuration required (no `user_setup` in plan frontmatter).

## Next Phase Readiness
- Single-runner vitest suite green at 122 cases; lint + typecheck green. Plan 03 (`.github/workflows/ci.yml`) can wire `npm ci → lint → typecheck → test` and expect green on the node [18,20,22] matrix.
- Note for CI: the suite now relies on `test/helpers/setup.mjs` for config isolation under parallel workers — CI runs `npm test` (vitest) which loads it automatically via vitest.config.mjs; no extra CI step needed.

## Self-Check: PASSED

- Created files verified on disk: all 10 test files under test/unit + test/integration, test/helpers/setup.mjs, 05-02-SUMMARY.md
- Task commits verified in git log: 97440a5, eed42c3, 69d2412
- `npm test` → 122 passed (122), 0 failing; `npm run lint` exit 0; `npm run typecheck` exit 0
- Parity guard: 0 node:test refs, 0 node:assert refs, 0 root test files, summed case count == 122

---
*Phase: 05-test-suite-ci*
*Completed: 2026-06-15*
