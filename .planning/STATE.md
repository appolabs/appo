---
gsd_state_version: 1.0
milestone: v0.1
milestone_name: CLI Completeness
status: executing
stopped_at: Completed 01-02-PLAN.md
last_updated: "2026-06-15T00:02:37.945Z"
last_activity: 2026-06-15
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 4
  completed_plans: 2
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Run the complete Appo app lifecycle from the terminal/agent, at parity with the dashboard and the `/mcp` agent surface.
**Current focus:** Phase 01 — operator-command-parity

## Current Position

Milestone: v0.1 CLI Completeness
Phase: 01 (operator-command-parity) — EXECUTING
Plan: 3 of 4
Status: Ready to execute
Last activity: 2026-06-15

Bootstrapped from the apps-web-app session: the MVP CLI (login + apps create/list/show/set-name) was built and verified live (a real fresh user authenticated via the device flow and created an app). Backend is complete — device grant, `/api/v1` lifecycle, and the MCP `create_app` tool (apps-web-app Phase 186) are all shipped. This project holds the CLI-side completeness phases (1-6); cross-surface parity verification lives in apps-web-app Phase 187.

ROADMAP AUDIT (2026-06-14) applied: added Phase 2 `appo ship` (KILLER FEATURE — orchestrated create→build→publish, ordered early after parity); added `resubmit` to Phase 1 parity (CLI-01); added non-interactive auth CLI-07 (`APPO_TOKEN`/`--token`) to the auth phase so CI/agents can authenticate headless; marked Phase 4 preview deferrable/off-critical-path (blocked on apps-web-app 188); restored `appo upgrade` to the packaging phase. Phases renumbered to 1-6.

## Accumulated Context

### Decisions

- Dependency-free Node CLI; device-flow auth; `~/.appo/config.json` (owner-only); API base via `--api`/`APPO_API_BASE`/config/default.
- This repo is the CLI only; `@appolabs/sdk` is the in-WebView bridge.
- [Phase 01]: Foundation: confirmGate (exit-code-3 client-side gate), prerequisite_failed error renderer, and a dep-free fetch-stub test substrate (installMockFetch/stubToken) — reused by all Phase 1 verbs.
- [Phase 01]: [Phase 01]: Read verbs (status/rejection/fix-recipe) at v1 parity; 404-as-state for rejection/fix-recipe in human mode while --json stays verbatim (D-08); status.primary_action is the Phase 2 ship compass.

### Blockers/Concerns

- Phase 3 (preview) depends on apps-web-app Phase 188 shipping the user-PAT preview surface + `preview_app` MCP tool first.

## Session Continuity

Last session: 2026-06-15T00:02:37.941Z
Stopped at: Completed 01-02-PLAN.md
Resume file: None
