---
status: partial
phase: 04-preview-open-on-device
source: [04-VERIFICATION.md]
started: 2026-06-15T14:23:34Z
updated: 2026-06-15T14:23:34Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Real-phone QR scan (Manual-Only, out of CI scope — D-02)
expected: Run `appo preview <id>` for a preview-ready app and point a phone camera at the terminal QR. The camera opens the `preview_url`. The code scans in BOTH light and dark terminal themes, due to the forced black-on-white ANSI contrast wrapping applied per row in the printer (`\x1b[30;47m … \x1b[0m`).
result: deferred — to be covered by a full-pipeline (create→build→publish→preview) UAT against prod with a real app/token. Partial validation done 2026-06-15: rendered the real `renderQr()`+printer ANSI output for a `goappo.io/preview/<token>` URL (structurally valid QR, contrast applied); confirmed against live prod that `goappo.io/preview/<token>` is a real route (307 → `/en/preview/<token>`) and that a non-existent token correctly returns 404. Real server-minted-token render still to be scanned in the whole-pipe UAT.

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
