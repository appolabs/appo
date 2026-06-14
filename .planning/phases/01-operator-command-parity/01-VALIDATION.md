---
phase: 1
slug: operator-command-parity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-15
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (built-in) — dependency-free, matches the zero-dep mandate; the full vitest suite is Phase 5 |
| **Config file** | none — Node ≥18 ships `node:test` and `node:assert` |
| **Quick run command** | `node --test test/` |
| **Full suite command** | `node --test test/` |
| **Estimated runtime** | ~3 seconds (HTTP is stubbed; no live backend) |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/`
- **After every plan wave:** Run `node --test test/`
- **Before `/gsd-verify-work`:** Full suite must be green + `node bin/appo.mjs --help` exits 0 listing all 8 new verbs
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

> Concrete tasks are assigned by the planner; this maps the verifiable behaviors CLI-01 requires.
> HTTP is stubbed by overriding `globalThis.fetch` so each command's method/path/body and exit code
> are asserted without a live `/api/v1`.

| Behavior | Requirement | Test Type | Automated Command | Notes |
|----------|-------------|-----------|-------------------|-------|
| Each verb (build/status/publish/push/configure/rejection/fix-recipe/resubmit) calls the correct v1 method+path | CLI-01 | unit | `node --test test/` | assert on stubbed `fetch` call args |
| Destructive verb without `--confirm` performs NO write + prints preview + exits 3 | CLI-01 | unit | `node --test test/` | assert `fetch` NOT called for the POST; exit 3 |
| Destructive verb with `--confirm` issues the POST | CLI-01 | unit | `node --test test/` | assert POST issued with correct body |
| `--json` emits raw v1 body verbatim (and `null` for 204) | CLI-01 | unit | `node --test test/` | assert stdout parses to the stubbed payload |
| Exit codes 0/1/2/3 returned per taxonomy | CLI-01 | unit | `node --test test/` | 401→1, bad args→2, confirm-required→3 |
| resubmit hard-fail (missing customer ASC credential) renders actionable blocked message | CLI-01 | unit | `node --test test/` | stub 4xx with `details.next_action`; assert message + exit 1 |
| `appo --help` and per-command help enumerate all commands/flags | CLI-01 | unit | `node --test test/` | assert USAGE contains each verb |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/` directory created with a shared `fetch` stub helper (no framework install needed — `node:test` is built in)
- [ ] Stub helper captures the last request (method, path, body, headers) and returns a canned response/status

*If none: "Existing infrastructure covers all phase requirements." — N/A, no test/ dir exists yet.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end parity against the live `/api/v1` | CLI-01 | Cross-surface parity is verified on the apps-web-app side (Phase 187), not here | Optional smoke: against a seeded local backend, run each verb and compare to the matching MCP tool output |

*Automated coverage via stubbed fetch covers all in-repo behaviors; only live cross-surface parity is manual.*

---

## Validation Sign-Off

- [ ] All behaviors have an automated `node --test` check or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers the fetch-stub helper
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
