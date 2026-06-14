---
gsd_state_version: 1.0
milestone: v0.1
milestone_name: CLI Completeness
status: ready-to-plan
last_updated: "2026-06-14"
last_activity: 2026-06-14 -- project bootstrapped from apps-web-app CLI work
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
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
Status: Ready to plan Phase 1
Last activity: 2026-06-14

Bootstrapped from the apps-web-app session: the MVP CLI (login + apps create/list/show/set-name) was built and verified live (a real fresh user authenticated via the device flow and created an app). Backend is complete — device grant, `/api/v1` lifecycle, and the MCP `create_app` tool (apps-web-app Phase 186) are all shipped. This project holds the CLI-side completeness phases (1-5); cross-surface parity verification lives in apps-web-app Phase 187.

## Accumulated Context

### Decisions
- Dependency-free Node CLI; device-flow auth; `~/.appo/config.json` (owner-only); API base via `--api`/`APPO_API_BASE`/config/default.
- This repo is the CLI only; `@appolabs/sdk` is the in-WebView bridge.

### Blockers/Concerns
- Phase 3 (preview) depends on apps-web-app Phase 188 shipping the user-PAT preview surface + `preview_app` MCP tool first.

## Session Continuity

Last session: 2026-06-14
Stopped at: Project bootstrapped, ready to plan Phase 1
Resume file: None
