# Phase 7: Ship-intent surface + config rescope - Pattern Map

**Mapped:** 2026-06-22
**Files analyzed:** 8 (2 source, 4 test, 2 doc)
**Analogs found:** 8 / 8 (all analogs are in-repo; most live in the SAME file being edited)

> This is a deletion-first refactor of existing CLI code, not greenfield. Every analog is concrete and already in the tree. The single net-new artifact is a 3-line `ops.setIcon` op (analog: `ops.publishApp`) and a small `apps update` icon branch (analog: the existing PATCH branch). Everything else is deletion plus message/test edits.

## File Classification

| File | Role | Data Flow | Change | Closest Analog | Match Quality |
|------|------|-----------|--------|----------------|---------------|
| `src/ops.mjs` | service (transport op) | request-response | DELETE `triggerBuild`; ADD `setIcon`; drop `createApp` metadata params | `publishApp` (same file, `:48`) for `setIcon`; `getPreview` (`:54`) for flat-response handling | exact |
| `src/cli.mjs` | controller (command dispatch) | request-response | reshape `case 'ship'`; rescope `case 'apps'` update; DELETE `pollBuild`/`realSleep`; edit USAGE | self (the existing `case 'ship'`, existing PATCH branch `:529`, existing `printPreview`/`renderError`) | exact |
| `test/integration/ship.test.mjs` | test (integration) | request-response | reshape: drop build/poll responses, add no-`/builds` assertion, delete failed/timeout/leak cases | self (the existing ship cases) + `mockFetch.mjs` substrate | exact |
| `test/integration/write-verbs.test.mjs` | test (integration) | CRUD | drop two `--meta-*` tests; add `--icon` happy / 422 / ordering tests | the existing `apps update` PATCH tests in the same file (`:41`–`:75`) | exact |
| `test/unit/ship.test.mjs` | test (unit) | request-response | DELETE entire file (imports only `pollBuild`) | n/a (removal) | n/a |
| `test/integration/docs.test.mjs` | test (doc-lint) | file-I/O | add negative-assertion grep guards for removed flags | the existing `README.toContain`/`LLMS.toContain` block (`:18`–`:24`) | exact |
| `README.md` | config (doc) | n/a | rewrite ship + apps sections (remove build/poll/timeout/meta wording) | self | exact |
| `llms.txt` | config (doc) | n/a | re-sync if any anchor/tagline drifts (mostly anchor-based, no flag bodies) | self | exact |

---

## Pattern Assignments

### `src/ops.mjs` (service, request-response)

**Analog for `setIcon`:** `ops.publishApp` (`src/ops.mjs:47-50`) — same one-op-per-call shape, but reads a FLAT response (mirrors `getPreview`'s flat-response note).

**Existing op shape to copy (publishApp, `:47-50`):**
```javascript
// POST /api/v1/apps/{id}/publish -> 204 (apiFetch returns null). Resolving == success. Do NOT unwrap.
export async function publishApp(apiBase, id, app_stores, env) {
  return apiFetch(apiBase, 'POST', `/api/v1/apps/${id}/publish`, { app_stores }, env);
}
```

**Flat-response precedent (getPreview, `:52-56`) — the reason `setIcon` does NOT unwrap:**
```javascript
// GET /api/v1/apps/{id}/preview -> 200 { ios_testflight_url, android_deeplink, preview_url, preview_ready }
// Flat object (no {data:} envelope) — unwrap is a harmless no-op here.
export async function getPreview(apiBase, id, env) {
  return unwrap(await apiFetch(apiBase, 'GET', `/api/v1/apps/${id}/preview`, null, env));
}
```

**New `setIcon` to ADD (copy publishApp shape, flat response, no unwrap):**
```javascript
// POST /api/v1/apps/{id}/icon -> 200 { icon_url } (flat, NOT a {data:} envelope).
// 422 { message, errors: { icon_url: [...] } } on SSRF/validation reject (apiFetch throws).
// Do NOT unwrap — the body is flat. Read res.icon_url at the call site.
export async function setIcon(apiBase, id, icon_url, env) {
  return apiFetch(apiBase, 'POST', `/api/v1/apps/${id}/icon`, { icon_url }, env);
}
```

**DELETE `triggerBuild` (`:25-35`, including the doc comment):**
```javascript
// POST /api/v1/apps/{id}/builds -> 202 { data: AppBuildResource }
/** Trigger a build. ... */
export async function triggerBuild(apiBase, id, env) {
  return unwrap(await apiFetch(apiBase, 'POST', `/api/v1/apps/${id}/builds`, {}, env));
}
```

**DROP dead metadata params from `createApp` (`:18-23`)** — `metadata_name`/`metadata_description` are ignored server-side (apps-web-app 190-01):
```javascript
// CURRENT (:18-23) -> reduce to { name, base_url }:
export async function createApp(apiBase, { name, base_url, metadata_name, metadata_description }, env) {
  const body = { name, base_url };
  if (metadata_name) body.metadata_name = metadata_name;
  if (metadata_description) body.metadata_description = metadata_description;
  return unwrap(await apiFetch(apiBase, 'POST', '/api/v1/apps', body, env));
}
// AFTER: signature becomes ({ name, base_url }, env); body is just { name, base_url }.
```

**KEEP untouched:** `getApp` (`:38`), `getBuild` (`:42-45`) — status reads survive (D-02). `unwrap` (`:13-15`) stays.

---

### `src/cli.mjs` — `case 'ship'` (controller, request-response)

**Analog:** self. The current 4-step `case 'ship'` (`:640-740`) collapses to 2 steps. Preserve the create step, the gate decision, the publish step, the `shipReport` ledger, and the top-level `catch -> renderError`.

**Reusable machinery to KEEP verbatim:**
- `shipReport(json)` ledger (`:305-314`) — `{ log, record, finish }`.
- `printPreview(preview)` (`:205-216`) — human gate render.
- `previewId(id)` (`:289-292`), `parseStores(raw)` (`:295-299`).
- The `wantYes = flags.yes === true || flags.confirm === true` gate DECISION (`:657`) — do NOT call `confirmGate` (it emits a competing `--json` object, `:222-230`).
- `handleBlock` local (`:664-668`).

**Create step to KEEP (but drop the metadata params, `:673-684`):**
```javascript
if (!appId) {
  let app;
  try {
    app = await ops.createApp(apiBase, { name: flags.name, base_url: flags.url }, env); // metadata params DROPPED
  } catch (err) { return handleBlock(err, 'create'); }
  appId = (app || {}).id;
  record({ step: 'create', status: 'ok', app_id: appId });
  log(`> create ... ok app #${appId}`);
}
```

**DELETE the build trigger (`:686-699`), the poll loop (`:701-724`), and the `timeoutSecs` plumbing (`:705-706`).** Replace the whole block between create and the final return with the publish-intent step.

**Publish step — REPLACES build+poll (adapt the existing publish block `:726-739`):**
```javascript
// publishApp on a never-built app is valid (StartPublication has no build dependency).
const preview = { will: 'publish', app_id: previewId(appId), target_stores: stores };
if (!wantYes) {
  if (!json) printPreview(preview);
  record({ step: 'publish', status: 'gated', target_stores: stores });
  return finish('gated', EXIT.gated);   // NO publish POST — gate invariant preserved
}
log(`> publish ...`);
try {
  await ops.publishApp(apiBase, appId, stores, env);   // 204 == success
} catch (err) {
  if (!json) console.error(`  (app #${appId} exists — resume with: appo ship ${appId})`);
  return handleBlock(err, 'publish', { app_id: appId });
}
record({ step: 'publish', status: 'ok', target_stores: stores });
log(`ok submitted: ${stores.join(', ')} — Appo will build and submit it.`);  // discretion: submit line
log(`  track: appo status ${appId}   preview: appo preview ${appId}`);       // discretion: tracking hint
return finish('shipped', EXIT.shipped);
```

**Usage-guard line to edit (`:650`)** — drop `[--timeout <s>]`:
```javascript
// CURRENT:
console.error('Usage: appo ship --url <u> --name <n> [--stores <list>] [--yes] [--timeout <s>] [--json]  |  appo ship <id> [--yes]');
// AFTER: remove [--timeout <s>].
```

**`EXIT` map (`:316`)** — drop the now-dead `failed` key (no build to fail). `final_state` ∈ `{shipped, gated, blocked}`:
```javascript
const EXIT = { shipped: 0, gated: 3, blocked: 1 };  // failed removed (no build)
```

---

### `src/cli.mjs` — `pollBuild`/`realSleep` removal (controller)

**DELETE `realSleep` (`:249`)** — dead after pollBuild removal (only used by pollBuild).

**DELETE `pollBuild` (`:251-282`, the whole `export async function pollBuild` + its doc comment).** It is a named EXPORT of `cli.mjs`; its only importer is `test/unit/ship.test.mjs` (also deleted).

**Verified removal inventory (exactly 5 source sites + 1 unit file):**
| Symbol | Source refs | Test refs | Action |
|--------|-------------|-----------|--------|
| `triggerBuild` | `ops.mjs:33` (def), `cli.mjs:692` (call) | `ship.test.mjs:64/81/94/108/120/133/147/190/206` (202 canned) | delete def + call; drop 202 build responses |
| `pollBuild` | `cli.mjs:268` (def/export), `cli.mjs:707` (call) | `test/unit/ship.test.mjs` (import + 4 tests) | delete def/export/call; delete the unit file |
| `realSleep` | `cli.mjs:249` (def, pollBuild-only) | — | delete |

**KEEP untouched:** `case 'status'`'s `/builds/{id}` read (`cli.mjs:550-551`), `ops.getBuild`, `printBuild`.

---

### `src/cli.mjs` — `case 'apps'` update branch (controller, CRUD)

**Analog:** self (the existing update branch `:529-543`) for the PATCH; `ops.publishApp` call-site convention for the icon POST.

**Empty-value flag-guard analog** — `--icon` must mirror how the CLI rejects a bare value flag. Use `typeof flags.icon === 'string' && flags.icon` (a bare `--icon` parses to boolean `true`, failing the `typeof === 'string'` test).

**CURRENT update branch (`:529-543`):**
```javascript
if (sub === 'update') {
  const id = rest[0];
  const usage = 'Usage: appo apps update <id> [--name <n>] [--url <u>] [--meta-name <m>] [--meta-desc <d>]';
  if (!id) { console.error(usage); return 2; }
  const body = {};
  if (flags.name)         body.name = flags.name;
  if (flags.url)          body.base_url = flags.url;
  if (flags['meta-name']) body.metadata_name = flags['meta-name'];
  if (flags['meta-desc']) body.metadata_description = flags['meta-desc'];
  if (Object.keys(body).length === 0) { console.error(usage); return 2; }
  await apiFetch(apiBase, 'PATCH', `/api/v1/apps/${id}`, body, env);   // 204 -> null
  if (flags.json) { console.log('null'); return 0; }              // Pitfall 5 / D-08: no body
  console.log(`Updated app ${id}.`);
  return 0;
}
```

**RESHAPED (drop meta-* mappings; add icon two-call dispatch, PATCH first per D-04):**
```javascript
if (sub === 'update') {
  const id = rest[0];
  const usage = 'Usage: appo apps update <id> [--name <n>] [--url <u>] [--icon <https-url>]';
  if (!id) { console.error(usage); return 2; }

  const body = {};
  if (flags.name) body.name = flags.name;
  if (flags.url)  body.base_url = flags.url;
  const wantIcon = typeof flags.icon === 'string' && flags.icon;

  if (Object.keys(body).length === 0 && !wantIcon) { console.error(usage); return 2; }

  let iconUrl;
  if (Object.keys(body).length > 0) {
    await apiFetch(apiBase, 'PATCH', `/api/v1/apps/${id}`, body, env);   // 204 -> null
  }
  if (wantIcon) {
    const res = await ops.setIcon(apiBase, id, flags.icon, env);         // 200 { icon_url }
    iconUrl = res?.icon_url;
  }

  if (flags.json) {
    console.log(wantIcon ? JSON.stringify({ icon_url: iconUrl }) : 'null');  // Pitfall 5: keep null for PATCH-only
    return 0;
  }
  console.log(`Updated app ${id}.`);
  if (wantIcon) console.log(`  icon set: ${iconUrl}`);
  return 0;
}
```

**Also drop metadata mapping in `apps create` (`:501-504`):**
```javascript
// CURRENT:
const app = await ops.createApp(apiBase, {
  name: flags.name, base_url: flags.url,
  metadata_name: flags['meta-name'], metadata_description: flags['meta-desc'],
}, env);
// AFTER: const app = await ops.createApp(apiBase, { name: flags.name, base_url: flags.url }, env);
```

**Icon 422 handling — NO new code.** The 422 throws from `apiFetch`, propagates to the top-level `catch (err) { return renderError(err); }` (`:747-749`), and takes `renderError`'s ELSE-branch (see Shared Patterns). Do NOT special-case it as `prerequisite_failed`.

---

### `test/integration/write-verbs.test.mjs` (test, CRUD)

**Analog:** the existing `apps update` PATCH test (`:41-51`) and the `--json prints "null"` test (`:69-75`) in the same file. Reuse the same `captureLog`/`stubToken`/`installMockFetch`/`lastRequest`/`requests` substrate already imported at the top of this file.

**Existing happy-path test to mirror for `--icon` (`:41-51`):**
```javascript
test('apps update PATCHes /api/v1/apps/{id} with only supplied fields and returns 0', async () => {
  stubToken();
  installMockFetch({ status: 204 });
  const { result, lines } = await captureLog(() => run(['apps', 'update', '7', '--name', 'New', ...API]));
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.method).toBe('PATCH');
  expect(req.path).toMatch(/\/api\/v1\/apps\/7$/);
  expect(req.body).toEqual({ name: 'New' });
  expect(lines.join('\n')).toMatch(/Updated app 7\./);
});
```

**DELETE** the two metadata-mapping tests (`:53-59` `--meta-name`, `:61-67` `--meta-desc`).

**KEEP** `--json prints "null"` (`:69-75`), no-flag returns 2 (`:77-83`), missing-id returns 2 (`:85-89`).

**ADD** (mirror the shape above; `captureAll` for the 422 case lives in `ship.test.mjs:25` — copy it into this file or import the pattern):
```javascript
// happy path
test('apps update --icon POSTs /icon with icon_url and reports it', async () => {
  stubToken();
  installMockFetch([{ status: 200, body: { icon_url: 'https://cdn/x.png' } }]);
  const { result, lines } = await captureLog(() =>
    run(['apps', 'update', '7', '--icon', 'https://src/x.png', ...API]));
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.method).toBe('POST');
  expect(req.path).toMatch(/\/api\/v1\/apps\/7\/icon$/);
  expect(req.body).toEqual({ icon_url: 'https://src/x.png' });
  expect(lines.join('\n')).toMatch(/cdn\/x\.png/);
});

// 422 SSRF reject -> renderError else-branch (exit 1)
test('apps update --icon 422 (SSRF reject) -> exit 1, surfaces the message', async () => {
  stubToken();
  installMockFetch([{ status: 422, body: { message: 'The icon URL must use https.', errors: { icon_url: ['The icon URL must use https.'] } } }]);
  const { result, lines } = await captureAll(() =>
    run(['apps', 'update', '7', '--icon', 'http://insecure/x.png', ...API]));
  expect(result).toBe(1);
  expect(lines.join('\n')).toMatch(/must use https/);
});

// PATCH-then-icon ordering (D-04)
test('apps update --name --icon runs PATCH then POST /icon in order', async () => {
  stubToken();
  installMockFetch([
    { status: 204 },                                          // PATCH
    { status: 200, body: { icon_url: 'https://cdn/x.png' } }, // POST /icon
  ]);
  await captureLog(() => run(['apps', 'update', '7', '--name', 'New', '--icon', 'https://src/x.png', ...API]));
  expect(requests[0].method).toBe('PATCH');
  expect(requests[0].path).toMatch(/\/api\/v1\/apps\/7$/);
  expect(requests[1].method).toBe('POST');
  expect(requests[1].path).toMatch(/\/api\/v1\/apps\/7\/icon$/);
});
```
> Note: this file currently imports only `captureLog`. The 422 test needs `captureAll` (stdout+stderr) — copy the `captureAll` helper from `test/integration/ship.test.mjs:25-38`.

---

### `test/integration/ship.test.mjs` (test, request-response)

**Analog:** self. Substrate (`installMockFetch`/`stubToken`/`lastRequest`/`requests`/`captureLog`/`captureAll`) already imported (`:1-49`).

**Reshape each retained case:** drop the `{ status: 202, ... }` triggerBuild response and the `{ status: 200, body: { data: { status: 'ready' } } }` getBuild response; keep only `createApp` (`{ status: 201, ... }`) and/or `publishApp` (`{ status: 204 }`). Add the no-`/builds` invariant to every case.

**DELETE** cases that test a build that no longer exists: leak-body (`:105-114`), build-failed (`:117-126`), poll-timeout (`:130-141`). The `--timeout`-bearing assertions go with them.

**Reshaped happy-path (from `:60-75`):**
```javascript
test('ship --url --name --yes creates then publishes, NO /builds, exit 0', async () => {
  stubToken();
  installMockFetch([
    { status: 201, body: { data: { id: 5 } } },  // createApp
    { status: 204 },                              // publishApp (intent) — NO build, NO poll
  ]);
  const { result } = await captureLog(() =>
    run(['ship', '--url', 'https://x', '--name', 'X', '--yes', ...API]));
  expect(result).toBe(0);
  const req = lastRequest();
  expect(req.path).toMatch(/\/api\/v1\/apps\/5\/publish$/);
  expect(req.body).toEqual({ app_stores: ['apple_appstore', 'google_playstore'] });
  expect(requests.filter(r => /\/builds$/.test(r.path)).length).toBe(0);  // SC-1/SC-2 invariant
});
```

**Reshaped gate case (from `:144-153`)** — `ship <id>` first request is now `POST .../publish`, not `.../builds`:
```javascript
test('ship <id> without --yes -> exit 3, NO publish POST, NO /builds', async () => {
  stubToken();
  installMockFetch([{ status: 204 }]);  // never reached — gate fires first
  const { result } = await captureLog(() => run(['ship', '5', ...API]));
  expect(result).toBe(3);
  expect(requests.filter(r => /\/publish$/.test(r.path)).length).toBe(0);
  expect(requests.filter(r => /\/builds$/.test(r.path)).length).toBe(0);
});
```

**KEEP and re-shape** (drop build responses, retain intent): existing-id-skips-create (`:78-101`), usage-error (`:173-184`), `--json` shipped/gated (`:187-215`), the publish-verb IN-01/IN-03 cases (`:219-251`, unaffected — they test `publish`, not `ship`), WR-01 empty-body (`:255-264`, drop the build response), WR-02 (`:268-279`, the block is now on `publish`, not `build`).

---

### `test/unit/ship.test.mjs` (test, unit) — DELETE

The whole file imports only `pollBuild` (`:2`) and tests nothing else. Delete it (D-02 / removal map). No analog needed.

---

### `test/integration/docs.test.mjs` (test, doc-lint)

**Analog:** the existing `README.toContain`/`LLMS.toContain` block (`:18-24`). The `COMMANDS` list (`:11-16`) is UNCHANGED (`apps update` stays a command). Add NEGATIVE assertions to lock removed flags (Pitfall 4: the existing test greps command NAMES, not flag bodies).

**ADD (mirror the existing `test.each` style):**
```javascript
test('README drops removed flags/wording', () => {
  expect(README).not.toContain('--meta-name');
  expect(README).not.toContain('--meta-desc');
  expect(README).not.toContain('--timeout');
  expect(README).not.toMatch(/create\s*→\s*build\s*→\s*poll\s*→\s*publish/);
});
test('src/ has no build-trigger code paths', () => {
  const cli = readFileSync('src/cli.mjs', 'utf-8');
  const ops = readFileSync('src/ops.mjs', 'utf-8');
  expect(cli + ops).not.toMatch(/triggerBuild|pollBuild/);
});
```
> Static SC-2 guard alternative (research §Validation): `! grep -rn "triggerBuild\|pollBuild" src/` at the phase gate.

---

### `README.md` (doc) — concrete edit sites

- `:23` — "...triggers a build, polls until the build is ready, then publishes..." → remove build/poll wording.
- `:32` — "...runs create → build → poll → publish and streams each step" → "runs create → publish-intent".
- `:44-47` — drop the `--timeout <s>` flag description and "max seconds to poll a build" line; keep `--stores` and `--yes`/`--json`.
- `:100` — `appo apps create --name <n> --url <u> [--meta-name <m>] [--meta-desc <d>]` → drop the meta flags.
- `:103` — `appo apps update <id> [--name <n>] [--url <u>] [--meta-name <m>] [--meta-desc <d>]` → `[--name <n>] [--url <u>] [--icon <https-url>]`.
- `:113-115` — "rebuild and republish" wording: reframe to publish-intent (Appo builds server-side).

### `llms.txt` (doc)

Anchor/tagline based — grep shows only `ship`/`publish`/`push` verb anchors (`:7/:13/:17`), no `--meta-*`/`--timeout`/build-poll flag bodies. Re-verify after README edits that no anchor references a removed section; otherwise no flag-body change needed. `docs.test.mjs` COMMANDS list keeps it in lockstep.

---

## Shared Patterns

### Error rendering (`renderError`)
**Source:** `src/cli.mjs:236-247`
**Apply to:** the icon-422 path (and every write verb) — rides the top-level `catch` at `:747-749`.
```javascript
function renderError(err) {
  const env = err.envelope;
  if (env?.error === 'prerequisite_failed') {            // build/publish blocked-state branch
    console.error(`\n  Blocked: ${env.message}`);
    if (env.details?.dashboard_url) {
      console.error(`  Next: ${env.details.next_action} -> ${env.details.dashboard_url}\n`);
    }
    return 1;
  }
  console.error(`\n  Error: ${err.message}\n`);          // <- ICON 422 TAKES THIS ELSE-BRANCH
  return 1;
}
```
The icon 422 is `{ message, errors }` (Laravel validation), NOT `{ error: 'prerequisite_failed', details }`, so it falls through to `Error: <message>` (exit 1). No special-casing.

### apiFetch throw shape
**Source:** `src/api.mjs:45-58`
**Apply to:** `setIcon` (and all ops). On non-2xx, `apiFetch` throws `err` with `err.status`, `err.envelope = payload`, and `err.message = payload.message || payload.error || 'Request failed (N).'` (401 is special-cased to the re-login hint). 204 returns `null` (`:39-41`). This is why `setIcon` needs no error plumbing and PATCH-only `--json` stays `null`.

### Mock-fetch test substrate
**Source:** `test/helpers/mockFetch.mjs`
**Apply to:** all reshaped tests.
- `installMockFetch(responses)` — single `{status, body}` or FIFO array; a verb making N calls gets N canned responses (`:27-57`).
- `requests` (FIFO array of `{ method, path, url, body, headers }`), `lastRequest()` (`:13-20`).
- `stubToken(token='test-pat')` — writes a test token into the per-worker temp config so `apiFetch`'s `if (!token)` guard passes (`:74-76`).
- `resetMockFetch()` in `afterEach` (`:79-85`).
- Per-worker `APPO_CONFIG_HOME` isolation is set in `test/helpers/setup.mjs` (unchanged).
- `captureLog` (stdout) and `captureAll` (stdout+stderr) helpers live at the top of each integration test file (`ship.test.mjs:12-38`, `write-verbs.test.mjs:12-22`).

### Confirm-gate decision (publish step of `ship`)
**Source:** `src/cli.mjs:657` (`wantYes`), `:205-216` (`printPreview`), `:316` (`EXIT.gated`)
**Apply to:** the reshaped `ship` publish step. Reuse the `wantYes` DECISION + `printPreview` — do NOT call `confirmGate` (`:222-230`), which emits a competing `--json` object.

---

## No Analog Found

None. Every file has a concrete in-repo analog (most in the same file being edited). The icon endpoint is net-new transport but its op shape is a direct copy of `publishApp` with `getPreview`'s flat-response handling.

## Metadata

**Analog search scope:** `src/` (ops.mjs, cli.mjs, api.mjs), `test/` (integration, unit, helpers), `README.md`, `llms.txt`.
**Files scanned:** 8 source/test/doc + 3 cross-repo backend summaries (read via RESEARCH.md, contracts already verified).
**Pattern extraction date:** 2026-06-22
