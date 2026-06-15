---
phase: 02-appo-ship-orchestrated-lifecycle-killer-feature
verified: 2026-06-15T04:00:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  note: initial verification
---

# Phase 2: appo ship — orchestrated lifecycle (KILLER FEATURE) Verification Report

**Phase Goal:** A single command takes an app from zero to submitted — `appo ship --url <u> --name <n>` (or `appo ship <id>`) runs create → trigger build → poll status → publish, streaming each step and stopping cleanly on the first step that needs human input, reusing the Phase 1 command implementations (no duplicated API logic).
**Verified:** 2026-06-15T04:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `appo ship` runs create→build→poll→publish end to end, reusing Phase 1 implementations (no duplicated API logic) | ✓ VERIFIED | `case 'ship'` (cli.mjs:462-555) composes `ops.createApp` (494), `ops.triggerBuild` (508), `ops.getBuild` via `pollBuild` (523→205), `ops.publishApp` (550). Zero `apiFetch(` and zero `confirmGate(` calls inside the ship case (grep count 0/0). All five lifecycle requests have ONE definition in src/ops.mjs. unwrap has a single definition (ops.mjs:9 only). |
| 2 | Progress streamed step-by-step; publish honors the confirm-gate (no POST without `--yes`/`--confirm`, exit 3) or executes with `--yes` | ✓ VERIFIED | `shipReport` ledger streams live `log()` lines per step (cli.mjs:501,515,525,529,536,539,548,553). Gate decision reimplemented `wantYes = flags.yes \|\| flags.confirm` (475); `if (!wantYes)` records `gated` + `return finish('gated', EXIT.gated)` (3) with NO publish POST (543-546). Tests assert exit 3 AND `requests.filter(/\/publish$/).length === 0` (ship.test.mjs:126,188). |
| 3 | Stops with a clear, actionable message on the first blocking step — never a raw error or silent half-finish | ✓ VERIFIED | build failed → `appo fix-recipe`/`rejection` hint, exit 1 (527-531). prerequisite_failed at build-trigger → `handleBlock` → renderError Blocked/Next (human) or ledger record (`--json`), app_id surfaced for resume (509-511). poll timeout → `appo status <id> --build <buildId>` AND `appo status <id>`, exit 1 (532-538). Tests cover each (ship.test.mjs build-failed/timeout/prerequisite). |
| 4 | `--json` emits one `{steps,final_state}` object; exit code reflects final lifecycle state (0/3/1/2) | ✓ VERIFIED | `finish()` emits exactly one `JSON.stringify({steps,final_state})` under `--json` (cli.mjs:231). EXIT map `{shipped:0,gated:3,blocked:1,failed:1}` (237); usage error returns 2 before any step (469). `node bin/appo.mjs ship` and `ship --json` both exit 2. `--json` one-object test parses a single line, asserts final_state (ship.test.mjs). |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/ops.mjs` | Thin transport layer: createApp, triggerBuild, getApp, getBuild, publishApp, unwrap | ✓ VERIFIED | 42 lines, all six exports present, imports only apiFetch. publishApp returns raw (no unwrap). unwrap single definition. |
| `src/cli.mjs` (ops refactor) | Phase 1 create/build/publish on ops; inline apiFetch deleted; ops imported | ✓ VERIFIED | `import * as ops` + `import { unwrap }` (4-5). create→ops.createApp (290), build human→ops.triggerBuild (392), publish→ops.publishApp (423). build `--json` and status retain raw-envelope apiFetch carve-out (intentional). |
| `src/cli.mjs` (ship case) | case 'ship' orchestrator + pollBuild (exported) + shipReport + parseStores + EXIT + USAGE | ✓ VERIFIED | All present: case 'ship' (462), exported pollBuild (199), shipReport (226), parseStores (216), EXIT (237). USAGE lists both ship forms + flags. |
| `test/ship.test.mjs` | Full ship surface coverage, ≥120 lines, FIFO stub + injectable sleep | ✓ VERIFIED | 16 `test()` cases (≥9 required) covering ordering, skip-create, build-failed, timeout, gate-no-POST, prerequisite block, usage-exit-2, --json ledger (shipped+gated), pollBuild ready/failed/timeout, plus WR-01/WR-02 regression tests. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| case 'ship' | ops.createApp/triggerBuild/publishApp | direct op calls | ✓ WIRED | cli.mjs:494,508,550 — no apiFetch, no switch re-entry, no shell-out |
| pollBuild | ops.getBuild | injectable-sleep loop, terminal ready/failed | ✓ WIRED | cli.mjs:205; terminal matches only `=== 'ready'`/`=== 'failed'` (208-209) |
| ship publish step | printPreview + reimplemented gate | wantYes + printPreview, NOT confirmGate | ✓ WIRED | cli.mjs:542-546; confirmGate count in ship case = 0 |
| Phase 1 verbs | ops layer | refactored onto ops, inline apiFetch deleted | ✓ WIRED | create/build(human)/publish route through ops; single request definition |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| case 'ship' | appId, buildId, build.status, res.outcome | ops.createApp/triggerBuild/getBuild (real apiFetch over /api/v1) | Yes — drives step records + stream lines + exit code | ✓ FLOWING |
| --json ledger | steps[], final_state | shipReport.record() from each live step | Yes — one object emitted at finish() | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite green | `npm test` | 80 pass / 0 fail (~416ms) | ✓ PASS |
| Usage guard before HTTP | `node bin/appo.mjs ship` | exit 2 | ✓ PASS |
| --json usage guard | `node bin/appo.mjs ship --json` | exit 2 | ✓ PASS |
| Help lists ship | `node bin/appo.mjs --help | grep ship` | both ship forms listed | ✓ PASS |
| No apiFetch in ship case | grep ship case | 0 | ✓ PASS |
| No confirmGate in ship case | grep ship case | 0 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CLI-06 | 02-01, 02-02 | `appo ship` — one command create→build→status(poll)→publish, streamed, reuses CLI-01 impls, stops on first block | ✓ SATISFIED | All 4 SCs verified; REQUIREMENTS.md marks CLI-06 [x]; ship composes the shared ops layer reused by the Phase 1 verbs |

No orphaned requirements: REQUIREMENTS.md maps only CLI-06 to Phase 2, and both plans declare it.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/cli.mjs | 515 | `build.status` read without `build || {}` guard | ℹ️ Info | Latent only — line 513 already guards `(build || {}).id`; an empty 2xx build body would make `build.status` throw, caught by top-level renderError (exit 1, not silent). WR-01 test (empty body) exercises the create path and resolves to a controlled exit 1. Not goal-blocking. |

No blocker or warning anti-patterns. No TODO/FIXME/placeholder/stub returns in the ship surface. PAT never logged in any stream/ledger path (confirmed by REVIEW token-leak audit).

### Human Verification Required

None. The phase produces runnable code fully covered by the FIFO-stubbed test suite (80/0 green). Live end-to-end ship against a seeded `/api/v1` is explicitly deferred to live-verify per 02-VALIDATION.md and is not a gate for goal achievement here.

### Gaps Summary

No gaps. All four success criteria are verified against the actual codebase:

1. **SC1 (end-to-end, no duplicated API logic):** ship composes `ops.createApp/triggerBuild/getBuild/publishApp`; the ship case issues zero direct `apiFetch`; every lifecycle request has exactly one definition in src/ops.mjs; unwrap is single-defined.
2. **SC2 (streamed + confirm-gate):** per-step streaming via the shipReport ledger; the publish gate is reimplemented (`wantYes`), reuses printPreview, never calls confirmGate, and issues no publish POST without `--yes`/`--confirm` (exit 3) — asserted by two tests on `requests.filter(/\/publish$/).length === 0`.
3. **SC3 (first-block stop with actionable message):** build-failed, prerequisite_failed, and poll-timeout each produce a concrete resume command and a non-zero exit; app_id is surfaced for resume in both human and `--json` (existing-id) modes.
4. **SC4 (one --json object + exit map):** `finish()` emits a single `{steps,final_state}` object; EXIT map `{shipped:0,gated:3,blocked:1,failed:1}`; usage error returns 2 before any step (plain-text even under `--json`).

The two REVIEW warnings (WR-01 null guards, WR-02 `--json` build-block app_id) were fixed in commit c6f1920 and each carries a dedicated regression test in the green suite. The full suite is 80 pass / 0 fail.

---

_Verified: 2026-06-15T04:00:00Z_
_Verifier: Claude (gsd-verifier)_
