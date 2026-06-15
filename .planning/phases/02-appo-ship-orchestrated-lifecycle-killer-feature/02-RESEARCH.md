# Phase 2: `appo ship` — orchestrated lifecycle (KILLER FEATURE) - Research

**Researched:** 2026-06-15
**Domain:** Dependency-free Node CLI orchestrator composing the Phase 1 verbs into one create→build→poll→publish lifecycle, with a dependency-free poll loop, step streaming, a single human/`--json` code path, and lifecycle-state exit codes.
**Confidence:** HIGH — the build-status enum, create body, publish/build/resubmit failure envelopes, and the public state mapper were read verbatim from the sibling backend (`../apps-web-app`). The reuse-layer shape and poll/stream design are derived from the current `src/cli.mjs` + the existing `node:test`/`globalThis.fetch` harness, both read directly.

## Summary

Ship is an **orchestrator, not a new API surface**. Every HTTP call it makes already exists as a Phase 1 verb. The work is (1) extracting those calls into a reusable `src/ops.mjs` layer so `ship` and the single verbs share one definition each (D-01/D-02), (2) a dependency-free poll loop over `getBuild` until a terminal status, (3) streaming each step in human mode while accumulating a `{steps[], final_state}` object for `--json` from one code path (D-11/D-12), and (4) mapping the final lifecycle state to an exit code (D-13).

**THE critical open item (D-07) is RESOLVED.** The v1 build resource serializes the **public** build-status enum, not the internal one. The poll loop must match on exactly these four strings: `queued | building | ready | failed` (`PublicBuildStatus`). Terminal-success is **`ready`**, terminal-failure is **`failed`**. There is no `succeeded`, no `in_review`, no `rejected` on the v1 build resource — the backend's `PublicStateMapper::buildStatus()` coarsens every internal in-progress state (`triggered`, `building`, `submitting`, `processing`, `in_review`) to `building`, maps `pending`→`queued`, and — load-bearing pitfall — maps the internal terminal `rejected` to **`building`** (the `default` branch). So a build that fails internally as `rejected` will appear to the poll loop as `building` until `--timeout` fires; only internal `failed` surfaces as the public terminal `failed`.

**A second critical finding:** the test harness (`test/helpers/mockFetch.mjs`) uses module-level shared global state (`globalThis.fetch`, a shared `requests[]` array). `node --test` runs files **concurrently** by default and the shared state collides → 19 spurious failures. The repo already pins this with `--test-concurrency=1` in the `npm test` script (all 67 pass that way). Ship's poll loop needs the harness's existing **FIFO sequence** mode (`installMockFetch([...])`), which already returns canned responses in order — perfect for `building → building → ready`. The planner must keep ship's tests runnable under the same serial invocation and must NOT introduce real wall-clock sleeps (the poll's `sleep` must be injectable).

**Primary recommendation:** Add `src/ops.mjs` (one thin async fn per lifecycle call over `apiFetch`). Refactor the Phase 1 `case` blocks to call ops and **delete the inline `apiFetch(...)` duplication** (feature branch, no shims — CLAUDE.md). Add a `case 'ship'` orchestrator that calls ops directly, reuses `confirmGate`/`printPreview`/`renderError`, polls `getBuild` with an **injectable `sleep`** (default 5s, default `--timeout` 1800s), prints only on status change, accumulates a step ledger, and returns 0/1/2/3 per D-13.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Extract a shared API-operation layer `src/ops.mjs` — thin async fns over `apiFetch`, one per lifecycle op, returning unwrapped data (or the raw envelope where needed): `createApp`, `triggerBuild`, `getApp`, `getBuild`, `publishApp`.
- **D-02:** Refactor the Phase 1 `case` blocks to call these ops and DELETE the inline `apiFetch` duplication (feature branch, no back-compat shims). `ship` composes the SAME ops. One definition of each API call.
- **D-03:** `ship` is its own `case 'ship'` orchestrator; it does NOT re-enter the CLI `switch` or shell out to itself — it calls ops directly and reuses the shared `confirmGate`, `printPreview`, `renderError`, printers.
- **D-04:** Two forms — `appo ship --url <u> --name <n> [...]` (starts at create) and `appo ship <id> [...]` (existing app, skips create, starts at build).
- **D-05:** Fixed step order: create (if new) → trigger build → poll build to terminal → publish. `--stores` defaults to both canonical tokens (`apple_appstore,google_playstore`), accepts the Phase 1 friendly aliases (`apple`/`google`). Publish blocks cleanly if a store's credential is missing (D-09) rather than pre-validating.
- **D-06:** After `triggerBuild`, poll `getBuild` until terminal. Default interval **5s**, overall **`--timeout` default 1800s (30 min)**. Print a line only on status change.
- **D-07:** Terminal states drive next step: build ready/succeeded → publish; build failed → stop (D-09). Researcher MUST confirm the exact build-status enum from the backend (do not hardcode guessed strings). **[RESOLVED below — `queued|building|ready|failed`; success=`ready`, fail=`failed`.]**
- **D-08:** `ship` stops at the FIRST step that errors or needs human input, prints what happened + the concrete resume command, exits non-zero. Never a silent half-finished state.
- **D-09:** Specific blocks: build failed → print failure + hint `appo fix-recipe <id>` / `appo rejection <id>`, exit 1. Publish/build prerequisite_failed (missing customer Apple/ASC credential) → reuse `renderError` (Blocked: … / Next: <next_action> -> <dashboard_url>), exit 1. Poll timeout → print last status + `appo status <id> --build <buildId>`, exit 1.
- **D-10:** Publish step honors the confirm-gate. Without `--yes`, `ship` runs create→build→poll then STOPS at the publish preview and exits 3. With `--yes`, the publish step executes. `--yes` maps to `confirm: true` for the publish op only.
- **D-11:** Human mode streams each step live with ASCII-safe markers (`->`, not unicode arrows): `> create ... ok app #5`, `> build #12 ...`, `  building -> ...`, `ok build ready`, `> publish ...`.
- **D-12:** `--json` suppresses the live stream and emits ONE structured object at completion: `{ "steps": [ {"step":"create","status":"ok","app_id":5}, {"step":"build","status":"ok","build_id":12}, {"step":"publish","status":"gated|ok|blocked", ...} ], "final_state": "shipped|gated|blocked|failed" }`.
- **D-13:** Exit codes reflecting final lifecycle state: `0` shipped; `3` stopped at publish confirm-gate (no `--yes`); `1` a step errored/blocked (build failed, missing credential, rejection, poll timeout); `2` usage error (neither `<id>` nor `--url`+`--name`).

### Claude's Discretion
- Exact human-stream wording / marker glyphs (within ASCII constraint).
- Whether ops live in one `src/ops.mjs` or are grouped further if the file grows.
- Poll backoff shape (fixed 5s vs mild backoff) — fixed interval is the default unless research shows a reason. **[Research: fixed 5s is correct; see Polling section.]**
- Whether `ship` accepts `--confirm` as an alias for `--yes` (consistency with single verbs). **[Research: recommend YES — accept both; `--yes`/`--confirm` map to the same gate.]**

### Deferred Ideas (OUT OF SCOPE)
- `--watch`/re-entrant auto-resume after a fixed blocker — resume path for now is re-running `appo ship <id>`.
- Parallel multi-store publish status reporting beyond the single publish call.
- Non-interactive auth so `ship` runs in CI without a browser — **Phase 3** (CLI-07).
- Automated tests for the `ship` orchestration — explicitly **Phase 5** (CLI-04). (This phase must keep ship testable; see Validation Architecture. The harness is already present, so a small ship test is cheap — but the full suite is Phase 5.)
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Lifecycle sequencing (create→build→poll→publish) | CLI (Node, `ship` orchestrator) | — | Pure client-side composition; no backend "ship" endpoint exists |
| Each HTTP call (create/build/get/publish) | CLI ops layer (`src/ops.mjs`) over `apiFetch` | API | One thin fn per v1 call; the backend owns the actual work |
| Build-state polling loop + terminal detection | CLI (Node) | — | The backend never waits (D-03 Phase 1); polling is the caller's job |
| Public build-status vocabulary (`queued/building/ready/failed`) | API (`PublicStateMapper`) | CLI (matches strings) | Backend defines the enum; CLI must match it verbatim, never invent |
| Prerequisite / credential enforcement (Apple, subscription, icons, blocked) | API (`TriggerCliBuild`, App model) | CLI (renders the block) | CLI must NOT pre-validate; surface the backend's `prerequisite_failed` envelope |
| Confirm-gate at the publish step | CLI (`confirmGate`, reused) | — | Client-side gate; identical semantics to Phase 1 publish |
| Step ledger + `--json` aggregation | CLI (Node) | — | UX/reporting layer; one ledger drives both human stream and JSON |
| Exit-code mapping (final lifecycle state) | CLI (Node) | — | `ship`-specific D-13 mapping over the Phase 1 0/1/2/3 taxonomy |

## The Build-Status Enum (D-07 — RESOLVED, load-bearing)

`[VERIFIED: app/Http/Resources/V1/AppBuildResource.php line 24 + app/Support/PublicStateMapper.php + app/Enums/Public/PublicBuildStatus.php]`

The v1 `GET /apps/{app}/builds/{build}` resource serializes `'status' => PublicStateMapper::buildStatus($this->status)`. The poll loop sees ONLY the **public** enum:

| Public `status` value | Meaning for the poll loop | Poll action |
|-----------------------|---------------------------|-------------|
| `queued` | build accepted, not started | keep polling |
| `building` | in progress (covers internal triggered/building/submitting/processing/in_review) | keep polling |
| `ready` | **terminal success** | proceed to publish |
| `failed` | **terminal failure** | stop, exit 1 (D-09 build-failed) |

```php
// Source: app/Support/PublicStateMapper.php — buildStatus()
match ($status) {
    AppBuildStatus::Ready   => 'ready',
    AppBuildStatus::Failed  => 'failed',
    AppBuildStatus::Pending => 'queued',
    default                 => 'building',   // triggered, building, submitting, processing, in_review, AND rejected
};
```

**Terminal-success string: `ready`. Terminal-failure string: `failed`.** The poll loop's terminal check is exactly:
```js
const TERMINAL_OK = 'ready';
const TERMINAL_FAIL = 'failed';
function isTerminal(status) { return status === TERMINAL_OK || status === TERMINAL_FAIL; }
```
Do NOT match `succeeded`, `success`, `done`, `complete`, `in_review`, or `rejected` — none of those appear on the v1 build resource. `[VERIFIED]`

**Pitfall baked into the mapper (see Common Pitfalls #2):** the internal terminal state `AppBuildStatus::Rejected` falls into the `default` branch → public `building`. A build that the backend internally marks `rejected` will poll as `building` forever and only stop on `--timeout`. The CLI cannot distinguish this from a genuinely slow build through the v1 build resource. The `--timeout` exit (D-09 poll-timeout) is the safety net; the timeout message should point the user at `appo status <id>` (the app overview, which DOES surface `publication_state`/rejection) as well as `appo status <id> --build <buildId>`.

## The Create Body (`appo ship --url --name`)

`[VERIFIED: app/Http/Requests/Api/V1/App/StoreRequest.php + AppController::store]`

`POST /api/v1/apps` requires:

| Body field | Rule | Source flag (ship) |
|------------|------|--------------------|
| `name` | `string, required, max:255` | `--name` |
| `base_url` | `string, required, max:255, url, UrlReachable` | `--url` (normalized server-side via `UrlNormalizer`) |
| `metadata_name` | `string, nullable` | `--meta-name` (optional) |
| `metadata_description` | `string, nullable` | `--meta-desc` (optional) |

Response: `201 Created { "data": {...AppResource...} }` — `data.id` is the app id `ship` carries into the build step and surfaces in the resume hint. **The body field for the URL is `base_url`, not `url`** (the existing `apps create` case already maps `--url`→`base_url`). `[VERIFIED: src/cli.mjs line 235]`

**Ship-relevant validation pitfall:** `UrlReachable` is a custom rule — if `--url` is not reachable, create returns **422 validation_error** before any app exists. `ship` must render this cleanly (exit 1) and NOT proceed; nothing was created, so the resume command is just "fix the URL and re-run `appo ship --url ... --name ...`" (no `<id>` exists yet). `[VERIFIED: StoreRequest rule `new UrlReachable`]`

## The Publish Step — actual failure modes

`[VERIFIED: AppPublishController::store + StartPublication + App::publicationStarted]`

D-09 said "publish blocks on missing Apple credential" — the research shows the **publish endpoint itself does NOT emit a missing-credential block**. Its only failure modes are:

| HTTP | Cause | Envelope | Ship handling |
|------|-------|----------|---------------|
| 204 | success | (no body) | step `ok`, final_state `shipped`, exit 0 |
| 422 `prerequisite_failed` `APP_BLOCKED` | `$app->isBlocked()` in `publicationStarted()` | `{error:prerequisite_failed, code:APP_BLOCKED, message, details:{next_action,dashboard_url}}` | reuse `renderError`, exit 1 |
| 409 `conflict` `resource_conflict` | a requested store already published | `{error:conflict, code:resource_conflict, message}` | print message, exit 1 |
| 404 `not_found` | not owned | `{error:not_found, code:resource_not_found, message}` | print, exit 1 |

`[VERIFIED: App::publicationStarted throws AppBlockedException (→ prerequisite_failed APP_BLOCKED via Handler) and AlreadyPublishedException (→ 409). No CUSTOMER_ASC_CREDENTIAL_MISSING path in publish.]`

**Where the Apple-credential block actually surfaces:** the **build** step (`POST /builds` → `TriggerCliBuild::assertPrerequisites`). For an iOS/`all` build, if the customer's Apple enrollment/credential/team/ASC-app-id is missing, the build trigger hard-fails with `422 prerequisite_failed` **before any build is created**, with codes:

| `code` | `details.next_action` | `details.dashboard_url` route |
|--------|----------------------|-------------------------------|
| `APP_BLOCKED` | `open_dashboard` | `support` |
| `SUBSCRIPTION_INACTIVE` | `open_dashboard` | `publish.choose-plan` |
| `ICONS_MISSING` | `configure_icons` | `dashboard` |
| `APPLE_ENROLLMENT_INCOMPLETE` (ios/all) | `complete_enrollment` | `publish.apple-developer` |
| `APPLE_CREDENTIALS_MISSING` (ios/all) | `open_dashboard` | `settings` |
| `APPLE_TEAM_MISSING` (ios/all) | `open_dashboard` | `settings` |
| `ASC_APP_ID_MISSING` (ios/all) | `open_dashboard` | `dashboard` |

`[VERIFIED: app/Actions/App/TriggerCliBuild.php assertPrerequisites]`

These are the realistic "missing Apple credential" stops for `ship`. They arrive from the **build trigger** (op `triggerBuild`), not from poll or publish. `ship` already has the right renderer: the Phase 1 `renderError` handles `prerequisite_failed` (Blocked: … / Next: …) — the orchestrator catches the thrown error from `triggerBuild` and routes it through `renderError`, then exits 1. **Note `ASC_APP_ID_MISSING` is special:** its message says "The first iOS build registers the app; re-run after registration completes" — i.e. a retry-soon block, not a permanent failure. The hint copy can reflect that, but mechanically it's still a stop+exit-1.

## The Resubmit Envelope (reference — NOT in the ship path)

`resubmit` is not a ship step (ship is create→build→poll→publish). Its `CUSTOMER_ASC_CREDENTIAL_MISSING` / `INVALID_APP_STATE` envelopes are documented in Phase 1 research and surface via the same `renderError`. Included here only because D-09's blocking-message language should read consistently with it. `[VERIFIED: AppResubmitController]`

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-in `fetch` | Node ≥18 (local v22.12.0) `[VERIFIED: node --version]` | all HTTP via `apiFetch` (unchanged) | zero-dep non-negotiable |
| `setTimeout` (promisified inline) | core | the poll interval sleep | dependency-free; injectable for tests |
| `process` / `console` | core | exit codes, step streaming, JSON output | already used |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:test` + `node:assert` | core | ship orchestration tests (Phase 5 owns full suite) | harness already present; sequence stub already supported |
| `node:timers/promises` `setTimeout` | core (Node ≥16) | optional cleaner sleep | OPTIONAL — a 3-line inline `new Promise(r => setTimeout(r, ms))` is equally dep-free and easier to inject; see below |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| inline promisified `setTimeout` | `node:timers/promises` `setTimeout(ms)` | Both dep-free. Inline wrapper is trivially injectable as a `sleep` parameter (key for tests — no fake timers needed). Recommend the **injectable `sleep` parameter** so tests pass a no-op. |
| fixed 5s interval | exponential backoff | Builds run minutes; a fixed 5s poll over a 30-min ceiling = ~360 calls worst case, negligible. Backoff adds complexity for no benefit. **Keep fixed 5s** (D-cretion confirmed). |
| real timers in tests | fake/mocked timers | Don't fight timers — make `sleep` injectable and pass `async () => {}` in tests. The FIFO response queue (`installMockFetch([...])`) drives the state sequence; the test never waits. |

**Installation:** None. Zero new dependencies (PROJECT.md/CLAUDE.md non-negotiable). `[VERIFIED]`

## Architecture Patterns

### System Architecture Diagram (ship data flow)

```
  appo ship [--url --name | <id>] [--stores] [--platform] [--yes] [--timeout] [--json]
        │
        ▼
  parseArgs ──> decide entry: has <id>?  ──no──> require --url + --name (else exit 2)
        │                                  │
        │                                  ▼
        │                          STEP create:  ops.createApp(--name,--url,meta)
        │                                  │  └─ 422 UrlReachable/validation ─> renderError, final=failed, exit 1
        │                                  ▼  201 -> app_id ; ledger.push({step:create, ok, app_id})
        └──────────────────────────────►  │   (existing-id form jumps straight here with app_id=<id>)
                                           ▼
                          STEP build:  ops.triggerBuild(app_id, {platform, branch})
                                           │  └─ 422 prerequisite_failed (APPLE_*/APP_BLOCKED/…) ─> renderError
                                           │        ledger.push({step:build, blocked, code}); final=blocked; exit 1
                                           ▼  202 -> build_id ; ledger.push({step:build, ok, build_id})
                                           ▼
                          STEP poll:   loop ops.getBuild(app_id, build_id) every 5s, max --timeout
                                           │   status changed? ─> stream a line (human) / record transition
                                           ├─ status==='ready'  ─> break (success)
                                           ├─ status==='failed' ─> ledger.push({step:build, failed}); final=failed
                                           │                        hint: appo fix-recipe/rejection <id>; exit 1
                                           └─ elapsed>timeout   ─> ledger.push({step:build, timeout, last_status})
                                                                    hint: appo status <id> --build <build_id>; exit 1
                                           ▼ (ready)
                          STEP publish: confirmGate(--yes→confirm, preview{will:publish, app_id, target_stores})
                                           ├─ no --yes ─> print/emit preview; ledger.push({step:publish, gated})
                                           │              final=gated; exit 3  (NO write)
                                           └─ --yes  ─> ops.publishApp(app_id, stores)
                                                         ├─ 204 ─> ledger.push({step:publish, ok}); final=shipped; exit 0
                                                         ├─ 409 conflict ─> ledger.push(blocked); final=blocked; exit 1
                                                         └─ 422 APP_BLOCKED ─> renderError; final=blocked; exit 1
        │
        ▼
  if --json: print ONE { steps:[...], final_state } object (stream suppressed)
  else:      stream was live; final summary line
  return exit code from the final_state mapping (D-13)
```

### Recommended Project Structure
```
src/
├── cli.mjs    # add `case 'ship'`; refactor Phase 1 cases to call ops; extend USAGE; keep confirmGate/printPreview/renderError/printers
├── ops.mjs    # NEW: createApp / triggerBuild / getApp / getBuild / publishApp — thin async over apiFetch
├── api.mjs    # unchanged (apiFetch already complete)
├── config.mjs # unchanged
└── login.mjs  # unchanged
```

### Pattern 1: The ops layer (D-01) — one definition per call
**What:** Each op is a thin async fn over `apiFetch` that returns unwrapped data (or null for 204). No console, no exit codes, no arg-parsing — pure transport so BOTH the single verbs and `ship` reuse them.
**Why:** Success criterion 1 (no duplicated API logic). Refactoring the Phase 1 cases onto these must NOT change behavior (the 66 file-isolated tests / 67 under `--test-concurrency=1` must stay green).
**Example:**
```js
// src/ops.mjs — Source: paths/bodies verified against ../apps-web-app controllers
import { apiFetch } from './api.mjs';

const unwrap = (p) => (p && typeof p === 'object' && 'data' in p ? p.data : p);

// POST /api/v1/apps -> 201 { data: AppResource }
export async function createApp(apiBase, { name, base_url, metadata_name, metadata_description }) {
  const body = { name, base_url };
  if (metadata_name) body.metadata_name = metadata_name;
  if (metadata_description) body.metadata_description = metadata_description;
  return unwrap(await apiFetch(apiBase, 'POST', '/api/v1/apps', body));
}

// POST /api/v1/apps/{id}/builds -> 202 { data: AppBuildResource }
export async function triggerBuild(apiBase, id, { platform, branch } = {}) {
  const body = {};
  if (platform) body.platform = platform;   // ios|android|all
  if (branch) body.branch = branch;          // /^[A-Za-z0-9._\/-]+$/
  return unwrap(await apiFetch(apiBase, 'POST', `/api/v1/apps/${id}/builds`, body));
}

// GET /api/v1/apps/{id} -> 200 { data: AppResource }
export async function getApp(apiBase, id) {
  return unwrap(await apiFetch(apiBase, 'GET', `/api/v1/apps/${id}`));
}

// GET /api/v1/apps/{id}/builds/{buildId} -> 200 { data: AppBuildResource }
export async function getBuild(apiBase, id, buildId) {
  return unwrap(await apiFetch(apiBase, 'GET', `/api/v1/apps/${id}/builds/${buildId}`));
}

// POST /api/v1/apps/{id}/publish -> 204 (null)
export async function publishApp(apiBase, id, app_stores) {
  return apiFetch(apiBase, 'POST', `/api/v1/apps/${id}/publish`, { app_stores });
}
```
**Refactor note (D-02, CLAUDE.md "delete old code"):** the Phase 1 `case 'apps'/create`, `case 'build'`, `case 'status'`, `case 'publish'` blocks currently inline `apiFetch(...)`. Replace those inline calls with the ops fns and DELETE the duplicated `apiFetch` lines — do not leave both. `unwrap` is currently defined in `cli.mjs`; either import it into `ops.mjs` or move it to a shared spot and import in both (one definition). The verbs keep their own arg-parse + printer + exit-code logic; only the HTTP call moves to ops.

### Pattern 2: Dependency-free poll loop with injectable sleep
**What:** Poll `getBuild` on a fixed interval until terminal or timeout. Print only on status change. `sleep` is a parameter so tests inject a no-op.
**When to use:** the build-poll step.
**Example:**
```js
// Source: PublicBuildStatus enum (queued|building|ready|failed) verified above
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollBuild(apiBase, appId, buildId, {
  intervalMs = 5000, timeoutMs = 1_800_000, sleep = realSleep, onChange = () => {},
} = {}) {
  const start = Date.now();
  let last = null;
  for (;;) {
    const build = await getBuild(apiBase, appId, buildId);
    const status = build?.status;
    if (status !== last) { onChange(status, build); last = status; }   // stream only on change (D-06)
    if (status === 'ready')  return { outcome: 'ready', build };
    if (status === 'failed') return { outcome: 'failed', build };
    if (Date.now() - start >= timeoutMs) return { outcome: 'timeout', build, last_status: status };
    await sleep(intervalMs);
  }
}
```
> The FIFO test stub (`installMockFetch([{status:200,body:{data:{status:'building'}}}, {...'building'}, {...'ready'}]) `) feeds the sequence; the injected `sleep = async () => {}` makes the test instant. No fake timers needed.

### Pattern 3: One ledger drives both human stream and `--json` (D-11/D-12)
**What:** A `steps[]` array accumulated as the orchestrator runs. In human mode, each push also triggers a streamed line (or the `onChange` callback streams). In `--json` mode, streaming is suppressed and the whole ledger + `final_state` is printed once at the end.
**Example:**
```js
function shipReport(json) {
  const steps = [];
  const human = !json;
  const log = (line) => { if (human) console.log(line); };           // ASCII markers only (D-11)
  const record = (step) => { steps.push(step); };
  const finish = (final_state, exitCode) => {
    if (json) console.log(JSON.stringify({ steps, final_state }));   // ONE object (D-12)
    return exitCode;
  };
  return { steps, log, record, finish };
}
```
**Final-state → exit-code map (D-13), single source of truth:**
```js
const EXIT = { shipped: 0, gated: 3, blocked: 1, failed: 1 };  // usage error (2) returned before any step
```

### Anti-Patterns to Avoid
- **Re-entering the CLI switch or shelling out to `appo`** for each step (D-03). Call ops directly.
- **Hardcoding `succeeded`/`success`/`done` as the terminal status.** It is `ready`. `failed` is the failure. Anything else = keep polling. `[VERIFIED]`
- **Real wall-clock sleeps in the poll** that block tests. Make `sleep` injectable.
- **Weakening the confirm-gate.** No `--yes` ⇒ no publish POST, exit 3. `--yes` is the only thing that maps to `confirm:true` for publish. Never auto-confirm on `--json`.
- **Logging the PAT / full request.** The poll loop calls `getBuild` repeatedly; never dump `init.headers` or the Bearer token in any stream/JSON line.
- **Leaving a silent half-finished state (D-08).** Every stop prints what happened + a concrete resume command (the `app_id`, and `build_id` where one exists).
- **Pre-validating credentials client-side.** Let the build trigger's `prerequisite_failed` be the source of truth; render it via `renderError`.
- **Duplicating `apiFetch` after extracting ops (D-02).** Delete the inline calls.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP + auth + envelope + 204/401 | a new fetch per op | existing `apiFetch` (wrapped by ops) | already complete |
| Confirm preview + gate at publish | a new ship-specific gate | reuse `confirmGate` + `printPreview` | identical semantics; cross-surface consistency |
| Blocked-state rendering (prerequisite_failed) | a new error printer | reuse `renderError` | already renders Blocked / Next: next_action -> dashboard_url |
| Build-status vocabulary | guessed status strings | the `PublicBuildStatus` enum (`queued/building/ready/failed`) | backend-defined; `OpenApiSpecTest` pins it |
| Arg parsing (`--yes`, `--timeout`, `--stores`, `--url`, `--name`) | a second parser | existing `parseArgs` (handles `--k v`, `--k=v`, `--flag`, `--`) | already handles ship's flags |
| Sleep/timer | a polling library / `setInterval` juggling | inline promisified `setTimeout`, injectable | dep-free + testable |

**Key insight:** Ship adds exactly one genuinely new mechanism — the poll loop — plus a step ledger and an exit-code map. Everything else is composition of code that already exists and is test-pinned.

## Runtime State Inventory

> Additive phase (new orchestrator + an ops module + a refactor of existing cases). No rename/migration of stored data. Checked explicitly:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `ship` reads `~/.appo/config.json` (token + api_base) unchanged; creates apps/builds via the same v1 calls the verbs already make | None |
| Live service config | None — no new backend; `/api/v1` already live | None |
| OS-registered state | None — no daemons/schedulers; the poll loop is in-process and ends when ship exits | None |
| Secrets/env vars | `APPO_API_BASE` already read by `resolveApiBase`; token unchanged. No new secrets. The PAT must never appear in any stream/JSON line (the poll repeats `getBuild`). | Code discipline: never log `init.headers`/Bearer |
| Build artifacts | None — `.mjs` run directly via `bin/appo.mjs`; no compiled output | None |
| **Code refactor (D-02)** | The Phase 1 `case` blocks inline `apiFetch(...)`; extracting ops MUST delete those inline calls (no dual definitions). The 67-test suite (`npm test`) is the regression guard. | Refactor + re-run `npm test` (must stay green) |

## Common Pitfalls

### Pitfall 1: Polling for the wrong terminal string
**What goes wrong:** Loop matches `succeeded`/`success`/`done` (training-data guesses) → never terminates on success → always times out.
**Why it happens:** Many CI systems use `succeeded`; Appo's public enum uses `ready`.
**How to avoid:** Match exactly `ready` (success) and `failed` (failure). `[VERIFIED: PublicBuildStatus]`
**Warning signs:** Builds finish in the dashboard but `ship` hangs to timeout.

### Pitfall 2: Internal `rejected` build appears as `building` (mapper coarsening)
**What goes wrong:** A build internally marked `AppBuildStatus::Rejected` maps to public `building` (the `default` branch), so the poll never sees a terminal state and runs to `--timeout`.
**Why it happens:** `PublicStateMapper::buildStatus` only maps `Ready`/`Failed`/`Pending` explicitly; everything else (including `Rejected`) → `building`.
**How to avoid:** Accept it — the v1 build resource cannot express this. The `--timeout` stop (D-09) is the safety net. The timeout message should also suggest `appo status <id>` (app overview surfaces `publication_state`/rejection) in addition to `appo status <id> --build <buildId>`.
**Warning signs:** A build that polls `building` indefinitely; the app overview shows a rejected/blocked state.
`[VERIFIED: PublicStateMapper default branch]`

### Pitfall 3: Partial state — create succeeds, build trigger fails (D-08)
**What goes wrong:** `ship --url --name` creates the app (201), then `triggerBuild` hits a `prerequisite_failed` (e.g. `ICONS_MISSING`, `APPLE_CREDENTIALS_MISSING`). If the orchestrator just rethrows, the user doesn't know an app now exists.
**Why it happens:** Create and build are two separate POSTs; the first commits before the second runs.
**How to avoid:** On any post-create stop, print the **created `app_id`** and the resume command `appo ship <id> ...` (which skips create). The ledger's create step is `ok` with `app_id`; the build step records the block. Never leave the user guessing whether to re-create.
**Warning signs:** A blocked ship with no app id in the output; users re-running `--url --name` and creating duplicate apps.

### Pitfall 4: Logging the PAT during polling
**What goes wrong:** A debug line dumps the `getBuild` request (headers include `Authorization: Bearer <PAT>`), and the poll repeats it every 5s.
**How to avoid:** Stream only `status`/`build_id`/timestamps. Never include `init.headers` or the token in any human line or JSON field. `[PROJECT.md non-negotiable: never log the PAT]`

### Pitfall 5: Weakening the confirm-gate via `--json` or auto-yes
**What goes wrong:** In `--json` mode the orchestrator publishes without `--yes` to "complete the pipeline".
**How to avoid:** `--json` only changes output, never behavior. No `--yes` ⇒ publish step is `gated`, final_state `gated`, exit 3, NO POST. `[D-10]`

### Pitfall 6: 204 publish response handled as a body
**What goes wrong:** `publishApp` returns null (204); code tries to `unwrap`/read fields → throws.
**How to avoid:** `publishApp` resolving (no throw) IS success. Don't read a body. Record `{step:publish, status:ok}`, final_state `shipped`. `[VERIFIED: AppPublishController returns 204]`

### Pitfall 7: Cross-file test pollution under bare `node --test`
**What goes wrong:** Running `node --test` (no `--test-concurrency=1`) runs files concurrently; the shared `globalThis.fetch` stub and module-level `requests[]` in `mockFetch.mjs` collide → ~19 spurious failures (push/sentinel tests).
**Why it happens:** node:test default file concurrency = CPU count; the harness keeps global mutable state.
**How to avoid:** Always invoke via `npm test` (already pins `--test-concurrency=1`). Ship's new tests use the same harness and MUST run serially. Phase 5 may harden the harness (per-test fetch injection) but this phase only needs the serial invocation. `[VERIFIED: node --test → 19 fail; node --test --test-concurrency=1 → 67 pass; npm test script already pins it]`

## Code Examples

### The `ship` orchestrator skeleton (composition only)
```js
// Source: ops paths verified vs ../apps-web-app; flow per D-04..D-13
case 'ship': {
  const hasId = sub && !sub.startsWith('--');
  if (!hasId && (!flags.url || !flags.name)) {
    console.error('Usage: appo ship <id> | appo ship --url <u> --name <n> [--stores <list>] [--platform ios|android|all] [--yes] [--timeout <s>]');
    return 2;  // D-13 usage error
  }
  const stores = parseStores(flags.stores);   // default both canonical tokens; map apple/google aliases
  const wantYes = flags.yes === true || flags.confirm === true;  // --confirm alias (D-cretion: accept both)
  const json = flags.json === true;
  const { steps, log, record, finish } = shipReport(json);

  let appId = hasId ? sub : null;

  // STEP create (new-app form only)
  if (!appId) {
    const app = await ops.createApp(apiBase, { name: flags.name, base_url: flags.url,
      metadata_name: flags['meta-name'], metadata_description: flags['meta-desc'] });
    appId = app.id;
    record({ step: 'create', status: 'ok', app_id: appId });
    log(`> create ... ok app #${appId}`);
  }

  // STEP build trigger  (prerequisite_failed throws -> caught by top-level renderError, see note)
  const build = await ops.triggerBuild(apiBase, appId, { platform: flags.platform, branch: flags.branch });
  const buildId = build.id;
  record({ step: 'build', status: 'ok', build_id: buildId });
  log(`> build #${buildId} ... ${build.status}`);

  // STEP poll
  const res = await pollBuild(apiBase, appId, buildId, {
    timeoutMs: (Number(flags.timeout) || 1800) * 1000,
    onChange: (s) => log(`  ${s} -> ...`),
  });
  if (res.outcome === 'failed') {
    record({ step: 'build', status: 'failed', build_id: buildId });
    log(`x build failed. Next: appo fix-recipe ${appId}  (or: appo rejection ${appId})`);
    return finish('failed', 1);
  }
  if (res.outcome === 'timeout') {
    record({ step: 'build', status: 'timeout', build_id: buildId, last_status: res.last_status });
    log(`x timed out at "${res.last_status}". Resume: appo status ${appId} --build ${buildId}`);
    return finish('failed', 1);
  }
  log(`ok build ready`);

  // STEP publish (confirm-gate, D-10)
  const preview = { will: 'publish', app_id: Number(appId), target_stores: stores };
  if (!wantYes) {
    if (!json) printPreview(preview);
    record({ step: 'publish', status: 'gated', target_stores: stores });
    return finish('gated', 3);
  }
  log(`> publish ...`);
  await ops.publishApp(apiBase, appId, stores);   // 204 == success; 409/422 throw -> renderError
  record({ step: 'publish', status: 'ok', target_stores: stores });
  log(`ok shipped: ${stores.join(', ')}`);
  return finish('shipped', 0);
}
```
> **Error routing note (D-08/D-09):** `triggerBuild` / `publishApp` throwing a `prerequisite_failed`/`conflict` is caught by the existing top-level `try/catch → renderError` in `run()`, which returns 1. For `--json`, the orchestrator should catch those itself to emit a `{steps,...,final_state:"blocked"}` object before returning 1 (so `--json` always emits one object — D-12). Plan decision: in `--json` mode, wrap the build/publish ops in a local try that records `{step, status:'blocked', code: err.envelope?.code, ...}` then `finish('blocked', 1)`; in human mode let it fall through to `renderError`. Keep ONE code path by always recording into the ledger and only branching the final emit.

### Stores parsing (default both, alias mapping)
```js
// Source: AppStore enum tokens apple_appstore|google_playstore (verified Phase 1)
function parseStores(raw) {
  if (!raw || raw === true) return ['apple_appstore', 'google_playstore'];  // D-05 default both
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean)
    .map((s) => s === 'apple' ? 'apple_appstore' : s === 'google' ? 'google_playstore' : s);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-verb inline `apiFetch` in each `case` | Shared `src/ops.mjs` layer; verbs + ship reuse it | This phase (D-01/D-02) | One definition per API call; delete the inline duplication |
| Single-shot `status --build` (Phase 1) | Poll loop over `getBuild` to terminal (`ready`/`failed`) | This phase (D-06/D-07) | First waiting behavior in the CLI; injectable sleep keeps it testable |
| Exit 0/1/2/3 = per-command outcome | Same codes, ship maps the FINAL lifecycle state | This phase (D-13) | `0` shipped / `3` gated / `1` blocked-or-failed / `2` usage |

**Deprecated/outdated:** Nothing replaced wholesale. The inline per-verb `apiFetch` calls are the only thing deleted (moved into ops).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `triggerBuild` defaults: ship's build step uses platform `all` and branch `master` when flags absent (matches v1 defaults) | ops / build | Low — backend defaults to `all`/`master`; sending nothing yields the same. `[VERIFIED: AppBuildController::store uses ?? 'all' / ?? 'master']` → actually verified, not assumed |
| A2 | Accepting `--confirm` as an alias for `--yes` | publish step | Low — explicit Claude's-discretion item; recommended for consistency |
| A3 | Exact human-stream wording / marker glyphs | D-11 | Low — explicit Claude's discretion (ASCII only) |
| A4 | In `--json` mode, ship catches build/publish errors locally to still emit one ledger object (final_state `blocked`) | error routing note | Low — required to satisfy D-12 ("ONE object at completion"); the planner should make this explicit in the plan |

> All HTTP-contract claims (build-status enum, create body, publish/build prerequisite envelopes, response codes) are `[VERIFIED]` against `../apps-web-app` source — not assumed.

## Open Questions (RESOLVED)

1. **`--json` + a mid-pipeline thrown block — emit one object or let `renderError` print?**
   - What we know: D-12 requires ONE structured object at completion; the Phase 1 top-level catch calls `renderError` (human stderr).
   - What's unclear: whether `renderError`'s human output should be suppressed under `--json`.
   - RESOLVED: in `--json` mode the orchestrator catches build/publish throws itself, records a `blocked` step with `err.envelope.code`, emits the single ledger object, returns 1 — does NOT fall through to `renderError`. In human mode it falls through to `renderError` for the Blocked/Next: lines. (Implemented in Plan 02-02 Task 2 `handleBlock`.)

2. **Existing-id form (`appo ship <id>`) when the app already has a live/published store.**
   - What we know: publish returns 409 `conflict` if a requested store is already published.
   - What's unclear: should ship pre-skip already-published stores, or let the 409 surface?
   - RESOLVED: do NOT pre-validate (CLI must not re-implement backend state). Let 409 surface as a clean blocked step (`final_state: blocked`, exit 1) with the conflict message. Pre-filtering stores is a deferred enhancement.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (built-in `fetch`, `setTimeout`) | orchestrator + poll | ✓ | v22.12.0 (floor ≥18) | — |
| `/api/v1` backend | live ship execution | ✓ (shipped in apps-web-app) | v1 | tests mock `fetch`; no live backend needed for verification |
| `../apps-web-app` source | planning/contract reference | ✓ | — | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

> Ship must be verifiable WITHOUT a live backend or real time. The existing harness already supports both: `installMockFetch([...])` returns canned responses **FIFO** across calls (a verb/orchestrator making N calls gets N responses), and the poll's `sleep` is an injectable parameter so tests pass a no-op. The poll-sequence test is literally `building, building, ready` as three queued responses.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert` (built-in, zero-dep) — `[VERIFIED: present in test/]` |
| Config file | none (built-in runner) |
| Quick run command | `npm test` (which is `node --test --test-concurrency=1 "test/**/*.test.mjs"`) `[VERIFIED: package.json]` |
| Full suite command | `npm test` — same; serial concurrency is mandatory (see Wave 0) |
| Current state | 67 tests, ALL PASS under `npm test`; bare `node --test` shows 19 spurious fails (concurrency pollution — Pitfall 7) `[VERIFIED]` |

### How the poll loop is tested (the key enabler)
- **Sequence stub:** `installMockFetch([ {status:200, body:{data:{status:'building'}}}, {status:200, body:{data:{status:'building'}}}, {status:200, body:{data:{status:'ready'}}} ])` — the orchestrator's `getBuild` calls consume these in order; the loop sees building→building→ready and proceeds to publish. `[VERIFIED: mockFetch FIFO behavior, lines 33/49]`
- **Injectable sleep:** the test passes `sleep: async () => {}` (or the orchestrator accepts a `sleep`/`intervalMs`/`timeoutMs` override) so no real time elapses. The plan MUST thread `sleep` (and the timeout/interval) as parameters into `pollBuild` for this to work.
- **Timeout path:** queue many `building` responses + set `timeoutMs` to a value the no-op sleep crosses (e.g. drive `Date.now()` past it, or set `timeoutMs: 0` and one `building` response) → assert outcome `timeout`, exit 1, resume hint printed.
- **Exit codes** are returned values from `run()` — assert directly, no process spawn.
- **Step ledger / `--json`** — run with `--json`, capture `console.log`, `JSON.parse` the single line, assert `steps[]` shape + `final_state`.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command (illustrative) | File Exists? |
|--------|----------|-----------|----------------------------------|--------------|
| CLI-06 | create→build→poll(ready)→publish(--yes) runs end-to-end, exit 0, final_state shipped | contract (FIFO stub) | `npm test` (test/ship.test.mjs) | ❌ Wave 0 (Phase 5 owns full suite; a smoke test here is cheap) |
| CLI-06 | poll observes building→building→ready and proceeds (sequence stub + no-op sleep) | unit | `npm test` | ❌ Wave 0 |
| CLI-06 | build status `failed` stops with fix-recipe/rejection hint, exit 1, final_state failed | unit | `npm test` | ❌ Wave 0 |
| CLI-06 | poll timeout stops with `appo status <id> --build <id>` hint, exit 1 | unit | `npm test` | ❌ Wave 0 |
| CLI-06 | no `--yes` stops at publish preview, NO publish POST, exit 3, final_state gated | unit | `npm test` | ❌ Wave 0 |
| CLI-06 | build trigger prerequisite_failed (e.g. APPLE_CREDENTIALS_MISSING) → blocked, exit 1, app_id surfaced for resume | unit (mocked 422 envelope) | `npm test` | ❌ Wave 0 |
| CLI-06 | `appo ship` missing both `<id>` and `--url`/`--name` → exit 2, no HTTP | unit | `npm test` | ❌ Wave 0 |
| CLI-06 | `--json` emits ONE `{steps, final_state}` object, stream suppressed | unit | `npm test` | ❌ Wave 0 |
| CLI-01 (regression) | the 67 existing tests stay green after the ops refactor (D-02) | contract | `npm test` | ✓ exists |

### Sampling Rate
- **Per task commit:** `npm test` (fast; built-in, serial).
- **Per wave merge:** `npm test` (full).
- **Phase gate:** `npm test` fully green (67 existing + new ship tests) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `test/ship.test.mjs` — covers CLI-06 (orchestration, poll sequence, blocks, exit codes, `--json`). The harness (`test/helpers/mockFetch.mjs`) already exists and supports FIFO sequences — no new helper needed for the happy/timeout paths.
- [ ] Thread `sleep`/`intervalMs`/`timeoutMs` as parameters into the poll fn (implementation requirement that enables instant tests) — this is a code-shape gap, not a test-file gap.
- [ ] (Optional, Phase 5) Harden `mockFetch.mjs` against concurrent runs (per-test fetch injection) so a bare `node --test` also passes. NOT required this phase — `npm test` already pins `--test-concurrency=1`.
- No framework install needed.

## Project Constraints (from CLAUDE.md + PROJECT.md)

> Treat with the same authority as locked decisions.
- **Dependency-free Node CLI** — built-in `fetch`/`setTimeout`/`fs` only. No new runtime deps for the poll loop or orchestrator. `[VERIFIED: PROJECT.md, CLAUDE.md]`
- **Never weaken auth parity / the confirm-gate** — `ship`'s publish step gates exactly like Phase 1 publish; `--yes` is the only path to `confirm:true`; `--json` never auto-confirms. `[VERIFIED: PROJECT.md non-negotiable]`
- **Keep request/response shapes in lockstep with `/api/v1` (no drift)** — ops send the exact verified bodies; the poll matches the exact `PublicBuildStatus` strings; `--json` ledger is ship's own summary (D-12), but every embedded value (app_id, build_id, status) comes verbatim from v1. `[VERIFIED: OpenApiSpecTest pins the contract]`
- **Never log the PAT** — the repeated `getBuild` poll must not dump headers/token. `[VERIFIED: PROJECT.md non-negotiable]`
- **Delete old code when replacing** — the ops refactor DELETES the inline per-verb `apiFetch` calls; no dual definitions, no versioned fns. `[VERIFIED: CLAUDE.md]`
- **Concrete types, early returns, small focused functions** — orchestrator early-returns on each stop; ops are one-liners; poll is a single small fn. `[VERIFIED: CLAUDE.md]`
- **Repository docs read as neutral** — any USAGE/help text added stays neutral.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLI-06 | `appo ship` — one command runs create → build → status(poll) → publish with streamed progress; reuses CLI-01 implementations; stops cleanly on the first blocking step | Build-status terminal enum resolved verbatim (`ready`/`failed`, mapper coarsening pitfall); create body + publish/build prerequisite envelopes verified; ops-layer shape + non-breaking refactor of Phase 1 cases (D-01/D-02) specified with the regression guard (67-test suite); dependency-free injectable poll loop + step-ledger + exit-code map (D-6/11/12/13) designed; partial-state resume (surface app_id) and confirm-gate/PAT pitfalls catalogued; FIFO-stub + no-op-sleep test strategy mapped (the harness already supports sequences) |

## Sources

### Primary (HIGH confidence)
- `../apps-web-app/app/Enums/Public/PublicBuildStatus.php` — the public build enum (`queued|building|ready|failed`) the poll matches
- `../apps-web-app/app/Enums/AppBuildStatus.php` — internal enum + `isTerminal()` (Ready/Failed/Rejected) showing the rejected→building coarsening gap
- `../apps-web-app/app/Support/PublicStateMapper.php` — `buildStatus()` mapping (the load-bearing terminal-string resolution + the `rejected`→`building` default branch)
- `../apps-web-app/app/Http/Resources/V1/AppBuildResource.php` — confirms `status` serializes via `PublicStateMapper::buildStatus` (line 24)
- `../apps-web-app/app/Http/Controllers/Api/V1/AppBuildController.php` — store (202, defaults all/master), show, ownership/belongs-to-app guards
- `../apps-web-app/app/Http/Requests/Api/V1/App/StoreRequest.php` — create body (`name`/`base_url` required, `UrlReachable`, metadata nullable)
- `../apps-web-app/app/Http/Controllers/Api/V1/AppController.php` — create returns 201 { data: AppResource } (app id for resume)
- `../apps-web-app/app/Http/Controllers/Api/V1/AppPublishController.php` + `app/Actions/App/StartPublication.php` + `app/Models/App.php::publicationStarted` — publish 204/409/422(APP_BLOCKED); NO credential block in publish
- `../apps-web-app/app/Actions/App/TriggerCliBuild.php` — the real "missing Apple credential" stops (prerequisite_failed codes + next_action/dashboard_url) on the BUILD trigger
- `../apps-web-app/app/Http/Controllers/Api/V1/AppResubmitController.php` — resubmit envelope (reference for consistent blocking language; not a ship step)
- `appo` repo: `src/cli.mjs`, `src/api.mjs`, `src/config.mjs`, `package.json`, `test/helpers/mockFetch.mjs`, `test/destructive-verbs.test.mjs` — the patterns/harness being extended
- Local: `node --test` (19 fail concurrent) vs `node --test --test-concurrency=1` / `npm test` (67 pass) — the Wave 0 concurrency finding

### Secondary (MEDIUM confidence)
- None — all ship-relevant contract facts sourced from primary backend source.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Build-status terminal enum (D-07): HIGH — read from the resource + mapper + enum, with the coarsening pitfall identified
- Create body / publish & build failure envelopes: HIGH — controllers + FormRequest + actions read directly
- Ops-layer shape + non-breaking refactor: HIGH — derived from the current `cli.mjs`; regression guard is the existing 67-test suite
- Poll loop / step-ledger / exit-code design: HIGH — dependency-free, derived from Node core + the harness's verified FIFO/inject capabilities
- Test harness concurrency finding: HIGH — reproduced both failure and pass locally
- Human-output wording / marker glyphs / `--confirm` alias: LOW (by design — Claude's discretion)

**Research date:** 2026-06-15
**Valid until:** ~2026-07-15 (stable — the build enum + bodies are `OpenApiSpecTest`-pinned; revisit if apps-web-app changes the v1 build resource or the public state mapper)
