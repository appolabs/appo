# Milestone B Handoff: self-serve `test` builds (appo CLI)

**Status:** Design-stage seed — pending the Milestone B roadmap in apps-web-app.
**Source of truth:** `apps-web-app/docs/superpowers/specs/2026-06-23-dev-self-serve-build-and-download-design.md`
**Build this in `../appo`'s own GSD** once the apps-web-app REST `test`-build endpoint exists. Do not implement ahead of that endpoint.

## What the CLI gains

A `self_managed` developer triggers a native `test` (download) build and fetches the installable — no staff in the loop. This is the **`test`** primitive, distinct from the `publish` build (operator-internal, intentionally absent from the agent surface per the 189/191 boundary). Keep that distinction in command naming and help text.

## Commands to add

- `appo build [--platform ios|android]` — trigger a `test` build. Asynchronous: the trigger returns immediately; the artifact is ready in minutes. "Instant" means instant trigger, not instant artifact — poll or notify, then download.
- `appo download` — fetch the artifact once ready (`artifact_url`).
- First-run **iOS device registration** — a QR/registration link opened on the iPhone (`eas device:create`-style), one-time per device, re-run when adding a device. Zero Apple login for the dev; Appo's internal account signs.

All three are thin adapters over the apps-web-app REST `test`-build endpoint + capability resolver — the CLI re-derives no policy. Gating is `self_managed`-only; surface a clear error for `appo_managed` apps.

## Naming / parity constraints

- The MCP counterpart is named distinctly from the removed `trigger_build` (e.g. `request_test_build`) to avoid tripping the inventory guard. Keep CLI verbs consistent with that intent (download scope, not the operator publish build).
- `docs/CROSS-SURFACE-PARITY.md` (apps-web-app) will carry a **build → test** row (CLI · MCP · REST, `self_managed`) separate from **build → publish** (operator-internal). Align the CLI command set to that row.

## Account / cost note

`test` builds require **no developer Apple account and no $99** — signing is always Appo's internal account (confirmed against the apps-web-app credential resolver). The only iOS step is device registration. A dev who *opts in* to connecting their own Apple account gets their own device pool (ceiling-strategy layer 2) — a future capability, not required for the base flow.

## Open items (resolve during apps-web-app Milestone B planning)

- Final REST endpoint shape + the MCP/CLI command names.
- Confirm-gate on `appo build` — likely none (building is reversible); reconsider if UDID/resource consumption warrants a light gate.
- Device-registration UX and storage.
