# Phase 3: Auth & config hardening - Pattern Map

**Mapped:** 2026-06-15
**Files analyzed:** 6 (4 modified, 2 new)
**Analogs found:** 6 / 6 (every file has an in-repo analog; this phase invents no new code *kind*)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/config.mjs` (MODIFY) | config / store gateway | file-I/O (CRUD on one JSON) | itself (current flat readers) | exact — same file, shape evolution |
| `src/api.mjs` (MODIFY) | service / transport | request-response | itself (`apiFetch` 401 path) | exact — same file, message + token-source edit |
| `src/login.mjs` (MODIFY) | service / auth flow | request-response | `login()` device flow + `apps list` validation call | role-match (new non-device branch alongside device flow) |
| `src/cli.mjs` (MODIFY) | controller / dispatcher | request-response | existing `case 'logout'`/`whoami'`/`apps` + `confirmGate` | exact — same switch, new/edited cases |
| `test/config-profiles.test.mjs` (NEW) | test (unit, no HTTP) | file-I/O | `test/foundation.test.mjs` + `stubToken` save/restore | role-match (pure-config unit; no existing config-only suite) |
| `test/auth.test.mjs` (NEW) | test (contract, mock fetch) | request-response | `test/destructive-verbs.test.mjs` (stubToken + installMockFetch + lastRequest) | exact — same harness, new flows |

---

## Pattern Assignments

### `src/config.mjs` (config gateway, file-I/O)

**Analog:** itself — the current flat readers map 1:1 to profile-aware versions. **Delete the flat readers entirely** (CLAUDE.md: no dual definitions, no `readConfigV1`/`migrateConfig`).

**Keep unchanged** (`src/config.mjs:1-8`, `:22-33`, `:52`):
- The `node:fs`/`os`/`path` imports.
- `CONFIG_DIR`/`CONFIG_PATH`/`DEFAULT_API_BASE` constants.
- `writeConfig` (mkdir `0o700`, write, chmod `0o600`) — the owner-only writer. **Reuse verbatim**; all new writers (`writeProfile`/`clearProfileToken`/`setCurrent`) route through it.
- `clearConfig` and the `export { CONFIG_PATH }` line.

**Map: current flat `readConfig` (`src/config.mjs:11-20`) → legacy-normalizing `readConfig`.**
Current shape returns raw `{}` / parsed object:
```javascript
export function readConfig() {
  if (!existsSync(CONFIG_PATH)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}
```
Evolve to D-03 read-time normalization (RESEARCH Pattern 1, lines 207-222). Single code path; old flat keys are deleted from disk only on the next `writeConfig`. **Never logs an existing user out** — fold top-level `token`/`api_base` into `profiles.default`. The empty-file branch must return `{ current: 'default', profiles: {} }` (not `{}`) so downstream `.profiles[env]` never throws.

**Map: current `resolveApiBase(flagValue)` (`src/config.mjs:39-46`) → `resolveApiBase(flagValue, env)`.**
Current reads top-level `readConfig().api_base`:
```javascript
export function resolveApiBase(flagValue) {
  const value =
    flagValue ||
    process.env.APPO_API_BASE ||
    readConfig().api_base ||      // ← becomes readConfig().profiles[env]?.api_base
    DEFAULT_API_BASE;
  return value.replace(/\/+$/, '');
}
```
Precedence string is unchanged (`--api > APPO_API_BASE > profile > default`, D-05); only the config source becomes per-profile. See RESEARCH Pattern 3 (lines 242-246). Keep the trailing-slash strip verbatim.

**Map: current `storedToken()` (`src/config.mjs:48-50`) → `storedToken(env)`.**
Current reads top-level token:
```javascript
export function storedToken() {
  return readConfig().token ?? null;   // ← becomes APPO_TOKEN > readConfig().profiles[env]?.token
}
```
Add `APPO_TOKEN` ephemeral precedence FIRST (D-06/D-08, RESEARCH Pattern 3 lines 249-252). `APPO_TOKEN` is read-only here — no writer ever sources from it (Pitfall 2).

**New helpers to add** (RESEARCH Patterns 2 & 4, lines 229-234, 258-270): `activeProfileName(flagEnv)`, `writeProfile(env, patch)` (merge — never replace siblings, the "no clobber" invariant), `clearProfileToken(env)` (drop token, keep api_base — logout), `setCurrent(env)`.

**Test-isolation seam to add** (RESEARCH lines 511-516, Wave 0 gap line 548): make `CONFIG_PATH` honor an `APPO_CONFIG`/`APPO_CONFIG_DIR` env override so config tests point at `os.tmpdir()` and never touch the real `~/.appo/config.json`. Recommended over relying solely on `stubToken` save/restore for the write-heavy profile tests.

---

### `src/api.mjs` (transport, request-response)

**Analog:** itself — `apiFetch` (`src/api.mjs:7-41`). Two surgical edits only.

**Edit 1 — token source (D-08).** Current (`src/api.mjs:1`, `:8`):
```javascript
import { storedToken } from './config.mjs';
// ...
const token = storedToken();
```
becomes env-aware: thread the resolved `env` from `run()` into `apiFetch` (cleanest — RESEARCH Pitfall 7 lines 372-375) so `storedToken(env)` returns the right profile token, and the `APPO_TOKEN` precedence lives in `storedToken` (already added in config). Add `env` as an `apiFetch` parameter; keep the existing throw-on-missing-token guard (`src/api.mjs:9-11`).

**Edit 2 — env-named 401 message (D-09).** Current fallback (`src/api.mjs:29-33`):
```javascript
if (!res.ok) {
  const msg =
    payload?.message ||
    payload?.error ||
    (res.status === 401 ? 'Token rejected — run `appo login` again.' : `Request failed (${res.status}).`);
  const err = new Error(msg);
  err.status = res.status;
  err.envelope = payload;
  throw err;
}
```
Only the 401 branch string changes to name the active env (RESEARCH Pattern 6, lines 295-301):
`` `Token for env '${env}' was rejected — run \`appo login\`.` `` — **never include any token substring** (D-13, Pitfall 4). `err.status`/`err.envelope` plumbing stays verbatim (the whole CLI error-rendering pipeline keys on them — see `renderError` in cli.mjs:178-189 and foundation.test.mjs:71-92). The 204→null short-circuit (`src/api.mjs:23-25`) is **reused as-is** by the logout revoke (204 = confirmed revoke).

---

### `src/login.mjs` (auth flow, request-response)

**Analog:** the existing device `login(apiBase)` (`src/login.mjs:24-84`) for the write path; `apps list` (`cli.mjs:314`) for the validation call.

**Device-flow write path to map (D-03 normalization point).** Current persists flat (`src/login.mjs:64`):
```javascript
writeConfig({ ...readConfig(), api_base: apiBase, token: payload.access_token });
```
Repoint to the profile writer: `writeProfile(env, { api_base: apiBase, token: payload.access_token })`. This is the single line that needs the env folded in; `login` gains an `env` argument threaded from `run()`. Everything else in `login` (device-code POST, polling loop, `switch (payload.error)` at `:68-80`) is **unchanged**.

**New `--token` non-device branch (D-07).** No existing branch does this, but it composes two existing patterns: validate via one authed GET (the same `GET /api/v1/apps` call `apps list` uses, `cli.mjs:314`), then write via `writeProfile`. Reference implementation in RESEARCH Code Examples (lines 382-403):
- Validate the **pasted** PAT (not the stored one) — use a thin `apiFetch` variant that takes an explicit token, OR validate-after-tentative-resolve. Validate-before-write is cleaner and matches D-07.
- On `err.status === 401`: refuse, write nothing, return exit 1 (Pitfall 6). On any other error: rethrow to top-level `renderError`.
- On success: `writeProfile(env, { api_base, token: pat })`. **Never echo or log the `<pat>`** (D-13).

---

### `src/cli.mjs` (dispatcher, request-response)

**Analog:** the existing `switch (command)` (`cli.mjs:275-576`). All edits are new/modified `case` blocks + USAGE + `--env` wiring. `parseArgs` (`cli.mjs:56-89`) already handles `--env <name>`/`--token <pat>` for free (RESEARCH lines 132-134) — no parser change.

**Thread the active env once (Pitfall 7).** After `const apiBase = resolveApiBase(flags.api);` (`cli.mjs:271`), compute `const env = activeProfileName(flags.env);` and pass `env` to `resolveApiBase(flags.api, env)`, `apiFetch(apiBase, ..., env)`, and the auth verbs. The value-less-flag guard idiom at `cli.mjs:266-269` (`if (flags.api === true)`) is the template for guarding a value-less `--env`/`--token`.

**`case 'login'` (`cli.mjs:276-280`) — add `--token` branch BEFORE the device flow.** Current:
```javascript
case 'login': {
  const { apiBase: base } = await login(apiBase);
  console.log(`\n  Authenticated. Connected to ${base}.\n`);
  return 0;
}
```
Add the `flags.token` branch (RESEARCH lines 382-401) ahead of the device call; device call gains `env`.

**`case 'logout'` (`cli.mjs:282-285`) — revoke-then-always-clear.** Current is local-only:
```javascript
case 'logout':
  clearConfig();
  console.log('Logged out — token forgotten.');
  return 0;
```
Replace with the DELETE-revoke pattern (D-10/D-11, RESEARCH Pattern 5 lines 277-289). **Reuse `apiFetch` with method `DELETE`** — no new transport:
```javascript
case 'logout': {
  try {
    await apiFetch(apiBase, 'DELETE', '/api/v1/user/tokens/current', null, env);  // 204 → null
    console.log(`Logged out of '${env}' — token revoked server-side and cleared.`);
  } catch (err) {
    console.warn(`Could not confirm server-side revocation for '${env}' (${err.message}). Clearing local token anyway.`);
  } finally {
    clearProfileToken(env);   // load-bearing: NEVER leave a stale token (D-11, Pitfall 3)
  }
  return 0;
}
```
Note: replaces `clearConfig()` (whole-file delete) with `clearProfileToken(env)` (per-env) — logout must not touch sibling profiles (D-11). The `finally` is the load-bearing line.

**`case 'whoami'` (`cli.mjs:287-297`) — env + api_base + liveness.** Current already does the liveness call via `GET /api/v1/apps` (`cli.mjs:294`) — keep that. Map the `cfg.token` guard (`cli.mjs:289`) to `storedToken(env)`; enrich output with `env` + `api_base` + count (RESEARCH lines 408-423). No identity field (backend gap, D-12). **Token never printed.** Use the aligned `line(k,v)` idiom from `printApp` (`cli.mjs:92-102`) for consistent column output if formatting columns.

**New `case 'env'` (RESEARCH lines 429-447) — `env list` / `env use`.** `env list` iterates `readConfig().profiles`, marks `current`, prints `name → api_base`, **never the token** (D-04/D-13, Pitfall 5). `env use <name>` validates the profile exists then `setCurrent(name)`; missing/unknown name → `return 2` (matches the existing usage-error idiom, e.g. `cli.mjs:325-326`). `sub`/`rest` already destructured at `cli.mjs:272`.

**USAGE block (`cli.mjs:7-50`).** Add `appo login --token <pat>`, `appo env list`, `appo env use <name>`, the `--env <url>` option line (mirroring the `--api` line at `cli.mjs:33`), and the `APPO_TOKEN`/`APPO_ENV` env vars. Document the PAT-mint path: "Create a PAT in the dashboard, then `appo login --token <pat>` or set `APPO_TOKEN`" (RESEARCH line 142). Neutral voice (CLAUDE.md).

---

### `test/config-profiles.test.mjs` (NEW — unit, file-I/O, no HTTP)

**Analog:** `test/foundation.test.mjs` (structure: `node:test` + `node:assert/strict`, no mock fetch for pure-logic cases) + the `stubToken` save/restore discipline in `test/helpers/mockFetch.mjs:76-99`.

**Harness to copy:**
- Imports: `import { test } from 'node:test'; import assert from 'node:assert/strict';` (`foundation.test.mjs:1-2`).
- Config-isolation: point `APPO_CONFIG`/`APPO_CONFIG_DIR` at an `os.tmpdir()` path (the new seam added in config.mjs) and delete it in teardown; OR reuse the `mockFetch.mjs:76-99` save/restore verbatim (`savedConfigRaw` snapshot → `resetMockFetch` restore). The save/restore at `mockFetch.mjs:91-98` is the proven pattern — snapshot real bytes (or `false` for absent), restore on teardown.
- Env-var stubbing: set `process.env.APPO_ENV`/`APPO_TOKEN`/`APPO_API_BASE` inside a test, `delete` in `finally` — safe because `--test-concurrency=1` is set (package.json, RESEARCH line 519).

**Cases (RESEARCH lines 527-535):** legacy flat → `profiles.default` without dropping the token (write flat config, call `storedToken('default')`, assert old token returned — Pitfall 1); `writeProfile('staging', ...)` leaves `profiles.production` untouched (no clobber); `activeProfileName` precedence `--env > APPO_ENV > current > default`; `resolveApiBase` precedence `--api > APPO_API_BASE > profile > default`; `env list` marks active + prints no token; `env use` sets `current`.

---

### `test/auth.test.mjs` (NEW — contract, request-response, mock fetch)

**Analog:** `test/destructive-verbs.test.mjs` — the canonical mock-fetch contract suite. Copy its harness wholesale.

**Harness to copy** (`destructive-verbs.test.mjs:1-54`):
```javascript
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/cli.mjs';
import { installMockFetch, resetMockFetch, lastRequest, requests, stubToken } from './helpers/mockFetch.mjs';
// captureLog / captureAll / silentRun helpers (lines 13-50)
afterEach(() => resetMockFetch());
const API = ['--api', 'http://test.local'];
```
- `stubToken()` (`mockFetch.mjs:76-81`) seeds a token so `apiFetch`'s `if (!token)` guard passes; it save/restores the real config. **Note:** `stubToken` currently writes the *flat* shape (`{ ...readConfig(), token, api_base }`, `mockFetch.mjs:80`). Once config.mjs normalizes on read, this still works (read-time fold), but for profile-targeted assertions prefer writing a profiles-shaped config directly via the new `writeProfile`, or extend `stubToken` to accept an env.
- Request assertions: `lastRequest()` → assert `.method`, `.path` (regex), `.body` (deepEqual), `.headers` — pattern at `destructive-verbs.test.mjs:84-88`. For token-precedence: assert `lastRequest().headers.Authorization` carries `Bearer <APPO_TOKEN>` when the env var is set (`mockFetch.mjs:47` records `init.headers`).
- "No write issued" assertion: `assert.equal(requests.length, 0)` (`destructive-verbs.test.mjs:63`) — reuse for the `login --token` 401-refuse case.

**Cases (RESEARCH lines 531-538):** logout 204 → token cleared + success (queue `{status:204, body:null}`); logout 401/network → token STILL cleared + warning + exit 0 (D-11); env-named 401 message names env + no token substring (D-09); whoami 200 prints env+api_base+count, 401 prints re-login, token never printed; `APPO_TOKEN` → `Authorization` uses it AND nothing written to disk (D-06); `login --token` 200 stores / 401 refuses + writes nothing (D-07); `--env staging` overrides `current=production` for one invocation's token+base (Pitfall 7). Mock-fetch is FIFO (`mockFetch.mjs:49`) — queue one response per call a verb makes.

---

## Shared Patterns

### Owner-only persistence
**Source:** `src/config.mjs:23-27` (`writeConfig`: mkdir `0o700`, write, chmod `0o600`)
**Apply to:** all new config writers (`writeProfile`, `clearProfileToken`, `setCurrent`). Route every write through `writeConfig` — do NOT reimplement perms. `APPO_TOKEN` is never passed to any writer (D-06/D-13, Pitfall 2).

### Authenticated transport + 401 envelope
**Source:** `src/api.mjs:7-41` (`apiFetch`: Bearer header, 204→null, JSON parse, `err.status`/`err.envelope`)
**Apply to:** logout revoke (`DELETE`), `login --token` validation (`GET /apps`), whoami liveness (`GET /apps`). Reuse `apiFetch` verbatim with the appropriate method — no second fetch wrapper (RESEARCH "Don't Hand-Roll" line 317). 204 = confirmed revoke; 401 = warn+clear path.

### Error rendering pipeline
**Source:** `cli.mjs:178-189` (`renderError`) + top-level `catch` (`cli.mjs:577-579`)
**Apply to:** all new verbs. Throw `Error` objects carrying `err.status`/`err.envelope`; let the existing `catch (err) { return renderError(err); }` handle them. The env-named 401 string surfaces through `err.message` (foundation.test.mjs:87-92 proves this fallback path).

### Usage-error idiom
**Source:** `cli.mjs:266-269` (value-less flag guard) and `cli.mjs:325-326`/`:347` (missing-arg → `return 2`)
**Apply to:** value-less `--env`/`--token` guards; `env use` with no/unknown name. Exit code 2 = usage error (USAGE block `cli.mjs:42-50`).

### Aligned key/value output
**Source:** `cli.mjs:93` (`const line = (k, v) => v != null && console.log(\`  ${k.padEnd(18)} ${v}\`)`)
**Apply to:** `whoami` / `env list` rendering for cross-verb consistency. Never feed a token into `line()`.

### Test isolation (config + fetch)
**Source:** `test/helpers/mockFetch.mjs` — `stubToken` save/restore (`:76-99`), `installMockFetch` FIFO queue (`:29-59`), `lastRequest`/`requests` recording (`:13-22`, `:47`)
**Apply to:** both new test files. Add the `APPO_CONFIG`/`APPO_CONFIG_DIR` override seam for write-heavy profile tests so they never touch real `~/.appo/config.json`.

---

## No Analog Found

None. Every file maps to an in-repo analog. The two genuinely new behaviors — read-time legacy normalization and the `login --token` validate-then-store branch — have no prior *case* but compose existing patterns (single `readConfig` seam; `apiFetch` GET + `writeProfile`). Reference implementations are inlined in 03-RESEARCH.md (Pattern 1 lines 207-222; Code Examples lines 382-403), not invented from RESEARCH stack examples.

## Metadata

**Analog search scope:** `src/` (config/api/login/cli), `test/` (foundation, destructive-verbs, helpers/mockFetch), `package.json`.
**Files scanned:** 9 (5 src + 3 test + helper) plus CONTEXT/RESEARCH.
**Project conventions confirmed:** dependency-free (no skills dir, no project CLAUDE.md beyond global); `node --test --test-concurrency=1` serial runner; `.mjs` ESM throughout.
**Pattern extraction date:** 2026-06-15
