---
gsd_state_version: 1.0
milestone: v0.1
milestone_name: CLI Completeness
status: verifying
stopped_at: Completed 06-03-PLAN.md
last_updated: "2026-06-15T13:07:47.783Z"
last_activity: 2026-06-15
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 15
  completed_plans: 15
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Run the complete Appo app lifecycle from the terminal/agent, at parity with the dashboard and the `/mcp` agent surface.
**Current focus:** Phase 06 — packaging-docs-release

## Current Position

Milestone: v0.1 CLI Completeness
Phase: 06
Plan: Not started
Status: Phase complete — ready for verification
Last activity: 2026-06-15

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
- [Phase 05]: Dev toolchain (vitest 1.6.1, eslint 8.57.1, ts 5.9.3, eslint-config-prettier 9.1.2, @types/node 22.19.21) installed as devDependencies only; runtime dependency-free preserved. Configs (vitest.config.mjs/.eslintrc.json/tsconfig.json) mirror the SDK adapted for .mjs; lint needs --ext .mjs,.js for eslint 8; tsc --checkJs passes via targeted JSDoc only (no @ts-ignore). lint+typecheck green.
- [Phase 05]: Migrated all 9 node:test files to vitest split into test/unit (32) + test/integration (90) = 122 cases; ship.test.mjs split 18 -> 4 pollBuild units + 14 run() integration; 2 assert.rejects ported as capture-then-assert (status+message+PAT-leak preserved); added test/helpers/setup.mjs per-worker APPO_CONFIG_HOME isolation to fix the cross-process config race vitest parallel forks exposed; originals deleted (single runner); npm test 122/0, lint+typecheck green.
- [Phase 05]: GitHub Actions CI mirrors @appolabs/sdk shape with three forced divergences: npm (npm ci) not pnpm, no build step (raw .mjs), Node matrix [18,20,22]; push/PR on main+master; step order lint->typecheck->test; local proxy green at 122/122; live-GitHub-green is the one remaining manual confirmation on first push.
- [Phase 06]: appo --version/-v + upgrade + daily update-check + idempotent init landed on Node built-ins only (no runtime dep); update_check cache survives profile writes via readConfig carry-through (Open Q2 option a).
- [Phase 06-packaging-docs-release]: [Phase 06]: package.json publish metadata (publishConfig.access:public + repository/homepage/bugs/keywords/author) + build-free prepublishOnly gate (lint+typecheck+test) + llms.txt in files; release.yml mirrors the SDK trusted-publishing flow on npm (no pnpm, no build, [master,main], npm publish --provenance --access public via id-token). D-09 honored: verified SC1 via npm pack --dry-run only — no publish/tag/registration.
- [Phase 06]: README rewritten to the full v0.1 CLI surface (ship-first quickstart, every verb, env vars, exit codes, profiles, CI auth, RELEASING runbook); llms.txt in SDK shape links every command into a README anchor; docs.test.mjs greps both docs for the full inventory. Phase 06 gate green (187 tests, lint+typecheck), tarball ships 10 whitelisted files incl. llms.txt; no publish (D-09).

### Blockers/Concerns

- Phase 3 (preview) depends on apps-web-app Phase 188 shipping the user-PAT preview surface + `preview_app` MCP tool first.

## Session Continuity

Last session: 2026-06-15T12:57:26.856Z
Stopped at: Completed 06-03-PLAN.md
Resume file: None
