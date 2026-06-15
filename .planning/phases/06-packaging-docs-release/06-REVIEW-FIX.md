---
phase: 06-packaging-docs-release
fixed_at: 2026-06-15T15:28:12Z
review_path: .planning/phases/06-packaging-docs-release/06-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 3
skipped: 3
status: all_fixed
---

# Phase 6: Code Review Fix Report

**Fixed at:** 2026-06-15T15:28:12Z
**Source review:** .planning/phases/06-packaging-docs-release/06-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (fix_scope = all)
- Fixed: 3 (IN-01, IN-02, IN-03)
- Skipped: 3 (WR-01, WR-02, WR-03 — already resolved in a prior commit, not re-fixed)

All warnings were resolved before this run (commit c63f758); the three info items
are now addressed. `npm run lint`, `npm run typecheck`, and `npm test` (188 tests,
up from 187 with the new IN-01 regression test) are green. Runtime `dependencies`
remain empty; no Authorization header / PAT is logged.

## Fixed Issues

### IN-01: `checkForUpdate` caches the timestamp even when the registry request fails (`!res.ok`)

**Files modified:** `src/upgrade.mjs`, `test/unit/update-check.test.mjs`
**Commit:** 54f402b
**Applied fix:** Moved `writeUpdateCache({ last_check_ms, latest })` inside the
`if (res.ok)` branch so a non-OK response (e.g. registry 503) no longer stamps a
fresh `last_check_ms`. A transient outage now retries on the next run instead of
being suppressed for 24h. The catch path still swallows every network/timeout
error (non-blocking, no crash). Added a regression test asserting the cache is NOT
stamped on a `!ok` fetch and that a second call at the same instant re-fetches
(2 fetch calls), proving the daily suppression is not triggered by a failure.

### IN-02: `isNewer` mis-parses pre-release/non-numeric version segments

**Files modified:** `src/upgrade.mjs`
**Commit:** 54f402b
**Applied fix:** Documented the limitation in the `isNewer` JSDoc — the
dependency-free x.y.z compare collapses pre-release segments (`1.0.0-beta`) to 0
and is correct only for the project's plain numeric releases. No behavioral change
(the project does not publish pre-releases); the comment records the future remedy
(parse the leading numeric triple via `split(/[.-]/)`, treat tagged versions as
not-newer). Worst case today is a wrong one-line stderr hint, never a crash.

### IN-03: win32 `shell:true` safety depends on the spec staying a hardcoded literal

**Files modified:** `src/upgrade.mjs`
**Commit:** 54f402b
**Applied fix:** Added an inline INVARIANT comment directly above the `runUpgrade`
argv asserting that every argv element must remain a compile-time literal — the
win32 `shell:true` workaround is injection-safe only because nothing is
interpolated from profile/env/user input. Defense-in-depth documentation for
future edits; no behavioral change.

> Note: IN-01, IN-02, and IN-03 all modify `src/upgrade.mjs`. Because the commit
> tool stages whole files, the three edits landed in a single commit (54f402b)
> rather than three. IN-02 and IN-03 are doc-only comments with no independent
> behavior, so this remains a clean atomic result.

## Skipped Issues

### WR-01: Update-check fetch has no timeout — a hung registry can stall CLI exit

**File:** `src/upgrade.mjs:54-65`, `bin/appo.mjs:14-21`
**Reason:** Already resolved (commit c63f758). `checkForUpdate` now wraps the
fetch in an `AbortController` with a ~1.5s `setTimeout(() => ac.abort(), 1500)`
and a `finally { clearTimeout(timer) }`; abort/timeout/network all land in the
existing swallow path. Verified present in source. Not re-fixed.
**Original issue:** `checkForUpdate` awaited `fetchImpl` with no `AbortSignal`, so
a stalled registry could leave the CLI hanging after real work completed.

### WR-02: Release workflow self-retriggers and can race/double-publish the same version

**File:** `.github/workflows/release.yml:3-5, 41-49, 51-75`
**Reason:** Already resolved (commit c63f758). The workflow now has a
`concurrency` group and the bump commit carries `[skip ci]` so a self-retrigger is
a no-op. Not re-fixed.
**Original issue:** The bump-commit push fired a second workflow run with no
concurrency guard, risking duplicate tag/publish for the same version.

### WR-03: `npm publish` ran after tag push, leaving a dangling tag on publish failure

**File:** `.github/workflows/release.yml:67-75`, `package.json:35`
**Reason:** Already resolved (commit c63f758). The workflow now publishes to npm
BEFORE creating/pushing the tag, so a failed publish leaves no dangling tag. Not
re-fixed.
**Original issue:** Tag/release were pushed before publish; a publish failure left
the repo advertising a version absent from npm and blocked a clean retry.

---

_Fixed: 2026-06-15T15:28:12Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
