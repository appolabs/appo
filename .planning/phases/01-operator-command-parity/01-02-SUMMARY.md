---
phase: 01-operator-command-parity
plan: 02
subsystem: cli
tags: [read-verbs, status, rejection, fix-recipe, json-passthrough, 404-as-state, exit-codes]

# Dependency graph
requires:
  - phase: 01-01 (foundation)
    provides: mockFetch test substrate (installMockFetch/lastRequest/resetMockFetch/stubToken), npm test script, renderError catch
  - phase: bootstrap (MVP)
    provides: src/cli.mjs switch dispatcher, parseArgs/unwrap/printApp, src/api.mjs apiFetch (err.status/err.envelope)
provides:
  - "src/cli.mjs case 'status' — GET /apps/{id} (overview) or /builds/{buildId} (--build); surfaces primary_action via printApp"
  - "src/cli.mjs case 'rejection' — GET /apps/{id}/rejection; 404 reads as 'No active rejection' in human mode"
  - "src/cli.mjs case 'fix-recipe' — GET /apps/{id}/rejection/recipe; collection render; 404-as-state"
  - "printBuild / printRejection / printRecipe curated printers (exact v1 field names, no drift)"
  - "test/read-verbs.test.mjs — 12 contract tests pinning method+path, --json passthrough, 404-as-state, exit codes"
affects: [01-04, 02-ship]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-verb thin wrapper: usage-guard (exit 2) -> apiFetch GET -> --json verbatim short-circuit -> unwrap -> curated printer"
    - "404-as-state: per-verb try/catch where err.status===404 is a domain state ('no active rejection') in human mode while --json re-emits the verbatim not_found envelope"

key-files:
  created:
    - test/read-verbs.test.mjs
  modified:
    - src/cli.mjs
    - package.json

key-decisions:
  - "404 on rejection/fix-recipe is handled in a per-verb try/catch (not the shared renderError) because the 'no active rejection' reading is verb-specific (D-cretion / Pitfall 4); other verbs keep the unchanged top-level catch."
  - "--json on a 404 prints JSON.stringify(err.envelope) and returns 1 — keeps verbatim envelope semantics (D-08) without routing through the human 'No active rejection' line."
  - "status overview reuses printApp unchanged (already surfaces primary_action — the operator compass); no second call to enrich with latest_build/push (RESEARCH Open Q2: v1 GET /apps/{id} is AppResource only)."
  - "npm test runs with --test-concurrency=1 because mockFetch.mjs is a shared module-level singleton + touches the real ~/.appo/config.json; concurrent test files race (see deviation)."

patterns-established:
  - "Per-verb 404-as-domain-state branch: catch err.status===404, human -> friendly line + exit 1, --json -> verbatim envelope + exit 1."

requirements-completed: [CLI-01]

# Metrics
duration: 2min
completed: 2026-06-15
---

# Phase 1 Plan 02: Read Verbs (status / rejection / fix-recipe) Summary

**The operator's read surface: `status` (app overview + `--build` build status), `rejection`, and `fix-recipe` at 1:1 v1 parity — thin GETs over apiFetch with verbatim `--json` passthrough (D-08), curated printers (D-09), and 404-as-state for the two rejection reads (Pitfall 4); `status.primary_action` is the compass Phase 2 `ship` keys off.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-14T23:59:23Z
- **Completed:** 2026-06-15T00:00:48Z
- **Tasks:** 3
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `case 'status'` in `src/cli.mjs`: branches the path on `flags.build` (`/api/v1/apps/{id}` overview vs `/api/v1/apps/{id}/builds/{buildId}`); `--json` short-circuits before unwrap; overview reuses `printApp` (keeps `primary_action` prominent), build path uses the new `printBuild`. Missing id -> usage + exit 2.
- `case 'rejection'` + `case 'fix-recipe'`: GET `/rejection` (single resource) and `/rejection/recipe` (collection, iterated). Both treat a stubbed 404 as "No active rejection for this app." (exit 1) in human mode while keeping `--json` verbatim (re-emits the `not_found` envelope, exit 1). The backend returns 404 (not empty 200) for non-REJECTED apps as a state-probe guard — surfaced cleanly without revealing internal state.
- `printBuild` / `printRejection` / `printRecipe`: curated printers cloning the aligned `line(k,v)` idiom from `printApp`, printing EXACT v1 field names (no drift; `OpenApiSpecTest` is the backend guard). `printRecipe` renders the `agent_steps`/`limitations` string arrays one per line, indented.
- `test/read-verbs.test.mjs`: 12 contract tests pinning method+path for all four read shapes (status overview, status --build, rejection, fix-recipe), `--json` verbatim passthrough, the 404-as-state behavior (human line vs verbatim envelope), and exit codes 0/1/2.
- USAGE lifecycle group now enumerates `status`/`rejection`/`fix-recipe` with their flags (D-10).

## Task Commits

1. **Task 1+2: status / rejection / fix-recipe verbs (TDD)** — `2196520` (test, RED) → `c4470ec` (feat, GREEN)
2. **Task 3: contract tests + suite-isolation fix** — tests delivered in the RED commit `2196520`; `dda047e` (fix) makes the full suite deterministically green.

_TDD tasks 1 and 2 share `src/cli.mjs` and were written against one test file, so RED (`2196520`) precedes a single GREEN (`c4470ec`). No refactor commits needed (printers were already small/focused)._

## Files Created/Modified
- `test/read-verbs.test.mjs` — 12 read-verb contract tests (method+path, --json passthrough, 404-as-state, exit codes).
- `src/cli.mjs` — added `case 'status'`/`'rejection'`/`'fix-recipe'`, `printBuild`/`printRejection`/`printRecipe`, USAGE lifecycle enumeration.
- `package.json` — `test` script now runs `--test-concurrency=1` (see deviation).

## Decisions Made
- 404 handling lives in a **per-verb try/catch** for rejection/fix-recipe (the "no active rejection" reading is verb-specific, Pitfall 4) rather than in the shared `renderError`; all other verbs keep the unchanged top-level catch.
- `--json` on a 404 prints `JSON.stringify(err.envelope)` and returns 1 — preserves the verbatim `not_found` envelope (D-08) instead of the human friendly line. The criterion "--json never swallows the envelope" holds.
- `status` overview stays single-call AppResource (RESEARCH Open Q2) — no enrichment this phase; build detail is `status --build`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `npm test` was intermittently failing (test-file race on shared fetch stub)**
- **Found during:** Task 3 (running the full suite after adding the second test file)
- **Issue:** `node --test` parallelizes across files by default. `test/helpers/mockFetch.mjs` (Plan 01) is a **module-level singleton** — `originalFetch`, `savedConfigRaw`, and the `requests` array are shared process state, and `stubToken`/`resetMockFetch` read+write the real `~/.appo/config.json`. With two test files (`foundation` + `read-verbs`) running concurrently, their `installMockFetch`/`resetMockFetch`/`stubToken` calls raced, restoring/clearing each other's globals mid-test. `npm test` produced 0, 10, or 11 failures across runs; running either file alone was always green. Directly caused by adding the second file that exercises the shared singleton.
- **Fix:** Added `--test-concurrency=1` to the `package.json` `test` script so files run serially. The suite is tiny; concurrency buys nothing and the shared stub is Plan 01's intentional design.
- **Files modified:** package.json
- **Verification:** `npm test` -> 20 pass / 0 fail across 5 consecutive runs (was flaky 0–11 fail before); `node --test --test-concurrency=1` -> 20/20 across 6 runs.
- **Committed in:** `dda047e`

---

**Total deviations:** 1 auto-fixed (1 bug).
**Impact on plan:** Intent fully met — all read verbs at v1 parity with green contract tests. The fix hardens the Plan 01 test substrate for every subsequent wave (01-04 adds more test files that use the same singleton).

## Issues Encountered
None beyond the deviation above. RED/GREEN behaved as expected (9 of 12 read-verb tests failed at RED; the 3 missing-id tests passed early because the unknown-command path also returns 2).

## TDD Gate Compliance
RED (`2196520`, test) precedes GREEN (`c4470ec`, feat). No unexpected RED-phase passes among the verb-existence tests; the 3 missing-id tests passing at RED is expected (exit 2 is shared with the default case) and is not a gate violation.

## Threat Surface
- T-01-05 (info disclosure via --json): `--json` prints only the parsed v1 body verbatim (server allowlist: AppResource / two-field rejection / recipe collection). grep confirms 0 token/bearer references in the new printers.
- T-01-06 (status --build raw EAS/GitHub fields): accepted per register — `printBuild` mirrors v1 AppBuildResource verbatim, no CLI-side injection or rename.
- T-01-07 (404 state-probe guard): the CLI renders "No active rejection" without revealing internal state; the guard is enforced server-side.
- T-01-08 (reused Bearer auth): read verbs route through the unchanged `apiFetch` — no new auth code.
- No new threat surface beyond the plan's register.

## Self-Check: PASSED
- `test/read-verbs.test.mjs` exists; `src/cli.mjs` + `package.json` modified.
- Commits present: `2196520` (test), `c4470ec` (feat), `dda047e` (fix).
- `npm test` -> 20 pass / 0 fail.

## User Setup Required
None.

## Next Phase Readiness
- Plan 01-04 destructive verbs reuse `confirmGate` (01-01) and the same `apiFetch` GET/printer idioms; they can `import { installMockFetch, lastRequest, resetMockFetch, stubToken }` and rely on the now-serialized test runner.
- Phase 2 `ship` keys off `status.primary_action` (overview) and polls `status --build` — both now exist at v1 parity.
- No blockers.

---
*Phase: 01-operator-command-parity*
*Completed: 2026-06-15*
