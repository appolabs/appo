# Phase 2: `appo ship` orchestrated lifecycle (killer feature) - Pattern Map

**Mapped:** 2026-06-15
**Files analyzed:** 3 (1 new module, 1 modify, 1 new test)
**Analogs found:** 3 / 3 (all in-repo, exact role match)

This phase adds NO new API surface. Every analog already exists in `src/cli.mjs`,
`src/api.mjs`, and the `test/` harness. The work is: extract an ops layer, refactor
the existing `case` blocks onto it without behavior change (the 67-test suite is the
regression guard), and add one `case 'ship'` orchestrator that composes those ops.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| NEW `src/ops.mjs` | service (transport layer) | request-response (thin async over `apiFetch`) | inline `apiFetch(...)` calls in `src/cli.mjs` case blocks + `unwrap` (cli.mjs:93-95) | exact (extract-in-place) |
| MODIFY `src/cli.mjs` (`case 'ship'`) | controller (orchestrator) | streaming + polling (event-loop over `getBuild`) | `case 'publish'` (cli.mjs:349-363) for gate; `case 'build'` (cli.mjs:319-331) for trigger; `case 'status'` (cli.mjs:276-286) for poll/get | role-match + new mechanism (poll loop is genuinely new) |
| MODIFY `src/cli.mjs` (refactor Phase 1 cases) | controller (refactor) | request-response | the cases themselves (call ops instead of inline `apiFetch`) | exact (in-place edit) |
| NEW `test/ship.test.mjs` | test | request-response + sequence (FIFO) | `test/write-verbs.test.mjs` + `test/destructive-verbs.test.mjs` | exact (same harness) |

## Pattern Assignments

### `src/ops.mjs` (NEW — service / transport, request-response)

**Analog:** the inline `apiFetch(...)` calls already in `src/cli.mjs`, plus the
`unwrap` helper at `src/cli.mjs:93-95`. Each op is a 1:1 extraction of a call the
verbs already make — same method, same path, same body shape. No console, no exit
codes, no arg parsing.

**Import pattern** — ops import only `apiFetch`; nothing else (cli.mjs:1-3 shows the
existing import style; ops needs just one):
```js
import { apiFetch } from './api.mjs';
```

**`unwrap` — ONE definition (D-02 "no dual definitions").**
Currently at `src/cli.mjs:93-95`:
```js
function unwrap(payload) {
  return payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
}
```
Plan decision: move `unwrap` into `ops.mjs`, `export` it, and import it back into
`cli.mjs` (the curated printers in `cli.mjs` still call `unwrap` on raw `status`
responses). Do NOT leave two copies.

**Op extraction — each maps verbatim to an existing inline call:**

| Op | Extracted from (cli.mjs) | Method + path (verbatim) | Body shape (verbatim) | Returns |
|----|--------------------------|--------------------------|------------------------|---------|
| `createApp(apiBase, {name, base_url, metadata_name, metadata_description})` | `case 'apps'/create` lines 235-238 | `POST /api/v1/apps` | `{name, base_url}` + optional `metadata_name`/`metadata_description` | `unwrap(...)` → AppResource (`.id`) |
| `triggerBuild(apiBase, id, {platform, branch})` | `case 'build'` lines 321-324 | `POST /api/v1/apps/${id}/builds` | `{}` + optional `platform`/`branch` | `unwrap(...)` → AppBuildResource (`.id`, `.status`) |
| `getApp(apiBase, id)` | `case 'status'` line 280-281 | `GET /api/v1/apps/${id}` | — | `unwrap(...)` → AppResource |
| `getBuild(apiBase, id, buildId)` | `case 'status'` line 279-281 | `GET /api/v1/apps/${id}/builds/${buildId}` | — | `unwrap(...)` → AppBuildResource (`.status`) |
| `publishApp(apiBase, id, app_stores)` | `case 'publish'` line 359 | `POST /api/v1/apps/${id}/publish` | `{app_stores}` | raw (204 → `null`); resolving == success |

**Core pattern** (mirrors the verified RESEARCH.md ops module, lines 227-263). Body
is built conditionally exactly as the current cases do — e.g. `case 'apps'/create`
lines 235-237 and `case 'build'` lines 321-323:
```js
// createApp — extracted from cli.mjs:235-238
export async function createApp(apiBase, { name, base_url, metadata_name, metadata_description }) {
  const body = { name, base_url };
  if (metadata_name) body.metadata_name = metadata_name;
  if (metadata_description) body.metadata_description = metadata_description;
  return unwrap(await apiFetch(apiBase, 'POST', '/api/v1/apps', body));
}

// triggerBuild — extracted from cli.mjs:321-324 (body starts {}, conditional adds)
export async function triggerBuild(apiBase, id, { platform, branch } = {}) {
  const body = {};
  if (platform) body.platform = platform;
  if (branch) body.branch = branch;
  return unwrap(await apiFetch(apiBase, 'POST', `/api/v1/apps/${id}/builds`, body));
}

// publishApp — extracted from cli.mjs:359; 204 -> apiFetch returns null. Do NOT unwrap.
export async function publishApp(apiBase, id, app_stores) {
  return apiFetch(apiBase, 'POST', `/api/v1/apps/${id}/publish`, { app_stores });
}
```

**Error handling pattern:** none in ops. `apiFetch` (`src/api.mjs:29-38`) already
throws an `Error` carrying `err.status` + `err.envelope` on non-2xx, and returns
`null` on 204 (`src/api.mjs:23-25`). Ops do not catch — the caller (`case 'ship'`
or the verb) handles. This is exactly how the current cases behave (they let throws
propagate to the top-level `try/catch → renderError` at cli.mjs:403-405).

---

### `src/cli.mjs` — refactor Phase 1 cases (controller, request-response)

**Critical constraint (D-02):** refactoring must NOT change behavior. The 67-test
suite (`npm test`) is the regression guard. After refactor, every existing test in
`write-verbs.test.mjs` / `destructive-verbs.test.mjs` must still pass unchanged —
they assert on `lastRequest().method/path/body` (e.g. write-verbs.test.mjs:47-51,
60-66; destructive-verbs.test.mjs:84-88), and ops produce the identical request.

**How to refactor a case onto an op WITHOUT behavior change — the exact mechanical edit:**

Before (`case 'apps'/create`, cli.mjs:235-238):
```js
const body = { name: flags.name, base_url: flags.url };
if (flags['meta-name']) body.metadata_name = flags['meta-name'];
if (flags['meta-desc']) body.metadata_description = flags['meta-desc'];
const app = unwrap(await apiFetch(apiBase, 'POST', '/api/v1/apps', body));
```
After:
```js
const app = await ops.createApp(apiBase, {
  name: flags.name, base_url: flags.url,
  metadata_name: flags['meta-name'], metadata_description: flags['meta-desc'],
});
```
The arg-parse guard (`if (!flags.name || !flags.url) return 2`, cli.mjs:231-234),
the printer (`printApp`, line 240), and the exit code (line 241) stay in the case —
**only the HTTP call moves to the op.** Same edit for:
- `case 'build'` (cli.mjs:324) → `ops.triggerBuild(apiBase, sub, {platform: flags.platform, branch: flags.branch})`; keep the `--json` passthrough (line 325) and the human print (line 329).
- `case 'status'` (cli.mjs:281) → `ops.getApp` / `ops.getBuild` per the `flags.build` branch. **Watch the `--json` passthrough** (cli.mjs:282): it prints the RAW envelope `res`, not `unwrap(res)`. The status case currently calls `apiFetch` directly and JSON-prints `res` before unwrapping. If `ops.getApp` returns unwrapped data, the `--json` verbatim contract (prints `{data:...}`) breaks. Plan decision: for `status`, either keep the direct `apiFetch` for the `--json` path, OR have ops expose the raw envelope. Simplest non-breaking option: leave `case 'status'` calling `apiFetch` directly (it is a read with a verbatim-envelope `--json` requirement) and only route the WRITE/create/build/publish calls through ops. Confirm in the plan; the regression test `status --json` (implied by D-08) pins this.
- `case 'publish'` (cli.mjs:359) → `ops.publishApp(apiBase, sub, stores)`; keep `confirmGate` (line 357), the `--json` "null" passthrough (line 360), and the human print (line 361).

**Imports pattern** — add an ops import alongside the existing three (cli.mjs:1-3):
```js
import * as ops from './ops.mjs';   // or named: { createApp, triggerBuild, getBuild, publishApp }
```
Import `unwrap` from ops too if it is moved there.

---

### `src/cli.mjs` — `case 'ship'` orchestrator (controller, streaming + polling)

**Analog (gate):** `case 'publish'` (cli.mjs:349-363) — the publish step reuses the
SAME `confirmGate` + `printPreview`. The gate decision is verbatim:
```js
// cli.mjs:357-358 — ship's publish step mirrors this exactly
const gated = confirmGate(flags, { will: 'publish', app_id: Number(sub), target_stores: stores });
if (gated !== null) return gated;   // exit 3, NO write
```
**`--yes` vs `--confirm`:** `confirmGate` (cli.mjs:157) keys off `flags.confirm`.
Ship's `--yes` is the pipeline confirm (D-10). Plan: accept both — normalize
`flags.confirm = flags.confirm || flags.yes` before calling `confirmGate`, OR build
a synthetic flags object. Do NOT weaken the gate: no `--yes`/`--confirm` ⇒ no POST,
exit 3, even under `--json` (RESEARCH Pitfall 5).

**Analog (stores parsing):** `case 'publish'` (cli.mjs:353-356) — copy the alias map
verbatim (apple→apple_appstore, google→google_playstore), but ship defaults to BOTH
canonical tokens when `--stores` is absent (D-05):
```js
// cli.mjs:353-355 (alias map) + RESEARCH.md:456-460 (default-both)
function parseStores(raw) {
  if (!raw || raw === true) return ['apple_appstore', 'google_playstore'];
  return String(raw).split(',').map(s => s.trim()).filter(Boolean)
    .map(s => s === 'apple' ? 'apple_appstore' : s === 'google' ? 'google_playstore' : s);
}
```

**Analog (blocked-state render):** `renderError` (cli.mjs:171-182) — the build
trigger's `prerequisite_failed` (APPLE_CREDENTIALS_MISSING etc.) and publish's
APP_BLOCKED both route through it. In human mode let the throw fall to the top-level
`try/catch → renderError` (cli.mjs:403-405); in `--json` mode catch locally to emit
one ledger object (RESEARCH.md:451, A4 / Open Q1). The renderer already prints
`Blocked: ...` / `Next: <next_action> -> <dashboard_url>` (cli.mjs:173-178).

**Core pattern — poll loop (THE one genuinely new mechanism).** No analog exists in
the repo; build per RESEARCH.md Pattern 2 (lines 266-290). Two non-negotiable shape
requirements that make it testable:
1. **Injectable `sleep`** — a parameter defaulting to `(ms)=>new Promise(r=>setTimeout(r,ms))`; tests pass `async()=>{}`.
2. **Injectable `intervalMs` / `timeoutMs`** — so the timeout test sets `timeoutMs:0`.

Terminal strings are VERIFIED (RESEARCH.md:84-90, D-07): success = `ready`,
failure = `failed`. Match nothing else.
```js
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pollBuild(apiBase, appId, buildId, {
  intervalMs = 5000, timeoutMs = 1_800_000, sleep = realSleep, onChange = () => {},
} = {}) {
  const start = Date.now();
  let last = null;
  for (;;) {
    const build = await ops.getBuild(apiBase, appId, buildId);
    const status = build?.status;
    if (status !== last) { onChange(status, build); last = status; }   // stream only on change (D-06)
    if (status === 'ready')  return { outcome: 'ready', build };
    if (status === 'failed') return { outcome: 'failed', build };
    if (Date.now() - start >= timeoutMs) return { outcome: 'timeout', build, last_status: status };
    await sleep(intervalMs);
  }
}
```

**Core pattern — step ledger + exit map (D-11/12/13).** One ledger drives both human
stream and `--json` (RESEARCH.md:292-311). Exit map is the single source of truth:
```js
const EXIT = { shipped: 0, gated: 3, blocked: 1, failed: 1 };  // usage error 2 returned before any step
```

**Usage-guard pattern (exit 2):** mirror every Phase 1 case's first lines (e.g.
cli.mjs:231-234, 277, 350) — guard to stderr + `return 2` BEFORE any HTTP. Ship's
guard: neither `<id>` positional nor (`--url` AND `--name`) ⇒ exit 2, no request
(RESEARCH.md:393-397).

The full orchestrator skeleton is in RESEARCH.md:390-461 — the planner should cite
it directly as the implementation reference.

---

### `test/ship.test.mjs` (NEW — test, request-response + FIFO sequence)

**Analog:** `test/write-verbs.test.mjs` (build call assertions) +
`test/destructive-verbs.test.mjs` (gate/exit-3/blocked assertions). Same harness,
same helpers, same shape.

**Boilerplate to copy verbatim** (write-verbs.test.mjs:1-38 — identical header):
```js
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/cli.mjs';
import { installMockFetch, resetMockFetch, lastRequest, requests, stubToken } from './helpers/mockFetch.mjs';
// captureLog (write-verbs.test.mjs:13-23), silentRun (25-34), captureAll (destructive-verbs.test.mjs:26-39)
afterEach(() => resetMockFetch());
const API = ['--api', 'http://test.local'];
```
Reuse `captureLog` for stdout, `captureAll` (destructive-verbs.test.mjs:26-39) when
asserting on `renderError` stderr (blocked path), `silentRun` for usage-error
branches.

**THE key pattern — FIFO poll sequence** (mockFetch.mjs:29-59; FIFO at line 49 — the
queue `shift()`s while >1 entry remains, then sticks on the last). A ship run issues
create(if new) → build → getBuild × N → publish, consuming the queue in order:
```js
test('ship --yes runs create->build->poll(ready)->publish, exit 0, final_state shipped', async () => {
  stubToken();
  installMockFetch([
    { status: 201, body: { data: { id: 5 } } },                       // createApp
    { status: 202, body: { data: { id: 12, status: 'queued' } } },    // triggerBuild
    { status: 200, body: { data: { status: 'building' } } },          // getBuild #1
    { status: 200, body: { data: { status: 'building' } } },          // getBuild #2
    { status: 200, body: { data: { status: 'ready' } } },             // getBuild #3 -> terminal
    { status: 204 },                                                  // publishApp (204)
  ]);
  const { result } = await captureLog(() =>
    run(['ship', '--url', 'https://x', '--name', 'X', '--yes', ...API]));
  assert.equal(result, 0);
  // last request is the publish POST:
  const req = lastRequest();
  assert.equal(req.method, 'POST');
  assert.match(req.path, /\/api\/v1\/apps\/5\/publish$/);
});
```

**Injectable sleep / interval / timeout** — the orchestrator must accept these so the
test never waits. Two options the plan must pick one of: (a) thread an options object
through `run()` for tests, or (b) expose `pollBuild` as a named export and unit-test
it directly with `sleep: async()=>{}`. RESEARCH.md:522 / Wave-0 gap 2 flags this as a
code-shape requirement. Option (b) keeps `run()` clean and is the lower-risk path —
unit-test `pollBuild` for sequence/timeout, integration-test `run(['ship', ...])` for
the happy/gate/exit-code paths with a no-op interval injected via the same export.

**Test cases to cover (RESEARCH.md:530-538, CLI-06):**

| Behavior | Assert | Analog test |
|----------|--------|-------------|
| happy path create→build→ready→publish(--yes) | exit 0, publish POST issued | write-verbs build test (47-51) |
| poll observes building→building→ready | proceeds to publish (FIFO sequence) | — (new; FIFO at mockFetch.mjs:49) |
| build status `failed` | exit 1, fix-recipe/rejection hint printed | write-verbs prereq test (86-105) |
| poll timeout (`timeoutMs:0`, one `building`) | exit 1, `appo status <id> --build <id>` hint | — (new) |
| no `--yes` stops at publish preview | exit 3, NO publish POST, `requests.length` excludes publish | destructive publish gate (58-64) |
| build prerequisite_failed (APPLE_CREDENTIALS_MISSING) | exit 1, Blocked + dashboard_url, app_id surfaced | resubmit blocked test (167-183) via `captureAll` |
| missing both `<id>` and `--url`/`--name` | exit 2, `requests.length === 0` | configure no-flag test (160-166) |
| `--json` emits ONE `{steps, final_state}` object | `JSON.parse(lines.join(''))` has `steps[]` + `final_state` | build `--json` test (68-75) |

**Concurrency note (RESEARCH Pitfall 7):** these tests MUST run under
`npm test` (which pins `--test-concurrency=1`, package.json). The shared
`globalThis.fetch` + module-level `requests[]` (mockFetch.mjs:14, 35) collide under
bare `node --test`. Do not add a parallel-safe harness this phase — Phase 5 owns
that. Just keep the same serial invocation.

## Shared Patterns

### Confirm-gate (reused verbatim — NEVER weakened)
**Source:** `confirmGate` (src/cli.mjs:157-165), exported at cli.mjs:184.
**Apply to:** ship's publish step.
```js
function confirmGate(flags, preview) {
  if (flags.confirm) return null;
  if (flags.json) {
    console.log(JSON.stringify({ ...preview, confirm_required: true }));
  } else {
    printPreview(preview);
  }
  return 3;
}
```
Ship maps `--yes`→`confirm:true` for the publish op ONLY (D-10). No `--yes` ⇒ exit 3,
no POST — proven by destructive-verbs.test.mjs:58-64 (`requests.length === 0`).

### Blocked-state rendering (reused verbatim)
**Source:** `renderError` (src/cli.mjs:171-182), exported at cli.mjs:184.
**Apply to:** build-trigger `prerequisite_failed`, publish `APP_BLOCKED`.
```js
const env = err.envelope;
if (env?.error === 'prerequisite_failed') {
  console.error(`\n  Blocked: ${env.message}`);
  if (env.details?.dashboard_url) {
    console.error(`  Next: ${env.details.next_action} -> ${env.details.dashboard_url}\n`);
  }
  return 1;
}
```

### Preview rendering (reused verbatim)
**Source:** `printPreview` (src/cli.mjs:140-151) — already renders `will`, `app_id`,
`target_stores` (the exact fields ship's publish preview uses) + the "(no write
performed — re-run with --confirm to proceed)" notice (line 150).
**Apply to:** ship's gated publish step.

### Arg parsing (reused as-is)
**Source:** `parseArgs` (src/cli.mjs:45-78). Already handles `--k v`, `--k=v`,
`--flag` (boolean true), and the `--` sentinel (WR-02). Covers all ship flags
(`--url`, `--name`, `--stores`, `--platform`, `--yes`, `--confirm`, `--timeout`,
`--json`, `--meta-name`, `--meta-desc`). No parser changes needed.

### Transport (wrapped, not duplicated)
**Source:** `apiFetch` (src/api.mjs:7-41). Auth (line 8-11), envelope, 204→null
(23-25), non-2xx throw with `err.status`/`err.envelope` (29-37). Every op wraps this;
nothing in ops or ship re-implements fetch. **PAT discipline:** the poll repeats
`getBuild`; never log `init.headers` / the Bearer token in any stream or JSON line
(RESEARCH Pitfall 4, PROJECT non-negotiable).

### USAGE text (extend in place)
**Source:** `USAGE` const (src/cli.mjs:5-39). Add the two `ship` forms under
Lifecycle, the `--yes`/`--timeout`/`--stores` flags under Options, and note the
ship exit-code mapping (the 0/1/2/3 block at cli.mjs:34-38 already documents the
taxonomy; ship's D-13 final-state mapping is consistent with it). ASCII only, neutral
repo-doc voice (CLAUDE.md): use `->`, not unicode arrows.

## No Analog Found

| Item | Role | Data Flow | Reason | Where to get the pattern |
|------|------|-----------|--------|--------------------------|
| poll loop (`pollBuild`) | service | polling/event-loop | First waiting behavior in the CLI; every prior verb is single-shot (`case 'build'` line 327 explicitly "never poll/wait") | RESEARCH.md Pattern 2 (lines 266-290) — VERIFIED terminal enum |
| step ledger + `--json` summary object | controller | aggregation | Phase 1 `--json` is verbatim-envelope passthrough; ship emits its OWN summary (D-12) | RESEARCH.md Pattern 3 (lines 292-311) |
| final-state→exit-code map | controller | — | ship maps a multi-step lifecycle, not a single verb outcome | RESEARCH.md:310, D-13 |

These three are the only genuinely new code in the phase. Everything else is
extraction or reuse of test-pinned existing code.

## Metadata

**Analog search scope:** `src/` (cli.mjs, api.mjs, config.mjs), `test/` (helpers +
write-verbs + destructive-verbs).
**Files scanned:** 7 (all required-reading + destructive-verbs.test.mjs).
**Pattern extraction date:** 2026-06-15
**Regression guard:** `npm test` (67 tests, must stay green after the D-02 refactor).
