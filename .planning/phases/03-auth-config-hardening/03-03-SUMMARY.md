---
phase: 03-auth-config-hardening
plan: 03
subsystem: cli-auth-surface
tags: [auth, cli, logout, whoami, profiles, non-interactive]
requires:
  - "src/config.mjs profile gateway: activeProfileName, resolveApiBase(flag,env), storedToken(env), clearProfileToken, setCurrent, readConfig (Plan 01)"
  - "src/api.mjs apiFetch(apiBase, method, path, body, env) env-aware token + env-named 401 (Plan 02)"
  - "src/login.mjs login(apiBase, env), loginWithToken(apiBase, env, pat) (Plan 02)"
provides:
  - "src/cli.mjs env-aware verb surface: single env resolution threaded into every apiFetch"
  - "logout revoke (DELETE /api/v1/user/tokens/current) + always-clear-local in finally (per-env)"
  - "whoami env + api_base + liveness (N apps), no token; env list/use; login --token branch; value-less --env/--token guards"
  - "USAGE documents --env, env list/use, login --token, APPO_TOKEN/APPO_ENV, dashboard PAT mint path"
affects:
  - "user-facing CLI: completes CLI-02 (logout revoke, multi-env, whoami) and CLI-07 (login --token, APPO_TOKEN docs)"
tech-stack:
  added: []
  patterns:
    - "Single env resolution in run() threaded everywhere (no per-call re-resolution)"
    - "Revoke-then-always-clear with the local clear in a finally (failure-safe credential removal)"
    - "Failure warning via console.error (auditable/captured), never console.warn, never a token"
key-files:
  created:
    - test/auth-cli.test.mjs
  modified:
    - src/cli.mjs
decisions:
  - "env resolved once via activeProfileName(flags.env) and threaded into resolveApiBase + every direct apiFetch call so --env cannot select the wrong profile (Pitfall 7)"
  - "logout clears the local token in a finally so a 401 (already-dead token) or network failure still removes it; the failure warning uses console.error (D-10/D-11)"
  - "ops.mjs-routed calls (createApp/triggerBuild/publishApp/getBuild) keep the active-profile default token; env threading applies to the direct apiFetch read/write verbs per plan scope"
metrics:
  duration: ~6m
  tasks: 3
  files_changed: 2
  tests_added: 14
  completed: 2026-06-15
---

# Phase 03 Plan 03: Env-Aware Auth Verb Surface Summary

Wired the user-facing CLI onto the env-aware config + transport from Plans 01-02: the active environment is resolved once in `run()` and threaded into `resolveApiBase` and every direct `apiFetch`; `logout` now revokes server-side (`DELETE /api/v1/user/tokens/current`) and always clears the local token in a `finally`; `whoami` reports the active env + api_base + liveness; new `env list`/`env use` and a `login --token` branch land; value-less `--env`/`--token` are guarded; and USAGE documents the full surface. This completes CLI-02 and CLI-07.

## What Was Built

- **Single env resolution (Pitfall 7).** `run()` resolves `const env = activeProfileName(flags.env)` once and passes it to `resolveApiBase(flags.api, env)` and as the 5th arg to every direct `apiFetch` (apps list/show/set-name, status, rejection, fix-recipe, build --json, configure, resubmit, push, plus logout/whoami). A verb can no longer silently act on the wrong profile.
- **logout = revoke-then-always-clear (D-10/D-11).** Issues `DELETE /api/v1/user/tokens/current` (204 → null); on success prints an env-named confirmation. On 401 (already-invalid) or network error it emits a warning via `console.error` (`"Could not confirm server-side revocation…"`, no token) and still clears the local token in a `finally` via `clearProfileToken(env)` — sibling profiles untouched. Always exits 0.
- **whoami env + api_base + liveness (D-12).** Guards on `storedToken(env)` (no token → `No token for env '<env>'. Run \`appo login\`.`, exit 1, no network call). Else `GET /api/v1/apps` doubles as the liveness probe; prints `env` / `api_base` / `status: authenticated — N app(s)` via the aligned `line(k,v)` idiom. 401 → env-named re-login message, exit 1. No identity field (backend gap, D-12); the token is never printed.
- **`case 'env'` (D-04/D-13).** `env list` (or no sub) iterates `readConfig().profiles`, marks the active one with `*`, prints name + api_base only — never the token. `env use <name>` calls `setCurrent` (missing/unknown → exit 2).
- **`login --token` branch (D-07).** Ahead of the device flow: `loginWithToken(apiBase, env, flags.token)` validates the pasted PAT and stores it; on 401 prints `Token rejected by <api_base> — not stored.` and exits 1 without writing; the PAT is never echoed. The device flow remains the default interactive path and now names the env.
- **Value-less flag guards.** `--env` / `--token` with no value → usage error (exit 2), mirroring the existing `--api` guard.
- **USAGE.** Auth section gains `login --token`, `env list`, `env use`; Options gain `--env`/`--token`; a new Environment-variables block documents `APPO_TOKEN` (ephemeral, highest precedence, never stored), `APPO_ENV`, `APPO_API_BASE`, and the dashboard PAT mint path. Voice kept neutral.
- **Contract suite** `test/auth-cli.test.mjs` (14 tests): logout 204/401/network/per-env; whoami 200/401/no-token; env list/use; `--env` override (token + api_base); login --token 200/401; value-less `--env`; cross-verb PAT-never-printed sweep. Config isolated via `APPO_CONFIG_HOME` set in `beforeEach` (lazy `configPath()`), torn down with env-var cleanup + temp-dir removal in `afterEach`. Logout warning + PAT-leak assertions use `captureAll` (console.log + console.error).

## Deviations from Plan

None — plan executed as written. Task 3 was verification-only (no code change); its checks (full suite, PAT-leak sweep, help test, real-config untouched) all passed without edits.

## Threat Model Compliance

- **T-03-11** (logout server-side revoke): `logout` issues `DELETE /api/v1/user/tokens/current`; test asserts `lastRequest().method === 'DELETE'` on the current-token path — a logged-out PAT is killed server-side, not just locally.
- **T-03-12** (logout failure path): the local clear is in a `finally`; tests assert the token is gone on 204, 401, AND network-error branches, with the failure warning emitted via `console.error` (captured) and containing no token.
- **T-03-13** (whoami / env list output): neither verb prints a token; tests assert no token substring in captured output (whoami shows env/api_base/count; env list shows name/api_base only).
- **T-03-14** (login --token echo): success/refusal lines name the env/api_base, never `flags.token`; the cross-verb PAT-leak sweep proves `good-pat`/`prod-tok`/`stg-tok` never appear, and the full-suite grep is CLEAN.
- **T-03-15** (--env mis-selection): env resolved once and threaded; test asserts `--env staging` uses `Bearer stg-tok` and the staging api_base over `current=production`.
- **T-03-16** (env use unknown): `env use nope` returns exit 2 and creates no profile.

## TDD Gate Compliance

- RED gate: `5b5978a` test(03-03) — suite RED (10/14 failing; the 4 incidental passes covered behavior the new wiring preserves).
- GREEN gate: `f08f803` feat(03-03) — all 14 auth-cli tests pass.
- REFACTOR: none needed (implementation landed clean in the GREEN edit).

## Verification

- `npm test` → `# tests 115 # pass 115 # fail 0` (101 baseline + 14 new auth-cli).
- `test/help.test.mjs` → 4/4 (USAGE additions did not break it).
- Token-leak sweep across full test output → CLEAN (no `good-pat`/`bad-pat`/`prod-tok`/`stg-tok`/`disk-tok`/`env-tok`/`default-tok`).
- `node bin/appo.mjs --help` shows `login --token`, `env list`, `env use`, `--env`, `--token`, `APPO_TOKEN`, `APPO_ENV`, and the mint path.
- Real `~/.appo/config.json` carries no test-token strings after the run (temp-dir isolation honored).
- logout issues `DELETE /user/tokens/current` and clears local on 204/401/network — always (finally), per-env. whoami reports env+api_base+liveness; `--env` overrides current for token+base; login --token stores on 200, refuses on 401 without echoing the PAT.

## Commits

- `5b5978a` test(03-03): add failing contract suite for the auth verb surface (RED)
- `f08f803` feat(03-03): wire the env-aware auth verb surface (GREEN)

## Self-Check: PASSED

- Files: src/cli.mjs, test/auth-cli.test.mjs, 03-03-SUMMARY.md — all present.
- Commits 5b5978a, f08f803 — both in history.
