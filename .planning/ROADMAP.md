# Roadmap: @appolabs/appo (Appo CLI)

## Milestones

- ✅ **v0.1 CLI Completeness** (complete 2026-06-15) — Phases 1-6. From MVP to full operator parity with the `/mcp` agent surface, fronted by the `appo ship` one-command lifecycle, with non-interactive auth, preview, tests, and a published package. Shipped as `@appolabs/appo` v3.0.0.

## Completed Milestones

- ✅ **v0.1 CLI Completeness** — 6/6 phases, 17/17 plans (2026-06-15)

---

### ✅ v0.1 CLI Completeness

**Milestone Goal:** The `appo` CLI drives the complete app lifecycle at parity with the `/mcp` AppoServer tools and `/api/v1`, with a headline `appo ship` workflow, headless-capable auth, preview/open-on-device, automated tests, and a published npm package.

**Repo:** this repo (`@appolabs/appo`). Backend (device grant, `/api/v1`, MCP) is in the sibling `apps-web-app`.

**Killer feature:** `appo ship` (Phase 2) — one command takes a URL from zero to submitted, streaming each lifecycle step. Everything else is the surface it orchestrates.

- [x] **Phase 1: Operator command parity** — build/publish/status/push/configure/rejection/fix-recipe/**resubmit**; `--json`; exit codes; confirm-gates (completed)
- [x] **Phase 2: `appo ship` — orchestrated lifecycle (KILLER FEATURE)** — one command: create → build → status (poll) → publish, with streamed progress (completed)
- [x] **Phase 3: Auth & config hardening** — token expiry/refresh, server-side logout revoke, multi-environment profiles, **non-interactive auth** (`APPO_TOKEN` / `appo login --token`) (completed)
- [x] **Phase 4: Preview / open-on-device** — `appo preview` (terminal QR + TestFlight/deeplink) (completed)
- [x] **Phase 5: Test suite & CI** — vitest unit + integration, GitHub Actions, lint/typecheck (completed)
- [x] **Phase 6: Packaging, docs & release** — npm publish + scaffolder, `appo upgrade`/update-check, README/command-reference/llms.txt (completed)

> **Post-v0.1 amendment (2026-06-16, shipped v4.0.0):** the CLI surface was abstracted to outcome verbs (`c5eb94e`, then collapsed further in `b223d25`). The user-facing **`build`, `reship`, `resubmit`, and `configure` verbs are gone** — a single **`appo ship`** covers the whole lifecycle (`--url --name` = new app; `<id>` = rebuild/republish/resubmit existing), with no `--platform`/`--branch` (the operator decides the platform server-side); `publish` defaults to the app's stores; **`apps update`** is the content-only editor (absorbed `configure` + `set-name`). Phase 1/2 plans here that describe a `build` verb are **superseded — do NOT re-execute them as-is**. Canonical surface of record: `apps-web-app/docs/CROSS-SURFACE-PARITY.md`.

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
**Plans**: 2 plans
Plans:
- [x] 02-01-PLAN.md — Foundation: extract src/ops.mjs transport layer; refactor Phase 1 create/build/publish cases onto it (no behavior change; delete inline apiFetch duplication)
- [x] 02-02-PLAN.md — The `ship` orchestrator: case 'ship' (create→build→poll→publish), injectable-sleep poll loop, step ledger + --json, confirm-gate, exit-code mapping, USAGE, test/ship.test.mjs

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
**Plans**: 3 plans
Plans:
- [x] 03-01-PLAN.md — Foundation: profile-aware src/config.mjs (profiles shape, read-time legacy normalization, --env/APPO_ENV/APPO_TOKEN precedence, writeProfile/clearProfileToken/setCurrent, APPO_CONFIG_HOME test seam) + test/config-profiles.test.mjs
- [x] 03-02-PLAN.md — Transport + non-interactive auth: env-aware apiFetch (token source + env-named 401) + login.mjs writeProfile write + loginWithToken validate-then-store + test/auth.test.mjs
- [x] 03-03-PLAN.md — CLI verb surface: logout server-side revoke (+ finally-clear), whoami enrichment, env list/use, login --token branch, --env wiring, USAGE + test/auth-cli.test.mjs

### Phase 4: Preview / open-on-device *(deferrable — off critical path)*

**Goal**: `appo preview [<id>]` lets a user open their app on a device from the terminal — renders a scannable QR and prints the TestFlight URL + Android deeplink — at parity with the `preview_app` MCP tool.
**Requirements**: CLI-03
**Depends on**: Phase 1. **UNBLOCKED (2026-06-15): apps-web-app Phase 188 shipped** the user-PAT preview surface + `preview_app` MCP tool — Phase 4 can now be built.
**Success Criteria** (what must be TRUE):
  1. `appo preview` calls the user-PAT preview endpoint and prints TestFlight URL + Android custom-scheme deeplink + per-platform readiness
  2. A scannable QR is rendered in the terminal pointing at the preview target
  3. Output matches the `preview_app` MCP payload (same backend source of truth)
  4. `--json` supported; clear messaging when a platform is not preview-ready
**Plans**: 2 plans
Plans:
- [x] 04-01-PLAN.md — Vendor dependency-free QR encoder (Nayuki, MIT) as src/qr.mjs + renderQr half-block renderer + unit tests
- [x] 04-02-PLAN.md — `appo preview` verb: ops.getPreview + case 'preview' + readiness/QR printer + integration tests + README/llms.txt/docs.test fix

### Phase 5: Test suite & CI

**Goal**: Automated coverage + CI matching `@appolabs/sdk` conventions.
**Requirements**: CLI-04
**Depends on**: Phase 1 (and covers Phase 2 `ship` orchestration)
**Success Criteria** (what must be TRUE):
  1. Vitest unit tests cover arg parsing, config store, the device-flow login state machine, and the `ship` orchestration (HTTP mocked)
  2. Integration tests exercise the command surface against a mock/seeded API
  3. GitHub Actions runs lint + typecheck + tests on push/PR and is green
  4. Lint/typecheck pass
**Plans**: 3 plans
Plans:
- [x] 05-01-PLAN.md — Tooling foundation: devDeps (vitest/eslint/typescript/eslint-config-prettier/@types/node) + vitest.config.mjs/.eslintrc.json/tsconfig.json + SDK-mirrored scripts + package-lock.json; tsc JSDoc pass; lint+typecheck green
- [x] 05-02-PLAN.md — Suite migration: port all 9 node:test files → vitest, split into test/unit/ + test/integration/ (ship 4/14), delete originals, assert 122-case parity
- [x] 05-03-PLAN.md — CI: .github/workflows/ci.yml (npm, no build, node matrix [18,20,22], lint→typecheck→test) + live green verify

### Phase 6: Packaging, docs & release

**Goal**: `@appolabs/appo` is publishable, self-updating, and documented.
**Requirements**: CLI-05
**Depends on**: Phases 1-5
**Success Criteria** (what must be TRUE):
  1. `@appolabs/appo` publishes to npm; `npm i -g @appolabs/appo` yields a working `appo` binary
  2. A scaffolder (`create-appo` or `appo init`) bootstraps config + first login
  3. `appo --version` reports the package version; `appo upgrade` (or an update-check notice) is available
  4. README + command reference + `llms.txt` document every command incl. `appo ship`
**Plans**: 3 plans
Plans:
- [x] 06-01-PLAN.md — CLI features: src/upgrade.mjs (injectable runUpgrade + checkForUpdate) + config update_check cache + cli.mjs wiring (`--version`/`-v`, `init`, `upgrade`, update-check hook, USAGE) + unit tests (SC2/SC3)
- [x] 06-02-PLAN.md — Packaging/release: package.json publish metadata + prepublishOnly + llms.txt in files + `.github/workflows/release.yml` (npm, no build, trusted publishing); verified via `npm pack --dry-run`, NO publish (SC1, D-09)
- [x] 06-03-PLAN.md — Docs: rewrite README.md (full surface, ship-first, releasing runbook) + `llms.txt` (SDK shape) + command-coverage test; Wave-2 phase gate (SC4)
