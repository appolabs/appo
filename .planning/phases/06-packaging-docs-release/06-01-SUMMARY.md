---
phase: 06-packaging-docs-release
plan: 01
subsystem: cli
tags: [packaging, npm, update-check, version, init, child_process, fetch]

# Dependency graph
requires:
  - phase: 03-auth-config-hardening
    provides: profile-aware config.mjs (readConfig/writeConfig/writeProfile), login()/loginWithToken()
  - phase: 05-testing-ci
    provides: vitest harness, APPO_CONFIG_HOME mkdtemp isolation, installMockFetch substrate
provides:
  - "appo --version / -v / version — prints `appo/<v> node/<v>` (createRequire, no runtime dep)"
  - "appo upgrade — injectable runUpgrade spawning the fixed npm argv"
  - "daily update-check notice — checkForUpdate (cached in ~/.appo, %2F registry URL, no Auth header, swallows errors)"
  - "appo init — idempotent config bootstrap + first login (device or --token) + confirming whoami"
  - "src/config.mjs readUpdateCache/writeUpdateCache + readConfig update_check carry-through"
affects: [06-02-npm-publish, 06-03-docs, packaging, release]

# Tech tracking
tech-stack:
  added: []  # runtime dependency-free preserved — only Node built-ins (node:module, node:child_process, built-in fetch)
  patterns:
    - "Injectable transports (spawnImpl/fetchImpl/now default to real impls) so side effects unit-test without spawning npm or hitting the network"
    - "Orthogonal config helpers (readUpdateCache/writeUpdateCache) that read/merge the RAW file, complemented by readConfig carrying update_check through the profile-write round-trip"

key-files:
  created:
    - src/upgrade.mjs
    - test/unit/version.test.mjs
    - test/unit/upgrade.test.mjs
    - test/unit/update-check.test.mjs
    - test/unit/init.test.mjs
  modified:
    - src/config.mjs
    - src/cli.mjs
    - bin/appo.mjs

key-decisions:
  - "Dependency-free x.y.z version compare in upgrade.mjs (no semver dep) to preserve the empty runtime dependencies invariant"
  - "Version branch placed BEFORE the help guard in run() — a bare `--version` has no positional and would otherwise fall into the no-args help branch"
  - "Update-check hook lives in bin/appo.mjs (not run()) so unit tests of run() stay free of network side effects; skipped entirely under --json"
  - "readConfig carries a present top-level update_check key (Open Q2 option a) so writeProfile/setCurrent/clearProfileToken — which spread readConfig() — never drop the daily cache"

patterns-established:
  - "Cache-invariant: writeUpdateCache merges the RAW file (never drops profiles) AND readConfig carries update_check (a profile write never drops the cache) — both directions tested"
  - "Injected fakes typed structurally in JSDoc (spawnImpl/fetchImpl) so the EventEmitter child + minimal Response fakes pass tsc --checkJs without @ts-ignore"

requirements-completed: []  # CLI-05 is multi-plan (npm publish + docs in 06-02/06-03); this plan delivers SC2+SC3 only — CLI-05 stays open until phase completion

# Metrics
duration: ~20min
completed: 2026-06-15
---

# Phase 6 Plan 01: CLI Packaging Features Summary

**`appo --version`/`-v`, `appo upgrade` (fixed npm argv), a daily update-check notice, and the idempotent `appo init` scaffolder — all on Node built-ins, with a cache that survives profile writes.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-15T14:42:00Z
- **Completed:** 2026-06-15T14:48:00Z
- **Tasks:** 3 (TDD: RED → GREEN per task)
- **Files modified:** 8 (3 created src, 4 created tests, 3 modified)

## Accomplishments
- `src/upgrade.mjs`: `runUpgrade` (injectable spawn, fixed argv `['install','-g','@appolabs/appo@latest']`) + `checkForUpdate` (daily-cached, percent-encoded scoped registry URL, no Authorization header, swallows every network error).
- `src/config.mjs`: `readUpdateCache`/`writeUpdateCache` + `readConfig` carry-through — the daily cache now survives `writeProfile`/`setCurrent`/`clearProfileToken` (the Open Q2 invariant, tested both directions).
- `src/cli.mjs`: `--version`/`-v`/`version` branch (createRequire, before the help guard), `case 'init'` (idempotent bootstrap + device/`--token` login + confirming whoami), `case 'upgrade'`, USAGE Packaging block.
- `bin/appo.mjs`: post-command update-check hook — non-fatal, daily-cached, skipped under `--json`.
- 18 new unit tests (140 total, all green); lint + typecheck green; runtime `dependencies` still empty.

## Task Commits

TDD per task (test → feat):

1. **Task 1 (RED): upgrade + cache invariant tests** — `8fbb908` (test)
2. **Task 1 (GREEN): upgrade.mjs + config cache helpers + carry-through** — `615b3e3` (feat)
3. **Task 2 (RED): version + init tests** — `839f677` (test)
4. **Task 3 (GREEN): cli.mjs + bin wiring (--version/init/upgrade/hook)** — `5891128` (feat)

## Files Created/Modified
- `src/upgrade.mjs` (new) — `runUpgrade` + `checkForUpdate` with injectable `spawnImpl`/`fetchImpl`/`now`; dependency-free version compare.
- `src/config.mjs` — `readUpdateCache`/`writeUpdateCache` (raw-file merge) + `readConfig` carries `update_check`.
- `src/cli.mjs` — version branch, `case 'init'`, `case 'upgrade'`, USAGE Packaging block + `-v` option, parseArgs `-v` → `flags.version`.
- `bin/appo.mjs` — post-command `checkForUpdate` hook (skipped under `--json`, best-effort).
- `test/unit/{version,upgrade,update-check,init}.test.mjs` (new) — injected side effects, no real network/npm.

## Decisions Made
- Version branch ordered before the help guard (a bare `--version` carries no positional).
- Update-check hook in `bin/appo.mjs` not `run()` (keeps run() unit tests network-free).
- `readConfig` carries `update_check` (Open Q2 option a) so profile writers preserve the cache for free.
- No semver dependency — a 3-segment numeric compare keeps the package runtime dependency-free.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] JSDoc types for injected `spawnImpl`/`fetchImpl` to satisfy tsc --checkJs**
- **Found during:** Task 1 (upgrade.mjs typecheck)
- **Issue:** Defaulting `spawnImpl`/`fetchImpl` to `nodeSpawn`/`fetch` made tsc infer `typeof nodeSpawn` / `typeof fetch`, so the injected EventEmitter child and the minimal `{ok, json}` Response fakes in the tests failed to typecheck (TS2322).
- **Fix:** Narrowed both JSDoc param types to the minimal structural shapes the code actually uses (`{ on(...) }` for the child; `(url, init?) => Promise<{ ok, json }>` for fetch). Also annotated `writeUpdateCache`'s `raw` as `Record<string, unknown>` and typed the two vitest `vi.fn` mock signatures so `mock.calls[0][n]` is indexable.
- **Files modified:** src/upgrade.mjs, src/config.mjs, test/unit/update-check.test.mjs
- **Verification:** `npm run typecheck` exits 0.
- **Committed in:** 615b3e3 / 5891128

**2. [Rule 1 - Bug] Version branch reordered before the help guard**
- **Found during:** Task 3 (version tests failed — printed USAGE instead of the version)
- **Issue:** `['--version']` has zero positionals, so `positional.length === 0` matched the help branch before the version check ran.
- **Fix:** Moved the `--version`/`-v`/`version` branch above the help guard.
- **Files modified:** src/cli.mjs
- **Verification:** version.test.mjs (3 cases) green; `node bin/appo.mjs --version` and `-v` both print `appo/0.1.0 node/...`.
- **Committed in:** 5891128

---

**Total deviations:** 2 auto-fixed (1 blocking typecheck, 1 ordering bug)
**Impact on plan:** Both necessary for correctness; no scope creep. The injected-fake JSDoc shapes are the planned "Injectable transports" pattern made tsc-clean.

## Issues Encountered
- The live `node bin/appo.mjs --version` smoke test exercised the real registry hook (since `--version` isn't `--json`) and found a published `@appolabs/appo@2.0.2`, correctly printing the `update available:` notice to stderr and merging a public `{last_check_ms, latest}` into the real `~/.appo/config.json` without disturbing `current`/`profiles`/`token` — confirming the merge + carry-through behaviour against a real file (T-06-04).

## User Setup Required
None - no external service configuration required.

## Known Stubs
None.

## TDD Gate Compliance
RED (`test(...)`) and GREEN (`feat(...)`) gate commits present for both TDD tasks (8fbb908→615b3e3, 839f677→5891128). No REFACTOR commit needed.

## Next Phase Readiness
- SC2 (`appo init`) and SC3 (`--version` + `upgrade`/update-check) of CLI-05 implemented and unit-tested. CLI-05 itself stays OPEN — npm publish (06-02) and README/command-reference/llms.txt (06-03) remain.
- `appo init`/`upgrade` ready to document in 06-03; the npm package metadata (06-02) can rely on the now-present `--version` and `upgrade` verbs.

## Self-Check: PASSED

All created files present (src/upgrade.mjs, 4 test files, SUMMARY.md); all four task commits (8fbb908, 615b3e3, 839f677, 5891128) found in git.

---
*Phase: 06-packaging-docs-release*
*Completed: 2026-06-15*
