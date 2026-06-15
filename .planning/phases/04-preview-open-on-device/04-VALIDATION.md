---
phase: 4
slug: preview-open-on-device
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-15
---

# Phase 4 — Validation Strategy

> Validation = the vitest suite covers the `preview` verb + the vendored QR encoder, plus lint + typecheck green.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (Phase 5 toolchain) + the `mockFetch` stub harness |
| **Quick/Full** | `npm test` · `npm run lint` · `npm run typecheck` |
| **Runtime** | ~2-4s (HTTP mocked; QR encoder is pure/synchronous) |

## Sampling Rate
- After each task: `npm test`. Before verify: `npm test` + lint + typecheck green; `node bin/appo.mjs preview` exits 2 (usage); `--help` + README + llms.txt list `preview`.

## Per-Task Verification Map

| Behavior | Req | Type | Command | Notes |
|----------|-----|------|---------|-------|
| `ops.getPreview(apiBase,id,env)` calls `GET /api/v1/apps/{id}/preview` with env token | CLI-03 | unit | `npm test` | assert stubbed fetch method+path+Authorization(env) |
| `appo preview <id>` prints TestFlight URL + Android deeplink + per-platform readiness (preview_ready {ios,android}) | CLI-03 (SC1/SC3) | unit | `npm test` | flat payload (no data envelope); fields match preview_app |
| Scannable QR rendered for preview_url | CLI-03 (SC2) | unit | `npm test` | `renderQr(url)` pure; assert module count + 3 finder patterns present + 4-module quiet zone (snapshot the bare matrix, not ANSI) |
| QR skipped with a clear message when NEITHER platform ready | CLI-03 (SC4) | unit | `npm test` | gate on readiness `(ios||android)`, NOT url presence (preview_url never null) |
| per-platform "not preview-ready" messaging | CLI-03 (SC4) | unit | `npm test` | ios/android false → clear line |
| `--json` emits raw v1 body verbatim (no QR) | CLI-03 | unit | `npm test` | flat object passthrough |
| 404 (non-owned/not found) → renderError, exit 1; missing id → exit 2 | CLI-03 | unit | `npm test` | reuse renderError; usage-guard |
| vendored `src/qr.mjs` is dependency-free + correct | CLI-03 (SC2) | unit | `npm test` | Nayuki qrcodegen (MIT) encodeText; known URL → stable size/matrix |
| README + llms.txt document `preview`; docs.test.mjs updated | CLI-03 | doc | `npm test` | DELETE the stale "preview NOT documented" assertion; add 'preview' to COMMANDS |

## Wave 0 Requirements
- [ ] `src/qr.mjs` vendored (Nayuki qrcodegen, MIT header + attribution) + `renderQr(text)` half-block renderer
- [ ] `test/unit/qr.test.mjs` (pure encoder: size, finder patterns, quiet zone, stable matrix)
- [ ] `test/unit/preview.test.mjs` (verb: fields, readiness, --json, 404, usage)
- [ ] Update `test/integration/docs.test.mjs` — remove the deferred-preview assertion, add `preview`

## Manual-Only
| Behavior | Why Manual | How |
|----------|-----------|-----|
| The rendered QR actually scans on a phone | needs a camera | render a real preview URL in a terminal, scan with a phone — confirm it resolves (D-02 contrast/quiet-zone) |

## Sign-Off
- [ ] `npm test` green (incl. new qr + preview tests); lint + typecheck exit 0
- [ ] runtime `dependencies` still empty (vendored QR is our source, not a dep)
- [ ] README + llms.txt list `appo preview`; docs.test.mjs no longer asserts it's undocumented
- [ ] `nyquist_compliant: true` once the suite is green

**Approval:** pending
