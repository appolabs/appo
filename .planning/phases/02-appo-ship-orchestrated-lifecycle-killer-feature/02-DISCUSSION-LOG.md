# Phase 2: `appo ship` — orchestrated lifecycle - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 02-appo-ship-orchestrated-lifecycle-killer-feature
**Mode:** --auto (recommended defaults; no interactive questions)
**Areas discussed:** Reuse architecture, Entry points, Polling strategy, Blocking/stop semantics, Confirm-gate at publish, Progress + --json, Exit-code mapping

---

## Reuse architecture (no duplicated API logic)

| Option | Description | Selected |
|--------|-------------|----------|
| Extract `src/ops.mjs`; refactor Phase 1 cases + ship to share | One definition per API call; satisfies criterion 1 cleanly | ✓ |
| `ship` calls `apiFetch` directly with its own paths | Re-derives paths/bodies = duplicated logic, drift risk | |
| `ship` shells out to the CLI verbs (spawn `appo build` etc.) | Process overhead, brittle output parsing, breaks `--json` | |

**Choice:** Shared ops layer; Phase 1 inline `apiFetch` calls refactored onto it (feature branch, delete duplication).

## Entry points & sequencing

| Option | Description | Selected |
|--------|-------------|----------|
| `ship --url --name` (create) AND `ship <id>` (skip create) | Covers new + existing apps; "zero to submitted" | ✓ |
| Only `ship --url --name` | Can't ship an already-created app | |

**Choice:** Two forms; `<id>` skips create. `--stores` defaults to both canonical tokens (aliases accepted).

## Polling strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Poll every 5s, `--timeout` 1800s, print on status change | Readable stream, bounded wait | ✓ |
| Tight poll (1s) | Noisy, hammers API | |
| No timeout | Can hang forever in CI | |

**Choice:** 5s interval, 30-min default timeout, print on change. Terminal status enum to be confirmed from backend (D-07).

## Blocking / stop semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Stop at first block, actionable message + resume command, exit non-zero | Never silent/half-finished (criterion 3) | ✓ |
| Best-effort continue past failures | Leaves inconsistent state | |

**Choice:** First-block stop; reuse `renderError` for prerequisite_failed; print resume command per block.

## Confirm-gate at publish step

| Option | Description | Selected |
|--------|-------------|----------|
| Stop at publish preview (exit 3) unless `--yes` | Honors the non-negotiable confirm-gate | ✓ |
| Auto-publish at end of pipeline | Weakens the gate — forbidden by PROJECT non-negotiables | |

**Choice:** `--yes` confirms the publish step; without it ship stops at the preview (exit 3).

## Progress streaming & --json

| Option | Description | Selected |
|--------|-------------|----------|
| Human streams live (ASCII markers); `--json` = one summary object at end | Trustworthy live feedback + machine-readable result | ✓ |
| `--json` streams JSON-lines per step | Harder to consume; partial output on crash | |

**Choice:** Live human stream; single structured `{steps[], final_state}` object for `--json`.

## Exit-code mapping (final lifecycle state)

| Option | Description | Selected |
|--------|-------------|----------|
| 0 shipped / 3 gated / 1 step error+blocked / 2 usage | Extends Phase 1 taxonomy; reflects final state | ✓ |
| Always 0/1 | Loses the gated-vs-failed distinction CI needs | |

**Choice:** 0/3/1/2 mapping per final lifecycle state.

## Claude's Discretion

- Human-stream wording / markers (ASCII only).
- ops.mjs file granularity.
- Fixed 5s vs mild backoff.
- `--confirm` as an alias for `--yes`.

## Deferred Ideas

- `--watch`/auto-resume after a fixed blocker — re-run `appo ship <id>` for now.
- Non-interactive auth for CI ship — Phase 3 (CLI-07).
- `ship` orchestration tests (HTTP mocked) — Phase 5.
