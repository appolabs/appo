---
phase: 02-appo-ship-orchestrated-lifecycle-killer-feature
plan: 02
subsystem: cli
tags: [cli, lifecycle, orchestrator, killer-feature, poll, confirm-gate]

# Dependency graph
requires:
  - phase: 02-01
    provides: src/ops.mjs transport layer (createApp/triggerBuild/getApp/getBuild/publishApp/unwrap)
  - phase: 01-foundation
    provides: printPreview, renderError, the run() try/catch, the FIFO fetch-stub test substrate (installMockFetch/stubToken)
provides:
  - "appo ship <id> | appo ship --url <u> --name <n> — one-command create->build->poll->publish orchestrator"
  - "pollBuild (exported): injectable-sleep build poll, terminal ready/failed only"
  - "shipReport single ledger driving human stream + one-object --json summary"
  - "parseStores (default both canonical tokens + apple/google aliases) + EXIT map"
affects: [phase-05 parallel-safe test harness, live cross-surface verify (apps-web-app Phase 187)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Orchestrator-over-ops: ship composes the Plan-01 ops directly (no inline apiFetch, no CLI-switch re-entry, no shell-out)"
    - "Single-ledger streaming: one shipReport drives live human lines AND the one-object --json summary; --json suppresses the stream"
    - "Injectable-sleep poll loop: timeoutMs/intervalMs/sleep params keep the poll instant under test"
    - "Reimplemented gate decision (wantYes = --yes||--confirm) reusing printPreview verbatim — deliberately NOT calling confirmGate"

key-files:
  created:
    - test/ship.test.mjs
  modified:
    - src/cli.mjs

key-decisions:
  - "ship reuses printPreview verbatim but REIMPLEMENTS the gate decision (wantYes = flags.yes || flags.confirm); it does NOT call confirmGate (which keys only on flags.confirm and emits a competing --json object that would break the single-ledger contract)"
  - "Poll terminal states are EXACTLY ready (proceed to publish) and failed (stop); anything else keeps polling. Timeout (default 1800s) caps the loop and bounds the rejected->building mapper-coarsening case"
  - "Usage error (no id and no --url+--name) stays plain-text stderr exit 2 even under --json — the one-object ledger contract begins only once a pipeline step starts"
  - "--timeout 0 is honored as an immediate timeout (Number.isFinite guard instead of `|| 1800`, which would coerce 0 back to the default and hang the poll on a real sleep)"

patterns-established:
  - "Orchestrator-over-ops with a single streaming ledger and a final-lifecycle-state exit code (0 shipped / 1 blocked|failed / 2 usage / 3 gated)"
  - "Injectable-sleep poll loop unit-tested with a no-op sleep; integration paths queue a single terminal getBuild so no real sleep is reached"

requirements-completed: [CLI-06]

metrics:
  duration: ~25m
  completed: 2026-06-15
  tasks: 3
  files: 2
  tests: 78
---

# Phase 02 Plan 02: appo ship orchestrator Summary

The phase killer feature. `appo ship` takes an app from zero to submitted in one command — create -> trigger build -> poll the build to a terminal state -> publish — composing the Plan 01 ops layer with a single streaming ledger, a high-severity publish confirm-gate, first-block stop-with-resume-hints, and a one-object `--json` summary whose exit code reflects the final lifecycle state.

## What was built

- **`case 'ship'` orchestrator** (`src/cli.mjs`): entry decision (`ship <id>` skips create; `--url`+`--name` creates first), then build trigger, poll, and gated publish. Composes `ops.createApp` / `ops.triggerBuild` / `ops.getBuild` (via `pollBuild`) / `ops.publishApp` — zero inline `apiFetch`, zero switch re-entry, zero shell-out (verified: `apiFetch(` and `confirmGate(` both count 0 inside the ship case).
- **`pollBuild` (exported)**: injectable `sleep`/`intervalMs`/`timeoutMs`; terminal `ready`/`failed` only; `onChange` streams a line only on status change; timeout check placed after the terminal checks and before the sleep so `timeoutMs:0` returns after one non-terminal poll.
- **`shipReport`**: one ledger — `log` (live in human mode, suppressed under `--json`), `record` (steps[]), `finish` (emits the one `{steps, final_state}` object under `--json`, returns the exit code).
- **`parseStores`** (default both canonical tokens, apple/google aliases) and the **`EXIT`** map (`shipped:0 gated:3 blocked:1 failed:1`).
- **USAGE** extended with both ship forms, `--yes`/`--timeout`/`--stores`/`--platform`, and the ship exit-code mapping.
- **`test/ship.test.mjs`**: 12 node-reported subtests covering ordering, existing-id skip-create, build-failed, poll-timeout, the gate (exit 3 + no publish POST), build prerequisite block with surfaced app_id, usage exit-2-no-HTTP (plain + `--json`), the `--json` one-object ledger (shipped + gated), and `pollBuild` ready/failed/timeout units.

## Gate proof (T-02-05)

The gate test runs `ship 5` without `--yes` against a `ready` build and asserts `result === 3` **and** `requests.filter(r => /\/publish$/.test(r.path)).length === 0` — no publish POST is issued without `--yes`/`--confirm`. A companion `--json` gated test asserts `final_state === 'gated'`, exit 3, and the same no-POST invariant. ship reuses `printPreview` verbatim and reimplements the gate decision via `wantYes = flags.yes || flags.confirm`; it does **not** call `confirmGate`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `--timeout 0` coerced back to the 1800s default, hanging the poll**
- **Found during:** Task 3 (the poll-timeout test path stalled the suite after test 55; runs were killed at exit 144).
- **Issue:** `timeoutMs: (Number(flags.timeout) || 1800) * 1000` — `0` is falsy, so `0 || 1800` produced 1800s. The plan's timeout test passes `--timeout 0` to force an instant timeout; instead the orchestrator fell into a real `setTimeout(5000)` and the suite never reached tests 56+.
- **Fix:** Replaced the `|| 1800` coercion with a finite-number guard: `Number.isFinite(Number(flags.timeout)) && flags.timeout !== true ? Number(flags.timeout) : 1800`. `--timeout 0` is now honored as an immediate timeout; absent/boolean/non-numeric falls back to 1800.
- **Files modified:** src/cli.mjs (ship poll step)
- **Commit:** 686347f

## Test results

`npm test` (pins `--test-concurrency=1`): **78 pass / 0 fail**, ~348ms (no real sleeps). Baseline was 66; +12 ship subtests. Live: `node bin/appo.mjs ship` and `ship --json` both exit 2 with no HTTP; `node bin/appo.mjs --help` lists `appo ship`.

## Acceptance-grep nuance (no action needed)

The Task 1 grep `grep -Eqc "'succeeded'|'success'|'done'|'in_review'|'rejected'"` expecting 0 returns 2 — both matches are pre-existing Phase 1 text in `case 'resubmit'` (`current_state: 'rejected', target_state: 'in_review'`), not poll-status comparisons. The grep's intent (pollBuild matches only the verified `ready`/`failed` enum, nothing else) holds: `pollBuild` compares only `=== 'ready'` and `=== 'failed'`. The pre-existing resubmit labels are out of scope (Phase 1 code, unrelated to the build-status terminal match).

## Known Stubs

None. The orchestrator wires real data through every step (create/build/poll/publish via ops).

## Self-Check: PASSED

- src/cli.mjs — FOUND (case 'ship', pollBuild exported, EXIT map)
- test/ship.test.mjs — FOUND
- Commits 9d1408d, 98c847d, 686347f — FOUND in git log
