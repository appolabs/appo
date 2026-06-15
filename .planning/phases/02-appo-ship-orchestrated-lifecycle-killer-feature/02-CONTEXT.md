# Phase 2: `appo ship` — orchestrated lifecycle (KILLER FEATURE) - Context

**Gathered:** 2026-06-15 (--auto)
**Status:** Ready for planning

<domain>
## Phase Boundary

A single command takes an app from zero to submitted: `appo ship --url <u> --name <n>` (new app)
or `appo ship <id>` (existing app) runs **create → trigger build → poll status → publish**,
streaming each step and stopping cleanly on the first step that needs human input (missing
credential, rejection, build failure). It reuses the Phase 1 verb implementations — no duplicated
API logic. This is the verb that makes the CLI worth using over raw API calls.

In scope: the `ship` orchestrator, the shared API-operation layer it reuses, build-status polling,
step streaming, blocking-step handling, the publish confirm-gate at the ship level, and `--json`/
exit-code mapping. Out of scope: new lifecycle capabilities (all already shipped in Phase 1),
non-interactive auth (Phase 3), preview/QR (Phase 4), tests/CI (Phase 5 — covers `ship`).

**Carrying forward from Phase 1 (locked):** flat verbs + 1:1 v1 mapping (D-01); confirm-gate is
client-side, no write without confirm, exit 3 (D-04/D-05/D-07); `--json` emits verbatim v1 body
(D-08); `renderError` renders `prerequisite_failed` blocked states (D-06); never weaken the
confirm-gate, never log the PAT, lockstep with `/api/v1` (PROJECT non-negotiables).
</domain>

<decisions>
## Implementation Decisions

### Reuse architecture (success criterion 1 — no duplicated API logic)
- **D-01:** Extract a shared API-operation layer `src/ops.mjs` — thin async functions over the
  existing `apiFetch`, one per lifecycle operation, returning unwrapped data (or the raw envelope
  where needed): `createApp(apiBase, {name, base_url, ...})`, `triggerBuild(apiBase, id, {platform, branch})`,
  `getApp(apiBase, id)`, `getBuild(apiBase, id, buildId)`, `publishApp(apiBase, id, app_stores)`.
- **D-02:** Refactor the Phase 1 `case` blocks in `src/cli.mjs` to call these ops (delete the inline
  `apiFetch` duplication — feature branch, no back-compat shims). `appo ship` composes the SAME ops.
  Result: one definition of each API call, used by both the single verbs and the orchestrator.
- **D-03:** `ship` lives as its own `case 'ship'` orchestrator function; it does NOT re-enter the
  CLI `switch` or shell out to itself — it calls ops directly and reuses the shared `confirmGate`,
  `printPreview`, `renderError`, and printers.

### Entry points & sequencing
- **D-04:** Two forms:
  - `appo ship --url <u> --name <n> [--meta-name] [--meta-desc] [--stores <list>] [--platform] [--yes]`
    → starts at **create**, then build → poll → publish.
  - `appo ship <id> [--stores <list>] [--platform] [--yes]` → existing app, **skips create**,
    starts at build → poll → publish.
- **D-05:** Step order is fixed: create (if new) → trigger build → poll build to terminal → publish.
  `--stores` defaults to both canonical tokens (`apple_appstore,google_playstore`) and accepts the
  Phase 1 friendly aliases (`apple`/`google`); the publish step blocks cleanly if a store's
  credential is missing (D-09) rather than the CLI pre-validating.

### Polling strategy
- **D-06:** After `triggerBuild`, poll `getBuild` until a terminal status. Default interval **5s**,
  overall **`--timeout` default 1800s (30 min)**. Print a line only on status change (not every poll)
  to keep the stream readable.
- **D-07:** Terminal states drive the next step: build **ready/succeeded** → proceed to publish;
  build **failed** → stop (D-09). The researcher MUST confirm the exact build-status enum from the
  backend (`AppBuildController` / build-status resource) — do not hardcode guessed status strings.

### Blocking / stop semantics (success criterion 3 — never a raw error or half-finished silent state)
- **D-08:** `ship` stops at the FIRST step that errors or needs human input, prints what happened +
  the concrete resume command, and exits non-zero. It never leaves a silent half-finished state.
- **D-09:** Specific blocks:
  - Build **failed** → print failure + hint `appo fix-recipe <id>` / `appo rejection <id>`; exit 1.
  - Publish **prerequisite_failed** (e.g. missing customer Apple/ASC credential) → reuse Phase 1
    `renderError` (Blocked: … / Next: <next_action> -> <dashboard_url>); exit 1.
  - Poll **timeout** → print last status + `appo status <id> --build <buildId>` to resume; exit 1.

### Confirm-gate at the publish step (success criterion 2 — honor the gate)
- **D-10:** The publish step is destructive, so it honors the confirm-gate. Without `--yes`, `ship`
  runs create→build→poll, then **stops at the publish preview and exits 3** (the same preview the
  Phase 1 `publish` confirm-gate shows). With `--yes`, the publish step executes. `--yes` is the
  ship-level pipeline confirmation; it maps to `confirm: true` for the publish op only.

### Progress streaming & `--json` (success criterion 4)
- **D-11:** Human mode streams each step live with ASCII-safe markers (CLAUDE.md repo-doc voice —
  use `->`, not unicode arrows): e.g. `> create ... ok app #5`, `> build #12 ...`, `  building -> ...`,
  `ok build ready`, `> publish ...`. Each step's outcome is visible as it happens.
- **D-12:** `--json` suppresses the live stream and emits ONE structured object at completion:
  `{ "steps": [ {"step":"create","status":"ok","app_id":5}, {"step":"build","status":"ok","build_id":12}, {"step":"publish","status":"gated|ok|blocked", ...} ], "final_state": "shipped|gated|blocked|failed" }`.

### Exit-code mapping (final lifecycle state)
- **D-13:** Extends the Phase 1 0/1/2/3 taxonomy, reflecting the final lifecycle state:
  - `0` — shipped (publish executed / app submitted)
  - `3` — stopped at the publish confirm-gate (no `--yes`; preview shown, no write)
  - `1` — a step errored or blocked (build failed, missing credential, rejection, poll timeout)
  - `2` — usage error (missing required args: neither `<id>` nor `--url`+`--name`)

### Claude's Discretion
- Exact human-stream wording / marker glyphs (within ASCII constraint).
- Whether ops live in one `src/ops.mjs` or are grouped further if the file grows.
- Poll backoff shape (fixed 5s vs mild backoff) — fixed interval is the default unless research shows a reason.
- Whether `ship` accepts `--confirm` as an alias for `--yes` (consistency with single verbs).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.** Paths relative to this repo
(`appolabs/appo`); backend lives in the sibling `apps-web-app`.

### This repo (Phase 1 — the surface ship orchestrates)
- `src/cli.mjs` — the Phase 1 verb `case` blocks to refactor onto the shared ops layer; `confirmGate`,
  `printPreview`, `renderError`, `parseArgs`, and the printers `ship` reuses.
- `src/api.mjs` — `apiFetch` (auth, envelope, 204, 401, `err.status`/`err.envelope`) — ops wrap this.
- `src/config.mjs` — `resolveApiBase`, `storedToken`.
- `.planning/phases/01-operator-command-parity/01-CONTEXT.md` — locked Phase 1 decisions (D-01..D-10).
- `.planning/phases/01-operator-command-parity/01-RESEARCH.md` — verbatim v1 contract for create/build/
  status/publish + the build-status enum and prerequisite_failed envelope shapes ship depends on.

### Parity source of truth — backend (`apps-web-app`)
- `../apps-web-app/routes/api_v1.php` — apps/builds/publish routes the ops call.
- `../apps-web-app/app/Http/Controllers/Api/V1/AppBuildController.php` — build store + **status enum**
  (terminal ready/failed values for the poll loop — D-07).
- `../apps-web-app/app/Http/Controllers/Api/V1/AppPublishController.php` — `app_stores` body + prerequisite behavior.
- `../apps-web-app/app/Http/Controllers/Api/V1/AppController.php` — create (store) body fields.
- `../apps-web-app/app/Mcp/Tools/GetAppOverviewTool.php` — `primary_action` (the lifecycle compass ship keys off).

### This repo
- `.planning/PROJECT.md` — non-negotiables (confirm-gate, /api/v1 lockstep, PAT never logged).
- `.planning/REQUIREMENTS.md` — CLI-06.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apiFetch` (`src/api.mjs`) — every op wraps this; auth/envelope/204/401 already solved.
- `confirmGate` / `printPreview` (`src/cli.mjs`) — the publish step's gate (D-10) reuses them directly.
- `renderError` (`src/cli.mjs`) — `prerequisite_failed` blocked-state rendering for the publish block (D-09).
- `printApp` / `printBuild` (`src/cli.mjs`) — curated step output without response drift.
- `parseArgs` (`src/cli.mjs`) — now supports `--key=value` and `--` (Phase 1 WR-02 fix) — covers ship flags.

### Established Patterns
- Single `switch (command)` dispatcher; each verb returns an exit code; one top-level catch → `renderError`.
- `--json` short-circuits curated printers and emits machine output (ship: one summary object, D-12).

### Integration Points
- New `src/ops.mjs` module; Phase 1 cases refactored to import from it; new `case 'ship'` added to the switch.
- USAGE extended with the `ship` forms + `--yes`/`--timeout`/`--stores` flags + lifecycle exit-code note.

</code_context>

<specifics>
## Specific Ideas

- The MCP server's compass — "read get_app_overview first; primary_action names the single next move" —
  is the orchestration model: `ship` walks the same lifecycle the dashboard/MCP expose, just streamed
  from the terminal. The blocking-step messages should read consistently with the Phase 1 verbs and the
  MCP previews so a user moving between surfaces sees the same language.
- "Zero to submitted in one command" is the headline; the streamed step-by-step progress is what makes
  it feel trustworthy versus a black-box script — never hide a step or fail silently.

</specifics>

<deferred>
## Deferred Ideas

- `--watch`/re-entrant resume that auto-continues a previously-blocked ship after the user fixes the
  blocker — nice-to-have; for now the resume path is re-running `appo ship <id>`.
- Parallel multi-store publish status reporting beyond the single publish call — out of scope; publish
  is one v1 call.
- Non-interactive auth so `ship` runs in CI without a browser — **Phase 3** (CLI-07).
- Automated tests for the `ship` orchestration (HTTP mocked) — **Phase 5** (explicitly covers ship).

None of the above were treated as in-scope — discussion stayed within the orchestration boundary.

</deferred>

---

*Phase: 02-appo-ship-orchestrated-lifecycle-killer-feature*
*Context gathered: 2026-06-15*
