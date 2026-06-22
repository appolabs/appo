---
phase: 07
slug: ship-intent-surface
status: secured
threats_open: 0
asvs_level: 1
created: 2026-06-22
---

# Security Verification — Phase 07: Ship-Intent Surface

**ASVS Level:** 1
**Threats Closed:** 8/8
**Verified:** 2026-06-22

This phase reshapes the `appo` CLI surface (single `ship` verb = create + publish-intent;
`apps update` = name/url/icon). The build transport was removed from the CLI; the
security-sensitive backend (icon SSRF defense, build-route 405/404) lives in the sibling
`apps-web-app` repo and was verified there. This audit verifies the CLI correctly delegates
(transfer dispositions) and that the declared mitigations exist in the implemented code.

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-07-01 | Elevation of Privilege | mitigate | CLOSED | `grep -rn "triggerBuild\|pollBuild\|realSleep" src/` empty. Only `builds` refs in src/ are GET reads (ops.mjs:28-29 getBuild; cli.mjs:531-532 status `--build` read). No `POST .../builds` path exists. Build STATUS reads survive per D-02. |
| T-07-02 | Spoofing / unauthorized action | mitigate | CLOSED | Confirm-gate preserved in case 'ship' (cli.mjs:638 `wantYes = flags.yes === true \|\| flags.confirm === true`; cli.mjs:670-673 returns `EXIT.gated` with NO publish POST). Test `ship <id> without --yes -> exit 3, NO publish POST, NO /builds` (ship.test.mjs:90) asserts `/publish` and `/builds` request-absence on the gated path. |
| T-07-03 | Information Disclosure | accept | CLOSED | apiFetch 401 message is token-free (api.mjs:50-51 — names env, never the token). renderError prints only `err.message` (cli.mjs:244). No token interpolation in any error path (grep confirmed). Documented rationale holds. |
| T-07-04 | Information Disclosure / Tampering (SSRF) | transfer | CLOSED | CLI correctly delegates: `ops.setIcon` (ops.mjs:46-48) passes the raw `icon_url` to `POST /api/v1/apps/{id}/icon` with ZERO client-side scheme/host/size/mime checks. The apps update branch (cli.mjs:510-513) performs no URL validation. All SSRF defense is server-side (apps-web-app 190-02). No reimplementation — correct transfer. |
| T-07-05 | Information Disclosure | accept | CLOSED | renderError prints only `err.message` (cli.mjs:244); the icon 422 rides the else-branch (not prerequisite_failed). The `--icon` URL is user-supplied, not a secret. Test `apps update --icon 422 (SSRF reject) -> exit 1, surfaces the message` (write-verbs.test.mjs:83) confirms the message surfaces without token. Disposition holds. |
| T-07-06 | Tampering | mitigate | CLOSED | Empty-value guard present: `const wantIcon = typeof flags.icon === 'string' && flags.icon` (cli.mjs:500); a bare `--icon` (boolean true) fails the typeof test and falls to the usage error (exit 2, cli.mjs:502) — no empty-body POST. |
| T-07-07 | Tampering (regression) | mitigate | CLOSED | docs.test.mjs guards live and green: `README drops removed flags/wording` (docs.test.mjs:36 — asserts README+llms.txt contain no `--meta-name`/`--meta-desc`/`--timeout` and no build-poll arrow) and `src/ has no build-trigger code paths` (docs.test.mjs:46 — asserts cli.mjs+ops.mjs free of `/triggerBuild\|pollBuild/`). Both pass (41/41 docs tests green). |
| T-07-08 | Information Disclosure | mitigate | CLOSED | README.md / llms.txt carry no internal-strategy framing. Trigger-phrase scan (killer feature / the bet / load-bearing / forcing function / "we accept that" / etc.) returns no matches. Neutral product-documentation voice maintained. |

## Transfer Delegation Confirmed

T-07-04 (icon SSRF) is the security-load-bearing boundary. The CLI implementation is a
thin pass-through: it serializes `{ icon_url }` and POSTs it, with no validation logic.
This is the correct posture — duplicating server-side SSRF checks in the client would
drift and create a false sense of defense. Server enforcement (https-only, private-IP
reject, DNS-rebind pin, no-redirect, size/mime limits) was verified in apps-web-app 190-02.

## Test Gate

`npx vitest run` on the phase's three suites: 60/60 passing
(ship 12, write-verbs 7, docs 41 — including the 2 regression guards).

## Accepted Risks Log

| Threat ID | Risk | Rationale |
|-----------|------|-----------|
| T-07-03 | PAT in publish-failure error/ledger | apiFetch 401 is token-free; renderError prints only server `err.message`. No token interpolation anywhere. |
| T-07-05 | PAT in icon 422 error line | renderError prints only `err.message`; the `--icon` URL is user-supplied, not secret. |

## Unregistered Flags

None. The SUMMARY files (07-01, 07-02, 07-03) contain no `## Threat Flags` section; no
new attack surface was flagged by the executor during implementation.

## Audit Trail

| Date | Action | Result |
|------|--------|--------|
| 2026-06-22 | Initial threat verification (gsd-security-auditor, ASVS L1, block_on: high) | SECURED — 8/8 closed, 0 open |
