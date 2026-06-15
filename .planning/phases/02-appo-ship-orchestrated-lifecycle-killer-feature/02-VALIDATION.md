---
phase: 2
slug: appo-ship-orchestrated-lifecycle-killer-feature
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-15
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (built-in) — reuses the Phase 1 harness |
| **Config file** | none — `package.json` `test` script runs `node --test --test-concurrency=1 "test/**/*.test.mjs"` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~1s (poll loop uses an injectable `sleep`, so no real waiting) |

> CRITICAL (from RESEARCH §test-harness): a bare `node --test` runs files concurrently and the
> shared `globalThis.fetch`/`requests[]` state in `test/helpers/mockFetch.mjs` collides → spurious
> failures. ALWAYS verify with `npm test` (which pins `--test-concurrency=1`). Current baseline: 67 pass.

---

## Sampling Rate

- **After every task commit:** `npm test`
- **After every plan wave:** `npm test`
- **Before `/gsd-verify-work`:** full suite green + `node bin/appo.mjs ship` (no args) exits 2, and a
  stubbed end-to-end `ship` run streams create→build→poll→publish and stops at the publish gate (exit 3).
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

> HTTP is stubbed via the existing FIFO mock (`installMockFetch([building, building, ready])`); the poll
> fn takes injectable `sleep`/`intervalMs`/`timeoutMs` so poll-sequence tests run instantly.

| Behavior | Requirement | Test Type | Automated Command | Notes |
|----------|-------------|-----------|-------------------|-------|
| Phase 1 cases refactored onto `src/ops.mjs` with NO behavior change | CLI-06 | regression | `npm test` | the existing 67 tests are the guard |
| `ops.mjs` functions issue the correct v1 method+path+body | CLI-06 | unit | `npm test` | assert on stubbed fetch args |
| `ship --url --name` runs create→build→poll→publish in order | CLI-06 | unit | `npm test` | assert ordered fetch calls (create POST, build POST, build GET×N, publish POST) |
| `ship <id>` skips create (starts at build) | CLI-06 | unit | `npm test` | assert no create POST |
| poll loop stops on terminal `ready` → proceeds; `failed` → stops | CLI-06 | unit | `npm test` | FIFO `[building,building,ready]` and `[building,failed]` |
| poll `--timeout` stop prints last status + `appo status <id>` resume hint | CLI-06 | unit | `npm test` | injected sleep + short timeout; assert exit 1 + message |
| publish step stops at preview (exit 3) without `--yes`; publishes with `--yes` | CLI-06 | unit | `npm test` | assert publish POST absent without --yes (requests count), present with --yes |
| build-trigger prerequisite block (e.g. APPLE_CREDENTIALS_MISSING) renders via renderError, exit 1 | CLI-06 | unit | `npm test` | stub 422 envelope w/ next_action+dashboard_url; assert Blocked message |
| `--json` emits one `{steps[], final_state}` object; exit code matches final state | CLI-06 | unit | `npm test` | parse stdout; assert final_state ∈ {shipped,gated,blocked,failed} |
| usage error (neither `<id>` nor `--url`+`--name`) → exit 2 | CLI-06 | unit | `npm test` | assert no fetch issued |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/ship.test.mjs` created (poll-sequence + ordering + gate + block + --json cases)
- [ ] Existing `test/helpers/mockFetch.mjs` FIFO mode reused; if the poll fn needs an injectable
      `sleep`, expose it as a parameter (default real `setTimeout`) so tests pass `sleep = () => {}`.

*The Phase 1 harness already exists — Wave 0 only adds ship's test file and (if needed) the sleep injection point.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real end-to-end ship against a live `/api/v1` | CLI-06 | Cross-surface parity verified on apps-web-app side; needs real build infra + Apple credentials | Against a seeded backend: `appo ship --url <u> --name <n>` and confirm it streams to the publish gate |

*All in-repo orchestration behavior has automated coverage via the stubbed fetch + injectable sleep.*

---

## Validation Sign-Off

- [ ] All behaviors have an automated `npm test` check or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers ship's test file + sleep injection
- [ ] No watch-mode flags; verified via `npm test` (concurrency-1), never bare `node --test`
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set once Wave 0 lands

**Approval:** pending
