---
phase: 02-appo-ship-orchestrated-lifecycle-killer-feature
fixed_at: 2026-06-15T00:00:00Z
review_path: .planning/phases/02-appo-ship-orchestrated-lifecycle-killer-feature/02-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 3
skipped: 2
status: all_fixed
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-06-15T00:00:00Z
**Source review:** .planning/phases/02-appo-ship-orchestrated-lifecycle-killer-feature/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (2 warning, 3 info)
- Fixed: 3 (this run — IN-01, IN-02, IN-03)
- Already resolved before this run: 2 (WR-01, WR-02 — see Skipped Issues)
- Skipped (no new work): 2

All three remaining in-scope info findings were addressed. The two warnings were
already fixed in a prior commit (c6f1920) and are recorded below as already-resolved.
Test suite green throughout: baseline 80 -> 84 (each fix added a pinning test).

## Fixed Issues

### IN-01: `app_id: Number(sub)` yields `NaN` in previews for non-numeric ids

**Files modified:** `src/cli.mjs`, `test/ship.test.mjs`
**Commit:** 390d9e0
**Applied fix:** Added a `previewId(id)` helper that coerces to a number only when
the id round-trips as an integer (`Number.isInteger(n) && String(n) === String(id)`),
otherwise echoes the raw string the user typed. Replaced all four `Number(sub)` /
`Number(appId)` preview call sites (publish, resubmit, push verbs + ship publish
preview). This keeps the preview faithful to the requested id and avoids the JSON
literal `null` under `--json` (`JSON.stringify(NaN) === 'null'`). The server call
already uses the raw `sub` in the path, so preview and target now agree; numeric ids
still coerce to numbers (prior behaviour preserved). The publish-body still sends the
canonical `app_stores` tokens — gate logic and confirm-gate untouched. Two tests pin
both branches (non-numeric echoes raw string; numeric stays a number); the non-numeric
test also asserts zero `/publish` writes occur (gate intact).

### IN-02: `pollBuild` returns a possibly-nullish `build` with no consistent last_status

**Files modified:** `src/cli.mjs`, `test/ship.test.mjs`
**Commit:** 567f4d1
**Applied fix:** Minimal hardening for future callers. `pollBuild` now returns
`last_status` on EVERY outcome (`ready`/`failed`/`timeout`), not only on timeout, so a
caller can read the last observed status without dereferencing a possibly-nullish
`res.build`. Extended the docstring to state that a malformed/empty poll body leaves
`build` nullish and that `last_status` is the null-safe field to read. No live behaviour
change (today's `ship` reads only `res.outcome`/`res.last_status`). Added a test pinning
`last_status === 'ready'` on the ready outcome.

### IN-03: `parseStores` and the inline `publish` store-mapping duplicate the alias logic

**Files modified:** `src/cli.mjs`, `test/ship.test.mjs`
**Commit:** 17da635
**Applied fix:** The `publish` verb now calls the shared `parseStores(flags.stores)`
instead of re-implementing the apple/google -> canonical-token mapping inline. The
alias logic now has a single definition (consumed by both `ship` and `publish`). Guard
ordering preserved: the existing `!flags.stores` check still yields exit 2 for a missing
`--stores`, and the `stores.length === 0` check still rejects a present-but-empty value
(e.g. `--stores ,,`). The POST body continues to send canonical `app_stores` tokens. A
test pins that `--stores apple,google` maps to `['apple_appstore','google_playstore']`
in the publish body.

## Skipped Issues

### WR-01: `ship` dereferences build/create responses with no null guard

**File:** `src/cli.mjs:499,508,513`
**Reason:** Already resolved before this run (commit c6f1920). The orchestrator now
applies `(app || {}).id` / `(build || {}).id` guards on the create and build responses,
with regression test "ship create with empty 2xx body does not throw (WR-01 guard)" in
test/ship.test.mjs. No additional work needed.

### WR-02: build-block resume `app_id` is not in the `--json` ledger for existing-id ships

**File:** `src/cli.mjs:509-511`
**Reason:** Already resolved before this run (commit c6f1920). The build-block path now
threads `app_id` into the `--json` ledger via `handleBlock(err, 'build', { app_id: appId })`,
with regression test "ship <id> build block surfaces app_id in the --json ledger (WR-02)"
in test/ship.test.mjs. No additional work needed.

---

_Fixed: 2026-06-15T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
