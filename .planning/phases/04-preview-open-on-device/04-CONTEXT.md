# Phase 4: Preview / open-on-device - Context

**Gathered:** 2026-06-15 (--auto)
**Status:** Ready for planning

<domain>
## Phase Boundary

`appo preview <id>` lets a user open their app on a device from the terminal — prints the iOS
TestFlight URL + Android custom-scheme deeplink + per-platform readiness, and renders a scannable
QR pointing at the preview target — at parity with the `preview_app` MCP tool. UNBLOCKED: apps-web-app
Phase 188 shipped the user-PAT preview surface (`GET /api/v1/apps/{app}/preview`, ability USER) +
`PreviewAppTool`.

In scope: the `preview` verb, the `ops.getPreview` call, a vendored dependency-free terminal QR
encoder, per-platform readiness messaging, `--json`, and exit codes. Out of scope: the admin
deeplink-create endpoint (`POST /apps/{app}/preview/deeplink` — admin tooling, not the user-PAT
read surface), and re-publishing (the npm publish remains the user's outward action).

**Carrying forward (locked):** RUNTIME dependency-free (`files: [bin, src, README]`, zero `dependencies`);
the ops layer + env threading (Phase 3 — every ops call forwards `env`); `--json` = verbatim v1 body
(D-08); `renderError` for blocked/error states; exit-code taxonomy 0/1/2.
</domain>

<decisions>
## Implementation Decisions

### Endpoint & parity (CLI-03 SC1/SC3)
- **D-01:** `appo preview <id>` → `GET /api/v1/apps/{id}/preview` (ability USER). Response (parity with
  `preview_app` MCP — same backend source of truth): `{ ios_testflight_url, android_deeplink,
  preview_url, preview_ready }`. Add `getPreview(apiBase, id, env)` to `src/ops.mjs` (env-threaded like
  the other ops); new `case 'preview'` in `src/cli.mjs`. `<id>` is required (consistent with `status`).

### Terminal QR — dependency-free (CLI-03 SC2)
- **D-02:** The QR is rendered by a **vendored, self-contained encoder** added as `src/qr.mjs` — our
  own bundled source, NOT an npm dependency (honors the RUNTIME dependency-free non-negotiable). It
  encodes a URL to a QR matrix and prints it to the terminal using Unicode block characters
  (e.g. half-block `▀`/`▄` or full-block) so it scans from a phone camera. The researcher MUST source a
  compact, correct, MIT/public-domain QR implementation to vendor + adapt (with attribution), and verify
  a rendered code actually scans.
- **D-03:** The QR encodes `preview_url` (the preview target). If `preview_url` is absent/not ready,
  skip the QR and print a clear "no preview target yet" line instead of erroring.

### Output & readiness (CLI-03 SC1/SC4)
- **D-04:** Human output prints, in order: per-platform readiness (from `preview_ready`), the iOS
  TestFlight URL, the Android deeplink, the `preview_url`, then the QR. When a platform is NOT
  preview-ready, print a clear "iOS/Android: not preview-ready yet" line rather than a blank/url-less field.
- **D-05:** `--json` emits the raw v1 response body verbatim (D-08) — no QR, no curation.

### Exit codes
- **D-06:** Reuse the taxonomy: `0` success; `1` error — a `404` (non-owned / not found) renders via
  `renderError` (or a clear "app not found or not preview-ready" line), exit 1; `2` usage (missing `<id>`).

### Claude's Discretion
- QR module density/format (half-block vs full-block; quiet-zone width) — pick what scans reliably.
- Exact readiness wording; whether to also show `preview_url` when only one platform is ready.
- Whether `preview_ready` is a per-platform object or a boolean (researcher confirms from the resource) and the printout shape that follows.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.** Paths relative to this repo;
backend in the sibling `apps-web-app` (Phase 188).

### Parity source of truth — backend (`apps-web-app`)
- `../apps-web-app/app/Http/Controllers/Api/V1/V1PreviewController.php` — `show()`: the `GET /apps/{app}/preview`
  response `{ ios_testflight_url, android_deeplink, preview_url, preview_ready }`; 404 for non-owned apps; owner resolution.
- `../apps-web-app/app/Mcp/Tools/PreviewAppTool.php` — `preview_app` parity (same four fields; non-destructive).
- `../apps-web-app/routes/api_v1.php` §line 64-65 — the `apps.preview.show` route + its USER ability.
- (The preview value object behind `$preview->iosTestflightUrl`/`previewReady` — confirm the exact
  `preview_ready` type/shape, per-platform vs boolean.)

### This repo
- `src/ops.mjs` — add `getPreview` (env-threaded, like getApp/getBuild); `unwrap` for the data envelope.
- `src/cli.mjs` — `case 'preview'`; reuse `renderError`, the `--json` verbatim pattern, env resolution; extend USAGE.
- `src/api.mjs` — `apiFetch` (the transport ops wrap).
- `.planning/PROJECT.md` (RUNTIME dependency-free non-negotiable), `.planning/REQUIREMENTS.md` (CLI-03).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ops.getApp`/`getBuild` (`src/ops.mjs`) are the exact analog for `getPreview` (GET + unwrap + env).
- `renderError`, the `--json` verbatim short-circuit, and `printRejection`/`printBuild` printers in `src/cli.mjs` are the templates for the preview printer.
- The Phase 5 vitest harness (`test/helpers/mockFetch.mjs` + APPO_CONFIG_HOME isolation) covers the new verb; the QR encoder gets pure-function unit tests (known input → known matrix).

### Established Patterns
- Single `switch (command)` dispatcher; read verbs: usage-guard → exit 2; `--json` verbatim before curation; env threaded from `activeProfileName(flags.env)`.

### Integration Points
- New `src/qr.mjs` (vendored encoder) + `src/ops.mjs` `getPreview` + `src/cli.mjs` `case 'preview'` + USAGE.
- README/llms.txt updated to add `appo preview` (currently omitted — it was deferred).

</code_context>

<specifics>
## Specific Ideas

- The scannable QR is what makes `preview` feel native in a terminal — it must actually scan, so the
  vendored encoder's correctness (and a sane quiet-zone + block rendering) is the load-bearing detail.
- Output should read consistently with the `preview_app` MCP payload so a user moving between the CLI,
  the dashboard, and an agent sees the same four fields.

</specifics>

<deferred>
## Deferred Ideas

- `POST /apps/{app}/preview/deeplink` (admin deeplink minting) — admin tooling, not the user-PAT read surface; out of scope.
- A `--qr-only`/`--open` (auto-open TestFlight) convenience — nice-to-have; not required by CLI-03.
- Re-documenting `appo preview` is IN scope here (README/llms.txt add it); the npm publish itself stays the user's outward action.

None of the above (except the docs add) were treated as in-scope — discussion stayed within the preview boundary.

</deferred>

---

*Phase: 04-preview-open-on-device*
*Context gathered: 2026-06-15*
