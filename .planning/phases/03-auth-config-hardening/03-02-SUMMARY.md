---
phase: 03-auth-config-hardening
plan: 02
subsystem: auth-transport
tags: [auth, transport, login, non-interactive]
requires:
  - "src/config.mjs profile gateway: storedToken(env), writeProfile, readConfig, configPath (Plan 01)"
provides:
  - "src/api.mjs apiFetch(apiBase, method, path, body, env) — env-aware token source + env-named token-free 401"
  - "src/api.mjs apiFetchWithToken(apiBase, method, path, body, pat, env) — explicit-PAT probe for validate-before-store"
  - "src/login.mjs login(apiBase, env) — device flow writing via writeProfile (no clobber)"
  - "src/login.mjs loginWithToken(apiBase, env, pat) — validate GET /api/v1/apps then store; refuse on 401"
affects:
  - "src/cli.mjs (Plan 03 threads resolved env into apiFetch; wires login --token, logout revoke, whoami, env list/use)"
tech-stack:
  added: []
  patterns:
    - "Validate-before-write for pasted secrets (probe authed endpoint, store only on success)"
    - "Status-specific error precedence: 401 forces the env-named re-login string over the server envelope text"
    - "Shared private transport core (requestWithToken) backing both stored-token and explicit-PAT calls"
key-files:
  created:
    - test/auth.test.mjs
  modified:
    - src/api.mjs
    - src/login.mjs
decisions:
  - "401 always emits the env-named re-login message ahead of the envelope's generic error/message — D-09 makes the env-named path the priority truth (T-03-06 HIGH); other statuses still prefer the server message"
  - "apiFetchWithToken added as a thin sibling of apiFetch over a shared private requestWithToken (RESEARCH option a) — validate-before-write is cleaner than a tentative write + rollback and never resolves through storedToken"
  - "loginWithToken throws a neutral status-401 Error naming only api_base on refusal; the CLI (Plan 03) maps it to exit 1"
metrics:
  duration: ~3m
  tasks: 3
  files_changed: 3
  tests_added: 6
  completed: 2026-06-15
---

# Phase 03 Plan 02: Env-Aware Transport + Non-Interactive Auth Summary

Re-pointed the authenticated transport at the active environment and added the headless auth path. `apiFetch` now sources its token via `storedToken(env)` and surfaces an env-named, token-free 401; `login.mjs` writes the device-flow token through `writeProfile` (no clobber) and gains `loginWithToken`, which validates a pasted PAT against `GET /api/v1/apps` and stores it only on success (refusing on 401 without writing anything).

## What Was Built

- **Env-aware `apiFetch`.** Signature extended to `apiFetch(apiBase, method, path, body, env)`; token line is `storedToken(env)` (falls back to the active profile when `env` is undefined, so the four-arg legacy call sites stay correct until Plan 03 threads `env`). The `if (!token)` guard, `204 → null` short-circuit, and `err.status`/`err.envelope` plumbing are unchanged — the request body moved into a shared private `requestWithToken`.
- **Env-named 401 (D-09).** A 401 always yields `` `Token for env '<env>' was rejected — run \`appo login\`.` `` ahead of the envelope's generic `error`/`message`, and never interpolates a token (D-13). Non-401 statuses still prefer the server's `message`/`error`.
- **`apiFetchWithToken`.** Exported thin variant authenticating with an explicit `pat` over the same `requestWithToken` core; used by `loginWithToken` to validate the pasted token rather than the stored one.
- **Device login writes via profile.** `login(apiBase, env)` replaces the flat `writeConfig({...readConfig(), api_base, token})` with `writeProfile(env, { api_base, token })`; the device-code POST, polling loop, and `switch (payload.error)` are untouched. The now-unused `writeConfig`/`readConfig` imports were removed (CLAUDE.md: delete unused).
- **`loginWithToken(apiBase, env, pat)`.** Probes `GET /api/v1/apps` with the pasted PAT; on success `writeProfile(env, { api_base, token: pat })` and returns `{ apiBase, env }`; on 401 throws a status-401 Error naming only `api_base` (never the PAT) and stores nothing; network/other errors rethrow. The `pat` is never echoed or logged.
- **Contract suite** `test/auth.test.mjs` (6 tests): env-named 401 (token-free), APPO_TOKEN Bearer header + non-persistence (asserted on file bytes), `loginWithToken` 200-store (single GET probe carrying the pasted PAT), 401-refuse (nothing stored, one request, no PAT in output), and no-clobber on store. Config isolated via `APPO_CONFIG_HOME` set in `beforeEach` (lazy `configPath()`), torn down with env-var cleanup + temp-dir removal in `afterEach`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 401 envelope `error:'unauthorized'` would mask the env-named message**
- **Found during:** Task 2 (GREEN).
- **Issue:** The plan's Pattern 6 keeps `payload?.message || payload?.error ||` ahead of the 401 fallback. The verified 401 envelope `{ error:'unauthorized', code:'unauthenticated' }` therefore makes `payload?.error` win, producing `err.message === 'unauthorized'` — which fails the must-have truth "a 401 surfaces a re-login message that names the active environment" (D-09, T-03-06 HIGH).
- **Fix:** For `res.status === 401` the env-named string takes precedence over the envelope text; non-401 statuses retain the `payload?.message || payload?.error` precedence. Still never interpolates a token (D-13).
- **Files modified:** src/api.mjs
- **Commit:** 6e28e1f

## Threat Model Compliance

- **T-03-06** (401 message info disclosure): the 401 string interpolates only the env name; test asserts the message matches `/env 'production'.*appo login/` and does NOT contain the stub token `test-pat`.
- **T-03-07** (APPO_TOKEN on the wire / persistence): `APPO_TOKEN` is consumed via `storedToken(env)` and sent as `Authorization: Bearer env-tok` (env wins over disk); test reads `configPath().file` bytes and asserts `env-tok` is absent.
- **T-03-08** (loginWithToken validation): the pasted PAT is probed via `GET /api/v1/apps` before any write; the 401-refuse test asserts `requests.length === 1` (no second write-call) and the token is unchanged.
- **T-03-09** (--token echo): `loginWithToken` never logs the `pat`; the refusal Error names only `api_base`; test captures stdout+stderr and asserts `bad-pat` never appears.
- **T-03-10** (device-flow write tampering): device login and `loginWithToken` write via `writeProfile` (merge); the no-clobber test seeds `profiles.production` and asserts it survives a `staging` store untouched.

## TDD Gate Compliance

- RED gate: `4e0c54d` test(03-02) — suite failed to load (`loginWithToken` not exported) and `apiFetch` ignored the 5th arg.
- GREEN gate: `6e28e1f` feat(03-02) — all 6 auth tests pass.
- REFACTOR: none needed (implementation landed clean in the GREEN edit).

## Verification

- `npm test` → `# tests 101 # pass 101 # fail 0` (95 baseline + 6 new auth), deterministic across repeated sequential runs.
- 401 on any verb → env-named, token-free re-login message.
- `APPO_TOKEN` carried as `Authorization: Bearer` (wins over disk) and never persisted (file bytes asserted).
- `login --token` (`loginWithToken`) validates via `GET /api/v1/apps`, stores on 200, refuses (writes nothing, single request) on 401, never echoes the PAT.
- Device login writes into the active profile without clobbering siblings.
- No test imports `login` positionally; the new `env` 2nd arg corrupts nothing. Real `~/.appo/config.json` absent after the run (no test-token residue).

## Commits

- `4e0c54d` test(03-02): add failing contract suite for env-aware transport + non-interactive auth (RED)
- `6e28e1f` feat(03-02): env-aware apiFetch + non-interactive loginWithToken (GREEN)

## Self-Check: PASSED

- Files: test/auth.test.mjs, src/api.mjs, src/login.mjs, 03-02-SUMMARY.md — all present.
- Commits 4e0c54d, 6e28e1f — all in history.
