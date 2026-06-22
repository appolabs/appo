---
phase: 07-ship-intent-surface
plan: 03
subsystem: docs
tags: [docs, readme, llms, doc-lint, vitest, regression-guard]

# Dependency graph
requires:
  - phase: 07-01
    provides: "ship reshaped to create -> publish-intent; triggerBuild/pollBuild/realSleep removed; EXIT {shipped,gated,blocked}"
  - phase: 07-02
    provides: "apps update rescoped to name/url/icon; ops.setIcon; --meta-* removed from src + USAGE"
provides:
  - "README.md documents ship = create + publish-intent and apps update = name/url/icon (no build/poll/--timeout/--meta-* wording)"
  - "docs.test.mjs negative-assertion guards: README+llms.txt carry no removed flags; src/ has no triggerBuild/pollBuild"
  - "phase gate green: npm test (192) + lint + typecheck"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Doc-lint negative guards: expect(README).not.toContain(removed-flag) + not.toMatch(build-poll arrow) — flag-body drift fails CI, not just command-name drift"
    - "Static src/ guard in the doc-lint test: readFileSync(cli)+readFileSync(ops) asserted free of /triggerBuild|pollBuild/ (regression lock without a shell grep step)"

key-files:
  created:
    - .planning/phases/07-ship-intent-surface/07-03-SUMMARY.md
  modified:
    - README.md
    - test/integration/docs.test.mjs

key-decisions:
  - "llms.txt left unchanged: it is anchor/tagline-based (no --meta-*/--timeout/build-poll flag bodies) and its tagline already reads 'create, ship, publish, push' — no anchor points at a removed README section"
  - "ship --json description in README now names final_state in {shipped, gated, blocked} (failed/timeout dropped, matching 07-01's EXIT map)"
  - "ship exit-code prose simplified from '1 blocked or failed' to '1 blocked' in both the ship section and the exit-codes table (no build to fail)"

patterns-established:
  - "Negative-assertion doc-lint: command-NAME greps (positive) plus removed-flag/wording guards (negative) keep docs in lockstep with a rescoped surface"

requirements-completed: [SC-4]

# Metrics
duration: 6min
completed: 2026-06-22
---

# Phase 7 Plan 03: Docs Re-sync + Phase Gate Summary

**README.md now describes `ship` as create + publish-intent (Appo builds/submits server-side) and `apps update` as name/url/icon; `docs.test.mjs` gained negative-assertion guards that fail CI if `--meta-*`/`--timeout`/build-poll wording or `triggerBuild`/`pollBuild` reappear; the full phase gate (192 tests + lint + typecheck) is green.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-22T14:25:47Z
- **Completed:** 2026-06-22T14:31:49Z
- **Tasks:** 2
- **Files modified:** 2 (1 doc, 1 test)

## Accomplishments
- Rewrote the README.md `Ship` section: intro and quickstart now say create + publish-intent (Appo issues the build server-side and submits it); dropped the `--timeout <s>` flag and all "triggers a build, polls until ready" / "create → build → poll → publish" wording; added the `appo status <id>` / `appo preview <id>` tracking hint; `--json` description names `final_state` in `{shipped, gated, blocked}`; exit-code summary simplified to `0 shipped, 1 blocked, 2 usage, 3 gated`.
- Rewrote the README.md `Apps` section: `apps create` and `apps update` drop `--meta-name`/`--meta-desc`; `apps update` documents `--icon <https-url>` (https image URL fetched and set server-side via the icon endpoint), the PATCH-then-icon ordering, and the conditional `--json` body (`null` for name/URL-only, `{ icon_url }` when an icon was set). The "rebuild and republish" callout is reframed to publish-intent voice.
- Updated the exit-codes prose (`1 blocked or failed` → `1 blocked`).
- Left `llms.txt` unchanged — verified it is anchor/tagline-based with no removed flag bodies and no anchor pointing at a removed section; its tagline already reads "create, ship, publish, push".
- Added two named guard tests to `test/integration/docs.test.mjs`: `README drops removed flags/wording` (README+llms.txt contain no `--meta-name`/`--meta-desc`/`--timeout` and no `create→build→poll→publish` arrow) and `src/ has no build-trigger code paths` (`cli.mjs`+`ops.mjs` free of `triggerBuild`/`pollBuild`).
- Ran the full phase gate: `npm test` (192/0), `npm run lint`, `npm run typecheck` all green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite README.md ship/apps sections** - `f94ecc0` (docs)
2. **Task 2: Add docs.test.mjs negative guards; run phase gate** - `1b07ec5` (test)

**Plan metadata:** see final docs commit (this SUMMARY + STATE + ROADMAP).

## Files Created/Modified
- `README.md` - Ship section rewritten to publish-intent (no build/poll/`--timeout`); Apps section rescoped to name/url/icon (`--icon` documented, `--meta-*` removed); exit-code prose simplified.
- `test/integration/docs.test.mjs` - Added two negative-assertion regression guards (39 → 41 tests).

## Decisions Made
- Left `llms.txt` untouched: confirmed via grep it carries no `--meta-*`/`--timeout`/build-poll flag bodies and no anchor references a removed README section (it links to stable section anchors that still exist). Editing it would have been a no-op.
- README `ship --json` now states `final_state` in `{shipped, gated, blocked}`, matching 07-01's reduced EXIT map (dropped `failed`/`timeout`).

## Deviations from Plan

None - plan executed exactly as written. The plan anticipated llms.txt might need a re-sync only "if any anchor/tagline drifts"; verification showed none did, so no llms.txt edit was required (the guard test still asserts llms.txt contains no removed flags, which holds).

## TDD Gate Compliance
Neither task was `tdd="true"`. Task 1 is a docs edit (no test gate); Task 2 adds doc-lint guard tests and runs the phase gate. The negative guards are themselves the regression lock for SC-2/SC-3; they pass against the already-final `src/` and the rewritten README. No RED/GREEN/REFACTOR sequence applies to a doc-lint plan.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SC-4 satisfied: README.md documents the rescoped surface (ship = publish-intent; apps update = name/url/icon) with no build/poll/`--timeout`/`--meta-*` wording; `docs.test.mjs` has negative-assertion guards; `npm test` (192/0) + `npm run lint` + `npm run typecheck` all green.
- Phase 07 (ship-intent-surface) is complete: SC-1/SC-2 (07-01), SC-3 (07-02), SC-4 (07-03). The regression guards lock the SC-2/SC-3 removals against reintroduction.

## Self-Check: PASSED

- Files: README.md and test/integration/docs.test.mjs present and modified; SUMMARY present.
- Commits: f94ecc0 (Task 1), 1b07ec5 (Task 2) both in git log.
- Gate: npm test 192/0, lint green, typecheck green.
- Guards: `README drops removed flags/wording` and `src/ has no build-trigger code paths` both green (verbose reporter confirmed); `! grep -n "meta-name\|meta-desc\|--timeout" README.md llms.txt` and `! grep -rn "triggerBuild\|pollBuild" src/` both return nothing; `grep -nF "[--icon <https-url>]" README.md` matches.

---
*Phase: 07-ship-intent-surface*
*Completed: 2026-06-22*
