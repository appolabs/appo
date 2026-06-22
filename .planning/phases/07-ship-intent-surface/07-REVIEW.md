---
phase: 07-ship-intent-surface
reviewed: 2026-06-22T16:35:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/ops.mjs
  - src/cli.mjs
  - test/integration/ship.test.mjs
  - test/integration/write-verbs.test.mjs
  - test/integration/docs.test.mjs
  - README.md
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-06-22T16:35:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 7 reshapes `ship` from create→build→poll→publish into create→publish-intent,
adds the `setIcon` op, and rescopes `apps update` to `--name`/`--url`/`--icon`. The
core control flow is correct and matches the stated design:

- `ship` issues no builds. `ops.triggerBuild`/`pollBuild` are gone; the publish-intent
  step reuses `ops.publishApp` (204 == success). The negative request-absence asserts
  (`/\/builds$/`) confirm no build call leaks. The exit-code mapping
  (shipped 0 / gated 3 / blocked 1 / usage 2) is consistent across human and `--json`.
- `setIcon` correctly does NOT unwrap (flat `{ icon_url }`) and its 422 rides the
  `renderError` else-branch (not `prerequisite_failed`), as intended.
- `apps update` runs PATCH before the icon POST; the empty-value guards on `--icon`
  prevent an empty POST; partial-update-on-icon-failure is the documented no-transaction
  behaviour, not a defect.
- No PAT leak: `renderError` surfaces `err.message`, which `api.mjs` derives from
  `payload.message`/`payload.error` and never interpolates the token.

All 60 tests across the three reviewed test files pass. No correctness or security
defects were found. Three Info-level observations follow; none block the phase.

## Info

### IN-01: `ops.getApp` and `ops.getBuild` are now dead exports

**File:** `src/ops.mjs:22-30`
**Issue:** The phase intentionally retains build/app STATUS reads, but `case 'status'`
in `src/cli.mjs:529-539` performs its read with an inline `apiFetch(apiBase, 'GET', path, ...)`
and never calls `ops.getApp` or `ops.getBuild`. A grep across `src/` and `test/` shows
zero callers for either op. The capability is retained (inline in the verb), but the two
ops themselves are unreferenced. The module header still claims they are "consumed by the
Phase 1 verbs," which no longer holds. This is dead code that will drift from the verb's
inline path over time.
**Fix:** Either route `case 'status'` through the ops to keep a single request definition,
e.g.

```js
// src/cli.mjs, case 'status'
const res = flags.build
  ? await ops.getBuild(apiBase, sub, flags.build, env)   // returns unwrapped d
  : await ops.getApp(apiBase, sub, env);
// note: ops.* already unwrap, so the --json branch would need the raw envelope path
```

or delete `getApp`/`getBuild` from `ops.mjs` if the inline read is the intended single
source. Keeping both an unused op and a divergent inline read is the worst of the two.

### IN-02: `ship --stores=` silently defaults instead of erroring (inconsistent with `publish`)

**File:** `src/cli.mjs:639` (vs `src/cli.mjs:593`)
**Issue:** `publish` explicitly rejects an explicit-empty `--stores=` as a usage error
(`if (flags.stores === '') { ...; return 2; }`). `ship` calls `parseStores(flags.stores)`
with no such guard, and `parseStores` treats `''` as falsy and returns the default
both-stores array. So `appo ship 5 --stores= --yes` silently ships to both stores rather
than reporting that the user named no stores. Benign (defaulting, not a wrong write), but
the two verbs disagree on identical input.
**Fix:** Mirror the `publish` guard before `parseStores` in `case 'ship'`:

```js
if (flags.stores === '') {
  console.error('Usage: appo ship ... [--stores <list>] ...');
  return 2;
}
const stores = parseStores(flags.stores);
```

### IN-03: Redundant resume hint on an existing-id publish block

**File:** `src/cli.mjs:679`
**Issue:** On a publish block, human mode prints
`(app #${appId} exists — resume with: appo ship ${appId})`. For a newly-created app this
is valuable (test 4 relies on it). For an existing-id ship (`appo ship 7 --yes`), the hint
tells the user to re-run the exact command they just ran, which reads as noise. Not a bug —
purely a UX nit.
**Fix:** Gate the "exists / resume" hint on the create path only (i.e. emit it when the id
was just minted by `createApp`, suppress it when `hasId` was true):

```js
if (!json && !hasId) console.error(`  (app #${appId} created — resume with: appo ship ${appId})`);
```

---

_Reviewed: 2026-06-22T16:35:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
