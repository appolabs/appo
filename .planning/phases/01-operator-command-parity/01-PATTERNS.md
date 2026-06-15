# Phase 1: Operator command parity - Pattern Map

**Mapped:** 2026-06-15
**Files analyzed:** 8 (1 modified core file + 1 new shared helper + 6 conceptual verb groups within it)
**Analogs found:** 8 / 8 (every new verb has an in-repo analog; only `confirmGate` + exit code 3 are genuinely new)

> **Scope note for the planner.** This is a dependency-free Node ESM CLI with a single
> `switch (command)` dispatcher in `src/cli.mjs`. There is no framework, no router, no DI.
> "Files to create/modify" therefore collapses to **one file modified** (`src/cli.mjs`) plus an
> **optional** `src/commands/` split (Claude's discretion, D-cretion / CONTEXT D-09 area). The
> analogs are not separate files per verb — they are the **existing `apps create/list/show/set-name`
> branches inside `src/cli.mjs`**, which are the canonical template for all 8 new verbs. Treat the
> "file" rows below as *handler additions to `src/cli.mjs`*.

---

## File Classification

| New/Modified unit | Role | Data Flow | Closest Analog (file:lines) | Match Quality |
|-------------------|------|-----------|------------------------------|---------------|
| `src/cli.mjs` › `case 'status'` (overview + `--build`) | command handler (read) | request-response (GET) | `src/cli.mjs:123-131` (`apps show`) | exact |
| `src/cli.mjs` › `case 'build'` | command handler (write, async-trigger) | request-response (POST, returns id, no wait) | `src/cli.mjs:99-111` (`apps create` POST→print) | exact |
| `src/cli.mjs` › `case 'configure'` | command handler (write) | CRUD (PATCH, partial update) | `src/cli.mjs:132-140` (`apps set-name` PATCH→204) | exact |
| `src/cli.mjs` › `case 'rejection'` | command handler (read) | request-response (GET) | `src/cli.mjs:123-131` (`apps show`) | exact |
| `src/cli.mjs` › `case 'fix-recipe'` | command handler (read, collection) | request-response (GET, array under `data`) | `src/cli.mjs:112-122` (`apps list` array render) | role-match (collection shape) |
| `src/cli.mjs` › `case 'publish'` | command handler (destructive write) | request-response (POST→204, confirm-gated) | `src/cli.mjs:132-140` (`apps set-name` PATCH→204) + new `confirmGate` | role-match |
| `src/cli.mjs` › `case 'push'` | command handler (destructive write) | request-response (POST→201 w/ `additional`) | `src/cli.mjs:99-111` (`apps create` POST→print) + new `confirmGate` | role-match |
| `src/cli.mjs` › `case 'resubmit'` | command handler (destructive write) | request-response (POST→200, prerequisite hard-fail) | `src/cli.mjs:99-111` + new `confirmGate` + new error printer | role-match |
| `src/cli.mjs` › `confirmGate()` helper | utility (shared) | transform (flags+preview → print/exit) | **NO direct analog** — pattern modeled on `unwrap()` shape (`src/cli.mjs:58-60`) | new |
| `src/cli.mjs` › `printBuild()` / `printRejection()` / `printRecipe()` / `printPush()` printers | utility (presentation) | transform (data → stdout lines) | `src/cli.mjs:45-56` (`printApp`) | exact |
| `src/cli.mjs` › extended error catch (envelope `code`/`details`) | utility (error handling) | transform (err → actionable lines) | `src/cli.mjs:150-153` (top-level catch) | role-match (extend it) |

---

## Pattern Assignments

### `case 'status'` (read; GET overview, GET build) — analog `apps show`

**Analog:** `src/cli.mjs:123-131` (`apps show`).

**Read + unwrap + print pattern** (lines 123-131):
```javascript
if (sub === 'show') {
  if (!rest[0]) {
    console.error('Usage: appo apps show <id>');
    return 2;
  }
  const app = unwrap(await apiFetch(apiBase, 'GET', `/api/v1/apps/${rest[0]}`));
  printApp(app);
  return 0;
}
```

**What to mirror, what changes:**
- Same `if (!id) { console.error('Usage: ...'); return 2; }` guard → here `Usage: appo status <id> [--build <buildId>]`.
- Branch the path on `flags.build`:
  `flags.build ? `/api/v1/apps/${id}/builds/${flags.build}` : `/api/v1/apps/${id}``.
- `--json` short-circuit BEFORE unwrap: `if (flags.json) { console.log(JSON.stringify(res)); return 0; }` (D-08).
- Human path: `flags.build ? printBuild(unwrap(res)) : printApp(unwrap(res))`.
- `printApp` already surfaces `primary_action` (line 52) — the operator compass (CONTEXT specifics). Do not remove it.
- The v1 `GET /apps/{app}` is `AppResource` only (no `latest_build`/`push`) — do NOT enrich with a second call this phase (RESEARCH Open Question 2).

---

### `case 'build'` (async-trigger write; POST→202, never waits) — analog `apps create`

**Analog:** `src/cli.mjs:99-111` (`apps create`).

**Optional-flags → body → POST → print pattern** (lines 99-111):
```javascript
if (sub === 'create') {
  if (!flags.name || !flags.url) {
    console.error('Usage: appo apps create --name <n> --url <u>');
    return 2;
  }
  const body = { name: flags.name, base_url: flags.url };
  if (flags['meta-name']) body.metadata_name = flags['meta-name'];
  if (flags['meta-desc']) body.metadata_description = flags['meta-desc'];
  const app = unwrap(await apiFetch(apiBase, 'POST', '/api/v1/apps', body));
  console.log('Created app:');
  printApp(app);
  return 0;
}
```

**What to mirror, what changes:**
- Same "build `body` from optional flags" idiom (the `if (flags.x) body.field = flags.x` lines).
  For `build`: `if (flags.platform) body.platform = flags.platform;` (`ios|android|all`),
  `if (flags.branch) body.branch = flags.branch;` (regex `/^[A-Za-z0-9._\/-]+$/`, server-validated).
- POST returns **202** with `AppBuildResource` under `data` — `apiFetch` returns the parsed body; `unwrap` it.
- Print the build id and the poll hint (D-03, never waits):
  `console.log(`Build #${b.id} started (${b.platform}). Poll: appo status ${id} --build ${b.id}`);`
- `--json` short-circuit before unwrap.
- **Prerequisite hard-fail** (`422 prerequisite_failed`, codes `APP_BLOCKED`/`SUBSCRIPTION_INACTIVE`/`ICONS_MISSING`/`APPLE_*`) is surfaced via the shared error printer (see Shared Patterns › Error Handling).

---

### `case 'configure'` (CRUD partial update; PATCH→204) — analog `apps set-name`

**Analog:** `src/cli.mjs:132-140` (`apps set-name`).

**PATCH→204→success-line pattern** (lines 132-140):
```javascript
if (sub === 'set-name') {
  if (!rest[0] || !rest[1]) {
    console.error('Usage: appo apps set-name <id> <name>');
    return 2;
  }
  await apiFetch(apiBase, 'PATCH', `/api/v1/apps/${rest[0]}`, { name: rest.slice(1).join(' ') });
  console.log(`Updated app ${rest[0]}.`);
  return 0;
}
```

**What to mirror, what changes:**
- `apiFetch` PATCH returns `null` on 204 — do NOT `unwrap` it (Pitfall 5). Print a success line.
- Build `body` from optional flags, reusing the EXACT flag names already in `apps create` for consistency
  (D-cretion A1): `--name`→`name`, `--url`→`base_url`, `--meta-name`→`metadata_name`,
  `--meta-desc`→`metadata_description`, plus new `--injected-css`→`injected_css`,
  `--injected-js`→`injected_javascript`.
- Guard: if no recognized flag supplied → `Usage: appo configure <id> [--name ...] [--url ...] ...`, `return 2`.
- `--json` on a 204: emit `null` (RESEARCH Open Question 3 / Assumption A3) — verbatim-body semantics.

---

### `case 'rejection'` (read; GET, two-field allowlist, 404-as-state-probe) — analog `apps show`

**Analog:** `src/cli.mjs:123-131` (`apps show`).

Same single-GET + `--json` short-circuit + curated printer as `status` overview. New printer `printRejection(d)` renders `status` + `required_action`.

**Pitfall to encode (RESEARCH Pitfall 4):** the backend returns **404** for a non-REJECTED app
(state-probing guard), not an empty 200. In the human path interpret 404 here as "No active rejection
for this app" rather than a hard "not found". `--json` stays verbatim (`not_found` envelope).
This requires reading `err.status === 404` in the catch for these two verbs — handle in the verb or a
verb-aware branch of the shared error printer.

---

### `case 'fix-recipe'` (read; GET collection under `data`) — analog `apps list`

**Analog:** `src/cli.mjs:112-122` (`apps list`) for the array-iteration render shape.

**Collection render pattern** (lines 112-122):
```javascript
if (sub === 'list') {
  const apps = unwrap(await apiFetch(apiBase, 'GET', '/api/v1/apps')) || [];
  if (apps.length === 0) {
    console.log('No apps yet. Create one: appo apps create --name <n> --url <u>');
    return 0;
  }
  for (const a of apps) {
    console.log(`  ${String(a.id).padEnd(5)} ${a.name}  [${a.publication_state}]  ${a.base_url}`);
  }
  return 0;
}
```

**What to mirror, what changes:**
- `data` is an **array** of recipes (`{ slug, fix_type, agent_steps[], limitations[] }`). Use the same
  `const recipes = unwrap(res) || []; for (const r of recipes) { ... }` loop idiom.
- Same `--json` short-circuit before unwrap.
- Same 404-state-probe handling as `rejection` (a non-REJECTED app 404s; render as "no active rejection").
- New printer `printRecipe(r)` prints `slug`/`fix_type` then the `agent_steps`/`limitations` string arrays.

---

### `case 'publish'` (destructive; POST→204, client-side confirm-gate) — analog `apps set-name` + new `confirmGate`

**Analog (write+204):** `src/cli.mjs:132-140`. **Analog (gate):** none — new `confirmGate` helper.

**Pattern:**
```javascript
case 'publish': {
  if (!sub || !flags.stores) {
    console.error('Usage: appo publish <id> --stores apple_appstore,google_playstore --confirm');
    return 2;
  }
  const stores = String(flags.stores).split(',').map(s => s.trim()); // canonical AppStore tokens
  const gated = confirmGate(flags, { will: 'publish', app_id: Number(sub), target_stores: stores });
  if (gated !== null) return gated;                       // exit 3, NO write (D-04/D-05/D-07)
  await apiFetch(apiBase, 'POST', `/api/v1/apps/${sub}/publish`, { app_stores: stores }); // 204
  if (flags.json) { console.log('null'); return 0; }
  console.log(`Publication started for: ${stores.join(', ')}`);
  return 0;
}
```

**What to mirror:**
- `apps set-name` PATCH→204→success-line shape (no unwrap; print a line).
- Body field is `app_stores` (required array of `apple_appstore`/`google_playstore` — `AppStore` enum). `--stores` is a comma list of canonical tokens (D-cretion: optionally map `apple`/`google` aliases; body MUST send canonical tokens — RESEARCH Open Question 1).
- **409 conflict** (already published) is surfaced cleanly by the shared error printer.

---

### `case 'push'` (destructive; POST→201 with `additional.recipients_count`) — analog `apps create` + new `confirmGate`

**Analog (write+print):** `src/cli.mjs:99-111`. **Analog (gate):** new `confirmGate`.

**What to mirror, what changes:**
- Same optional-flags→body idiom as `apps create`: `title` (req, max 100), `body` (req, max 255),
  optional `image_path`/`target_url` (max 500), `scheduled_at`. Guard missing `--title`/`--body` → `return 2`.
- Gate preview OMITS the recipient count (Pitfall 2 — v1 exposes the count only post-send):
  `confirmGate(flags, { will: 'send_push', app_id: Number(sub), title: flags.title })`.
- On `--confirm`: POST returns **201**; full envelope is `{ data: {...}, recipients_count: <int> }`.
  Human render reads the count from the top-level envelope (NOT from `data`): `unwrap` gives `data`, but
  `recipients_count` is a sibling of `data` (`additional`) — read `res.recipients_count`.
  `console.log(`Sent to ${res.recipients_count} device(s).`);`
- `--json` prints the whole `res` verbatim (D-08).

---

### `case 'resubmit'` (destructive; POST→200, prerequisite hard-fail) — analog `apps create` POST + new `confirmGate` + new error branch

**Analog (write):** `src/cli.mjs:99-111`. **Analog (gate):** new `confirmGate`. **Analog (block):** extend the catch at `src/cli.mjs:150-153`.

**What to mirror, what changes:**
- No request body (path id only; `confirm` is a CLI concept, not sent).
- Gate preview mirrors the MCP `trigger_resubmission` no-confirm payload INCLUDING the Apple-credential note:
  ```javascript
  confirmGate(flags, {
    will: 'resubmit', app_id: Number(sub),
    current_state: 'rejected', target_state: 'in_review',
    note: 'A customer-owned Apple Developer credential is required. ...'
  });
  ```
- On `--confirm`: POST returns `200 { data: { status: 'in_review' } }`. Human: `console.log('Resubmission started — now in review.');`
- **D-06 hard-fail:** `422 prerequisite_failed` / code `CUSTOMER_ASC_CREDENTIAL_MISSING` (or `INVALID_APP_STATE`)
  must render as an actionable blocked state with `details.next_action` + `details.dashboard_url` — see Shared Patterns › Error Handling.

---

## Shared Patterns

### HTTP transport (auth + envelope + 204 + 401) — DO NOT re-implement
**Source:** `src/api.mjs:7-41` (`apiFetch`). **Apply to:** all 8 verbs.
Every verb calls `apiFetch(apiBase, METHOD, path[, body])`. It already attaches `Authorization: Bearer <PAT>`
(via `storedToken()`), sets `Content-Type` only when a body exists, returns `null` on 204, parses JSON,
and on non-2xx throws an `Error` carrying `err.status` + `err.envelope` (the full v1 envelope). No new HTTP code.
```javascript
const res = await fetch(`${apiBase}${path}`, {
  method,
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...(body ? { 'Content-Type': 'application/json' } : {}),
  },
  body: body ? JSON.stringify(body) : undefined,
});
if (res.status === 204) return null;
// ... non-ok → err.status / err.envelope attached and thrown
```

### Envelope unwrap — reuse
**Source:** `src/cli.mjs:58-60` (`unwrap`). **Apply to:** all read verbs + post-confirm renders (except 204/`additional` cases).
```javascript
function unwrap(payload) {
  return payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
}
```
Note: `push` needs the sibling `recipients_count` — read it off the raw `res`, not the `unwrap`ped `data`.

### `--json` verbatim passthrough — uniform idiom (D-08)
**Source pattern:** (new, but trivially uniform). **Apply to:** all 8 verbs, BEFORE any unwrap/printer.
```javascript
if (flags.json) { console.log(JSON.stringify(res)); return 0; }   // 2xx body verbatim
// 204 verbs: console.log('null');  // configure / publish
// confirm preview: console.log(JSON.stringify({ ...preview, confirm_required: true }));
```

### Curated printer — reuse + clone the shape
**Source:** `src/cli.mjs:45-56` (`printApp`). **Apply to:** new `printBuild`/`printRejection`/`printRecipe`/`printPush`.
`printApp` already prints `id/name/base_url/publication_state/primary_action/stores` — reuse it for `status` overview.
Clone its aligned-line helper for new printers:
```javascript
function printApp(app) {
  if (!app) return;
  const line = (k, v) => v !== undefined && v !== null && console.log(`  ${k.padEnd(18)} ${v}`);
  line('id', app.id);
  line('name', app.name);
  line('base_url', app.base_url);
  line('publication_state', app.publication_state);
  line('primary_action', app.primary_action);   // operator compass — keep prominent
  if (app.stores) line('stores', `apple=${app.stores.apple} google=${app.stores.google}`);
  // ...
}
```
New printers must print exactly the v1 fields, no renames (no-drift non-negotiable; OpenApiSpecTest is the guard).

### Usage-guard / exit 2 — uniform idiom
**Source:** `src/cli.mjs:100-103,124-127,133-136`. **Apply to:** all 8 verbs' missing-required-arg branch.
```javascript
if (!sub) { console.error('Usage: appo <verb> <id> ...'); return 2; }
```
Per-command usage strings should also be enumerated in the `USAGE` constant (`src/cli.mjs:5-19`), grouped
auth / apps / lifecycle (D-10).

### Confirm-gate (NEW shared helper) — publish/push/resubmit
**Source:** none in repo — new `confirmGate()` in `src/cli.mjs` (or `src/commands/`). **Apply to:** the 3 destructive verbs.
Returns `null` to proceed with the write, or an exit code (3) when gated. Shape modeled on `unwrap`'s small-pure-fn style.
```javascript
// D-04/D-05/D-07: client-side gate — v1 POSTs are NOT preview-gated, they execute on receipt.
function confirmGate(flags, preview) {
  if (flags.confirm) return null;                 // proceed to POST
  if (flags.json) console.log(JSON.stringify({ ...preview, confirm_required: true }));
  else printPreview(preview);                     // human-readable consequence, wording near MCP previews
  return 3;                                        // confirm-required exit code (distinct for Phase 2 ship / CI)
}
```
Preview payload shapes are fixed by the MCP tools (publish → `target_stores`; push → title only, count omitted;
resubmit → `current_state`/`target_state` + Apple-credential `note`). Keep each verb's core callable (not buried
in arg-parsing) so Phase 2 `ship` reuses it.

### Error handling — extend the single top-level catch (NEW: surface `code`/`details`)
**Source:** `src/cli.mjs:150-153` (current catch prints `err.message` only). **Apply to:** build + resubmit (prerequisite); publish (409); rejection/fix-recipe (404-as-state).
The current catch:
```javascript
} catch (err) {
  console.error(`\n  Error: ${err.message}\n`);
  return 1;
}
```
Extend it (or add a verb-level catch) to read `err.envelope.{code,details}` (already attached by `apiFetch`)
and render `prerequisite_failed` as an actionable block (D-06, RESEARCH Pitfall 3):
```javascript
} catch (err) {
  const env = err.envelope;
  if (env?.error === 'prerequisite_failed') {
    console.error(`\n  Blocked: ${env.message}`);
    if (env.details?.dashboard_url) {
      console.error(`  Next: ${env.details.next_action} → ${env.details.dashboard_url}\n`);
    }
    return 1;
  }
  console.error(`\n  Error: ${err.message}\n`);   // includes 401 → "run `appo login`" (apiFetch maps it)
  return 1;
}
```

### Config / API base — reuse
**Source:** `src/config.mjs` (`resolveApiBase`, `storedToken`). **Apply to:** unchanged. `run()` already resolves
`apiBase` once (`src/cli.mjs:70`) and `apiFetch` reads the token. No new config code (no `APPO_TOKEN` — that is Phase 3).

---

## No Analog Found

| Unit | Role | Data Flow | Reason | Planner guidance |
|------|------|-----------|--------|------------------|
| `confirmGate()` | utility | transform | No client-side preview/gate exists in the MVP (MVP has no destructive verbs) | Build per RESEARCH "Pattern 2"; payload shapes copied from MCP tool `handle()` no-confirm branches (canonical refs) |
| Exit code `3` | control flow | — | MVP uses only 0/1/2 | New per D-07; returned from `confirmGate`; document in `USAGE`/help |
| Envelope `code`/`details` rendering | error handling | transform | MVP catch prints `err.message` only | Extend the catch at `src/cli.mjs:150-153`; data already on `err.envelope` |

> Everything else has an exact in-repo analog. RESEARCH.md "Code Examples" + the sibling `../apps-web-app`
> controllers/tools are the contract source for fields the analogs don't cover.

---

## Metadata

**Analog search scope:** `src/` (cli.mjs, api.mjs, config.mjs, login.mjs); `bin/`. No `src/commands/` exists yet.
**Files scanned:** 4 source files + bin + package.json. No `.claude/skills`, no project-level `CLAUDE.md` (global only).
**Architecture:** dependency-free Node ESM, single `switch (command)` dispatcher; all new verbs are additive cases.
**Pattern extraction date:** 2026-06-15
