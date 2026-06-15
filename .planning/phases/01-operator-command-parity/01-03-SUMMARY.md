---
phase: 01-operator-command-parity
plan: 03
subsystem: cli
tags: [write-verbs, build, configure, async-trigger, partial-update, 204-handling, json-passthrough, exit-codes, tdd]

# Dependency graph
requires:
  - phase: 01-01 (foundation)
    provides: mockFetch test substrate (installMockFetch/lastRequest/resetMockFetch/stubToken/requests), renderError catch (prerequisite_failed -> Blocked + next_action/dashboard_url), --test-concurrency=1 serialized runner
  - phase: 01-02 (read verbs)
    provides: unwrap helper, --json verbatim short-circuit idiom, curated-printer pattern, USAGE lifecycle group
  - phase: bootstrap (MVP)
    provides: src/cli.mjs switch dispatcher, parseArgs, src/api.mjs apiFetch (POST/PATCH, 204 -> null, err.status/err.envelope)
provides:
  - "src/cli.mjs case 'build' — POST /api/v1/apps/{id}/builds with optional platform/branch; returns the build id immediately (D-03, never waits); prerequisite_failed propagates to renderError as an actionable block"
  - "src/cli.mjs case 'configure' — PATCH /api/v1/apps/{id} with only supplied fields; 204 -> success line; --json -> null (Pitfall 5)"
  - "test/write-verbs.test.mjs — 13 contract tests pinning POST/PATCH method+path+partial body, single-call (D-03), --json semantics, exit codes"
affects: [01-04, 02-ship]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Async-trigger write: usage-guard (exit 2) -> optional-flags->body -> POST -> --json verbatim short-circuit -> unwrap -> id + poll hint; exactly one request, no poll (D-03)"
    - "Partial-update write: usage-guard -> map only supplied flags -> empty-body guard (exit 2) -> PATCH -> 204 returns null (no unwrap) -> success line OR --json 'null' (Pitfall 5 / D-08)"
    - "Prerequisite hard-fail propagation: build does NOT catch locally — 422 prerequisite_failed flows to the shared renderError (D-06), keeping the API the authority (no client-side credential/state re-implementation)"

key-files:
  created:
    - test/write-verbs.test.mjs
  modified:
    - src/cli.mjs

key-decisions:
  - "build's 422 prerequisite_failed is NOT caught in the verb — it propagates to the top-level renderError (built in 01-01), which renders 'Blocked: <message>' + 'Next: <next_action> -> <dashboard_url>' and returns 1. The CLI does not re-implement the credential/state checks (API is the authority; T-01-10 mitigate via server enforcement only)."
  - "configure emits 'null' for --json on a 204 (Assumption A3 / Pitfall 5 / D-08) — verbatim-body semantics; there is no body to passthrough. Result is NOT unwrapped (PATCH returns null on 204)."
  - "configure keeps the flag names already used by apps create/set-name (--name/--url/--meta-name/--meta-desc) and adds --injected-css/--injected-js for cross-command consistency (D-cretion A1)."
  - "configure returns 2 (with no write) when no recognized flag is supplied — an empty PATCH body is a usage error, not a no-op request."

patterns-established:
  - "Write-verb idiom: build body from optional flags, --json verbatim before unwrap, 204 -> null branch; destructive prerequisite hard-fails ride the shared renderError rather than per-verb catches."

requirements-completed: [CLI-01]

# Metrics
duration: 2min
completed: 2026-06-15
---

# Phase 1 Plan 03: Write Verbs (build / configure) Summary

**The operator's reversible write surface: `build` (async trigger — POST→202, returns the build id immediately, never polls, D-03) and `configure` (partial update — PATCH→204) at 1:1 v1 parity. Both reuse the optional-flags→body idiom and the existing `unwrap`/`apiFetch` helpers; `build` surfaces prerequisite hard-fails (APP_BLOCKED etc.) through the Plan 01 `renderError` as an actionable Blocked state; `configure` emits a success line on 204 and `null` for `--json`. Neither is confirm-gated — reversibility is the rationale (the destructive trio is Plan 04).**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-15T00:03:54Z
- **Completed:** 2026-06-15T00:05:29Z
- **Tasks:** 3
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- `case 'build'` in `src/cli.mjs`: builds `body` from optional `--platform`/`--branch`, POSTs `/api/v1/apps/{id}/builds`, short-circuits `--json` before unwrap, and prints `Build #{id} started ({platform}). Poll: appo status {id} --build {id}` — returning 0 after exactly ONE request (D-03, never waits). Missing id → usage + exit 2.
- `case 'configure'`: maps only the supplied flags (`--name`→name, `--url`→base_url, `--meta-name`→metadata_name, `--meta-desc`→metadata_description, `--injected-css`→injected_css, `--injected-js`→injected_javascript) into the PATCH body, guards an empty body with exit 2 (no write), PATCHes `/api/v1/apps/{id}`, and prints `Updated app {id}.` on 204 (or `null` for `--json`). The result is never unwrapped (Pitfall 5).
- `build`'s prerequisite hard-fail (422 `prerequisite_failed`) is left to propagate to the shared `renderError` (built in 01-01) — no local catch, no client-side credential/state re-implementation (API is the authority).
- `test/write-verbs.test.mjs`: 13 contract tests pinning build (default `{}` body, `{platform,branch}` body, single-call, `--json` verbatim, poll hint, prerequisite → exit 1, missing id → exit 2) and configure (partial PATCH body for name/url/injected-js/injected-css, 204 success line, `--json` null, no-flag → exit 2, missing id → exit 2).
- USAGE lifecycle group now enumerates `build` and `configure` with their flags (D-10).

## Task Commits

1. **Task 1+2: build / configure write verbs (TDD)** — `2afd229` (test, RED) → `7766cc1` (feat, GREEN)
2. **Task 3: contract tests** — delivered in the RED commit `2afd229` (the test file precedes implementation).

_Tasks 1 and 2 share `src/cli.mjs` and were written against one test file, so a single RED (`2afd229`) precedes a single GREEN (`7766cc1`). No refactor commit needed — both verbs are small and reuse existing helpers (`unwrap`/`apiFetch`/`renderError`)._

## Files Created/Modified
- `test/write-verbs.test.mjs` — 13 write-verb contract tests (POST/PATCH method+path+partial body, single-call D-03, --json semantics, exit codes).
- `src/cli.mjs` — added `case 'build'` and `case 'configure'`; USAGE lifecycle enumeration.

## Decisions Made
- `build` does NOT catch `prerequisite_failed` locally — it rides the shared `renderError` (D-06), preserving the API-is-authority boundary (T-01-10).
- `configure` `--json` on a 204 emits `null` (verbatim-body semantics, Pitfall 5 / D-08), result not unwrapped.
- `configure` flag names stay consistent with `apps create`/`set-name`; an empty body is a usage error (exit 2), not a silent no-op.

## Deviations from Plan
None — plan executed exactly as written. The two `case` blocks match the EXACT code given in the plan/PATTERNS/RESEARCH; the only additive change beyond the cases is the USAGE enumeration (D-10), which the plan's analog (Plan 02) established as the convention.

## Issues Encountered
None. RED behaved as expected (10 of 13 tests failed at RED; the 3 missing-id/no-flag tests passed early because the unknown-command/default path also returns 2 — same expected overlap noted in Plan 02, not a gate violation).

## TDD Gate Compliance
RED (`2afd229`, test) precedes GREEN (`7766cc1`, feat). No unexpected RED-phase passes among the verb-behavior tests; the 3 exit-2 guard tests passing at RED is expected (exit 2 is shared with the default case).

## Threat Surface
- T-01-09 (build branch/platform inputs): accepted per register — the CLI passes `platform`/`branch` through verbatim; the v1 Build/StoreRequest validates server-side. No client-side validation re-implemented.
- T-01-10 (build prerequisite gate): mitigated by server enforcement only — the CLI never bypasses, auto-retries, or suppresses a `prerequisite_failed`; it surfaces it via `renderError` with `next_action` + `dashboard_url`.
- T-01-11 (configure injected_css/injected_javascript): accepted — the CLI is a pass-through editor of the user's own resource; backend owns sanitization/scoping.
- T-01-12 (build/configure are non-confirm writes): accepted — both reversible, intentionally not confirm-gated (the destructive trio is Plan 04).
- No new threat surface beyond the plan's register.

## Self-Check: PASSED
- `test/write-verbs.test.mjs` exists; `src/cli.mjs` modified (cases present via grep: `case 'build'`, `case 'configure'`, `'PATCH'`, `injected_javascript`, `injected_css`).
- Commits present: `2afd229` (test, RED), `7766cc1` (feat, GREEN).
- `npm test` → 33 pass / 0 fail (20 read + 13 write).
- `node bin/appo.mjs build` → exit 2; `node bin/appo.mjs configure 7` → exit 2.

## User Setup Required
None.

## Next Phase Readiness
- Plan 01-04 (destructive verbs publish/push/resubmit) reuses `confirmGate` (01-01), the same write-verb idiom, and the `renderError` block path (resubmit's CUSTOMER_ASC_CREDENTIAL_MISSING rides it exactly like build's APP_BLOCKED). It can import the same test helpers and rely on the serialized runner.
- Phase 2 `ship` drives `build` (the trigger) then polls `status --build` — both now exist at v1 parity; `build`'s core is a thin POST, callable for reuse.
- No blockers.

---
*Phase: 01-operator-command-parity*
*Completed: 2026-06-15*
