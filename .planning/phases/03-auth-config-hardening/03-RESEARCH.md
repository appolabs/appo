# Phase 3: Auth & config hardening - Research

**Researched:** 2026-06-15
**Domain:** Dependency-free Node CLI — evolving a single config gateway into a multi-profile store, adding non-interactive auth (`APPO_TOKEN` / `login --token`), server-side logout revoke, env-named 401 messaging, and whoami enrichment, all against a Sanctum-PAT backend whose token semantics were read directly from the sibling `apps-web-app`.
**Confidence:** HIGH — every backend claim (revoke endpoint, ability, status codes, no-expiry, no self-identity endpoint, PAT abilities) was read from the canonical source in `../apps-web-app`; the Node refactor is local code with a working test harness already in place.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Evolve `~/.appo/config.json` from flat `{ token, api_base }` to a profiles structure:
  `{ "current": "<name>", "profiles": { "<name>": { "api_base": "...", "token": "..." } } }`.
- **D-02:** Active-profile selection precedence: `--env <name>` flag > `APPO_ENV` env > `current` in config > `"default"`.
- **D-03:** Read-time normalization of legacy flat config: when `config.json` has top-level `token`/`api_base` and no `profiles`, transparently fold it into `profiles.default` and set `current: "default"` on next write. Existing MVP users are NOT logged out. One code path, old shape deleted on write (not versioned migration code).
- **D-04:** Minimal profile management: `--env <name>` selects; `appo login --env <name>` creates/updates; `appo env list` shows profiles (active marked, tokens never printed); `appo env use <name>` sets `current`. No clobbering — login into a new `--env` adds a profile, never overwrites another.
- **D-05:** `api_base` is per-profile; `--api`/`APPO_API_BASE` still win for a single invocation (precedence unchanged); a profile's stored `api_base` is the default for that env.
- **D-06:** `APPO_TOKEN` env var: when set, it is the token `apiFetch` uses — highest precedence, ephemeral, never written to disk. Pairs with `APPO_API_BASE`/`--api` for the base.
- **D-07:** `appo login --token <pat>`: stores the PAT into the active/`--env` profile WITHOUT the device flow. Validate first with one authed call (e.g. `GET /api/v1/apps`); on 401 refuse and do not store. `<pat>` never echoed/logged.
- **D-08:** Token precedence used by `apiFetch`: `APPO_TOKEN` env > active profile's stored token.
- **D-09:** Sanctum PATs do NOT expire (`config/sanctum.php` `expiration => null`); NO refresh-token mechanism. "Expiry/refresh handling" = robust detection only — do NOT build a refresh flow. Any 401 surfaces a clear re-login path naming the active environment, e.g. `Token for env 'production' was rejected — run 'appo login'`.
- **D-10:** `appo logout` calls `DELETE /api/v1/user/tokens/current` (revokes server-side via `destroyCurrent`), THEN clears the token from the active profile locally.
- **D-11:** Failure handling: if the revoke call fails (network error or token already invalid → 401), still clear the local token but WARN that server-side revocation could not be confirmed. Logout acts on the active env (selectable via `--env`); does not touch other profiles.
- **D-12:** `appo whoami` reports active environment name, its `api_base`, and token liveness (validated via one authed call). Includes account identity IF a v1 endpoint exposes the caller's own identity (researcher to confirm); if none exists, whoami reports env + api_base + liveness and the missing identity is a noted backend gap (Claude's Discretion), not a blocker.
- **D-13:** Keep `~/.appo/config.json` owner-only (dir 0700 / file 0600). `APPO_TOKEN` never written to disk. `--token` and stored PATs never printed by `whoami`/`env list` or logged.

### Claude's Discretion
- Exact `env list` / `whoami` output formatting.
- Whether `appo env use`/`env list` live under an `env` subcommand vs flat verbs (consistency with existing surface).
- Whether `login --token` validation hits `/apps` vs `/user/tokens` (pick the cheapest authed call).
- whoami identity enrichment shape if/when a self-identity field is found.

### Deferred Ideas (OUT OF SCOPE)
- A true token-refresh flow — not applicable (PATs don't expire, no refresh token).
- `appo logout --all` revoking every profile's PAT at once — nice-to-have; logout is per-env for now.
- A backend self-identity (`/api/v1/user` / `me`) endpoint — if absent, raise as a backend gap on apps-web-app, not built here.
- `appo preview` — Phase 4. Tests/CI for this phase — Phase 5. Packaging — Phase 6.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLI-02 | Auth & config hardening — token expiry/refresh handling, server-side `logout` revoke, multi-environment profiles | Backend revoke endpoint confirmed (`DELETE /user/tokens/current` → 204, `destroyCurrent` deletes `currentAccessToken()`); no-expiry/no-refresh locked (`sanctum.php expiration => null`); 401 the only revoke signal (Handler envelope verified); profiles store shape + legacy normalization + selection precedence designed below; whoami identity gap confirmed (no self-identity endpoint) — whoami reports env+api_base+liveness |
| CLI-07 | Non-interactive auth — `APPO_TOKEN` env and/or `appo login --token <pat>` without a browser | PAT ability parity confirmed: BOTH device-flow tokens (`createCliSessionToken`) and dashboard-minted PATs (`createPersonalAccessToken`) carry `TokenAbility::User` — a pasted PAT works for every verb incl. `appo ship`; cheapest validation call identified; `APPO_TOKEN` ephemeral precedence designed; PAT mint path documented (`POST /api/v1/user/tokens`, web-session only) |
</phase_requirements>

## Summary

The user-facing goal is "production-grade auth," but the implementation is overwhelmingly **local Node work in one file** (`src/config.mjs`) plus three small touch-points (`apiFetch` token source + 401 message, a `login --token` branch, a `logout` revoke call, a `whoami`/`env` surface). The backend already provides everything needed and was verified from source — there is no backend change in scope and no new HTTP contract to invent beyond one already-shipped revoke endpoint.

Three backend facts lock the design and remove the riskiest unknowns:

1. **No expiry, no refresh** `[VERIFIED: config/sanctum.php:49 expiration => null]`. The only signal a token is dead is a **401**, whose envelope is `{ error:'unauthorized', code:'unauthenticated', message }` `[VERIFIED: app/Exceptions/Handler.php:88-113]`. So D-09 is correct: do not build a refresh flow; enrich the existing 401 message with the active env name.

2. **Server-side revoke exists and is exactly D-10**: `DELETE /api/v1/user/tokens/current` → `UserTokenController::destroyCurrent` deletes `$request->user()->currentAccessToken()` and returns **204** `[VERIFIED: UserTokenController.php:79-96, routes/api_v1.php:81-82]`. It is `auth:sanctum` + `ability:user`, idempotent (returns 204 even when the bearer is not a PAT). Calling it with an already-invalid token never reaches the controller — Sanctum auth fails first → **401** (so D-11's "warn but still clear locally" path is the real one).

3. **PAT abilities are uniform** — both the device-flow CLI-session token and a dashboard-minted PAT are created via `createToken($name, [TokenAbility::User->value])` `[VERIFIED: User.php:132-147]`. They differ only by a cosmetic `token_type` column (`cli_session` vs `personal_access_token`). **A user-pasted PAT carries the same `user` ability**, so `APPO_TOKEN`/`--token` authenticates the entire verb surface including `appo ship`. This makes CLI-07 viable with zero ability negotiation.

The one honest gap: **there is no v1 self-identity endpoint** (no `/api/v1/user`, no `/me`). `GET /user/tokens` returns only token metadata (`id, name, type, last_used_at, created_at` — no user field) `[VERIFIED: UserTokenResource.php]`, and the device-token response returns only `{ access_token, token_type }` — no email/name `[VERIFIED: DeviceCodeController.php:96-98]`. So per D-12, `whoami` reports **env + api_base + liveness ("authenticated, N app(s)")** and identity is a documented backend gap, not a blocker.

**Primary recommendation:** Do the entire phase by restructuring `src/config.mjs` into a profile-aware gateway with five exported helpers (`readConfig` with read-time normalization, `activeProfileName`, `resolveApiBase`, `storedToken`, plus profile writers), then make four surgical edits: `apiFetch` token source (`APPO_TOKEN > profile token`) + env-named 401 message; a `login --token` non-device branch that validates then stores; a `logout` that calls `destroyCurrent` then always clears locally; and a `whoami`/`env list`/`env use` surface. Delete the old flat readers entirely (CLAUDE.md: no dual definitions). All of it is testable with the existing `node:test` + `globalThis.fetch` stub harness plus an isolated config path.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Profile store shape, read/write, legacy normalization | CLI (`config.mjs`) | — | Pure local file management; backend has no notion of CLI profiles |
| Active-profile selection (`--env`/`APPO_ENV`/`current`/`default`) | CLI (`config.mjs` + `cli.mjs` flag wiring) | — | Precedence is a client concern; D-02 |
| Token source resolution (`APPO_TOKEN` > profile token) | CLI (`config.mjs`/`api.mjs`) | — | `APPO_TOKEN` is ephemeral env; never persisted; D-06/D-08 |
| API base precedence | CLI (`config.mjs`) | — | `--api`/`APPO_API_BASE` > per-profile `api_base` > default; D-05 |
| 401 detection + env-named message | CLI (`api.mjs`) | API (emits 401) | API owns the 401; CLI owns the actionable re-login wording naming the env; D-09 |
| Server-side token revoke | API (`destroyCurrent`) | CLI (issues DELETE + clears local) | Revocation is a backend mutation; CLI orchestrates + guarantees local clear; D-10/D-11 |
| `login --token` validation | API (validates via any authed call) | CLI (issues the probe, decides store/refuse) | API is the only authority on token validity; CLI must not guess; D-07 |
| whoami liveness | API (`GET /apps` authed) | CLI (renders env/api_base + count) | Liveness == one authed call; identity gap is backend-side; D-12 |
| PAT minting (for `APPO_TOKEN`/`--token`) | API (`POST /user/tokens`, web-session) + Dashboard UI | CLI (documents the path only) | Mint is session-only — Bearer cannot mint (anti-escalation); CLI just consumes the result; D-06/D-07 |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node built-in `node:fs`/`node:os`/`node:path` | core (Node ≥18; local v22.12.0) `[VERIFIED: 01-RESEARCH node --version]` | Config read/write, 0700/0600 perms | Already the entire `config.mjs` implementation |
| Node built-in `fetch` | Node ≥18 | revoke DELETE, `--token` validation probe, whoami liveness | Already used by `apiFetch`/`login` |
| Node built-in `process.env` | core | `APPO_TOKEN`, `APPO_ENV`, `APPO_API_BASE` | Already read for `APPO_API_BASE` |
| `node:test` + `node:assert` | core | config-store + auth-flow tests | Already the project's test runner (`package.json` `node --test`) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| existing `test/helpers/mockFetch.mjs` | in-repo | stub `globalThis.fetch`, save/restore real config | Reuse + extend for revoke/validate/precedence tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled profiles in one JSON file | `keytar` / OS keychain, `conf`, `configstore` | All are dependencies — forbidden (dependency-free non-negotiable). The 0700/0600 owner-only file is the project's chosen security model; keep it. Do not add. |
| `process.env.APPO_TOKEN` direct read | a dotenv loader | dotenv is a dep and unnecessary; CI sets real env vars. Do not. |
| Per-invocation env override via flag | a stored "active token" mirror | `APPO_TOKEN` must stay ephemeral (D-06) — never mirror it into the file. |

**Installation:** None. Zero new dependencies. `[VERIFIED: PROJECT.md + CLAUDE.md dependency-free non-negotiable]`

**Version verification:** No npm packages to verify — dependency-free by mandate. Node floor `>=18` already pinned in `package.json` `engines`.

## The Backend Contract (verified, load-bearing)

### Token expiry / refresh — there is none
`[VERIFIED: config/sanctum.php:49 'expiration' => null]` — PATs never expire. No refresh-token grant exists anywhere in `routes/api_v1.php` or the OAuth device controllers. **The only "token is dead" signal is a 401.** D-09 is correct: detect 401, never refresh.

### 401 envelope (the signal to enrich)
`[VERIFIED: app/Exceptions/Handler.php:88-113]` — an unauthenticated/revoked/invalid Bearer yields:
```json
{ "error": "unauthorized", "code": "unauthenticated", "message": "..." }
```
status **401**. `apiFetch` already extracts `payload.message || payload.error` and attaches `err.status`/`err.envelope`. D-09 just changes the 401 fallback string to name the active env.

### Server-side revoke — `DELETE /api/v1/user/tokens/current`
`[VERIFIED: routes/api_v1.php:80-82, UserTokenController.php:79-96]`
- Route name `user.tokens.destroy-current`; middleware `['auth:sanctum', 'ability:user']`.
- `destroyCurrent()` reads `$request->user()->currentAccessToken()`; if it's a `PersonalAccessToken`, logs to the `security` channel and `$token->delete()`; returns **`204 No Content`**.
- **Idempotent:** if the current token is somehow not a PAT, it still returns 204.
- **Already-invalid token:** auth middleware rejects before the controller runs → **401** (the route is `auth:sanctum`). So a logout with a dead token returns 401, not 204 — exactly D-11's "could not confirm" case. **Still clear locally and warn.**
- Success status to handle in the CLI: **204** (apiFetch returns `null`). Treat 204 as confirmed revoke; treat 401 (and any network error) as "clear locally + warn."

### `login --token` validation — cheapest authed call
`[VERIFIED: routes/api_v1.php]` Both candidates are behind `auth:sanctum`/`ability:user`:
- `GET /api/v1/apps` → `200 { data:[...] }` (list, also doubles as the whoami liveness/count call).
- `GET /api/v1/user/tokens` → `200 { data:[...token metadata...] }` (dual-auth session-or-Bearer; ability enforced in-controller).
**Recommendation:** validate `--token` with `GET /api/v1/apps` — it's the same call `whoami` already uses, returns a count for free, and a bad token returns a clean **401**. (Discretion D-12 confirmed: pick `/apps`.) Reuse `apiFetch`; on `err.status === 401` refuse and do not store; on success store into the active/`--env` profile.

### PAT abilities — uniform `user`, so a pasted PAT is fully capable
`[VERIFIED: User.php:122-147]`
```php
createPersonalAccessToken($name) → createUserToken(PersonalAccessToken, $name)
createCliSessionToken($clientName) → createUserToken(CliSession, $clientName)
createUserToken(...) → $this->createToken($name, [TokenAbility::User->value]); // SAME ability
```
The two token types differ only by the `token_type` column (`personal_access_token` vs `cli_session`). **Both carry `TokenAbility::User`** — the same ability all 8 lifecycle verbs require (`ability:user` middleware). Therefore a user-pasted PAT in `APPO_TOKEN`/`--token` runs every verb, including `appo ship`. No ability handling needed in the CLI.

### How a user mints a PAT (for `APPO_TOKEN`/`--token`)
`[VERIFIED: routes/api_v1.php:65-68, UserTokenController.php:39-49, StoreUserTokenRequest.php]`
- `POST /api/v1/user/tokens` body `{ "name": "<string,max:255>" }` → `201 { id, name, type:'personal_access_token', plaintext_token }`.
- **Critical:** this route is `['auth', 'verified', 'throttle:user-token-mint']` — **web-session only**. A Bearer PAT **cannot** mint another PAT (deliberate privilege-escalation guard). So users mint a PAT via the **dashboard** (browser session) and copy the `plaintext_token` once. The CLI does not (and cannot) mint a PAT non-interactively; it only consumes one. Document this in help/usage: "Create a PAT in the dashboard, then `appo login --token <pat>` or set `APPO_TOKEN`."

### whoami identity — no self-identity endpoint (documented gap)
`[VERIFIED: routes/api_v1.php — no /user or /me route; UserTokenResource.php; DeviceCodeController.php:96-98]`
- No `GET /api/v1/user` or `/me` exists.
- `GET /user/tokens` returns `{ id, name, type, last_used_at, created_at }` per token — **no user email/name**.
- The device-token response is `{ access_token, token_type:'Bearer' }` — **no identity**.
- The `User` model *has* `name`/`email` (`User.php:51-52`) but nothing on v1 exposes the caller's own record.
**Per D-12:** `whoami` reports **active env name + api_base + liveness** ("authenticated — N app(s)" on 200, "token rejected — run `appo login`" on 401). Identity enrichment is a **backend gap** to raise on apps-web-app (a small `GET /api/v1/user` returning `{ name, email }` behind `ability:user`), not built here. `[ASSUMED: that adding such an endpoint is the right backend fix — it's a suggestion, not in this phase's scope]`

## Architecture Patterns

### System Architecture Diagram (data flow)

```
  argv ──> parseArgs() ──> { command, sub, rest, flags(--env,--token,--api) }
                                  │
                                  ▼
                  activeProfileName(flags.env)        ← --env > APPO_ENV > current > "default"
                                  │
              ┌───────────────────┼─────────────────────────────────────┐
              │                   │                                       │
      resolveApiBase(flag,env)  storedToken(env)                   command switch
       --api>APPO_API_BASE>     APPO_TOKEN(env, ephemeral) >              │
       profile.api_base>default profile[env].token                       │
              │                   │                                       │
              └─────────┬─────────┘                                      │
                        ▼                                                 │
              apiFetch(apiBase, METHOD, path, body, {tokenForEnv})        │
                        │                                                 │
                  fetch() Bearer ── /api/v1/...                           │
                        │                                                 │
            ┌───────────┴───────────┐                                     │
          2xx                    401  ──► message names active env ───────┤  (D-09)
            │                         "Token for env 'X' rejected — run appo login"
            ▼                                                             │
   ┌────────┴───────────────────────────────────────────────────────────┘
   │
   ├─ login (device)  → writeProfile(env, {api_base, token})           (D-03 write normalizes legacy)
   ├─ login --token   → validate via GET /apps → 401? refuse : writeProfile(env,{token})  (D-07)
   ├─ logout          → DELETE /user/tokens/current (204 ok / 401|err warn) → clearProfileToken(env)  (D-10/D-11)
   ├─ whoami          → GET /apps → render env+api_base+count          (D-12)
   ├─ env list        → readConfig() → list names, mark current, NEVER print tokens  (D-04/D-13)
   └─ env use <name>  → writeConfig({...cfg, current:name})            (D-04)
```

### Recommended Project Structure
```
src/
├── config.mjs    # RESTRUCTURED: profile-aware gateway. readConfig (legacy-normalizing),
│                 #   activeProfileName, resolveApiBase, storedToken, writeProfile,
│                 #   clearProfileToken, setCurrent. Old flat readers DELETED.
├── api.mjs       # apiFetch: token source = APPO_TOKEN > storedToken(env); 401 message
│                 #   names the active env. (One new param or a small token-resolver call.)
├── login.mjs     # device login unchanged + a new exported loginWithToken(apiBase, env, pat)
├── cli.mjs       # login --token branch; logout revoke; whoami enrich; env list/use; --env wiring; USAGE
└── ops.mjs       # unchanged (transport for lifecycle verbs)
```

### Pattern 1: Read-time legacy normalization (D-03) — never logs anyone out
**What:** `readConfig()` detects the flat shape and returns a normalized in-memory profiles object; the old shape is only deleted on the next `writeConfig`.
**When to use:** Every read. It's the single seam that protects existing MVP users.
**Example:**
```javascript
// Source: src/config.mjs (this phase). One code path; no versioned migration fn.
export function readConfig() {
  let raw = {};
  if (existsSync(CONFIG_PATH)) {
    try { raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')); } catch { raw = {}; }
  }
  // Legacy flat shape: top-level token/api_base, no profiles → fold into default.
  if (!raw.profiles && (raw.token || raw.api_base)) {
    return {
      current: 'default',
      profiles: { default: { api_base: raw.api_base ?? null, token: raw.token ?? null } },
    };
  }
  // Already-profiles, or empty.
  if (!raw.profiles) return { current: raw.current ?? 'default', profiles: {} };
  return { current: raw.current ?? 'default', profiles: raw.profiles };
}
```
> The normalized shape is what every other helper consumes — they never see the flat shape. The flat keys disappear from disk the first time anything writes (login/logout/env use), without a logout.

### Pattern 2: Active-profile resolution (D-02)
```javascript
// --env flag > APPO_ENV > config.current > "default"
export function activeProfileName(flagEnv) {
  return (typeof flagEnv === 'string' && flagEnv) ||
         process.env.APPO_ENV ||
         readConfig().current ||
         'default';
}
```

### Pattern 3: Profile-aware resolvers (signature evolution, D-05/D-08)
**Current:** `resolveApiBase(flagValue)`, `storedToken()` — no env awareness.
**Evolved:** both take the resolved env name (or the `--env` flag) so one invocation is consistent.
```javascript
// api_base: --api > APPO_API_BASE > profile.api_base > default
export function resolveApiBase(flagValue, env = activeProfileName()) {
  const prof = readConfig().profiles[env] || {};
  const value = flagValue || process.env.APPO_API_BASE || prof.api_base || DEFAULT_API_BASE;
  return value.replace(/\/+$/, '');
}

// token: APPO_TOKEN (ephemeral, never persisted) > profile.token
export function storedToken(env = activeProfileName()) {
  if (process.env.APPO_TOKEN) return process.env.APPO_TOKEN;   // D-06/D-08
  return readConfig().profiles[env]?.token ?? null;
}
```
> `apiFetch` calls `storedToken(env)` instead of `storedToken()`. The cleanest plumbing is for `run()` to compute `env = activeProfileName(flags.env)` once and thread it (or its token) into `apiFetch`. Keep `apiFetch`'s existing throw-on-missing-token guard.

### Pattern 4: Non-clobbering profile writers (D-04)
```javascript
export function writeProfile(env, patch) {            // merge, never replace siblings
  const cfg = readConfig();
  cfg.profiles[env] = { ...(cfg.profiles[env] || {}), ...patch };
  if (!cfg.current) cfg.current = env;
  writeConfig(cfg);                                   // existing 0700/0600 writer, unchanged
}
export function clearProfileToken(env) {              // logout: drop token, keep api_base
  const cfg = readConfig();
  if (cfg.profiles[env]) { delete cfg.profiles[env].token; writeConfig(cfg); }
}
export function setCurrent(env) {
  writeConfig({ ...readConfig(), current: env });
}
```
> `login --env staging` writes `profiles.staging` and leaves `profiles.production` untouched — that's the "no clobbering" load-bearing requirement.

### Pattern 5: logout = revoke-then-always-clear (D-10/D-11)
```javascript
// Source: DELETE /user/tokens/current (204) + D-11 "always clear locally"
case 'logout': {
  const env = activeProfileName(flags.env);
  try {
    await apiFetch(apiBase, 'DELETE', '/api/v1/user/tokens/current');  // 204 → null
    console.log(`Logged out of '${env}' — token revoked server-side and cleared.`);
  } catch (err) {
    // 401 (already invalid) or network error → cannot confirm revoke, but still clear.
    console.warn(`Could not confirm server-side revocation for '${env}' (${err.message}). Clearing local token anyway.`);
  } finally {
    clearProfileToken(env);   // NEVER leave a stale token on disk
  }
  return 0;
}
```

### Pattern 6: env-named 401 message (D-09, in apiFetch)
```javascript
// apiFetch already has `payload`, `res.status`. The only change is the 401 fallback string.
const msg =
  payload?.message ||
  payload?.error ||
  (res.status === 401
    ? `Token for env '${env}' was rejected — run \`appo login\`.`   // D-09: name the env, never the token
    : `Request failed (${res.status}).`);
```
> `env` must be available to `apiFetch`. Pass it as an argument (cleanest) or have the caller pre-resolve. Do NOT include any token substring in the message (D-13).

### Anti-Patterns to Avoid
- **Versioned migration code** for the legacy config (`readConfigV1`, `migrateConfig`). Do read-time normalization in the single `readConfig`; delete the flat readers (CLAUDE.md: no `processV2`/dual definitions).
- **Persisting `APPO_TOKEN`.** It is ephemeral by mandate (D-06). Never write it into a profile, never mirror it.
- **Leaving the local token on a failed revoke.** D-11 is explicit: always clear locally. The `finally` block is load-bearing.
- **Printing or logging the PAT** anywhere — `whoami`, `env list`, error messages, the `--token` echo. (PROJECT non-negotiable + D-13.)
- **Building a refresh flow.** There is no refresh token (D-09 verified). A 401 means re-login, full stop.
- **Clobbering another profile** on `login --env`. Merge into the named profile only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Owner-only file persistence | New perms logic | existing `writeConfig` (mkdir 0700, chmod 0600) | Already correct; reuse unchanged |
| HTTP auth + 401 extraction + envelope | A second fetch wrapper for revoke/validate | existing `apiFetch` | Already handles Bearer, 204→null, JSON parse, `err.status`/`err.envelope` |
| Token validity check | A JWT/expiry parser client-side | one authed call → trust 401 | PATs are opaque Sanctum tokens with no client-readable expiry; only the server knows validity |
| Secret storage | OS keychain integration (keytar) | the 0600 JSON file | Adds a native dep; project chose the file model; out of scope to change |
| Env-var parsing | dotenv | `process.env` directly | CI sets real env; dotenv is a dep |
| Config-test isolation | a bespoke temp-fs mock | extend existing `mockFetch.mjs` save/restore + an isolated `APPO_CONFIG`-style path | Harness already saves/restores the real config; build on it |

**Key insight:** This phase adds almost no new *kind* of code — it restructures one data shape and re-points three existing seams (token source, 401 string, one new endpoint call). The risk is entirely in (a) not logging existing users out during normalization and (b) never leaking/persisting the token. Both are covered by patterns above and are directly testable.

## Runtime State Inventory

> This phase changes the on-disk shape of `~/.appo/config.json` (flat → profiles), so it IS a data-shape migration for user data. Each category checked explicitly:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `~/.appo/config.json` exists on every current MVP user's machine in the **flat** `{ token, api_base }` shape. The phase must read it without logging them out (D-03). | **Read-time normalization in `readConfig`** (code, not a one-shot migration). Old flat keys deleted on next write. No separate data-migration task — the read path handles existing files transparently. `[VERIFIED: src/config.mjs current shape; src/login.mjs writes flat]` |
| Live service config | Server-side tokens: device-flow tokens already exist in `personal_access_tokens` (type `cli_session`). `logout` now **deletes** the current one server-side (new behavior). Other profiles' tokens are NOT touched (D-11). | None to pre-migrate — revoke is per-invocation. Note: pre-Phase-3 `logout` only deleted the local file, so existing users may have **orphaned server-side `cli_session` tokens** from past local-only logouts. Not in scope to clean up; mention as a known harmless residue (they're usable until revoked, owner-only). `[VERIFIED: UserTokenController.destroyCurrent]` |
| OS-registered state | None — no daemons, schedulers, services, or registered processes. `[VERIFIED: no such code in repo]` | None |
| Secrets/env vars | New env vars **read** (never written): `APPO_TOKEN` (ephemeral token, D-06), `APPO_ENV` (active profile, D-02). `APPO_API_BASE` already read. No secret *key* renames. CI/agents set these in their environment. | Document in USAGE; no migration. `[VERIFIED: src/config.mjs reads APPO_API_BASE today]` |
| Build artifacts | None — `.mjs` run directly via `bin/appo.mjs`; no compiled output, no `.egg-info`/dist. `[VERIFIED: package.json files=[bin,src,README]]` | None |

**The canonical question — after every file is updated, what runtime state still holds the old shape?** Answer: each user's existing `~/.appo/config.json` on disk (flat shape). The read-time normalizer is the single mechanism that handles it; verified that it preserves the token (no logout). No OS/service/secret-key residue beyond possibly-orphaned server tokens from past local-only logouts (harmless, out of scope).

## Common Pitfalls

### Pitfall 1: Normalization logs existing users out
**What goes wrong:** The flat→profiles rewrite drops the existing `token`, forcing a re-login.
**Why it happens:** Treating it as a "reset to new shape" instead of folding the existing values into `profiles.default`.
**How to avoid:** D-03 read-time fold (Pattern 1) — copy `token`/`api_base` into `profiles.default`, set `current:'default'`. Test: write a flat config, call `storedToken()`, assert it returns the old token unchanged.
**Warning signs:** Any test where a pre-existing flat config yields `null` token after a read.

### Pitfall 2: `APPO_TOKEN` leaks onto disk
**What goes wrong:** A `writeProfile`/`login` path persists the ephemeral env token, defeating D-06 and possibly writing a CI secret into a dev's home dir.
**Why it happens:** `storedToken()` returns `APPO_TOKEN` and a write path naively re-saves "the current token."
**How to avoid:** `APPO_TOKEN` is read-only at the `storedToken` seam; no writer ever sources from it. Login writes only the device/`--token` value. Test: set `APPO_TOKEN`, run a verb, assert `~/.appo/config.json` (isolated path) is unchanged / contains no `APPO_TOKEN` value.

### Pitfall 3: logout leaves a stale local token when revoke fails
**What goes wrong:** Revoke returns 401 (token already dead) or the network is down; code throws and skips the local clear, leaving a dead token on disk.
**Why it happens:** Clearing only in the success branch.
**How to avoid:** D-11 — clear in a `finally` (Pattern 5). Test: stub `DELETE` → 401, assert local token is gone AND a warning was printed AND exit 0.

### Pitfall 4: 401 message leaks the token or omits the env
**What goes wrong:** Trying to "help" by printing the token prefix, or a generic "token rejected" with no env name (confusing with multiple profiles).
**Why it happens:** Over-eager debugging output / forgetting the env is the whole point of D-09.
**How to avoid:** Message names the env, never any token substring (Pattern 6). Test: stub a 401, assert message matches `/env '...' was rejected/` and does NOT contain the stub token string.

### Pitfall 5: `env list` prints tokens
**What goes wrong:** Dumping the profile object (which contains `token`) for "completeness."
**Why it happens:** `JSON.stringify(profiles)` convenience.
**How to avoid:** Render only `name (active?) → api_base` per profile; never the token (D-04/D-13). Test: stub two profiles with tokens, capture `env list` output, assert neither token string appears.

### Pitfall 6: `login --token` stores a bad token
**What goes wrong:** Storing the pasted PAT before validating, so a typo'd token gets persisted and every later call 401s.
**Why it happens:** Skipping the validation probe.
**How to avoid:** D-07 — validate via `GET /api/v1/apps` first; on 401 refuse and do NOT write. Test: stub `GET /apps` → 401, assert nothing written + non-zero exit + refusal message; stub → 200, assert token stored in the target profile.

### Pitfall 7: `apiFetch` doesn't know the active env
**What goes wrong:** `apiFetch` calls `storedToken()` with no env, defaulting to `current` even when `--env staging` was passed → wrong token/base for the invocation.
**Why it happens:** `apiFetch`/`storedToken` signatures not threaded with the resolved env.
**How to avoid:** Resolve `env` once in `run()` from `flags.env` and thread it (Pattern 3). Test: with `current='production'` and `--env staging`, assert the request carries the staging token + base.

## Code Examples

### `login --token` non-device branch (validate then store)
```javascript
// Source: D-07 + GET /api/v1/apps (auth:sanctum, ability:user) returns 401 on bad token
case 'login': {
  const env = activeProfileName(flags.env);
  if (typeof flags.token === 'string' && flags.token) {
    const pat = flags.token;                       // never echoed/logged
    // Validate against the active env's base, using THIS pat (not stored).
    try {
      await apiFetchWithToken(apiBase, 'GET', '/api/v1/apps', null, pat);
    } catch (err) {
      if (err.status === 401) { console.error(`Token rejected by ${apiBase} — not stored.`); return 1; }
      throw err;                                   // network/other → top-level renderError
    }
    writeProfile(env, { api_base: apiBase, token: pat });
    console.log(`Stored token for env '${env}' (${apiBase}).`);
    return 0;
  }
  // ...existing device flow, but writing into the active profile...
  const { apiBase: base } = await login(apiBase, env);   // login folds into writeProfile(env, ...)
  console.log(`\n  Authenticated env '${env}'. Connected to ${base}.\n`);
  return 0;
}
```
> `apiFetchWithToken` can be a thin variant of `apiFetch` that takes an explicit token (validation must use the *pasted* token, not the stored one). Alternatively, temporarily resolve through `storedToken` after a tentative write — but validate-before-write is cleaner and matches D-07.

### whoami (env + api_base + liveness; identity is a gap)
```javascript
// Source: D-12 + no v1 self-identity endpoint (verified); GET /apps doubles as liveness
case 'whoami': {
  const env = activeProfileName(flags.env);
  const token = storedToken(env);
  if (!token) { console.log(`No token for env '${env}'. Run \`appo login\`.`); return 1; }
  try {
    const apps = unwrap(await apiFetch(apiBase, 'GET', '/api/v1/apps')) || [];
    console.log(`env:       ${env}`);
    console.log(`api_base:  ${apiBase}`);
    console.log(`status:    authenticated — ${apps.length} app(s)`);
    // No identity field available from v1 (backend gap, D-12). Token NEVER printed.
    return 0;
  } catch (err) {
    if (err.status === 401) { console.log(`env '${env}': token rejected — run \`appo login\`.`); return 1; }
    throw err;
  }
}
```

### `env list` / `env use`
```javascript
// Source: D-04/D-13 — active marked, tokens NEVER printed
case 'env': {
  const cfg = readConfig();
  if (sub === 'list' || sub === undefined) {
    for (const [name, p] of Object.entries(cfg.profiles)) {
      const mark = name === cfg.current ? '*' : ' ';
      console.log(`  ${mark} ${name.padEnd(16)} ${p.api_base ?? '(default)'}`);  // no token
    }
    return 0;
  }
  if (sub === 'use') {
    const name = rest[0];
    if (!name) { console.error('Usage: appo env use <name>'); return 2; }
    if (!cfg.profiles[name]) { console.error(`No such env '${name}'. Run \`appo login --env ${name}\` first.`); return 2; }
    setCurrent(name);
    console.log(`Active env: ${name}.`);
    return 0;
  }
  console.error(`Unknown env subcommand: ${sub}`); return 2;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat `{ token, api_base }` config | `{ current, profiles:{ name:{ api_base, token } } }` | This phase (D-01) | Multi-env without clobbering; read-time normalization protects existing users |
| `logout` = delete local file only | `logout` = revoke server-side (`destroyCurrent`) then clear local | This phase (D-10) | Tokens no longer orphaned server-side on logout |
| Browser-only device flow | + `APPO_TOKEN` env and `login --token <pat>` | This phase (D-06/D-07) | CI/agents authenticate headless; every verb incl. `ship` works |
| Generic "Token rejected" 401 | Env-named "Token for env 'X' rejected" | This phase (D-09) | Disambiguates which profile failed |

**Deprecated/outdated:** The flat-config readers (`resolveApiBase().api_base`, `storedToken()` reading top-level `token`) are replaced — **delete them**, no dual definitions (CLAUDE.md). The flat *on-disk* shape is not "deprecated" so much as transparently upgraded on next write.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Adding a `GET /api/v1/user` `{name,email}` endpoint is the right backend fix for whoami identity | whoami gap / D-12 | Low — it's a suggestion to raise upstream, explicitly out of scope; whoami ships without it |
| A2 | Exact `env list`/`whoami` output formatting (column layout, wording) | Code Examples | Low — Claude's Discretion per CONTEXT |
| A3 | `env` is a subcommand (`env list`/`env use`) vs flat verbs | env surface | Low — Claude's Discretion (D-04); subcommand chosen for namespacing, planner may flatten |
| A4 | Pre-Phase-3 users may have orphaned server-side `cli_session` tokens from past local-only logouts; harmless and out of scope to clean | Runtime State Inventory | Low — they remain owner-scoped and usable; no security regression |

> All backend contract claims (revoke endpoint+status, no-expiry, no-refresh, 401 envelope, PAT abilities, no self-identity endpoint, PAT mint path) are `[VERIFIED]` against `../apps-web-app` source — not assumed.

## Open Questions (RESOLVED)

1. **Cheapest `--token` validation call (D-07 discretion).**
   - RESOLVED: `GET /api/v1/apps` — same call whoami uses, returns the app count, clean 401 on bad token. (vs `/user/tokens` which is dual-auth and returns only token metadata.)

2. **Does any v1 endpoint expose the caller's own identity (D-12)?**
   - RESOLVED: **No.** No `/user` or `/me`; `/user/tokens` and the device-token response carry no user email/name. whoami reports env+api_base+liveness; identity is a documented backend gap (A1).

3. **Will a user-pasted PAT run every verb including `appo ship` (D-06)?**
   - RESOLVED: **Yes.** Both token types carry `TokenAbility::User`; the entire `/api/v1` lifecycle surface is `ability:user`. No ability handling needed.

4. **What status does a successful logout-revoke return, and what about an already-dead token?**
   - RESOLVED: **204** on success (apiFetch → null); an already-invalid token yields **401** from the auth middleware (D-11's warn+clear path). Network errors also fall to warn+clear.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (built-in `fetch`/`fs`/`os`/`path`) | all | ✓ | v22.12.0 (floor ≥18) | — |
| `node:test` runner | tests | ✓ | core | — |
| `../apps-web-app` source | planning/contract reference | ✓ | — | — |
| `/api/v1` backend (revoke, validate, liveness) | live execution | ✓ (shipped) | v1 | tests mock `fetch`; no live backend needed to verify |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None — all flows mockable via the existing fetch stub.

## Validation Architecture

> Two test surfaces: (1) **config-store behavior** (profiles read/write, legacy normalization, env-var precedence) — pure local, no HTTP; and (2) **auth flows** (logout revoke, `--token` validate, whoami, env-named 401) — HTTP via the existing `globalThis.fetch` stub. Both must run without touching the real `~/.appo/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert` (built-in, zero-dep) — already the project runner |
| Config file | none (`package.json`: `node --test --test-concurrency=1 "test/**/*.test.mjs"`) |
| Quick run command | `node --test test/config.test.mjs` (the touched area) |
| Full suite command | `npm test` (i.e. `node --test --test-concurrency=1 "test/**/*.test.mjs"`) |

### Isolating the real `~/.appo/config.json`
The existing `mockFetch.mjs` `stubToken`/`resetMockFetch` already **save the real config bytes and restore them on reset** — that discipline is the baseline. For profile tests that write/read many shapes, prefer **a configurable config path** so tests never go near the real home dir:

- **Recommended:** add an `APPO_CONFIG` (or `APPO_CONFIG_DIR`) env override in `config.mjs` so `CONFIG_PATH` resolves to it when set. Tests point it at a `node:os.tmpdir()` file, write/read freely, and delete it in teardown. This also gives users a documented escape hatch (CI can pin a config path). `[recommended — small, dependency-free, and makes the store trivially testable]`
- **Fallback (no new env):** reuse the `stubToken` save/restore pattern verbatim — snapshot the real file (or its absence) before each test, restore after. Already proven in the harness; works but couples tests to the real path.

`--test-concurrency=1` is already set (serial), so a single shared config path / save-restore is safe across files.

### Stubbing `APPO_TOKEN` / `APPO_ENV` and the revoke/validate fetches
- **Env vars:** in `node:test`, set `process.env.APPO_TOKEN = 'x'` / `process.env.APPO_ENV = 'staging'` inside a test and `delete` them in `finally` (serial run makes this safe). Assert precedence: with both a profile token and `APPO_TOKEN` set, the recorded request's `Authorization` header carries `APPO_TOKEN`.
- **Revoke (`DELETE /user/tokens/current`):** `installMockFetch({ status: 204, body: null })` → assert local token cleared + success message. Then `installMockFetch({ status: 401, body: { error:'unauthorized', code:'unauthenticated' } })` → assert token STILL cleared + warning + exit 0 (D-11).
- **`--token` validate:** queue a `GET /apps` response. `{status:401}` → assert nothing written + refusal + exit 1. `{status:200, body:{data:[...]}}` → assert token stored in the target profile.
- **env-named 401:** stub any authed verb → `{status:401}`; assert the error message matches the active env name and contains NO token substring.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLI-02 | legacy flat config normalizes to `profiles.default` WITHOUT dropping the token | unit (isolated config) | `node --test test/config.test.mjs` | ❌ Wave 0 |
| CLI-02 | `login --env X` adds a profile; sibling profiles untouched (no clobber) | unit | `node --test test/config.test.mjs` | ❌ Wave 0 |
| CLI-02 | active-profile precedence `--env > APPO_ENV > current > default` | unit | `node --test test/config.test.mjs` | ❌ Wave 0 |
| CLI-02 | `resolveApiBase` precedence `--api > APPO_API_BASE > profile > default` | unit | `node --test test/config.test.mjs` | ❌ Wave 0 |
| CLI-02 | `logout` → 204 revoke → local token cleared + success | contract (mock fetch) | `node --test test/auth.test.mjs` | ❌ Wave 0 |
| CLI-02 | `logout` → 401/network → local token STILL cleared + warning + exit 0 (D-11) | contract | `node --test test/auth.test.mjs` | ❌ Wave 0 |
| CLI-02 | 401 on any verb → message names active env, no token leak (D-09) | unit | `node --test test/auth.test.mjs` | ❌ Wave 0 |
| CLI-02 | `whoami` → 200 prints env+api_base+count; 401 prints re-login; token never printed | contract | `node --test test/auth.test.mjs` | ❌ Wave 0 |
| CLI-02 | `env list` marks active, prints NO tokens; `env use` sets current | unit | `node --test test/config.test.mjs` | ❌ Wave 0 |
| CLI-07 | `APPO_TOKEN` set → `Authorization` uses it AND it is never written to disk (D-06) | contract + unit | `node --test test/auth.test.mjs` | ❌ Wave 0 |
| CLI-07 | `login --token` → 200 stores in target profile; 401 refuses + writes nothing (D-07) | contract | `node --test test/auth.test.mjs` | ❌ Wave 0 |
| CLI-07 | `--env staging` overrides `current=production` for token+base of one invocation | contract | `node --test test/auth.test.mjs` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test test/config.test.mjs` or `test/auth.test.mjs` (the touched area).
- **Per wave merge:** `npm test` (full suite — existing 80+ cases must stay green; nothing the refactor touches should regress them, since they go through `stubToken`).
- **Phase gate:** full `npm test` green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `test/config.test.mjs` — profiles read/write, legacy normalization, precedence, env list/use (CLI-02).
- [ ] `test/auth.test.mjs` — logout revoke (204 + 401), `--token` validate, whoami, env-named 401, `APPO_TOKEN` precedence + non-persistence (CLI-02/CLI-07).
- [ ] `APPO_CONFIG`/`APPO_CONFIG_DIR` override in `config.mjs` (recommended) OR a documented snapshot/restore helper, so config tests never touch the real home file.
- [ ] Extend `mockFetch.mjs` only if needed (it already queues FIFO responses + records `headers`, which covers the `Authorization` assertions).
- Framework install: none — `node:test` is built-in.

## Project Constraints (from CLAUDE.md + PROJECT.md)

> Treat with the same authority as locked decisions.
- **Dependency-free Node CLI** — built-in `fetch`/`http`/`fs`/`os`/`path` only. No keytar/conf/dotenv. `[VERIFIED: PROJECT.md, CLAUDE.md]`
- **Delete old code when replacing** — the flat-config readers are removed; one `readConfig` with read-time normalization, no `migrateConfig`/`readConfigV1` dual definitions. `[VERIFIED: CLAUDE.md "no versioned names / delete old code"]`
- **PAT never logged; owner-only storage** — token never printed by whoami/env list/errors; 0700/0600 preserved; `APPO_TOKEN` never persisted. `[VERIFIED: PROJECT.md non-negotiable + D-13]`
- **Never weaken auth parity** — server-side revoke STRENGTHENS the model; no destructive verb behavior changes. `[VERIFIED: PROJECT.md]`
- **Keep request/response shapes in lockstep with `/api/v1` (no drift)** — revoke/validate use existing v1 paths verbatim. `[VERIFIED: PROJECT.md + routes/api_v1.php]`
- **Concrete, early-return, small focused functions** — per-helper config functions; early `return 2` on bad args. `[VERIFIED: CLAUDE.md]`
- **Repository docs read as neutral** — USAGE/help additions stay neutral. `[VERIFIED: ~/.claude/CLAUDE.md]`

## Sources

### Primary (HIGH confidence)
- `../apps-web-app/config/sanctum.php:49` — `'expiration' => null` (PATs don't expire; D-09).
- `../apps-web-app/routes/api_v1.php:65-95` — token routes: `POST /user/tokens` (web-session mint), `GET /user/tokens` (dual-auth index), `DELETE /user/tokens/{id}`, `DELETE /user/tokens/current` (`destroyCurrent`, `auth:sanctum`+`ability:user`).
- `../apps-web-app/app/Http/Controllers/Api/V1/UserTokenController.php` — `destroyCurrent()` deletes `currentAccessToken()` → 204 idempotent; `store()` → 201 `{id,name,type,plaintext_token}`; `index()` returns `UserTokenResource` collection.
- `../apps-web-app/app/Http/Resources/V1/UserTokenResource.php` — `{ id, name, type, last_used_at, created_at }` — no user identity field.
- `../apps-web-app/app/Models/User.php:122-147` — `createPersonalAccessToken`/`createCliSessionToken` both → `createToken($name, [TokenAbility::User->value])` (uniform ability; only `token_type` differs).
- `../apps-web-app/app/Http/Controllers/Oauth/DeviceCodeController.php:84-98` — device-token response is `{ access_token, token_type:'Bearer' }` — no identity returned.
- `../apps-web-app/app/Exceptions/Handler.php:88-113` — 401 envelope `{ error:'unauthorized', code:'unauthenticated', message }`.
- `../apps-web-app/app/Enums/TokenAbility.php` (`User='user'`), `app/Enums/TokenType.php` (`PersonalAccessToken`, `CliSession`).
- `../apps-web-app/app/Http/Requests/Api/V1/Token/StoreUserTokenRequest.php` — mint body `{ name: required|string|max:255 }`.
- `appo` repo: `src/config.mjs`, `src/api.mjs`, `src/login.mjs`, `src/cli.mjs`, `src/ops.mjs`, `test/helpers/mockFetch.mjs`, `test/foundation.test.mjs`, `package.json` — the surface being hardened + the test harness.
- `.planning/phases/01-operator-command-parity/01-RESEARCH.md` — prior v1 contract (`apiFetch`/`unwrap`, error envelope, exit codes, Node version).

### Secondary (MEDIUM confidence)
- None required — every claim is sourced from primary repo files.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Backend contract (revoke, no-expiry/refresh, 401, PAT abilities, no self-identity, mint path): HIGH — read directly from `../apps-web-app` controllers/models/routes/config.
- Config-store refactor (shape, normalization, precedence, signatures): HIGH — local code; current shape + writers read directly; patterns map 1:1 to D-01..D-05.
- Test strategy: HIGH — existing `node:test` + fetch stub + save/restore proven in `foundation.test.mjs`; only additions are an isolated config path and env-var stubbing (both straightforward).
- whoami identity enrichment shape: LOW (by design — no endpoint exists; A1 is a suggestion, Claude's Discretion).
- Output wording / `env` surface flat-vs-subcommand: LOW (Claude's Discretion).

**Research date:** 2026-06-15
**Valid until:** ~2026-07-15 (stable — backend token semantics are test-pinned on the apps-web-app side; revisit only if Sanctum expiry is enabled or a `/user`/`/me` endpoint is added).
