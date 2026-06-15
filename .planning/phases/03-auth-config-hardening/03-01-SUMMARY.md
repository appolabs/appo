---
phase: 03-auth-config-hardening
plan: 01
subsystem: config
tags: [auth, config, profiles]
requires: []
provides:
  - "src/config.mjs profile-aware gateway: configPath (lazy), readConfig (legacy-normalizing), activeProfileName, resolveApiBase(flag,env), storedToken(env), writeProfile, clearProfileToken, setCurrent, writeConfig, clearConfig"
  - "APPO_CONFIG_HOME test-isolation seam honored at call time"
affects:
  - "src/api.mjs (Plan 02 threads env into apiFetch/storedToken)"
  - "src/cli.mjs (Plan 02 adds env list/use, login --token, logout revoke)"
  - "test/helpers/mockFetch.mjs (now resolves config path at use-time)"
tech-stack:
  added: []
  patterns:
    - "Lazy per-call path resolution to defeat ESM import hoisting in tests"
    - "Read-time legacy normalization (no versioned migration code)"
    - "Ephemeral env-var precedence (APPO_TOKEN) never persisted"
key-files:
  created:
    - test/config-profiles.test.mjs
  modified:
    - src/config.mjs
    - test/helpers/mockFetch.mjs
    - src/cli.mjs
decisions:
  - "configPath() resolves APPO_CONFIG_HOME per call (no import-time const) so a test setting the env in beforeEach is honored despite ESM import hoisting"
  - "readConfig folds flat token/api_base into profiles.default whenever an explicit default profile is absent — covers both pure-legacy configs and stubToken's hybrid flat write, guaranteeing no forced re-login"
  - "whoami uses storedToken() rather than the removed flat cfg.token (minimal cli.mjs touch; full env threading deferred to Plan 02)"
metrics:
  duration: ~4m
  tasks: 3
  files_changed: 4
  tests_added: 11
  completed: 2026-06-15
---

# Phase 03 Plan 01: Profile-Aware Config Gateway Summary

Restructured `src/config.mjs` from the flat `{ token, api_base }` shape into a profile-aware gateway `{ current, profiles: { <name>: { api_base, token } } }`, with a lazy `configPath()` getter (defeats ESM import hoisting so `APPO_CONFIG_HOME` set in a test `beforeEach` is honored), read-time normalization that folds legacy flat configs into `profiles.default` (no forced re-login), and `APPO_TOKEN` ephemeral precedence that never reaches disk.

## What Was Built

- **Lazy path seam.** Removed module-level `CONFIG_DIR`/`CONFIG_PATH` consts (and the `export { CONFIG_PATH }`). Added `configPath()` resolving `APPO_CONFIG_HOME || ~/.appo` per call. Every read/write/clear path now calls it fresh. The 0700/0600 owner-only write discipline is unchanged — only the path source moved.
- **Legacy-normalizing `readConfig()`.** Returns `{ current, profiles }`; folds top-level `token`/`api_base` into `profiles.default` when no explicit default exists; an absent/unparseable file yields `{ current: 'default', profiles: {} }` so `.profiles[env]` never throws.
- **Profile-aware resolvers.** `activeProfileName(flagEnv)` (`--env > APPO_ENV > current > default`); `resolveApiBase(flagValue, env)` (`--api > APPO_API_BASE > profile > default`, trailing slash stripped); `storedToken(env)` (`APPO_TOKEN > profile token`, read-only).
- **Writers.** `writeProfile(env, patch)` (merge, no sibling clobber), `clearProfileToken(env)` (drop token, keep api_base), `setCurrent(env)` — all routed through `writeConfig`.
- **Test seam wiring.** `mockFetch.mjs` drops the import-time `CONFIG_PATH` capture and resolves `configPath().file` at use-time inside `stubToken`.
- **Unit suite** `test/config-profiles.test.mjs` (11 tests): isolation invariant, legacy fold, no-clobber, precedence chains, APPO_TOKEN non-persistence (asserted on file bytes), clearProfileToken/setCurrent, data-shape (tokens only on profile objects).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] whoami read the removed flat `cfg.token`**
- **Found during:** Task 3 (full-suite regression).
- **Issue:** `readConfig()` now returns the profile shape, so `whoami`'s `if (!cfg.token)` was always truthy-false → "Not authenticated" before any fetch, breaking the prerequisite-envelope test.
- **Fix:** `whoami` now calls `storedToken()`; the unused `readConfig` import was replaced with `storedToken` (CLAUDE.md: delete unused). Full env threading into apiFetch stays in Plan 02 scope.
- **Files modified:** src/cli.mjs
- **Commit:** 74afda7

**2. [Rule 1 - Bug] Legacy fold missed `stubToken`'s hybrid flat write**
- **Found during:** Task 3.
- **Issue:** The reference normalization (`!raw.profiles && (token||api_base)`) skipped folding when a `profiles` map was present. `stubToken` writes `{ ...readConfig(), token, api_base }`, which now injects an empty `profiles:{}` alongside the flat keys — so the normalizer treated it as already-profiles and dropped the token, failing 47 baseline tests from a clean `~/.appo`. (The initial 95/95 was a false pass that depended on pre-existing real flat config on disk.)
- **Fix:** `readConfig()` folds flat `token`/`api_base` into `profiles.default` whenever an explicit `profiles.default` is absent, covering both pure-legacy and hybrid writes. Honors the plan's directive to fix via read-time normalization rather than changing `stubToken`'s write shape.
- **Files modified:** src/config.mjs
- **Commit:** 74afda7

## Threat Model Compliance

- **T-03-01** (APPO_TOKEN never persisted): `storedToken` is the only `process.env.APPO_TOKEN` reader; no writer sources from it. Unit test reads file bytes and asserts `env-tok` is absent.
- **T-03-02** (0700/0600 perms): all writes route through `writeConfig`; perms reapplied per write; lazy getter only relocates the dir.
- **T-03-03** (no silent logout): legacy fold preserves the existing token; unit test asserts a flat config yields the old token, not null.
- **T-03-04** (env list data shape): data-shape test confirms tokens live only on profile objects; render elision lands in Plan 02.

## Verification

- `npm test` → `# tests 95 # pass 95 # fail 0` (84 baseline + 11 new), deterministic across repeated sequential runs.
- Isolation: `configPath().file.startsWith(APPO_CONFIG_HOME)` asserted from a beforeEach-set env; node one-liner confirms `writeConfig` lands in a temp dir, not `~/.appo`.
- Real `~/.appo/config.json` carries no test token strings after a run.
- Note: parallel `npm test` invocations clobber each other because baseline suites use the real `~/.appo` path (pre-existing isolation characteristic, not introduced here); a single invocation is clean and deterministic.

## Commits

- `78b2a66` test(03-01): add failing unit suite for profile-aware config gateway (RED)
- `3c436b0` feat(03-01): profile-aware config gateway with lazy path getter (GREEN)
- `74afda7` fix(03-01): full-suite regression — whoami via storedToken, robust legacy fold

## Self-Check: PASSED

- Files: src/config.mjs, test/config-profiles.test.mjs, test/helpers/mockFetch.mjs, src/cli.mjs — all present.
- Commits 78b2a66, 3c436b0, 74afda7 — all in history.
