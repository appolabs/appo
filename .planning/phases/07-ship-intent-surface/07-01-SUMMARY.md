---
phase: 07-ship-intent-surface
plan: 01
subsystem: api
tags: [cli, ship, publish-intent, build-removal, vitest, esm]

# Dependency graph
requires:
  - phase: 02-killer-feature-appo-ship
    provides: "case 'ship' orchestrator, shipReport ledger, ops layer (createApp/triggerBuild/publishApp)"
  - phase: apps-web-app/189-build-staff-only
    provides: "v1 POST .../builds now 405 (legacy 404) for a user PAT — build issuance off the user surface"
  - phase: apps-web-app/190-user-config-icon-url-name
    provides: "v1 PATCH/create locked to name+base_url (metadata silently ignored)"
provides:
  - "ship = create -> publish-intent (no build, no poll); ops.triggerBuild/pollBuild/realSleep removed"
  - "EXIT map reduced to {shipped:0, gated:3, blocked:1} (failed/timeout gone)"
  - "ship integration tests assert request-absence of /builds in every case (SC-1/SC-2)"
affects: [07-02 (apps update rescope + setIcon), 07-03 (docs/llms re-sync)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Request-absence assertion: every ship test asserts requests.filter(r => /\\/builds$/.test(r.path)).length === 0"
    - "Publish-intent reuse: ship reuses ops.publishApp verbatim as the intent signal (no new transport)"

key-files:
  created: []
  modified:
    - src/ops.mjs
    - src/cli.mjs
    - test/integration/ship.test.mjs
    - test/unit/ship.test.mjs (deleted)

key-decisions:
  - "ship success message: short 'ok submitted ... — Appo will build and submit it.' + an 'appo status <id>' / 'appo preview <id>' tracking hint (CONTEXT discretion default adopted)"
  - "ship --json keeps a 2-step {steps:[create?,publish],final_state} ledger; final_state in {shipped,gated,blocked} (failed/timeout dropped)"
  - "ops.getBuild retained per D-02 (build STATUS reads survive); only build issuance/polling removed"

patterns-established:
  - "Pattern 1: deletion-first build-transport removal — no triggerBuild/pollBuild/realSleep remain in src/"
  - "Pattern 2: every ship test proves the negative (no /builds request), not just the happy-path exit code"

requirements-completed: [SC-1, SC-2]

# Metrics
duration: 4min
completed: 2026-06-22
---

# Phase 7 Plan 01: Ship-Intent Surface Summary

**`appo ship` collapsed from create→build→poll→publish to create→publish-intent; the build transport (`triggerBuild`/`pollBuild`/`realSleep`) is deleted and every ship test now asserts request-absence of `/builds`.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-22T14:14:31Z
- **Completed:** 2026-06-22T14:18:16Z
- **Tasks:** 2
- **Files modified:** 3 (1 deleted)

## Accomplishments
- Removed `ops.triggerBuild` and dropped the dead `metadata_name`/`metadata_description` params from `createApp`.
- Deleted `pollBuild` (named export) + `realSleep` from `src/cli.mjs`; reshaped `case 'ship'` to create→publish-intent reusing `ops.publishApp`.
- `EXIT` map reduced to `{shipped:0, gated:3, blocked:1}`; `--timeout` removed from the ship usage guard, USAGE help, and the `apps create` call site.
- Reshaped `test/integration/ship.test.mjs`: dropped all 202/200 build-poll responses, added the no-`/builds` invariant to all 8 ship cases, deleted the build-failed/poll-timeout/platform-leak cases; deleted `test/unit/ship.test.mjs` (imported only `pollBuild`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove build transport; reshape case 'ship'** - `efe852d` (refactor)
2. **Task 2: Reshape ship integration test; delete unit test** - `70bbeeb` (test)

**Plan metadata:** see final docs commit (this SUMMARY + STATE + ROADMAP)

_Note: Task 2 was a `tdd="true"` task. Because Task 1 already reshaped the source, the reshaped tests went green on first run rather than producing a separate RED commit — the RED state was the pre-reshape suite (importing `pollBuild`, queuing build responses) which no longer compiled/passed against the new source. See TDD Gate Compliance below._

## Files Created/Modified
- `src/ops.mjs` - Deleted `triggerBuild`; `createApp` now takes `{name, base_url}` only.
- `src/cli.mjs` - Deleted `pollBuild`/`realSleep`; `case 'ship'` is create→publish-intent; `EXIT` 3 keys; USAGE/`apps create` cleaned of `--timeout`/metadata.
- `test/integration/ship.test.mjs` - 12 cases, every ship case asserts `/builds` absence; build/poll cases removed.
- `test/unit/ship.test.mjs` - Deleted (pollBuild-only file).

## Decisions Made
- Adopted the CONTEXT discretion defaults: short submit line + `appo status`/`appo preview` tracking hint; kept the `--json` ledger as a 2-step `{steps,final_state}` object.
- Retained `ops.getBuild` untouched per the plan (D-02 — build STATUS reads survive); it is currently only reachable via the `case 'status'` direct `apiFetch` path, not via `ops.getBuild` itself, but the plan explicitly scoped its removal out of 07-01.

## Deviations from Plan

None - plan executed exactly as written. Plan 07-01 scoped only the ship reshape and build-transport removal (SC-1, SC-2); the `apps update` rescope, `ops.setIcon`, and doc edits described in CONTEXT D-03/D-04/D-05 are later plans (07-02/07-03) and were left untouched.

## Issues Encountered
- During Task 2's commit, an initial `git add` included a non-existent pathspec (`test/unit/ship.test.mjs` was already staged via `git rm`), which aborted the add and committed only the deletion. Resolved by amending the modified `test/integration/ship.test.mjs` into the same Task 2 commit (`70bbeeb`). No content lost; both files are in the final commit.

## TDD Gate Compliance
This `tdd="true"` task did not produce a separate `test(...)` RED commit before a `feat(...)` GREEN commit, because the implementation (Task 1, `refactor`) preceded the test reshape (Task 2, `test`) in the plan's task order — the source change was a deletion-first refactor, not new behavior. The reshaped tests encode the new contract and are green against the new source; the full gate (189 tests, lint, typecheck) is green. The RED condition was the pre-existing suite failing against the reshaped source (orphan `pollBuild` import + queued build responses).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SC-1 (partial) and SC-2 satisfied: `appo ship` issues no `/builds` request; `triggerBuild`/`pollBuild`/`realSleep` are gone (`grep -rn "triggerBuild\|pollBuild" src/` returns nothing).
- Ready for 07-02 (`apps update` = icon/url/name; add `ops.setIcon`) and 07-03 (README/llms.txt/docs.test re-sync — note USAGE/help already drops `--timeout`; metadata-flag wording in USAGE lines 33/36 is still present and is 07-02/07-03 scope).

## Self-Check: PASSED

- Files: src/ops.mjs, src/cli.mjs, test/integration/ship.test.mjs present; test/unit/ship.test.mjs confirmed deleted; SUMMARY present.
- Commits: efe852d (Task 1), 70bbeeb (Task 2) both in git log.
- SC-2 guard: `grep -rn "triggerBuild\|pollBuild" src/` returns nothing.

---
*Phase: 07-ship-intent-surface*
*Completed: 2026-06-22*
