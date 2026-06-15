# Phase 5: Test suite & CI - Context

**Gathered:** 2026-06-15 (--auto)
**Status:** Ready for planning

<domain>
## Phase Boundary

Automated coverage + CI for the `appo` CLI, matching `@appolabs/sdk` conventions: a **vitest**
unit + integration suite (covering arg parsing, the config/profiles store, the device-flow login
state machine, and the `appo ship` orchestration with HTTP mocked), integration tests over the
command surface against a mock API, a **GitHub Actions** workflow running lint + typecheck + tests
on push/PR, and passing **lint + typecheck**.

In scope: migrating the existing 122-case `node:test` suite to vitest with no coverage loss, the
unit/integration split, eslint, a JS typecheck, the CI workflow, and the dev-tooling devDependencies.
Out of scope: new runtime features, `appo preview` (Phase 4), packaging/npm publish (Phase 6),
runtime dependencies (the published CLI stays zero-dep).

**Carrying forward (locked):** the CLI is RUNTIME dependency-free — `package.json` `files: [bin, src,
README]` ships zero deps; this is a non-negotiable. The existing test harness is strong: a
`globalThis.fetch` stub (`test/helpers/mockFetch.mjs`), per-test config isolation via
`APPO_CONFIG_HOME` (lazy `configPath()`), and `stubToken` save/restore. 122 tests pass today.
</domain>

<decisions>
## Implementation Decisions

### Test runner — migrate to vitest (CLI-04 SC1)
- **D-01:** Adopt **vitest** as the test runner (roadmap-literal + `@appolabs/sdk` convention:
  `"test": "vitest run"`). Migrate all 9 existing `node:test` files to vitest, **preserving every
  assertion — zero coverage regression** (baseline 122 cases must all carry over).
- **D-02:** The migration is mechanical: `import { test } from 'node:test'` → vitest globals
  (`describe`/`it`/`test`/`expect`, `beforeEach`/`afterEach` from `vitest`); `node:assert/strict`
  → vitest `expect` (`assert.equal`→`toBe`, `assert.match`→`toMatch`, `assert.deepEqual`→`toEqual`,
  `assert.doesNotMatch`→`not.toMatch`). The `globalThis.fetch` stub and `APPO_CONFIG_HOME`
  isolation in `test/helpers/mockFetch.mjs` carry over unchanged (plain JS, runner-agnostic).
- **D-03:** The `--test-concurrency=1` constraint is a node:test artifact (shared globals across
  files in one process). Vitest isolates each test FILE in its own worker (separate
  `globalThis`/module graph), so cross-file collision is gone by default — keep per-test
  `beforeEach` config isolation; rely on vitest's per-file isolation instead of a serial flag.
  (Researcher: confirm vitest's default `isolate: true` / pool gives each file its own globalThis.)

### Unit / integration split (CLI-04 SC1 + SC2)
- **D-04:** Organize into `test/unit/` and `test/integration/`, mirroring the SDK's
  `test`/`test:integration` scripts:
  - **unit** (SC1): arg parsing (`parseArgs`), config/profiles store (`config.mjs`), the device-flow
    login state machine (`login.mjs` poll loop), and `ship` orchestration (`pollBuild`/ops, HTTP mocked).
  - **integration** (SC2): drive `run()` end-to-end across the command surface against the mock fetch
    (the existing `ship`/`auth-cli`/`*-verbs` flow tests are integration-flavored and move here).
- **D-05:** package.json scripts mirror the SDK: `"test": "vitest run"`,
  `"test:integration": "vitest run test/integration/"`, `"test:watch": "vitest"`.

### Lint (CLI-04 SC3/SC4)
- **D-06:** eslint, matching the SDK's `.eslintrc.json` config style. Lint targets the CLI's JS:
  `bin/`, `src/`, `test/` (`.mjs`/`.js`). Pin eslint to the SDK's major for config-format parity
  (researcher: confirm the SDK's eslint version; `.eslintrc.json` is legacy/eslint-8-style — if the
  pinned major is eslint 9, either keep eslintrc via `ESLINT_USE_FLAT_CONFIG=false` or use a flat
  `eslint.config.js`; prefer whatever matches the SDK).
- **D-07:** Reuse the SDK's ruleset where applicable (JS-recommended + prettier-compat via
  `eslint-config-prettier`); no Prettier auto-format step is required by the success criteria.

### Typecheck for a JS project (CLI-04 SC4)
- **D-08:** Keep the CLI as JS (no TS conversion). Add a `tsconfig.json` with
  `{ allowJs: true, checkJs: true, noEmit: true, strict-ish, module/target for Node ≥18 ESM }` and
  run **`tsc --noEmit`** as the typecheck — same command shape as the SDK, applied to `.mjs` via
  JSDoc/inference. Add JSDoc type annotations only where needed to make the check pass cleanly.

### GitHub Actions CI (CLI-04 SC3)
- **D-09:** `.github/workflows/ci.yml` mirroring the SDK's (triggers: `push`/`pull_request` on
  `main` + `master`; steps: checkout → setup-node (cache npm) → `npm ci` → **lint → typecheck → test**).
- **D-10:** Differences from the SDK workflow, by necessity: use **npm** (the CLI is npm-based:
  `npm test`, `npm i -g @appolabs/appo`), **no build step** (the CLI ships raw `.mjs` — no bundler),
  and a **Node version matrix `[18, 20, 22]`** (the CLI declares `engines.node >=18`, so test the
  floor) — this extends the SDK's single node-20 job. CI must be green.

### devDependencies vs the dependency-free non-negotiable
- **D-11:** vitest, eslint (+ config), and typescript are added as **`devDependencies` only**. The
  published package's `files: [bin, src, README]` and its zero `dependencies` are unchanged — the
  RUNTIME-dependency-free non-negotiable is preserved; dev tooling never ships. A `package-lock.json`
  is introduced (first dependencies) and committed for reproducible `npm ci` in CI.

### Claude's Discretion
- Exact eslint rule selections and any `.eslintignore`/flat-config form (match SDK where sensible).
- Whether unit/integration live in `test/unit`+`test/integration` vs a `tests/` rename (keep `test/`).
- JSDoc depth needed to satisfy `tsc --checkJs`.
- Whether to also add a coverage report (`vitest run --coverage`) — optional, not required by SC.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.** Paths relative to this repo;
the sibling SDK is the convention source.

### Convention source — `@appolabs/sdk` (mirror these)
- `../sdk/package.json` — scripts (`vitest run`, `test:integration`, `test:watch`, `lint`, `typecheck`)
  and the dev-dependency set (vitest, eslint, @typescript-eslint/*, eslint-config-prettier, typescript).
- `../sdk/.github/workflows/ci.yml` — CI shape to mirror (triggers main+master; install→lint→typecheck→test→build).
- `../sdk/.eslintrc.json` — the lint config style to match (adapt rules for JS/.mjs).
- `../sdk/tsconfig.json` (if present) — typecheck config reference (adapt to `allowJs`/`checkJs`).

### This repo (what gets covered / migrated)
- `package.json` — current `"test": "node --test --test-concurrency=1 ..."`, `engines.node >=18`,
  `files: [bin, src, README]` (zero runtime deps — must stay).
- `test/*.test.mjs` (9 files, 122 cases) + `test/helpers/mockFetch.mjs` — the suite to migrate to
  vitest and split into unit/integration; the fetch-stub + `APPO_CONFIG_HOME` isolation to preserve.
- `src/cli.mjs` (`parseArgs`, the `run()` switch), `src/config.mjs` (profiles store), `src/login.mjs`
  (device-flow state machine), `src/ops.mjs` + `pollBuild` (ship orchestration) — the unit targets in SC1.

### This repo (planning)
- `.planning/PROJECT.md` — RUNTIME dependency-free non-negotiable.
- `.planning/REQUIREMENTS.md` — CLI-04.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `test/helpers/mockFetch.mjs` — runner-agnostic `globalThis.fetch` stub (FIFO/single responses,
  `lastRequest`/`requests`, `stubToken` save/restore, `APPO_CONFIG_HOME` isolation). Carries into vitest unchanged.
- The `captureLog`/`captureAll`/`silentRun` helpers in the test files are plain functions — portable to vitest.
- 122 existing assertions are the migration's regression guard: the vitest suite must reach ≥122 equivalent cases.

### Established Patterns
- Per-test `beforeEach` sets `APPO_CONFIG_HOME` to an `mkdtemp` dir; `afterEach` restores env + resets the fetch stub.
- Tests drive the public `run(argv)` and the exported units (`parseArgs`, `pollBuild`, config/login fns).

### Integration Points
- New: `vitest` (+ optional `vitest.config.*`), `eslint` (+ config), `typescript` (+ `tsconfig.json`),
  `.github/workflows/ci.yml`, `package-lock.json`. package.json `scripts` + `devDependencies` updated.
- No `src/` runtime changes expected beyond JSDoc additions needed for `tsc --checkJs`.

</code_context>

<specifics>
## Specific Ideas

- "Matching `@appolabs/sdk` conventions" is the explicit north star — same script names, same CI shape,
  same lint/typecheck commands — so a developer moving between the SDK and the CLI sees one toolchain.
  The only deliberate divergences (npm not pnpm, no build step, JS typecheck via checkJs, node matrix)
  are forced by the CLI being dependency-free raw `.mjs` rather than a bundled TS package.
- The migration must be a true port, not a rewrite: every existing assertion has earned its place
  across Phases 1-3 (confirm-gate invariants, PAT-leak sweeps, profile isolation) — none may be dropped.

</specifics>

<deferred>
## Deferred Ideas

- Coverage reporting / thresholds (`vitest --coverage`) — optional, not required by CLI-04; add later if desired.
- Prettier auto-format CI step — not required; eslint-config-prettier avoids rule conflicts without enforcing format.
- Release automation (`release.yml`, npm publish on tag) — **Phase 6** (packaging & release).
- `appo preview` tests — Phase 4 (preview is deferred/blocked on apps-web-app Phase 188).

None of the above were treated as in-scope — discussion stayed within the test-suite/CI boundary.

</deferred>

---

*Phase: 05-test-suite-ci*
*Context gathered: 2026-06-15*
