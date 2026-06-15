---
phase: 05-test-suite-ci
plan: 03
subsystem: infra
tags: [github-actions, ci, npm, vitest, eslint, typescript, node-matrix]

# Dependency graph
requires:
  - phase: 05-test-suite-ci (plan 01)
    provides: package.json scripts (lint/typecheck/test), devDependencies, committed package-lock.json
  - phase: 05-test-suite-ci (plan 02)
    provides: 122-case vitest suite (test/unit + test/integration) passing under `vitest run`
provides:
  - .github/workflows/ci.yml — SDK-shaped CI running npm ci -> lint -> typecheck -> test on push/PR to main+master
  - Node version matrix [18, 20, 22] enforcing the engines.node >=18 floor + current
affects: [06-packaging-release]

# Tech tracking
tech-stack:
  added: [GitHub Actions (actions/checkout@v4, actions/setup-node@v4)]
  patterns:
    - "CI mirrors @appolabs/sdk shape with three forced divergences (npm not pnpm, no build step, Node matrix)"
    - "npm ci against committed lockfile for reproducible, integrity-hashed installs (T-05-07 mitigation)"

key-files:
  created: [.github/workflows/ci.yml]
  modified: []

key-decisions:
  - "CI uses npm (npm ci) not pnpm — the CLI is npm-based; the SDK's pnpm/action-setup is dropped, cache: 'npm'."
  - "No build step — the CLI ships raw .mjs (no bundler), so the SDK's pnpm build step is omitted."
  - "Node matrix [18, 20, 22] extends the SDK's single node-20 job to test the engines.node >=18 floor + current."

patterns-established:
  - "CI step order lint -> typecheck -> test, identical to the SDK (the north-star convention)."

requirements-completed: [CLI-04]

# Metrics
duration: 1min
completed: 2026-06-15
---

# Phase 5 Plan 03: GitHub Actions CI Summary

**SDK-shaped GitHub Actions CI (`npm ci -> lint -> typecheck -> test`) on push/PR to main+master across the Node [18, 20, 22] matrix, no build step, validated green locally at 122/122.**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-06-15T03:54:10Z
- **Completed:** 2026-06-15T03:54:41Z
- **Tasks:** 1 auto + 1 checkpoint (auto-approved per --auto mode)
- **Files modified:** 1 (created)

## Accomplishments
- Added `.github/workflows/ci.yml` mirroring the `@appolabs/sdk` CI shape with the three forced CLI divergences (npm not pnpm, no build step, Node matrix [18, 20, 22]).
- Triggers on push and pull_request to `main` and `master`; single job: `actions/checkout@v4` -> `actions/setup-node@v4` (cache: 'npm') -> `npm ci` -> `npm run lint` -> `npm run typecheck` -> `npm test`.
- Validated the exact CI step sequence locally (the live-run proxy): `npm ci && npm run lint && npm run typecheck && npm test` exits 0 — 122/122 tests pass, lint and typecheck clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write .github/workflows/ci.yml and validate the step sequence locally** - `fb63ff3` (ci)
2. **Task 2: Verify the live GitHub Actions CI run is green** - checkpoint (auto-approved; see below)

**Plan metadata:** committed separately (docs: complete plan)

## Files Created/Modified
- `.github/workflows/ci.yml` - GitHub Actions CI: push/PR on main+master, single job, checkout@v4 -> setup-node@v4 (cache npm) -> npm ci -> lint -> typecheck -> test, Node matrix [18, 20, 22], no build step, npm (not pnpm).

## Decisions Made
None beyond the plan — the three forced divergences (npm, no build, Node matrix) were specified in the plan/PATTERNS delta table and applied as written.

## Deviations from Plan
None - plan executed exactly as written.

## Acceptance Criteria Verification (Task 1)
All grep checks passed against `.github/workflows/ci.yml`:
- `test -f` succeeds.
- `node-version: [18, 20, 22]` present.
- `cache: 'npm'` and `npm ci` present.
- `pnpm` absent (grep exit 1).
- `build` absent (grep exit 1, no build step).
- Step order lint -> typecheck -> test confirmed (lines 20-22).
- `npm ci && npm run lint && npm run typecheck && npm test` exits 0; vitest reports 122 passing.

## Checkpoint: Task 2 (human-verify) — Auto-Approved

This run is in `--auto` mode. Task 2 is a `checkpoint:human-verify` that requires a push to GitHub to observe the live Actions run, which is not possible in this autonomous session.

- **Automatable work completed:** `ci.yml` written; the local stand-in (`npm ci && npm run lint && npm run typecheck && npm test`) ran green (exit 0, 122/122), serving as the proxy for the CI command sequence.
- **Auto-approved:** the plan was not blocked on human input.
- **One remaining manual confirmation:** the live GitHub Actions run being green across all three matrix jobs (Node 18, 20, 22) can only be confirmed on the first push/PR to GitHub. On first push, open the repo's Actions tab and confirm the "CI" workflow run is green for node 18/20/22 (each running lint -> typecheck -> test, no build step). The lockfile (`package-lock.json`) is committed, so `npm ci` will resolve in CI.

## Threat Surface
No new threat surface beyond the plan's `<threat_model>`. The workflow declares no secrets and performs no publish (T-05-08 accepted; publish is Phase 6). `npm ci` against the committed lockfile mitigates T-05-07 (non-reproducible install). The Node matrix [18, 20, 22] mitigates T-05-09 (Node-version-specific failure shipping unnoticed); the live-run confirmation is the one remaining check noted above.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. (One manual confirmation noted above: verify the live GitHub Actions run on first push.)

## Next Phase Readiness
- CLI-04 fully delivered: vitest suite (122 cases), lint, typecheck, and CI on push/PR across Node 18/20/22. Phase 05 complete.
- Ready for Phase 06 (packaging & release): CI is the green gate publish automation will build on.

## Self-Check: PASSED
- `.github/workflows/ci.yml` — FOUND
- `.planning/phases/05-test-suite-ci/05-03-SUMMARY.md` — FOUND
- commit `fb63ff3` — FOUND

---
*Phase: 05-test-suite-ci*
*Completed: 2026-06-15*
