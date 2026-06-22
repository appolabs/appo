# Phase 7: Ship-intent surface + config rescope - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-22
**Phase:** 07-ship-intent-surface
**Mode:** `--auto` (Claude selected recommended defaults; no interactive questions)
**Areas discussed:** ship reshape, build-transport removal, apps update rescope, `--icon` contract, docs/tests

---

## Context

A complete CONTEXT.md from 2026-06-16 already existed and was validated against the live
codebase and the (now-shipped) cross-repo backend. This session's work was verification +
folding in the concrete contracts that Phase 190 of `apps-web-app` landed, which previously
sat under "Claude's Discretion".

**Cross-repo dependency check (the one genuinely open item):**
- `apps-web-app` Phase 189 (build off the user surface) — **complete 2026-06-21**. Verified: v1 `POST /builds` → 405, legacy → 404, status reads retained.
- `apps-web-app` Phase 190 (config lock + `set_icon`) — **complete 2026-06-22**. Verified: v1 `PATCH /apps/{app}` user surface locked to name+base_url; new `POST /api/v1/apps/{app}/icon` with `{icon_url}` in/out, SSRF-guarded.
- Verified `StartPublication::run()` → `publicationStarted()` requires no prior build, so D-01's publish-intent path is sound.

---

## ship reshape (D-01)

| Option | Description | Selected |
|--------|-------------|----------|
| create + publish-intent, no build/poll, return immediately | Reuse `ops.publishApp` as the intent signal | ✓ |
| keep a client-side build wait | Poll until staff build completes | |

**Choice:** create + publish-intent (recommended default; already locked, code + backend confirm).

## build-transport removal (D-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Delete `triggerBuild` + `pollBuild`, keep status reads | No CLI path hits `/builds` POST | ✓ |
| Retain `pollBuild` unregistered | Dead code kept "just in case" | |

**Choice:** delete both; status reads (`getApp`/`getBuild`) stay (recommended default).

## apps update rescope (D-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Drop `--meta-name`/`--meta-desc`, keep name/url, add `--icon` | Matches Phase 190 user-surface field lock | ✓ |
| Keep metadata flags | Backend silently ignores them now | |

**Choice:** drop metadata flags (recommended default; backend ignores them).

## `--icon` contract (D-04)

| Option | Description | Selected |
|--------|-------------|----------|
| `--icon <https URL>` → new `ops.setIcon` → `POST /apps/{app}/icon` (separate from PATCH) | Matches Phase 190-02 endpoint exactly | ✓ |
| `--icon` folded into the PATCH body | Wrong — icon is a distinct SSRF-guarded endpoint | |
| `--icon <file>` multipart upload | Backend takes a fetchable URL only | |

**Choice:** https image URL via a separate `POST /icon` op (resolved from Claude's Discretion to concrete, given the shipped Phase 190-02 contract). Both-given ordering: PATCH then POST /icon; 422 rides `renderError`.

## docs/tests/exit-codes (D-05)

**Choice:** update ship/write/docs integration tests, delete `pollBuild` units, refresh README + llms.txt, keep the exit-code taxonomy; gate green.

---

## Claude's Discretion (left open for planning)

- Exact `ship` success message + tracking hint (recommended: "submitted — Appo will build and submit it" + `appo status <id>`).
- `ship --json` ledger shape (recommended: shorter `{steps:[create,publish], final_state}`).
- Whether to fully delete `pollBuild` (recommended: delete).

## Deferred Ideas

- Client-side build/preview wait in `ship` — rejected (builds are staff-async).
- Multipart file-upload icon input — out of scope (URL-only endpoint).
