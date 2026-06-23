# Handoff: apps-web-app v3.3 — CLI build / download / device-registration (AGT-02)

**Source:** apps-web-app milestone **v3.3 Dev self-serve build + download**.
**Design:** `apps-web-app/docs/superpowers/specs/2026-06-23-dev-self-serve-build-and-download-design.md` (Milestone B).
**Status:** Not started — handoff stub. Plan as a NEW phase in this repo's own GSD (current milestone v0.2; this would be the next phase, e.g. 08) **after** the apps-web-app backend endpoints land.

## Scope for `../appo` (this repo)

Add the CLI surface for self-serve `test` builds — adapters over the apps-web-app backend, not new machinery:

- `appo build [--platform ios|android]` — trigger a `test`-kind build for a `self_managed` app.
- `appo download` — fetch the resulting installable artifact (`artifact_url`).
- First-run **iOS device registration** — open a QR/registration link on the iPhone (one-time per device).

## Decisions already locked (do not relitigate)

- The `test`-build trigger is **ungated** — no `--confirm` flag (building is reversible, produces a throwaway artifact). This differs from `publish`/`push` which keep confirm gating.
- **No `build` verb for `publish`.** The publish-kind build stays operator-internal and unreachable from the CLI (preserves the v3.1 boundary / Apple 5.2.1 model). `appo build` triggers `test` only.
- iOS path is **ad-hoc** (signs under Appo's internal ASC account against the dev's registered UDID — zero Apple login for the dev). iOS `build` requires a registered device first; surface that flow.
- TestFlight fallback is **not built** this milestone.

## Depends on (apps-web-app, must land first)

- **Phase 197** — build `kind` (test/publish) + per-platform signing resolver.
- **Phase 198** — v1 REST `test`-build trigger (`self_managed`-gated, ungated) + download endpoint (`SSB-01`, `DL-01`).
- **Phase 199** — iOS device registration + UDID storage (`DEV-01`), iOS ad-hoc `.ipa` (`PLAT-02`).
- **Phase 200** — MCP `request_test_build` (reference for arg shape / parity).

Plan this phase only after the endpoint contracts exist — the exact request/response shapes (trigger route, download route, device-registration link) are defined by those backend phases. Planning earlier is guesswork.

## Parity note

This is the CLI half of the v3.3 build→test parity row. apps-web-app **Phase 202** adds the `build → test` row to `CROSS-SURFACE-PARITY.md` (CLI · MCP · REST, `self_managed`), distinct from `build → publish` (operator-internal, absent on the agent surface). Keep the CLI behavior consistent with that row.
