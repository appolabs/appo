# Project: @appolabs/appo (Appo CLI)

**What this is:** The Appo command-line interface — create and manage Appo apps from a terminal or an agent, over the Appo public API (`/api/v1`) and the RFC 8628 device-authorization grant (`/api/oauth/device/*`). Sibling to the `apps-web-app` backend and the `@appolabs/sdk` in-WebView bridge.

**Core value:** A user (or agent) can run the complete app lifecycle — auth → create → configure → build → status → preview → publish → push → rejection/fix/resubmit — from the terminal, at parity with the dashboard and the `/mcp` agent surface.

## Current State

Phase 6 complete (packaging, docs & release, CLI-05 validated): publish-ready package metadata (publishConfig.access:public, repository/keywords, prepublishOnly gate), an OIDC trusted-publishing release.yml (publish-before-tag, concurrency-guarded), `appo init` (idempotent bootstrap + login), `appo --version`/`appo upgrade` + a daily update-check notice, and a rewritten README + llms.txt covering every command. Tarball verified clean via npm pack --dry-run; 187 node-test/vitest cases green. **Milestone v0.1 CLI Completeness: phases 1,2,3,5,6 done; Phase 4 (preview) deferred/blocked on apps-web-app Phase 188.** The live npm publish + npmjs trusted-publisher registration are the one manual follow-up (D-09) — note a @appolabs/appo@2.0.2 already exists on the registry, so confirm package ownership/target version first.

Phase 5 complete (test suite & CI, CLI-04 validated): the suite is migrated to **vitest** (122 cases
across `test/unit/` + `test/integration/`, per-worker config isolation), with **eslint** + a JS
**typecheck** (`tsc --checkJs`) and a **GitHub Actions** workflow (npm, Node matrix 18/20/22,
lint→typecheck→test, no build) — matching `@appolabs/sdk` conventions. All tooling is devDependencies
only; the published CLI stays RUNTIME dependency-free (`dependencies` empty, `files: [bin, src, README]`).
The live-CI green run is the one pending manual confirmation (needs a push). Milestone v0.1: phases
1, 2, 3, 5 done; Phase 4 (preview) deferred/blocked on apps-web-app Phase 188; Phase 6 (packaging) next.

Phase 3 complete (auth & config hardening, CLI-02 + CLI-07 validated): `~/.appo/config.json` is now a
multi-environment profiles store (lazy path; legacy flat config auto-folds with no forced logout;
`--env` > `APPO_ENV` > `current` > `default`, no clobbering). `appo logout` revokes the PAT server-side
(`DELETE /api/v1/user/tokens/current`) and always clears locally. Non-interactive auth lands: `APPO_TOKEN`
(ephemeral, never written) and `appo login --token <pat>` (validate-then-store) authenticate headless for
CI — so `appo ship` runs without a browser. `appo whoami` reports active env + api_base + liveness;
`appo env list`/`env use` manage profiles. PAT never logged; ops calls honor `--env`. 116 `node:test` cases green.

Phase 2 complete (the killer feature, CLI-06 validated): `appo ship` takes an app from zero to
submitted in one command — `appo ship --url <u> --name <n>` (or `appo ship <id>`) runs
create → build → poll → publish, streaming each step and stopping cleanly on the first blocking step
(missing credential, build failure, rejection). It composes a shared `src/ops.mjs` transport layer
(no duplicated API logic); the publish step honors the confirm-gate (`--yes`, exit 3); `--json` emits
one `{steps, final_state}` object with a lifecycle-aware exit code (0 shipped / 3 gated / 1 blocked|failed / 2 usage).

Phase 1 complete (operator command parity, CLI-01 validated): the full publishing-operator surface — `build`, `status` (+`--build`), `publish`, `push`, `configure`, `rejection`, `fix-recipe`, `resubmit` — at parity with the 10 AppoServer MCP tools and `/api/v1`; destructive verbs confirm-gated, every verb `--json` + documented 0/1/2/3 exit codes. 80 `node:test` cases green across both phases.

Prior: MVP (bootstrap commit) — `appo login` (browser device flow), `apps create/list/show/set-name`, `whoami`, `logout`. Dependency-free Node ≥18. Backend (device grant + `/api/v1` + MCP `create_app`) already live in apps-web-app.

## Requirements

See REQUIREMENTS.md. The CLI must reach operator parity with the `/mcp` AppoServer tools and prove it (cross-surface parity is verified on the apps-web-app side, Phase 187 there).

## Key Decisions

- Dependency-free Node CLI (built-in `fetch`, `http`, `child_process`); token stored owner-only in `~/.appo/config.json`.
- Auth via the shipped device-authorization grant (no new backend).
- API base resolves: `--api` > `APPO_API_BASE` > stored config > `http://localhost:8002`.
- The in-WebView SDK is a separate package (`@appolabs/sdk`); this repo is the CLI only.

## Non-Negotiables

- Never weaken auth parity — destructive operations mirror the MCP confirm-gate.
- Keep request/response shapes in lockstep with `/api/v1` (no drift).

---
*Last updated: 2026-06-15 — Phase 6 complete; milestone v0.1 (CLI Completeness) reached*
