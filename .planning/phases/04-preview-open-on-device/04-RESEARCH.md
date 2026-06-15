# Phase 4: Preview / open-on-device - Research

**Researched:** 2026-06-15
**Domain:** Node CLI read-verb + vendored dependency-free terminal QR encoder
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `appo preview <id>` → `GET /api/v1/apps/{id}/preview` (ability USER). Response (parity with
  `preview_app` MCP): `{ ios_testflight_url, android_deeplink, preview_url, preview_ready }`. Add
  `getPreview(apiBase, id, env)` to `src/ops.mjs` (env-threaded); new `case 'preview'` in `src/cli.mjs`.
  `<id>` is required (consistent with `status`).
- **D-02:** QR rendered by a **vendored, self-contained encoder** added as `src/qr.mjs` — our own bundled
  source, NOT an npm dependency. Encodes a URL to a QR matrix and prints it to the terminal using Unicode
  block characters so it scans from a phone camera. Researcher sources a compact, correct, MIT/public-domain
  implementation to vendor + adapt (with attribution), and verifies a rendered code actually scans.
- **D-03:** The QR encodes `preview_url`. If `preview_url` is absent/not ready, skip the QR and print a
  clear "no preview target yet" line instead of erroring.
- **D-04:** Human output prints, in order: per-platform readiness (from `preview_ready`), the iOS TestFlight
  URL, the Android deeplink, the `preview_url`, then the QR. When a platform is NOT preview-ready, print a
  clear "iOS/Android: not preview-ready yet" line rather than a blank/url-less field.
- **D-05:** `--json` emits the raw v1 response body verbatim (D-08) — no QR, no curation.
- **D-06:** Reuse the taxonomy: `0` success; `1` error — a `404` renders via `renderError` (or a clear
  "app not found or not preview-ready" line), exit 1; `2` usage (missing `<id>`).

### Claude's Discretion
- QR module density/format (half-block vs full-block; quiet-zone width) — pick what scans reliably.
- Exact readiness wording; whether to also show `preview_url` when only one platform is ready.
- Whether `preview_ready` is a per-platform object or a boolean (researcher confirms) and the printout shape.

### Deferred Ideas (OUT OF SCOPE)
- `POST /apps/{app}/preview/deeplink` (admin deeplink minting).
- A `--qr-only`/`--open` (auto-open TestFlight) convenience.
- Re-documenting `appo preview` IS in scope here (README/llms.txt add it).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLI-03 | `appo preview` renders a terminal QR + prints TestFlight/deeplink, from the user-PAT preview surface; parity with `preview_app` MCP | Backend shape confirmed (Standard Stack / Architecture); vendored QR encoder sourced (Don't Hand-Roll); test plan (Validation Architecture) |
</phase_requirements>

## Summary

Phase 4 adds one read verb (`appo preview <id>`) plus a vendored, dependency-free terminal QR encoder.
The backend half is fully shipped (apps-web-app Phase 188) and the exact payload is now **VERIFIED by
reading source** — not assumed. The verb itself is a near-mechanical clone of `case 'status'` /
`case 'rejection'`: usage-guard (exit 2) → `--json` verbatim short-circuit → `ops.getPreview` (GET +
unwrap + env-thread) → curated printer → QR. The only novel, load-bearing work is `src/qr.mjs`.

The QR must be **vendored** because the published CLI is RUNTIME dependency-free (`dependencies: {}`,
`files: [bin, src, README.md, llms.txt]`). The recommendation is to vendor **Nayuki's QR Code generator**
(`typescript-javascript/qrcodegen.ts`, MIT, ~800 lines, zero deps, correctness-first) converted to a
plain `.mjs` ES module, with a thin `renderQr(text) -> string` half-block renderer on top.

**Critical correction to a CONTEXT assumption:** `preview_url` is **never null** — the backend's
`PreviewResolver::derivePreviewUrl()` always returns a route URL (`route('preview', ['token' => $token])`,
non-nullable `string`). D-03's "skip QR when preview_url absent" therefore never fires on a null URL. The
QR-skip decision MUST key on **readiness** (`preview_ready.ios || preview_ready.android`), not on URL
presence. This is the single most important planning correction in this document.

**Primary recommendation:** Clone `case 'status'`/`case 'rejection'` for the verb + `ops.getApp` for the
op; vendor Nayuki qrcodegen into `src/qr.mjs` as `renderQr(text)`; gate the QR on readiness, not on
`preview_url` nullness; add `'preview'` to `docs.test.mjs` COMMANDS and **delete** its
"do-not-document-preview" assertion.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fetch preview payload | CLI ops layer (`src/ops.mjs`) | API transport (`src/api.mjs`) | One transport definition per v1 call; env-threaded |
| Dispatch + arg-guard + render | CLI (`src/cli.mjs` `case 'preview'`) | — | Single `switch` dispatcher owns usage/exit/print |
| Encode URL → QR matrix | Vendored encoder (`src/qr.mjs`) | — | Pure, dependency-free; the backend mints the URL, the CLI only visualizes it |
| Render matrix → terminal blocks | `src/qr.mjs` `renderQr()` | — | Pure string transform; unit-testable without a TTY |
| Mint preview token / derive URLs / readiness | Backend (`PreviewResolver`, apps-web-app) | — | Source of truth; CLI is a pure consumer (no-drift) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node built-in `fetch` | Node ≥18 | HTTP transport (via existing `apiFetch`) | Already the project's transport; zero deps [VERIFIED: src/api.mjs] |
| Vendored Nayuki qrcodegen | pinned snapshot of `master` | QR matrix encoding | MIT, ~800 lines, zero deps, "absolute correctness" primary goal [CITED: nayuki.io/page/qr-code-generator-library] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^1.6.1 (devDep) | Unit + integration tests | All Phase 4 tests [VERIFIED: package.json] |
| `test/helpers/mockFetch.mjs` | in-repo | Canned-response fetch stub | Verb tests (getPreview path, --json, 404) [VERIFIED] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Nayuki qrcodegen | `kazuhikoarase/qrcode-generator` (MIT) | Also MIT and widely used, but larger/older API surface and less "correctness-first" framing; Nayuki is more compact and explicitly aims for absolute correctness [CITED: github.com/nayuki/QR-Code-generator] |
| Nayuki qrcodegen | `qrcode-terminal` core | It's a wrapper around `qrcode-generator` + a renderer; vendoring the wrapper pulls more than needed. Better to vendor a pure encoder and write our own ~20-line renderer |
| Half-block rendering | Two-spaces-per-module (`█`/spaces, 2 chars wide) | Two-space is simpler and very reliable but doubles width (a v3 29-module code → 58+ columns). Half-block (`▀`/`▄`/`█`/space) halves vertical size and keeps width = module count, scanning reliably [CITED: github.com/mdp/qrterminal] |

**Installation:** None — RUNTIME dependency-free is a non-negotiable. The encoder is vendored source, not
an npm install. No change to `package.json` `dependencies` (stays empty) or `files` (`src/` already shipped).

**Version verification:** Nayuki qrcodegen is a single source file (`typescript-javascript/qrcodegen.ts`)
with no npm-version coupling — vendor a pinned commit and record the commit hash + license in the file
header. `[VERIFIED: github.com/nayuki/QR-Code-generator/blob/master/typescript-javascript/qrcodegen.ts —
MIT header present, ~800 lines, zero deps]`.

## Architecture Patterns

### System Architecture Diagram

```
  $ appo preview 7 [--json] [--env <e>] [--api <u>]
        |
        v
  cli.run() ── parseArgs ──> usage guard (no <id> -> exit 2)
        |
        |  resolve env once: activeProfileName(flags.env)
        v
  case 'preview'
        |
        ├── flags.json?  ── YES ─> apiFetch(GET /apps/{id}/preview) ─> console.log(JSON.stringify(res)) ─> 0
        |                          (verbatim envelope; NO unwrap, NO QR)   [D-05/D-08]
        |
        └── NO (human) ─> ops.getPreview(apiBase, id, env)
                              |                           \
                              v                            (throws on non-2xx: err.status/err.envelope)
                    unwrap? NO — preview payload is a FLAT object, NOT a {data:...} envelope
                              |
                              v
                    printPreviewPayload(d)
                       ├─ readiness: ios / android  (from d.preview_ready.{ios,android})
                       ├─ ios_testflight_url   (or "iOS: not preview-ready yet")
                       ├─ android_deeplink     (or "Android: not preview-ready yet")
                       ├─ preview_url          (always present)
                       └─ QR:  ready(ios||android)?  renderQr(d.preview_url)  :  "no preview target yet"
                              |
                              v
                            exit 0

  404 (non-owned / not found) ──> top-level catch ──> renderError(err) ──> exit 1   [D-06]
```

> **Envelope note (load-bearing):** `apps`/`status`/`rejection` return `{ data: ... }` and call `unwrap`.
> The preview endpoint returns a **flat object** (`response()->json(['ios_testflight_url' => ..., ...])`)
> — there is NO `data` key. `unwrap` is a safe no-op on a flat object (it only unwraps when `'data' in
> payload`), so `ops.getPreview` may call `unwrap` harmlessly for symmetry, but the printer must read
> `d.ios_testflight_url` directly. [VERIFIED: V1PreviewController.php lines 38-43]

### Recommended Project Structure
```
src/
├── qr.mjs        # NEW — vendored Nayuki encoder + renderQr(text) -> string (block art)
├── ops.mjs       # + getPreview(apiBase, id, env)
└── cli.mjs       # + case 'preview' (+ printPreviewPayload printer, + USAGE line)
test/
├── unit/
│   └── qr.test.mjs        # NEW — pure-function tests (module count, finder patterns, snapshot)
└── integration/
    ├── read-verbs.test.mjs  # + preview cases (path, --json verbatim, 404 exit 1, missing-id exit 2)
    └── docs.test.mjs        # + 'preview' to COMMANDS; DELETE the "do-not-document-preview" assertion
README.md, llms.txt          # + appo preview documentation
```

### Pattern 1: ops.getPreview (clone of ops.getApp)
**What:** One transport definition for the preview GET, env-threaded.
**When to use:** The human path. (The `--json` path calls `apiFetch` directly to keep the envelope verbatim.)
```javascript
// src/ops.mjs — Source: clone of getApp (VERIFIED: src/ops.mjs lines 40-42)
// GET /api/v1/apps/{id}/preview -> 200 { ios_testflight_url, android_deeplink, preview_url, preview_ready }
// NOTE: flat object (no {data:} envelope) — unwrap is a harmless no-op here.
export async function getPreview(apiBase, id, env) {
  return unwrap(await apiFetch(apiBase, 'GET', `/api/v1/apps/${id}/preview`, null, env));
}
```

### Pattern 2: case 'preview' (clone of case 'status' + case 'rejection')
**What:** usage-guard → `--json` verbatim short-circuit → op → printer → exit 0; 404 to renderError.
```javascript
// src/cli.mjs — Source: composed from case 'status' (lines 514-524) + case 'rejection' (526-539)
case 'preview': {
  if (!sub) { console.error('Usage: appo preview <id>'); return 2; }   // exit 2 (D-06)
  // --json: verbatim flat body (D-05/D-08). Direct apiFetch — never reaches the printer/QR.
  if (flags.json) {
    const res = await apiFetch(apiBase, 'GET', `/api/v1/apps/${sub}/preview`, null, env);
    console.log(JSON.stringify(res));
    return 0;
  }
  const d = await ops.getPreview(apiBase, sub, env);   // 404 throws -> top-level renderError (exit 1)
  printPreviewPayload(d);
  return 0;
}
```

### Pattern 3: printPreviewPayload (curated printer, exact v1 field names — no-drift)
**What:** Readiness lines first, then the three URLs, then the QR (or skip line). Reuses the aligned
`line(k,v)` idiom from `printApp`/`printBuild`.
```javascript
// src/cli.mjs — Source: line(k,v) idiom (VERIFIED: printApp lines 121-132)
function printPreviewPayload(d) {
  if (!d) return;
  const line = (k, v) => v !== undefined && v !== null && console.log(`  ${k.padEnd(18)} ${v}`);
  const r = d.preview_ready || {};
  // D-04: readiness FIRST, per-platform. preview_ready is {ios:bool, android:bool} (VERIFIED).
  console.log(`  ios       ${r.ios ? 'preview-ready' : 'not preview-ready yet'}`);
  console.log(`  android   ${r.android ? 'preview-ready' : 'not preview-ready yet'}`);
  if (r.ios)     line('ios_testflight_url', d.ios_testflight_url);
  if (r.android) line('android_deeplink', d.android_deeplink);
  line('preview_url', d.preview_url);                 // always present
  // D-03 (corrected): gate the QR on READINESS, not on preview_url nullness (it's never null).
  if (r.ios || r.android) {
    console.log('');
    console.log(renderQr(d.preview_url));             // src/qr.mjs
  } else {
    console.log('  (no preview target yet — build and publish to enable preview)');
  }
}
```

### Pattern 4: renderQr (vendored encoder + half-block renderer)
**What:** Pure `string -> string`. Encode with Nayuki, render each module pair as a half-block, with a
4-module quiet zone (spec-mandated).
```javascript
// src/qr.mjs — Source: Nayuki qrcodegen (MIT) + half-block technique (CITED: mdp/qrterminal)
// renderQr(text) -> block-art string. ECC level MEDIUM (M, ~15% recovery) — good URL default.
export function renderQr(text) {
  const qr = QrCode.encodeText(text, Ecc.MEDIUM);   // auto-selects version
  const QZ = 4;                                       // quiet zone, modules (spec-mandated, scans reliably)
  const dark = (x, y) =>
    x >= 0 && y >= 0 && x < qr.size && y < qr.size ? qr.getModule(x, y) : false;
  const lines = [];
  for (let y = -QZ; y < qr.size + QZ; y += 2) {       // 2 rows per text row (half-block)
    let row = '';
    for (let x = -QZ; x < qr.size + QZ; x++) {
      const top = dark(x, y);
      const bot = dark(x, y + 1);
      row += top && bot ? '█' : top ? '▀' : bot ? '▄' : ' ';
    }
    lines.push(row);
  }
  return lines.join('\n');
}
```
> **Color convention:** QR spec is dark-on-light. With a terminal default of light text on a dark
> background, the glyphs above render correctly ONLY if the terminal background is light, OR if the row
> string is wrapped in an ANSI white-bg/black-fg reset. Robust terminal QR libs force bg/fg with ANSI
> codes so the symbol scans regardless of theme [CITED: github.com/mdp/qrterminal]. **Discretion (D-02):**
> the planner should either (a) wrap output rows in ANSI `\x1b[40m`(black-bg)/`\x1b[107m`(white-bg) +
> reset to guarantee contrast, or (b) invert the block mapping so dark modules render as spaces on a
> forced white background. Verify scanning on a real terminal before locking the choice — this is the
> load-bearing correctness detail of the phase.

### Anti-Patterns to Avoid
- **Calling `unwrap` and then reading `d.data.*`:** the preview payload is flat — read `d.ios_testflight_url`.
- **Skipping the QR on `!preview_url`:** `preview_url` is never null; this branch is dead code. Gate on readiness.
- **Curating the `--json` output:** D-05/D-08 — emit `JSON.stringify(res)` verbatim, no QR, no field selection.
- **Adding an npm dependency for QR:** breaks the RUNTIME dependency-free non-negotiable. Vendor the source.
- **Forgetting the docs.test "do-not-document" guard:** it actively fails CI once `appo preview` is added unless deleted.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| QR encoding | A bespoke Reed-Solomon + masking + version-selection encoder | Vendored Nayuki qrcodegen (MIT) | QR encoding is deceptively complex: Galois-field Reed-Solomon ECC, 8 mask patterns + penalty scoring, version/capacity tables, format/version info bits. A hand-rolled encoder will produce codes that *look* like QR but don't scan. Nayuki's primary goal is "absolute correctness" [CITED: nayuki.io] |
| HTTP transport / auth / env | A new fetch wrapper | `apiFetch` + `ops.*` (existing) | Token sourcing, 401 env-naming, envelope-on-throw already solved [VERIFIED: src/api.mjs] |
| Terminal rendering | An image/PNG renderer | Unicode half-block string | No image deps, scans from screen, pure + testable [CITED: mdp/qrterminal] |

**Key insight:** The only thing worth writing by hand here is the ~20-line half-block *renderer* (a pure
matrix→string transform). The *encoder* must be vendored from a correctness-proven source — a
nearly-correct QR encoder is worse than none because it fails silently (renders, won't scan).

## Vendoring & Attribution Plan (D-02)

1. **Source:** `nayuki/QR-Code-generator`, file `typescript-javascript/qrcodegen.ts`, MIT License. Pin to
   a specific commit; record the commit hash in the file header. [VERIFIED: GitHub, MIT header present]
2. **Convert TS → `.mjs`:** Replace `namespace qrcodegen { export class QrCode { ... } }` with top-level
   `export class QrCode`; flatten the nested `Ecc`/`Mode`/`QrSegment` namespaces to top-level
   exports/references; strip type annotations (or keep JSDoc for `tsc --checkJs`); remove `"use strict"`
   (implicit in modules). [VERIFIED: WebFetch of qrcodegen.ts — namespace + Ecc enum + getModule/size confirmed]
3. **Trim:** Phase 4 only needs `QrCode.encodeText(text, Ecc)`, `.size`, `.getModule(x,y)`, and the `Ecc`
   levels. `QrSegment` byte/numeric/alphanumeric helpers are used internally by `encodeText`; keep what
   `encodeText` transitively requires, drop nothing it needs.
4. **Attribution:** Keep the full MIT header verbatim at the top of `src/qr.mjs` ("Copyright (c) Project
   Nayuki. (MIT License)"), plus a one-line note: "Vendored from nayuki/QR-Code-generator@<hash>; adapted
   to ESM." This satisfies MIT's attribution clause. Our own `renderQr` lives below the vendored block.
5. **Typecheck:** the file must pass `tsc --checkJs` (project runs it in CI). Add JSDoc types or `// @ts-nocheck`
   at the top of the vendored block if upstream patterns trip the checker; prefer JSDoc on the public API.
6. **License compatibility:** package is MIT; vendoring MIT source is compatible (attribution preserved).

## Common Pitfalls

### Pitfall 1: QR renders but won't scan (the load-bearing failure)
**What goes wrong:** A code prints, looks plausible, but a phone camera won't read it.
**Why it happens:** (a) missing/insufficient quiet zone (<4 modules), (b) inverted contrast (dark glyphs
on a dark terminal background), (c) a hand-rolled encoder with wrong ECC/masking, (d) non-square aspect
from a renderer that isn't half-block (terminal cells are ~2:1 tall:wide).
**How to avoid:** Vendor a correctness-proven encoder; include a 4-module quiet zone; force ANSI
contrast or invert mapping to a forced light background; use half-block so 2 modules map to 1 cell row
(restoring square aspect).
**Warning signs:** Code scans in one terminal but not another (theme-dependent contrast).

### Pitfall 2: Terminal width overflow for larger QR versions
**What goes wrong:** A long `preview_url` (a route URL + token) pushes the QR to version 3-5 (29-37
modules), which + quiet zone (8) can exceed 45+ columns — wider than an 80-col terminal at half-block? No
(half-block keeps width = module count + 2·QZ), but a *very* long URL or higher ECC could push to v6+.
**Why it happens:** QR version auto-scales with payload length and ECC level.
**How to avoid:** Use ECC level M (not Q/H) for URLs — lower ECC = lower version for the same payload.
The preview route URL is short (path + token), so expect ~v2-v4 (25-37 modules + 8 QZ = 33-45 cols),
within 80 columns. Note this in tests (assert module count is bounded).
**Warning signs:** Wrapped/garbled QR lines in a narrow terminal.

### Pitfall 3: `preview_ready` shape — per-platform object, NOT a boolean (RESOLVED)
**What goes wrong:** Treating `preview_ready` as a single boolean; readiness lines/QR gate break.
**Resolution:** [VERIFIED: PreviewResolver.php lines 30-43] — `preview_ready` is
`array{ios: bool, android: bool}`, serialized as `{"ios": true|false, "android": true|false}`. Read
`d.preview_ready.ios` / `d.preview_ready.android`. Android readiness also requires a non-null deeplink
(`isPlatformPreviewReady('android') && androidDeeplink !== null`), so `preview_ready.android` already
implies `android_deeplink` is present.

### Pitfall 4: `preview_url` is never null (CONTEXT D-03 correction)
**What goes wrong:** Following D-03 literally and skipping the QR when `preview_url` is falsy — a branch
that never fires, leaving the QR rendered even when neither platform is ready.
**Resolution:** [VERIFIED: PreviewResolver.php lines 28, 39, 73-76] — `previewUrl` is a non-nullable
`string` (always `route('preview', ...)`). Gate the QR on **readiness** (`r.ios || r.android`), printing
"no preview target yet" when neither is ready. This honors D-03's intent (skip when not ready) against
the actual payload shape.

### Pitfall 5: `--json` must stay verbatim (no QR, no unwrap)
**What goes wrong:** Rendering a QR or curating fields under `--json` corrupts machine output.
**How to avoid:** Short-circuit `--json` before the printer with a direct `apiFetch` +
`JSON.stringify(res)` (mirrors `case 'status'` exactly). [VERIFIED: cli.mjs lines 520, 563-570]

### Pitfall 6: docs.test.mjs actively forbids `appo preview`
**What goes wrong:** Adding `appo preview` to README/llms.txt fails CI on an existing assertion.
**How to avoid:** [VERIFIED: test/integration/docs.test.mjs] — DELETE the test
`'README + llms.txt do not document the deferred preview feature'` and ADD `'preview'` to the `COMMANDS`
array (which then asserts BOTH docs document it). This is a delete-old-code requirement (CLAUDE.md).

## Code Examples

### Encoding + module access (vendored API)
```javascript
// Source: nayuki/QR-Code-generator qrcodegen.ts (VERIFIED via WebFetch)
const qr = QrCode.encodeText('https://app.appo.io/preview/abc123', Ecc.MEDIUM);
qr.size;                 // int, 21..177 (odd) — module dimension
qr.getModule(x, y);      // boolean — true = dark module, false = light
// Ecc.LOW (~7%) | Ecc.MEDIUM (~15%) | Ecc.QUARTILE (~25%) | Ecc.HIGH (~30%)
```

### 404 envelope (parity reference)
```json
// Source: RendersV1Envelope::notFound() (VERIFIED: apps-web-app)
{ "error": "not_found", "code": "resource_not_found", "message": "The requested resource was not found." }
```

### Verified preview payload shape (parity source of truth)
```json
// Source: V1PreviewController::show() + PreviewResolver (VERIFIED: apps-web-app)
{
  "ios_testflight_url": "https://testflight.apple.com/join/XXXX",  // string|null
  "android_deeplink":   "myapp://preview?token=...",              // string|null
  "preview_url":        "https://.../preview/<token>",            // string (NEVER null)
  "preview_ready":      { "ios": true, "android": false }          // {ios:bool, android:bool}
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Two-space-per-module ASCII QR | Unicode half-block (`▀▄█`) | qrcode-terminal/qrterminal "half block" updates | Half the height, width = module count; scans reliably [CITED: mdp/qrterminal] |
| npm `qrcode`/`qrcode-terminal` dependency | Vendored single-file MIT encoder | This phase | Honors RUNTIME dependency-free; full control over rendering |

**Deprecated/outdated:**
- None relevant. Nayuki qrcodegen is actively maintained and stable; QR Model 2 (ISO/IEC 18004) is the standard.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ECC level **M** keeps the preview URL at ~v2-v4 (≤45 cols at half-block) | Pitfalls 2 | LOW — if a deployment's preview URL is unusually long, version climbs; the renderer still works, just wider. Verify against a real `preview_url` during implementation |
| A2 | Forcing ANSI bg/fg (or inverting to white-bg) is needed for theme-independent scanning | Pattern 4 / Pitfall 1 | LOW — must be verified on a real terminal+camera before locking (D-02 mandates a scan check). Either approach is valid; pick by test |

**All other claims are VERIFIED (by reading apps-web-app + appo source) or CITED (official QR/library docs).**

## Open Questions (RESOLVED)

1. **Exact `preview` route URL format / typical length**
   - What we know: `derivePreviewUrl()` returns `route('preview', ['token' => $token])` — a path + token.
   - What's unclear: the host + token length in the target environment (drives QR version).
   - RESOLVED: use ECC M; the QR unit test encodes a representative `preview_url` and asserts a bounded
     module count (`qr.size <= 45`). (Plan 04-01 Task 2.)

2. **ANSI contrast vs. inverted mapping (D-02 discretion)**
   - What we know: terminal QR libs force bg/fg to guarantee scanning regardless of theme.
   - What's unclear: which reads cleaner across the terminals Appo users use.
   - RESOLVED: forced-contrast — wrap each row in ANSI white-bg/black-fg + reset; `renderQr` returns the
     BARE (un-ANSI) matrix and the printer applies contrast, so the snapshot test pins the matrix not the
     ANSI. Real phone-scan check is the Manual-Only verification (D-02). (Plan 04-01 Task 2.)

## Environment Availability

Step 2.6: SKIPPED for runtime deps — the feature adds no external tools (vendored encoder, built-in
`fetch`). The only "dependency" is the live `GET /api/v1/apps/{id}/preview` endpoint, which is shipped
(apps-web-app Phase 188) [VERIFIED: routes/api_v1.php line 65 — `apps.preview.show` route present].

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `GET /apps/{id}/preview` (backend) | CLI-03 | ✓ | apps-web-app Phase 188 | — |
| Node `fetch` | transport | ✓ | Node ≥18 | — |

## Validation Architecture

> nyquist_validation: no `.planning/config.json` workflow override found disabling it — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^1.6.1 [VERIFIED: package.json] |
| Config file | (vitest default; per-worker `APPO_CONFIG_HOME` isolation via setup) |
| Quick run command | `npx vitest run test/unit/qr.test.mjs` |
| Full suite command | `npm test` (`vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLI-03 | `getPreview` GETs `/apps/{id}/preview`, env-threaded | integration | `npx vitest run test/integration/read-verbs.test.mjs -t preview` | ❌ Wave 0 (add preview cases) |
| CLI-03 | `--json` emits flat body verbatim (no QR) | integration | same | ❌ Wave 0 |
| CLI-03 | 404 → exit 1 via renderError | integration | same | ❌ Wave 0 |
| CLI-03 | missing `<id>` → exit 2 | integration | same | ❌ Wave 0 |
| CLI-03 | readiness lines + not-ready messaging (D-04) | integration | same | ❌ Wave 0 |
| CLI-03 | QR encoder is a correct, stable pure function | unit | `npx vitest run test/unit/qr.test.mjs` | ❌ Wave 0 (new file) |
| CLI-03 | README + llms.txt document `appo preview` | integration | `npx vitest run test/integration/docs.test.mjs` | ✅ edit (add 'preview', delete forbid-assertion) |

### Testing the verb (mockFetch harness — clone read-verbs.test.mjs)
- **Path + env:** `installMockFetch({status:200, body:{ios_testflight_url:..., preview_ready:{ios:true,android:false}, preview_url:'https://x/p/tok'}})`; `run(['preview','7','--api','http://test.local'])`; assert `lastRequest().path` matches `/api/v1/apps/7/preview$` and method `GET`. (NOTE: body is FLAT, no `data` wrapper — matches the verified payload.)
- **--json verbatim:** stub a flat body; `run(['preview','7','--json',...])`; assert `JSON.parse(lines.join('')) ).toEqual(body)` AND that output contains no block glyphs (`expect(out).not.toMatch(/[▀▄█]/)`).
- **404 exit 1:** `installMockFetch({status:404, body:{error:'not_found',...}})`; assert `result === 1` (renderError path; human mode prints an Error line).
- **missing id exit 2:** silence `console.error`, `run(['preview',...API])` → `2`.
- **readiness D-04:** stub `preview_ready:{ios:false,android:false}`; assert output matches `/not preview-ready yet/` for both AND `/no preview target yet/` (QR skipped); stub `{ios:true,...}` and assert a block glyph IS present.

### Testing the QR encoder as a pure function (test/unit/qr.test.mjs — NEW)
Assert "scannable" *structurally* without a camera:
- **Stable module count:** `QrCode.encodeText('https://example.com/preview/TESTTOKEN', Ecc.MEDIUM).size` equals a known integer for a fixed input → guards against encoder regressions (snapshot the `size`).
- **Finder patterns present:** the three 7×7 finder patterns at corners (top-left, top-right, bottom-left) are spec-mandatory. Assert `getModule(0,0)===true`, the finder ring structure (dark border, light gap, dark 3×3 core) at each corner. A code missing finders cannot scan — this is the strongest camera-free "scannable" proxy.
- **Timing patterns:** row 6 / column 6 alternate dark/light — assert a few alternating cells.
- **Quiet zone in `renderQr`:** assert the first/last 4 text rows of `renderQr(url)` are all-space (quiet zone present) and that output width == `size + 8`.
- **Stable render snapshot:** `expect(renderQr('https://example.com/preview/TESTTOKEN')).toMatchSnapshot()` — pins the exact block art for a known URL (regression guard). Snapshot the bare matrix render, NOT the ANSI-wrapped variant (ANSI codes make brittle snapshots).
- **Width bound (Pitfall 2):** assert `renderQr(longUrl).split('\n')[0].length <= 80` for a representative preview URL.

### Sampling Rate
- **Per task commit:** `npx vitest run test/unit/qr.test.mjs test/integration/read-verbs.test.mjs`
- **Per wave merge:** `npm test` (full vitest suite)
- **Phase gate:** Full suite green + `npm run lint` + `npm run typecheck` (the `tsc --checkJs` gate the vendored `src/qr.mjs` must pass) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `test/unit/qr.test.mjs` — covers CLI-03 (encoder correctness: size, finders, timing, quiet zone, snapshot)
- [ ] `test/integration/read-verbs.test.mjs` — add preview cases (path, --json, 404, missing-id, readiness)
- [ ] `test/integration/docs.test.mjs` — add `'preview'` to COMMANDS; **delete** the forbid-assertion
- [ ] No framework install needed (vitest present); no new fixtures (mockFetch covers it)

## Security Domain

> `security_enforcement` not explicitly false — minimal applicable surface for a read verb.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Reuses `apiFetch` Bearer-PAT; token never logged [VERIFIED: src/api.mjs] |
| V3 Session Management | no | Stateless PAT, no session |
| V4 Access Control | yes (backend) | Backend 404s non-owned apps (no existence leak) [VERIFIED: V1PreviewController::resolveOwnedApp] |
| V5 Input Validation | minimal | `<id>` is path-interpolated server-side; backend validates ownership/existence |
| V6 Cryptography | no | No crypto in the CLI; preview token minted server-side |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token leak in QR/output | Info disclosure | The `preview_url`/deeplink CONTAIN a preview token by design (that's the open-on-device mechanism) — this is intended, not a leak. The PAT (auth token) is never printed [VERIFIED: api.mjs never logs token] |
| Resource-existence leak | Info disclosure | Backend returns 404 (not 403) for non-owned apps [VERIFIED] |

## Sources

### Primary (HIGH confidence)
- `apps-web-app/app/Support/PreviewResolver.php` — exact `preview_ready` shape `{ios:bool, android:bool}`, non-null `preview_url`, nullable URLs
- `apps-web-app/app/Http/Controllers/Api/V1/V1PreviewController.php` — flat payload (no `data` envelope), 404 for non-owned
- `apps-web-app/app/Http/Controllers/Api/V1/Concerns/RendersV1Envelope.php` — 404 envelope shape
- `apps-web-app/routes/api_v1.php` line 65 — `apps.preview.show` route (ability USER)
- `appo/src/{ops,cli,api}.mjs`, `test/helpers/mockFetch.mjs`, `test/integration/{read-verbs,docs}.test.mjs` — verb/test patterns
- nayuki.io/page/qr-code-generator-library + GitHub `nayuki/QR-Code-generator` qrcodegen.ts — MIT, API, ~800 lines, zero deps

### Secondary (MEDIUM confidence)
- github.com/mdp/qrterminal, github.com/dawndiy/qrcode-terminal#4 — half-block rendering + forced ANSI contrast
- qrwolf.com / qrlynx.com — quiet-zone (4-module) requirement (ISO 18004)

### Tertiary (LOW confidence)
- None load-bearing.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — backend payload read from source; encoder license/API verified via GitHub
- Architecture: HIGH — verb is a verified clone of existing `status`/`rejection`/`getApp` patterns
- Pitfalls: HIGH — the two highest-risk items (preview_ready shape, preview_url non-null) verified against source; QR-scan contrast flagged for an implementation-time real-device check (D-02)

**Research date:** 2026-06-15
**Valid until:** ~30 days (stable surfaces; backend shipped, encoder stable). Re-verify only if apps-web-app changes PreviewResolver.
