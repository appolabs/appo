---
phase: 01-operator-command-parity
plan: 01
subsystem: testing
tags: [node-test, fetch-stub, cli, confirm-gate, error-envelope, exit-codes]

# Dependency graph
requires:
  - phase: bootstrap (MVP)
    provides: src/cli.mjs switch dispatcher, src/api.mjs apiFetch (err.envelope), src/config.mjs writeConfig/storedToken
provides:
  - test/helpers/mockFetch.mjs — globalThis.fetch stub (installMockFetch/lastRequest/requests/resetMockFetch/stubToken) so every verb is verifiable without a live /api/v1
  - confirmGate(flags, preview) — client-side confirm-gate returning null (proceed) or exit 3 (gated, no write)
  - printPreview(preview) — human-readable destructive-write preview renderer
  - renderError(err) — extends the top-level catch to render prerequisite_failed as an actionable Blocked + Next block
  - exit-code-3 taxonomy (D-07) and USAGE lifecycle group placeholder (D-10)
affects: [01-02, 01-03, 01-04, 02-ship]

# Tech tracking
tech-stack:
  added: [node:test (built-in, dev-only), npm test script]
  patterns:
    - "Fetch-stub contract testing: stub globalThis.fetch, assert captured method/path/body, restore on reset"
    - "Client-side confirm-gate returning null|exit-code (modeled on unwrap's small-pure-fn style)"
    - "Top-level error renderer reading err.envelope.{error,code,details} for prerequisite_failed"

key-files:
  created:
    - test/helpers/mockFetch.mjs
    - test/foundation.test.mjs
  modified:
    - src/cli.mjs
    - package.json

key-decisions:
  - "Extracted the catch body into an exported renderError(err) so the error path is unit-testable without a destructive verb (Plan 04 verbs reuse the same renderer via the unchanged catch)."
  - "stubToken saves the real ~/.appo/config.json and resetMockFetch restores/clears it — the real user credential is never altered or leaked (threat T-01-02)."
  - "Used `->` instead of `→` in the Next: line for ASCII-safe terminal output."

patterns-established:
  - "Wave-0 fetch stub: FIFO canned responses; lastRequest()/requests for assertions; full state restore in resetMockFetch."
  - "confirmGate is the single client-side gate contract Plan 04 verbs depend on (return gated before any POST)."

requirements-completed: [CLI-01]

# Metrics
duration: 5min
completed: 2026-06-15
---

# Phase 1 Plan 01: Foundation Summary

**Wave-0 fetch-stub test substrate plus the shared confirmGate (exit-code-3 gate) and a prerequisite_failed-aware error renderer — the foundation Plan 04's destructive verbs and the whole phase's test coverage build on.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-14T23:52:22Z
- **Completed:** 2026-06-14T23:56:44Z
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `test/helpers/mockFetch.mjs`: dependency-free `globalThis.fetch` stub that lets `apiFetch` run unchanged, captures the exact request (method/path/body/headers), serves FIFO canned responses, and fully restores global + config state on reset. Provides `stubToken` so `apiFetch` passes its auth guard without touching the real credential.
- `confirmGate(flags, preview)` + `printPreview(preview)` in `src/cli.mjs`: client-side gate returning `null` to proceed or exit `3` when `--confirm` is absent; gated path emits the `confirm_required: true` preview (`--json`) or a readable preview + no-write notice (human). Establishes the exit-code-3 taxonomy (D-07).
- `renderError(err)`: the single top-level catch now renders `prerequisite_failed` envelopes as `Blocked: <message>` + `Next: <next_action> -> <dashboard_url>` (D-06), with the prior fallback (incl. the 401 login hint) unchanged. Extracted as an exported helper so it is unit-testable now.
- `test/foundation.test.mjs`: 8 tests covering confirmGate (proceed/gate/json/human/no-fetch-when-gated) and the error renderer (prerequisite block + fallback + full `run()` path via the stub). Whole suite green.
- USAGE lifecycle group placeholder added (D-10) ready for Plan 04 verb enumeration.

## Task Commits

1. **Task 1: fetch-stub test helper (Wave 0)** - `0392ee0` (feat)
2. **Task 2: confirmGate + printPreview + exit-code-3** - `99616ae` (test, RED) → `23eb469` (feat, GREEN)
3. **Task 3: extend error catch + foundation tests** - `bca065a` (test, RED) → `fb9b57f` (feat, GREEN)

_TDD tasks committed RED then GREEN; no refactor commits needed (helpers were already small/focused)._

## Files Created/Modified
- `test/helpers/mockFetch.mjs` - Wave-0 fetch stub: installMockFetch/lastRequest/requests/resetMockFetch/stubToken.
- `test/foundation.test.mjs` - confirmGate + renderError + run()-path contract tests (8 tests).
- `src/cli.mjs` - added confirmGate, printPreview, renderError (exported); catch delegates to renderError; USAGE lifecycle group.
- `package.json` - added `test` script (`node --test "test/**/*.test.mjs"`).

## Decisions Made
- Extracted the catch into an exported `renderError(err)` (plan's preferred option) so the error path is testable without a destructive verb; the verbs in Plan 04 inherit it through the unchanged catch.
- `stubToken`/`resetMockFetch` snapshot-and-restore the real config so tests never leak `test-pat` into `~/.appo/config.json` (verified clean post-run).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `node --test test/` does not scan the directory under Node 22**
- **Found during:** Task 3 (running the full suite)
- **Issue:** The plan/VALIDATION quick-run command `node --test test/` (and `node --test test`) is parsed by Node 22 as a module spec, not a directory to scan, and errors with "Cannot find module .../test". Bare `node --test` (auto-discovery) also loads `test/helpers/mockFetch.mjs` as an implicit test file (harmless but noisy).
- **Fix:** Added a `test` script to `package.json` using the glob that reliably scans only test files: `node --test "test/**/*.test.mjs"`. `npm test` exits 0 with 8 tests; the glob excludes the helper.
- **Files modified:** package.json
- **Verification:** `npm test` → exit 0, 8 pass; `node --test "test/**/*.test.mjs"` → exit 0.
- **Committed in:** `fb9b57f` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** The intent (a green, reusable, dep-free test suite verifiable via `node --test`) is fully met; only the literal invocation string was adjusted to Node 22's CLI behavior via an npm script. No scope creep.

## Issues Encountered
None beyond the deviation above — the RED/GREEN gates behaved as expected (each RED failed on the missing export, each GREEN passed after implementation).

## TDD Gate Compliance
Tasks 2 and 3 followed RED → GREEN: `99616ae`/`bca065a` (test) precede `23eb469`/`fb9b57f` (feat). No unexpected RED-phase passes.

## Threat Surface
- T-01-01 (info disclosure via preview JSON): confirmGate/printPreview emit only passed `preview` keys; grep confirms 0 `token`/`bearer` references in the new helpers.
- T-01-02 (test helper alters real config): stubToken snapshots and resetMockFetch restores/clears; real `~/.appo/config.json` verified clean (no `test-pat`).
- T-01-03 (gate bypass): foundation test asserts confirmGate returns 3 and issues no fetch when gated.
- No new threat surface beyond the plan's register.

## Self-Check: PASSED
All 5 claimed files exist; all 5 task commits (0392ee0, 99616ae, 23eb469, bca065a, fb9b57f) present in git history.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 04 destructive verbs (publish/push/resubmit) can `import { confirmGate }` and gate before any POST; the unchanged catch already renders prerequisite_failed blocks.
- All later plans can `import { installMockFetch, lastRequest, resetMockFetch, stubToken }` to contract-test verbs against canned v1 responses.
- No blockers.

---
*Phase: 01-operator-command-parity*
*Completed: 2026-06-15*
