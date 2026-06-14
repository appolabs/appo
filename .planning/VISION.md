# Vision & Cross-Repo Bridge — @appolabs/appo

> Read this first when working the CLI from a `../appo`-rooted session. The
> strategic memory and most contracts live in the sibling `apps-web-app` repo
> (the "product brain"); this file carries the slice the CLI needs so you don't
> lose the thread when you switch repos.

## What this repo is

`@appolabs/appo` — the Appo CLI. A **satellite implementation repo**. The product
brain is `../apps-web-app` (backend, dashboard, MCP agent surface, the roadmap,
the strategic memory). This repo only implements the terminal/agent surface over
that backend's public contract.

## The goal that drives the roadmap

**Both surfaces — the CLI and the `/mcp` agent surface — must drive the complete
user flow:** auth → create → configure → build → status → preview → publish →
push → rejection/fix/resubmit. The MCP side reached parity when `create_app`
shipped (apps-web-app Phase 186). This repo brings the CLI to the same parity and
fronts it with the killer feature.

**Killer feature: `appo ship`** (Phase 2) — one command takes a URL from zero to
submitted, streaming each lifecycle step. It's the reason the CLI exists over raw
API calls. Everything else is the surface it orchestrates.

## Contracts to mirror (read across, do not duplicate semantics)

All in `../apps-web-app`:
- `routes/api_v1.php` + `app/Http/Controllers/Api/V1/*` — the `/api/v1` lifecycle the CLI calls.
- `routes/ai.php` + `app/Http/Controllers/Oauth/DeviceCodeController.php` — the RFC 8628 device grant `appo login` uses.
- `app/Mcp/Servers/AppoServer.php` + `app/Mcp/Tools/*` — the 10 MCP operator tools the CLI must reach parity with (the canonical command set).
- `app/Support/PublicationStateResolver.php` + `app/Http/Resources/V1/AppResource.php` — the response shapes (publication_state / primary_action / stores) the CLI prints.
- `app/Http/Requests/Api/V1/App/StoreRequest.php` — create validation (name + reachable base_url).

## Cross-repo dependencies & seams

- **Phase 4 (preview)** is BLOCKED on apps-web-app **Phase 188** (user-PAT preview
  surface + `preview_app` MCP tool). It's deferrable / off this milestone's
  critical path — ship it when 188 lands.
- **Cross-surface parity verification** (the proof that CLI and MCP truly do the
  same things) lives in apps-web-app **Phase 187**, not here — it spans both repos.
- The seam between the repos is the **`/api/v1` contract** (kept drift-free by
  `composer spec:check` on the apps-web-app side).

## Execution rule

Build the CLI **from this repo** (commits land here). Plan/research agents read
the apps-web-app contracts sideways via `../apps-web-app/...`. Do strategy/vision
thinking in the apps-web-app session, where the project memory lives.

## Memory note

Strategic memory (Appo positioning, vision rev-2, the publishing-operator thesis)
is namespaced to the apps-web-app project and will NOT auto-surface in a
`../appo`-rooted session. If you need it, open an apps-web-app session or read
its committed `.planning/` docs.

---
*Bootstrapped 2026-06-14 from the apps-web-app session.*
