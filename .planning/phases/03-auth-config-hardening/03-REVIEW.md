---
phase: 03-auth-config-hardening
reviewed: 2026-06-15T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/config.mjs
  - src/api.mjs
  - src/login.mjs
  - src/cli.mjs
  - test/config-profiles.test.mjs
  - test/auth.test.mjs
  - test/auth-cli.test.mjs
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-06-15
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 3 hardens CLI auth: a profile-aware config store with a lazy `configPath()`
getter and read-time legacy normalization, an env-aware token source with an
env-named 401, `loginWithToken`, and the `logout`/`whoami`/`env`/`login --token`
verbs. The full suite (115 cases) passes under the project's
`--test-concurrency=1` setting.

**Token confidentiality (the headline non-negotiable) holds.** Every emit path
was traced — `whoami`, `env list`, `login --token`, `logout` (success + 401 +
network warning), the 401 message in `api.mjs`, and `renderError` — and none
interpolate a PAT or `APPO_TOKEN`. The PAT-leak sweep test
(`auth-cli.test.mjs:259`) plus per-verb `doesNotMatch` assertions encode this.
`APPO_TOKEN` is read-only in `storedToken` (no writer sources it) and is verified
absent from disk (`auth.test.mjs:84`). The owner-only write discipline
(`mkdir 0o700` / `chmod 0o600`) is reapplied on every `writeConfig`.

**Logout is correct:** `DELETE /api/v1/user/tokens/current` then an
unconditional `finally { clearProfileToken(env) }` — the local token is dropped
on 204, 401, and network failure alike, per-env, siblings untouched. All three
paths are tested.

**Legacy normalization and no-clobber are correct:** a flat `{token, api_base}`
folds into `profiles.default` on read (no forced logout), `writeProfile` merges
without disturbing siblings, and `--env > APPO_ENV > current > default`
precedence is encoded and tested.

One real correctness bug warrants a fix: the "resolve env once, thread it
everywhere" invariant is broken for every verb that routes through `ops.mjs`,
because those calls omit the `env` argument to `apiFetch`. The remaining items
are minor UX / dead-code observations.

## Warnings

### WR-01: ops.mjs sources the token from the wrong profile under `--env`

**File:** `src/ops.mjs:18,26,31,36,41` (root cause), surfaced via `src/cli.mjs:399,501,603,617,659`
**Issue:**
`cli.mjs` resolves the active env once (`const env = activeProfileName(flags.env)`)
and documents threading it everywhere (cli.mjs:299–301). Direct `apiFetch` call
sites honor this. But every `ops.mjs` wrapper calls `apiFetch(apiBase, method,
path, body)` with **no `env` argument**. `apiFetch` then calls
`storedToken(undefined)`, whose default parameter re-resolves
`activeProfileName()` — which sees **no `--env` flag** and falls back to
`APPO_ENV || current || 'default'`.

Concrete failure: with `current = 'production'`, running
`appo apps create --env staging --name x --url y` (or `appo build --env staging`,
or `appo ship --env staging …`) uses **staging's `api_base`** (correctly passed
as the explicit `apiBase`) but sends **production's token** as the Bearer
credential. The request authenticates against the staging host with the wrong
profile's PAT. Affected verbs: `apps create`, `build` (human path), and all of
`ship` (create/triggerBuild/getBuild/publishApp). Verbs that call `apiFetch`
directly (logout, whoami, apps list/show/set-name, status, rejection,
fix-recipe, build --json, resubmit, push) are unaffected.

Secondary symptom: a 401 from any ops-routed call reports
`env 'default'` (the `env ?? 'default'` fallback at api.mjs:51) instead of the
real env, so the re-login hint names the wrong profile.

The existing `--env` test (`auth-cli.test.mjs:207`) exercises `whoami`, a direct
`apiFetch` path, so it does not catch this.

**Fix:** thread `env` through `ops.mjs` and pass it to `apiFetch`. Example:
```javascript
// src/ops.mjs
export async function createApp(apiBase, { name, base_url, metadata_name, metadata_description }, env) {
  const body = { name, base_url };
  if (metadata_name) body.metadata_name = metadata_name;
  if (metadata_description) body.metadata_description = metadata_description;
  return unwrap(await apiFetch(apiBase, 'POST', '/api/v1/apps', body, env));
}
// …same trailing `env` param on triggerBuild/getApp/getBuild/publishApp,
// forwarded as the final apiFetch argument.
```
Then update the `cli.mjs` call sites to pass `env`
(`ops.createApp(apiBase, {…}, env)`, `ops.triggerBuild(apiBase, sub, {…}, env)`,
`ops.getBuild(apiBase, appId, buildId, env)` via `pollBuild`,
`ops.publishApp(apiBase, appId, stores, env)`). Add an `--env` regression test
over an ops-routed verb (e.g. `apps create`) asserting the Bearer header carries
the `--env` profile's token, not `current`'s.

## Info

### IN-01: dead branch in `writeProfile` — `cfg.current` is never falsy

**File:** `src/config.mjs:108-110`
**Issue:** `readConfig()` always returns `current: raw.current ?? 'default'`, so
`cfg.current` is never falsy when `writeProfile` reads it. The
`if (!cfg.current) cfg.current = env;` block is unreachable. A side effect of
this is that `appo login --env staging` as the very first action creates the
`staging` profile but leaves `current = 'default'`; a subsequent bare `appo
whoami` then resolves to the empty `default` profile and reports "No token",
which may surprise the user.
**Fix:** either remove the dead branch, or (if first-login-should-activate is the
intended UX) make it meaningful by detecting a freshly-created profile — e.g.
set `current` to `env` when the config had no profiles before this write.

### IN-02: `env list` prints nothing on an empty config

**File:** `src/cli.mjs:371-376`
**Issue:** With no profiles configured, `Object.entries(cfg.profiles)` is empty,
so the loop prints nothing and returns 0 — indistinguishable from a hang or a
silent success.
**Fix:** print a hint when empty, e.g.
`if (Object.keys(cfg.profiles).length === 0) { console.log('No environments yet. Run `appo login`.'); return 0; }`.

### IN-03: `--env=` (empty value via `=`) is silently ignored

**File:** `src/cli.mjs:290-293`, `src/config.mjs:74`
**Issue:** The value-less `--env` guard catches `flags.env === true` (bare flag)
but not `--env=` parsed as `flags.env === ''`. An empty string is falsy in
`activeProfileName`, so selection silently falls through to
`APPO_ENV`/`current`/`default` rather than erroring. Same applies to `--api=`
and `--token=` (the latter would fall through to the device flow instead of
refusing). Low impact (user typo), but inconsistent with the bare-flag guards.
**Fix:** broaden the guards to reject empty strings too, e.g.
`if (flags.env === true || flags.env === '') { … return 2; }` for env/api/token.

### IN-04: suite correctness depends on `--test-concurrency=1` (not self-evident)

**File:** `test/auth.test.mjs`, `test/auth-cli.test.mjs`, `test/config-profiles.test.mjs`
**Issue:** The tests mutate shared global state — `process.env.APPO_CONFIG_HOME`
in `beforeEach`/`afterEach` and `globalThis.fetch` via the mock — with no
per-test isolation beyond ordering. They pass only because `package.json`'s test
script pins `--test-concurrency=1`. Invoking `node --test test/` directly (no
concurrency flag) interleaves tests and corrupts the shared env/fetch, producing
spurious failures. This is a latent foot-gun for anyone running tests outside
`npm test`.
**Fix:** no code change required if the constraint is accepted; document it with
a one-line comment at the top of each suite (e.g. "requires
`--test-concurrency=1`; shares process.env + globalThis.fetch"), as already noted
informally in the file headers. Optionally restore/snapshot the prior
`APPO_CONFIG_HOME` value in `afterEach` instead of unconditionally deleting it.

---

_Reviewed: 2026-06-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
