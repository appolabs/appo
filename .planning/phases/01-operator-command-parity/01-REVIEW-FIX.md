---
phase: 01-operator-command-parity
fixed_at: 2026-06-15T00:00:00Z
review_path: .planning/phases/01-operator-command-parity/01-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 4
skipped: 2
status: partial
---

# Phase 1: Code Review Fix Report

**Fixed at:** 2026-06-15
**Source review:** .planning/phases/01-operator-command-parity/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (fix_scope: all — CR/WR/IN)
- Fixed: 4
- Skipped: 2 (1 already resolved, 1 intentional no-op)

Test suite went from 58/58 to 66/66 green; every behavior change is pinned by a
new test. Dependency-free Node ESM constraints respected (built-ins only). The
destructive confirm-gate was not weakened by any fix.

## Fixed Issues

### WR-02: A flag value that legitimately begins with `--` is swallowed as a separate flag

**Files modified:** `src/cli.mjs`, `test/destructive-verbs.test.mjs`
**Commit:** 2f47fc7
**Applied fix:** Extended `parseArgs` with two escape paths: a `--key=value`
inline form (`a.indexOf('=')`) and a bare `--` end-of-options sentinel after
which every token is positional. Values beginning with `--` (e.g.
`--body=--see attached`) are now representable. Added two regression tests: a
`--body=--value` push body assertion and a `--` sentinel positional-routing
assertion.

### IN-01: `publish` accepts an empty `--stores` value and forwards `['']`

**Files modified:** `src/cli.mjs`, `test/destructive-verbs.test.mjs`
**Commit:** dbc48f1
**Applied fix:** Inserted `.filter(Boolean)` into the `--stores` mapping pipeline
and added a `stores.length === 0` usage-error guard (exit 2) before the
confirm-gate, so no empty token reaches the preview or the POST body. Added two
tests: empty `--stores ''` and comma-only `--stores=,,` both return 2 with zero
requests issued.

### IN-02: `build`/`push` human render dereferences the unwrapped body without a null guard

**Files modified:** `src/cli.mjs`, `test/write-verbs.test.mjs`, `test/destructive-verbs.test.mjs`
**Commit:** 062a920
**Applied fix:** `build` now reads `const b = unwrap(res) || {}` and `push` reads
`res?.recipients_count ?? 0`, matching the guard discipline of the curated
`print*` helpers. A 2xx with an empty/unexpected body no longer throws a
`TypeError`. Added two tests covering an empty 2xx body for both `build`
(returns 0, "Build #undefined started") and `push` (returns 0, "Sent to 0
device(s).").

### IN-04: `rejection`/`fix-recipe` non-404 error with `--json` skips envelope passthrough

**Files modified:** `src/cli.mjs`, `test/read-verbs.test.mjs`
**Commit:** feef817
**Applied fix:** In both verbs' inner `catch`, replaced the 404-only `--json`
branch with a status-agnostic `if (flags.json && err.envelope)` guard placed
before the 404 human branch, so any non-2xx error under `--json` emits the raw
v1 envelope verbatim per D-08 (`apiFetch` attaches `err.envelope` for all
non-2xx). Added a 500-under-`--json` test for each verb asserting the envelope is
printed verbatim with exit 1.

## Skipped Issues

### WR-01: Bare `--api` (no value) crashes with an uncaught TypeError instead of a usage error

**File:** `src/cli.mjs:179`
**Reason:** Already resolved before this fix session. Commit 2b39c6d added a
`flags.api === true` guard that returns exit 2 ("--api <url> requires a value")
before `resolveApiBase` is called, with a regression test in
`test/foundation.test.mjs` ("value-less --api returns exit 2 without throwing").
No further action needed.
**Original issue:** A value-less `--api` parsed as boolean `true`, then
`resolveApiBase` ran `value.replace(...)` on the boolean outside the try/catch,
throwing an unhandled `TypeError` instead of the documented exit 2.

### IN-03: `whoami` exit code conflates "not authenticated" with general error

**File:** `src/cli.mjs:217-222`
**Reason:** Intentional design, no change required. The review classifies this as
"a judgment call, not a bug" and states "None required if intentional." The
review's recommended outcome — keep the unauthenticated branch at exit 1 and keep
"Run `appo login`." as the single operator signal — is already satisfied by the
current code (returns 1 with "Not authenticated. Run `appo login`."), consistent
with the documented taxonomy where exit 1 = "runtime / API error (incl. auth
failure)". Applying any change would contradict the stated contract.
**Original issue:** `whoami` returns exit 1 when no token is stored; a
not-yet-logged-in state is arguably a usage condition rather than a runtime
failure.

---

_Fixed: 2026-06-15_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
