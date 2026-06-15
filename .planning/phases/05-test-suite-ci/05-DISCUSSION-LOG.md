# Phase 5: Test suite & CI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 05-test-suite-ci
**Mode:** --auto (recommended defaults; no interactive questions)
**Areas discussed:** Test runner (vitest migration), Unit/integration split, Lint, Typecheck-for-JS, CI workflow, devDeps vs dependency-free

---

## Test runner

| Option | Description | Selected |
|--------|-------------|----------|
| Migrate node:test → vitest (preserve all 122 assertions) | Roadmap-literal (SC1 "Vitest unit tests") + matches @appolabs/sdk | ✓ |
| Keep node:test, add CI around `npm test` | Violates SC1 (explicitly vitest); diverges from SDK | |
| Run both runners | Two toolchains, no benefit | |

**Choice:** Migrate to vitest; mechanical port (globals + expect); reuse fetch stub + APPO_CONFIG_HOME; zero coverage loss.

## Unit / integration split

| Option | Description | Selected |
|--------|-------------|----------|
| `test/unit/` + `test/integration/`, scripts mirror SDK | SC1 unit + SC2 integration, SDK-parity scripts | ✓ |
| Flat, single suite | Doesn't express the SC1/SC2 distinction | |

**Choice:** unit (arg parse, config, login SM, ship orch — mocked) + integration (run() over command surface vs mock).

## Lint

| Option | Description | Selected |
|--------|-------------|----------|
| eslint + .eslintrc.json (match SDK), target bin/src/test | Convention parity with the sibling | ✓ |
| Skip lint | Fails SC3/SC4 | |

**Choice:** eslint matching SDK config style + ruleset (+ eslint-config-prettier); JS targets.

## Typecheck for a JS project

| Option | Description | Selected |
|--------|-------------|----------|
| `tsc --noEmit` with allowJs/checkJs tsconfig + JSDoc | Same command shape as SDK; stays JS; satisfies SC4 | ✓ |
| Convert src to TypeScript | Large churn; changes the shipped artifact | |
| Skip typecheck | Fails SC4 | |

**Choice:** checkJs typecheck via tsc --noEmit; JSDoc only where needed; no TS conversion.

## GitHub Actions CI

| Option | Description | Selected |
|--------|-------------|----------|
| ci.yml mirroring SDK (push/PR main+master) → install→lint→typecheck→test; npm; no build; node matrix 18/20/22 | SDK-shaped, adapted to a dependency-free npm CLI; tests the >=18 floor | ✓ |
| Exact SDK copy (pnpm, node 20, build step) | pnpm/build don't apply to a raw-.mjs npm CLI | |

**Choice:** mirror SDK shape; npm + no build step + node matrix (forced divergences documented in D-10).

## devDeps vs dependency-free non-negotiable

| Option | Description | Selected |
|--------|-------------|----------|
| vitest/eslint/typescript as devDependencies only; runtime stays zero-dep | Honors the RUNTIME non-negotiable; dev tooling never ships | ✓ |

**Choice:** devDependencies only; `files: [bin,src,README]` + zero `dependencies` unchanged; commit package-lock for `npm ci`.

## Claude's Discretion

- eslint rule specifics / config form (eslintrc vs flat) to match SDK.
- `test/unit`+`test/integration` vs `tests/` rename (keep `test/`).
- JSDoc depth for checkJs.
- Optional coverage report.

## Deferred Ideas

- Coverage thresholds — optional, not required by CLI-04.
- Prettier format CI step — not required.
- Release automation / npm publish — Phase 6.
- preview tests — Phase 4 (deferred/blocked).
