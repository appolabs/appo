---
phase: 01-operator-command-parity
plan: 04
subsystem: cli
tags: [destructive-verbs, confirm-gate, publish, push, resubmit, exit-code-3, help, usage, tdd]

# Dependency graph
requires:
  - phase: 01-01 (foundation)
    provides: confirmGate (exit-3 client-side gate) + printPreview, renderError (prerequisite_failed -> Blocked + next_action/dashboard_url), mockFetch substrate (installMockFetch/lastRequest/requests/resetMockFetch/stubToken), USAGE lifecycle placeholder
  - phase: 01-03 (write verbs)
    provides: optional-flags->body idiom, --json verbatim short-circuit, latest src/cli.mjs (build/configure cases) — Wave 4 to avoid the shared-file conflict
  - phase: bootstrap (MVP)
    provides: src/cli.mjs switch dispatcher, src/api.mjs apiFetch (POST 204->null, err.status/err.envelope)
provides:
  - "src/cli.mjs case 'publish' — confirmGate before POST /api/v1/apps/{id}/publish {app_stores:[...]} (204); friendly apple/google aliases -> canonical tokens; --json -> null"
  - "src/cli.mjs case 'resubmit' — confirmGate (Apple-credential preview note) before POST /api/v1/apps/{id}/resubmit (no body, 200); CUSTOMER_ASC_CREDENTIAL_MISSING rides shared renderError as a Blocked state"
  - "src/cli.mjs case 'push' — confirmGate (count-omitted preview) before POST /api/v1/apps/{id}/push-notifications {title,body,...} (201); reads recipients_count off the envelope sibling"
  - "src/cli.mjs USAGE — all 8 lifecycle verbs grouped auth/apps/lifecycle + documented exit codes 0/1/2/3 (D-10/D-07)"
  - "test/destructive-verbs.test.mjs — 20 contract tests pinning the gate (no write without --confirm), POST bodies, recipients_count render, credential block"
  - "test/help.test.mjs — 4 tests asserting --help enumerates all 8 verbs + the exit-code block"
affects: [02-ship]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Destructive-verb idiom: usage-guard (exit 2) -> confirmGate(flags, preview) -> `if (gated !== null) return gated` BEFORE any apiFetch -> POST -> --json verbatim short-circuit -> human render. The gate is the single client-side defense (D-04/D-05)."
    - "Preview-payload discipline: publish carries target_stores; push OMITS the recipient count (Pitfall 2 — no pre-send audience leak); resubmit carries the Apple-credential note. Wording kept near the MCP tool previews for cross-surface consistency."
    - "recipients_count is read off the raw 201 envelope (sibling of `data`), NOT unwrap(res) (PATTERNS line 207-208)."

key-files:
  created:
    - test/destructive-verbs.test.mjs
    - test/help.test.mjs
  modified:
    - src/cli.mjs

key-decisions:
  - "publish accepts comma-separated --stores and maps friendly aliases apple->apple_appstore, google->google_playstore (RESEARCH Open Q1); unknown tokens pass through verbatim and are rejected server-side (422) — the CLI never silently drops or invents store targets (T-01-14)."
  - "resubmit sends NO body (apiFetch called without the 4th arg -> Content-Type omitted; mock records body:null); the 422 prerequisite hard-fail is NOT caught locally — it rides the shared renderError so the API stays the authority (D-06, no client-side credential/state re-implementation)."
  - "push preview omits recipients_count (Pitfall 2) — v1 exposes the count only post-send; the count is read from the success envelope only after an explicit --confirm send."
  - "USAGE regrouped into Auth/Apps/Lifecycle (D-10) and given an Exit codes block documenting 0/1/2/3 (D-07); --json and --confirm added to Options. Help text kept neutral (CLAUDE.md repo-doc voice)."

patterns-established:
  - "The destructive trio shares one gate contract: confirmGate returns 3 (gated, preview shown, no fetch) or null (proceed). Tests assert requests.length===0 on every no-confirm path — a regression that fires a POST without --confirm fails the suite (T-01-13)."

requirements-completed: [CLI-01]

# Metrics
duration: 6min
completed: 2026-06-15
---

# Phase 1 Plan 04: Destructive Verbs (publish / push / resubmit) + Help Summary

**The security-critical slice: the three destructive verbs (`publish`→204, `push`→201, `resubmit`→200), each guarded by the Plan 01 client-side `confirmGate` so that without `--confirm` they print the MCP-aligned preview, perform NO write, and exit 3; with `--confirm` they issue the exact v1 POST. `resubmit`'s CUSTOMER_ASC_CREDENTIAL_MISSING hard-fail rides the shared `renderError` as an actionable Blocked state; `push` reads `recipients_count` off the 201 envelope sibling. The `USAGE`/help surface is finalized — all 8 lifecycle verbs grouped + documented exit codes (D-10/D-07).**

## Performance

- **Duration:** ~6 min
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- `case 'publish'` in `src/cli.mjs`: usage-guard (missing id/stores → exit 2) → maps `--stores` comma list (with `apple`/`google` aliases → canonical `apple_appstore`/`google_playstore`) → `confirmGate` (exit 3, no write without `--confirm`) → `POST /api/v1/apps/{id}/publish { app_stores: [...] }` (204) → `null` for `--json` or "Publication started" human line. 409 conflict propagates to the shared catch.
- `case 'resubmit'`: usage-guard → `confirmGate` with the Apple-credential preview note → `POST /api/v1/apps/{id}/resubmit` (NO body, 200). The 422 `prerequisite_failed`/`CUSTOMER_ASC_CREDENTIAL_MISSING` is left to propagate to `renderError`, which prints `Blocked: <message>` + `Next: <next_action> -> <dashboard_url>` (D-06).
- `case 'push'`: usage-guard (missing id/title/body → exit 2) → `confirmGate` with a **count-omitted** preview (Pitfall 2) → builds the body from `--title`/`--body` (+ optional `--target-url`/`--image-path`/`--scheduled-at`) → `POST /api/v1/apps/{id}/push-notifications` (201). Human render reads `res.recipients_count` off the envelope sibling ("Sent to N device(s)."); `--json` prints the whole envelope verbatim.
- `USAGE` finalized: regrouped into **Auth / Apps / Lifecycle** with all 8 lifecycle verbs and their flags enumerated, plus an **Options** note for `--json`/`--confirm` and an **Exit codes** block documenting `0`/`1`/`2`/`3` (D-10/D-07).
- `test/destructive-verbs.test.mjs` (20 tests) and `test/help.test.mjs` (4 tests): the no-confirm gate (`requests.length===0` + exit 3 + preview) for all three verbs, the exact POST bodies on `--confirm`, alias mapping, the credential block, `recipients_count` render, `--json` verbatim, and the help surface. Full suite: **57 pass / 0 fail**.

## Task Commits

1. **Task 1: publish + resubmit (TDD)** — `8bc6a5d` (test, RED) → `20648b1` (feat, GREEN)
2. **Task 2: push (TDD)** — `20c182f` (test, RED) → `b58c574` (feat, GREEN)
3. **Task 3: finalize USAGE/help + help tests** — `63fb3fc` (feat)

_Tasks 1 and 2 are TDD (RED then GREEN). Task 3 is non-TDD (finalizes the help surface and adds the help tests in one commit — the destructive tests were already authored in the Task 1/2 RED commits)._

## Files Created/Modified
- `test/destructive-verbs.test.mjs` — 20 contract tests for publish/push/resubmit (gate, POST bodies, alias mapping, credential block, recipients_count, --json, usage errors).
- `test/help.test.mjs` — 4 tests asserting `--help` enumerates all 8 lifecycle verbs + the exit-code taxonomy.
- `src/cli.mjs` — added `case 'publish'`, `case 'resubmit'`, `case 'push'`; finalized the `USAGE` constant (grouped + exit codes).

## Decisions Made
- publish maps `apple`/`google` aliases to canonical tokens for ergonomics; the body always sends canonical `AppStore` enum strings; unknown tokens pass through to be rejected server-side (T-01-14).
- resubmit sends no request body and does not catch its prerequisite hard-fail locally — it rides the shared `renderError` (D-06, API-is-authority).
- push preview omits `recipients_count` (Pitfall 2); the count is read from the 201 envelope sibling only after an explicit `--confirm` send.
- `USAGE` regrouped Auth/Apps/Lifecycle + Exit codes block (D-10/D-07); neutral repo-doc voice.

## Deviations from Plan
None — the three `case` blocks match the EXACT code in the plan/PATTERNS/RESEARCH; the only additive change beyond the cases is the USAGE finalization (D-10), which the plan's Task 3 mandates.

## Issues Encountered
None. RED behaved as expected: on each TDD task the behavior tests failed at RED while the missing-arg exit-2 guards (and the trivially-passing "preview omits count" assertion against the default-case USAGE output) passed early — the same expected overlap with the default `return 2`/USAGE path noted in Plans 02/03, not a gate violation.

## TDD Gate Compliance
- Task 1: RED `8bc6a5d` (test) precedes GREEN `20648b1` (feat).
- Task 2: RED `20c182f` (test) precedes GREEN `b58c574` (feat).
- No unexpected RED-phase passes among verb-behavior tests; the exit-2 guard tests passing at RED is expected (exit 2 is shared with the default case).

## Threat Surface
- **T-01-13 (EoP — gate on the destructive trio, PRIMARY HIGH-SEVERITY):** mitigated. `const gated = confirmGate(...); if (gated !== null) return gated;` runs BEFORE any `apiFetch` in all three verbs. Tests assert `requests.length===0` on every no-confirm path; verified live (`publish`/`resubmit` against an unreachable api still exit 3 with no connection attempt).
- **T-01-14 (Tampering — --stores token mapping):** mitigated. Aliases map to canonical tokens; unknown tokens pass through to server-side 422; the CLI never drops/invents targets.
- **T-01-15 (Info disclosure — push count/preview):** mitigated. The no-confirm preview omits the recipient count (verified — output contains neither `recipients_count` nor the count value); the count is read only from the post-`--confirm` 201 envelope. No PAT in preview/output.
- **T-01-16 (Info disclosure — resubmit credential block):** accepted per register. The block prints the server-provided message + public `dashboard_url` + `next_action` — all non-secret; `--json` stays verbatim.
- **T-01-17 (Repudiation — confirmation signal):** mitigated. Exit code 3 (distinct from 1) is documented in `--help`, giving CI/Phase 2 `ship` an auditable "write intentionally withheld" signal (D-07).
- No PAT/Bearer reference in the new verb/preview code paths (grep of `src/cli.mjs` lines 325-369 is clean; the only token references are the pre-existing logout/whoami credential-management lines and the help text).
- No new threat surface beyond the plan's register.

## Self-Check: PASSED
- `test/destructive-verbs.test.mjs`, `test/help.test.mjs` exist; `src/cli.mjs` modified (greps: `case 'publish'`, `case 'resubmit'`, `case 'push'`, `app_stores`, `/push-notifications`, `recipients_count` all present).
- Commits present in git history: `8bc6a5d`, `20648b1`, `20c182f`, `b58c574`, `63fb3fc`.
- `npm test` → 57 pass / 0 fail (33 prior + 20 destructive + 4 help).
- `node bin/appo.mjs --help` → exit 0, lists all 8 lifecycle verbs + exit codes.
- `node bin/appo.mjs publish 7 --stores apple_appstore` (no --confirm) → exit 3, preview, no network.

## User Setup Required
None.

## Next Phase Readiness
- All 8 operator verbs now exist at v1 parity with documented exit codes and a complete help surface — Phase 1 (operator-command-parity, CLI-01) is functionally complete.
- Phase 2 `ship` can drive `build` → poll `status --build` → `publish --confirm` (the gate exit-3 signal lets `ship` distinguish a blocked gate from a real failure); each verb's core is a thin callable POST.
- No blockers.

---
*Phase: 01-operator-command-parity*
*Completed: 2026-06-15*
