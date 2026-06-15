# Phase 6: Packaging, docs & release - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 06-packaging-docs-release
**Mode:** --auto (recommended defaults; no interactive questions)
**Areas discussed:** Publish metadata, --version, upgrade/update-check, scaffolder, docs+llms.txt, release workflow, publish-autonomy boundary

---

## Publish-ready metadata

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror SDK: publishConfig.access:public + repository/homepage/bugs/keywords + prepublishOnly gate | Scoped-package publish parity with the sibling | ✓ |
| Minimal (name/version/bin only) | `npm publish` of a scoped pkg fails without access:public; weak discoverability | |

**Choice:** full SDK-style metadata; prepublishOnly = lint+typecheck+test (no build); llms.txt added to files.

## `appo --version`

| Option | Description | Selected |
|--------|-------------|----------|
| `--version`/`-v` reads package.json (dependency-free) | Standard; satisfies SC3 | ✓ |
| Hardcode version string | Drifts from package.json | |

**Choice:** read version from package.json relative to bin; print `appo/<v> node/<v>`.

## upgrade / update-check

| Option | Description | Selected |
|--------|-------------|----------|
| `appo upgrade` (npm i -g @latest) + minimal daily cached update-check notice | Both halves of SC3; notice is non-blocking | ✓ |
| Update-check notice only | No one-command upgrade | |
| upgrade only | Misses passive "you're behind" signal | |

**Choice:** `appo upgrade` (must) + lightweight cached notice (nicety, skipped on --json/network error).

## Scaffolder

| Option | Description | Selected |
|--------|-------------|----------|
| `appo init` subcommand (config bootstrap + first login) | No second package; reuses login | ✓ |
| Separate `create-appo` package | Extra artifact to publish/maintain | |

**Choice:** `appo init` in this package; device or `--token` login; idempotent (no clobber).

## Docs + llms.txt

| Option | Description | Selected |
|--------|-------------|----------|
| Rewrite README (full surface, ship-first) + llms.txt in SDK shape | Covers every command incl. ship; agent-facing condensed doc | ✓ |
| Keep MVP README | Missing ship/build/publish/env/etc. — fails SC4 | |

**Choice:** README single source (install→init→ship quickstart + full reference + env/exit-codes/profiles); llms.txt links into README anchors.

## Automated release

| Option | Description | Selected |
|--------|-------------|----------|
| release.yml mirroring SDK (master push → patch-bump → tag → npm publish --provenance via id-token → GH Release); npm, no build | Trusted publishing (no NPM_TOKEN); convention parity | ✓ |
| Manual `npm publish` only | No reproducible/automated release | |

**Choice:** SDK-shaped release.yml; OIDC trusted publishing; npm; no build step.

## Publish / release autonomy boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Build + verify via `npm pack` dry-run; NEVER run npm publish / push a release tag autonomously | Outward irreversible action stays the user's explicit go-ahead | ✓ |

**Choice:** executor prepares + verifies the release machinery only; first real publish is the user's action.

## Claude's Discretion

- Keyword list, README section order.
- Whether the update-check notice ships in v0.1 or defers (SC3 met by upgrade regardless).
- `appo init` prompts/flags beyond bootstrap+login.
- llms.txt granularity.

## Deferred Ideas

- Separate `create-appo` package — superseded by `appo init`.
- Richer update-check (auto-upgrade/channels) — out of scope.
- `appo preview` docs — Phase 4 (deferred/blocked).
- Homebrew/other channels — npm only for v0.1.
