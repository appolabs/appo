---
phase: 06-packaging-docs-release
plan: 02
subsystem: infra
tags: [npm, packaging, publishConfig, github-actions, trusted-publishing, oidc, provenance, vitest]

# Dependency graph
requires:
  - phase: 05-quality-ci
    provides: vitest/eslint/tsc dev toolchain + npm-shape CI (lint/typecheck/test, no build)
  - phase: 06-packaging-docs-release (plan 01)
    provides: src/upgrade.mjs + --version/upgrade/init runtime (already in tarball)
provides:
  - package.json publish metadata (publishConfig.access:public, repository/homepage/bugs/keywords/author)
  - prepublishOnly build-free quality gate (lint+typecheck+test)
  - llms.txt added to the files whitelist
  - .github/workflows/release.yml — OIDC trusted-publishing release workflow (npm, no build)
  - test/integration/packaging.test.mjs — tarball + manifest + release.yml shape assertions
affects: [06-03 (RELEASING runbook + llms.txt + README), phase-gate (npm pack dry-run re-check)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OIDC trusted publishing (id-token: write + --provenance) — no NPM_TOKEN secret"
    - "files whitelist as the tarball contract; integration test asserts the banned-set absence"
    - "release.yml mirrors SDK shape with forced npm/no-build deltas carried from Phase 5"

key-files:
  created:
    - .github/workflows/release.yml
    - test/integration/packaging.test.mjs
  modified:
    - package.json
    - .gitignore

key-decisions:
  - "prepublishOnly substitutes the SDK's build gate with lint+typecheck+test (appo has no build, D-02)"
  - "release.yml triggers on [master, main] and drops pnpm/build entirely (carried from Phase 5)"
  - "D-09 honored: executor verified SC1 via npm pack --dry-run only — no publish, no tag, no trusted-publisher registration"

patterns-established:
  - "Packaging contract test: npm pack --dry-run --json file list + manifest fields + release.yml grep"
  - "Runtime dependency-free invariant asserted in CI (no dependencies key)"

requirements-completed: [CLI-05]

# Metrics
duration: 2min
completed: 2026-06-15
---

# Phase 6 Plan 2: Packaging metadata + release workflow Summary

**`@appolabs/appo` is publish-ready (clean tarball + full publish metadata + build-free prepublishOnly gate) with an OIDC trusted-publishing `release.yml`, proven via `npm pack --dry-run` without any real publish.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-15T12:50:09Z
- **Completed:** 2026-06-15T12:52:01Z
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- package.json now carries SDK-mirrored publish metadata (`publishConfig.access:public`, `repository`, `homepage`, `bugs`, `keywords`, `author`) plus a build-free `prepublishOnly` quality gate and `llms.txt` in the `files` whitelist — runtime dependency-free preserved (no `dependencies` key).
- `.github/workflows/release.yml` mirrors the SDK trusted-publishing flow adapted to npm: version guard, patch-bump, lint/typecheck/test, tag, `npm publish --provenance --access public` via `id-token`, GitHub Release — no pnpm, no build step, triggers `[master, main]`.
- `test/integration/packaging.test.mjs` proves SC1 without publishing: tarball whitelist (no test/.planning/lockfile/configs), manifest fields, and release.yml shape.
- Full suite green at 143 (140 baseline + 3 new); lint + typecheck green.
- D-09 autonomy boundary fully honored — no `npm publish`, no `vX.Y.Z` tag, no trusted-publisher registration.

## Task Commits

Each task was committed atomically:

1. **Task 1: package.json publish metadata + prepublishOnly + llms.txt in files** - `15a0cfc` (feat)
2. **Task 2: .github/workflows/release.yml — SDK-mirrored, npm, no build** - `9c22636` (feat)
3. **Task 3: test/integration/packaging.test.mjs (TDD)** - `a5e96f7` (test)

_Note: Task 3 was tdd-flagged. The genuine RED state was the absence of the packaging-contract test file (the artifacts it asserts were built in Tasks 1-2 within the same plan); the test passed GREEN on first run against those committed artifacts. No false-positive risk — the file-list assertion runs live `npm pack --dry-run` and the banned-set check is meaningful._

## Files Created/Modified
- `package.json` - Added repository/homepage/bugs/keywords/author + publishConfig.access:public + prepublishOnly gate + llms.txt in files
- `.gitignore` - Added `*.tgz` so stray `npm pack` dry-run artifacts are never committed
- `.github/workflows/release.yml` - OIDC trusted-publishing release workflow (npm, no build, [master, main])
- `test/integration/packaging.test.mjs` - Tarball whitelist + manifest fields + release.yml shape assertions

## Decisions Made
- **prepublishOnly build-free gate (D-02):** SDK runs `npm run build`; appo has no build, so the gate is `npm run lint && npm run typecheck && npm test`, reusing existing script names.
- **release.yml deltas (Phase 5 carry-over):** dropped `pnpm/action-setup`, `cache:'pnpm'→'npm'`, `pnpm install→npm ci`, `pnpm <task>→npm run <task>`, removed the build step, trigger `[master]→[master, main]`.
- **D-09 verification:** SC1 confirmed with `npm pack --dry-run` only. The live publish + one-time npmjs.com trusted-publisher registration are the user's documented manual actions (runbook authored in Plan 06-03).

## Deviations from Plan

None - plan executed exactly as written.

Note: The plan's `<context>` predicted an 8→9 file tarball with `src/upgrade.mjs` arriving via Plan 01; at execution time `src/upgrade.mjs` was already present (Plan 06-01 complete), so the pre-llms.txt dry-run shows 9 files. The Task 3 test deliberately asserts the bin/src/README/package.json set plus the banned-set absence (not a strict total count), so this had no impact. `llms.txt` is authored in Plan 06-03; the strict 9-file/llms.txt-presence assertion is the Wave-2 phase gate.

## Issues Encountered
None.

## User Setup Required
None for this plan. The live release requires user-only actions documented in Plan 06-03's RELEASING runbook:
- One-time npm trusted-publisher registration on npmjs.com (provider GitHub Actions, org `appolabs`, repo `appo`, workflow `release.yml`).
- The first `npm publish` (the docs note the first-publish-under-trusted-publishing nuance; merging to master triggers `release.yml`).

## Next Phase Readiness
- Packaging machinery complete and shape-verified; CLI-05 SC1 satisfied without a real publish.
- Plan 06-03 must author `llms.txt` (the `files` slot exists) and rewrite README; the phase gate then re-runs `npm pack --dry-run` to confirm the 9-file set including `llms.txt`.
- No blockers.

## Self-Check: PASSED

All created/modified files verified present; all task commits (`15a0cfc`, `9c22636`, `a5e96f7`) verified in git log.

---
*Phase: 06-packaging-docs-release*
*Completed: 2026-06-15*
