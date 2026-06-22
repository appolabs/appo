---
phase: 07-ship-intent-surface
plan: 02
subsystem: api
tags: [cli, apps-update, set-icon, two-call-dispatch, vitest, esm]

# Dependency graph
requires:
  - phase: 07-01
    provides: "build transport removed; createApp reduced to {name, base_url}; case 'ship' reshaped"
  - phase: apps-web-app/190-user-config-icon-url-name
    provides: "v1 PATCH locked to name+base_url; POST /api/v1/apps/{app}/icon contract (icon_url in, {icon_url} out; server-side SSRF guard)"
provides:
  - "ops.setIcon(apiBase, id, icon_url, env) -> POST /api/v1/apps/{id}/icon, flat { icon_url } response, no unwrap"
  - "apps update rescoped to name/url/icon; --meta-name/--meta-desc removed (CLI + USAGE help)"
  - "two-call dispatch: PATCH (name/url) runs before POST /icon (D-04); PATCH-only --json stays null, icon-bearing emits { icon_url }"
affects: [07-03 (README/llms.txt/docs re-sync)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Flat-response op: setIcon mirrors publishApp's transport shape but returns the raw apiFetch body (no unwrap), read res.icon_url at the call site (getPreview precedent)"
    - "Two-call write dispatch: a single apps update may issue PATCH then POST /icon in order; no transaction (a PATCH throw skips the icon call)"
    - "Empty-value flag guard: typeof flags.icon === 'string' && flags.icon makes a bare --icon a usage error (exit 2), no empty POST"

key-files:
  created: []
  modified:
    - src/ops.mjs
    - src/cli.mjs
    - test/integration/write-verbs.test.mjs

key-decisions:
  - "apps update --json: PATCH-only stays `null` (204 contract, Pitfall 5); emit { icon_url } only when the icon ran (CONTEXT A2 default adopted)"
  - "icon 422 rides renderError's else-branch (Error: <message>, exit 1) — NOT prerequisite_failed; no new error plumbing"
  - "zero client-side icon validation: the raw URL is passed to the server; ALL SSRF/https/mime/size enforcement is server-side (T-07-04 transfer)"
  - "USAGE help block (lines 33/36) metadata wording removed in this plan (flagged in 07-01 as 07-02/07-03 scope); README/llms.txt re-sync deferred to 07-03"

patterns-established:
  - "setIcon: flat-response transport op (no unwrap) modeled on publishApp + getPreview"
  - "apps update: PATCH-first two-call dispatch with conditional --json body shape"

requirements-completed: [SC-3]

# Metrics
duration: 2min
completed: 2026-06-22
---

# Phase 7 Plan 02: apps update Rescope + ops.setIcon Summary

**`appo apps update` rescoped to name/url/icon: a new flat-response `ops.setIcon` POSTs the icon to its own `/api/v1/apps/{id}/icon` route, the two metadata flags are removed, and when both content and `--icon` are given the PATCH runs before the icon POST.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-22T14:20:56Z
- **Completed:** 2026-06-22T14:23:11Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `ops.setIcon(apiBase, id, icon_url, env)` to `src/ops.mjs` — `POST /api/v1/apps/{id}/icon` with body `{ icon_url }`, returning the flat `{ icon_url }` body without `unwrap` (modeled on `publishApp`'s transport shape + `getPreview`'s flat-response handling).
- Rescoped the `apps update` branch in `src/cli.mjs`: maps only `--name`/`--url` to the `PATCH /api/v1/apps/{id}` body and `--icon` to `ops.setIcon`. Two-call dispatch runs PATCH first, then the icon POST (D-04). An empty-value guard (`typeof flags.icon === 'string' && flags.icon`) makes a bare `--icon` a usage error.
- Dropped all `--meta-name`/`--meta-desc` mappings and the corresponding USAGE help wording (lines 33/36) and the `apps update` usage string; `apps create` already passed only `{name, base_url}` (07-01).
- `--json` body shape preserved: a PATCH-only update still prints `null` (Pitfall 5); an icon-bearing update prints `{ icon_url }`.
- Reshaped `test/integration/write-verbs.test.mjs`: deleted the two `--meta-*` mapping tests, added the `captureAll` helper, and added `--icon` happy-path, `--icon` 422 SSRF-reject (exit 1, message surfaced via `renderError`'s else-branch), and PATCH-then-icon ordering tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ops.setIcon; rescope apps update; drop metadata wording** - `d82dfb6` (feat)
2. **Task 2: Reshape write-verbs.test.mjs (--icon happy/422/ordering; drop --meta-*)** - `9cc1924` (test)

**Plan metadata:** see final docs commit (this SUMMARY + STATE + ROADMAP).

## Files Created/Modified
- `src/ops.mjs` - Added `setIcon` (flat response, no unwrap) after `getPreview`.
- `src/cli.mjs` - `apps update` rescoped to name/url/icon with PATCH-first two-call dispatch; `--meta-*` mappings, usage string, and USAGE help wording removed; ship create-step comment de-metadata'd.
- `test/integration/write-verbs.test.mjs` - Dropped two `--meta-*` tests; added `captureAll`; added `--icon` happy/422/ordering coverage (7 tests total).

## Decisions Made
- Adopted the CONTEXT A2 discretion default for the combined-call `--json` shape: `null` for PATCH-only, `{ icon_url }` when the icon ran.
- Removed the metadata wording from the USAGE help block in this plan (07-01's SUMMARY flagged lines 33/36 as 07-02/07-03 scope); the broader README/llms.txt re-sync stays in 07-03.

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] Removed USAGE help-block metadata wording**
- **Found during:** Task 1 acceptance check (`! grep -n "meta-name|meta-desc|metadata" src/cli.mjs`).
- **Issue:** The plan's Task 1 acceptance criterion requires no metadata references in `src/cli.mjs`, but the USAGE help block (lines 33/36) and the ship create-step comment still carried `--meta-name`/`--meta-desc`/"metadata" wording. RESEARCH Pitfall 4 and the 07-01 SUMMARY both flag these as in-scope for 07-02/07-03.
- **Fix:** Updated the two USAGE help lines to the new surface (`apps create --name --url`; `apps update ... [--icon <https-url>]`) and reworded the ship create-step comment to avoid the dead term.
- **Files modified:** src/cli.mjs
- **Commit:** d82dfb6

## TDD Gate Compliance
Task 2 is `tdd="true"`. Because Task 1 (a `feat` source change) preceded the test reshape per the plan's task order, the RED state was the pre-existing two `--meta-*` tests failing against the new source (`lastRequest()` null — a bare `--meta-name` no longer maps to a request), confirmed before reshaping. The reshaped tests encode the new contract and went GREEN immediately. There is no separate `test(...)` RED commit ahead of a `feat(...)` GREEN commit because the deletion-first rescope inverts that order; the new behavior was implemented in `d82dfb6` (feat) and the contract was encoded in `9cc1924` (test). Full gate green (190 tests, lint, typecheck).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SC-3 satisfied: `apps update <id>` accepts only `--name`/`--url`/`--icon`; `--meta-*` removed (source + tests + USAGE); `--icon` dispatches `ops.setIcon` -> `POST /api/v1/apps/{id}/icon`; both-given runs PATCH first; icon 422 exits 1 via `renderError`.
- Ready for 07-03 (README.md / llms.txt re-sync, `docs.test.mjs` negative assertions). Note: USAGE help in `src/cli.mjs` is already on the new surface; README/llms.txt still carry the old `--meta-*`/build-poll wording and are 07-03 scope.

## Self-Check: PASSED

- Files: src/ops.mjs, src/cli.mjs, test/integration/write-verbs.test.mjs present and modified.
- Commits: d82dfb6 (Task 1), 9cc1924 (Task 2) both in git log.
- Gate: npm test 190/0, lint green, typecheck green.
- SC-3 guards: `grep -n "export async function setIcon" src/ops.mjs` matches; `! grep -n "meta-name\|meta-desc\|metadata" src/cli.mjs` returns nothing; named tests `icon POSTs` / `SSRF reject` / `PATCH then POST` all green.

---
*Phase: 07-ship-intent-surface*
*Completed: 2026-06-22*
