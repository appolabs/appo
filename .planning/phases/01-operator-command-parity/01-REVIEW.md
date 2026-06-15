---
phase: 01-operator-command-parity
reviewed: 2026-06-15T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/cli.mjs
  - test/helpers/mockFetch.mjs
  - test/foundation.test.mjs
  - test/read-verbs.test.mjs
  - test/write-verbs.test.mjs
  - test/destructive-verbs.test.mjs
  - test/help.test.mjs
  - package.json
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-06-15
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Reviewed the Phase 1 operator-command-parity CLI: the eight lifecycle verbs in
`src/cli.mjs`, the test harness (`mockFetch.mjs`), and the four verb test suites.
To assess the non-negotiables accurately I also read the three referenced
modules (`api.mjs`, `config.mjs`, `login.mjs`); they are not in the change set
and are reported on only where they bear on a scoped finding.

**The non-negotiables hold.** The confirm-gate is correct: every destructive
verb (`publish`, `resubmit`, `push`) calls `confirmGate` and returns its exit
code *before* issuing the POST, and `confirmGate` returns `null` (proceed) only
when `flags.confirm` is truthy. There is no path where a destructive write fires
without `--confirm` — the three `requests.length === 0` tests (T-01-13) and the
`confirmGate issues NO fetch` test confirm this. No critical findings.

**Token handling is clean.** The bearer token is read via `storedToken()` and
placed only in the `Authorization` header inside `apiFetch`; it is never passed
to a render/preview function, never interpolated into a log line, and never
included in any error message. The mock records request headers but no test
echoes them. The config file is written `0o600` under a `0o700` directory.

**v1 method/path/body match the contract** for all verbs, and the tests pin each
one (method + path regex + body deep-equal). The 204→`null` passthrough
(configure/publish) and the `recipients_count` sibling-of-`data` read (push) are
handled per the documented v1 shapes.

Two warnings concern argument-parsing edge cases that can crash the process or
silently mis-scope a value; four info items are minor robustness/quality notes.

## Warnings

### WR-01: Bare `--api` (no value) crashes with an uncaught TypeError instead of a usage error

**File:** `src/cli.mjs:179` (with `src/config.mjs:39-46`, `src/cli.mjs:48-55`)
**Issue:** `parseArgs` sets a flag to boolean `true` when it has no following
value (`flags[key] = true`, line 51). For a trailing or value-less `--api`
(e.g. `appo status 7 --api`), `flags.api` becomes `true`. `resolveApiBase`
is then called at line 179 — *outside* the `try/catch` that begins at line 182 —
and runs `value.replace(...)` on the boolean (`config.mjs:45`), throwing
`TypeError: true.replace is not a function`. Because the call is outside the
guarded block, this is an unhandled exception with a raw stack trace and a
non-deterministic exit code, not the documented exit `2` (usage error). The
taxonomy in `USAGE` (lines 34-39) promises usage errors are exit `2`.
**Fix:** Either coerce/validate the api value, or move `resolveApiBase` inside
the try and guard against a boolean flag value:
```js
// config.mjs resolveApiBase — ignore a value-less flag (boolean true)
const value =
  (typeof flagValue === 'string' && flagValue) ||
  process.env.APPO_API_BASE ||
  readConfig().api_base ||
  DEFAULT_API_BASE;
```
This also hardens any other string flag that is accidentally passed with no
value.

### WR-02: A flag value that legitimately begins with `--` is swallowed as a separate flag

**File:** `src/cli.mjs:48-55`
**Issue:** The parser treats *any* token starting with `--` as a new flag, even
when it is the awaited value of the previous flag (line 50:
`next.startsWith('--')`). This makes some real values unrepresentable — e.g.
`--body "--see attached"`, `--branch "--detached"`, or a `--target-url`/title
beginning with `--`. The flag silently becomes a boolean and the intended value
is reparsed as another flag, so `push --body "--x"` would fail the
`!flags.body` guard (exit 2) or send the wrong body with no diagnostic. There is
no `--` end-of-options sentinel and no `--key=value` form to escape it.
**Fix:** Accept `--key=value` syntax and/or honor a `--` separator so the
remainder is positional. Minimal `--key=value` support:
```js
if (a.startsWith('--')) {
  const eq = a.indexOf('=');
  if (eq !== -1) { flags[a.slice(2, eq)] = a.slice(eq + 1); continue; }
  // ...existing --key value handling...
}
```

## Info

### IN-01: `publish` accepts an empty `--stores` value and forwards `['']`

**File:** `src/cli.mjs:326-333`
**Issue:** The guard `!flags.stores` (line 326) only rejects a missing/boolean
`--stores`. An explicit empty string (`--stores ""`) passes the guard, then
`String('').split(',')` yields `['']`, so the preview shows
`target_stores: ['']` and a confirmed run POSTs `{ app_stores: [''] }`. The
server will reject it, but the CLI could fail faster and clearer.
**Fix:** After mapping, drop empties and require at least one token:
```js
const stores = String(flags.stores).split(',').map(s => s.trim())
  .filter(Boolean)
  .map(s => s === 'apple' ? 'apple_appstore' : s === 'google' ? 'google_playstore' : s);
if (stores.length === 0) { console.error('Usage: appo publish <id> --stores apple_appstore,google_playstore --confirm'); return 2; }
```

### IN-02: `build`/`push` human render dereferences the unwrapped body without a null guard

**File:** `src/cli.mjs:305` (`build`), `src/cli.mjs:368` (`push`)
**Issue:** `build` logs `b.id`/`b.platform` from `unwrap(res)` and `push` logs
`res.recipients_count`. If the server returns a 2xx with an unexpected/empty
body (`b` undefined, or `res` null), these throw a `TypeError` that surfaces via
`renderError` as a generic `Error:` message and exit 1 — technically safe, but
the message would be opaque (`Cannot read properties of undefined`). The
curated `print*` helpers already guard `if (!x) return`; the inline human lines
do not.
**Fix:** Guard the inline reads, e.g. `const b = unwrap(res) || {};` before the
`build` log line, and read `res?.recipients_count ?? 0` (or report "unknown")
in `push`.

### IN-03: `whoami` exit code conflates "not authenticated" with general error

**File:** `src/cli.mjs:195-205`
**Issue:** When no token is stored, `whoami` returns `1`. Per the documented
taxonomy (lines 34-39) exit `1` is "runtime / API error (incl. auth failure)",
so this is defensible, but a not-yet-logged-in state is arguably a usage
condition rather than a runtime failure. This is a judgment call, not a bug —
flagged only so the choice is intentional and documented.
**Fix:** None required if intentional. If a distinction is wanted, keep the
unauthenticated branch at exit 1 but ensure the message ("Run `appo login`.")
remains the single signal operators key on.

### IN-04: `rejection`/`fix-recipe` map all non-404 errors through `throw err`, but a non-404 with `--json` skips envelope passthrough

**File:** `src/cli.mjs:273-277`, `src/cli.mjs:288-292`
**Issue:** The inner `catch` special-cases `err.status === 404` for both human
and `--json` modes, then `throw err` for everything else. A non-404 error
(e.g. 500) in `--json` mode therefore does not emit the raw envelope — it falls
to the top-level `renderError`, which prints a human `Error:` line to stderr
even though `--json` was requested. For a machine-readable mode this is a small
contract inconsistency with the 404 `--json` path (line 274) that does preserve
the envelope.
**Fix:** If `--json` should always emit the envelope, handle it before the 404
branches: `if (flags.json && err.envelope) { console.log(JSON.stringify(err.envelope)); return 1; }`.
Low priority — only affects non-404 server errors under `--json`.

---

_Reviewed: 2026-06-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
