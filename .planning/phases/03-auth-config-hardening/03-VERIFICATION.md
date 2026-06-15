---
phase: 03-auth-config-hardening
verified: 2026-06-15T05:10:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  note: initial verification (no prior VERIFICATION.md)
---

# Phase 3: Auth & Config Hardening Verification Report

**Phase Goal:** Production-grade CLI auth — token lifetime handled, logout revokes server-side, multiple environments/profiles without clobbering, non-interactive auth for CI; whoami reports account + active environment; token owner-only.
**Verified:** 2026-06-15T05:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | A 401/expired/revoked token surfaces a clear, env-named, token-free `appo login` path | VERIFIED | `src/api.mjs:49-51` 401 → `` `Token for env '${env ?? 'default'}' was rejected — run \`appo login\`.` `` interpolates only the env name; envelope text never substituted; whoami 401 (`cli.mjs:361-363`) names env. Tests: `auth.test.mjs:60-66` (env named, no token leak), `auth-cli.test.mjs` whoami 401. |
| 2 | `appo logout` revokes the PAT server-side (`DELETE /api/v1/user/tokens/current`) and always clears local in a `finally`, even on 401/network | VERIFIED | `cli.mjs:329-343`: `apiFetch(...,'DELETE','/api/v1/user/tokens/current',null,env)` then `finally { clearProfileToken(env) }`; failure warning via `console.error` (no token). Tests: `auth-cli.test.mjs:78` (204 DELETE+clear), `:91` (401 still clears), `:104` (network still clears), `:121` (per-env, siblings untouched). |
| 3 | Multiple environments/profiles without clobbering; `--env`>`APPO_ENV`>`current`>`default`; legacy flat config still authenticates; `--env` honored by ops-routed verbs (WR-01) | VERIFIED | `config.mjs`: `activeProfileName` precedence (`:72-79`), `writeProfile` no-clobber (`:104-112`), read-time legacy fold into `profiles.default` (`:46-48`). `ops.mjs` threads trailing `env` to every `apiFetch` (`:18,26,34,39,44`); `cli.mjs` ops call sites pass `env` (`:399,501,603,617,632,660`). Tests: `config-profiles.test.mjs` (precedence/no-clobber/legacy), `auth-cli.test.mjs:225` WR-01 regression — `apps create --env staging` (current=production) sends `Bearer stg-tok` to `stg.local`. Commit `90d831b` confirmed. |
| 4 | Non-interactive auth: `APPO_TOKEN` (ephemeral, never on disk) + `appo login --token <pat>` (validate via GET /apps, store on 200, refuse on 401) | VERIFIED | `config.mjs:97-102` `storedToken` reads `APPO_TOKEN` first, no writer sources it (only read site). `login.mjs:98-111` `loginWithToken` probes `GET /api/v1/apps` then `writeProfile`; 401 throws, stores nothing, never echoes pat. `cli.mjs:308-327` `--token` branch ahead of device flow. Tests: `auth.test.mjs:74-93` (Bearer env-tok, never persisted), `auth-cli.test.mjs:241,254` (200-store / 401-refuse, no echo). |
| 5 | Token owner-only (0700/0600); `appo whoami` reports active env + api_base + liveness (no /me endpoint = documented gap) | VERIFIED | `config.mjs:56,58` `mkdirSync(...0o700)` + `chmodSync(...0o600)` per write. `cli.mjs:345-367` whoami prints `env`/`api_base`/`status: authenticated — N app(s)`, no identity field, no token. Only `/api/v1/user...` reference is the logout DELETE — no `/me` fetch (D-12 backend gap). Tests: `auth-cli.test.mjs` whoami 200/401/no-token. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/config.mjs` | Profile-aware gateway, lazy `configPath()`, legacy normalization, APPO_TOKEN read-only, 0700/0600 | VERIFIED | All 10 exports present (`configPath`, `readConfig`, `activeProfileName`, `resolveApiBase`, `storedToken`, `writeProfile`, `clearProfileToken`, `setCurrent`, `writeConfig`, `clearConfig`); no module-level `CONFIG_PATH` const; APPO_TOKEN read only in `storedToken`. |
| `src/api.mjs` | `apiFetch(...,env)` env-aware token + env-named 401; `apiFetchWithToken` for validation | VERIFIED | 5-arg `apiFetch` → `storedToken(env)`; env-named token-free 401; `apiFetchWithToken` validates a pasted pat; 204→null short-circuit kept. |
| `src/login.mjs` | `login(apiBase,env)` via writeProfile; `loginWithToken` validate-then-store | VERIFIED | Device login writes via `writeProfile`; `loginWithToken` probes then stores, refuses on 401, never echoes pat. |
| `src/ops.mjs` | Every op forwards `env` to apiFetch (WR-01) | VERIFIED | `createApp`/`triggerBuild`/`getApp`/`getBuild`/`publishApp` all take trailing `env` and forward as the 5th apiFetch arg. |
| `src/cli.mjs` | env threaded once; logout revoke+finally; whoami; env list/use; login --token; --env guards; USAGE | VERIFIED | `const env = activeProfileName(flags.env)` resolved once and threaded to resolveApiBase + every apiFetch + ops call; all verb surface present; USAGE documents `--env`/`env list`/`env use`/`login --token`/`APPO_TOKEN`/`APPO_ENV`. |
| `test/*` (config-profiles, auth, auth-cli) | Contract coverage | VERIFIED | Full suite 116/116 green via `npm test`. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `cli.mjs run()` | `activeProfileName(flags.env)` threaded everywhere | single env resolution | WIRED | `cli.mjs:302-303`; every apiFetch/ops call carries `env`. |
| `cli.mjs logout` | `DELETE /api/v1/user/tokens/current` + `clearProfileToken(env)` in finally | revoke-then-always-clear | WIRED | `cli.mjs:335-340`. |
| `ops.* ` | `apiFetch(...,env)` | env forwarded to transport (WR-01) | WIRED | `ops.mjs` every wrapper; cli call sites pass env. |
| `login.mjs loginWithToken` | `GET /api/v1/apps` then `writeProfile(env,...)` | validate-before-write | WIRED | `login.mjs:100,109`. |
| `config.mjs storedToken` | `APPO_TOKEN` then `profiles[env].token` | token precedence | WIRED | `config.mjs:98-101`; never written by any path. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full contract suite green | `npm test` | `# tests 116 # pass 116 # fail 0` | PASS |
| No PAT ever printed in any output | grep test output for seeded tokens | CLEAN (no `good-pat`/`bad-pat`/`prod-tok`/`stg-tok`/`disk-tok`/`env-tok`) | PASS |
| `--env` honored by ops-routed verb | `auth-cli.test.mjs:225` apps create --env staging | `Bearer stg-tok` → `stg.local`, not production | PASS |
| Real `~/.appo/config.json` untouched | grep real config for test tokens | no residue | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| CLI-02 | 03-01/02/03 | Auth & config hardening — token expiry/refresh handling, server-side logout revoke, multi-env profiles | SATISFIED | Truths 1,2,3,5 verified; checked `[x]` in REQUIREMENTS.md. PAT non-expiry handled as robust 401 detection (D-09), not a refresh flow the backend lacks. |
| CLI-07 | 03-01/02/03 | Non-interactive auth — `APPO_TOKEN` and/or `appo login --token <pat>` for CI | SATISFIED | Truth 4 verified; checked `[x]` in REQUIREMENTS.md. |

Both CLI-02 and CLI-07 are declared in all three plans' `requirements:` frontmatter and checked in REQUIREMENTS.md. No orphaned requirements for this phase.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/config.mjs` | 108-110 | Dead branch — `if (!cfg.current)` unreachable (readConfig always returns `current`) | Info | IN-01 from review; UX edge: first `login --env staging` leaves `current=default`. Non-blocking. |
| `src/cli.mjs` | 371-376 | `env list` prints nothing on empty config | Info | IN-02; cosmetic, no goal impact. |
| `src/cli.mjs` | 290-297 | `--env=`/`--token=`/`--api=` empty-string not guarded (only bare `=== true`) | Info | IN-03; user-typo edge, falls through to default. Non-blocking. |
| test suites | — | Correctness depends on `--test-concurrency=1` (shared env/fetch) | Info | IN-04; `npm test` pins the flag; documented. Non-blocking. |

All four are review INFO items (03-REVIEW.md), explicitly non-blocking. The one WARNING (WR-01) from review has been fixed (commit `90d831b`) and is regression-tested.

### Human Verification Required

None. This phase produces a fully test-driven CLI surface; all observable truths are covered by passing automated contract tests (116/116). No visual/real-time/external-service behavior requires human testing — the device-flow browser path is unchanged from Phase 0 and out of scope here.

### Gaps Summary

No gaps. All five success criteria are TRUE in the codebase and backed by passing tests:

1. **401 path** — env-named, token-free re-login message in both `api.mjs` and whoami.
2. **logout** — server-side `DELETE` then unconditional `finally` local clear; verified on 204/401/network, per-env.
3. **Profiles, no clobber, precedence, legacy fold** — all in `config.mjs`; the WR-01 ops env-threading gap is fixed and regression-tested (`apps create --env staging` sends staging's token).
4. **Non-interactive auth** — `APPO_TOKEN` ephemeral/never-persisted + `login --token` validate-then-store/refuse.
5. **Owner-only + whoami** — 0700/0600 per write; whoami reports env+api_base+liveness; identity is a documented backend gap (no `/me`).

The PAT never appears in any output (whoami/env list/login --token/401/error) — confirmed by per-verb `doesNotMatch` assertions plus a full-suite leak sweep (CLEAN). `APPO_TOKEN` is never written to disk (asserted on file bytes).

---

_Verified: 2026-06-15T05:10:00Z_
_Verifier: Claude (gsd-verifier)_
