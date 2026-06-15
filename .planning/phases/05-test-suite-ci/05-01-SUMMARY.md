---
phase: 05-test-suite-ci
plan: 01
subsystem: testing
tags: [vitest, eslint, typescript, tsc, checkJs, devDependencies, package-lock, ci-tooling]

# Dependency graph
requires:
  - phase: 03-auth-config-hardening
    provides: final src/*.mjs surface (api/cli/config/login/ops) that this plan typechecks and lints
provides:
  - vitest/eslint/tsc installed as devDependencies only (runtime stays dependency-free)
  - vitest.config.mjs (node env, test/**/*.test.mjs glob, default per-file isolation)
  - .eslintrc.json (eslint:recommended + prettier, .mjs-adapted, no TS parser/plugin)
  - tsconfig.json (allowJs/checkJs/noEmit, strict:false, NodeNext, types:[node])
  - SDK-mirrored package.json scripts (test/test:integration/test:watch/lint/typecheck)
  - committed package-lock.json (first lockfile, for npm ci)
  - minimal JSDoc type tags in src + test so tsc --checkJs passes
affects: [05-02-test-migration, 05-03-ci-workflow]

# Tech tracking
tech-stack:
  added: [vitest@1.6.1, eslint@8.57.1, typescript@5.9.3, eslint-config-prettier@9.1.2, "@types/node@22.19.21"]
  patterns:
    - "devDependencies-only dev toolchain; runtime dependencies stay empty (D-11)"
    - "tsc --checkJs over raw .mjs via targeted JSDoc, strict:false to avoid implicit-any flood"
    - "eslint 8 + .eslintrc.json for SDK parity; --ext .mjs,.js to resolve .mjs from bare dirs"

key-files:
  created: [vitest.config.mjs, .eslintrc.json, tsconfig.json, package-lock.json]
  modified: [package.json, src/api.mjs, src/cli.mjs, src/login.mjs, src/ops.mjs, test/auth.test.mjs, test/foundation.test.mjs, test/helpers/mockFetch.mjs, test/auth-cli.test.mjs]

key-decisions:
  - "Pinned tooling to SDK majors (vitest 1, eslint 8.57, ts 5.4, prettier-config 9) deliberately below registry latest for one-toolchain parity"
  - "lint script needs --ext .mjs,.js — eslint 8 does not resolve .mjs from bare directory args"
  - "Dropped @typescript-eslint parser/plugin — we lint .mjs, not .ts (RESEARCH A1)"
  - "tsc residual errors fixed with @type/@param JSDoc only; no @ts-ignore, no logic change"

patterns-established:
  - "Custom Error with extra fields typed via inline /** @type {Error & {status?,envelope?}} */ cast"
  - "Option-bag functions (pollBuild, triggerBuild) documented with a single @param object-literal type"

requirements-completed: [CLI-04]

# Metrics
duration: 4 min
completed: 2026-06-15
---

# Phase 5 Plan 1: Dev toolchain + configs Summary

**vitest/eslint/tsc installed as devDependencies-only with SDK-mirrored scripts, vitest/eslint/tsconfig configs, a committed package-lock.json, and targeted JSDoc making `npm run lint` and `npm run typecheck` both exit 0 — runtime dependency-free preserved.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-15T03:36:42Z
- **Completed:** 2026-06-15T03:40:59Z
- **Tasks:** 3
- **Files modified:** 13 (4 created, 9 modified)

## Accomplishments
- Installed vitest@1.6.1, eslint@8.57.1, typescript@5.9.3, eslint-config-prettier@9.1.2, @types/node@22.19.21 as devDependencies only; runtime `dependencies` stays empty.
- Replaced the single `node:test --test-concurrency=1` script with the five SDK-mirrored scripts (test/test:integration/test:watch/lint/typecheck).
- Wrote `vitest.config.mjs` (node env, `test/**/*.test.mjs` glob, default per-file isolation kept — `isolate` intentionally not set), `.eslintrc.json` (eslint:recommended + prettier, .mjs-adapted), and `tsconfig.json` (allowJs/checkJs/noEmit, strict:false, NodeNext, types:[node]).
- Committed the first `package-lock.json` for reproducible `npm ci` in CI.
- Ran `tsc --noEmit` once (14 residual errors) and fixed each with minimal JSDoc — `npm run lint` and `npm run typecheck` both exit 0.

## Task Commits

1. **Task 1: devDeps + SDK-mirrored scripts + lockfile** - `888d74f` (chore)
2. **Task 2: vitest/eslint/tsconfig configs; lint green** - `948a14d` (feat)
3. **Task 3: targeted JSDoc so tsc --checkJs passes** - `472ad83` (fix)

**Plan metadata:** (docs commit, this SUMMARY + STATE + ROADMAP + REQUIREMENTS)

## Files Created/Modified
- `vitest.config.mjs` - node env, include `test/**/*.test.mjs`, globals:true; default isolate:true/pool:forks replaces `--test-concurrency=1`
- `.eslintrc.json` - eslint:recommended + prettier; env node/es2022; `no-unused-vars` with `^_` ignore; no TS parser/plugin
- `tsconfig.json` - allowJs/checkJs/noEmit, strict:false, module/moduleResolution NodeNext, types:[node]
- `package-lock.json` - first committed lockfile (170 packages, integrity-hashed)
- `package.json` - devDependencies block + 5 SDK-mirrored scripts; `dependencies` absent; `files` unchanged
- `src/api.mjs` - `@type {Error & {status?,envelope?}}` cast on the thrown error
- `src/cli.mjs` - `@param` object-literal type for `pollBuild` options (onChange args, env field)
- `src/login.mjs` - `@type {Error & {status?}}` cast on the refusal error
- `src/ops.mjs` - `@param` for `triggerBuild` options bag (platform/branch)
- `test/auth.test.mjs` - `@type` cast on the `assert.rejects` checker param
- `test/foundation.test.mjs` - `@type` cast on the constructed Error
- `test/helpers/mockFetch.mjs` - `@type {typeof globalThis.fetch}` cast on the fetch stub assignment
- `test/auth-cli.test.mjs` - removed unused `readFileSync`/`existsSync` imports (lint)

## Residual tsc + devDep details (per plan output spec)
- **Residual `tsc --noEmit` error count (first run):** 14 — 8 in src (api 2, cli 3, login 1, ops 2), 6 in test (auth 3, foundation 2, mockFetch 1). All resolved with JSDoc/@type casts; second run exits 0.
- **src files that got JSDoc:** api.mjs, cli.mjs, login.mjs, ops.mjs (the only files tsc flagged).
- **Final devDep versions resolved in the lockfile:** vitest 1.6.1, eslint 8.57.1, typescript 5.9.3, eslint-config-prettier 9.1.2, @types/node 22.19.21.
- **`dependencies` stayed empty:** confirmed — `package.json` has no top-level `dependencies` key; `files: ["bin","src","README.md"]` unchanged.

## Decisions Made
- **lint glob needs `--ext .mjs,.js`:** eslint 8 does not resolve `.mjs` from bare directory arguments (`eslint bin/ src/ test/` errored "No files matching the pattern"). Added `--ext .mjs,.js` so the lint script actually lints the `.mjs` surface while keeping the `bin/ src/ test/` target list.
- **TypeScript resolved to 5.9.3** (npm picked the highest in the `^5.4.0` range) — still SDK major 5, satisfies the `^5.4.0` pin and SDK parity.
- **Did NOT run `npm audit fix --force`:** the audit findings stem from the deliberately-pinned SDK majors (vitest 1.x / eslint 8.x). `--force` would upgrade to vitest 4 / eslint 10 and break the one-toolchain parity that is the phase north star.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] lint script could not resolve `.mjs` files**
- **Found during:** Task 2 (run `npm run lint`)
- **Issue:** `eslint bin/ src/ test/` (the literal script from the plan) errored "No files matching the pattern 'bin/'" — eslint 8 only auto-resolves `.js` from bare dirs, not `.mjs`, so lint could not run at all.
- **Fix:** Changed the lint script to `eslint --ext .mjs,.js bin/ src/ test/` (same target list, adds the extension hint eslint 8 requires).
- **Files modified:** package.json
- **Verification:** `npm run lint` exits 0.
- **Committed in:** `948a14d` (Task 2 commit)

**2. [Rule 1 - Bug] unused imports in test/auth-cli.test.mjs broke lint**
- **Found during:** Task 2 (first successful eslint run)
- **Issue:** `readFileSync` and `existsSync` were imported but never used, firing `no-unused-vars` (2 errors) and blocking lint green.
- **Fix:** Removed the two unused names from the `node:fs` import (no migration — Plan 02 still owns the node:test→vitest port of this file).
- **Files modified:** test/auth-cli.test.mjs
- **Verification:** `npm run lint` exits 0.
- **Committed in:** `948a14d` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug).
**Impact on plan:** Both were prerequisites for the plan's own success criterion (`npm run lint` exits 0). No scope creep — the `--ext` flag preserves the `bin/ src/ test/` target list and the import removal is a one-line dead-code deletion, not a runner migration.

## Known Stubs
None — this plan adds tooling/config only; no UI or data-bearing code.

## Threat Flags
None — no new network endpoints, auth paths, or schema changes. Plan is dev-tooling only; runtime artifact unchanged.

## Issues Encountered
None beyond the two auto-fixed deviations above.

## User Setup Required
None - no external service configuration required (no `user_setup` in plan frontmatter).

## Next Phase Readiness
- vitest/eslint/tsc are runnable; lint + typecheck green. Plan 02 (test migration to vitest, unit/integration split) and Plan 03 (CI workflow) can now run.
- Expected, not a failure: `npm test` (vitest) currently finds the existing `test/*.test.mjs` files but they still use `node:test` imports — Plan 02 migrates them. Per the plan, `npm test` is NOT made to pass here.

## Self-Check: PASSED

- Created files verified on disk: vitest.config.mjs, .eslintrc.json, tsconfig.json, package-lock.json, 05-01-SUMMARY.md
- Task commits verified in git log: 888d74f, 948a14d, 472ad83
- `npm run lint` exits 0; `npm run typecheck` exits 0

---
*Phase: 05-test-suite-ci*
*Completed: 2026-06-15*
