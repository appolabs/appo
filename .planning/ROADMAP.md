# Roadmap: @appolabs/appo (Appo CLI)

## Milestones

- 🚧 **v0.1 CLI Completeness** — Phases 1-6. From MVP to full operator parity with the `/mcp` agent surface, fronted by the `appo ship` one-command lifecycle, with non-interactive auth, preview, tests, and a published package.

## Completed Milestones

(none)

---

### 🚧 v0.1 CLI Completeness

**Milestone Goal:** The `appo` CLI drives the complete app lifecycle at parity with the `/mcp` AppoServer tools and `/api/v1`, with a headline `appo ship` workflow, headless-capable auth, preview/open-on-device, automated tests, and a published npm package.

**Repo:** this repo (`@appolabs/appo`). Backend (device grant, `/api/v1`, MCP) is in the sibling `apps-web-app`.

**Killer feature:** `appo ship` (Phase 2) — one command takes a URL from zero to submitted, streaming each lifecycle step. Everything else is the surface it orchestrates.

- [ ] **Phase 1: Operator command parity** — build/publish/status/push/configure/rejection/fix-recipe/**resubmit**; `--json`; exit codes; confirm-gates
- [ ] **Phase 2: `appo ship` — orchestrated lifecycle (KILLER FEATURE)** — one command: create → build → status (poll) → publish, with streamed progress
- [ ] **Phase 3: Auth & config hardening** — token expiry/refresh, server-side logout revoke, multi-environment profiles, **non-interactive auth** (`APPO_TOKEN` / `appo login --token`)
- [ ] **Phase 4: Preview / open-on-device** *(deferrable — off critical path)* — `appo preview` (terminal QR + TestFlight/deeplink); depends on apps-web-app Phase 188
- [ ] **Phase 5: Test suite & CI** — vitest unit + integration, GitHub Actions, lint/typecheck
- [ ] **Phase 6: Packaging, docs & release** — npm publish + scaffolder, `appo upgrade`/update-check, README/command-reference/llms.txt

## Phase Details

### Phase 1: Operator command parity

**Goal**: The CLI exposes the full publishing-operator surface (create already shipped) — build, publish, status, push, configure, rejection/fix-recipe, **resubmit** — at parity with the `/mcp` AppoServer tools and `/api/v1`.
**Requirements**: CLI-01
**Depends on**: bootstrap MVP
**Success Criteria** (what must be TRUE):
  1. `appo build|status|publish|push|configure|rejection|fix-recipe|resubmit` exist and call the correct v1 endpoints (parity with the 10 AppoServer MCP tools — including `trigger_resubmission`)
  2. Destructive commands (publish/push/resubmit) require `--confirm`; without it they print the preview the MCP confirm-gate returns
  3. Every command supports `--json` and returns documented exit codes
  4. `appo --help` and per-command help enumerate all commands and flags
**Plans**: 4 plans
Plans:
- [x] 01-01-PLAN.md — Foundation: fetch-stub test helper (Wave 0) + confirmGate() + exit-code-3 + extended error catch
- [x] 01-02-PLAN.md — Read verbs: status (+ --build), rejection, fix-recipe + printers
- [x] 01-03-PLAN.md — Reversible writes: build (async trigger) + configure (PATCH)
- [x] 01-04-PLAN.md — Destructive verbs: publish/push/resubmit (confirm-gated) + finalized --help

### Phase 2: `appo ship` — orchestrated lifecycle (KILLER FEATURE)

**Goal**: A single command takes an app from zero to submitted. `appo ship --url <u> --name <n>` (or `appo ship <id>`) runs create → trigger build → poll status → publish, streaming each step and stopping cleanly on the first that needs human input (credentials, rejection). This is the verb that makes the CLI worth using over raw API calls.
**Requirements**: CLI-06
**Depends on**: Phase 1 (the commands it orchestrates)
**Success Criteria** (what must be TRUE):
  1. `appo ship` runs the create→build→status(poll)→publish sequence end to end, reusing the Phase 1 command implementations (no duplicated API logic)
  2. Progress is streamed step-by-step; the publish step honors the confirm-gate (or an explicit `--yes`)
  3. The command stops with a clear, actionable message when a step blocks (e.g. missing Apple credential, rejection) — never a raw error or a half-finished silent state
  4. `--json` emits a structured per-step result; exit code reflects the final lifecycle state
**Plans**: TBD (run /gsd-plan-phase 2)

### Phase 3: Auth & config hardening

**Goal**: Production-grade CLI auth — token lifetime handled, logout revokes server-side, multiple environments/accounts, and a non-interactive path so CI/automation can authenticate without a browser.
**Requirements**: CLI-02, CLI-07
**Depends on**: Phase 1
**Success Criteria** (what must be TRUE):
  1. A 401/expired/revoked token surfaces a clear "run `appo login`" path
  2. `appo logout` revokes the PAT server-side (deletes the token), not just the local file
  3. Multiple environments/profiles supported (local vs production) without clobbering
  4. **Non-interactive auth**: `APPO_TOKEN` env var and/or `appo login --token <pat>` authenticate without opening a browser (the device flow cannot run headless) — required for CI/automation
  5. Token stored owner-only; `appo whoami` reports account + active environment
**Plans**: TBD (run /gsd-plan-phase 3)

### Phase 4: Preview / open-on-device *(deferrable — off critical path)*

**Goal**: `appo preview [<id>]` lets a user open their app on a device from the terminal — renders a scannable QR and prints the TestFlight URL + Android deeplink — at parity with the `preview_app` MCP tool.
**Requirements**: CLI-03
**Depends on**: Phase 1; **BLOCKED on apps-web-app Phase 188** (user-PAT preview surface + `preview_app` MCP tool). Do NOT let this gate Phases 3/5/6 — it runs in parallel and ships when 188 lands.
**Success Criteria** (what must be TRUE):
  1. `appo preview` calls the user-PAT preview endpoint and prints TestFlight URL + Android custom-scheme deeplink + per-platform readiness
  2. A scannable QR is rendered in the terminal pointing at the preview target
  3. Output matches the `preview_app` MCP payload (same backend source of truth)
  4. `--json` supported; clear messaging when a platform is not preview-ready
**Plans**: TBD (run /gsd-plan-phase 4)

### Phase 5: Test suite & CI

**Goal**: Automated coverage + CI matching `@appolabs/sdk` conventions.
**Requirements**: CLI-04
**Depends on**: Phase 1 (and covers Phase 2 `ship` orchestration)
**Success Criteria** (what must be TRUE):
  1. Vitest unit tests cover arg parsing, config store, the device-flow login state machine, and the `ship` orchestration (HTTP mocked)
  2. Integration tests exercise the command surface against a mock/seeded API
  3. GitHub Actions runs lint + typecheck + tests on push/PR and is green
  4. Lint/typecheck pass
**Plans**: TBD (run /gsd-plan-phase 5)

### Phase 6: Packaging, docs & release

**Goal**: `@appolabs/appo` is publishable, self-updating, and documented.
**Requirements**: CLI-05
**Depends on**: Phases 1-5
**Success Criteria** (what must be TRUE):
  1. `@appolabs/appo` publishes to npm; `npm i -g @appolabs/appo` yields a working `appo` binary
  2. A scaffolder (`create-appo` or `appo init`) bootstraps config + first login
  3. `appo --version` reports the package version; `appo upgrade` (or an update-check notice) is available
  4. README + command reference + `llms.txt` document every command incl. `appo ship`
**Plans**: TBD (run /gsd-plan-phase 6)
