# Phase 6: Packaging, docs & release - Context

**Gathered:** 2026-06-15 (--auto)
**Status:** Ready for planning

<domain>
## Phase Boundary

Make `@appolabs/appo` publishable, self-updating, and documented (the final v0.1 phase): publish-ready
package metadata + an automated npm release workflow, a `appo init` scaffolder (config bootstrap +
first login), `appo --version` and `appo upgrade` (+ a light update-check notice), and a full README +
command reference + `llms.txt` covering every command including `appo ship` — matching `@appolabs/sdk`
conventions.

In scope: package.json publish metadata, `.github/workflows/release.yml`, `appo init`, `--version`,
`appo upgrade`/update-check, README rewrite, `llms.txt`, and `npm pack` dry-run verification. Out of
scope: new lifecycle features, `appo preview` (Phase 4, deferred/blocked), and **the actual `npm
publish` / release tag** (an outward irreversible action — see D-08).

**Carrying forward (locked):** RUNTIME dependency-free — `files: [bin, src, README]`, zero `dependencies`
(dev tooling stays devDeps); MIT license; the vitest/lint/typecheck gates from Phase 5; the full verb
surface (ship/build/status/publish/push/configure/rejection/fix-recipe/resubmit, login/logout/whoami,
apps *, env list/use) from Phases 1-3 + auth profiles.
</domain>

<decisions>
## Implementation Decisions

### Publish-ready package metadata (CLI-05 SC1)
- **D-01:** Add to package.json, mirroring the SDK: `publishConfig: { access: "public" }` (required —
  `@appolabs/appo` is a scoped package), `repository` (`git+https://github.com/appolabs/appo.git`),
  `homepage` (`…/appo#readme`), `bugs` (`…/appo/issues`), `keywords` (e.g. appo, cli, mobile, app-store,
  publishing, ship, ios, android), and `author`. `description` + `license: MIT` already present.
- **D-02:** Add a `prepublishOnly` publish gate running `npm run lint && npm run typecheck && npm test`
  (the SDK runs `npm run build`; we have no build — substitute the quality gates). Add `llms.txt` to the
  `files` array so it ships with the package. Confirm via `npm pack` that the tarball contains only
  `bin/`, `src/`, `README.md`, `llms.txt`, `package.json` — no tests/.planning/dev configs.

### `appo --version` (CLI-05 SC3)
- **D-03:** `appo --version` / `-v` prints the package version read from package.json (dependency-free —
  read it relative to `bin/appo.mjs`, e.g. via `createRequire`/`readFileSync` of `../package.json`).
  Format `appo/<version> node/<process.version>`. Handled in the arg layer before command dispatch.

### `appo upgrade` + update-check (CLI-05 SC3)
- **D-04:** `appo upgrade` spawns `npm install -g @appolabs/appo@latest` via `child_process` and reports
  the outcome (and the new version). Plain, explicit, user-invoked.
- **D-05:** A lightweight, best-effort **update-check notice**: at most once per day (cache the last-check
  timestamp + latest-known version in `~/.appo/config.json`), compare the installed version to the npm
  registry `latest`; if behind, print a one-line `update available: vX → vY (run: appo upgrade)` notice to
  stderr. Non-blocking, never on `--json` output, silently skipped on any network error. (SC3 is satisfied
  by `appo upgrade` alone; the notice is the nicety — keep it minimal / opt-out-able.)

### Scaffolder — `appo init` (CLI-05 SC2)
- **D-06:** Implement the scaffolder as an **`appo init` subcommand in THIS package**, not a separate
  `create-appo` package (avoids publishing/maintaining a second artifact). `appo init` bootstraps config
  (ensures `~/.appo` exists, owner-only) and runs first login — device flow by default, or `--token <pat>`
  for non-interactive — then confirms with a `whoami`. Idempotent: re-running on an already-configured
  env reports the active env rather than clobbering (honors the no-clobber profiles rule).

### Documentation (CLI-05 SC4)
- **D-07:** Rewrite `README.md` to cover the full surface: install (`npm i -g @appolabs/appo`), a
  **ship-first quickstart** (`appo ship` is the headline), `appo init`, the complete command reference
  for every verb (with flags), env vars (`APPO_TOKEN`/`APPO_ENV`/`APPO_API_BASE`), the documented exit
  codes (0/1/2/3), multi-environment profiles, and non-interactive/CI auth. Generate `llms.txt` in the
  SDK's shape (`# @appolabs/appo` + one-line tagline + sectioned links into README anchors), enumerating
  every command incl. `ship` — the agent-facing condensed doc. README is the single source; `llms.txt`
  links into it.

### Automated release (CLI-05 SC1)
- **D-08:** Add `.github/workflows/release.yml` mirroring the SDK's: trigger on push to `master`/`main`;
  read current version, auto patch-bump if that version is already tagged; run lint → typecheck → test
  (NO build step); create the `vX.Y.Z` tag; `npm publish --provenance --access public` via **trusted
  publishing** (`permissions: id-token: write` — OIDC, no `NPM_TOKEN` secret); create a GitHub Release
  with generated notes. Use npm (not pnpm).

### Publish / release autonomy boundary (NON-NEGOTIABLE for the executor)
- **D-09:** `npm publish` and pushing a release tag are **outward, irreversible, public** actions. This
  phase BUILDS and VERIFIES the release machinery — including a `npm pack` dry-run to inspect the tarball —
  but the executor MUST NOT run `npm publish`, push a `vX.Y.Z` tag, or otherwise publish autonomously. The
  first real release is the user's explicit action (merging to master triggers `release.yml`, or a manual
  publish). One-time user setup (configure npm trusted-publishing for the GitHub repo) is documented, not performed.

### Claude's Discretion
- Exact keyword list and README section ordering.
- Whether the update-check notice ships in v0.1 or is deferred (SC3 met by `appo upgrade` regardless).
- `appo init`'s exact prompts/flags beyond config-bootstrap + login.
- `llms.txt` granularity (per-command vs per-group anchors).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.** Paths relative to this repo;
the sibling SDK is the convention source.

### Convention source — `@appolabs/sdk` (mirror these)
- `../sdk/package.json` — `publishConfig.access:public`, `repository`/`homepage`/`bugs`/`keywords`, prepublish gate shape.
- `../sdk/.github/workflows/release.yml` — the release workflow to mirror (master push → version-tag guard →
  patch-bump → lint/typecheck/test → tag → `npm publish --provenance --access public` via `id-token` → GH Release).
- `../sdk/llms.txt` — the llms.txt format (`# title` + `> tagline` + `## section` README-anchor links).
- `../sdk/README.md` — README structure/voice reference.

### This repo (what gets packaged/documented)
- `package.json` — current fields (name `@appolabs/appo`, `bin.appo`, `files:[bin,src,README]`, `type:module`,
  `engines.node>=18`, MIT, scripts) — add the publish metadata + prepublishOnly + llms.txt to files (D-01/D-02).
- `bin/appo.mjs`, `src/cli.mjs` — where `--version` (D-03), `appo init` (D-06), `appo upgrade` (D-04) wire in;
  the USAGE block to extend; the full verb surface to document.
- `src/config.mjs` — `appo init` config bootstrap + the update-check cache (D-05/D-06).
- `src/login.mjs` — first-login reused by `appo init`.
- `README.md` — the MVP-era README to rewrite (currently documents only login + apps; missing ship/build/etc.).

### This repo (planning)
- `.planning/PROJECT.md` — RUNTIME dependency-free non-negotiable; the per-phase summaries are the command inventory for docs.
- `.planning/REQUIREMENTS.md` — CLI-05.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/login.mjs` `login()`/`loginWithToken()` — reused by `appo init` for first login (device + `--token`).
- `src/config.mjs` `readConfig`/`writeProfile`/`configPath` — `appo init` config bootstrap + the update-check cache.
- `parseArgs` in `src/cli.mjs` already supports `--key=value`/`--`/value-less flags — `--version`/`-v` slot in.
- The Phase-2/3 SUMMARY/CONTEXT files are the authoritative command inventory for the README/llms.txt.

### Established Patterns
- Single `switch (command)` dispatcher; USAGE constant; exit-code taxonomy 0/1/2/3 (already documented in USAGE).
- Owner-only config writes; `child_process` already used (`exec` for opening the browser in login.mjs) — `upgrade` reuses it.

### Integration Points
- `--version`/`-v` handled in `run()` before dispatch (like `--help`); new `case 'init'`, `case 'upgrade'`;
  USAGE extended. package.json metadata + `.github/workflows/release.yml` + `README.md` + `llms.txt` are new/rewritten files.
- The update-check notice hooks into `run()` (post-command, non-`--json`, best-effort) reading/writing the config cache.

</code_context>

<specifics>
## Specific Ideas

- `appo ship` is the headline of the README and `llms.txt` — the install→`appo init`→`appo ship` path is the
  one-screen story for a new user, and the agent-facing `llms.txt` makes the full lifecycle legible to tools.
- "Matching `@appolabs/sdk` conventions" continues here: same publish metadata, same trusted-publishing release
  flow, same llms.txt format — so the CLI and SDK present one coherent `@appolabs` packaging story. Forced
  divergences (npm not pnpm, no build step) carry over from Phase 5.

</specifics>

<deferred>
## Deferred Ideas

- A separate `create-appo` npm package — superseded by `appo init` (D-06); revisit only if a non-installed
  bootstrap (`npm create appo`) is wanted later.
- Richer update-check (auto-upgrade, release-channel selection) — out of scope; v0.1 ships `appo upgrade` + a notice.
- `appo preview` docs — Phase 4 (deferred/blocked on apps-web-app Phase 188); add to README when it ships.
- Homebrew / other distribution channels — npm only for v0.1.

None of the above were treated as in-scope — discussion stayed within the packaging/docs/release boundary.

</deferred>

---

*Phase: 06-packaging-docs-release*
*Context gathered: 2026-06-15*
