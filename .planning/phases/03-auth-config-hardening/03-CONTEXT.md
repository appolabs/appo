# Phase 3: Auth & config hardening - Context

**Gathered:** 2026-06-15 (--auto)
**Status:** Ready for planning

<domain>
## Phase Boundary

Production-grade CLI auth: handle token lifetime (clear re-login on 401), revoke the PAT
server-side on `logout`, support multiple environments/profiles (local vs production) without
clobbering, and add a non-interactive auth path (`APPO_TOKEN` env / `appo login --token <pat>`) so
CI/automation can authenticate without a browser. `appo whoami` reports account + active environment;
the token stays owner-only.

In scope: the config/profiles store evolution, `--env`/`APPO_ENV` selection, `appo login --token`,
`APPO_TOKEN`, server-side logout revoke, 401-detection messaging, whoami enrichment, and minimal
profile management. Out of scope: new lifecycle verbs (Phases 1-2), preview (Phase 4), tests/CI
(Phase 5 — covers this phase), packaging (Phase 6).

**Carrying forward (locked):** `~/.appo/config.json` owner-only (dir 0700 / file 0600); API-base
precedence `--api` > `APPO_API_BASE` > config > default; `apiFetch` already maps 401 →
"run `appo login`"; device-flow login (Phase 0) stays the default interactive path; PAT never logged
(PROJECT non-negotiable).
</domain>

<decisions>
## Implementation Decisions

### Profiles / multi-environment config (CLI-02 SC3)
- **D-01:** Evolve `~/.appo/config.json` from the flat `{ token, api_base }` to a profiles structure:
  ```json
  { "current": "<name>", "profiles": { "<name>": { "api_base": "...", "token": "..." } } }
  ```
- **D-02:** Active-profile selection precedence: `--env <name>` flag > `APPO_ENV` env >
  `current` in config > `"default"`.
- **D-03:** **Read-time normalization** of the legacy flat config: when `config.json` has top-level
  `token`/`api_base` and no `profiles`, transparently fold it into `profiles.default` and set
  `current: "default"` on next write. Existing MVP users are NOT logged out. (This is on-disk
  user-data normalization, not versioned migration code — one code path, old shape deleted on write.)
- **D-04:** Minimal profile management surface: `--env <name>` on any command selects the profile;
  `appo login --env <name>` creates/updates that profile; `appo env list` shows profiles (active
  marked, tokens never printed); `appo env use <name>` sets `current`. No clobbering — login into a
  new `--env` adds a profile, never overwrites another.
- **D-05:** `api_base` becomes per-profile; the `--api`/`APPO_API_BASE` overrides still win for a
  single invocation (precedence unchanged), but a profile's stored `api_base` is the default for that env.

### Non-interactive auth (CLI-07 SC4)
- **D-06:** `APPO_TOKEN` env var: when set, it is the token `apiFetch` uses — highest precedence,
  **ephemeral, never written to disk**. For CI/agents. Pairs with `APPO_API_BASE`/`--api` for the base.
- **D-07:** `appo login --token <pat>`: stores the provided PAT into the active/`--env` profile WITHOUT
  the device flow. Validate it first with one authed call (e.g. `GET /api/v1/apps`); on 401 refuse and
  do not store. The `<pat>` value is never echoed back or logged.
- **D-08:** Token precedence used by `apiFetch`: `APPO_TOKEN` env > active profile's stored token.

### Token lifetime / 401 handling (CLI-02 SC1)
- **D-09:** Sanctum PATs do **not expire** (`config/sanctum.php` `expiration => null`) and there is
  **no refresh-token mechanism**. So "expiry/refresh handling" = robust detection only — do NOT build
  a refresh flow the backend doesn't support. Any 401 (revoked/invalid/missing) surfaces a clear
  re-login path that names the active environment, e.g.
  `Token for env 'production' was rejected — run 'appo login'` (extends the existing `apiFetch` 401 message).

### Server-side logout revoke (CLI-02 SC2)
- **D-10:** `appo logout` calls `DELETE /api/v1/user/tokens/current` (revokes the PAT server-side via
  `destroyCurrent`), THEN clears the token from the active profile locally.
- **D-11:** Failure handling: if the revoke call fails (network error, or token already invalid →
  401), still clear the local token but WARN that server-side revocation could not be confirmed
  (so the local credential is always cleared; never leave a stale token on disk). `appo logout`
  acts on the active env (selectable via `--env`); it does not touch other profiles.

### whoami — account + active environment (CLI-02 SC5)
- **D-12:** `appo whoami` reports: active environment name, its `api_base`, and token liveness
  (validated via one authed call). It includes account identity (email/name) IF a v1 endpoint exposes
  the caller's own identity; the researcher must confirm whether the device-token response, `ApiToken`
  model, or `GET /api/v1/user/tokens` surfaces it. If no self-identity endpoint exists, whoami reports
  env + api_base + liveness ("authenticated, N apps") and the missing identity is a noted backend gap
  (Claude's Discretion), not a blocker.

### Token storage / safety
- **D-13:** Keep `~/.appo/config.json` owner-only (dir 0700 / file 0600). `APPO_TOKEN` is never
  written to disk. `--token` and stored PATs are never printed by `whoami`/`env list` or logged.

### Claude's Discretion
- Exact `env list` / `whoami` output formatting.
- Whether `appo env use`/`env list` live under an `env` subcommand vs flat verbs (consistency with existing surface).
- Whether `login --token` validation hits `/apps` vs `/user/tokens` (pick the cheapest authed call).
- whoami identity enrichment shape if/when a self-identity field is found.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.** Paths relative to this repo;
backend in sibling `apps-web-app`.

### This repo (the auth surface being hardened)
- `src/config.mjs` — `readConfig`/`writeConfig`/`clearConfig`/`resolveApiBase`/`storedToken` + `CONFIG_PATH`,
  0700/0600 perms — the file this phase restructures into profiles (D-01..D-05, D-13).
- `src/api.mjs` — `apiFetch`, the 401 → "run `appo login`" message to extend (D-09); reads `storedToken()`.
- `src/login.mjs` — device-flow `login(apiBase)`; `appo login --token` is a new non-device branch (D-07).
- `src/cli.mjs` — `case 'login'`/`logout'`/`whoami'` to extend; USAGE; `--env` flag wiring.

### Parity / contract source of truth (`apps-web-app`)
- `../apps-web-app/routes/api_v1.php` — token routes: `DELETE /user/tokens/current` (destroyCurrent,
  ability USER — the logout revoke, D-10), `GET /user/tokens` (index — possible whoami identity source),
  `DELETE /user/tokens/{id}`, `POST /user/tokens`.
- `../apps-web-app/config/sanctum.php` — `expiration => null` confirms PATs don't expire (D-09).
- `../apps-web-app/app/Models/ApiToken.php`, `../apps-web-app/app/Enums/TokenType.php` — PAT model /
  token shape (whoami identity research, D-12).
- `../apps-web-app/app/Http/Controllers/Oauth/DeviceCodeController.php` + `../apps-web-app/app/Http/Controllers/Api/V1/DeviceController.php`
  — device token response fields (does it return identity? D-12).
- `../apps-web-app/app/Models/User.php` — caller identity (whoami, D-12).
- (Researcher: resolve the actual `V1UserTokenController` path — referenced by route name `user.tokens.*` but not found by filename; confirm `destroyCurrent` revokes the current token and what `index` returns.)

### This repo
- `.planning/PROJECT.md` — non-negotiables (PAT never logged, owner-only storage).
- `.planning/REQUIREMENTS.md` — CLI-02, CLI-07.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/config.mjs` is the single config gateway — restructure here; all readers (`storedToken`,
  `resolveApiBase`) become profile-aware in one place.
- `src/api.mjs` `apiFetch` already extracts 401 and carries `err.status`/`err.envelope` — D-09 just
  enriches the message; D-08 changes only where the token comes from.
- `src/login.mjs` `login(apiBase)` writes via `writeConfig({...readConfig(), ...})` — the `--token`
  branch reuses the same write path into the active profile.

### Established Patterns
- Single `switch (command)` dispatcher; `parseArgs` already supports `--key value`/`--key=value`/`--`
  (Phase 1) so `--env`/`--token` parse for free.
- Owner-only write via `writeConfig` (mkdir 0700, chmod 0600) — reuse unchanged.

### Integration Points
- `resolveApiBase`/`storedToken` signatures gain profile awareness (read `current`/`--env`/`APPO_ENV`).
- New `case 'env'` (or flat `env`-management verbs); `case 'logout'` gains the revoke call; `case 'whoami'`
  enriched; `case 'login'` gains the `--token` branch. USAGE updated.

</code_context>

<specifics>
## Specific Ideas

- "Without clobbering" is the load-bearing requirement for profiles: logging into a second environment
  must never silently overwrite the first — each env is an isolated entry, switching is explicit.
- CI ergonomics drive D-06/D-07: an agent or pipeline sets `APPO_TOKEN` + `APPO_API_BASE` (or
  `appo login --token`) and every verb — including `appo ship` — works headless, since the device flow
  cannot run without a browser.

</specifics>

<deferred>
## Deferred Ideas

- A true token-refresh flow — not applicable (sanctum PATs don't expire and have no refresh token, D-09).
  Revisit only if the backend introduces expiring tokens.
- `appo logout --all` revoking every profile's PAT at once — nice-to-have; for now logout is per-env.
- A backend self-identity (`/api/v1/user` / `me`) endpoint to enrich `whoami` — if absent, it's a
  backend gap to raise on the apps-web-app side, not built here.
- `appo preview` (QR/TestFlight) — Phase 4. Tests/CI for this phase — Phase 5. Packaging — Phase 6.

None of the above were treated as in-scope — discussion stayed within the auth-hardening boundary.

</deferred>

---

*Phase: 03-auth-config-hardening*
*Context gathered: 2026-06-15*
