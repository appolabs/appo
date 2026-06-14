# Phase 1: Operator command parity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 01-operator-command-parity
**Mode:** --auto (recommended defaults selected; no interactive questions)
**Areas discussed:** Command surface & mapping, Confirm-gate UX, Exit-code taxonomy, Output/--json shape, Help & discoverability

---

## Command surface & mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Flat top-level verbs (`appo build <id>`) | Matches ROADMAP success criterion 1; shortest operator ergonomics | ✓ |
| Nested under `apps` (`appo apps build <id>`) | Consistent with shipped resource verbs, but verbose and not what the roadmap specifies | |

**Choice:** Flat verbs; `apps create/list/show/set-name` stay nested (already shipped).
**Notes:** `status` defaults to app overview; `--build <id>` switches to build-by-id status. 1:1 MCP→v1 mapping table recorded in CONTEXT.md D-01.

## Confirm-gate UX

| Option | Description | Selected |
|--------|-------------|----------|
| Client-side gate, no write without `--confirm`, print preview, exit 3 | Mirrors MCP `confirm_required` semantics; safe; script-detectable | ✓ |
| Rely on server-side gate | The v1 POST endpoints execute on receipt — no server preview gate exists, so this would weaken parity | |
| Interactive y/N prompt | Breaks non-interactive/CI and Phase 2 `ship` orchestration | |

**Choice:** CLI synthesizes the preview from overview/inputs and requires `--confirm` to POST.
**Notes:** `resubmit` surfaces the backend Apple-credential hard-fail as an actionable blocked state.

## Exit-code taxonomy

| Option | Description | Selected |
|--------|-------------|----------|
| 0 ok / 1 API+auth error / 2 usage / 3 confirm-required | Extends MVP's existing 0/1/2; adds detectable confirm gate | ✓ |
| Collapse confirm-required into 0 | Simpler, but Phase 2/CI cannot distinguish a blocked gate from success | |

**Choice:** Four documented codes (0/1/2/3). Auth failure folds into 1 (matches MVP `whoami`).

## Output / --json

| Option | Description | Selected |
|--------|-------------|----------|
| `--json` = raw v1 response body verbatim | Zero drift; honors "lockstep with /api/v1" non-negotiable | ✓ |
| `--json` = re-shaped CLI envelope | Risk of response drift; more code | |

**Choice:** `--json` prints raw parsed v1 JSON; human mode unwraps `data` and curates via existing `printApp()`/`unwrap()`.

## Help & discoverability

| Option | Description | Selected |
|--------|-------------|----------|
| Extend `USAGE` + per-command `appo <cmd> --help` | Minimal, satisfies criterion 4 | ✓ |
| Generate help from a command registry | Cleaner long-term but over-engineered for current single-switch design | |

**Choice:** Extend the centralized `USAGE` string and per-command usage branches.

## Claude's Discretion

- Curated human output wording per command.
- Single-file `switch` vs per-command modules.
- `publish --stores` value format (comma list vs repeated flag) — match v1 `app_stores` array.

## Deferred Ideas

- `appo ship` orchestration — Phase 2 (reuses these verbs).
- Build-status polling loop — Phase 2 `ship`.
- Non-interactive auth / token refresh / multi-env — Phase 3.
- `appo preview` (QR/TestFlight) — Phase 4 (blocked on apps-web-app Phase 188).
