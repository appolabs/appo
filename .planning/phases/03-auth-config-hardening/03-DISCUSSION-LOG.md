# Phase 3: Auth & config hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 03-auth-config-hardening
**Mode:** --auto (recommended defaults; no interactive questions)
**Areas discussed:** Profiles config structure, Non-interactive auth, 401/lifetime handling, Server-side logout revoke, whoami identity, Token storage/precedence

---

## Profiles / multi-environment config

| Option | Description | Selected |
|--------|-------------|----------|
| `{current, profiles:{name:{api_base,token}}}` + read-time normalize legacy flat config | No clobbering; existing users not logged out | ✓ |
| Separate file per env (`~/.appo/<env>.json`) | More files, harder to enumerate/switch | |
| Keep flat, single env | Fails SC3 (multi-env) | |

**Choice:** profiles map; `--env > APPO_ENV > current > default`; legacy flat config folded into `profiles.default` on read.

## Non-interactive auth

| Option | Description | Selected |
|--------|-------------|----------|
| `APPO_TOKEN` env (ephemeral, never written) + `login --token <pat>` (validate then store) | Covers CI env-var and persisted-PAT paths | ✓ |
| Only `APPO_TOKEN` | No persisted headless profile | |
| Only `login --token` | No zero-write CI path | |

**Choice:** both; APPO_TOKEN highest precedence and never written; `login --token` validates before storing.

## Token lifetime / 401 handling

| Option | Description | Selected |
|--------|-------------|----------|
| Detect 401 → clear re-login path naming active env; NO refresh flow | Matches backend reality (PATs don't expire, no refresh token) | ✓ |
| Build a refresh-token flow | Backend has no refresh grant — would be dead code | |

**Choice:** detection + messaging only; sanctum `expiration => null` confirms no expiry.

## Server-side logout revoke

| Option | Description | Selected |
|--------|-------------|----------|
| `DELETE /user/tokens/current` then clear local; on failure still clear local + warn | Always clears local; revokes server-side (SC2) | ✓ |
| Clear local only (MVP behavior) | Fails SC2 (no server-side revoke) | |
| Refuse to clear local if revoke fails | Leaves stale token on a lost laptop | |

**Choice:** revoke-then-clear; warn-but-clear on revoke failure; per-env.

## whoami — account + active environment

| Option | Description | Selected |
|--------|-------------|----------|
| Report active env + api_base + liveness; add identity if an endpoint exposes it | Works today; enriches if backend allows | ✓ |
| Block on a self-identity endpoint | No `/me` endpoint exists in v1 — would block the phase | |

**Choice:** env + api_base + liveness now; identity noted as a backend gap (Claude's discretion).

## Token storage / precedence

| Option | Description | Selected |
|--------|-------------|----------|
| Keep 0600; APPO_TOKEN ephemeral; PAT never printed/logged | Honors PROJECT non-negotiable | ✓ |

**Choice:** unchanged owner-only storage; env token never persisted; no PAT in output.

## Claude's Discretion

- `env list`/`whoami` output formatting; `env` subcommand vs flat verbs.
- `login --token` validation endpoint (`/apps` vs `/user/tokens`).
- whoami identity shape if a self-identity field is found.

## Deferred Ideas

- Token-refresh flow — N/A (no expiry/refresh in backend).
- `logout --all` — per-env for now.
- Backend `/api/v1/user` self-identity endpoint — raise on apps-web-app side if needed.
