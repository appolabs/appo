---
phase: 6
slug: packaging-docs-release
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-15
---

# Phase 6 — Validation Strategy

> Per-phase validation contract. SC1–SC4 are all verifiable WITHOUT a real publish (D-09):
> `npm pack --dry-run` tarball assertions, injected-spawn/fetch unit tests, and doc/workflow greps.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (Phase 5 toolchain) + `npm pack --dry-run` for packaging assertions |
| **Config file** | `vitest.config.mjs` (existing); new `src/upgrade.mjs` with injectable `spawn`/`fetch` for testability |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` + `npm run lint` + `npm run typecheck` + `npm pack --dry-run` |
| **Estimated runtime** | ~2-4s |

> All network/process side effects (`appo upgrade` → `npm i -g`; update-check → registry fetch) MUST be
> injectable so unit tests never hit the network or spawn npm. Mirror the existing `test/helpers/mockFetch.mjs` pattern.

---

## Sampling Rate

- **After every task commit:** `npm test`
- **Packaging task:** `npm pack --dry-run` (assert tarball file list) + `node bin/appo.mjs --version`
- **Before `/gsd-verify-work`:** `npm test` + `npm run lint` + `npm run typecheck` all exit 0; `npm pack --dry-run` clean; README/llms.txt completeness greps pass.
- **Max feedback latency:** ~5 seconds.

---

## Per-Task Verification Map

| Behavior | Requirement | Test Type | Automated Command | Notes |
|----------|-------------|-----------|-------------------|-------|
| Tarball ships only bin/ src/ README.md llms.txt package.json | CLI-05 (SC1) | packaging | `npm pack --dry-run` | assert file list — NO .planning/test/configs/lockfile |
| package.json has publishConfig.access:public + repository/homepage/bugs/keywords | CLI-05 (SC1) | unit | `npm test` | manifest-field assertion |
| `prepublishOnly` runs lint+typecheck+test (no build) | CLI-05 (SC1) | static | grep package.json | gate present |
| `appo --version`/`-v` prints the package version | CLI-05 (SC3) | unit + cli | `node bin/appo.mjs --version` | reads package.json via createRequire; works installed too |
| `appo upgrade` invokes `npm install -g @appolabs/appo@latest` | CLI-05 (SC3) | unit | `npm test` | injected `spawn` — assert argv, no real install |
| update-check: daily-cached, registry `latest`, non-blocking, skipped on --json/network error | CLI-05 (SC3) | unit | `npm test` | injected `fetch` (scoped URL %2F) + cache; assert no throw on error |
| `appo init` bootstraps config + first login + whoami; idempotent (no clobber) | CLI-05 (SC2) | unit | `npm test` | injected login/fetch; assert config written, existing env not clobbered |
| README documents every command incl. `appo ship` | CLI-05 (SC4) | doc | grep README.md for each verb | ship/build/status/publish/push/configure/rejection/fix-recipe/resubmit/init/upgrade/env/login/logout/whoami/apps |
| llms.txt enumerates every command (SDK shape) | CLI-05 (SC4) | doc | grep llms.txt | title+tagline+sections; every command present |
| release.yml: master/main push, npm ci, lint→typecheck→test, NO build, npm publish --provenance --access public, id-token | CLI-05 (SC1) | static | grep .github/workflows/release.yml | mirrors SDK; no pnpm, no build |
| Runtime dependency-free preserved | CLI-05 | static | `node -e` | `dependencies` empty; only devDeps added (none expected) |
| `npm publish` / tag push NOT performed | CLI-05 (D-09) | manual | n/a | executor stops at dry-run; live publish is the user's action |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/unit/upgrade.test.mjs` (or similar) for `runUpgrade()`/`checkForUpdate()` via injected spawn/fetch
- [ ] `test/unit/init.test.mjs` for `appo init` (injected login/fetch, config isolation via APPO_CONFIG_HOME)
- [ ] `test/unit/packaging.test.mjs` (or a packaging assertion) for the manifest fields + `--version` output
- [ ] New `src/upgrade.mjs` exporting injectable `runUpgrade`/`checkForUpdate` (RESEARCH recommendation)

*Existing vitest harness + APPO_CONFIG_HOME isolation carry over; only new test files + the injectable upgrade module are added.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live `npm publish` succeeds; `npm i -g @appolabs/appo` yields a working binary | CLI-05 (SC1) | irreversible public action (D-09); requires npm auth/trusted-publisher setup | After user go-ahead: merge to master (triggers release.yml) OR `npm publish --provenance --access public`; then `npm i -g @appolabs/appo && appo --version` |
| One-time npm trusted-publisher registration for the GitHub repo | CLI-05 (SC1) | npmjs.com account action; first-publish ambiguity (RESEARCH Open Q1) | Document the runbook; user performs it |

*All in-repo behavior (packaging shape, version, upgrade, update-check, init, docs, workflow) is automated; only the live release is manual.*

---

## Validation Sign-Off

- [ ] `npm pack --dry-run` ships exactly bin/ src/ README.md llms.txt package.json
- [ ] `npm test` + `npm run lint` + `npm run typecheck` exit 0
- [ ] `node bin/appo.mjs --version` prints the version; `appo init`/`appo upgrade`/update-check unit-tested with injected side effects
- [ ] README + llms.txt cover every command incl. `appo ship`
- [ ] release.yml mirrors the SDK (npm, no build, provenance/id-token); runtime `dependencies` empty
- [ ] NO real `npm publish` or tag push performed by the executor (D-09)
- [ ] `nyquist_compliant: true` set once the new suite is green

**Approval:** pending
