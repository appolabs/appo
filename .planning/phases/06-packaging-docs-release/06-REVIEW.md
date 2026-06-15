---
phase: 06-packaging-docs-release
reviewed: 2026-06-15T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/upgrade.mjs
  - src/config.mjs
  - src/cli.mjs
  - bin/appo.mjs
  - package.json
  - .github/workflows/release.yml
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-06-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 6 packaging/release was reviewed against the stated non-negotiables: runtime
dependency-free, PAT confidentiality, non-blocking daily update-check, cache
carry-through, `appo init` idempotency, and OIDC trusted publishing.

All security non-negotiables hold. `runUpgrade` spawns a fixed argv array
(`['install','-g','@appolabs/appo@latest']`) with no shell-string interpolation of
any user/config input; `shell:true` is scoped to win32 only and the args remain a
literal array, so there is no injection vector (the package spec is a hardcoded
constant). `checkForUpdate` sends only an `Accept` header to the registry — no
Authorization/Bearer — and its cache writes only `{ last_check_ms, latest }`, never
a token. `--version`, `appo init`, and `appo upgrade` never print the PAT. Cache
carry-through was verified at runtime in both directions: a profile write
(`writeProfile`/`setCurrent`/`clearProfileToken`) preserves `update_check`, and
`writeUpdateCache` preserves profiles and the stored token; 0600/0700 perms are
reapplied via `writeConfig`. `appo init` is idempotent (a configured profile reports
and writes nothing). `dependencies` is absent (effectively empty); devDeps unchanged;
`files` includes `llms.txt` and `README.md`, both present on disk.

No critical issues. Three warnings (one robustness gap in the update-check, two
release-workflow hazards) and three info items follow.

## Warnings

### WR-01: Update-check fetch has no timeout — a hung registry can stall CLI exit

**File:** `src/upgrade.mjs:54-65`, `bin/appo.mjs:14-21`
**Issue:** The non-negotiable requires the update-check to be non-blocking and to
"never hang the CLI." `checkForUpdate` `await`s `fetchImpl(LATEST_URL, ...)` with no
`AbortSignal`/timeout. The hook in `bin/appo.mjs` `await`s `checkForUpdate(version)`
before calling `process.exit(code)`. The `try/catch` swallows *errors*, but it does
not bound *latency*: a registry that accepts the TCP connection then stalls (no
response) leaves `fetch` pending indefinitely, so the CLI hangs after the command's
real work has completed instead of exiting. This is the one robustness gap relative
to the "never block or hang" requirement.
**Fix:** Bound the request with an abort timeout so a stalled registry resolves
quickly into the existing swallow path:
```js
const ac = new AbortController();
const t = setTimeout(() => ac.abort(), 1500);
try {
  const res = await fetchImpl(LATEST_URL, {
    headers: { Accept: 'application/json' },
    signal: ac.signal,
  });
  if (res.ok) latest = (await res.json()).version;
  writeUpdateCache({ last_check_ms: now(), latest });
} catch {
  return; // abort/timeout/network all land here
} finally {
  clearTimeout(t);
}
```
(`AbortController`/`setTimeout` are Node built-ins — no runtime dependency added.)

### WR-02: Release workflow self-retriggers and can race/double-publish the same version

**File:** `.github/workflows/release.yml:3-5, 41-49, 51-75`
**Issue:** The workflow triggers on `push` to `master`/`main`. The "Bump patch
version" step commits and `git push`es package.json back to the branch, which fires a
*second* workflow run. Meanwhile the first run continues past the bump: the "Get
release version" step re-reads the now-bumped version, then the run tags and
`npm publish`es that version. The re-triggered run independently computes the same
(now-current) version. Depending on tag-push ordering between the two runs, both may
reach "Create tag" / "Publish to npm" for the identical version, producing a failed
duplicate tag push or a duplicate `npm publish` attempt (red workflow runs, and
operator confusion about which run actually published). There is also no
`concurrency` guard, so overlapping pushes can interleave on tag creation/publish.
**Fix:** Add a concurrency group and gate the publish path so a self-retrigger from
the bump commit is a no-op. For example:
```yaml
concurrency:
  group: release
  cancel-in-progress: false
```
and either skip the bump-commit path from re-triggering (commit message filter /
`[skip ci]` on the bump commit, then a follow-up run does the publish), or make the
publish steps idempotent by guarding "Create tag"/"Publish" on the tag not already
existing (reuse the existing `steps.check` style check immediately before
tag/publish, recomputed against the final version).

### WR-03: `npm publish` runs after lint/typecheck/test but `prepublishOnly` re-runs them — and a publish failure leaves a pushed tag

**File:** `.github/workflows/release.yml:67-75`, `package.json:35`
**Issue:** Two coupled issues. (1) "Create tag" pushes `vX` to origin *before*
"Publish to npm". If `npm publish` fails (OIDC misconfig, registry 5xx, provenance
rejection), the tag and the GitHub Release are already pushed while the package was
never published — leaving the repo advertising a version that does not exist on npm
and blocking a clean retry (the tag now exists, so a re-run's bump logic diverges).
(2) `prepublishOnly` re-runs `lint && typecheck && test`, duplicating the explicit
Lint/Type/Test steps — harmless but doubles CI time on every release.
**Fix:** Reorder so publish precedes tag/release creation (publish first; only on
success create the tag and GitHub Release), so a failed publish leaves no dangling
tag. Optionally drop the redundant explicit Lint/Type/Test steps and rely on
`prepublishOnly`, or drop `prepublishOnly` and rely on the explicit steps — pick one
to avoid running the full suite twice.

## Info

### IN-01: `checkForUpdate` caches the timestamp even when the registry request fails (`!res.ok`)

**File:** `src/upgrade.mjs:59-61`
**Issue:** On a non-OK response (e.g., registry 503), `latest` keeps its stale cached
value (or `undefined`), but `writeUpdateCache({ last_check_ms: now(), latest })` still
runs, stamping a fresh `last_check_ms`. This suppresses any retry for a full day even
though the check effectively failed. Behavior is safe (best-effort hint), but a
transient outage silently disables update detection for 24h.
**Fix:** Only stamp `last_check_ms` on a successful fetch:
```js
if (res.ok) {
  latest = (await res.json()).version;
  writeUpdateCache({ last_check_ms: now(), latest });
}
```

### IN-02: `isNewer` mis-parses pre-release/non-numeric version segments

**File:** `src/upgrade.mjs:33-42`
**Issue:** `String(a).split('.').map(Number)` turns a segment like `0-beta` (from
`1.0.0-beta`) into `NaN`, and `(NaN || 0)` collapses it to `0`. The dependency-free
x.y.z compare is correct for the project's plain numeric releases, but a registry
`latest` carrying a pre-release tag would compare incorrectly (false positive/negative
notice). Worst case is a wrong one-line stderr hint — never a crash — so this is
informational given the project does not publish pre-releases.
**Fix:** If pre-release tags ever ship, parse with `parseInt(seg, 10)` per segment and
treat any tagged version as not-newer, or split on `/[.-]/` and compare only the
leading numeric triple.

### IN-03: `runUpgrade` win32 `shell:true` documented but worth a guard comment on the spec source

**File:** `src/upgrade.mjs:19-24`
**Issue:** `shell:true` on win32 with `stdio:'inherit'` is the correct npm.cmd
workaround and carries no injection risk because every argv element is a compile-time
constant. No change required. Flagged only to make the invariant explicit for future
edits: the safety depends entirely on the package spec staying a hardcoded literal —
never interpolate a profile/env/user value into this argv.
**Fix:** None required. Keep the existing comment; if the spec ever becomes
configurable, drop `shell:true` and resolve the npm binary explicitly instead.

---

_Reviewed: 2026-06-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
