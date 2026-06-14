# Phase 1: Operator command parity - Research

**Researched:** 2026-06-15
**Domain:** Dependency-free Node CLI extending a `switch`-based dispatcher to 8 new verbs at 1:1 parity with the `/api/v1` HTTP contract and the 10 AppoServer MCP tools
**Confidence:** HIGH — every command's request/response shape, validation rules, error envelope, and confirm-gate preview payload were read directly from the canonical sibling-repo source (`../apps-web-app`) and cross-verified against the feature tests that assert those exact shapes.

## Summary

This phase adds 8 lifecycle verbs (`build`, `status`, `publish`, `push`, `configure`, `rejection`, `fix-recipe`, `resubmit`) to an already-working dependency-free Node CLI. The hard part is not the Node code — `apiFetch()` already handles auth, the JSON envelope, 204, and 401. The hard part is **shape fidelity**: every request body field, every response field, and every error code must match `/api/v1` verbatim, because "no drift" is a project non-negotiable and the backend ships an OpenAPI drift-guard test (`OpenApiSpecTest`) that pins the contract.

The full v1 contract was extracted from the controllers, FormRequest validators, JsonResources, the global exception handler, and the feature tests. All 8 endpoints sit behind `auth:sanctum` + `ability:user` — exactly the User PAT the CLI already holds via `storedToken()`. The error envelope is uniform across the entire surface: `{ "error", "code", "message" }` (plus `details` for validation/prerequisite failures), already partially handled by `apiFetch`. Success bodies are `{ "data": {...} }` for reads/single resources and `204 No Content` for publish/update.

The one architectural subtlety (CONTEXT.md D-05) is **confirmed**: the v1 POST endpoints for publish/push/resubmit are *not* preview-gated — they execute on receipt. The confirm-gate is an MCP-tool convention, not an HTTP feature. Therefore the CLI must synthesize the confirm preview **client-side** before issuing the POST, mirroring the MCP tools' preview payloads (which I extracted exactly). This keeps auth parity intact and is the right call.

**Primary recommendation:** Add the 8 verbs as flat cases in the existing `src/cli.mjs` `switch`, each a thin wrapper over `apiFetch` with the exact path/body documented below. Extract the core of each destructive verb into a small callable helper (not buried in arg-parsing) so Phase 2 `ship` can reuse it. Implement the confirm-gate as one shared `previewGate()` helper. Add exit code `3` for confirm-required. Keep `--json` as a verbatim passthrough of the parsed v1 body.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Command parsing, flag/positional extraction | CLI (Node) | — | Already exists (`parseArgs`); extend, don't rebuild |
| HTTP auth (Bearer PAT), envelope unwrap, error extraction | CLI (Node) | API | `apiFetch` already owns this; all verbs route through it |
| Confirm-gate **preview** synthesis (publish/push/resubmit) | CLI (Node) | — | v1 POSTs are not preview-gated (D-05 verified) — CLI must synthesize client-side |
| Confirm-gate **enforcement** (the actual write only on `--confirm`) | CLI (Node) | API | Client-side gate; the API executes whatever it receives |
| Business logic (validation, ownership, state transition, credential check) | API (backend) | — | Owned entirely by `/api/v1`; CLI must NOT re-implement, only surface results |
| Response/request shape definition (the contract) | API (backend) | — | Canonical in `../apps-web-app`; CLI mirrors it, never invents fields |
| Recipient counting, target-store list, credential-requirement note (preview content) | API (overview read) + CLI (render) | — | CLI reads `get_app_overview` / request inputs to populate the preview truthfully |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-in `fetch` | Node ≥18 (local: v22.12.0) `[VERIFIED: node --version]` | All HTTP to `/api/v1` | Already used by `src/api.mjs`; zero deps is a project non-negotiable |
| Node built-in `process` | core | argv, exit codes, stdout/stderr | Already used by `bin/appo.mjs` |
| Node built-in `node:fs`/`node:os`/`node:path` | core | config/token storage | Already used by `src/config.mjs` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:test` + `node:assert` | core (Node ≥18) | Unit/contract tests without a dep | Phase 5 owns the suite; this phase only needs HTTP to be mockable (see Validation Architecture) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| built-in `fetch` | `undici`, `axios` | Adds a dependency — forbidden by the dependency-free non-negotiable. Do not. |
| hand-rolled `parseArgs` | `node:util` `parseArgs` / `commander` / `yargs` | `commander`/`yargs` are deps (forbidden). `node:util.parseArgs` is built-in but would mean rewriting the working parser and doesn't handle the existing positional+flag mix as-is. **Keep the existing `parseArgs`** — it already works. |

**Installation:** None. Zero new dependencies. `[VERIFIED: project non-negotiable in PROJECT.md + CLAUDE.md]`

**Version verification:** No npm packages to verify — the CLI is dependency-free by mandate. Node runtime confirmed at v22.12.0 locally; `package.json` should keep the `engines.node >=18` floor (built-in `fetch` is stable from 18).

## The v1 Contract (the load-bearing reference)

All 8 endpoints live in `../apps-web-app/routes/api_v1.php` lines 37–61, all behind `['auth:sanctum', 'ability:user']`. The CLI's `apiFetch` already sends `Authorization: Bearer <PAT>` — no auth changes needed. `[VERIFIED: routes/api_v1.php, AppController/AppBuildController/etc.]`

### Uniform error envelope (every endpoint)
`[VERIFIED: app/Exceptions/Handler.php renderable() + RendersV1Envelope trait]`

| HTTP | `error` | `code` | Has `details`? | CLI handling |
|------|---------|--------|----------------|--------------|
| 401 | `unauthorized` | `unauthenticated` | no | exit 1, print "run `appo login`" (apiFetch already maps 401) |
| 403 | `forbidden` | `forbidden` | no | exit 1 |
| 404 | `not_found` | `resource_not_found` | no | exit 1, "App not found (or not yours)" |
| 409 | `conflict` | `resource_conflict` | no | exit 1 (publish already-published) |
| 422 (validation) | `validation_error` | `validation_failed` | yes (`details` = field errors) | exit 1 (or 2 if CLI catches the bad arg first) |
| 422 (prerequisite) | `prerequisite_failed` | e.g. `APP_BLOCKED`, `CUSTOMER_ASC_CREDENTIAL_MISSING` | yes (`details.next_action`, `details.dashboard_url`) | exit 1, print `message` + the actionable `next_action`/`dashboard_url` |
| 500 | `server_error` | `internal_server_error` | no | exit 1 |

`apiFetch` already extracts `payload.message || payload.error`. **Gap:** it does not surface `code`, `details.next_action`, or `details.dashboard_url`. For `build` (APP_BLOCKED etc.) and `resubmit` (CUSTOMER_ASC_CREDENTIAL_MISSING) the plan needs the CLI to print those actionable fields. `err.envelope` is already attached to the thrown error — the new verbs can read `err.envelope.code` / `err.envelope.details` from the catch path. No change to `apiFetch` required; the verb-level (or top-level) error printer should be taught to render `code` + `details`.

### Per-command contract

#### `appo status <id>` → `GET /api/v1/apps/{app}` (overview)
`[VERIFIED: AppController::show + AppResource]`
- **Request:** path id only, no body.
- **Response `200 { "data": {...} }`:**
  ```
  data: {
    id, name,
    publication_state,   // not_ready | ready | in_review | live | rejected | removing | blocked
    primary_action,      // setup | publish | resubmit | null   <-- the operator's compass
    stores: { apple: <public-status>, google: <public-status> },  // not_published|in_review|published|rejected|removing
    base_url, scheme, android_package_name, ios_bundle_id,
    has_active_subscription, created_at
  }
  ```
- **Human render (D-09):** reuse/extend `printApp()` — it already prints id/name/base_url/publication_state/primary_action/stores. **Surface `primary_action` prominently** (it's the "single next move" — the MCP north star and what Phase 2 `ship` keys off). Note: MCP `get_app_overview` additionally returns `latest_build` + `push` summary; the **v1 `GET /apps/{app}` does not** — it returns only `AppResource`. The CLI's `status` overview is the AppResource shape. If the operator wants build/push detail, that's `status --build` / a future push list.
- **Errors:** 404 if not found/not owned.

#### `appo status <id> --build <buildId>` → `GET /api/v1/apps/{app}/builds/{build}`
`[VERIFIED: AppBuildController::show + AppBuildResource + AppBuildControllerTest]`
- **Request:** path app id + build id, no body.
- **Response `200 { "data": {...} }`:**
  ```
  data: {
    id, platform,                  // ios | android | all
    status,                        // queued | building | ready | failed   (curated PublicBuildStatus)
    distribution,
    created_at, started_at, finished_at,
    github_run_url, eas_build_id, eas_build_url, artifact_url, error_message,
    next_action                    // currently null on the v1 resource
  }
  ```
  > NOTE — drift caveat: the **v1 AppBuildResource exposes** `eas_build_id`, `eas_build_url`, `github_run_url`, `artifact_url`, `error_message`. The **MCP `get_build_status` curates these OUT** (D-08 boundary). The CLI calls v1, so it *receives* them. `--json` prints them verbatim (correct — lockstep with v1). The human render should show `status`/`platform`/timestamps and the `artifact_url` if present; surfacing the raw EAS/GitHub fields is the CLI's discretion (they are present in v1 and not secret on this surface).
- **Errors:** 404 if app not owned, build not found, or build belongs to a different app (build-belongs-to-app guard).

#### `appo build <id>` → `POST /api/v1/apps/{app}/builds`
`[VERIFIED: AppBuildController::store + Build/StoreRequest + AppBuildControllerTest]`
- **Request body (all optional):**
  - `platform`: one of `ios | android | all` (validator: `nullable|Rule::in([...])`; default `all`)
  - `branch`: `nullable|string|max:255|regex:/^[A-Za-z0-9._\/-]+$/` (default `master`)
- **Response `202 Accepted { "data": {...AppBuildResource...} }`** — returns the build id **immediately, never waits** (D-03). The human render should print the build id and tell the user to poll via `appo status <id> --build <buildId>`.
- **Edge case — prerequisite hard-fail `422 prerequisite_failed`:** `TriggerCliBuild::assertPrerequisites` throws `CliBuildPrerequisiteException` for: `APP_BLOCKED`, `SUBSCRIPTION_INACTIVE`, `ICONS_MISSING`, and (iOS/all only) `APPLE_ENROLLMENT_INCOMPLETE`, `APPLE_CREDENTIALS_MISSING`, `APPLE_TEAM_MISSING`, `ASC_APP_ID_MISSING`. Each carries `message`, `details.next_action`, `details.dashboard_url`. The CLI must print these as actionable blocked states (same pattern as resubmit's hard-fail), not raw errors. `[VERIFIED: app/Actions/App/TriggerCliBuild.php]`

#### `appo configure <id> [flags]` → `PATCH /api/v1/apps/{app}`
`[VERIFIED: AppController::update + App/UpdateRequest]`
- **Request body (all optional, `string|nullable`):** `name`, `base_url` (`url`, max 255, query/fragment stripped server-side), `injected_css`, `injected_javascript`, `metadata_name`, `metadata_description`.
- **CLI flag → body field mapping (D-cretion on exact flag names; CONTEXT proposes):** `--name`→`name`, `--url`→`base_url`, `--meta-name`→`metadata_name`, `--meta-desc`→`metadata_description`, `--injected-css`→`injected_css`, `--injected-js`→`injected_javascript`. (Note: existing `apps set-name` and `apps create` already use `--name`/`--url`/`--meta-name`/`--meta-desc` — keep these names consistent for `configure`.)
- **Response `204 No Content`** — `apiFetch` returns `null`. Human render: "Updated app <id>." For `--json`, there's no body; emit `{}` or echo the submitted fields (decide in plan; D-08 says raw v1 body verbatim → `204` means nothing, so `--json` should emit nothing or `null` consistently).
- **Errors:** 404 not owned; 422 validation (e.g. invalid url).

#### `appo rejection <id>` → `GET /api/v1/apps/{app}/rejection`
`[VERIFIED: AppRejectionController::show + AppRejectionResource + RejectionEndpointTest]`
- **Request:** path id only.
- **Response `200 { "data": { "status": "rejected", "required_action": "<plain-language string>" } }`** — exactly two fields (curated allowlist; no Apple-internal data).
- **Errors:** **404** if app not owned, OR app not in REJECTED state (state-probing guard — a non-rejected app returns 404, not an empty 200), OR no ingested rejected build. The human render should treat 404 here as "no active rejection for this app" rather than a hard error where appropriate (CLI discretion; the raw envelope is `not_found`).

#### `appo fix-recipe <id>` → `GET /api/v1/apps/{app}/rejection/recipe`
`[VERIFIED: AppRecipeController::show + AppRecipeResource + RecipeEndpointTest]`
- **Request:** path id only.
- **Response `200 { "data": [ { "slug", "fix_type", "agent_steps":[], "limitations":[] }, ... ] }`** — a **collection** (array under `data`), one recipe per distinct rejection reason, deduped by slug; unknown codes fall back to a generic recipe. `fix_type` is e.g. `manual`. `agent_steps` and `limitations` are arrays of strings.
- **Errors:** same 404 state-probing guard as rejection (not REJECTED → 404).

#### `appo publish <id> --stores <a,b> --confirm` → `POST /api/v1/apps/{app}/publish`
`[VERIFIED: AppPublishController::store + Publish/StoreRequest + AppPublishControllerTest]`
- **Request body:** `app_stores`: **required array**, each item one of `apple_appstore` | `google_playstore` (the `AppStore` enum values). `[VERIFIED: app/Enums/AppStore.php]`
- **`--stores` parsing (D-cretion):** the v1 contract is an array of those exact tokens. Recommend accepting a comma list (`--stores apple_appstore,google_playstore`) and/or friendly aliases (`apple`,`google`) mapped to the canonical tokens. The body MUST send the canonical enum strings.
- **Confirm-gate (D-04/D-05) — client-side:** the v1 endpoint is NOT preview-gated; it publishes on receipt. So:
  - **Without `--confirm`:** print a preview, issue **no POST**, exit **3**. Preview mirrors the MCP `publish_app` no-confirm payload:
    ```
    { "will": "publish", "app_id": <id>, "target_stores": [...], "confirm_required": true }
    ```
    `[VERIFIED: app/Mcp/Tools/PublishAppTool.php handle() step 3]`
  - **With `--confirm`:** POST. **Response `204 No Content`** → success, exit 0, "Publication started for <stores>."
- **Errors:** 404 not owned; **409 conflict** (`resource_conflict`) if already published to a requested store — print the conflict message cleanly.

#### `appo push <id> --title <t> --body <b> --confirm` → `POST /api/v1/apps/{app}/push-notifications`
`[VERIFIED: PushNotificationController::store + PushNotification/StoreRequest + SendPushTool]`
- **Request body:** `title` (required, max 100), `body` (required, max 255), optional `image_path` (max 500), `target_url` (max 500), `scheduled_at` (date string).
- **Confirm-gate (D-04/D-05) — client-side, with recipient count:** the MCP `send_push` preview includes the exact `recipients_count`. The **v1 push endpoint has no preview** — it sends on receipt and returns the count only in the success response's `additional`. So the CLI cannot get the count without writing. Two options for the plan:
  1. **Synthesize a preview from request inputs only** (no count), matching the MCP shape but with the count omitted/labelled "unknown until sent". Mirrors `{ "will":"send_push", "app_id", "title", "confirm_required":true }` minus `recipients_count`.
  2. Document that the recipient count is only available post-send.
  Recommend option 1 — the count truly is not exposed pre-send by v1. (The MCP tool can compute it because it runs the device query in-process; the CLI cannot.) `[VERIFIED: PushNotificationController has no count-only/preview route; count is in store() response only]`
  - **Without `--confirm`:** print preview (title/body/target, "recipients counted at send time"), no POST, exit 3.
  - **With `--confirm`:** POST. **Response `201 Created`:**
    ```
    data: { id, title, body, image_url, target_url, status, scheduled_at, processed_at }
    additional: { recipients_count: <int> }
    ```
    Full envelope: `{ "data": {...}, "recipients_count": <int> }`. Human render: "Sent to <recipients_count> device(s)." `--json` prints the whole body verbatim.
- **Errors:** 404 not owned; 422 validation (title/body length).

#### `appo resubmit <id> --confirm` → `POST /api/v1/apps/{app}/resubmit`
`[VERIFIED: AppResubmitController::store + ResubmitTest + ResubmitHardFailTest + TriggerResubmissionTool]`
- **Request body:** none (path id only; `confirm` is a CLI concept, not sent to v1).
- **Confirm-gate (D-04/D-05) — client-side:** v1 executes on receipt. Mirror MCP `trigger_resubmission` no-confirm preview:
  ```
  { "will": "resubmit", "app_id": <id>, "current_state": "rejected", "target_state": "in_review",
    "confirm_required": true,
    "note": "A customer-owned Apple Developer credential is required. ..." }
  ```
  `[VERIFIED: app/Mcp/Tools/TriggerResubmissionTool.php handle() step 3]`
  - **Without `--confirm`:** print preview + the Apple-credential note, no POST, exit 3.
  - **With `--confirm`:** POST. **Response `200 { "data": { "status": "in_review" } }`** on success.
- **Edge cases (D-06):**
  - **422 `prerequisite_failed` / code `CUSTOMER_ASC_CREDENTIAL_MISSING`** when no customer-owned ASC credential exists (tiers 1–2 only; the internal Appo credential is architecturally unreachable here — Apple 4.2.6/5.2.1 compliance). `details.next_action = complete_enrollment`, `details.dashboard_url` points to the Apple-developer connect page. The CLI must print this as an actionable **blocked** state: "Connect your Apple Developer account before resubmitting" + the dashboard URL — not a raw error. `[VERIFIED: ResubmitHardFailTest asserts 422 + code CUSTOMER_ASC_CREDENTIAL_MISSING + app stays REJECTED]`
  - **422 `prerequisite_failed` / code `INVALID_APP_STATE`** when the app is not REJECTED ("Resubmission is only available for rejected apps.").
  - **404** not owned.

## Architecture Patterns

### System Architecture Diagram (data flow)

```
  argv ──> parseArgs() ──> { command, sub, rest, flags }
                                │
                                ▼
                      switch (command) in run()
                                │
        ┌───────────────────────┼────────────────────────────────┐
        │                       │                                  │
   read verbs              configure/build              destructive verbs
 (status/rejection/        (PATCH/POST)               (publish/push/resubmit)
  fix-recipe)                   │                                  │
        │                       │                       --confirm present?
        │                       │                      ┌──── no ───┴──── yes ───┐
        │                       │                      ▼                        ▼
        │                       │              previewGate():            issue POST via
        │                       │              build preview obj         apiFetch()
        │                       │              print (human or              │
        │                       │              --json w/ confirm_required)  │
        │                       │              return exit 3                 │
        ▼                       ▼                                            ▼
   apiFetch(apiBase, METHOD, path[, body])  ───────────────────────────────┘
                                │
                                ▼
            fetch() ─> Bearer PAT ─> /api/v1/...
                                │
                  ┌─────────────┴──────────────┐
              2xx body                      non-2xx
                  │                             │
            --json? ──yes──> print raw    throw Error{message, status, envelope}
                  │ no                          │
            curated printer              caught ─> print message + envelope.code/details
                  │                             │
              return 0                    return 1
```

### Recommended Project Structure
```
src/
├── cli.mjs        # dispatcher: extend the existing switch with 8 cases; USAGE; printers
├── api.mjs        # apiFetch — unchanged (already complete); error printer may read err.envelope
├── config.mjs     # unchanged
├── login.mjs      # unchanged
└── (optional) commands/   # ONLY if the switch grows unwieldy (D-cretion) — one file per verb,
                            #  each exporting an async fn(apiBase, args) -> exitCode so Phase 2 reuses it
```

### Pattern 1: Thin verb wrapper over apiFetch
**What:** Each verb validates required args (return 2 on missing), builds the exact v1 body, calls `apiFetch`, then either prints raw (`--json`) or a curated line.
**When to use:** All 8 verbs.
**Example:**
```javascript
// status --build (read verb)
case 'status': {
  if (!sub) { console.error('Usage: appo status <id> [--build <buildId>]'); return 2; }
  const path = flags.build
    ? `/api/v1/apps/${sub}/builds/${flags.build}`
    : `/api/v1/apps/${sub}`;
  const res = await apiFetch(apiBase, 'GET', path);
  if (flags.json) { console.log(JSON.stringify(res)); return 0; }
  const d = unwrap(res);
  flags.build ? printBuild(d) : printApp(d);   // printApp surfaces primary_action
  return 0;
}
```

### Pattern 2: Client-side confirm-gate (shared helper)
**What:** One helper that, given a verb + synthesized preview object, prints the preview and returns exit 3 when `--confirm` is absent; otherwise signals "proceed".
**When to use:** publish, push, resubmit.
**Example:**
```javascript
// Returns null when caller should proceed with the write; returns an exit code when gated.
function confirmGate(flags, preview) {
  if (flags.confirm) return null;          // proceed to POST
  if (flags.json) console.log(JSON.stringify({ ...preview, confirm_required: true }));
  else printPreview(preview);              // human-readable consequence
  return 3;                                // D-07: confirm-required exit code
}
```
> Preview content per verb is fixed by the MCP tool payloads documented above. Keep wording close to the MCP previews for cross-surface consistency (CONTEXT specifics).

### Anti-Patterns to Avoid
- **Re-implementing business logic client-side:** Do NOT replicate the credential-tier check, ownership check, or state-machine in the CLI. The CLI synthesizes a *preview*; the API is the source of truth and enforces everything on the actual POST. The preview is UX, not a gate the backend relies on.
- **Inventing or renaming response fields:** Print exactly what v1 returns. `--json` is verbatim passthrough (D-08). Any field renaming = drift = violates the non-negotiable + breaks `OpenApiSpecTest` parity expectations.
- **Blocking on the build:** `appo build` must return immediately (D-03). No polling in this phase (polling is Phase 2 `ship`).
- **Burying verb logic in the arg-parser:** Phase 2 `ship` reuses these verbs — keep each verb's core callable.
- **Using `?error=` query-param style output:** N/A to a CLI but the principle holds — preserve the structured envelope, don't flatten it to a string when `--json`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP + auth + envelope + 401 handling | A new fetch wrapper per verb | existing `apiFetch` | Already handles Bearer, 204, JSON parse, error extraction, 401 re-login hint |
| Response unwrapping | Per-verb `payload.data` access | existing `unwrap()` | One place; consistent |
| App printing | New printer | extend `printApp()` | Already prints id/name/state/primary_action/stores |
| Arg parsing | A second parser | existing `parseArgs()` | Handles `--key value`, `--flag`, positionals, `-h` |
| Confirm preview semantics | A novel preview format | the MCP tool payload shapes (documented above) | Cross-surface consistency; already designed and reviewed backend-side |
| Error code/category mapping | Custom HTTP-status switch | read `err.status` + `err.envelope.{code,details}` | The thrown Error already carries the full envelope |

**Key insight:** The CLI is a *thin transport + presentation* layer over a contract that already exists and is test-pinned. Almost everything is "wire the verb to the right path/body and print the result." The only genuinely new logic is the client-side confirm-gate, and even its payloads are copied from the MCP tools.

## Runtime State Inventory

> Greenfield-style additive phase (new code paths only) — no rename/migration. Most categories N/A, but checked explicitly:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — verified: no schema or stored-key changes; CLI reads `~/.appo/config.json` (token + api_base) unchanged | None |
| Live service config | None — the backend `/api/v1` + MCP tools already exist and ship; this phase only adds a client | None |
| OS-registered state | None — no daemons, schedulers, or process registrations | None |
| Secrets/env vars | `APPO_API_BASE` already read by `resolveApiBase`; token in config unchanged. No new secrets. (`APPO_TOKEN` is Phase 3, out of scope.) | None |
| Build artifacts | None — no compiled output; `.mjs` run directly via `bin/appo.mjs` | None |

## Common Pitfalls

### Pitfall 1: Treating the v1 POST as preview-gated
**What goes wrong:** Assuming `POST /publish` (etc.) returns a preview when called without confirm, like the MCP tool does.
**Why it happens:** The MCP tools confirm-gate server-side; the v1 HTTP endpoints do not — they execute on receipt.
**How to avoid:** Enforce the gate **client-side** (D-05). Without `--confirm`, never issue the POST; synthesize the preview and exit 3.
**Warning signs:** A publish/push/resubmit firing without `--confirm`; a test that expects a preview body from the v1 endpoint.

### Pitfall 2: Push recipient count in the no-confirm preview
**What goes wrong:** Trying to show `recipients_count` in the push preview to match the MCP `send_push` payload.
**Why it happens:** The MCP tool computes the count in-process via the device query; the v1 endpoint exposes the count only in the success response (`additional.recipients_count`), with no count-only/preview route.
**How to avoid:** Omit the count from the CLI's pre-send preview (or label it "counted at send time"). The count appears only after `--confirm` sends. `[VERIFIED: PushNotificationController has no preview/count route]`

### Pitfall 3: Swallowing the prerequisite/credential `details`
**What goes wrong:** `appo build` / `appo resubmit` print a bare message and lose the actionable `next_action` + `dashboard_url`.
**Why it happens:** `apiFetch` only extracts `message`; `code` and `details` live on `err.envelope`.
**How to avoid:** The verb-level or top-level error printer should read `err.envelope.code` and `err.envelope.details.{next_action,dashboard_url}` for `prerequisite_failed`/`CUSTOMER_ASC_CREDENTIAL_MISSING` and render them as a blocked-state with the dashboard link (D-06).
**Warning signs:** A blocked resubmit that prints "A customer-owned credential is required" but no URL/next step.

### Pitfall 4: `rejection`/`fix-recipe` 404 on a healthy app read as a hard error
**What goes wrong:** A non-rejected app returns 404 (state-probing guard), and the CLI prints "resource not found" as if the app doesn't exist.
**Why it happens:** The backend deliberately returns 404 (not empty 200) for non-REJECTED apps to prevent state probing.
**How to avoid:** For `rejection`/`fix-recipe`, interpret 404 as "no active rejection for this app" in the human path (the raw envelope stays `not_found`; `--json` is verbatim).

### Pitfall 5: 204 responses and `--json`
**What goes wrong:** `publish --confirm` and `configure` return 204 (no body); `apiFetch` returns `null`. `JSON.stringify(null)` prints `null` — fine — but a curated printer expecting `data` will throw.
**How to avoid:** Branch on null before unwrapping; human render prints a success line, `--json` prints `null` (or nothing) consistently.

## Code Examples

### Build verb (async trigger, immediate return)
```javascript
// Source: AppBuildController::store (POST /apps/{app}/builds) + Build/StoreRequest
case 'build': {
  if (!sub) { console.error('Usage: appo build <id> [--platform ios|android|all] [--branch <ref>]'); return 2; }
  const body = {};
  if (flags.platform) body.platform = flags.platform;   // validated server-side: ios|android|all
  if (flags.branch)   body.branch   = flags.branch;     // validated: /^[A-Za-z0-9._\/-]+$/
  const res = await apiFetch(apiBase, 'POST', `/api/v1/apps/${sub}/builds`, body);
  if (flags.json) { console.log(JSON.stringify(res)); return 0; }
  const b = unwrap(res);
  console.log(`Build #${b.id} started (${b.platform}). Poll: appo status ${sub} --build ${b.id}`);
  return 0;
}
```

### Publish verb with client-side gate
```javascript
// Source: AppPublishController::store (204) + PublishAppTool preview payload + AppStore enum
case 'publish': {
  if (!sub || !flags.stores) { console.error('Usage: appo publish <id> --stores apple_appstore,google_playstore --confirm'); return 2; }
  const stores = String(flags.stores).split(',').map(s => s.trim());  // canonical tokens
  const gated = confirmGate(flags, { will: 'publish', app_id: Number(sub), target_stores: stores });
  if (gated !== null) return gated;                       // exit 3, no write
  await apiFetch(apiBase, 'POST', `/api/v1/apps/${sub}/publish`, { app_stores: stores });  // 204
  if (flags.json) { console.log('null'); return 0; }
  console.log(`Publication started for: ${stores.join(', ')}`);
  return 0;
}
```

### Surfacing a prerequisite/credential block (resubmit)
```javascript
// Source: Handler.php prerequisite_failed envelope + AppResubmitController CUSTOMER_ASC_CREDENTIAL_MISSING
} catch (err) {
  const env = err.envelope;
  if (env?.error === 'prerequisite_failed') {
    console.error(`\n  Blocked: ${env.message}`);
    if (env.details?.dashboard_url) console.error(`  Next: ${env.details.next_action} → ${env.details.dashboard_url}\n`);
    return 1;
  }
  console.error(`\n  Error: ${err.message}\n`);
  return 1;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CLI = create/list/show only (MVP) | Full operator surface at v1/MCP parity | This phase | 8 new verbs; gate + exit-code taxonomy |
| Errors → exit 1/2 only | Add exit 3 for confirm-required | D-07 | CI/`ship` can distinguish a blocked gate from a real failure |
| `apiFetch` extracts `message` only | Verbs/printer also read `err.envelope.{code,details}` | This phase | Actionable blocked-state output for build/resubmit |

**Deprecated/outdated:** None. The existing MVP code is the foundation, not legacy — extend it, don't replace it (CLAUDE.md: "delete old code when replacing" — but here nothing is being replaced).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `configure` flag names (`--injected-css`, `--injected-js`, `--meta-name`, `--meta-desc`) — CONTEXT proposes these; final naming is Claude's discretion (D-cretion) | configure contract | Low — cosmetic; body field mapping to v1 is what matters and is verified |
| A2 | Human-readable wording of previews/curated output | all verbs | Low — explicitly Claude's discretion per CONTEXT |
| A3 | For `configure`'s 204 response, `--json` emits `null` (no body to passthrough) | Pitfall 5 | Low — consistent and defensible; plan may choose to echo submitted fields instead |

> All HTTP contract claims (paths, bodies, response shapes, error codes, validation rules, confirm-gate payloads) are `[VERIFIED]` against `../apps-web-app` source + feature tests — not assumed.

## Open Questions (RESOLVED)

> All three are Claude's-discretion items; each is resolved concretely in the Phase 1 plans.

1. **`--stores` input format for publish (D-cretion).**
   - What we know: v1 requires an array of exact tokens `apple_appstore` / `google_playstore`.
   - What's unclear: whether to accept friendly aliases (`apple`/`google`) and map them.
   - RESOLVED: accept comma list; map `apple→apple_appstore`, `google→google_playstore` for ergonomics, body sends canonical tokens (Plan 01-04 publish).

2. **Should `appo status` also surface latest build / push summary?**
   - What we know: MCP `get_app_overview` includes `latest_build` + `push`; the v1 `GET /apps/{app}` (AppResource) does **not**.
   - What's unclear: whether to make a second call (`GET /builds?` latest) to enrich `status`.
   - RESOLVED: keep `status` = AppResource (single call, lockstep) for this phase; build detail is `status --build`. Enriching is a Phase 2 `ship`-render concern (Plan 01-02).

3. **`configure`/`publish` 204 `--json` output convention.**
   - RESOLVED: emit `null` to keep "verbatim v1 body" semantics; documented (Plans 01-03/01-04).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (built-in `fetch`) | all verbs | ✓ | v22.12.0 (floor: ≥18) | — |
| `/api/v1` backend | live execution | ✓ (shipped in apps-web-app) | v1 | localhost:8002 default; tests mock HTTP |
| `../apps-web-app` source | planning/contract reference | ✓ | — | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None — backend is reachable; tests mock HTTP so no live backend is required for verification.

## Validation Architecture

> These commands must be verifiable WITHOUT a live backend. The whole surface is HTTP-over-`apiFetch`, so the test strategy is: mock `fetch` (or `apiFetch`) and assert the CLI sends the exact path/method/body and renders/exit-codes correctly. Phase 5 owns the full suite; this phase must keep the code shaped so HTTP is mockable.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert` (built-in, zero-dep) — REQUIREMENTS names vitest for Phase 5, but Phase 1 should not add a dep; `node:test` suffices for contract tests now `[ASSUMED: framework choice deferred to Phase 5; node:test for any phase-1 checks]` |
| Config file | none (built-in runner: `node --test`) |
| Quick run command | `node --test test/` |
| Full suite command | `node --test` (Phase 5 may swap to vitest) |

### How HTTP is mocked (the key enabler)
- **Preferred:** stub the global `fetch` (`globalThis.fetch = async () => new Response(JSON.stringify({data:{...}}), {status:200})`) so `apiFetch` runs unchanged and the test asserts the URL/method/body it was called with. This tests `apiFetch` + the verb together (true contract test).
- **Alternative:** inject `apiFetch` as a parameter / module mock so verbs can be unit-tested in isolation. Keeping each verb's core callable (D-cretion + Phase 2 reuse) makes this trivial.
- **Exit codes** are returned values from `run()` — assert them directly without spawning a process.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command (illustrative) | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLI-01 | each verb hits the correct v1 method+path+body | contract (mocked fetch) | `node --test test/verbs.test.mjs` | ❌ Wave 0 |
| CLI-01 | destructive verb without `--confirm` writes nothing + exits 3 + prints preview | unit | `node --test test/confirm-gate.test.mjs` | ❌ Wave 0 |
| CLI-01 | destructive verb with `--confirm` issues the POST | contract | `node --test test/confirm-gate.test.mjs` | ❌ Wave 0 |
| CLI-01 | `--json` emits the raw v1 body verbatim | unit | `node --test test/json-output.test.mjs` | ❌ Wave 0 |
| CLI-01 | exit codes 0/1/2/3 per D-07 | unit | `node --test test/exit-codes.test.mjs` | ❌ Wave 0 |
| CLI-01 | resubmit CUSTOMER_ASC_CREDENTIAL_MISSING renders blocked-state with dashboard_url | unit (mocked 422 envelope) | `node --test test/resubmit-block.test.mjs` | ❌ Wave 0 |
| CLI-01 | `--help` + per-command usage enumerate all verbs/flags | unit | `node --test test/help.test.mjs` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test test/<verb>.test.mjs` (the touched verb)
- **Per wave merge:** `node --test test/`
- **Phase gate:** full `node --test` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/` directory + a tiny `fetch`-stub helper (`test/helpers/mockFetch.mjs`) — covers CLI-01 contract tests
- [ ] No framework install needed (`node:test` is built-in). If the plan instead adopts vitest early, that is the only install — but it contradicts the zero-dep stance for runtime; vitest as a devDependency is acceptable and is Phase 5's call.

## Project Constraints (from CLAUDE.md + PROJECT.md)

> Treat with the same authority as locked decisions.
- **Dependency-free Node CLI** — built-in `fetch`/`http`/`fs` only. No new runtime deps. (devDependencies for tests are Phase 5's call.) `[VERIFIED: PROJECT.md, CLAUDE.md]`
- **Never weaken auth parity** — destructive ops mirror the MCP confirm-gate. The client-side gate (D-05) satisfies this without changing the auth model. `[VERIFIED: PROJECT.md non-negotiable]`
- **Keep request/response shapes in lockstep with `/api/v1` (no drift)** — `--json` is verbatim passthrough; never rename/invent fields; `OpenApiSpecTest` is the backend drift-guard. `[VERIFIED: PROJECT.md non-negotiable + OpenApiSpecTest]`
- **Concrete types, early returns, delete old code, small focused functions** — Go-flavored in CLAUDE.md but the spirit applies: small per-verb handlers, early `return 2` on bad args, no versioned function names. `[VERIFIED: CLAUDE.md]`
- **Repository docs read as neutral** — applies to any docs/help text added.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Lifecycle commands are flat top-level verbs (not nested under `apps`); `apps create/list/show/set-name` stay nested. Each new verb maps 1:1 to one v1 endpoint (mapping table in CONTEXT, verified above).
- **D-02:** `appo status <id>` defaults to the app overview (publication_state + primary_action + latest build/push summary per MCP); `--build <id>` switches to build status (for polling, used by Phase 2 `ship`).
- **D-03:** `trigger_build`/`appo build` never waits — returns the build id immediately.
- **D-04:** publish/push/resubmit require `--confirm`. Without it, no write — print the MCP confirm-gate preview and exit with the confirm-required code.
- **D-05:** The gate is enforced **client-side** (v1 POSTs execute on receipt; not preview-gated). Preview synthesized from overview/inputs — mirrors MCP `confirm_required:true` without weakening auth parity.
- **D-06:** `resubmit` surfaces the backend hard-fail (no customer-owned Apple/ASC credential → "connect your Apple Developer account") as an actionable blocked state, not a raw error.
- **D-07:** Exit codes: `0` success; `1` runtime/API error (incl. 401 → "run `appo login`"); `2` usage error; `3` confirm required (preview emitted, no write). Code 3 distinct so Phase 2/CI can detect a blocked gate.
- **D-08:** `--json` prints the raw parsed v1 response body verbatim (envelope included). For confirm previews, `--json` emits the preview object with `confirm_required: true`.
- **D-09:** Default human mode unwraps `data` and prints curated lines, reusing `printApp()`/`unwrap()`; new commands get small consistent printers.
- **D-10:** `appo --help` enumerates every command grouped (auth/apps/lifecycle); per-command help prints usage + flags.

### Claude's Discretion
- Exact wording of curated human-readable output per command.
- Whether to factor command handlers into one file or per-command modules (current code is a single `switch` in `src/cli.mjs`; planner/executor may split if it grows).
- `--stores` value format for `publish` (comma list vs repeated flag) — pick what matches the v1 `app_stores` array contract.

### Deferred Ideas (OUT OF SCOPE)
- `appo ship` orchestration (create→build→poll→publish) — **Phase 2** (killer feature); reuses these verbs, so keep each verb's core logic callable, not buried in arg-parsing.
- Build-status polling loop — **Phase 2** `ship`; Phase 1 exposes only single-shot `status --build`.
- Non-interactive auth (`APPO_TOKEN` / `--token`), token refresh, multi-env profiles — **Phase 3**.
- `appo preview` (QR + TestFlight/deeplink) — **Phase 4** (blocked on apps-web-app Phase 188).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLI-01 | Operator command parity — build/publish/status/push/configure/rejection/fix-recipe/resubmit at parity with `/mcp` AppoServer tools + `/api/v1`; destructive commands confirm-gated; `--json` + documented exit codes | Full per-command v1 contract extracted + verified (paths, bodies, response shapes, error envelopes, validation rules); MCP confirm-gate preview payloads extracted for client-side synthesis (D-05); exit-code taxonomy mapped to actual HTTP error codes; reuse path through existing `apiFetch`/`unwrap`/`printApp` identified; HTTP-mock test strategy defined |

## Sources

### Primary (HIGH confidence)
- `../apps-web-app/routes/api_v1.php` — all 8 endpoint routes + `auth:sanctum`/`ability:user` middleware (lines 35–62)
- `../apps-web-app/app/Mcp/Servers/AppoServer.php` — the 10-tool registry + confirm-gate convention + server instructions ("read get_app_overview first")
- `../apps-web-app/app/Mcp/Tools/{GetAppOverview,GetBuildStatus,TriggerBuild,PublishApp,SendPush,TriggerResubmission,ConfigureApp,GetRejection,GetFixRecipe}Tool.php` — confirm-gate preview payload shapes + input schemas
- `../apps-web-app/app/Http/Controllers/Api/V1/{AppController,AppBuildController,AppPublishController,PushNotificationController,AppResubmitController,AppRejectionController,AppRecipeController}.php` — HTTP request handling, status codes, ownership guards
- `../apps-web-app/app/Http/Requests/Api/V1/{App/UpdateRequest,Build/StoreRequest,Publish/StoreRequest,PushNotification/StoreRequest}.php` — exact validation rules
- `../apps-web-app/app/Http/Resources/V1/{AppResource,AppBuildResource,AppRejectionResource,AppRecipeResource,PushNotificationResource}.php` — exact response field allowlists
- `../apps-web-app/app/Exceptions/Handler.php` + `app/Exceptions/CliBuildPrerequisiteException.php` + `Concerns/RendersV1Envelope.php` — the uniform error envelope + 422 prerequisite shape
- `../apps-web-app/app/Enums/AppStore.php`, `app/Enums/Public/{PublicPublicationStatus,PublicBuildStatus,PublicationState,PrimaryAction}.php` — the public vocabulary the CLI prints
- `../apps-web-app/app/Actions/App/TriggerCliBuild.php` — build prerequisite hard-fail codes
- `../apps-web-app/tests/Feature/Api/V1/{AppPublishControllerTest,RejectionEndpointTest,RecipeEndpointTest,ResubmitHardFailTest,ResubmitTest,AppBuildControllerTest,OpenApiSpecTest}.php` — assert the exact request/response shapes (the contract pins)
- `appo` repo: `src/cli.mjs`, `src/api.mjs`, `src/config.mjs`, `bin/appo.mjs` — the patterns being extended

### Secondary (MEDIUM confidence)
- None required — contract is fully sourced from primary.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- v1 contract (paths/bodies/responses/errors): HIGH — read directly from controllers + FormRequests + Resources + asserted in feature tests
- Confirm-gate preview payloads: HIGH — copied from the MCP tool `handle()` no-confirm branches
- Exit-code mapping: HIGH — D-07 cross-referenced against the actual HTTP status codes the backend returns
- Test/mock strategy: MEDIUM — `node:test` + `fetch` stub is sound and dep-free; final framework is Phase 5's decision (vitest per REQUIREMENTS)
- Human-output wording / flag names: LOW (by design — Claude's discretion)

**Research date:** 2026-06-15
**Valid until:** ~2026-07-15 (stable — contract is test-pinned by `OpenApiSpecTest`; revisit if apps-web-app changes the v1 surface)
