---
phase: 7
slug: ship-intent-surface
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-22
validated: 2026-06-22
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
| SC-1 | `ship --url --name` creates then publish-intent, no /builds, no poll | integration | `npx vitest run test/integration/ship.test.mjs -t "creates then publishes"` | ✅ | ✅ green (1) |
| SC-1 | `ship <id>` signals (re)publish-intent; first request is `POST .../publish` | integration | `npx vitest run test/integration/ship.test.mjs -t "without --yes"` | ✅ | ✅ green (2) |
| SC-2 | No code path issues `POST .../builds` (request-absence assert in every ship test) | integration | `npx vitest run test/integration/ship.test.mjs` | ✅ | ✅ green (12) |
| SC-2 | `triggerBuild`/`pollBuild` removed (source grep returns 0) | static | `! grep -rn "triggerBuild\|pollBuild" src/` | ✅ | ✅ green (empty) |
| SC-3 | `apps update --icon` → `POST .../icon` with `{icon_url}` body | integration | `npx vitest run test/integration/write-verbs.test.mjs -t "icon POSTs"` | ✅ | ✅ green (1) |
| SC-3 | `apps update --icon` 422 → exit 1, server message surfaced via renderError | integration | `npx vitest run test/integration/write-verbs.test.mjs -t "SSRF reject"` | ✅ | ✅ green (1) |
| SC-3 | `--meta-name`/`--meta-desc` removed; PATCH still maps name/url | integration | `npx vitest run test/integration/write-verbs.test.mjs` | ✅ | ✅ green (7) |
| SC-3 | PATCH-then-icon ordering when both content + icon given | integration | `npx vitest run test/integration/write-verbs.test.mjs -t "PATCH then POST"` | ✅ | ✅ green (1) |
| SC-4 | README/llms.txt document the surface; no `--meta-*`/`--timeout`/build-poll wording | unit | `npx vitest run test/integration/docs.test.mjs` | ✅ (negative guards added :36/:46) | ✅ green (41) |
| SC-4 | Full gate green | suite | `npm test && npm run lint && npm run typecheck` | ✅ | ✅ green (192 + lint + tsc) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Reshape `test/integration/ship.test.mjs` — dropped the 202-build / 200-poll canned responses; every retained case asserts `no /builds request`; failed/timeout/platform-leak cases removed. Covers SC-1, SC-2.
- [x] Delete `test/unit/ship.test.mjs` — removed (it imported only `pollBuild`). Covers SC-2.
- [x] Edit `test/integration/write-verbs.test.mjs` — `--meta-*` mapping tests deleted; `--icon` happy path, 422 reject, and PATCH-then-icon ordering added. Covers SC-3.
- [x] Static regression guards added in `docs.test.mjs` (:36 README/llms.txt free of `--meta-*`/`--timeout`/build-poll; :46 `src/` free of `triggerBuild`/`pollBuild`). Covers SC-2/SC-4 regression-lock.
- [x] Framework install: none needed — toolchain present (vitest/eslint/tsc devDeps installed).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live `ship`/`apps update --icon` against a real `apps-web-app` v3.1 backend | SC-1, SC-3 | Requires a live server with the 189/190 routes + a real PAT + a real fetchable icon URL | Run `appo ship --url <u> --name <n>` and `appo apps update <id> --icon <https-img-url>` against a seeded env; confirm publish-intent state + icon set, no `/builds` hit (server logs) |

*All in-CLI behaviors have automated (HTTP-mocked) verification; only end-to-end live integration is manual.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s (full suite ~1.3s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-22

---

## Validation Audit 2026-06-22

| Metric | Count |
|--------|-------|
| Requirements audited (SC rows) | 10 |
| COVERED (green) | 10 |
| PARTIAL | 0 |
| MISSING | 0 |
| Gaps found | 0 |
| Tests generated this audit | 0 (full coverage already present) |

State A audit: every SC→test mapping was re-run and resolves to a real passing test
(ship 12, write-verbs 7, docs 41; source grep guard empty; full gate 192 + lint + tsc).
No gaps — `nyquist_compliant: true`. The single manual-only item (live end-to-end against
a real `apps-web-app` backend) remains documented above and is off the automated critical path.
