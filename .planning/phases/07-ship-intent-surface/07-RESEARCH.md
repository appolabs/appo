# Phase 7: Ship-intent surface + config rescope — Research

**Researched:** 2026-06-22
**Domain:** Node ≥18 dependency-free CLI refactor (`@appolabs/appo`) — collapse build/poll out of `ship`, rescope `apps update`, add `--icon`
**Confidence:** HIGH (all claims grounded in the actual repo source + the shipped cross-repo backend summaries/actions)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 — `ship` = publish-intent, not a build pipeline.** Reshape `case 'ship'`: `appo ship --url --name` creates the app (`createApp`) then signals publish-intent via the existing `publishApp` op (`POST /api/v1/apps/{app}/publish`). `appo ship <id>` signals (re)publish-intent on an existing app. No build call, no poll loop — return immediately. Verified against the live backend: `StartPublication::run($app, $stores)` → `$app->publicationStarted($stores)` does NOT require a prior successful build. Preserve confirm-gate semantics on the publish step (`--yes`/`--confirm`, exit 3 without it).
- **D-02 — Remove the build transport.** Delete `ops.triggerBuild` and the `pollBuild` loop, plus the build/poll steps in the `case 'ship'` ledger. No CLI code path may call `POST .../builds` (v1 route now 405, legacy 404 for a user PAT). Build STATUS reads stay (`appo status <id>` → `GET /api/v1/apps/{app}/builds[/{build}]` survive); only issuance/polling is removed.
- **D-03 — `apps update` = icon/url/name.** Drop `--meta-name`/`--meta-desc` (the v1 `PATCH /api/v1/apps/{app}` user surface now silently ignores all fields except `name`/`base_url`). Keep `--name`, `--url` (→ `PATCH`). Add `--icon`.
- **D-04 — `--icon` is a separate POST, not part of the PATCH body.** `POST /api/v1/apps/{app}/icon` with body `{ "icon_url": "<https image URL>" }`, returning `{ "icon_url": "..." }`. `--icon` takes an https image URL (mirrors `apps create --url`), NOT a file upload. Add `ops.setIcon(apiBase, id, icon_url, env)`. When `--name`/`--url` AND `--icon` are all given, run `PATCH` first, then the icon `POST`, and report both. A rejected icon returns 422 — surface through the shared `renderError` path.
- **D-05 — Docs/tests/exit-codes.** Update `test/integration/ship.test.mjs` (assert create→publish-intent, no `/builds`), delete the `pollBuild` unit tests, update the write/update tests (`--icon` happy path + 422 reject + `--meta-*` removed), `README.md`, `llms.txt`, and `test/integration/docs.test.mjs`. Keep the exit-code taxonomy. `npm test` + lint + typecheck green.

### Claude's Discretion
- The exact `ship` success message; recommended: a short "submitted — Appo will build and submit it" line plus a tracking hint (`appo status <id>` / `appo preview <id>`).
- Whether `ship --json` keeps a ledger; recommended: keep it as a shorter `{steps:[create, publish], final_state}` object (drop the build/poll steps), preserving the lifecycle-aware exit code.
- Whether to delete the now-unused `pollBuild` export entirely vs retain for `status`; recommended: delete (status uses `ops.getApp`/`ops.getBuild`, not the poll loop).

### Deferred Ideas (OUT OF SCOPE)
- A client-side build/preview wait in `ship` — rejected; builds are staff-async, the user tracks via `status`/`preview`.
- File-upload (multipart) icon input — out of scope; the backend icon endpoint takes a fetchable URL only.
</user_constraints>

<phase_requirements>
## Phase Requirements

This phase has **no REQ-IDs** (per ROADMAP: "CLI operator boundary"). Success is the 4 ROADMAP success criteria. They are tracked here as SC-1..SC-4 and mapped to concrete tests in the Validation Architecture section.

| ID | Description | Research Support |
|----|-------------|------------------|
| SC-1 | `appo ship --url <u> --name <n>` creates + signals publish-intent WITHOUT calling `POST /builds` and WITHOUT polling; `appo ship <id>` signals (re)publish-intent the same way | Reshape of `case 'ship'` (§Pattern 1); `ops.publishApp` reused verbatim (§Standard Stack); no-`/builds` assertion (§Validation) |
| SC-2 | `ops.triggerBuild` and the `pollBuild` loop removed; no CLI code path calls `POST /api/v1/apps/{app}/builds` | Removal map (§Don't Hand-Roll / §Pattern 2); reference inventory in §Runtime State Inventory confirms only 5 call sites |
| SC-3 | `apps update <id>` accepts only `--name`, `--url`, `--icon`; `--meta-name`/`--meta-desc` removed | `apps update` rescope (§Pattern 3) + new `ops.setIcon` (§Pattern 4) |
| SC-4 | Tests, README, `llms.txt` updated; `npm test`, lint, typecheck green | Docs/test change map (§Pattern 5) + phase gate (§Validation) |
</phase_requirements>

## Summary

This is a **removal-and-rescope refactor of existing CLI code**, not greenfield. Every line to touch already exists in `src/cli.mjs`, `src/ops.mjs`, and the test suite, and the cross-repo backend it consumes is already shipped (`apps-web-app` Phases 189 + 190). The work is mechanically well-bounded: the build transport (`ops.triggerBuild`, `pollBuild`, and the build/poll steps of the `ship` ledger) is deleted; `ship` collapses from a 4-step (create→build→poll→publish) pipeline to a 2-step (create→publish-intent) one; `apps update` drops the two metadata flags and gains `--icon`, which dispatches a second `POST /api/v1/apps/{app}/icon` call alongside the existing `PATCH`.

The single most important behavioural invariant is **negative**: after this phase, no CLI code path may issue `POST /api/v1/apps/{app}/builds`. The v1 route returns 405 and the legacy route 404 for a user PAT [VERIFIED: apps-web-app/.planning/phases/189-build-staff-only/189-01-SUMMARY.md], so a lingering trigger would surface as an opaque runtime error. The ship integration tests must therefore assert request *absence* (`requests.filter(r => /\/builds$/.test(r.path)).length === 0`), not just the happy-path exit code. The confirm-gate machinery (`wantYes = --yes||--confirm`, `printPreview`, exit 3, the single `{steps,final_state}` ledger) is preserved verbatim — only the steps between create and publish are removed.

The one genuinely new transport is `ops.setIcon` → `POST /api/v1/apps/{app}/icon`. Its response shape differs from every other write op in this CLI: it returns **`200 { icon_url }`** (a flat, non-`{data:}`, non-204 body), and on SSRF/validation failure a Laravel **422 `{ message, errors: { icon_url: [...] } }`**. This means `setIcon` must NOT call `unwrap`, the CLI must read `res.icon_url`, and the 422 rides the existing `renderError` fallback (`err.message` from `payload.message`) — it is NOT a `prerequisite_failed` envelope, so it takes `renderError`'s else-branch.

**Primary recommendation:** Treat this as a deletion-first refactor. Delete `ops.triggerBuild`, `pollBuild`, the `test/unit/ship.test.mjs` pollBuild file, and the build/poll ledger steps; then collapse `ship` to create→publish; then rescope `apps update` and add `ops.setIcon`; then update the three doc/test surfaces. Gate on `npm test` + lint (`eslint --ext .mjs`) + typecheck (`tsc --noEmit` via JSDoc) green. Keep the runtime `dependencies` object empty.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Create app | CLI arg-parse + `ops.createApp` | Backend `POST /api/v1/apps` | CLI maps `--url`/`--name` to body; backend owns persistence |
| Publish-intent | CLI `case 'ship'`/`case 'publish'` + `ops.publishApp` | Backend `StartPublication` | CLI signals intent; backend starts publication (no build dependency) [VERIFIED: StartPublication.php] |
| Build issuance | **Backend staff surface ONLY** | — | Removed from CLI entirely (D-02). v1 → 405, legacy → 404 for user PAT [VERIFIED: 189-01-SUMMARY] |
| Build status read | CLI `case 'status'` + `ops.getApp`/`ops.getBuild` | Backend `GET .../builds[/{id}]` | Reads stay on the user surface; only issuance/polling removed |
| Config edit (name/url) | CLI `apps update` + `apiFetch PATCH` | Backend `PATCH /api/v1/apps/{app}` (name+base_url only) | Backend silently ignores other fields [VERIFIED: 190-01-SUMMARY] |
| Icon set | CLI `apps update --icon` + new `ops.setIcon` | Backend `POST .../icon` + `SetIconFromUrl` (SSRF guard) | CLI passes the https URL; ALL SSRF/validation enforcement is server-side [VERIFIED: SetIconFromUrl.php] |
| Confirm-gate (publish) | CLI `printPreview` + `wantYes` decision | — | Client-side gate (exit 3); v1 POSTs are not preview-gated server-side |
| Error rendering | CLI `renderError` | Backend error envelopes | `prerequisite_failed` → actionable block; everything else (incl. icon 422) → `err.message` |

## Standard Stack

### Core (already in the repo — nothing to install)

| Module | Version | Purpose | Why Standard |
|--------|---------|---------|--------------|
| Node built-in `fetch` | Node ≥18 | All HTTP via `src/api.mjs` | Project is dependency-free by mandate; runtime `dependencies` MUST stay `{}` [VERIFIED: package.json `dependencies: {}`] |
| `vitest` | 1.6.1 (devDep) | `test/unit/` + `test/integration/` | Existing test runner; `npm test` = `vitest run` [VERIFIED: package.json scripts] |
| `eslint` | 8.57.1 (devDep) | Lint; `eslint --ext .mjs bin/ src/ test/` | eslint 8 needs explicit `--ext .mjs` [VERIFIED: STATE.md Phase 05] |
| `typescript` | 5.9.3 (devDep) | `tsc --noEmit` typecheck via JSDoc (`--checkJs`) | No `@ts-ignore`; targeted JSDoc only [VERIFIED: STATE.md Phase 05] |

### Supporting (reused verbatim — DO NOT rebuild)

| Asset | Location | Purpose | Reuse In |
|-------|----------|---------|----------|
| `ops.publishApp` | `src/ops.mjs:48` | `POST .../publish` → 204 (null). Resolving == success. Do NOT unwrap. | `ship` publish-intent step; `case 'publish'` (unchanged) |
| `ops.createApp` | `src/ops.mjs:18` | `POST /api/v1/apps` → 201 `{data}` | `ship` create step; `apps create` (unchanged) |
| `printPreview` | `src/cli.mjs:205` | Human render of a pending publish | `ship` gate (verbatim) |
| `confirmGate` / `wantYes` | `src/cli.mjs:222` / `:657` | Exit-3 gate decision | `ship` reuses the DECISION (`wantYes`), NOT `confirmGate` (it emits a competing --json object) |
| `renderError` | `src/cli.mjs:236` | `prerequisite_failed` → blocked; else → `err.message` | icon 422 rides the else-branch |
| `apiFetch` (env-threaded) | `src/api.mjs:11` | Auth + envelope-throw on non-2xx (`err.status`, `err.envelope`) | new `ops.setIcon` |
| `installMockFetch`/`stubToken`/`requests`/`lastRequest` | `test/helpers/mockFetch.mjs` | FIFO canned-response stub; records `{method,path,url,body,headers}` | all reshaped tests |
| per-worker `APPO_CONFIG_HOME` isolation | `test/helpers/setup.mjs` | Defeats vitest parallel-fork config race | unchanged |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Two separate calls in `apps update` (PATCH + POST /icon) | One combined call | Rejected by D-04 — icon is its own backend route; there is no combined endpoint. Two calls is the only correct shape. |
| `ops.setIcon` returning unwrapped data | unwrap as the other ops do | WRONG — the icon endpoint returns a flat `{ icon_url }` (no `{data:}` envelope). `unwrap` is a harmless no-op on a flat object (same as `getPreview`), but do not rely on it. Read `res.icon_url` directly. |

**Installation:** None. `npm install` adds nothing; runtime `dependencies` stays `{}`.

**Version verification:** No new packages — version verification N/A. The four devDeps above are already pinned in `package-lock.json` (Phase 05). [VERIFIED: package.json]

## Architecture Patterns

### System Architecture Diagram

```
                 argv
                  │
                  ▼
            parseArgs() ───────────────► usage error (exit 2, no HTTP)
                  │
         ┌────────┴─────────┐
         ▼                  ▼
   case 'ship'        case 'apps' update
         │                  │
   ┌─────┴──────┐     ┌─────┴───────────────┐
   │ (new-app?) │     │ name/url given?     │
   │  createApp │     │   → PATCH /apps/{id}│  (name+base_url only)
   │     │      │     │ icon given?         │
   │     ▼      │     │   → POST /apps/{id}/ │  (ops.setIcon)
   │  publish-  │     │       icon          │
   │  intent    │     └─────────┬───────────┘
   │ (ops.      │               │
   │  publishApp)│              ▼
   │     │      │        renderError on 422
   │   gate?    │        (icon SSRF/validation)
   │ (wantYes)  │
   └─────┬──────┘
         │
   ┌─────┴───────────────┐
   │ shipReport ledger    │
   │ {steps:[create,      │
   │   publish],          │
   │   final_state}       │
   └─────┬───────────────┘
         ▼
   exit: 0 shipped / 1 blocked / 2 usage / 3 gated

   ── REMOVED ──────────────────────────────────────────
   ✗ ops.triggerBuild  → POST /apps/{id}/builds  (now 405/404)
   ✗ pollBuild loop    → GET  /apps/{id}/builds/{bid} (poll)
   ✗ build + poll ledger steps
   (build STATUS reads via case 'status' are RETAINED)
```

A reader can trace the new primary use case (`appo ship --url --name --yes`) as: parseArgs → createApp (POST /apps) → publish-intent (POST /apps/{id}/publish, 204) → ledger emits `shipped`, exit 0. No `/builds` request appears anywhere on that path.

### Recommended Project Structure (unchanged — refactor in place)

```
src/
├── cli.mjs       # case 'ship' (reshaped), case 'apps' update (rescoped), DELETE pollBuild
├── ops.mjs       # DELETE triggerBuild, ADD setIcon
└── api.mjs       # unchanged (apiFetch throws envelope on non-2xx)
test/
├── unit/ship.test.mjs        # DELETE (pollBuild-only file)
├── integration/ship.test.mjs # reshape: assert create→publish, NO /builds
├── integration/write-verbs.test.mjs # drop --meta-*, add --icon happy + 422
└── integration/docs.test.mjs # COMMANDS list unchanged (apps update stays); doc bodies change
README.md, llms.txt           # ship + apps sections rewritten
```

### Pattern 1: Reshaped `case 'ship'` (create → publish-intent)

**What:** Collapse the 4-step ledger to 2 steps. Delete the build trigger (`:690`–`:699`), the poll loop (`:701`–`:724`), and the `--timeout` plumbing (`:705`–`:706`, `timeoutSecs`). Keep the create step, the gate decision, and the publish step. The `EXIT` map loses `failed`/`timeout` paths (no build to fail) but keeps `shipped`/`gated`/`blocked`.

**When to use:** This is the core of SC-1.

**Reshaped flow (grounded in current `src/cli.mjs:640`–`:740`):**

```javascript
// Source: derived from src/cli.mjs case 'ship' (current 4-step) → 2-step
case 'ship': {
  const hasId = sub && !sub.startsWith('--');
  if (!hasId && (!flags.url || !flags.name)) {
    console.error('Usage: appo ship --url <u> --name <n> [--stores <list>] [--yes] [--json]  |  appo ship <id> [--yes]');
    return 2;                                  // usage error BEFORE any HTTP / ledger
  }
  const json = flags.json === true;
  const wantYes = flags.yes === true || flags.confirm === true;
  const stores = parseStores(flags.stores);
  const { log, record, finish } = shipReport(json);
  const handleBlock = (err, step, extra = {}) => {
    if (!json) throw err;                       // human → top-level renderError
    record({ step, status: 'blocked', code: err.envelope?.code, message: err.message, ...extra });
    return finish('blocked', EXIT.blocked);
  };

  let appId = hasId ? sub : null;

  // STEP create (new-app form only) — metadata params DROPPED (dead on user surface).
  if (!appId) {
    let app;
    try {
      app = await ops.createApp(apiBase, { name: flags.name, base_url: flags.url }, env);
    } catch (err) { return handleBlock(err, 'create'); }
    appId = (app || {}).id;
    record({ step: 'create', status: 'ok', app_id: appId });
    log(`> create ... ok app #${appId}`);
  }

  // STEP publish-intent — REPLACES build+poll. publishApp on a never-built app is
  // valid (StartPublication has no build dependency).
  const preview = { will: 'publish', app_id: previewId(appId), target_stores: stores };
  if (!wantYes) {
    if (!json) printPreview(preview);
    record({ step: 'publish', status: 'gated', target_stores: stores });
    return finish('gated', EXIT.gated);         // NO publish POST — gate invariant
  }
  log(`> publish ...`);
  try {
    await ops.publishApp(apiBase, appId, stores, env);  // 204 == success
  } catch (err) {
    if (!json) console.error(`  (app #${appId} exists — resume with: appo ship ${appId})`);
    return handleBlock(err, 'publish', { app_id: appId });
  }
  record({ step: 'publish', status: 'ok', target_stores: stores });
  // Discretion: short submit line + tracking hint.
  log(`ok submitted: ${stores.join(', ')} — Appo will build and submit it.`);
  log(`  track: appo status ${appId}   preview: appo preview ${appId}`);
  return finish('shipped', EXIT.shipped);
}
```

**Notes on the discretion calls (from CONTEXT, recommended defaults adopted above):**
- Ledger kept as a shorter `{steps:[create?, publish], final_state}` object. `final_state` ∈ `{shipped, gated, blocked}`. `failed`/`timeout` final states are gone (no build).
- `--timeout` and `--stores`-for-poll references in USAGE/README must drop the "poll a build" wording. `--stores` stays (still a publish override). `--timeout` is removed from USAGE/help/README (it only governed the poll).

### Pattern 2: Build-transport removal (no orphan references)

**What:** Delete `ops.triggerBuild` (`src/ops.mjs:25`–`:35`, including the doc comment) and `pollBuild` (`src/cli.mjs:249`–`:282`, including `realSleep` if unused elsewhere — it is only used by `pollBuild`). Delete the `test/unit/ship.test.mjs` file (it imports `pollBuild` and tests nothing else).

**Verified reference inventory (grep) — exactly 5 source call sites + 1 unit-test file:**

| Symbol | Source refs | Test refs | Action |
|--------|-------------|-----------|--------|
| `triggerBuild` | `ops.mjs:33` (def), `cli.mjs:692` (call) | `ship.test.mjs:64/81/94` (canned responses + comments) | delete def + call; remove the 202 canned-build responses from ship.test |
| `pollBuild` | `cli.mjs:268` (def, export), `cli.mjs:707` (call) | `test/unit/ship.test.mjs` (import + 4 tests) | delete def/export/call; delete the unit file |
| `realSleep` | `cli.mjs:249` (def, only used by pollBuild) | — | delete (dead after pollBuild removal) |

[VERIFIED: grep across src/ test/ — no other references]

**Critical:** `pollBuild` is a named **export** of `cli.mjs` (`export async function pollBuild`). Deleting it removes the export; the only importer is `test/unit/ship.test.mjs`, which is itself deleted. `getBuild` (`ops.mjs:43`) and `case 'status'`'s `/builds/{id}` read (`cli.mjs:551`) are NOT touched — status reads survive (D-02).

**When to use:** SC-2.

### Pattern 3: `apps update` rescope (drop metadata, keep PATCH)

**What:** In the `case 'apps'` update branch (`src/cli.mjs:529`–`:543`), remove the two `if (flags['meta-name'])`/`if (flags['meta-desc'])` body mappings and update the usage string. Keep the `name`/`base_url` PATCH. Then layer in the icon branch (Pattern 4).

**Also drop the dead metadata params from `ops.createApp`** (`src/ops.mjs:18`–`:23`): `metadata_name`/`metadata_description` are now dead on the user surface (the v1 create/update both ignore them server-side) [VERIFIED: 190-01-SUMMARY — UpdateRequest reduced to name+base_url]. Removing them from the op signature and the two call sites (`apps create` at `cli.mjs:503`, `ship` create at `cli.mjs:678` — the latter already removed in Pattern 1) keeps the tree clean per CLAUDE.md "delete old code completely". **Note (ASSUMED):** the v1 *create* (`POST /api/v1/apps`) field set is assumed to mirror the update lock (name+base_url only). The 190 summaries explicitly cover update + MCP configure; create is not named. Low-risk (sending ignored fields is harmless), but flagged in the Assumptions Log.

```javascript
// Source: derived from src/cli.mjs case 'apps' update branch (:529)
if (sub === 'update') {
  const id = rest[0];
  const usage = 'Usage: appo apps update <id> [--name <n>] [--url <u>] [--icon <https-url>]';
  if (!id) { console.error(usage); return 2; }

  const body = {};
  if (flags.name) body.name = flags.name;
  if (flags.url)  body.base_url = flags.url;
  const wantIcon = typeof flags.icon === 'string' && flags.icon;

  if (Object.keys(body).length === 0 && !wantIcon) { console.error(usage); return 2; }

  // Two-call dispatch (D-04): PATCH first (name/url), THEN POST /icon.
  let iconUrl;
  if (Object.keys(body).length > 0) {
    await apiFetch(apiBase, 'PATCH', `/api/v1/apps/${id}`, body, env);   // 204 -> null
  }
  if (wantIcon) {
    const res = await ops.setIcon(apiBase, id, flags.icon, env);         // 200 { icon_url }
    iconUrl = res?.icon_url;
  }

  if (flags.json) {
    // PATCH is 204 (null); icon returns { icon_url }. Emit a small combined object
    // when icon ran, else preserve the prior `null` for a PATCH-only update.
    console.log(wantIcon ? JSON.stringify({ icon_url: iconUrl }) : 'null');
    return 0;
  }
  console.log(`Updated app ${id}.`);
  if (wantIcon) console.log(`  icon set: ${iconUrl}`);
  return 0;
}
```

**Discretion flag (ASSUMED):** the exact `--json` shape when *both* PATCH and icon run is not specified in CONTEXT. Recommended: emit `{ icon_url }` when icon ran (the only non-null body available), else `null`. The planner/discuss may prefer always-`null` for PATCH-only and `{icon_url}` only-when-icon — adopted above. Flagged in Assumptions Log.

**Guard note:** `--icon` value handling must mirror the `--api`/`--env`/`--token` empty-value guards (`flags.icon === true` or `''` = usage error) so a bare `--icon` with no value does not POST an empty/garbage URL. Use the `typeof flags.icon === 'string' && flags.icon` test shown above (a bare `--icon` parses as boolean `true`, which fails the `typeof === 'string'` check and falls through to the usage error when it is the only flag).

### Pattern 4: New `ops.setIcon` op

**What:** Add one op to `src/ops.mjs`, same shape as `publishApp` but reading a flat response.

```javascript
// Source: derived from src/ops.mjs op shape + AppController::setIcon contract
// POST /api/v1/apps/{id}/icon -> 200 { icon_url } (flat, NOT a {data:} envelope).
// 422 { message, errors: { icon_url: [...] } } on SSRF/validation reject.
// Do NOT unwrap — the body is flat. Read res.icon_url at the call site.
export async function setIcon(apiBase, id, icon_url, env) {
  return apiFetch(apiBase, 'POST', `/api/v1/apps/${id}/icon`, { icon_url }, env);
}
```

**Why no `unwrap`:** `getPreview` already shows the flat-response precedent (`src/ops.mjs:54` — "unwrap is a harmless no-op here"). The icon response `{ icon_url }` has no `data` key, so `unwrap` would pass it through unchanged. For clarity, return the raw `apiFetch` result and read `res.icon_url`.

**The 422 path:** A SSRF/validation reject is a Laravel `ValidationException` → `422 { message: "...", errors: { icon_url: ["The icon URL must use https."] } }` [VERIFIED: SetIconFromUrl.php `reject()` + AppController::setIcon]. `apiFetch` throws with `err.status = 422`, `err.message = payload.message`, `err.envelope = payload`. This is NOT `prerequisite_failed`, so `renderError` takes the else-branch and prints `Error: <message>` (exit 1). No new error plumbing needed — wire the icon call inside the existing top-level `try` (it already is, since the whole `switch` is wrapped).

### Anti-Patterns to Avoid

- **Leaving a `/builds` call reachable.** Any surviving `triggerBuild`/poll path hits a 405/404 at runtime — an opaque failure. The ship tests MUST assert request *absence*, not just exit 0.
- **`unwrap`-ing the icon response.** It is flat; treat it like `getPreview`.
- **Routing the icon 422 through a `prerequisite_failed` branch.** It is a plain validation envelope — it belongs in `renderError`'s `err.message` fallback.
- **Combining PATCH + icon into one request.** There is no combined endpoint; D-04 mandates two calls, PATCH first.
- **Keeping `--timeout` in help/README.** It only governed the deleted poll loop; remove it from USAGE, help, and the README ship section.
- **Coercing the `apps update` PATCH-only `--json` away from `null`.** The PATCH is 204 (Pitfall 5 precedent); keep `null` for PATCH-only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSRF / image validation on the icon URL | Any client-side URL/host/mime/size checks | Pass the raw `--icon` URL straight to `POST .../icon` | ALL enforcement is server-side in `SetIconFromUrl` (https-only, private-IP reject, DNS-rebind pin, ≤5 MB, mime allow-list). Client-side checks would duplicate and drift. [VERIFIED: SetIconFromUrl.php] |
| Publish-intent transport | A new op for "publish intent" | Reuse `ops.publishApp` verbatim | It already issues `POST .../publish` → 204. The intent IS the publish call. |
| Confirm-gate / preview | Re-implement the gate | Reuse `printPreview` + the `wantYes` decision | Existing machinery; `ship` already does this (do NOT call `confirmGate` — it emits a competing --json object). |
| Error envelope rendering | A bespoke icon-error printer | `renderError` else-branch | `apiFetch` already populates `err.message` from `payload.message`. |
| Test HTTP | A new mock | `installMockFetch`/`stubToken` FIFO stub | Existing substrate; just change the canned-response queue (drop the 202 build response). |

**Key insight:** This phase's correctness is dominated by what you *remove* and *do not duplicate*. The only net-new code is a 3-line `ops.setIcon` and a small `apps update` icon branch; everything else is deletion plus message edits.

## Runtime State Inventory

> This is a code-only refactor of a stateless CLI. No datastore, live-service config, OS registration, secret, or build-artifact state is renamed or migrated.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — the CLI persists only `~/.appo/config.json` (profiles + token). No build/poll state is stored. [VERIFIED: grep config.mjs — no build keys] | None |
| Live service config | None — the backend routes already changed (apps-web-app 189/190, shipped). This phase consumes them; it registers nothing externally. | None |
| OS-registered state | None — no scheduled tasks, daemons, or pm2 processes. | None |
| Secrets/env vars | `APPO_TOKEN`/`APPO_ENV`/`APPO_API_BASE` are read-only consumed; no name changes. The `--timeout` flag is removed but it was never persisted. | None |
| Build artifacts / installed packages | None new. `package.json` `dependencies` stays `{}`; no `.egg-info`/compiled output. The published tarball `files` list (`bin`, `src`, `README.md`, `llms.txt`) is unaffected by file *edits* (no files added/removed from `src/`). | None — but re-verify `npm pack --dry-run` is unchanged at the gate if any file is added/deleted (none planned). |

**The canonical question:** After every file is edited, no runtime system holds a stale "build trigger" registration — the CLI never registered one; build issuance always went over HTTP to a route that is now staff-only. Nothing cached, stored, or registered survives the edit.

## Common Pitfalls

### Pitfall 1: Asserting only the happy path in ship tests
**What goes wrong:** A reshaped `ship` test checks `exit === 0` and the publish body, but a lingering `triggerBuild` call would still "pass" if the mock queue happened to absorb it.
**Why it happens:** The FIFO mock returns the last queued response repeatedly; an extra request is silently consumed.
**How to avoid:** Every ship test asserts `requests.filter(r => /\/builds$/.test(r.path)).length === 0`. Also assert the FIRST request is `POST /apps` (create form) or `POST .../publish` (id form), never `.../builds`.
**Warning signs:** A ship test still queues a `{ status: 202, ... }` build response.

### Pitfall 2: `setIcon` 422 mis-routed as `prerequisite_failed`
**What goes wrong:** The icon SSRF reject is rendered as a "Blocked: ... Next: dashboard_url" line that doesn't exist for validation errors, or worse, throws on `env.details.dashboard_url`.
**Why it happens:** Confusing the icon 422 (Laravel validation) with the publish/build `prerequisite_failed` envelope.
**How to avoid:** Let it fall through `renderError`'s else-branch (`Error: <message>`). The 422 envelope has `{message, errors}`, not `{error:'prerequisite_failed', details}`. No special-casing.
**Warning signs:** A conditional on `err.envelope.error === 'prerequisite_failed'` is reached for the icon path.

### Pitfall 3: Two-call `apps update` partial-failure ordering
**What goes wrong:** Icon POST runs before the PATCH, or a PATCH failure still attempts the icon POST.
**Why it happens:** Unordered dispatch.
**How to avoid:** PATCH first, then icon (D-04). Because both ride the top-level `try`, a PATCH throw skips the icon call and renders the error — acceptable (the user re-runs). Document this: there is no transaction; on a PATCH failure the icon is not set.
**Warning signs:** The icon POST appears before the PATCH in `requests`.

### Pitfall 4: Stale docs/help mentioning build/poll/timeout/metadata
**What goes wrong:** README/llms.txt/USAGE still say "create → build → poll → publish" or list `--meta-name`/`--meta-desc`/`--timeout`, and `docs.test.mjs` may pass (it greps command *names*, not flag bodies) — so the drift ships silently.
**Why it happens:** `docs.test.mjs` only asserts each COMMAND token is present; it does not assert removed flags are absent.
**How to avoid:** Manually rewrite the ship + apps sections (README `:20`–`:50`, `:97`–`:115`; USAGE `cli.mjs:33`/`:36`/`:39`/`:55`). Consider adding a negative assertion to `docs.test.mjs` (`expect(README).not.toContain('--meta-name')`) to lock it.
**Warning signs:** Grep for `meta-name|meta-desc|--timeout|poll` in README/llms.txt/cli.mjs USAGE returns hits after the change.

### Pitfall 5: `apps update` `--json` body shape regression
**What goes wrong:** A PATCH-only update stops emitting `null` (existing contract, tested at `write-verbs.test.mjs:69`).
**Why it happens:** The icon branch changes the `--json` emit unconditionally.
**How to avoid:** Keep `null` for PATCH-only; emit `{icon_url}` only when `--icon` ran. The existing `apps update --json on a 204 prints "null"` test must still pass.
**Warning signs:** `write-verbs.test.mjs:69` fails.

## Code Examples

### Reshaped ship integration test (happy path, new-app form)
```javascript
// Source: derived from test/integration/ship.test.mjs:60 (build/poll responses removed)
test('ship --url --name --yes creates then publishes, NO /builds, exit 0', async () => {
  stubToken();
  installMockFetch([
    { status: 201, body: { data: { id: 5 } } },  // createApp
    { status: 204 },                              // publishApp (intent) — NO build, NO poll
  ]);
  const { result } = await captureLog(() =>
    run(['ship', '--url', 'https://x', '--name', 'X', '--yes', '--api', 'http://test.local']));
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.path).toMatch(/\/api\/v1\/apps\/5\/publish$/);
  expect(req.body).toEqual({ app_stores: ['apple_appstore', 'google_playstore'] });
  expect(requests.filter(r => /\/builds$/.test(r.path)).length).toBe(0);  // SC-1/SC-2 invariant
});
```

### Reshaped ship gate test (no --yes → exit 3, no publish)
```javascript
// Source: derived from ship.test.mjs:144 (build/poll responses removed)
test('ship <id> without --yes -> exit 3, NO publish POST, NO /builds', async () => {
  stubToken();
  installMockFetch([{ status: 204 }]);  // never reached — gate fires first
  const { result } = await captureLog(() => run(['ship', '5', '--api', 'http://test.local']));
  expect(result).toBe(3);
  expect(requests.filter(r => /\/publish$/.test(r.path)).length).toBe(0);
  expect(requests.filter(r => /\/builds$/.test(r.path)).length).toBe(0);
});
```

### New `apps update --icon` happy-path test
```javascript
// Source: new — mirrors write-verbs.test.mjs:41 shape
test('apps update --icon POSTs /icon with icon_url and reports it', async () => {
  stubToken();
  installMockFetch([{ status: 200, body: { icon_url: 'https://cdn/x.png' } }]);
  const { result, lines } = await captureLog(() =>
    run(['apps', 'update', '7', '--icon', 'https://src/x.png', '--api', 'http://test.local']));
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.method).toBe('POST');
  expect(req.path).toMatch(/\/api\/v1\/apps\/7\/icon$/);
  expect(req.body).toEqual({ icon_url: 'https://src/x.png' });
  expect(lines.join('\n')).toMatch(/cdn\/x\.png/);
});
```

### New icon 422 SSRF-reject test
```javascript
// Source: new — exercises renderError else-branch on a Laravel 422
test('apps update --icon 422 (SSRF reject) -> exit 1, surfaces the message', async () => {
  stubToken();
  installMockFetch([{ status: 422, body: { message: 'The icon URL must use https.', errors: { icon_url: ['The icon URL must use https.'] } } }]);
  const { result, lines } = await captureAll(() =>
    run(['apps', 'update', '7', '--icon', 'http://insecure/x.png', '--api', 'http://test.local']));
  expect(result).toBe(1);
  expect(lines.join('\n')).toMatch(/must use https/);
});
```

### New PATCH-then-icon two-call ordering test
```javascript
// Source: new — proves D-04 ordering (PATCH first, icon second)
test('apps update --name --icon runs PATCH then POST /icon in order', async () => {
  stubToken();
  installMockFetch([
    { status: 204 },                                       // PATCH
    { status: 200, body: { icon_url: 'https://cdn/x.png' } }, // POST /icon
  ]);
  await captureLog(() => run(['apps', 'update', '7', '--name', 'New', '--icon', 'https://src/x.png', '--api', 'http://test.local']));
  expect(requests[0].method).toBe('PATCH');
  expect(requests[0].path).toMatch(/\/api\/v1\/apps\/7$/);
  expect(requests[1].method).toBe('POST');
  expect(requests[1].path).toMatch(/\/api\/v1\/apps\/7\/icon$/);
});
```

## State of the Art

| Old Approach (pre-Phase 7) | Current Approach (Phase 7) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ship` = create→build→poll→publish | `ship` = create→publish-intent | this phase | No client-side build; staff issue builds server-side |
| CLI triggers builds via `POST .../builds` | Build issuance removed from CLI | apps-web-app 189 (2026-06-21) + this phase | v1 → 405, legacy → 404 for user PAT |
| `apps update` edits name/url/meta-name/meta-desc | `apps update` edits name/url/**icon** | apps-web-app 190 (2026-06-22) + this phase | Metadata silently ignored server-side; icon is a new SSRF-guarded route |
| `--timeout` governs the poll | (flag removed) | this phase | No poll to time out |

**Deprecated/outdated:**
- `ops.triggerBuild`, `pollBuild`, `realSleep`, the build/poll ledger steps, `--timeout`, `--meta-name`, `--meta-desc`, and `createApp`'s `metadata_name`/`metadata_description` params — all deleted.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The v1 *create* endpoint (`POST /api/v1/apps`) also ignores/forbids `metadata_*` (the 190 summaries explicitly cover only update + MCP configure). | Pattern 3 | LOW — dropping the create-side params is safe regardless; if create still accepted them, we lose nothing user-facing (the decision is to not expose metadata on the CLI at all). |
| A2 | `apps update --json` should emit `{icon_url}` when icon ran, else `null`. CONTEXT does not specify the combined-call `--json` shape. | Pattern 3 | LOW — cosmetic JSON contract; planner/discuss can pick always-`null` or a `{patched, icon_url}` object. Confirm before locking the test. |
| A3 | The icon 200 response body is `{ icon_url }` exactly (controller returns `response()->json(['icon_url' => ...])`). | Pattern 4 | LOW — VERIFIED in AppController::setIcon; listed as assumption only because the CLI never round-trips it live in this phase. |

## Open Questions

1. **`ship --json` `final_state` enum after build removal**
   - What we know: `final_state` ∈ `{shipped, gated, blocked}` post-reshape (`failed`/`timeout` are gone).
   - What's unclear: whether any external consumer parses `final_state: 'failed'` (none in this repo; the CLI is the only producer).
   - Recommendation: drop `failed`/`timeout` from the `EXIT` map and `final_state`; a publish error becomes `blocked` (exit 1), consistent with the current `handleBlock` path.

2. **Should `--stores` remain on `ship`?**
   - What we know: `--stores` still maps to the publish body (`app_stores`), independent of build.
   - What's unclear: nothing — it is a valid publish override.
   - Recommendation: keep `--stores`; remove only `--timeout`.

## Environment Availability

> This phase is code/config-only (no new external tools or services). The dev toolchain already exists.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | runtime + tests | ✓ (assumed local) | ≥18 (built-in fetch) | — |
| vitest | test gate | ✓ devDep | 1.6.1 | — |
| eslint | lint gate | ✓ devDep | 8.57.1 | — |
| typescript | typecheck gate | ✓ devDep | 5.9.3 | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 1.6.1 |
| Config file | `vitest.config.mjs` (existing) |
| Quick run command | `npx vitest run test/integration/ship.test.mjs test/integration/write-verbs.test.mjs` |
| Full suite command | `npm test` (= `vitest run`) |

### Phase Requirements → Test Map
| SC | Behavior | Test Type | Automated Command | File Exists? |
|----|----------|-----------|-------------------|-------------|
| SC-1 | `ship --url --name` creates then publish-intent, no /builds, no poll | integration | `npx vitest run test/integration/ship.test.mjs -t "creates then publishes"` | ❌ Wave 0 (reshape) |
| SC-1 | `ship <id>` signals (re)publish-intent, first request is `POST .../publish` | integration | `npx vitest run test/integration/ship.test.mjs -t "without --yes"` | ❌ Wave 0 (reshape) |
| SC-2 | No code path issues `POST .../builds` (assert request absence in every ship test) | integration | `npx vitest run test/integration/ship.test.mjs` | ❌ Wave 0 |
| SC-2 | `triggerBuild`/`pollBuild` removed (source grep returns 0) | static | `! grep -rn "triggerBuild\\|pollBuild" src/` | ❌ Wave 0 (new guard) |
| SC-3 | `apps update --icon` → `POST .../icon` with `{icon_url}` | integration | `npx vitest run test/integration/write-verbs.test.mjs -t "icon POSTs"` | ❌ Wave 0 (new) |
| SC-3 | `apps update --icon` 422 → exit 1, message surfaced | integration | `npx vitest run test/integration/write-verbs.test.mjs -t "SSRF reject"` | ❌ Wave 0 (new) |
| SC-3 | `--meta-name`/`--meta-desc` removed (the two old mapping tests deleted; PATCH still maps name/url) | integration | `npx vitest run test/integration/write-verbs.test.mjs` | ❌ Wave 0 (edit) |
| SC-3 | PATCH-then-icon ordering when both given | integration | `npx vitest run test/integration/write-verbs.test.mjs -t "PATCH then POST"` | ❌ Wave 0 (new) |
| SC-4 | README/llms.txt document the surface; no `--meta-*`/`--timeout`/build-poll wording | unit | `npx vitest run test/integration/docs.test.mjs` + add negative grep asserts | ⚠️ exists; needs negative assertions |
| SC-4 | Full gate green | suite | `npm test && npm run lint && npm run typecheck` | ✓ scripts exist |

### Sampling Rate
- **Per task commit:** `npx vitest run test/integration/ship.test.mjs test/integration/write-verbs.test.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** `npm test && npm run lint && npm run typecheck` all green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] Reshape `test/integration/ship.test.mjs` — drop all 202 build / 200 poll canned responses; add `no /builds` assertion to every retained case; delete the `failed`/`timeout`/`platform-leak` cases (no build to fail/leak). Covers SC-1, SC-2.
- [ ] Delete `test/unit/ship.test.mjs` — it imports only `pollBuild`. Covers SC-2.
- [ ] Edit `test/integration/write-verbs.test.mjs` — delete the two `--meta-name`/`--meta-desc` mapping tests (`:53`, `:61`); add `--icon` happy path, `--icon` 422 reject, and PATCH-then-icon ordering. Covers SC-3.
- [ ] Add a static guard (in `docs.test.mjs` or a small new unit) asserting `src/` contains no `triggerBuild`/`pollBuild` and README/llms.txt contain no `--meta-name`/`--meta-desc`/`--timeout`. Covers SC-2/SC-4 regression-lock.
- [ ] Framework install: none — toolchain present.

## Security Domain

> `security_enforcement` is not set in `.planning/config.json` (absent = enabled). This phase REMOVES attack surface (build trigger) and ADDS a client passthrough to an already-SSRF-hardened server route.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Unchanged — token auth via `apiFetch`/`storedToken`; no new auth path. |
| V3 Session Management | no | Unchanged. |
| V4 Access Control | yes (tightened) | Build issuance removed from the user surface; CLI cannot trigger a build (server enforces 405/404). The CLI is a client of the server's ability gating — no client-side access decision. |
| V5 Input Validation | yes | `--icon` URL is validated SERVER-SIDE (`SetIconFromUrl`: https-only, private-IP reject, mime, ≤5 MB). CLI does NO validation — it must not (would duplicate/drift). The CLI's only input guard is the empty-value flag check (`--icon` with no value = usage error). |
| V6 Cryptography | no | None — no crypto in this phase. |

### Known Threat Patterns for the Node CLI passing an icon URL

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSRF via user-supplied `--icon` URL | Information Disclosure / Tampering | Server-side `SetIconFromUrl` (DNS-rebind pin, private-IP reject, no-redirect, size/mime cap). CLI passes the URL unmodified — no client-side fetch. [VERIFIED: SetIconFromUrl.php] |
| Privilege escalation via build trigger | Elevation of Privilege | Removed — user PAT cannot reach `POST .../builds` (405/404). The CLI no longer even attempts it. [VERIFIED: 189-01-SUMMARY] |
| Token/credential leak in ledger or error | Information Disclosure | Unchanged — `apiFetch` 401 message is token-free; `renderError` prints `err.message` (server text), never the token. The icon URL is user-supplied (not a secret) and safe to echo back. |

## Project Constraints (from CLAUDE.md)

- **Delete old code completely** — no deprecation, no versioned names, no "removed code" comments. Applies directly: remove `triggerBuild`/`pollBuild`/`realSleep`/metadata params outright.
- **No migration code unless requested** — none needed (stateless CLI).
- **Concrete types, early returns, small focused functions** — the reshaped `case 'ship'` and `apps update` branch stay flat (early-return on usage/gate/error).
- **`fmt.Errorf`-equivalent error context** — N/A (JS); errors propagate via `apiFetch`'s `err.envelope`/`err.status`, rendered once by `renderError`.
- **ALWAYS run lint + tests before committing; no co-author / "Generated with Claude" lines** — phase gate is `npm test && npm run lint && npm run typecheck`.
- **Repository docs read as neutral** — README/llms.txt edits stay in product-documentation voice (no strategy/internal framing).
- The CLAUDE.md "UI Design Principles" / "Dashboard Page Patterns" do NOT apply (this is a terminal CLI, sibling-dashboard guidance only).

## Sources

### Primary (HIGH confidence)
- `src/cli.mjs` — `case 'ship'` (:640–:740), `case 'apps'` update (:529–:543), `pollBuild` (:249–:282), `realSleep` (:249), USAGE (:17–:76), `printPreview`/`confirmGate`/`renderError` (:205/:222/:236).
- `src/ops.mjs` — `createApp` (:18), `triggerBuild` (:33, delete), `getApp`/`getBuild` (:38/:43, keep), `publishApp` (:48, reuse), `getPreview` (:54, flat-response precedent).
- `src/api.mjs` — `apiFetch` throw shape (`err.status`/`err.envelope`/`err.message`), 204→null, 401 message.
- `test/helpers/mockFetch.mjs` + `test/helpers/setup.mjs` — FIFO stub, `requests`, `lastRequest`, `stubToken`, per-worker config isolation.
- `test/integration/ship.test.mjs`, `test/integration/write-verbs.test.mjs`, `test/integration/docs.test.mjs`, `test/unit/ship.test.mjs` — current test shapes.
- `apps-web-app/.planning/phases/189-build-staff-only/189-01-SUMMARY.md` — v1 builds POST → 405, legacy → 404; status reads retained.
- `apps-web-app/.planning/phases/190-user-config-icon-url-name/190-01-SUMMARY.md` — v1 update locked to name+base_url; legacy → 403 for user.
- `apps-web-app/.planning/phases/190-user-config-icon-url-name/190-02-SUMMARY.md` — `POST .../icon` contract + `set_icon` MCP tool.
- `apps-web-app/app/Actions/App/StartPublication.php` — publish-intent has no build dependency.
- `apps-web-app/app/Actions/App/SetIconFromUrl.php` — SSRF guards + 5 MB cap + mime allow-list + ValidationException(422).
- `apps-web-app/app/Http/Controllers/Api/V1/AppController.php` (:116–:129) — `setIcon` returns `200 { icon_url }`; owner-404; controller-level `icon_url` required|url.
- `package.json` — `dependencies: {}`, scripts (`test`/`lint`/`typecheck`/`prepublishOnly`), `files`.
- `.planning/config.json` — `nyquist_validation: true`, `granularity: coarse`, parallelization config.

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` Phase 02/05 decisions — ship orchestrator + ledger + test substrate provenance.

### Tertiary (LOW confidence)
- None — every claim is grounded in repo source or the shipped cross-repo summaries/actions.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every asset read directly from source; no new packages.
- Architecture (ship reshape, apps update rescope, setIcon): HIGH — grounded in current code + the live backend action/controller.
- Pitfalls: HIGH — derived from the actual mock substrate behaviour and the exact error-envelope shapes.
- Assumptions (A1–A3): flagged LOW-risk; none block planning.

**Research date:** 2026-06-22
**Valid until:** 2026-07-22 (stable — internal repo + already-shipped backend; re-check only if `apps-web-app` Phase 191 re-syncs the parity doc).
