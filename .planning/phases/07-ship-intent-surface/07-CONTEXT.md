# Phase 7: Ship-intent surface + config rescope — Context

**Gathered:** 2026-06-16 · **Updated:** 2026-06-22 (cross-repo dependency satisfied; `--icon` contract now concrete)
**Status:** Ready for planning

> CLI counterpart of `apps-web-app` v3.1. Decision locked: **the CLI never triggers or polls a build** (builds are issued by Appo staff server-side), and `apps update` is limited to icon/url/name.
>
> **Dependency satisfied:** `apps-web-app` Phase 189 (build off the user surface — complete 2026-06-21) and Phase 190 (config lock to name+base_url + agent-surface `set_icon` — complete 2026-06-22) are both shipped. This phase is **unblocked**.

<domain>
## Phase Boundary

Redefine the CLI lifecycle so the user/agent never builds. In scope: `ship` (re-shape to create + publish-intent, no build/poll), removing the build transport (`ops.triggerBuild` + `pollBuild`), and rescoping `apps update` to icon/url/name. Out of scope: the backend changes (those are `apps-web-app` Phases 189/190, now shipped) — this phase consumes them.
</domain>

<decisions>
## Implementation Decisions

- **D-01 — `ship` = publish-intent, not a build pipeline.** Today `ship` does create → build → poll → publish (`src/cli.mjs` `case 'ship'`, `src/ops.mjs` `triggerBuild` + `pollBuild`). Reshape it: `appo ship --url --name` creates the app (`createApp`) then signals publish-intent via the publish path (`POST /api/v1/apps/{app}/publish`, the existing `publishApp` op). `appo ship <id>` signals (re)publish-intent on an existing app. No build call, no poll loop — return immediately. **Verified against the live backend:** `StartPublication::run($app, $stores)` → `$app->publicationStarted($stores)` does NOT require a prior successful build, so publish-intent works on a never-built app. Confirm-gate semantics on the publish step are preserved (`--yes`/`--confirm`, exit 3 without it).

- **D-02 — Remove the build transport.** Delete `ops.triggerBuild` and the `pollBuild` loop (`src/ops.mjs:33` + `src/cli.mjs:268`), plus the build/poll steps in the `case 'ship'` ledger (`src/cli.mjs:692`/`:707`). No CLI code path may call `POST .../builds` — the v1 route now returns **405** and the legacy route **404** for a user PAT (apps-web-app Phase 189). Build STATUS **reads** stay (`appo status <id>` → `GET /api/v1/apps/{app}/builds[/{build}]` survive on the user surface); only issuance/polling is removed.

- **D-03 — `apps update` = icon/url/name.** `apps update <id>` currently maps `--name`, `--url`, `--meta-name`, `--meta-desc` (`src/cli.mjs:531`–`:537`). Drop `--meta-name`/`--meta-desc` — the v1 `PATCH /api/v1/apps/{app}` user surface now silently ignores all fields except `name`/`base_url` (apps-web-app Phase 190-01), so sending them is dead weight. Keep `--name`, `--url` (→ `PATCH`, the existing path). Add `--icon`.

- **D-04 — `--icon` is a separate POST, not part of the PATCH body.** The icon endpoint is its own route: `POST /api/v1/apps/{app}/icon` with body `{ "icon_url": "<https image URL>" }`, returning `{ "icon_url": "..." }` (apps-web-app Phase 190-02). `--icon` takes an **https image URL** (mirrors `apps create --url`), NOT a file upload. Add a new `ops.setIcon(apiBase, id, icon_url, env)` op; wire `apps update --icon <url>` to it. When `--name`/`--url` AND `--icon` are all given, run the `PATCH` first, then the icon `POST`, and report both. The endpoint is SSRF-guarded server-side (https-only, public host, allowed image mime, ≤5 MB) → a rejected icon returns **422**; surface it through the shared `renderError` path like the other write verbs.

- **D-05 — Docs/tests/exit-codes.** Update `test/integration/ship.test.mjs` (assert create→publish-intent, **no** `/builds` request), the `pollBuild` unit tests (deleted), the write/update tests (`--icon` happy path + 422 SSRF reject + `--meta-*` removed), `README.md`, `llms.txt`, and `test/integration/docs.test.mjs`. Keep the exit-code taxonomy. `npm test` + lint + typecheck green.

### Claude's Discretion (remaining)
- The exact `ship` success message; recommended default: a short "submitted — Appo will build and submit it" line plus a tracking hint (`appo status <id>` / `appo preview <id>`).
- Whether `ship --json` keeps a ledger; recommended default: keep it as a shorter `{steps:[create, publish], final_state}` object (drop the build/poll steps), preserving the lifecycle-aware exit code.
- Whether to delete the now-unused `pollBuild` export entirely vs retain for `status` — recommended: delete (status uses `ops.getApp`/`ops.getBuild`, not the poll loop).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### This repo (the code to change)
- `src/cli.mjs` — `case 'ship'` (`:640`), `case 'apps'` update branch (`:495`/`:531`), `pollBuild` (`:268`), USAGE (`:33`/`:36`).
- `src/ops.mjs` — `triggerBuild` (`:33`, delete), `publishApp` (`:48`, reused for intent), `createApp` (`:18`), `getApp`/`getBuild` (status reads stay); add `setIcon`.
- `test/integration/ship.test.mjs`, `test/integration/write-verbs.test.mjs`, `README.md`, `llms.txt`, `test/integration/docs.test.mjs`.

### Cross-repo backend contract (now shipped — read these for exact shapes)
- `apps-web-app/.planning/phases/189-build-staff-only/189-01-SUMMARY.md` — build off the user surface: v1 POST builds → **405**, legacy → **404**; status reads retained.
- `apps-web-app/.planning/phases/190-user-config-icon-url-name/190-01-SUMMARY.md` — v1 `PATCH /api/apps/{app}` user surface locked to `name`+`base_url` (metadata silently ignored).
- `apps-web-app/.planning/phases/190-user-config-icon-url-name/190-02-SUMMARY.md` — `POST /api/v1/apps/{app}/icon` contract (`icon_url` in, `{icon_url}` out; SSRF guards; ≤5 MB image). Action: `app/Actions/App/SetIconFromUrl.php`.
- `apps-web-app/app/Actions/App/StartPublication.php` — publish-intent action (no build dependency).
- `apps-web-app/docs/CROSS-SURFACE-PARITY.md` — canonical surface of record (note: may predate this rescope; re-sync is apps-web-app Phase 191).

### Memory
- `project_appo-cli-outcome-verb-philosophy` — the operator-boundary model (now tightened from "no build verb" to "no build trigger at all on the user surface").
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ops.publishApp` — already implements the publish call; `ship` reuses it verbatim as the intent signal (no new transport for the publish step).
- `ops.createApp` — unchanged; `ship --url --name` still creates first.
- `confirmGate` / `printPreview` — the publish confirm-gate machinery `ship` already reimplements (`wantYes = --yes||--confirm`); preserved as-is.
- Shared `renderError` / `apiFetch` (env-threaded) — the new `ops.setIcon` and the icon-422 path ride these, no new error plumbing.

### Established Patterns
- One async op per v1 call in `src/ops.mjs` over `apiFetch` — `setIcon` follows the same shape as `publishApp`/`createApp`.
- Write verbs surface server `prerequisite_failed`/validation envelopes through `renderError`; `--icon` 422 follows suit.

### Integration Points
- `apps update` may now dispatch TWO calls in one invocation (`PATCH` for name/url, `POST /icon` for icon) — new branching in `case 'apps'` update.
- `case 'ship'` collapses from a 4-step ledger to a 2-step (create → publish) ledger.
</code_context>

<deferred>
## Deferred Ideas
- A client-side build/preview wait in `ship` — rejected; builds are staff-async, the user tracks via `status`/`preview`.
- File-upload (multipart) icon input — out of scope; the backend icon endpoint takes a fetchable URL only.
</deferred>

---
*Phase: 07-ship-intent-surface*
*Context gathered: 2026-06-16; updated 2026-06-22 (dependency satisfied, icon contract concrete)*
