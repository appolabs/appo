---
gsd_state_version: 1.0
milestone: v0.1
milestone_name: CLI Completeness
status: executing
stopped_at: Phase 5 context gathered
last_updated: "2026-06-15T03:35:38.758Z"
last_activity: 2026-06-15 -- Phase 5 planning complete
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 12
  completed_plans: 9
  percent: 75
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Run the complete Appo app lifecycle from the terminal/agent, at parity with the dashboard and the `/mcp` agent surface.
**Current focus:** Phase 03 — auth-config-hardening

## Current Position

Milestone: v0.1 CLI Completeness
Phase: 4
Plan: Not started
Status: Ready to execute
Last activity: 2026-06-15 -- Phase 5 planning complete

Bootstrapped from the apps-web-app session: the MVP CLI (login + apps create/list/show/set-name) was built and verified live (a real fresh user authenticated via the device flow and created an app). Backend is complete — device grant, `/api/v1` lifecycle, and the MCP `create_app` tool (apps-web-app Phase 186) are all shipped. This project holds the CLI-side completeness phases (1-6); cross-surface parity verification lives in apps-web-app Phase 187.

ROADMAP AUDIT (2026-06-14) applied: added Phase 2 `appo ship` (KILLER FEATURE — orchestrated create→build→publish, ordered early after parity); added `resubmit` to Phase 1 parity (CLI-01); added non-interactive auth CLI-07 (`APPO_TOKEN`/`--token`) to the auth phase so CI/agents can authenticate headless; marked Phase 4 preview deferrable/off-critical-path (blocked on apps-web-app 188); restored `appo upgrade` to the packaging phase. Phases renumbered to 1-6.

## Accumulated Context

### Decisions

- Dependency-free Node CLI; device-flow auth; `~/.appo/config.json` (owner-only); API base via `--api`/`APPO_API_BASE`/config/default.
- This repo is the CLI only; `@appolabs/sdk` is the in-WebView bridge.
- [Phase 01]: Foundation: confirmGate (exit-code-3 client-side gate), prerequisite_failed error renderer, and a dep-free fetch-stub test substrate (installMockFetch/stubToken) — reused by all Phase 1 verbs.
- [Phase 01]: [Phase 01]: Read verbs (status/rejection/fix-recipe) at v1 parity; 404-as-state for rejection/fix-recipe in human mode while --json stays verbatim (D-08); status.primary_action is the Phase 2 ship compass.
- [Phase 01]: Write verbs (build/configure): build POST returns id immediately (D-03, never waits) and rides renderError for prerequisite_failed (D-06); configure PATCHes only supplied fields, 204 -> success line, --json -> null (Pitfall 5/D-08). Neither confirm-gated (reversible).
- [Phase 01]: Destructive verbs (publish/push/resubmit): client-side confirmGate before any POST (exit 3, no write without --confirm, D-04/D-05/D-07); resubmit credential hard-fail rides shared renderError (D-06); push count omitted pre-send (Pitfall 2); USAGE finalized with all 8 verbs + exit codes (D-10).
- [Phase 02]: Shared ops layer (src/ops.mjs): one async op per v1 call over apiFetch; Phase 1 create/build(human)/publish refactored onto it (inline apiFetch deleted, single unwrap). build --json and status keep a raw-envelope apiFetch carve-out gated before the op. Zero behavior change — 66/0.
- [Phase 02]: appo ship orchestrates create->build->poll->publish over the ops layer; reimplements the publish gate decision (wantYes = --yes||--confirm) reusing printPreview, never calls confirmGate; poll terminal states are exactly ready/failed with an injectable-sleep timeout (default 1800s); --json emits one {steps,final_state} object while usage errors stay plain-text exit 2.
- [Phase 03]: Profile-aware config.mjs: lazy configPath() (defeats ESM import hoisting for APPO_CONFIG_HOME test isolation), read-time legacy fold into profiles.default (no forced re-login), APPO_TOKEN ephemeral precedence never persisted; whoami reads storedToken().
- [Phase 03]: 401 always emits the env-named, token-free re-login message ahead of the server envelope text (D-09, T-03-06)
- [Phase 03]: loginWithToken validates a pasted PAT via GET /api/v1/apps before storing; refuses (writes nothing) on 401
- [Phase 03-auth-config-hardening]: CLI auth surface: env resolved once in run() and threaded into resolveApiBase + every apiFetch; logout revokes server-side (DELETE /user/tokens/current) then always clears local in a finally; whoami reports env+api_base+liveness (no token); env list/use + login --token land. Completes CLI-02 + CLI-07.

### Blockers/Concerns

- Phase 3 (preview) depends on apps-web-app Phase 188 shipping the user-PAT preview surface + `preview_app` MCP tool first.

## Session Continuity

Last session: 2026-06-15T03:15:39.450Z
Stopped at: Phase 5 context gathered
Resume file: .planning/phases/05-test-suite-ci/05-CONTEXT.md
