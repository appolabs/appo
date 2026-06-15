---
phase: 5
slug: test-suite-ci
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-15
---

# Phase 5 — Validation Strategy

> Per-phase validation contract. For THIS phase the deliverable IS the toolchain, so validation =
> the migrated vitest suite runs green with no coverage regression, plus lint + typecheck pass.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | **vitest** (migrated from `node:test`) — pinned ^1.x for `@appolabs/sdk` parity |
| **Config file** | `vitest.config.mjs` (environment: node; default pool `forks`, `isolate: true` — do NOT override) |
| **Quick run command** | `npm test` (→ `vitest run`) |
| **Full suite command** | `npm test` + `npm run lint` + `npm run typecheck` |
| **Estimated runtime** | ~2-4s (HTTP mocked; injectable sleep — no real waits) |

> Vitest's default per-file isolation (separate worker + globalThis + process.env per file) replaces
> the old `--test-concurrency=1` flag. Per-test `APPO_CONFIG_HOME` (mkdtemp in beforeEach) isolation is preserved.

---

## Sampling Rate

- **After every migrated file:** `npm test` (the running case count must keep climbing toward 122, never drop).
- **After the runner swap:** `npm test` green at ≥122 cases / 0 fail.
- **Before `/gsd-verify-work`:** `npm test` + `npm run lint` + `npm run typecheck` all exit 0; CI workflow present and green.
- **Max feedback latency:** ~5 seconds.

---

## Per-Task Verification Map

| Behavior | Requirement | Test Type | Automated Command | Notes |
|----------|-------------|-----------|-------------------|-------|
| node:test → vitest port preserves all assertions (≥122 cases, 0 fail) | CLI-04 | regression | `npm test` | **coverage-regression guard**: summed `test(`/`it(` count == 122 AND vitest reports ≥122 passing |
| Unit tests cover arg parsing, config store, login state machine, ship orchestration (HTTP mocked) | CLI-04 (SC1) | unit | `npm test` | `test/unit/` — parseArgs, config.mjs, login.mjs poll loop, pollBuild/ops |
| Integration tests exercise the command surface vs mock API | CLI-04 (SC2) | integration | `npm run test:integration` | `test/integration/` — run() flows over the mock fetch |
| `assert.rejects` sites keep their status/envelope assertions | CLI-04 | unit | `npm test` | auth.test.mjs ×2 — port to `.rejects.toMatchObject({status:401,...})`, not a bare toThrow |
| Lint passes | CLI-04 (SC4) | static | `npm run lint` | eslint over bin/src/test (.mjs), eslintrc style (eslint ^8.57) |
| Typecheck passes | CLI-04 (SC4) | static | `npm run typecheck` | `tsc --noEmit` with allowJs/checkJs, strict:false, @types/node |
| CI runs lint + typecheck + test on push/PR and is green | CLI-04 (SC3) | ci | GitHub Actions `ci.yml` | npm + node matrix [18,20,22], no build step |
| Runtime stays dependency-free (only devDependencies added) | CLI-04 | static | `node -e` check | package.json `dependencies` empty; `files: [bin,src,README]` unchanged |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Add devDependencies (vitest ^1, eslint ^8.57, @typescript-eslint/* matching SDK, eslint-config-prettier ^9, typescript ^5.4, @types/node) + `vitest.config.mjs`, `.eslintrc.json`, `tsconfig.json`, and the `scripts` (test/test:integration/test:watch/lint/typecheck). Commit `package-lock.json` (first deps; needed for `npm ci` in CI).
- [ ] Run `tsc --noEmit` once to surface the real checkJs error count; add JSDoc ONLY for what surfaces (no blanket annotation pass — RESEARCH Open Q1).

*The test harness (`test/helpers/mockFetch.mjs`, capture helpers) already exists and ports unchanged.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CI is actually green on GitHub | CLI-04 (SC3) | requires a real push/PR to GitHub Actions | After merge, confirm the CI run passes on push/PR; locally `act` or the same `npm ci && npm run lint && npm run typecheck && npm test` sequence stands in |

*All in-repo behavior (suite parity, lint, typecheck) is locally verifiable; only the live GitHub run is manual.*

---

## Validation Sign-Off

- [ ] vitest suite green at ≥122 cases / 0 fail (no coverage regression vs node:test baseline)
- [ ] `npm run lint` exits 0; `npm run typecheck` exits 0
- [ ] No node:test files remain (single runner — old suite deleted, not kept alongside)
- [ ] CI workflow present, mirrors SDK shape, runs lint+typecheck+test on push/PR
- [ ] Runtime `dependencies` still empty; published `files` unchanged
- [ ] `nyquist_compliant: true` set once the migrated suite is green

**Approval:** pending
