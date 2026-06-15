# Phase 4: Preview / open-on-device - Discussion Log

> **Audit trail only.** Decisions are captured in CONTEXT.md.

**Date:** 2026-06-15
**Phase:** 04-preview-open-on-device
**Mode:** --auto (recommended defaults; no interactive questions)
**Unblocked:** apps-web-app Phase 188 shipped the user-PAT preview surface + `preview_app` MCP tool.
**Areas:** Endpoint/parity, terminal QR (dependency-free), output/readiness, --json/exit codes.

---

## Endpoint & parity
| Option | Selected |
|--------|----------|
| `appo preview <id>` → GET /apps/{id}/preview via ops.getPreview (env-threaded); parity with preview_app MCP | ✓ |
| Resolve a default app (no id) | — (keep `<id>` required, consistent with status) |

## Terminal QR (the load-bearing decision)
| Option | Selected |
|--------|----------|
| Vendor a compact zero-dep QR encoder as src/qr.mjs (our source) + Unicode-block output | ✓ |
| Add a `qrcode` npm dependency | — (violates RUNTIME dependency-free non-negotiable) |
| Shell out to system `qrencode` | — (not portable, not guaranteed installed) |
| Skip the QR, print URL only | — (fails SC2 "scannable QR rendered") |

**Choice:** vendored dep-free encoder (researcher sources a minimal correct MIT/public-domain impl to adapt + attribute); encodes preview_url.

## Output & readiness
| Option | Selected |
|--------|----------|
| Print per-platform readiness + TestFlight + deeplink + preview_url + QR; clear "not ready" lines (SC4); --json verbatim | ✓ |

## Exit codes
| Option | Selected |
|--------|----------|
| 0 ok / 1 error (404 not-found/not-ready via renderError) / 2 usage | ✓ |

## Deferred
- Admin POST /preview/deeplink (admin tooling) — out of scope.
- --open/--qr-only conveniences — out of scope.
- README/llms.txt add `appo preview` — IN scope (docs were missing it).
