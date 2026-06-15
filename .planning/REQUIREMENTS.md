# Requirements: @appolabs/appo

## Active

- [x] **CLI-01** Operator command parity — `build`, `publish`, `status`, `push`, `configure`, `rejection`, `fix-recipe`, `resubmit` at parity with the `/mcp` AppoServer tools + `/api/v1`; destructive commands confirm-gated; `--json` output + documented exit codes.
- [x] **CLI-06** `appo ship` — one command runs create → build → status(poll) → publish with streamed progress; the CLI's killer feature. Reuses the CLI-01 command implementations; stops cleanly on the first blocking step.
- [x] **CLI-02** Auth & config hardening — token expiry/refresh handling, server-side `logout` revoke, multi-environment profiles.
- [x] **CLI-07** Non-interactive auth — `APPO_TOKEN` env and/or `appo login --token <pat>` authenticate without a browser (device flow cannot run headless); required for CI/automation.
- [ ] **CLI-03** Preview / open-on-device — `appo preview` renders a terminal QR + prints TestFlight/deeplink, from the user-PAT preview surface; parity with the `preview_app` MCP tool (apps-web-app Phase 188). Deferrable — off the critical path.
- [x] **CLI-04** Test suite & CI — vitest unit + integration (incl. `ship` orchestration), GitHub Actions, lint/typecheck.
- [x] **CLI-05** Packaging, docs & release — npm publish `@appolabs/appo` + scaffolder, `appo upgrade`/update-check, README/command-reference/llms.txt.

## Validated

- ✓ **CLI-00** MVP: device-flow `login`, `apps create/list/show/set-name`, `whoami`, `logout` — bootstrap commit.

## Out of Scope

- The in-WebView native bridge (lives in `@appolabs/sdk`).
- Billing/subscription checkout (web-only).

## Traceability

| REQ | Phase | Status |
|-----|-------|--------|
| CLI-00 | bootstrap | Validated |
| CLI-01 | 1 | Active |
| CLI-06 | 2 (killer) | Active |
| CLI-02 | 3 | Active |
| CLI-07 | 3 | Active |
| CLI-03 | 4 (deferrable) | Active |
| CLI-04 | 5 | Active |
| CLI-05 | 6 | Active |
