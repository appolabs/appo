---
phase: 04-preview-open-on-device
plan: 02
subsystem: cli
tags: [cli, preview, qr, read-verb, integration-tests, docs]
dependency_graph:
  requires: ["04-01"]
  provides: ["appo preview <id> command (CLI-03)"]
  affects: ["src/ops.mjs", "src/cli.mjs", "test/integration/read-verbs.test.mjs", "test/integration/docs.test.mjs", "README.md", "llms.txt"]
tech_stack:
  added: []
  patterns: ["case 'preview' verb pattern (clone of case 'status')", "printPreviewPayload with readiness-gated QR", "ops.getPreview flat-payload GET"]
key_files:
  created: []
  modified:
    - src/ops.mjs
    - src/cli.mjs
    - test/integration/read-verbs.test.mjs
    - test/integration/docs.test.mjs
    - README.md
    - llms.txt
decisions:
  - "QR gated on preview_ready.ios||android (not preview_url nullness) — preview_url is never null (Pitfall 4)"
  - "case 'preview' follows case 'status' pattern: usage-guard -> --json verbatim short-circuit -> op -> printer -> exit 0"
  - "printPreviewPayload prints readiness lines first (D-04), then platform-conditional URLs, then preview_url always, then QR"
  - "Deleted docs.test.mjs forbid-preview assertion and added 'preview' to COMMANDS (Pitfall 6)"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-15"
  tasks_completed: 2
  files_modified: 6
---

# Phase 04 Plan 02: preview verb + integration tests + docs Summary

One-liner: `appo preview <id>` delivers CLI-03 — GET /api/v1/apps/{id}/preview with env-threaded auth, per-platform readiness display, TestFlight/deeplink URLs, and a readiness-gated terminal QR (renderQr from plan 04-01).

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Add ops.getPreview + case 'preview' + printPreviewPayload + USAGE | 5aa39ad | src/ops.mjs, src/cli.mjs |
| 2 | Add preview integration tests + fix docs.test.mjs + document in README/llms.txt | 8c2a369 | test/integration/read-verbs.test.mjs, test/integration/docs.test.mjs, README.md, llms.txt |

## What Was Built

### src/ops.mjs
Added `getPreview(apiBase, id, env)` — GET `/api/v1/apps/{id}/preview`, env-threaded, calling `unwrap` (harmless no-op on flat payload). Clone of `getApp`.

### src/cli.mjs
- Imported `renderQr` from `./qr.mjs`
- Added `printPreviewPayload(d)`: readiness lines first (ios/android), `ios_testflight_url` only when `r.ios`, `android_deeplink` only when `r.android`, `preview_url` always, QR (`renderQr(d.preview_url)`) gated on `r.ios || r.android`; else `(no preview target yet ...)` line
- Added `case 'preview'`: usage-guard exit 2, `--json` verbatim flat body exit 0 (direct apiFetch, never reaches printer), human path via `ops.getPreview` + `printPreviewPayload` exit 0; 404 throws to top-level `renderError` exit 1
- Added USAGE Lifecycle line: `appo preview <id>   Show preview target (TestFlight/deeplink + QR)`

### test/integration/read-verbs.test.mjs
6 new preview test cases:
1. path + env: GETs `/api/v1/apps/7/preview`, returns 0
2. `--json` verbatim: flat body parsed back exactly, no block glyphs
3. 404 exit 1: renderError path
4. missing id exit 2: usage guard
5. readiness D-04 (neither ready): "not preview-ready yet" for both + "no preview target yet" + no glyphs
6. readiness D-04 (ios ready): block glyph present in output

### test/integration/docs.test.mjs
- Added `'preview'` to COMMANDS array
- Deleted `'README + llms.txt do not document the deferred preview feature'` test (Pitfall 6 — would fail CI once docs added)

### README.md
- Added `## preview` section with example, per-platform readiness docs, QR gating, `--json` note, exit codes
- Added `appo preview <id>` to USAGE Lifecycle list in `src/cli.mjs` (README reflects the verb via its section)

### llms.txt
- Added `- [appo preview](README.md#preview)` to Commands list

## Verification Results

```
npm test          → 213 tests, 17 files — all passed
npm run lint      → clean
npm run typecheck → clean
node bin/appo.mjs preview (no id) → exit 2
node bin/appo.mjs --help | grep "appo preview" → found
grep README.md "appo preview" → found (## preview section)
grep llms.txt "README.md#preview" → found
docs.test: 'preview' in COMMANDS → yes
docs.test: forbid assertion → deleted
runtime dependencies → empty (unchanged)
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. `getPreview` calls the live API endpoint; the test harness uses `installMockFetch` with verified flat payload shapes.

## Threat Flags

None. The plan's threat model (T-04-04 through T-04-07) was fully honored:
- T-04-04: `--json` prints only `JSON.stringify(res)`, never the PAT; test asserts output equals stub body exactly
- T-04-05: 404 handled generically via `renderError`, no existence inference
- T-04-06: `preview_url`/deeplink contain a preview token by design (intended open-on-device mechanism)
- T-04-07: QR rendered at ECC M; width bounded by Plan 04-01 unit tests

## Self-Check: PASSED

Files exist:
- src/ops.mjs — contains getPreview: FOUND
- src/cli.mjs — contains case 'preview': FOUND
- test/integration/read-verbs.test.mjs — contains preview cases: FOUND
- test/integration/docs.test.mjs — contains 'preview', no forbid assertion: FOUND
- README.md — contains ## preview: FOUND
- llms.txt — contains README.md#preview: FOUND

Commits exist:
- 5aa39ad: feat(04-02): add ops.getPreview + case 'preview' + printPreviewPayload + USAGE — FOUND
- 8c2a369: feat(04-02): preview integration tests + docs.test fix + README/llms.txt docs — FOUND
