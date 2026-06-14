# Requirements: @appolabs/appo

## Active

- [ ] **CLI-01** Operator command parity — `build`, `publish`, `status`, `push`, `configure`, `rejection`, `fix-recipe` at parity with the `/mcp` AppoServer tools + `/api/v1`; destructive commands confirm-gated; `--json` output + documented exit codes.
- [ ] **CLI-02** Auth & config hardening — token expiry/refresh handling, server-side `logout` revoke, multi-environment profiles.
- [ ] **CLI-03** Preview / open-on-device — `appo preview` renders a terminal QR + prints TestFlight/deeplink, from the user-PAT preview surface; parity with the `preview_app` MCP tool (apps-web-app Phase 188).
- [ ] **CLI-04** Test suite & CI — vitest unit + integration, GitHub Actions, lint/typecheck.
- [ ] **CLI-05** Packaging, docs & release — npm publish `@appolabs/appo` + scaffolder, README/command-reference/llms.txt.

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
| CLI-02 | 2 | Active |
| CLI-03 | 3 | Active |
| CLI-04 | 4 | Active |
| CLI-05 | 5 | Active |
