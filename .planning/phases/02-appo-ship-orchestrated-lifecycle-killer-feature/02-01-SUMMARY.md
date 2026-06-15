---
phase: 02-appo-ship-orchestrated-lifecycle-killer-feature
plan: 01
subsystem: api
tags: [cli, transport, refactor, ops-layer, lifecycle]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Phase 1 verbs (apps create / build / publish) with inline apiFetch calls + unwrap helper + 66-test regression suite
provides:
  - src/ops.mjs — single-definition async transport layer over apiFetch (createApp, triggerBuild, getApp, getBuild, publishApp, unwrap)
  - src/cli.mjs create/build(human)/publish cases refactored onto ops; inline apiFetch duplication deleted
  - getApp/getBuild ops ready for Plan 02's poll loop
affects: [02-02 ship orchestrator, ship poll loop, ship publish step]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ops transport layer: one thin async function per v1 call, wrapping apiFetch; no console/exit/arg-parse"
    - "raw-envelope --json carve-out gated before the unwrapping op (build --json mirrors status --json)"

key-files:
  created:
    - src/ops.mjs
  modified:
    - src/cli.mjs

key-decisions:
  - "unwrap has one definition (moved to ops.mjs, name-imported back into cli.mjs)"
  - "build human path routes through ops.triggerBuild; build --json keeps a direct apiFetch raw-envelope carve-out (gated before the op)"
  - "publishApp returns raw (204 -> null), never unwrapped; status stays on direct apiFetch for its verbatim --json envelope"

patterns-established:
  - "Transport-as-ops: API calls live once in src/ops.mjs, consumed by both single verbs and (Plan 02) the ship orchestrator — no duplicated request logic"
  - "Raw-envelope --json branches gate before the unwrapping op so the verbatim {data:...} contract is preserved"

requirements-completed: [CLI-06]

# Metrics
duration: 2min
completed: 2026-06-15
---

# Phase 2 Plan 1: Shared ops transport layer Summary

**Extracted src/ops.mjs (one async op per lifecycle v1 call over apiFetch) and refactored the Phase 1 create/build/publish cases onto it — single definition of each request, zero behavior change, 66-test suite still green.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-15T00:57:01Z
- **Completed:** 2026-06-15T00:58:29Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- New `src/ops.mjs`: createApp, triggerBuild, getApp, getBuild, publishApp, unwrap — verbatim 1:1 extractions of the cli.mjs inline calls, importing only apiFetch.
- `case 'apps'/create`, `case 'publish'`, and the human `case 'build'` path now call ops; their inline `apiFetch(...)` calls are deleted.
- The build-trigger POST has exactly one transport definition (`ops.triggerBuild`); only the `build --json` branch retains a direct-apiFetch raw-envelope carve-out (gated before the op, like `status`).
- `unwrap` reduced to a single definition in ops.mjs, name-imported into cli.mjs (status/rejection/fix-recipe/whoami/apps printers resolve to it).
- getApp/getBuild exist for Plan 02's poll loop but have no callers yet.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create src/ops.mjs transport layer** - `a18b75c` (feat)
2. **Task 2: Refactor create/build/publish onto ops; delete inline apiFetch** - `d255eac` (refactor)

## Files Created/Modified
- `src/ops.mjs` - Thin async transport layer over apiFetch; one op per v1 lifecycle call + unwrap (single definition).
- `src/cli.mjs` - Imports ops; create/build(human)/publish routed through ops; local unwrap removed; inline create/publish apiFetch deleted; build --json raw-envelope carve-out retained; status unchanged.

## Decisions Made
- **unwrap single definition:** moved to ops.mjs and exported; cli.mjs name-imports it (`import { unwrap } from './ops.mjs'`) alongside `import * as ops`. No dual definitions (D-02).
- **build split (PATTERNS §118):** the `--json` branch is gated BEFORE the human path so the unwrapping op is never reached in `--json` mode; it keeps a direct apiFetch to print the raw `{data:...}` envelope (write-verbs.test.mjs:68-75). The human path consumes the unwrapped `ops.triggerBuild` result, preserving the IN-02 empty-body guard via `... || {}`.
- **status stays on apiFetch:** unchanged — its `--json` prints the raw envelope verbatim; getApp/getBuild ops exist only for Plan 02's poll loop.
- **publishApp returns raw:** 204 -> null; resolving == success; never unwrapped.

## Deviations from Plan

None - plan executed exactly as written.

The two TDD-tagged tasks used the existing 66-test suite as the regression guard (RED/GREEN) per the plan's explicit "pure refactor, suite is the guard" framing, plus the `node -e` module-load check for ops.mjs. No new test files were authored, consistent with the plan scope (Plan 02 adds test/ship.test.mjs).

## Issues Encountered
None. Baseline 66/0 before and after; no file deletions or untracked files introduced.

## TDD Gate Compliance
This plan is a behavior-preserving refactor. The plan's design uses the pre-existing 66-test suite as the regression (drift) guard rather than new RED commits; commits are `feat` (new module) then `refactor` (cases onto ops). The suite passed at 66/0 after each task, satisfying the no-drift contract (T-02-01). No separate `test(...)` RED commit was required because no new behavior was introduced.

## Next Phase Readiness
- Plan 02 (`ship` orchestrator) can compose `ops.createApp` -> `ops.triggerBuild` -> `ops.getBuild` (poll) -> `ops.publishApp` with no second copy of any request.
- getApp/getBuild are wired and tested-as-loadable; the poll loop in Plan 02 consumes getBuild.
- No blockers.

## Self-Check: PASSED

- FOUND: src/ops.mjs
- FOUND: src/cli.mjs (modified)
- FOUND: .planning/.../02-01-SUMMARY.md
- FOUND: commit a18b75c (Task 1)
- FOUND: commit d255eac (Task 2)

---
*Phase: 02-appo-ship-orchestrated-lifecycle-killer-feature*
*Completed: 2026-06-15*
