# Phase 1: Operator command parity - Context

**Gathered:** 2026-06-15 (--auto)
**Status:** Ready for planning

<domain>
## Phase Boundary

Expose the full publishing-operator command surface in the `appo` CLI — `build`, `status`,
`publish`, `push`, `configure`, `rejection`, `fix-recipe`, `resubmit` — at 1:1 parity with the
10 AppoServer MCP tools and the `/api/v1` endpoints. `apps create/list/show/set-name`, `login`,
`logout`, `whoami` already shipped (bootstrap). Destructive commands are confirm-gated; every
command supports `--json` and returns documented exit codes; `--help` enumerates the surface.

Out of scope for this phase: the `appo ship` orchestration (Phase 2 — it *reuses* these
commands), auth hardening / non-interactive token (Phase 3), preview/QR (Phase 4), tests (Phase 5).
</domain>

<decisions>
## Implementation Decisions

### Command surface & MCP→v1 mapping
- **D-01:** Lifecycle commands are **flat top-level verbs** (matches ROADMAP success criterion 1),
  not nested under `apps`. The already-shipped resource verbs (`apps create/list/show/set-name`)
  stay nested as-is. Each new verb maps 1:1 to one v1 endpoint:

  | CLI command | MCP tool | v1 endpoint |
  |---|---|---|
  | `appo status <id>` | `get_app_overview` | `GET /api/v1/apps/{app}` |
  | `appo status <id> --build <buildId>` | `get_build_status` | `GET /api/v1/apps/{app}/builds/{build}` |
  | `appo build <id>` | `trigger_build` | `POST /api/v1/apps/{app}/builds` |
  | `appo rejection <id>` | `get_rejection` | `GET /api/v1/apps/{app}/rejection` |
  | `appo fix-recipe <id>` | `get_fix_recipe` | `GET /api/v1/apps/{app}/rejection/recipe` |
  | `appo configure <id> [--name/--url/--meta-name/--meta-desc/--injected-css/--injected-js]` | `configure_app` | `PATCH /api/v1/apps/{app}` |
  | `appo publish <id> --stores <a,b> --confirm` | `publish_app` | `POST /api/v1/apps/{app}/publish` |
  | `appo push <id> --title <t> --body <b> --confirm` | `send_push` | `POST /api/v1/apps/{app}/push-notifications` |
  | `appo resubmit <id> --confirm` | `trigger_resubmission` | `POST /api/v1/apps/{app}/resubmit` |

- **D-02:** `appo status <id>` defaults to the **app overview** (publication_state +
  `primary_action` + latest build summary + push summary — the MCP "start here" payload).
  Build-by-id status is the same verb with `--build <buildId>`. (`get_build_status` is for polling;
  Phase 2's `ship` polls this.)
- **D-03:** `trigger_build` never waits — `appo build <id>` returns the build id immediately
  (parity with the tool description; polling is the caller's job via `status --build`).

### Confirm-gate UX (publish / push / resubmit)
- **D-04:** The three destructive verbs require `--confirm`. **Without `--confirm` the CLI performs
  NO write** — it prints the same preview the MCP confirm-gate returns (publish → target stores;
  push → recipient count; resubmit → Apple-credential requirement note) and exits with the
  confirm-required code (D-07). With `--confirm` it issues the POST.
- **D-05:** The CLI enforces the gate **client-side** (the v1 POST endpoints execute on receipt —
  they are not themselves preview-gated). The preview is synthesized from the app overview /
  request inputs so the operator sees the consequence before committing. This mirrors the MCP
  semantics (`confirm_required: true` preview payload) without weakening auth parity (PROJECT.md
  non-negotiable).
- **D-06:** `resubmit` surfaces the backend's hard-fail cleanly: if no customer-owned Apple/ASC
  credential exists, the v1 endpoint returns the "connect your Apple Developer account" message —
  the CLI prints it as an actionable blocked state, not a raw error.

### Exit-code taxonomy (documented)
- **D-07:** Documented exit codes, extending the MVP's existing 0/1/2 usage:
  - `0` — success
  - `1` — runtime / API error (includes auth failure: 401 → "run `appo login`")
  - `2` — usage error (missing/invalid args) — already used by the MVP parser
  - `3` — confirm required (destructive verb invoked without `--confirm`; preview emitted, no write)
  Code `3` is distinct so Phase 2 `ship` and CI scripts can detect a blocked gate vs a real failure.

### Output / `--json`
- **D-08:** `--json` prints the **raw parsed v1 response body verbatim** (envelope included, e.g.
  `{ "data": {...} }`) to stdout and nothing else — zero response-shape drift (PROJECT.md
  non-negotiable "lockstep with /api/v1"). For confirm previews, `--json` emits the preview object
  with `confirm_required: true`.
- **D-09:** Default (human) mode unwraps `data` and prints curated lines, reusing the existing
  `printApp()` / `unwrap()` helpers in `src/cli.mjs`. New commands get small, consistent printers.

### Help & discoverability
- **D-10:** `appo --help` is extended to enumerate every command grouped (auth / apps / lifecycle).
  Per-command help (`appo <cmd> --help` or missing required args) prints that command's usage +
  flags. Satisfies ROADMAP success criterion 4.

### Claude's Discretion
- Exact wording of curated human-readable output per command.
- Whether to factor command handlers into one file or per-command modules (current code is a single
  `switch` in `src/cli.mjs` — planner/executor may split if it grows).
- `--stores` value format for `publish` (comma list vs repeated flag) — pick what matches the v1
  `app_stores` array contract.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.** Paths are relative to this
repo (`appolabs/appo`); the backend lives in the sibling `apps-web-app`.

### Parity source of truth — MCP tool registry
- `../apps-web-app/app/Mcp/Servers/AppoServer.php` — the canonical list of the 10 operator tools
  and the confirm-gate convention (publish/resubmit/push require `confirm:true`).
- `../apps-web-app/app/Mcp/Tools/TriggerBuildTool.php` — build dispatch semantics (returns id, never waits).
- `../apps-web-app/app/Mcp/Tools/GetAppOverviewTool.php` — overview payload (`primary_action` "start here").
- `../apps-web-app/app/Mcp/Tools/GetBuildStatusTool.php` — curated build status fields for polling.
- `../apps-web-app/app/Mcp/Tools/PublishAppTool.php` — confirm-gate preview shape (target stores).
- `../apps-web-app/app/Mcp/Tools/SendPushTool.php` — confirm-gate preview (recipient count).
- `../apps-web-app/app/Mcp/Tools/TriggerResubmissionTool.php` — confirm-gate + Apple-credential note.
- `../apps-web-app/app/Mcp/Tools/ConfigureAppTool.php` — configurable fields (name, base_url, injected css/js, metadata).
- `../apps-web-app/app/Mcp/Tools/GetRejectionTool.php`, `.../GetFixRecipeTool.php` — read payloads.

### Parity source of truth — v1 HTTP contract (what the CLI actually calls)
- `../apps-web-app/routes/api_v1.php` §lines 37–61 — the apps/builds/rejection/recipe/resubmit/
  publish/push routes + their `ability:USER` middleware (the user PAT the CLI holds).
- `../apps-web-app/app/Http/Controllers/Api/V1/AppBuildController.php` — build store/index/show shapes.
- `../apps-web-app/app/Http/Controllers/Api/V1/AppPublishController.php` — requires `app_stores` array.
- `../apps-web-app/app/Http/Controllers/Api/V1/PushNotificationController.php` — `title`/`body` in,
  `recipients_count` in the response `additional`.
- `../apps-web-app/app/Http/Controllers/Api/V1/AppResubmitController.php` — hard-fail on missing
  customer-owned ASC credential (tiers 1–2 only).
- `../apps-web-app/tests/Feature/Api/V1/` — `AppPublishControllerTest`, `RejectionEndpointTest`,
  `RecipeEndpointTest`, `ResubmitHardFailTest`, `OpenApiSpecTest` — exercise the exact request/response
  shapes the CLI must match; the OpenAPI spec test is the drift guard.

### This repo
- `.planning/PROJECT.md` — non-negotiables (auth parity, /api/v1 lockstep) and key decisions.
- `.planning/REQUIREMENTS.md` — CLI-01 acceptance criteria.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/api.mjs` → `apiFetch(apiBase, method, path, body)` — already handles Bearer auth, JSON
  envelope, 204, and v1 error extraction (`payload.message`/`error`, 401 → re-login). All new
  commands route through this; no new HTTP code needed.
- `src/cli.mjs` → `parseArgs()` (flags + positionals), `unwrap()` (`data` envelope), `printApp()`
  (curated app printer). The new verbs slot into the existing `switch (command)` and reuse these.
- `src/config.mjs` → `resolveApiBase()`, `storedToken()` — API base precedence + token already solved.

### Established Patterns
- Single dependency-free `switch`-based dispatcher in `src/cli.mjs`; each command returns an exit
  code (0/1/2 today — D-07 adds 3). Errors throw and are caught once at the bottom → exit 1.
- Usage strings centralized in the `USAGE` constant; missing-arg branches print per-command usage
  and `return 2`.

### Integration Points
- New verbs are added to the `switch` in `src/cli.mjs` (or split into per-command modules — D-cretion).
- `--json` short-circuits the curated printers and writes the raw `apiFetch` result.
- Confirm-gate is a small shared helper invoked by publish/push/resubmit before any POST.

</code_context>

<specifics>
## Specific Ideas

- The MCP server's own instructions are the UX north star: "Read get_app_overview first;
  primary_action names the single next move." The CLI's `appo status` should surface
  `primary_action` prominently — it's the operator's compass and what Phase 2 `ship` keys off.
- Keep the destructive-command preview wording close to the MCP previews so the CLI, dashboard,
  and `/mcp` agent surface read consistently to a user switching between them.

</specifics>

<deferred>
## Deferred Ideas

- `appo ship` orchestration (create→build→poll→publish) — **Phase 2** (KILLER FEATURE); it reuses
  these command implementations, so keep each verb's core logic callable, not buried in arg-parsing.
- Build-status **polling loop** (wait until ready/failed) — belongs to Phase 2 `ship`; Phase 1 only
  exposes the single-shot `status --build`.
- Non-interactive auth (`APPO_TOKEN` / `--token`), token refresh, multi-env profiles — **Phase 3**.
- `appo preview` (QR + TestFlight/deeplink) — **Phase 4** (blocked on apps-web-app Phase 188).

None of the above were treated as in-scope — discussion stayed within the parity boundary.

</deferred>

---

*Phase: 01-operator-command-parity*
*Context gathered: 2026-06-15*
