---
phase: 3
slug: auth-config-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-15
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (built-in) — reuses the Phase 1/2 harness |
| **Config file** | none — `package.json` `test` script runs `node --test --test-concurrency=1 "test/**/*.test.mjs"` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~1s |

> CRITICAL: verify with `npm test` (pins `--test-concurrency=1`), NEVER bare `node --test` — the shared
> `globalThis.fetch`/`requests[]` and the real `~/.appo/config.json` collide under concurrency. Baseline: 84 pass.
>
> Config-store tests MUST isolate the real `~/.appo/config.json`. Two options (RESEARCH §Validation):
> (a) point the config at a temp path via an injectable `CONFIG_PATH`/`APPO_CONFIG_HOME`, or
> (b) reuse the existing save/restore discipline (`stubToken` snapshots+restores the real file).
> Env-var precedence tests stub `process.env.APPO_TOKEN`/`APPO_ENV`/`APPO_API_BASE` and restore in afterEach.

---

## Sampling Rate

- **After every task commit:** `npm test`
- **After every plan wave:** `npm test`
- **Before `/gsd-verify-work`:** full suite green + manual smoke: `APPO_TOKEN=x appo whoami` uses the env token; `appo env list` shows profiles; `appo logout` issues `DELETE /user/tokens/current`.
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

> HTTP via the existing `fetch` stub; config via an isolated path or save/restore; env vars stubbed per-test.

| Behavior | Requirement | Test Type | Automated Command | Notes |
|----------|-------------|-----------|-------------------|-------|
| Legacy flat `{token,api_base}` config reads as `profiles.default` (no logout) | CLI-02 | unit | `npm test` | seed flat config → resolveApiBase/storedToken return it; next write emits profiles shape |
| `--env`/`APPO_ENV`/`current`/`default` selection precedence | CLI-02 | unit | `npm test` | seed multi-profile config; assert active profile per precedence |
| Second-env login does not clobber the first profile | CLI-02 | unit | `npm test` | login --env b after env a → both profiles present |
| `env list` shows profiles (active marked, NO token printed) | CLI-02 | unit | `npm test` | assert output has names, no token substring |
| `env use <name>` sets `current` | CLI-02 | unit | `npm test` | assert config.current updated |
| `APPO_TOKEN` env overrides stored token, never written to disk | CLI-07 | unit | `npm test` | stub env; assert apiFetch uses it; config file unchanged |
| `login --token <pat>` validates via GET /apps then stores; bad token (401) refuses, stores nothing | CLI-07 | unit | `npm test` | stub 200 then assert stored; stub 401 → not stored, exit 1, PAT not echoed |
| 401 surfaces clear re-login path naming the active env | CLI-02 | unit | `npm test` | stub 401 → message matches /env '.*'.*appo login/ |
| `logout` calls DELETE /user/tokens/current (204) then clears local | CLI-02 | unit | `npm test` | assert DELETE issued + local token cleared |
| `logout` on revoke failure (401/network) still clears local + warns | CLI-02 | unit | `npm test` | stub 401/throw → local cleared, warning emitted |
| `whoami` reports active env + api_base + liveness (no PAT printed) | CLI-02 | unit | `npm test` | assert env name + api_base present; no token substring |
| PAT never logged / printed anywhere | CLI-02/07 | unit | `npm test` | grep test outputs for the stub token value → absent |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/config-profiles.test.mjs` — profiles read/write, legacy normalization, `--env`/`APPO_ENV` precedence, isolated config path
- [ ] `test/auth.test.mjs` — `login --token`, `APPO_TOKEN` precedence, logout revoke + failure-clear, 401 env-named message, whoami
- [ ] If `config.mjs` needs an injectable config path for test isolation, expose it (e.g. honor `APPO_CONFIG_HOME`) — otherwise reuse the `stubToken` save/restore pattern from `test/helpers/mockFetch.mjs`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real device-flow login still works after the profiles refactor | CLI-02 | needs a live backend + browser | `appo login` against a real backend; confirm token lands in the active profile |
| A dashboard-minted PAT runs every verb headless via `APPO_TOKEN` | CLI-07 | needs a real PAT from the dashboard | `APPO_TOKEN=<pat> APPO_API_BASE=<url> appo ship --url ... --name ... --yes` |

*All in-repo config/auth logic has automated coverage via stubbed fetch + isolated config + stubbed env.*

---

## Validation Sign-Off

- [ ] All behaviors have an automated `npm test` check or a Wave 0 dependency
- [ ] Config tests never touch the real `~/.appo/config.json`
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] No watch-mode flags; verified via `npm test` (concurrency-1)
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set once Wave 0 lands

**Approval:** pending
