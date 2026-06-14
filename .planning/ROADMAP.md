# Roadmap: @appolabs/appo (Appo CLI)

## Milestones

- 🚧 **v0.1 CLI Completeness** — Phases 1-5. Bring the CLI from MVP to full operator parity with the `/mcp` agent surface, with preview, tests, and a published package.

## Completed Milestones

(none)

---

### 🚧 v0.1 CLI Completeness

**Milestone Goal:** The `appo` CLI drives the complete app lifecycle at parity with the `/mcp` AppoServer tools and `/api/v1`, including preview/open-on-device, with automated tests and a published npm package.

**Repo:** this repo (`@appolabs/appo`). Backend (device grant, `/api/v1`, MCP) is in the sibling `apps-web-app`.

- [ ] **Phase 1: Operator command parity** — build/publish/status/push/configure/rejection/fix-recipe; `--json`; exit codes; confirm-gates
- [ ] **Phase 2: Auth & config hardening** — token expiry/refresh, server-side logout revoke, multi-environment profiles
- [ ] **Phase 3: Preview / open-on-device** — `appo preview` (terminal QR + TestFlight/deeplink) from the user-PAT preview surface
- [ ] **Phase 4: Test suite & CI** — vitest unit + integration, GitHub Actions, lint/typecheck
- [ ] **Phase 5: Packaging, docs & release** — npm publish + scaffolder, README/command-reference/llms.txt

## Phase Details

### Phase 1: Operator command parity

**Goal**: The CLI exposes the full publishing-operator surface (create already shipped) — build, publish, status, push, configure, rejection/fix-recipe — at parity with the `/mcp` AppoServer tools and `/api/v1`.
**Requirements**: CLI-01
**Depends on**: bootstrap MVP
**Success Criteria** (what must be TRUE):
  1. `appo build|status|publish|push|configure|rejection|fix-recipe` exist and call the correct v1 endpoints (parity with the 10 AppoServer MCP tools)
  2. Destructive commands (publish/push/resubmit) require `--confirm`; without it they print the preview the MCP confirm-gate returns
  3. Every command supports `--json` and returns documented exit codes
  4. `appo --help` and per-command help enumerate all commands and flags
**Plans**: TBD (run /gsd-plan-phase 1)

### Phase 2: Auth & config hardening

**Goal**: Production-grade CLI auth — token lifetime handled, logout revokes server-side, multiple environments/accounts supported.
**Requirements**: CLI-02
**Depends on**: Phase 1
**Success Criteria** (what must be TRUE):
  1. A 401/expired/revoked token surfaces a clear "run `appo login`" path
  2. `appo logout` revokes the PAT server-side (deletes the token), not just the local file
  3. Multiple environments/profiles supported (local vs production) without clobbering
  4. Token stored owner-only; `appo whoami` reports account + active environment
**Plans**: TBD (run /gsd-plan-phase 2)

### Phase 3: Preview / open-on-device

**Goal**: `appo preview [<id>]` lets a user open their app on a device from the terminal — renders a scannable QR and prints the TestFlight URL + Android deeplink — at parity with the `preview_app` MCP tool (apps-web-app Phase 188).
**Requirements**: CLI-03
**Depends on**: Phase 1; apps-web-app Phase 188 (user-PAT preview surface + preview_app MCP tool)
**Success Criteria** (what must be TRUE):
  1. `appo preview` calls the user-PAT preview endpoint and prints TestFlight URL + Android custom-scheme deeplink + per-platform readiness
  2. A scannable QR is rendered in the terminal pointing at the preview target
  3. Output matches the `preview_app` MCP payload (same backend source of truth)
  4. `--json` supported; clear messaging when a platform is not preview-ready
**Plans**: TBD (run /gsd-plan-phase 3)

### Phase 4: Test suite & CI

**Goal**: Automated coverage + CI matching `@appolabs/sdk` conventions.
**Requirements**: CLI-04
**Depends on**: Phase 1
**Success Criteria** (what must be TRUE):
  1. Vitest unit tests cover arg parsing, config store, the device-flow login state machine (HTTP mocked)
  2. Integration tests exercise the command surface against a mock/seeded API
  3. GitHub Actions runs lint + typecheck + tests on push/PR and is green
  4. Lint/typecheck pass
**Plans**: TBD (run /gsd-plan-phase 4)

### Phase 5: Packaging, docs & release

**Goal**: `@appolabs/appo` is publishable and documented.
**Requirements**: CLI-05
**Depends on**: Phases 1-4
**Success Criteria** (what must be TRUE):
  1. `@appolabs/appo` publishes to npm; `npm i -g @appolabs/appo` yields a working `appo` binary
  2. A scaffolder (`create-appo` or `appo init`) bootstraps config + first login
  3. README + command reference + `llms.txt` document every command
  4. `appo --version` reports the package version; a release/versioning process is documented
**Plans**: TBD (run /gsd-plan-phase 5)
