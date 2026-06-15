---
phase: 01-operator-command-parity
verified: 2026-06-15T00:00:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 1: Operator command parity Verification Report

**Phase Goal:** The CLI exposes the full publishing-operator surface (create already shipped) — build, publish, status, push, configure, rejection/fix-recipe, resubmit — at parity with the `/mcp` AppoServer tools and `/api/v1`.
**Verified:** 2026-06-15
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP Success Criterion) | Status | Evidence |
|---|-----------------------------------|--------|----------|
| 1 | `appo build\|status\|publish\|push\|configure\|rejection\|fix-recipe\|resubmit` exist and call the correct v1 endpoints (parity with the 10 AppoServer MCP tools — incl. `trigger_resubmission`) | ✓ VERIFIED | All 8 `case '<verb>'` present in `src/cli.mjs` (lines 261/302/316/332/346/362 + status sub-modes); each v1 path matches the D-01 mapping exactly (see Key Links table). `resubmit` (the 10th tool, `trigger_resubmission`) → `POST /api/v1/apps/{id}/resubmit` (line 354). `status --build` covers `get_build_status` as the 10th read tool. |
| 2 | Destructive commands (publish/push/resubmit) require `--confirm`; without it print the preview and perform NO write (exit 3) | ✓ VERIFIED | Live: `publish 7`, `resubmit 7` printed preview + `(no write performed)` + exit 3; `--json` emitted `{...,"confirm_required":true}` + exit 3. Code: each verb calls `confirmGate()` and returns its code before any POST (lines 338/348/366). Tests assert `requests.length === 0` for all three (T-01-13, destructive-verbs.test.mjs:63/129/183). |
| 3 | Every command supports `--json` and returns documented exit codes (0/1/2/3) | ✓ VERIFIED | `--json` branches present in all read/write verbs (status/rejection/fix-recipe/build/configure/publish/push/resubmit). USAGE documents 0/1/2/3 (lines 34-39). Live exit codes confirmed: 2 (missing args, bad `--api`, unknown cmd), 3 (confirm-gated). Tests pin method+path+body+`--json` passthrough for every verb (58/58 green). |
| 4 | `appo --help` and per-command help enumerate all commands and flags | ✓ VERIFIED | Live `appo --help` lists all 8 lifecycle verbs + auth + apps groups + flags + exit codes. Missing-arg branches print per-command usage with flags (e.g. `push` usage live). help.test.mjs asserts all 8 verbs enumerated. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/cli.mjs` | All 8 lifecycle verb cases + confirmGate + printers + USAGE | ✓ VERIFIED | 388 lines; all cases present, confirmGate (142), printers (printBuild/printRejection/printRecipe/printPreview), renderError envelope handling. Wired via `run()` → `bin/appo.mjs`. |
| `test/helpers/mockFetch.mjs` | fetch stub capturing method/path/body | ✓ VERIFIED | Used by all 4 verb suites (read/write/destructive/foundation). |
| `test/foundation.test.mjs` | confirmGate exit-3 + prerequisite render tests | ✓ VERIFIED | Present, passing. |
| `test/read-verbs.test.mjs` | status/rejection/fix-recipe contract tests | ✓ VERIFIED | Present, passing. |
| `test/write-verbs.test.mjs` | build/configure contract tests | ✓ VERIFIED | Present, passing. |
| `test/destructive-verbs.test.mjs` | publish/push/resubmit gate + POST + block tests | ✓ VERIFIED | No-write assertions + credential-block (CUSTOMER_ASC_CREDENTIAL_MISSING) test present, passing. |
| `test/help.test.mjs` | enumerates all 8 verbs + exit codes | ✓ VERIFIED | Present, passing. |

### Key Link Verification (D-01 command → v1 endpoint mapping)

| Command | v1 endpoint (code) | D-01 expected | Status |
|---------|--------------------|---------------|--------|
| `status <id>` | `GET /api/v1/apps/{id}` (265) | same | ✓ WIRED |
| `status <id> --build` | `GET /api/v1/apps/{id}/builds/{build}` (264) | same | ✓ WIRED |
| `build <id>` | `POST /api/v1/apps/{id}/builds` (307) | same | ✓ WIRED |
| `rejection <id>` | `GET /api/v1/apps/{id}/rejection` (276) | same | ✓ WIRED |
| `fix-recipe <id>` | `GET /api/v1/apps/{id}/rejection/recipe` (290) | same | ✓ WIRED |
| `configure <id>` | `PATCH /api/v1/apps/{id}` (326) | same | ✓ WIRED |
| `publish <id>` | `POST /api/v1/apps/{id}/publish` `{app_stores}` (340) | same | ✓ WIRED |
| `push <id>` | `POST /api/v1/apps/{id}/push-notifications` (372) | same | ✓ WIRED |
| `resubmit <id>` | `POST /api/v1/apps/{id}/resubmit` (354) | same | ✓ WIRED |
| publish/push/resubmit | `confirmGate(flags, preview)` before POST | gate before write | ✓ WIRED |
| push | `res.recipients_count` (sibling of data) | read off raw envelope | ✓ WIRED |
| catch block | `prerequisite_failed` → next_action + dashboard_url | actionable block | ✓ WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Help lists 8 verbs | `node bin/appo.mjs --help` | all 8 lifecycle verbs printed | ✓ PASS |
| publish gate (human) | `publish 7 --stores apple_appstore` | preview + "no write performed" + exit 3 | ✓ PASS |
| publish gate (json) | `publish 7 --stores apple --json` | `confirm_required:true` json + exit 3 | ✓ PASS |
| resubmit gate | `resubmit 7` | credential note preview + exit 3 | ✓ PASS |
| usage error | `push 7` | per-command usage + exit 2 | ✓ PASS |
| WR-01 regression | `status 7 --api` (bare) | "--api requires a value" + exit 2 (not crash) | ✓ PASS |
| unknown command | `frobnicate` | usage + exit 2 | ✓ PASS |
| Test suite | `npm test` | 58/58 pass, 0 fail | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CLI-01 | 01-01/02/03/04 | Operator command parity — 8 verbs, confirm-gated destructive, `--json` + exit codes | ✓ SATISFIED | All 4 success criteria verified; REQUIREMENTS.md line 5 marked `[x]`, Traceability table maps CLI-01 → Phase 1. No orphaned requirements for this phase. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/cli.mjs` | 143 | `return null` | ℹ️ Info | False positive — confirmGate "proceed" sentinel, not a stub. Code path documented and tested. No impact. |

No TODO/FIXME/PLACEHOLDER/empty-handler patterns found. The two REVIEW.md warnings: WR-01 (bare `--api` crash) is FIXED and regression-verified live (exit 2, not TypeError); WR-02 (`--key=value` / `--` sentinel for values starting with `--`) is a minor argument-parsing robustness gap, not part of any success criterion and not goal-blocking. The four Info items (IN-01..04) are minor hardening notes that do not affect goal achievement.

### Human Verification Required

None. All four success criteria are programmatically verifiable: endpoint parity by code grep + contract tests, the confirm-gate by live exit-3 behavior (no backend needed — the gate fires before any fetch), `--json`/exit codes by live invocation, and help by live output. No visual, real-time, or external-service behavior is in scope for this phase (live backend integration would belong to end-to-end testing, not the CLI parity contract).

### Gaps Summary

No gaps. All 8 lifecycle verbs exist, call the exact v1 endpoints from the D-01 mapping (including `resubmit`/`trigger_resubmission`, the 10th MCP tool, with `status --build` covering `get_build_status`), enforce the client-side confirm gate with exit 3 and zero writes, support `--json` verbatim passthrough, document and return the 0/1/2/3 exit taxonomy, and enumerate the full surface in `--help` and per-command usage. The test suite (58 tests) is green and pins method/path/body for every verb plus the no-write guarantee for all three destructive commands. CLI-01 is fully satisfied.

---

_Verified: 2026-06-15_
_Verifier: Claude (gsd-verifier)_
