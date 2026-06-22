---
phase: 07-ship-intent-surface
verified: 2026-06-22T16:40:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  note: initial verification
---

# Phase 7: Ship-Intent Surface Verification Report

**Phase Goal:** The CLI issues no builds. `ship` creates (when given `--url`/`--name`) and signals publish-intent, returning immediately; staff issue the build server-side. `apps update` edits only icon/url/name.
**Verified:** 2026-06-22T16:40:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (the 4 ROADMAP Success Criteria)

| #    | Truth | Status | Evidence |
| ---- | ----- | ------ | -------- |
| SC-1 | `ship --url --name` creates + signals publish-intent without `POST /builds` and without polling; `ship <id>` signals (re)publish-intent the same way; confirm-gate + `--json` ledger preserved | ✓ VERIFIED | `case 'ship'` (cli.mjs:621-686) is a 2-step create→publish-intent path. `ops.createApp` (cli.mjs:658) then `ops.publishApp` (cli.mjs:677). No build trigger, no poll loop. Gate decision `wantYes` (cli.mjs:638) → exit 3 with NO publish POST (cli.mjs:670-674). `shipReport` (cli.mjs:269-278) emits `{steps, final_state}`. 9 ship tests pass; every one asserts `/builds$` request-absence (9 invariants for 9 tests). Named tests "creates then publishes" and "without --yes" green. |
| SC-2 | `ops.triggerBuild` and `pollBuild` removed; no CLI path calls `POST .../builds`; build STATUS reads retained | ✓ VERIFIED | `grep -rn "triggerBuild\|pollBuild\|realSleep" src/` → EMPTY. `ops.triggerBuild` is `undefined` at runtime (confirmed via import). The only `/builds` references are intentional GET STATUS reads: `ops.getBuild` GET `/builds/{buildId}` (ops.mjs:28-30) and `case 'status'` GET (cli.mjs:531-532) — these are D-02-retained reads, no POST. docs.test.mjs guard `not.toMatch(/triggerBuild\|pollBuild/)` over cli+ops (line 49). |
| SC-3 | `apps update <id>` accepts only `--name`/`--url`/`--icon`; `--meta-*` removed; `--icon` → `ops.setIcon` → `POST .../icon` (flat `{icon_url}`) | ✓ VERIFIED | update branch (cli.mjs:490-524) maps name/url→PATCH and icon→`ops.setIcon` (cli.mjs:511) with PATCH-first ordering (cli.mjs:507-513). `ops.setIcon` POSTs `/api/v1/apps/{id}/icon` with `{icon_url}`, no unwrap (ops.mjs:46-48). `grep -rn "meta-name\|meta-desc\|metadata" src/` → EMPTY. Empty-value guard `typeof flags.icon === 'string' && flags.icon` (cli.mjs:500). Named tests "icon POSTs", "SSRF reject" (422→exit 1 via renderError else-branch), "PATCH then POST" ordering all green. |
| SC-4 | Tests, README, `llms.txt` updated; `npm test`/`lint`/`typecheck` all green; docs carry no `--meta-*`/`--timeout`/build-poll wording; docs.test.mjs has negative guards | ✓ VERIFIED | `npm test` → 192 passed / 16 files. `npm run lint` → exit 0. `npm run typecheck` → exit 0. README documents `apps update <id> [--name] [--url] [--icon <https-url>]` (README.md:105) and ship as publish-intent. `grep "meta-name\|meta-desc\|--timeout" README.md llms.txt` → EMPTY; build/poll wording → EMPTY. docs.test.mjs negative asserts present (lines 37-43, 49). `test/unit/ship.test.mjs` deleted. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/ops.mjs` | `createApp({name,base_url})`, `publishApp`, `setIcon`; `triggerBuild` removed | ✓ VERIFIED | `setIcon` exported (flat response, no unwrap, ops.mjs:46-48); `createApp` reduced to `{name,base_url}` (ops.mjs:18-20); no `triggerBuild`. |
| `src/cli.mjs` | reshaped `case 'ship'`, EXIT `{shipped,gated,blocked}`, no `--timeout`, rescoped `apps update` | ✓ VERIFIED | `EXIT = { shipped: 0, gated: 3, blocked: 1 }` (cli.mjs:280); `case 'ship'` 2-step (cli.mjs:621-686); update branch name/url/icon (cli.mjs:490-524); USAGE has no `--timeout`. |
| `test/integration/ship.test.mjs` | create→publish-intent, `/builds` absence in every case | ✓ VERIFIED | 9 ship tests, 9 `/builds$` absence asserts; `--json` shipped/gated/blocked ledger asserted incl. "no build step in the ledger" (line 142); no `status: 202`/`'ready'` residue. |
| `test/integration/write-verbs.test.mjs` | `--icon` happy/422/ordering; `--meta-*` removed | ✓ VERIFIED | 7 tests pass; icon-POST, 422-SSRF, PATCH-then-icon present; no `meta-name`/`meta-desc` residue. |
| `README.md` | ship publish-intent + apps update icon/url/name | ✓ VERIFIED | `--icon <https-url>` documented (line 105); no removed-flag/build-poll wording. |
| `llms.txt` | command index in lockstep | ✓ VERIFIED | ship/apps update anchors present; no removed flag bodies. |
| `test/integration/docs.test.mjs` | negative-assertion guards | ✓ VERIFIED | 41 tests pass; `not.toContain('--meta-name'/'--meta-desc'/'--timeout')`, `not.toMatch(/triggerBuild\|pollBuild/)`. |
| `test/unit/ship.test.mjs` | deleted (imported only `pollBuild`) | ✓ VERIFIED | File does not exist. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `case 'ship'` | `ops.createApp` | new-app create step | ✓ WIRED | cli.mjs:658 |
| `case 'ship'` | `ops.publishApp` | publish-intent step | ✓ WIRED | cli.mjs:677 (POST `/api/v1/apps/{id}/publish`) |
| `apps update` | `ops.setIcon` | wantIcon branch after PATCH | ✓ WIRED | cli.mjs:511 |
| `ops.setIcon` | `apiFetch POST .../icon` | one-op-per-call | ✓ WIRED | ops.mjs:47 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Modules import (no orphan pollBuild export) | `import('./src/cli.mjs')` / `ops.mjs` | cli OK; setIcon=function; triggerBuild=undefined | ✓ PASS |
| ship no-args usage gate | `run(['ship'])` | exit 2, no HTTP | ✓ PASS |
| apps update no-flags usage gate | `run(['apps','update','5'])` | exit 2, no HTTP | ✓ PASS |
| Source grep guard (SC-2) | `grep -rn "triggerBuild\|pollBuild\|realSleep" src/` | empty | ✓ PASS |
| Full gate | `npm test && npm run lint && npm run typecheck` | 192 passed, lint 0, tsc 0 | ✓ PASS |

### Requirements Coverage

No REQ-IDs map to this phase (CLI operator-boundary phase; judged against the 4 ROADMAP Success Criteria, all VERIFIED above). No orphaned requirements in REQUIREMENTS.md for Phase 7.

### Anti-Patterns Found

None blocking. The build STATUS-read paths (`ops.getBuild`, `case 'status'` GET `/builds/{buildId}`) are intentionally retained per D-02 and are not stubs.

### Code-Review Info Findings (advisory — NOT goal blockers)

Per 07-REVIEW.md, three Info-level observations exist; none affect goal achievement:
- IN-01: `ops.getApp`/`ops.getBuild` are now dead exports (`case 'status'` reads inline). Polish, not a goal blocker.
- IN-02: `ship --stores=` silently defaults instead of erroring (inconsistent with `publish`'s explicit-empty guard). Benign defaulting.
- IN-03: redundant resume hint on an existing-id publish block. UX nit.

These are noted, not failed.

### Human Verification Required

None required for goal verification — all in-CLI behaviors have HTTP-mocked automated coverage. (07-VALIDATION.md lists one optional end-to-end live check against a real `apps-web-app` v3.1 backend; this is integration smoke, not a gap in goal achievement.)

### Gaps Summary

No gaps. All four Success Criteria are TRUE in the live codebase:
- The CLI issues no builds — `triggerBuild`/`pollBuild`/`realSleep` are gone; the only `/builds` traffic is GET status reads (D-02).
- `ship` is a 2-step create→publish-intent path reusing `ops.publishApp`, returning immediately, with the confirm-gate and `{steps, final_state}` `--json` ledger preserved.
- `apps update` edits only name/url (PATCH) and icon (`ops.setIcon` → `POST .../icon`); `--meta-*` removed.
- Docs are in lockstep, regression guards are in place, and the full gate (192 tests, lint, typecheck) is green.

---

_Verified: 2026-06-22T16:40:00Z_
_Verifier: Claude (gsd-verifier)_
