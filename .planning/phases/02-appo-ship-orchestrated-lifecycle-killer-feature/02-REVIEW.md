---
phase: 02-appo-ship-orchestrated-lifecycle-killer-feature
reviewed: 2026-06-15T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - src/ops.mjs
  - src/cli.mjs
  - test/ship.test.mjs
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-06-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Reviewed the Phase 2 `appo ship` orchestrator (`src/cli.mjs` case `ship`, the
`pollBuild` loop, and the shared `src/ops.mjs` transport) plus its test suite. All
12 ship tests pass. The phase's hard non-negotiables hold:

- **Publish gate — SOUND.** No path reaches `ops.publishApp` without
  `wantYes` (`flags.yes || flags.confirm`). The `if (!wantYes)` branch records
  `gated` and returns exit 3 with a preview before any POST is issued
  (cli.mjs:543-547). The standalone `publish` verb uses `confirmGate`. Test 5
  and 8b assert zero `/publish` requests when ungated.
- **Poll loop — SOUND.** Terminal states are exactly `ready` (proceed) and
  `failed` (stop); everything else keeps polling (cli.mjs:208-209). The loop is
  bounded by the timeout check placed after terminal checks and before the sleep
  (cli.mjs:210). `--timeout 0` is honored via `Number.isFinite` rather than a
  `|| 1800` that would coerce a legitimate 0. Injectable `sleep` defaults to
  `realSleep`; tests inject a no-op so no real delay leaks.
- **No duplicated API logic — SOUND.** `ship` routes through
  `ops.createApp/triggerBuild/getBuild(via pollBuild)/publishApp`. The `status`
  verb and the `build --json` branch retain direct `apiFetch` for the verbatim
  RAW envelope, which is intentional and correct.
- **Token leakage — CLEAN.** The Bearer token lives only in the `api.mjs`
  Authorization header. No stream line (`log`/`onChange`), no `--json` ledger
  field (`steps`/`final_state`), and no `renderError` path references the token
  or the config.
- **Exit codes — CORRECT.** `0` shipped / `3` gated / `1` blocked|failed / `2`
  usage (returned before any step). `EXIT` map at cli.mjs:237.

Findings below are robustness gaps in the orchestrator's handling of malformed
or empty success-status API bodies, plus a minor asymmetry in how the resume
`app_id` reaches the `--json` ledger on a build block. None weaken the gate,
leak the token, or break the documented exit contract.

## Warnings

### WR-01: `ship` dereferences build/create responses with no null guard

**File:** `src/cli.mjs:499,508,513`
**Issue:** The `build` verb defensively falls back to `{}` when `triggerBuild`
returns a falsy/unwrapped body (`... || {}`, cli.mjs:392), but the `ship`
orchestrator does not apply the same guard:
- `appId = app.id;` (cli.mjs:499) after `ops.createApp`
- `const buildId = build.id;` (cli.mjs:513) after `ops.triggerBuild`

`ops.createApp`/`ops.triggerBuild` return `unwrap(payload)`, which yields
`undefined` if the server returns a 2xx with an empty or non-enveloped body
(e.g. a 202 with no `data`). `app.id` / `build.id` then throws
`TypeError: Cannot read properties of undefined`, which is caught by the
top-level `renderError` and reported as a generic exit-1 error rather than an
actionable message — and for `build`, after a real build may already have been
triggered server-side, masking the `build_id` the user needs to resume. The
inconsistency with the `build` verb's own `|| {}` fallback shows the defensive
pattern was intended here too.
**Fix:**
```js
const app = (await ops.createApp(apiBase, { ... })) || {};
if (!app.id) throw new Error('create returned no app id');
appId = app.id;
// ...
const build = (await ops.triggerBuild(apiBase, appId, { ... })) || {};
if (!build.id) throw new Error('build returned no build id');
const buildId = build.id;
```

### WR-02: build-block resume `app_id` is not in the `--json` ledger for existing-id ships

**File:** `src/cli.mjs:509-511`
**Issue:** On a build-trigger block, the human path prints the resume hint
`(app #${appId} exists — resume with: appo ship ${appId})` (cli.mjs:510), but
this is gated on `!json`. In `--json` mode `handleBlock` records
`{ step:'build', status:'blocked', code, message }` (cli.mjs:484) with no
`app_id`. For a freshly-created app the `app_id` is recoverable from the prior
`create` step record, but for an existing-id ship (`appo ship <id>`) there is no
`create` step, so the `--json` consumer never sees the `app_id` on a build
block. The phase's partial-state requirement (surface `app_id` so the user can
resume) is therefore met in human mode and in `--json` new-app mode, but is a
silent gap in `--json` existing-id mode.
**Fix:** Include `app_id` in the build-block record so both modes carry the
resume target:
```js
const handleBlock = (err, step, extra = {}) => {
  if (!json) throw err;
  record({ step, status: 'blocked', code: err.envelope?.code, message: err.message, ...extra });
  return finish('blocked', EXIT.blocked);
};
// ...
} catch (err) {
  if (!json) console.error(`  (app #${appId} exists — resume with: appo ship ${appId})`);
  return handleBlock(err, 'build', { app_id: appId });
}
```

## Info

### IN-01: `app_id: Number(sub)` yields `NaN` in previews for non-numeric ids

**File:** `src/cli.mjs:421,432,449,542`
**Issue:** The confirm-gate previews coerce the positional id with `Number(sub)`.
If the id is non-numeric (typo, slug), the preview shows `app_id NaN` rather
than the value the user typed, and — for the `--json` gate object — emits the
JSON literal `null` for `app_id` (since `JSON.stringify(NaN)` is `null`). The
subsequent server call still uses the raw string `sub` in the path, so the
preview can disagree with the actual target. Cosmetic for the gate (no write
occurs), but the preview should faithfully echo the requested id.
**Fix:** Use the raw `sub` (or `String(sub)`) in previews, or validate numeric
ids up front and return exit 2 for non-numeric input.

### IN-02: `pollBuild` reads `build?.status` but build is assumed non-null downstream

**File:** `src/cli.mjs:205-207`
**Issue:** `pollBuild` correctly uses optional chaining (`build?.status`) when a
`getBuild` poll returns a malformed/empty body, so a transient empty 200 is
treated as a non-terminal status and the loop continues (good). However the
returned `{ build }` may then be `undefined`/`null`; callers that later read
fields off `res.build` (none do today in `ship`, which only reads
`res.outcome`/`res.last_status`) would need the same guard. No live bug — noted
for future callers.
**Fix:** No change required now; document that `res.build` may be nullish, or
have `pollBuild` carry `last_status` consistently (it already does on timeout).

### IN-03: `parseStores` and the inline `publish` store-mapping duplicate the alias logic

**File:** `src/cli.mjs:216-220` and `src/cli.mjs:417-419`
**Issue:** The apple/google → canonical-token mapping is implemented twice: once
in `parseStores` (used by `ship`) and once inline in the `publish` verb
(cli.mjs:417-419). The two are currently identical, but duplicated mapping logic
drifts over time (e.g. if a third store alias is added). Per the
no-duplicated-logic spirit of the phase, the `publish` verb could reuse
`parseStores`.
**Fix:** Have the `publish` verb call `parseStores(flags.stores)` and keep the
existing `stores.length === 0` usage guard. (Note: `parseStores` returns both
canonical tokens when given an empty/true value, so guard ordering must preserve
the current "missing `--stores` → exit 2" behaviour — `publish` already requires
`flags.stores` truthy before reaching the mapping.)

---

_Reviewed: 2026-06-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
