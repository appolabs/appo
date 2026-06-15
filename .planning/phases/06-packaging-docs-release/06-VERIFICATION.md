---
phase: 06-packaging-docs-release
verified: 2026-06-15T15:10:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
human_verification:
  - test: "First live npm publish + npmjs trusted-publisher registration"
    expected: "`@appolabs/appo@0.1.0` appears on the registry; `npm i -g @appolabs/appo` yields a working `appo` binary; subsequent pushes to master auto-publish via release.yml"
    why_human: "Outward, irreversible public action (D-09). One-time npmjs Trusted Publisher setup is user-performed. A package named @appolabs/appo already exists on the registry (v2.0.2 observed) — ownership/name must be confirmed before any publish."
---

# Phase 6: Packaging, docs & release — Verification Report

**Phase Goal:** `@appolabs/appo` is publishable, self-updating, and documented.
**Verified:** 2026-06-15T15:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | `@appolabs/appo` is publish-ready (packaging only; no live publish per D-09) | ✓ VERIFIED | `npm pack --dry-run` ships exactly 10 files; publishConfig.access=public; repository/homepage/bugs/keywords present; release.yml present + correct |
| 2 | Scaffolder `appo init` bootstraps config + first login (idempotent, no clobber) | ✓ VERIFIED | `case 'init'` cli.mjs:359-391 — `storedToken` early-return writes nothing; device-flow or `--token`; confirming whoami. Tested (init.test.mjs: idempotency + 401 refusal) |
| 3 | `appo --version` reports package version; `appo upgrade` + update-check available | ✓ VERIFIED | `node bin/appo.mjs --version` → `appo/0.1.0 node/v22.12.0`; `runUpgrade` spawns fixed argv; `checkForUpdate` daily-cached + abort-bounded |
| 4 | README + command reference + `llms.txt` document every command incl. `appo ship` | ✓ VERIFIED | All 21 command names present in BOTH README.md and llms.txt; docs.test.mjs (44 tests) enforces coverage |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `package.json` | publish metadata + prepublishOnly + llms.txt in files | ✓ VERIFIED | publishConfig.access=public; repository/homepage/bugs/keywords/author; `dependencies` absent (runtime dep-free); prepublishOnly gate; files=[bin,src,README.md,llms.txt] |
| `src/upgrade.mjs` | runUpgrade + checkForUpdate (timeout-bounded) | ✓ VERIFIED | Fixed argv (no injection); WR-01 AbortController 1500ms timeout; no Authorization header (PAT confidentiality) |
| `src/config.mjs` | update_check cache + carry-through | ✓ VERIFIED | readUpdateCache/writeUpdateCache preserve profiles; readConfig carries update_check; 0600/0700 perms |
| `src/cli.mjs` | --version / init / upgrade / update hook / USAGE | ✓ VERIFIED | --version before help guard; `case 'init'`, `case 'upgrade'`; USAGE Packaging section |
| `bin/appo.mjs` | post-command update-check hook (non-`--json`) | ✓ VERIFIED | hook skipped under --json, swallows errors, awaits before exit |
| `.github/workflows/release.yml` | npm publish OIDC, no build, trusted publishing | ✓ VERIFIED | id-token:write; `--provenance --access public`; publish BEFORE tag (WR-03); concurrency guard + [skip ci] bump (WR-02); no NPM_TOKEN |
| `README.md` | full surface, ship-first, releasing runbook | ✓ VERIFIED | All commands documented; install→init→ship quickstart; releasing runbook with ownership caveat |
| `llms.txt` | SDK shape, every command incl. ship | ✓ VERIFIED | `# title` + `> tagline` + sectioned README-anchor links; all commands enumerated |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| cli.mjs `case 'upgrade'` | upgrade.mjs `runUpgrade` | import + await | ✓ WIRED | cli.mjs:14 import, :396 invocation |
| bin/appo.mjs | upgrade.mjs `checkForUpdate` | import + await hook | ✓ WIRED | bin/appo.mjs:3 import, :17 invocation |
| cli.mjs `case 'init'` | login.mjs `login`/`loginWithToken` | import + dispatch | ✓ WIRED | reuses first-login path |
| upgrade.mjs cache | config.mjs read/writeUpdateCache | import | ✓ WIRED | daily cache round-trip preserves profiles |
| package.json files | llms.txt + README.md | tarball | ✓ WIRED | both shipped (pack dry-run confirms) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Version output | `node bin/appo.mjs --version` | `appo/0.1.0 node/v22.12.0` | ✓ PASS |
| Test suite | `npm test` | 187 passed (16 files) | ✓ PASS |
| Lint | `npm run lint` | exit 0 | ✓ PASS |
| Typecheck | `npm run typecheck` | exit 0 | ✓ PASS |
| Tarball contents | `npm pack --dry-run` | 10 files, no test/.planning/configs | ✓ PASS |
| No version tags (D-09) | `git tag` | 0 tags — executor performed no publish/tag | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| CLI-05 | 06-01/02/03 | Packaging, docs & release — npm publish + scaffolder, upgrade/update-check, README/command-reference/llms.txt | ✓ SATISFIED | All 4 SCs verified; sole declared requirement for phase, matches REQUIREMENTS.md traceability (CLI-05 → Phase 6) |

No orphaned requirements: REQUIREMENTS.md maps only CLI-05 to Phase 6, which all plans declare.

### Anti-Patterns Found

None blocking. The three INFO items from 06-REVIEW.md (IN-01 stale-timestamp on `!res.ok`; IN-02 pre-release version parse; IN-03 win32 shell:true comment) remain — all are non-blocking, behavior-safe, and explicitly accepted (project ships no pre-releases; argv is a compile-time constant). The three WARNINGS (WR-01/02/03) were fixed in commit c63f758 and re-verified here:
- WR-01: AbortController 1500ms timeout bounds the registry fetch (upgrade.mjs:60-69)
- WR-02: `concurrency: group: release` + `[skip ci]` on the bump commit (release.yml:9-11, :54)
- WR-03: Publish step (line 75) precedes Create tag (line 78)

### Human Verification Required

#### 1. First live npm publish + trusted-publisher registration

**Test:** Perform the one-time npmjs Trusted Publisher setup (GitHub Actions / appolabs / appo / release.yml), then trigger the first publish (manual `npm publish --access public` for v0.1.0 or an OIDC-capable local publish), then `npm i -g @appolabs/appo`.
**Expected:** Package on the registry; `appo` binary works post-install; subsequent master pushes auto-publish via release.yml.
**Why human:** Outward, irreversible public action (D-09) — intentionally NOT performed by the executor. The live update-check during verification observed `v2.0.2` already on the registry under the `@appolabs/appo` name, so package ownership and the target version MUST be confirmed by a human before any publish (README releasing runbook documents this caveat).

### Gaps Summary

No gaps. All four roadmap success criteria are met at the level achievable without an outward publish (D-09): packaging readiness, the `appo init` scaffolder, `--version`/`upgrade`/update-check, and complete README + command-reference + `llms.txt` coverage. The release machinery is built and verified (tarball clean, OIDC workflow correct with publish-before-tag and concurrency guard). The only remaining item is the deliberately-manual first publish + trusted-publisher registration, surfaced for human action — this is a documented runbook step, not a verification gap.

---

_Verified: 2026-06-15T15:10:00Z_
_Verifier: Claude (gsd-verifier)_
