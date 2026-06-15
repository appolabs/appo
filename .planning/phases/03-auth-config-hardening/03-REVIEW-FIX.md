---
phase: 03-auth-config-hardening
fixed_at: 2026-06-15T00:00:00Z
review_path: .planning/phases/03-auth-config-hardening/03-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 4
skipped: 1
status: partial
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-06-15
**Source review:** .planning/phases/03-auth-config-hardening/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (1 warning + 4 info; fix_scope=all)
- Fixed: 4
- Skipped: 1 (WR-01 — already resolved in a prior commit)

Baseline suite: 116 cases green. After fixes: 122 cases green (6 new regression
tests added). All runs via `npm test` (pinned `--test-concurrency=1`).

## Fixed Issues

### IN-01: dead branch in `writeProfile` — `cfg.current` is never falsy

**Files modified:** `src/config.mjs`, `test/config-profiles.test.mjs`
**Commit:** ddc9151
**Applied fix:** Replaced the unreachable `if (!cfg.current)` branch with a
meaningful first-profile-activation check. `readConfig()` always returns
`current: 'default'`, so the falsy check was dead. The intended UX — a fresh
config's first `writeProfile` activating its own profile — is now implemented by
detecting an empty `profiles` map before the write: `if
(Object.keys(cfg.profiles).length === 0) cfg.current = env;`. This ensures the
first `login --env staging` makes `staging` current rather than leaving the
empty `default` profile active (which would surprise a subsequent bare `whoami`
with "No token"). Added two tests: first-profile activation, and confirmation
that a non-first `writeProfile` leaves `current` untouched.

### IN-02: `env list` prints nothing on an empty config

**Files modified:** `src/cli.mjs`, `test/auth-cli.test.mjs`
**Commit:** cd30e4a
**Applied fix:** Added an empty-profiles guard to the `env list` branch that
prints `No environments yet. Run \`appo login\`.` and returns 0, so an empty
config is distinguishable from a hang or silent success. Added a test asserting
the hint message and exit 0.

### IN-03: `--env=` (empty value via `=`) is silently ignored

**Files modified:** `src/cli.mjs`, `test/auth-cli.test.mjs`
**Commit:** a7b6993
**Applied fix:** Broadened the existing value-less flag guards (which caught only
the bare-flag `=== true` case) to also reject the explicit-empty `=== ''` case
for `--api`, `--env`, and `--token`, returning usage error exit 2. The parser
produces `''` for `--env=` (verified: `cli.mjs:91` `a.slice(eq + 1)`), and an
empty string is falsy in `activeProfileName`, so it previously fell through to
`APPO_ENV`/`current`/`default` silently — and `--token=` would have fallen
through to the device flow instead of refusing. Added three tests asserting exit
2 for `--env=`, `--api=`, and `--token=`.

### IN-04: suite correctness depends on `--test-concurrency=1` (not self-evident)

**Files modified:** `test/auth.test.mjs`, `test/auth-cli.test.mjs`, `test/config-profiles.test.mjs`
**Commit:** 1669436
**Applied fix:** Documentation-only (no harness behavior change, as instructed).
Added an explicit header comment to each shared-state suite stating it REQUIRES
`--test-concurrency=1` (pinned in package.json's `test` script), naming the
shared globals it mutates (`process.env.APPO_CONFIG_HOME`, and for the two
CLI/fetch suites `globalThis.fetch`), and directing readers to run via `npm
test` rather than bare `node --test`. package.json's `test` script already pins
the flag; JSON cannot carry an inline comment, so the requirement is documented
where it is actionable — at the top of each suite that depends on it.

## Skipped Issues

### WR-01: ops.mjs sources the token from the wrong profile under `--env`

**File:** `src/ops.mjs:18,26,31,36,41` (surfaced via `src/cli.mjs`)
**Reason:** already-resolved — fixed prior to this fix run in commit 90d831b
(`env` threaded through all `ops.*` functions and `pollBuild` → `apiFetch`, with
a regression test in `test/auth-cli.test.mjs` asserting `apps create --env
staging` sends the staging token). No further action taken; re-fixing was
explicitly out of scope.
**Original issue:** `ops.mjs` wrappers called `apiFetch(apiBase, method, path,
body)` with no `env` argument, so `storedToken(undefined)` re-resolved the
active profile without the `--env` flag — sending the wrong profile's token
under `--env`. Now resolved.

---

_Fixed: 2026-06-15_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
