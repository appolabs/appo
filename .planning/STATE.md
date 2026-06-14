---
gsd_state_version: 1.0
milestone: v0.1
milestone_name: CLI Completeness
status: executing
stopped_at: Phase 1 context gathered
last_updated: "2026-06-14T23:50:38.933Z"
last_activity: 2026-06-14 -- Phase 1 planning complete
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 4
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Run the complete Appo app lifecycle from the terminal/agent, at parity with the dashboard and the `/mcp` agent surface.
**Current focus:** Phase 1 — Operator command parity

## Current Position

Milestone: v0.1 CLI Completeness
Phase: 1 (not started)
Plan: Not started
Status: Ready to execute
Last activity: 2026-06-14 -- Phase 1 planning complete

Bootstrapped from the apps-web-app session: the MVP CLI (login + apps create/list/show/set-name) was built and verified live (a real fresh user authenticated via the device flow and created an app). Backend is complete — device grant, `/api/v1` lifecycle, and the MCP `create_app` tool (apps-web-app Phase 186) are all shipped. This project holds the CLI-side completeness phases (1-6); cross-surface parity verification lives in apps-web-app Phase 187.

ROADMAP AUDIT (2026-06-14) applied: added Phase 2 `appo ship` (KILLER FEATURE — orchestrated create→build→publish, ordered early after parity); added `resubmit` to Phase 1 parity (CLI-01); added non-interactive auth CLI-07 (`APPO_TOKEN`/`--token`) to the auth phase so CI/agents can authenticate headless; marked Phase 4 preview deferrable/off-critical-path (blocked on apps-web-app 188); restored `appo upgrade` to the packaging phase. Phases renumbered to 1-6.

## Accumulated Context

### Decisions

- Dependency-free Node CLI; device-flow auth; `~/.appo/config.json` (owner-only); API base via `--api`/`APPO_API_BASE`/config/default.
- This repo is the CLI only; `@appolabs/sdk` is the in-WebView bridge.

### Blockers/Concerns

- Phase 3 (preview) depends on apps-web-app Phase 188 shipping the user-PAT preview surface + `preview_app` MCP tool first.

## Session Continuity

Last session: 2026-06-14T23:29:15.958Z
Stopped at: Phase 1 context gathered
Resume file: .planning/phases/01-operator-command-parity/01-CONTEXT.md
