---
phase: 04-preview-open-on-device
verified: 2026-06-15T16:22:00Z
status: human_needed
score: 8/8
overrides_applied: 0
human_verification:
  - test: "Open terminal, run `appo preview <real-app-id>` with an app that has ios preview-ready=true. Point phone camera at the QR printed in the terminal."
    expected: "Camera app offers to open the URL (TestFlight or preview URL). Code scans reliably in both light and dark terminal themes — the forced black-on-white ANSI contrast (\x1b[30;47m) ensures readability regardless of theme."
    why_human: "Real-phone QR scan cannot be automated in CI. D-02 marks this as Manual-Only out-of-scope. The ANSI wrapping is verified by integration test (expects /\x1b\[30;47m[▀▄█ ]+\x1b\[0m/), but scanning success requires physical hardware."
---

# Phase 4: Preview / Open-on-Device — Verification Report

**Phase Goal:** `appo preview [<id>]` lets a user open their app on a device from the terminal — renders a scannable QR and prints the TestFlight URL + Android deeplink — at parity with the `preview_app` MCP tool.
**Verified:** 2026-06-15T16:22:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `appo preview` calls the user-PAT preview endpoint and prints TestFlight URL + Android deeplink + per-platform readiness | VERIFIED | `ops.getPreview` GETs `/api/v1/apps/${id}/preview` env-threaded; `printPreviewPayload` prints ios/android readiness first, conditional platform URLs, and `preview_url` always. Integration test asserts path matches `/api/v1/apps/7/preview$` and result=0. |
| 2 | A scannable QR is rendered in the terminal pointing at the preview target | VERIFIED | `printPreviewPayload` calls `renderQr(d.preview_url)` gated on `r.ios \|\| r.android`; wraps each row in `\x1b[30;47m…\x1b[0m` (forced black-on-white). Integration test asserts block glyph present AND ANSI pattern `/\x1b\[30;47m[▀▄█ ]+\x1b\[0m/` when ios-ready. Real-phone scan is human-only (see below). |
| 3 | Output matches the `preview_app` MCP payload (same backend source of truth) | VERIFIED | Same four flat fields (`ios_testflight_url`, `android_deeplink`, `preview_url`, `preview_ready`) from the same `/api/v1/apps/{id}/preview` endpoint. `--json` test asserts `JSON.parse(out)` equals the stub body exactly — no transformation, no drift. |
| 4 | `--json` supported; clear messaging when a platform is not preview-ready | VERIFIED | `case 'preview'` short-circuits to verbatim `JSON.stringify(res)` on `flags.json` before the printer is reached. Neither-ready path prints `(no preview target yet — build and publish to enable preview)` and skips QR. Integration tests assert both behaviors (no block glyphs in `--json`, readiness message in human path). |
| 5 | QR encoder is dependency-free vendored source (runtime deps empty) | VERIFIED | `package.json` dependencies is `{}`. `src/qr.mjs` is vendored Nayuki qrcodegen (MIT, TS→ESM). Spot-check `node -e` confirms empty deps count. |
| 6 | Vendored encoder has MIT attribution + pinned commit | VERIFIED | `grep "MIT"` and `grep "nayuki/QR-Code-generator@"` both match `src/qr.mjs`. Full copyright block present in file header. |
| 7 | `renderQr` returns bare (un-ANSI) matrix; ANSI contrast lives in the printer | VERIFIED | `src/qr.mjs:renderQr` returns raw block chars. `src/cli.mjs:printPreviewPayload` (lines 197-200) wraps each row in `CONTRAST`/`RESET`. Integration test at line 230 asserts ANSI pattern in output. Snapshot test in `qr.test.mjs` asserts no `\x1b[` in bare `renderQr` output. |
| 8 | README + llms.txt document `appo preview`; docs.test no longer forbids it | VERIFIED | `README.md` has `## preview` section. `llms.txt` has `- [appo preview](README.md#preview)`. `docs.test.mjs` has `'preview'` in COMMANDS array; the `'do not document the deferred preview feature'` test is deleted. 45 docs tests pass. |

**Score:** 8/8 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/qr.mjs` | Vendored Nayuki qrcodegen (MIT) + `renderQr(text)` half-block renderer | VERIFIED | Exports `QrCode`, `Ecc`, `renderQr`. `encodeText` at line 198. `renderQr` at line 588. File is 600+ lines — not a stub. |
| `test/unit/qr.test.mjs` | 18 unit tests: size, finder patterns, timing, quiet zone, snapshot, width bound | VERIFIED | 18 tests; covers encoder correctness (size, stability, bounds, `getModule` boolean, finder patterns at 3 corners, timing alternation) and renderer (multi-line, width=size+8, quiet zone, stability, bare snapshot, ≤80 cols, block chars). |
| `src/ops.mjs` | `getPreview(apiBase, id, env)` — GET `/api/v1/apps/{id}/preview` | VERIFIED | Lines 54-58: function present, calls `apiFetch` with correct path pattern, `env`-threaded. |
| `src/cli.mjs` | `case 'preview'` + `printPreviewPayload` + USAGE line | VERIFIED | `renderQr` imported (line 13). `printPreviewPayload` at lines 177-205. `case 'preview'` at lines 558-570. USAGE Lifecycle line at line 42. |
| `test/integration/read-verbs.test.mjs` | 6 preview cases: path/env, `--json` verbatim, 404 exit 1, missing-id exit 2, readiness D-04 (neither/ios) | VERIFIED | All 6 cases present at lines 129-231. 20 total tests in file pass. |
| `test/integration/docs.test.mjs` | `'preview'` in COMMANDS; forbid assertion deleted | VERIFIED | `'preview'` at COMMANDS array line 15. No `do not document the deferred preview` text. 45 tests pass. |
| `README.md` | `## preview` section with example, readiness docs, QR gating, `--json` note, exit codes | VERIFIED | `## preview` at line 128. Full section documents per-platform readiness, conditional URLs, QR gate, `--json`, exits 1 and 2. |
| `llms.txt` | `- [appo preview](README.md#preview)` in Commands list | VERIFIED | Line 24 in llms.txt matches exactly. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/qr.mjs renderQr` | `QrCode.encodeText / .size / .getModule` | vendored encoder API | WIRED | Line 589: `const qr = QrCode.encodeText(text, Ecc.MEDIUM)`. Lines 591+ iterate `qr.size` and `qr.getModule(x,y)`. |
| `src/cli.mjs case 'preview'` | `src/ops.mjs getPreview` | `ops.getPreview(apiBase, sub, env)` | WIRED | Line 567: `const d = await ops.getPreview(apiBase, sub, env)`. |
| `src/cli.mjs printPreviewPayload` | `src/qr.mjs renderQr` | `renderQr(d.preview_url)` gated on readiness | WIRED | Line 13: import. Line 199: `for (const row of renderQr(d.preview_url).split('\n'))` inside `if (r.ios \|\| r.android)`. |
| `src/ops.mjs getPreview` | `/api/v1/apps/{id}/preview` | `apiFetch GET` | WIRED | Line 57: `` apiFetch(apiBase, 'GET', `/api/v1/apps/${id}/preview`, null, env) ``. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `src/cli.mjs printPreviewPayload` | `d` (preview payload) | `ops.getPreview` → `apiFetch GET /api/v1/apps/{id}/preview` → backend DB | Yes — live API call with user PAT; integration tests use `installMockFetch` with realistic flat bodies | FLOWING |
| `src/qr.mjs renderQr` | `qr` (QR matrix) | `QrCode.encodeText(text, Ecc.MEDIUM)` — vendored pure encoder | Yes — pure deterministic transform; 18 unit tests verify structural correctness | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `appo preview` with no id exits 2 | `node bin/appo.mjs preview; echo $?` | `exit: 2` | PASS |
| `--help` documents `appo preview` | `node bin/appo.mjs --help \| grep "appo preview"` | `appo preview <id>  Show preview target (TestFlight/deeplink + QR)` | PASS |
| Runtime dependencies empty | `node -e "const p=require('./package.json'); ...deps count"` | `deps count: 0` | PASS |
| MIT header + pinned commit in `src/qr.mjs` | `grep "MIT" && grep "nayuki/QR-Code-generator@"` | Both FOUND | PASS |
| `renderQr` exports real function returning non-empty string | `node -e "import('./src/qr.mjs').then(...)` | `renderQr: function`, `render lines: 19`, `render width: 37` | PASS |
| No ANSI in bare `renderQr` output | Import and test regex | `ANSI in renderQr output: NO (good)` | PASS |
| Forbid-preview assertion deleted from docs.test | `grep "do not document"` | NOT FOUND | PASS |
| Full test suite green | `npm test` | 213 tests, 17 files — all passed | PASS |
| Lint clean | `npm run lint` | No output (clean) | PASS |
| Typecheck clean | `npm run typecheck` | No output (clean) | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CLI-03 | 04-01-PLAN, 04-02-PLAN | Preview / open-on-device — `appo preview` renders terminal QR + prints TestFlight/deeplink, parity with `preview_app` MCP tool | SATISFIED | All 4 success criteria verified. `getPreview` + `printPreviewPayload` + `renderQr` implemented and wired. 213 tests green. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/qr.mjs` | 83, 457 | `return []` in internal helpers | Info | Not a stub — these are internal encoder branches (`makeSegments('')` and alignment pattern helper for v1). Both are correct behavior per Nayuki spec, not renderer shortcuts. Data flows through `encodeText` normally. |

No blockers. No warnings. The two `return []` occurrences are internal encoder logic in the vendored block, not stub implementations.

---

### Human Verification Required

#### 1. Real-phone QR scan

**Test:** With a connected or nearby mobile device, run `appo preview <id>` in a terminal where the app has at least one platform preview-ready. Point the native camera app at the printed QR code.

**Expected:** The camera recognizes the QR and offers to open the `preview_url` (or TestFlight URL). The code scans in both light-on-dark and dark-on-light terminal themes — the forced `\x1b[30;47m` (black-on-white ANSI contrast) applied per-row in `printPreviewPayload` should guarantee scannability regardless of theme.

**Why human:** Physical hardware is required. CI cannot drive a phone camera. Per D-02 in the plan's VALIDATION section, this is explicitly declared Manual-Only and out of CI scope. The ANSI wrapping is verified by the integration test asserting `/\x1b\[30;47m[▀▄█ ]+\x1b\[0m/` in the output, but the end-to-end scan success is not.

---

### Gaps Summary

No gaps. All 8 must-have truths are verified and all artifacts pass all four levels (exists, substantive, wired, data flowing). The sole human verification item is the real-phone QR scan — explicitly documented as out of CI scope by the plan (D-02 / VALIDATION Manual-Only). No blockers, no stubs, no orphaned artifacts.

---

_Verified: 2026-06-15T16:22:00Z_
_Verifier: Claude (gsd-verifier)_
