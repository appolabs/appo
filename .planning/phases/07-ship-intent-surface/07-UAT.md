---
status: partial
phase: 07-ship-intent-surface
source: [07-01-SUMMARY.md, 07-02-SUMMARY.md, 07-03-SUMMARY.md]
started: 2026-06-22
updated: 2026-06-22
driver: claude
---

## Current Test

[testing complete — driven by Claude against the built CLI (`bin/appo.mjs`, isolated APPO_CONFIG_HOME)]

## Tests

### 1. Help / USAGE reflects the rescoped surface
expected: `appo --help` shows `apps update <id> [--name] [--url] [--icon <https-url>]` (no `--meta-*`), `ship` with no `--platform`/`--branch`/`--timeout`, no standalone `build` verb, and a publish-intent framing.
result: pass
notes: Verified. One leftover found and fixed mid-session — see Test 10.

### 2. `build` verb removed
expected: `appo build` is no longer a command.
result: pass
notes: `Unknown command: build`, exit 2.

### 3. `ship` with no args → usage error
expected: usage line, exit 2, before any network call.
result: pass
notes: `Usage: appo ship --url <u> --name <n> [--stores <list>] [--yes] [--json] | appo ship <id> [--yes]`, exit 2.

### 4. `apps update` with no id → usage error
expected: usage line, exit 2.
result: pass
notes: `Usage: appo apps update <id> [--name <n>] [--url <u>] [--icon <https-url>]`, exit 2.

### 5. Empty `--icon` guard (T-07-06)
expected: a bare `apps update <id> --icon` (no value) is a usage error (exit 2) and issues NO network request — never an empty-body POST.
result: pass
notes: `apps update abc123 --icon` → usage line, exit 2, no network. The `typeof flags.icon === 'string'` guard fires.

### 6. `--meta-name` is no longer a recognized field
expected: `apps update <id> --meta-name X` (with no real field) is a usage error — metadata is server-internal now.
result: pass
notes: usage line, exit 2.

### 7. Removed lifecycle verbs absorbed into `ship`
expected: `reship`, `resubmit`, `configure` are no longer commands.
result: pass
notes: each → `Unknown command: …`, exit 2. (Help describes `ship <id>` as "republish / resubmit after a rejection" — prose, not a verb.)

### 8. Confirm-gate: `ship <id>` without `--yes` (T-07-02)
expected: prints the publish preview and returns exit 3 (gated), issuing NO publish POST and NO `/builds` — a purely client-side safety gate.
result: pass
notes: Output: `will publish / app_id abc123 / target_stores apple_appstore, google_playstore / (no write performed — re-run with --confirm to proceed)`, exit 3, zero network. Drivable without a server precisely because the gate short-circuits before any call.

### 9. Confirm-gate `--json` shape (shorter ledger)
expected: gated `--json` emits the 2-step create+publish ledger with `final_state: "gated"`, exit 3.
result: pass
notes: `{"steps":[{"step":"publish","status":"gated","target_stores":["apple_appstore","google_playstore"]}],"final_state":"gated"}`, exit 3.

### 10. Exit-code help wording consistent with the EXIT map
expected: the help's ship exit-code mapping matches `EXIT = {shipped:0, gated:3, blocked:1}` — no unreachable `failed` state.
result: pass (issue found and fixed during this session)
reported: "help still read '0 shipped / 1 blocked or failed / 2 usage / 3 gated' though `ship` can no longer produce a `failed` state (EXIT map dropped it in 07-01)"
severity: cosmetic
fix: `eaee73d` — USAGE updated to `0 shipped / 1 blocked / 2 usage / 3 gated`; 192 tests + lint + typecheck green after fix.

### 11. Live full ship pipeline (create → publish-intent)
expected: `appo ship --url <u> --name <n>` against a real apps-web-app v3.1 backend creates the app and signals publish-intent, returning immediately, with NO `POST /builds` on the server side.
result: blocked
blocked_by: server
reason: "Requires a live apps-web-app v3.1 backend (189/190 routes) + a real user PAT. Covered by HTTP-mocked integration tests (ship.test.mjs, 12 cases asserting /builds absence)."

### 12. Live `apps update --icon <real-url>` (POST /icon + 422)
expected: `appo apps update <id> --icon <https-image-url>` sets the icon via `POST /api/v1/apps/{id}/icon`; a bad/SSRF URL returns 422 surfaced via renderError (exit 1).
result: blocked
blocked_by: server
reason: "Requires a live backend + PAT + a real fetchable image URL. Covered by HTTP-mocked integration tests (write-verbs.test.mjs: icon POSTs / SSRF reject / PATCH-then-icon ordering)."

## Summary

total: 12
passed: 10
issues: 0
pending: 0
skipped: 0
blocked: 2

## Gaps

[none — the one cosmetic issue found (Test 10) was fixed inline in commit eaee73d; no outstanding code gaps]
