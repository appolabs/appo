---
phase: 06-packaging-docs-release
plan: 03
subsystem: docs
tags: [docs, readme, llms-txt, packaging, phase-gate, release-runbook]
dependency_graph:
  requires: [06-01, 06-02]
  provides: [readme-full-surface, llms-txt, docs-coverage-test, phase-06-gate-green]
  affects: [README.md, llms.txt, test/integration/docs.test.mjs]
tech_stack:
  added: []
  patterns: [docs-as-code, command-coverage-grep-test, sdk-llms-shape]
key_files:
  created:
    - llms.txt
    - test/integration/docs.test.mjs
  modified:
    - README.md
decisions:
  - "README + llms.txt use per-command kebab-case anchors (D-07 discretion) so agents can deep-link each verb."
  - "Authoritative tarball is 10 files, not the plan's stale 9: src/upgrade.mjs (landed Plan 01) is a legitimate sixth src module. Plan count predated it."
  - "RELEASING runbook documents BOTH first-publish paths (manual npm publish vs OIDC) and flags the existing @appolabs/appo registry entry (update-check saw v2.0.2) — user must confirm ownership before publishing (D-09)."
metrics:
  duration: "~2m"
  tasks: 3
  files_changed: 3
  tests: "187 passed (143 baseline + 44 docs)"
  completed: 2026-06-15
---

# Phase 6 Plan 3: README Rewrite + llms.txt + Phase Gate Summary

Rewrote `README.md` to document the complete v0.1 CLI surface (ship-first quickstart, every verb, env vars, exit codes, profiles, CI auth, and a releasing runbook), authored `llms.txt` in the SDK shape linking every command into a README anchor, and added a grep-based coverage test. Closed the Phase 06 gate: full suite + lint + typecheck green, clean tarball including llms.txt, no publish performed.

## What Was Built

- **README.md (rewritten, not appended):** `# @appolabs/appo` + tagline → `## Install` → `## Ship` (headline create→build→poll→publish quickstart) → `## appo init` → `## Auth` → `## Environments` → `## Apps` → one `##` section per lifecycle verb (`build`, `status`, `configure`, `rejection`, `fix-recipe`, `publish`, `push`, `resubmit`) with exact flags transcribed from `USAGE` → `## upgrade` (+ `--version`/`-v` + daily update-check) → `## Environment variables` → `## Exit codes` → `## CI auth` → `## Releasing`. Confirm-gate (exit 3) noted on publish/push/resubmit. No `appo preview` (deferred Phase 4). Neutral public voice (CLAUDE.md). 262 lines.
- **llms.txt (new):** SDK three-part shape — `# @appolabs/appo` title, `> ` tagline, `## Quick Start` / `## Commands` / `## Reference` sections of `[label](README.md#anchor)` links covering every inventory command including ship/init/upgrade.
- **test/integration/docs.test.mjs (new):** iterates the 21-command inventory and asserts each appears in BOTH README.md and llms.txt; asserts the llms.txt shape (`^# @appolabs/appo`, `^> `, `^## `, `README.md#` link); asserts neither doc mentions `appo preview`. 44 cases.

## Verification

- `npx vitest run test/integration/docs.test.mjs` — 44/44 green.
- `npm run lint` — exit 0; `npm run typecheck` — exit 0; `npm test` — 187/187 (16 files).
- `npm pack --dry-run` — ships exactly: `bin/appo.mjs`, `src/{api,cli,config,login,ops,upgrade}.mjs`, `README.md`, `llms.txt`, `package.json` (10 files). llms.txt included; no test/.planning/configs/lockfile.
- `node bin/appo.mjs --version` → `appo/0.1.0 node/v22.12.0`.
- README acceptance greps: every verb present, APPO_TOKEN/APPO_ENV/APPO_API_BASE present, "Exit codes" present, "Trusted Publisher" present, "appo preview" absent, ≥120 lines (262).
- llms.txt acceptance greps: title/tagline/sections/`README.md#` anchors all present.

## Deviations from Plan

### Auto-fixed / clarified

**1. [Rule 3 - Blocking] Tarball is 10 files, not the plan's stated 9**
- **Found during:** Task 3 (phase gate).
- **Issue:** The plan's Task 3 enumerated 9 tarball files and its verify used `grep -c "total files"` expecting 9. The actual tarball lists 10 because `src/upgrade.mjs` (a real module added in Plan 06-01, imported by `src/cli.mjs`) is a sixth `src/*.mjs` file the plan's count predated.
- **Resolution:** Verified the set is exactly the intended whitelist plus the legitimate `src/upgrade.mjs` — no stray test/.planning/configs/lockfile. The "9" was stale plan arithmetic, not a packaging defect. The substantive intent (clean whitelist incl. llms.txt, nothing extraneous) is satisfied.
- **Files modified:** none (verification-only finding).
- **Commit:** n/a.

**2. [Clarification] Existing registry entry confirmed by update-check**
- **Found during:** Task 3 — `node bin/appo.mjs --version` emitted `update available: v0.1.0 -> v2.0.2`.
- **Note:** Confirms a `@appolabs/appo` package already exists on the public registry. The RELEASING runbook explicitly tells the user to verify package ownership and the intended version before any publish (do not assume the name is free). No publish performed (D-09).

## Release Boundary (D-09)

The executor performed NO `npm publish` and pushed NO tag. Releasing remains a documented human action: the README `## Releasing` section covers the one-time npm trusted-publisher registration, both first-publish paths, and the package-ownership caveat.

## Self-Check: PASSED
- FOUND: README.md, llms.txt, test/integration/docs.test.mjs
- FOUND commits: 44d31b2 (README), f4202ad (llms.txt + docs test)
