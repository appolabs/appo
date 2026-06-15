---
phase: 04-preview-open-on-device
reviewed: 2026-06-15T16:16:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/qr.mjs
  - src/ops.mjs
  - src/cli.mjs
  - test/unit/qr.test.mjs
  - test/unit/__snapshots__/qr.test.mjs.snap
  - test/integration/read-verbs.test.mjs
  - test/integration/docs.test.mjs
  - README.md
  - llms.txt
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-06-15T16:16:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed Phase 04's additions: the vendored Nayuki qrcodegen encoder (`src/qr.mjs`,
`@ts-nocheck`, out of scope per instructions), our `renderQr` renderer, the
`ops.getPreview` transport, the `preview` verb case, the `printPreviewPayload`
printer, and the supporting unit/integration tests and docs. All 83 tests in the
reviewed suites pass and the snapshot is stable.

The code is well-structured: `renderQr` is a pure `string -> string` transform, the
readiness-gated QR logic matches the documented D-03/D-04 decisions, the `--json`
path bypasses the printer correctly, and the docs/llms.txt are in lockstep with the
command surface.

One Warning stands out and concerns the phase's killer feature directly: the printer
does NOT apply the forced ANSI contrast that both the design contract (baked into the
`renderQr` docstring) and the phase plan (04-01-PLAN.md, 04-RESEARCH.md Pitfall 1)
mandate. As written, QR scannability is theme-dependent — the exact failure mode the
research flagged. The remaining items are minor (dead-code import, edge-case
robustness note, doc precision).

## Warnings

### WR-01: Printer omits the forced ANSI contrast the design contract requires — QR scannability is theme-dependent

**File:** `src/cli.mjs:192-194` (printer) and `src/qr.mjs:577-587` (contract docstring)

**Issue:** The `renderQr` docstring explicitly states the contract: *"The caller (the
verb printer) applies forced-contrast ANSI wrapping (white-bg/black-fg + reset) so the
QR scans regardless of terminal theme."* The phase plan locks the same decision
(`04-01-PLAN.md:81-83, 151-153`: *"the verb's printer applies forced theme-independent
contrast by wrapping printed rows in ANSI white-bg/black-fg + reset"*), and
`04-RESEARCH.md` Pitfall 1 warns that inverted/insufficient contrast produces a QR that
*"scans in one terminal but not another (theme-dependent contrast)."*

The actual printer does no wrapping:

```js
if (r.ios || r.android) {
  console.log('');
  console.log(renderQr(d.preview_url));   // bare matrix, no ANSI
}
```

The half-block glyphs (`█ ▀ ▄`) are rendered in the terminal's *foreground* color on
its *background* color. On a dark-theme terminal the "dark" QR modules paint as light
glyphs on a dark background — inverted from the dark-on-light contrast QR scanners
expect. The unit/integration tests assert only the bare-matrix shape (snapshot
intentionally pins the un-ANSI string), so this gap is invisible to CI; it surfaces
only on a real-phone scan, which is the manual-only verification (D-02). The bare
matrix being pure/snapshot-stable was the *reason* contrast was deferred to the
printer — but the printer never implemented it.

**Fix:** Wrap each rendered row in forced background/foreground + reset in
`printPreviewPayload` so the matrix renders dark-on-light independent of terminal
theme. Keep `renderQr` bare (preserving the snapshot contract); apply ANSI only at the
print site:

```js
if (r.ios || r.android) {
  console.log('');
  const RESET = '\x1b[0m';
  const LINE = '\x1b[30;107m';   // black fg on bright-white bg
  for (const row of renderQr(d.preview_url).split('\n')) {
    console.log(`${LINE}${row}${RESET}`);
  }
}
```

Then complete the D-02 manual real-phone scan check on both a light- and a dark-theme
terminal before considering the killer feature done. (If a deliberate decision was
made to ship the bare matrix and rely on terminals being light-themed, update the
`renderQr` docstring and the plan so the contract matches the code — right now they
contradict the implementation.)

## Info

### IN-01: Unused `unwrap` import in cli.mjs is now partly redundant with the wildcard `ops` import

**File:** `src/cli.mjs:11-12`

**Issue:** `cli.mjs` imports both `import * as ops from './ops.mjs'` and a named
`import { unwrap } from './ops.mjs'`. `unwrap` is still used directly in `cli.mjs`
(e.g. lines 410, 449, 507, 522, 546, 570, 585), so it is not dead — but the dual
import of the same module is a minor style inconsistency. Not introduced by this phase
(pre-existing), noted only because `ops.mjs` was in scope.

**Fix:** Optional: reference `ops.unwrap(...)` everywhere and drop the second import,
or leave as-is. No behavioral impact.

### IN-02: `printPreviewPayload` QR path assumes `preview_url` is a non-empty string; a backend regression would silently render a QR of an empty/garbage URL

**File:** `src/cli.mjs:192-194`

**Issue:** The QR is gated on readiness (`r.ios || r.android`) and then encodes
`d.preview_url`. The comment documents the backend guarantee that `preview_url` is
never null. Verified that `renderQr('')` does not throw (it encodes an empty string to
a valid small QR), so there is no crash risk — but if the backend ever returns an
empty/placeholder `preview_url` while a platform reports ready, the user would scan a
QR that resolves to nothing, with no diagnostic. This is defensive-only; the contract
is documented as a backend guarantee.

**Fix:** Optional hardening — guard the QR on a truthy URL as well as readiness:

```js
if ((r.ios || r.android) && d.preview_url) {
  console.log('');
  console.log(renderQr(d.preview_url));
} else if (r.ios || r.android) {
  console.log('  (preview ready but no preview_url returned)');
} else {
  console.log('  (no preview target yet — build and publish to enable preview)');
}
```

### IN-03: README preview section omits the ANSI-contrast / scannability detail

**File:** `README.md:128-147`

**Issue:** The README describes the QR as "scannable" but does not mention any
terminal-theme caveat. If WR-01 is resolved by forcing contrast, no change is needed.
If the bare-matrix output ships as-is, the docs should note that the QR renders best
on a light-background terminal (so users on dark themes know to invert), since
scannability is currently theme-dependent.

**Fix:** After resolving WR-01, ensure the README statement ("a scannable terminal QR
code") is accurate for all terminal themes; add a one-line caveat only if the
theme-dependent behavior is retained intentionally.

---

_Reviewed: 2026-06-15T16:16:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
