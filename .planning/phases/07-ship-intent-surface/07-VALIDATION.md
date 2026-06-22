---
phase: 7
slug: ship-intent-surface
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-22
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.6.1 |
| **Config file** | `vitest.config.mjs` (existing) |
| **Quick run command** | `npx vitest run test/integration/ship.test.mjs test/integration/write-verbs.test.mjs` |
| **Full suite command** | `npm test` (= `vitest run`) |
| **Estimated runtime** | ~10 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run test/integration/ship.test.mjs test/integration/write-verbs.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** `npm test && npm run lint && npm run typecheck` all green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| SC | Behavior | Test Type | Automated Command | File Exists | Status |
|----|----------|-----------|-------------------|-------------|--------|
| SC-1 | `ship --url --name` creates then publish-intent, no /builds, no poll | integration | `npx vitest run test/integration/ship.test.mjs -t "creates then publishes"` | ❌ W0 (reshape) | ⬜ pending |
| SC-1 | `ship <id>` signals (re)publish-intent; first request is `POST .../publish` | integration | `npx vitest run test/integration/ship.test.mjs -t "without --yes"` | ❌ W0 (reshape) | ⬜ pending |
| SC-2 | No code path issues `POST .../builds` (request-absence assert in every ship test) | integration | `npx vitest run test/integration/ship.test.mjs` | ❌ W0 | ⬜ pending |
| SC-2 | `triggerBuild`/`pollBuild` removed (source grep returns 0) | static | `! grep -rn "triggerBuild\|pollBuild" src/` | ❌ W0 (new guard) | ⬜ pending |
| SC-3 | `apps update --icon` → `POST .../icon` with `{icon_url}` body | integration | `npx vitest run test/integration/write-verbs.test.mjs -t "icon POSTs"` | ❌ W0 (new) | ⬜ pending |
| SC-3 | `apps update --icon` 422 → exit 1, server message surfaced via renderError | integration | `npx vitest run test/integration/write-verbs.test.mjs -t "SSRF reject"` | ❌ W0 (new) | ⬜ pending |
| SC-3 | `--meta-name`/`--meta-desc` removed; PATCH still maps name/url | integration | `npx vitest run test/integration/write-verbs.test.mjs` | ❌ W0 (edit) | ⬜ pending |
| SC-3 | PATCH-then-icon ordering when both content + icon given | integration | `npx vitest run test/integration/write-verbs.test.mjs -t "PATCH then POST"` | ❌ W0 (new) | ⬜ pending |
| SC-4 | README/llms.txt document the surface; no `--meta-*`/`--timeout`/build-poll wording | unit | `npx vitest run test/integration/docs.test.mjs` | ⚠️ exists; needs negative asserts | ⬜ pending |
| SC-4 | Full gate green | suite | `npm test && npm run lint && npm run typecheck` | ✓ scripts exist | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Reshape `test/integration/ship.test.mjs` — drop all 202-build / 200-poll canned responses; add a `no /builds request` assertion to every retained case; delete the `failed`/`timeout`/`platform-leak` cases (no build to fail/leak). Covers SC-1, SC-2.
- [ ] Delete `test/unit/ship.test.mjs` — it imports only `pollBuild` (removed). Covers SC-2.
- [ ] Edit `test/integration/write-verbs.test.mjs` — delete the two `--meta-name`/`--meta-desc` mapping tests; add `--icon` happy path, `--icon` 422 reject, and PATCH-then-icon ordering. Covers SC-3.
- [ ] Add a static guard (in `docs.test.mjs` or a small new unit) asserting `src/` contains no `triggerBuild`/`pollBuild` and README/llms.txt contain no `--meta-name`/`--meta-desc`/`--timeout`. Covers SC-2/SC-4 regression-lock.
- [ ] Framework install: none — toolchain present (vitest/eslint/tsc devDeps installed).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live `ship`/`apps update --icon` against a real `apps-web-app` v3.1 backend | SC-1, SC-3 | Requires a live server with the 189/190 routes + a real PAT + a real fetchable icon URL | Run `appo ship --url <u> --name <n>` and `appo apps update <id> --icon <https-img-url>` against a seeded env; confirm publish-intent state + icon set, no `/builds` hit (server logs) |

*All in-CLI behaviors have automated (HTTP-mocked) verification; only end-to-end live integration is manual.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
