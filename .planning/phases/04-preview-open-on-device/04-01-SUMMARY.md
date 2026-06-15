---
phase: 04-preview-open-on-device
plan: "01"
subsystem: qr-encoder
tags: [vendoring, encoder, testing, tdd, dependency-free]
dependency_graph:
  requires: []
  provides: [src/qr.mjs, renderQr]
  affects: [Wave-2 preview verb (04-02)]
tech_stack:
  added: []
  patterns: [vendored-MIT-source, TDD-RED-GREEN, half-block-terminal-renderer]
key_files:
  created:
    - src/qr.mjs
    - test/unit/qr.test.mjs
    - test/unit/__snapshots__/qr.test.mjs.snap
  modified: []
key_decisions:
  - "Vendored Nayuki qrcodegen (MIT) as pure ESM; @ts-nocheck on vendored block, renderQr stays type-checked"
  - "renderQr returns bare (un-ANSI) matrix; printer applies ANSI contrast — snapshot-stable, printer-owns-contrast"
  - "4-module quiet zone (QZ=4); half-block maps 2 module rows per text row (width = size+8)"
  - "eslint-disable-next-line no-control-regex on \\x1b check in snapshot test"
metrics:
  duration_seconds: 324
  completed_date: "2026-06-15"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 0
requirements_satisfied: [CLI-03]
---

# Phase 04 Plan 01: QR Encoder — Vendored Nayuki qrcodegen + renderQr Summary

**One-liner:** Vendored Nayuki qrcodegen (MIT, TS->ESM) with a `renderQr(text)` half-block renderer and 18 structural-correctness unit tests proving finder patterns, timing, quiet zone, and snapshot stability.

## Objective

Vendor a dependency-free terminal QR encoder as `src/qr.mjs` and expose a pure `renderQr(text) -> string` half-block renderer, with pure-function unit tests proving the output is structurally scannable.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| RED | Failing tests for QR encoder | f42adeb | test/unit/qr.test.mjs |
| GREEN | Vendored encoder + renderQr implementation | 49b3f62 | src/qr.mjs, test/unit/__snapshots__/qr.test.mjs.snap |
| fix | Lint suppression for ANSI regex in test | 54f7c5e | test/unit/qr.test.mjs |

## TDD Gate Compliance

- RED commit: f42adeb (`test(04-01): add failing tests for QR encoder (RED)`) — tests failed on missing module
- GREEN commit: 49b3f62 (`feat(04-01): vendor Nayuki qrcodegen + renderQr half-block renderer (GREEN)`) — all 18 tests pass
- REFACTOR: not needed

## Verification Results

- `npx vitest run test/unit/qr.test.mjs` — 18 tests passed
- `npm test` — 206 tests passed (17 test files, all green)
- `npm run lint` — clean
- `npm run typecheck` — clean (`tsc --noEmit`)
- `grep attribution` — MIT header + pinned-commit note present
- `package.json dependencies` — empty (runtime dependency-free preserved)
- Inline smoke test: `QrCode.encodeText(url, Ecc.MEDIUM).size === 29` for TEST_URL

## What Was Built

### src/qr.mjs

Full Nayuki qrcodegen implementation converted from TypeScript to ES module:
- `QrCode` class: `encodeText`, `encodeBinary`, `encodeSegments`, `getModule`, `size`
- `Ecc` class: `LOW`, `MEDIUM`, `QUARTILE`, `HIGH` levels
- `QrSegment` + `Mode` classes: byte/numeric/alphanumeric segment encoding
- Reed-Solomon ECC, mask penalty scoring (8 mask patterns), finder/alignment/timing patterns
- `renderQr(text)` half-block renderer (exported separately below vendored block)
- File header: full MIT copyright notice + "Vendored from nayuki/QR-Code-generator@<hash>; adapted to ESM."
- `// @ts-nocheck` on vendored block only; `renderQr` is fully type-checked

### test/unit/qr.test.mjs

18 unit tests covering:
- Encoder: size is integer, odd, ≥21, stable, bounded (≤57 for representative URL)
- `getModule` returns boolean
- Finder pattern top-left: (0,0) dark, 7×7 border/gap/core structure fully verified
- Finder patterns top-right and bottom-left: outer corners verified
- Timing patterns: row 6 and col 6 alternate dark/light (full range asserted)
- `renderQr`: returns multi-line string, width=size+8, quiet zone (first/last 2 text rows all-space), stability, snapshot, block characters present, width≤80 for representative preview URL

## Decisions Made

**renderQr returns bare matrix (no ANSI):** The printer layer (`case 'preview'` in `src/cli.mjs`, Wave 2) applies forced ANSI white-bg/black-fg + reset to each row for theme-independent contrast. This keeps `renderQr` a pure `string->string` transform with a snapshot-stable, ANSI-free output. The real-phone scan verification is a manual-only step (D-02, out of CI scope).

**@ts-nocheck on vendored block only:** The converted TypeScript source uses patterns (constructor property assignments, static property initializers after class body) that trip `tsc --checkJs` without annotations. Scoping `@ts-nocheck` to the vendored block preserves type-checking on `renderQr` and the test file.

**eslint-disable-next-line for `\x1b` regex:** The `no-control-regex` ESLint rule flags the ANSI escape detection assertion. Inline suppression is narrower than adding the rule to `.eslintrc.json`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESLint `no-control-regex` in snapshot test**
- **Found during:** Post-GREEN lint run
- **Issue:** `expect(output).not.toMatch(/\x1b\[/)` triggered ESLint `no-control-regex` error
- **Fix:** Added `// eslint-disable-next-line no-control-regex` comment before the assertion
- **Files modified:** test/unit/qr.test.mjs
- **Commit:** 54f7c5e

## Known Stubs

None. `src/qr.mjs` is fully implemented; `renderQr` encodes and renders real QR matrices.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. `src/qr.mjs` is a pure offline transform (string -> block-art string). Threat model items T-04-01 (supply-chain: pinned commit hash in header, vendored source in-repo) and T-04-02 (no I/O or dynamic eval — verified by inspection of the converted source) are satisfied. T-04-03 accepted by design.

## Self-Check: PASSED

- `src/qr.mjs` exists: FOUND
- `test/unit/qr.test.mjs` exists: FOUND
- `test/unit/__snapshots__/qr.test.mjs.snap` exists: FOUND
- Commit f42adeb exists: FOUND (RED)
- Commit 49b3f62 exists: FOUND (GREEN)
- Commit 54f7c5e exists: FOUND (lint fix)
- 18 tests pass: CONFIRMED
- 206 total tests pass: CONFIRMED
- lint clean: CONFIRMED
- typecheck clean: CONFIRMED
