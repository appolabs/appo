# Phase 7: Ship-intent surface + config rescope — Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

> CLI counterpart of `apps-web-app` v3.1. Decision locked: **the CLI never triggers or polls a build** (builds are issued by Appo staff server-side), and `apps update` is limited to icon/url/name.

<domain>
## Phase Boundary

Redefine the CLI lifecycle so the user/agent never builds. In scope: `ship` (re-shape to create + publish-intent, no build/poll), removing the build transport (`ops.triggerBuild` + `pollBuild`), and rescoping `apps update` to icon/url/name. Out of scope: the backend changes (those are `apps-web-app` Phases 189/190) — this phase consumes them. Cross-repo dependency: needs `apps-web-app` Phase 189 (build off the user surface) + Phase 190 (icon endpoint + name/base_url-only config) shipped first.
</domain>

<decisions>
## Implementation Decisions

- **D-01 — `ship` = publish-intent, not a build pipeline.** Today `ship` does create → build → poll → publish (`src/cli.mjs` `case 'ship'`, `src/ops.mjs` `triggerBuild` + `pollBuild`). Reshape it: `appo ship --url --name` creates the app (`createApp`) then signals publish-intent via the publish path (`POST /apps/{app}/publish`, the existing `publishApp` op — `publicationStarted` sets `WAITING_PUBLICATION` without requiring a build). `appo ship <id>` signals (re)publish-intent on an existing app. No build call, no poll loop — return immediately with a "submitted; Appo will build and submit it" message. Confirm-gate semantics on the publish step are preserved (`--yes`/`--confirm`, exit 3 without it).

- **D-02 — Remove the build transport.** Delete `ops.triggerBuild` and the `pollBuild` loop (and the step-ledger build/poll steps in `case 'ship'`). No CLI code path may call `POST /api/v1/apps/{app}/builds` (that endpoint is removed from the user surface in `apps-web-app` Phase 189). Build STATUS reads (`appo status <id>`) stay — reading is fine; issuing is gone.

- **D-03 — `apps update` = icon/url/name.** `apps update <id>` currently maps `--name`, `--url`, `--meta-name`, `--meta-desc`. Drop `--meta-name`/`--meta-desc` (metadata is internal-only now). Add `--icon` that sets the app icon via the new `apps-web-app` Phase 190 icon endpoint (match its contract — likely a fetchable image URL, mirroring `create_app`/`apps create`'s `--url`). Keep `--name`, `--url`.

- **D-04 — Docs/tests/exit-codes.** Update `test/integration/ship.test.mjs` (ship no longer builds/polls — assert create→publish-intent, no `/builds` request), the write/update tests, `README.md`, and `llms.txt`. Keep the exit-code taxonomy. `npm test` + lint + typecheck green.

### Claude's Discretion
- The exact `ship` success message + whether `ship` returns a tracking hint (`appo status <id>` / `appo preview <id>`).
- `--icon` input shape — match whatever `apps-web-app` Phase 190 lands (URL vs upload).
- Whether `ship` keeps a `--json` ledger (now a shorter create+publish ledger) or simplifies.
</decisions>

<canonical_refs>
## Canonical References

- `src/cli.mjs` (`case 'ship'`, `case 'apps'` update branch) + `src/ops.mjs` (`triggerBuild`, `publishApp`, `createApp`) + the `pollBuild` loop.
- `test/integration/ship.test.mjs`, `test/integration/write-verbs.test.mjs`, `README.md`, `llms.txt`, `test/integration/docs.test.mjs`.
- Cross-repo: `apps-web-app` Phases 189 + 190 SUMMARYs (the backend contract this consumes) + `apps-web-app/docs/CROSS-SURFACE-PARITY.md`.
- Memory `project_appo-cli-outcome-verb-philosophy` (operator-boundary model).
</canonical_refs>

<deferred>
## Deferred Ideas
- A client-side build/preview wait in `ship` — rejected; builds are staff-async, the user tracks via `status`/`preview`.
</deferred>

---
*Phase: 07-ship-intent-surface*
*Context gathered: 2026-06-16 (operator-boundary refinement, decision B)*
