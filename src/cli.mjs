import {
  resolveApiBase,
  activeProfileName,
  storedToken,
  clearProfileToken,
  setCurrent,
  readConfig,
} from './config.mjs';
import { login, loginWithToken } from './login.mjs';
import { apiFetch } from './api.mjs';
import * as ops from './ops.mjs';
import { unwrap } from './ops.mjs';
import { renderQr } from './qr.mjs';
import { createRequire } from 'node:module';
import { runUpgrade } from './upgrade.mjs';

const USAGE = `appo — create and manage Appo apps from the terminal

Auth:
  appo login [--api <url>]        Authenticate via the browser (device flow)
  appo login --token <pat>        Authenticate non-interactively with a dashboard PAT
  appo logout                     Revoke the token server-side and clear it locally
  appo whoami                     Show the active environment + API + liveness
  appo env list                   List configured environments
  appo env use <name>             Switch the active environment

Packaging:
  appo init [--token <pat>]       Bootstrap config + first login (device flow, or --token for CI)
  appo upgrade                    Update to the latest @appolabs/appo via npm
  appo --version, -v              Print the CLI + Node version

Apps:
  appo apps create --name <n> --url <u> [--meta-name <m>] [--meta-desc <d>]
  appo apps list                  List your apps
  appo apps show <id>             Show one app
  appo apps set-name <id> <name>  Update an app's name

Lifecycle:
  appo ship <id> [--yes]                  Build an existing app and publish it
  appo ship --url <u> --name <n> [--stores <list>] [--platform ios|android|all] [--timeout <s>] [--yes]   Create -> build -> poll -> publish in one command
  appo status <id> [--build <buildId>]   App overview (or one build's status)
  appo preview <id>              Show preview target (TestFlight/deeplink + QR)
  appo build <id> [--platform ios|android|all] [--branch <ref>]   Trigger a build (returns immediately)
  appo configure <id> [--name <n>] [--url <u>] [--meta-name <m>] [--meta-desc <d>] [--injected-css <css>] [--injected-js <js>]   Update app fields
  appo rejection <id>                     Show the active App Store rejection
  appo fix-recipe <id>                    Show the fix recipe for a rejection
  appo publish <id> --stores apple_appstore,google_playstore --confirm   Publish to the stores
  appo push <id> --title <t> --body <b> [--target-url <u>] [--image-path <p>] [--scheduled-at <when>] --confirm   Send a push notification
  appo resubmit <id> --confirm           Resubmit a rejected app for review

Options:
  --api <url>    Override the API base (env: APPO_API_BASE)
  --env <name>   Select the environment/profile (env: APPO_ENV)
  --token <pat>  Personal access token for \`login --token\` (never stored elsewhere)
  --json         Print the raw v1 response body (machine-readable)
  --confirm      Perform the write for a destructive verb (publish/push/resubmit)
  --yes          Confirm the publish step of \`ship\` (alias of --confirm for ship)
  --timeout <s>  Max seconds to poll a build during \`ship\` (default 1800)
  --stores <l>   Comma list of target stores for \`ship\`/\`publish\` (default both)
  --platform <p> Build platform for \`ship\`/\`build\`: ios|android|all
  -h, --help     Show this help
  -v, --version  Print the CLI + Node version

Exit codes:
  0  success
  1  runtime / API error (incl. auth failure — run \`appo login\`)
  2  usage error (missing or invalid arguments)
  3  confirm required (destructive verb invoked without --confirm; preview shown, no write)

  ship maps these to its final lifecycle state: 0 shipped / 1 blocked or failed /
  2 usage / 3 gated (publish preview shown, no write — re-run with --yes).

Environment variables:
  APPO_TOKEN     Ephemeral token, highest precedence, never written to disk
  APPO_ENV       Active environment/profile (overridden by --env)
  APPO_API_BASE  API base URL (overridden by --api)

  Create a PAT in the dashboard, then \`appo login --token <pat>\` or set APPO_TOKEN
  in your environment (e.g. CI/agents) to authenticate without the browser flow.
`;

/** Minimal flag parser: collects --key value / --key=value / --flag and
 *  positionals. A bare `--` ends option parsing — every remaining token is
 *  positional, so values beginning with `--` are representable either via
 *  `--key=--value` or after the `--` sentinel (WR-02). */
function parseArgs(argv) {
  const flags = {};
  const positional = [];
  let optionsEnded = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (optionsEnded) {
      positional.push(a);
      continue;
    }
    if (a === '--') {
      optionsEnded = true;
    } else if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
        continue;
      }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else if (a === '-h') {
      flags.help = true;
    } else if (a === '-v') {
      flags.version = true;
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

function printApp(app) {
  if (!app) return;
  const line = (k, v) => v !== undefined && v !== null && console.log(`  ${k.padEnd(18)} ${v}`);
  line('id', app.id);
  line('name', app.name);
  line('base_url', app.base_url);
  line('publication_state', app.publication_state);
  line('primary_action', app.primary_action);
  if (app.stores) line('stores', `apple=${app.stores.apple} google=${app.stores.google}`);
  line('ios_bundle_id', app.ios_bundle_id);
  line('android_package', app.android_package_name);
}

/** Curated render of a build (AppBuildResource). Prints EXACT v1 field names —
 *  no renames (no-drift non-negotiable). Reuses the aligned line(k,v) idiom. */
function printBuild(b) {
  if (!b) return;
  const line = (k, v) => v !== undefined && v !== null && console.log(`  ${k.padEnd(18)} ${v}`);
  line('id', b.id);
  line('platform', b.platform);
  line('status', b.status);
  line('distribution', b.distribution);
  line('created_at', b.created_at);
  line('started_at', b.started_at);
  line('finished_at', b.finished_at);
  line('artifact_url', b.artifact_url);
  line('error_message', b.error_message);
}

/** Curated render of a rejection (AppRejectionResource — two-field allowlist). */
function printRejection(d) {
  if (!d) return;
  const line = (k, v) => v !== undefined && v !== null && console.log(`  ${k.padEnd(18)} ${v}`);
  line('status', d.status);
  line('required_action', d.required_action);
}

/** Curated render of one fix recipe (AppRecipeResource item). Prints slug/fix_type
 *  then the agent_steps and limitations string arrays, one per line, indented. */
function printRecipe(r) {
  if (!r) return;
  const line = (k, v) => v !== undefined && v !== null && console.log(`  ${k.padEnd(18)} ${v}`);
  line('slug', r.slug);
  line('fix_type', r.fix_type);
  if (Array.isArray(r.agent_steps) && r.agent_steps.length) {
    console.log('  agent_steps:');
    for (const s of r.agent_steps) console.log(`    - ${s}`);
  }
  if (Array.isArray(r.limitations) && r.limitations.length) {
    console.log('  limitations:');
    for (const l of r.limitations) console.log(`    - ${l}`);
  }
}

/** Curated render of a preview payload (flat, no {data:} envelope).
 *  Prints per-platform readiness FIRST, then the three URLs, then the QR (gated on
 *  readiness). preview_url is never null (backend guarantee); the QR is skipped when
 *  neither platform is ready — NOT when preview_url is absent (Pitfall 4). */
function printPreviewPayload(d) {
  if (!d) return;
  const line = (k, v) => v !== undefined && v !== null && console.log(`  ${k.padEnd(18)} ${v}`);
  const r = d.preview_ready || {};
  // D-04: readiness lines FIRST, per-platform. preview_ready is {ios:bool, android:bool}.
  console.log(`  ios                ${r.ios ? 'preview-ready' : 'not preview-ready yet'}`);
  console.log(`  android            ${r.android ? 'preview-ready' : 'not preview-ready yet'}`);
  if (r.ios)     line('ios_testflight_url', d.ios_testflight_url);
  if (r.android) line('android_deeplink',   d.android_deeplink);
  line('preview_url', d.preview_url);   // always present
  // D-03 (corrected): gate the QR on READINESS, not on preview_url nullness (it's never null).
  if (r.ios || r.android) {
    console.log('');
    console.log(renderQr(d.preview_url));
  } else {
    console.log('  (no preview target yet — build and publish to enable preview)');
  }
}

/** Human-readable preview of a pending destructive write (publish/push/resubmit).
 *  Reuses the aligned line(k,v) idiom from printApp. Pure presentation — no fetch. */
function printPreview(preview) {
  if (!preview) return;
  const line = (k, v) => v !== undefined && v !== null && console.log(`  ${k.padEnd(18)} ${v}`);
  line('will', preview.will);
  line('app_id', preview.app_id);
  line('target_stores', Array.isArray(preview.target_stores) ? preview.target_stores.join(', ') : preview.target_stores);
  line('title', preview.title);
  line('current_state', preview.current_state);
  line('target_state', preview.target_state);
  line('note', preview.note);
  console.log('  (no write performed — re-run with --confirm to proceed)');
}

/** Client-side confirm-gate for destructive verbs. The v1 POSTs are NOT
 *  preview-gated — they execute on receipt — so the CLI gates before issuing the
 *  write (D-04/D-05). Returns null to proceed with the POST, or exit code 3
 *  (confirm required, D-07) when gated. Pure decision/presentation — no fetch. */
function confirmGate(flags, preview) {
  if (flags.confirm) return null;
  if (flags.json) {
    console.log(JSON.stringify({ ...preview, confirm_required: true }));
  } else {
    printPreview(preview);
  }
  return 3;
}

/** Render a thrown error to stderr and return the process exit code (1).
 *  prerequisite_failed envelopes (D-06) render as an actionable blocked state
 *  with next_action + dashboard_url; everything else falls back to err.message
 *  (which already carries the 401 "run `appo login`" hint from apiFetch). */
function renderError(err) {
  const env = err.envelope;
  if (env?.error === 'prerequisite_failed') {
    console.error(`\n  Blocked: ${env.message}`);
    if (env.details?.dashboard_url) {
      console.error(`  Next: ${env.details.next_action} -> ${env.details.dashboard_url}\n`);
    }
    return 1;
  }
  console.error(`\n  Error: ${err.message}\n`);
  return 1;
}

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll a build to terminal. Public build-status enum: queued|building|ready|failed
 *  (VERIFIED — 02-RESEARCH.md). ready == terminal success, failed == terminal failure;
 *  anything else keeps polling. sleep/intervalMs/timeoutMs are injectable so tests run
 *  instantly. onChange streams a line only on status change (D-06). The timeout check is
 *  placed AFTER the terminal checks and BEFORE the sleep, so timeoutMs:0 with a single
 *  non-terminal response returns timeout after one poll.
 *
 *  IN-02: a malformed/empty poll body (`build == null`) is treated as a non-terminal
 *  status (loop continues), so the returned `build` MAY be nullish on `timeout`. Every
 *  outcome therefore also carries `last_status` (string|undefined) — read that, not
 *  `res.build.*`, when a caller needs the last observed status without a null guard.
 *
 *  @param {string} apiBase
 *  @param {string|number} appId
 *  @param {string|number} buildId
 *  @param {{ intervalMs?: number, timeoutMs?: number, sleep?: (ms: number) => Promise<unknown>,
 *            onChange?: (status: unknown, build: unknown) => void, env?: string }} [opts] */
export async function pollBuild(apiBase, appId, buildId, {
  intervalMs = 5000, timeoutMs = 1_800_000, sleep = realSleep, onChange = () => {}, env,
} = {}) {
  const start = Date.now();
  let last = null;
  for (;;) {
    const build = await ops.getBuild(apiBase, appId, buildId, env);
    const status = build?.status;
    if (status !== last) { onChange(status, build); last = status; }
    if (status === 'ready')  return { outcome: 'ready', build, last_status: status };
    if (status === 'failed') return { outcome: 'failed', build, last_status: status };
    if (Date.now() - start >= timeoutMs) return { outcome: 'timeout', build, last_status: status };
    await sleep(intervalMs);
  }
}

/** Preview-safe app id (IN-01): coerce to a number only when the positional id is
 *  numeric, otherwise echo the raw string the user typed. A bare `Number(sub)` on a
 *  non-numeric id (typo/slug) surfaces `NaN` in the human preview and the JSON literal
 *  `null` under --json (JSON.stringify(NaN) === 'null'). The server call always uses the
 *  raw `sub` in the path, so the preview must echo the requested id faithfully. */
function previewId(id) {
  const n = Number(id);
  return Number.isInteger(n) && String(n) === String(id) ? n : id;
}

/** Default to both canonical store tokens; map friendly aliases apple/google. */
function parseStores(raw) {
  if (!raw || raw === true) return ['apple_appstore', 'google_playstore'];
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean)
    .map((s) => s === 'apple' ? 'apple_appstore' : s === 'google' ? 'google_playstore' : s);
}

/** One ledger drives both the human stream and the --json summary (D-11/D-12).
 *  In human mode each log() prints live (ASCII markers only — `->`, no unicode).
 *  In --json mode the stream is suppressed; the whole ledger + final_state is
 *  emitted once at completion. */
function shipReport(json) {
  const steps = [];
  const log = (line) => { if (!json) console.log(line); };
  const record = (step) => { steps.push(step); };
  const finish = (final_state, exitCode) => {
    if (json) console.log(JSON.stringify({ steps, final_state }));
    return exitCode;
  };
  return { log, record, finish };
}

const EXIT = { shipped: 0, gated: 3, blocked: 1, failed: 1 };  // usage error (2) returned before any step

export { confirmGate, renderError };

export async function run(argv) {
  const { flags, positional } = parseArgs(argv);

  // --version / -v / `version`: print the CLI + Node version and exit before the
  // help guard (a bare `--version` has no positional, which would otherwise fall
  // into the no-args help branch). createRequire reads ../package.json relative
  // to this module (src/cli.mjs → repo root) without a runtime dependency.
  if (flags.version || positional[0] === 'version') {
    const require = createRequire(import.meta.url);
    const { version } = require('../package.json');
    console.log(`appo/${version} node/${process.version}`);
    return 0;
  }

  if (flags.help || positional[0] === 'help' || positional.length === 0) {
    console.log(USAGE);
    return 0;
  }

  // A value-less flag parses as boolean true (`--api`); an explicit empty value
  // parses as '' (`--api=`). Both are usage errors (exit 2): an empty string is
  // falsy and would silently fall through to the env/default resolution rather
  // than honoring the user's intent. Rejecting both keeps the guards consistent
  // and prevents resolveApiBase from throwing outside the try.
  if (flags.api === true || flags.api === '') {
    console.error('Usage: --api <url> requires a value');
    return 2;
  }
  if (flags.env === true || flags.env === '') {
    console.error('Usage: --env <name> requires a value');
    return 2;
  }
  if (flags.token === true || flags.token === '') {
    console.error('Usage: --token <pat> requires a value');
    return 2;
  }

  // Resolve the active env ONCE and thread it everywhere (Pitfall 7): a single
  // resolution drives token source + api_base + all apiFetch calls, so a verb
  // can never silently act on the wrong profile.
  const env = activeProfileName(flags.env);
  const apiBase = resolveApiBase(flags.api, env);
  const [command, sub, ...rest] = positional;

  try {
    switch (command) {
      case 'login': {
        // Non-interactive branch: validate the pasted PAT (loginWithToken probes
        // GET /api/v1/apps with THIS token) then store it. The PAT is NEVER echoed.
        if (typeof flags.token === 'string' && flags.token) {
          try {
            await loginWithToken(apiBase, env, flags.token);
          } catch (err) {
            if (err.status === 401) {
              console.error(`Token rejected by ${apiBase} — not stored.`);
              return 1;
            }
            throw err; // network/other → top-level renderError
          }
          console.log(`Stored token for env '${env}' (${apiBase}).`);
          return 0;
        }
        const { apiBase: base } = await login(apiBase, env);
        console.log(`\n  Authenticated env '${env}'. Connected to ${base}.\n`);
        return 0;
      }

      case 'init': {
        // Idempotent: a configured env reports its active state and writes
        // nothing (no clobber of an already-authenticated profile).
        if (storedToken(env)) {
          console.log(`Already configured — active env '${env}' (${apiBase}). Nothing to do.`);
          return 0;
        }
        // First login: --token for CI/agents (validate-then-store, refuse on
        // 401), otherwise the interactive device flow. Mirrors `case 'login'`.
        if (typeof flags.token === 'string' && flags.token) {
          try {
            await loginWithToken(apiBase, env, flags.token);
          } catch (err) {
            if (err.status === 401) {
              console.error(`Token rejected by ${apiBase} — not stored.`);
              return 1;
            }
            throw err; // network/other → top-level renderError
          }
          console.log(`Stored token for env '${env}' (${apiBase}).`);
        } else {
          const { apiBase: base } = await login(apiBase, env);
          console.log(`\n  Authenticated env '${env}'. Connected to ${base}.\n`);
        }
        // Confirming whoami: GET /api/v1/apps doubles as the liveness probe +
        // app count (same as `case 'whoami'`). The token is NEVER printed.
        const apps = unwrap(await apiFetch(apiBase, 'GET', '/api/v1/apps', null, env)) || [];
        const line = (k, v) => console.log(`  ${k.padEnd(18)} ${v}`);
        line('env', env);
        line('api_base', apiBase);
        line('status', `ready — ${apps.length} app(s). Next: appo ship --url <u> --name <n>`);
        return 0;
      }

      case 'upgrade': {
        // Thin dispatch to the injectable upgrade runner. runUpgrade streams
        // npm's output and resolves the child exit code (1 on spawn error).
        return await runUpgrade();
      }

      case 'logout': {
        // Revoke server-side then ALWAYS clear locally (D-10/D-11). The finally
        // clear is load-bearing: a 401 (token already dead) or a network failure
        // must still remove the local token. The failure warning goes to
        // console.error (auditable, captured) and never contains a token.
        try {
          await apiFetch(apiBase, 'DELETE', '/api/v1/user/tokens/current', null, env);
          console.log(`Logged out of '${env}' — token revoked server-side and cleared.`);
        } catch (err) {
          console.error(`Could not confirm server-side revocation for '${env}' (${err.message}). Clearing local token anyway.`);
        } finally {
          clearProfileToken(env); // sibling profiles untouched
        }
        return 0;
      }

      case 'whoami': {
        if (!storedToken(env)) {
          console.log(`No token for env '${env}'. Run \`appo login\`.`);
          return 1;
        }
        try {
          // GET /api/v1/apps doubles as the liveness probe + app count. No v1
          // self-identity endpoint exists (backend gap, D-12) — report env +
          // api_base + count only. The token is NEVER printed.
          const apps = unwrap(await apiFetch(apiBase, 'GET', '/api/v1/apps', null, env)) || [];
          const line = (k, v) => console.log(`  ${k.padEnd(18)} ${v}`);
          line('env', env);
          line('api_base', apiBase);
          line('status', `authenticated — ${apps.length} app(s)`);
          return 0;
        } catch (err) {
          if (err.status === 401) {
            console.log(`env '${env}': token rejected — run \`appo login\`.`);
            return 1;
          }
          throw err;
        }
      }

      case 'env': {
        const cfg = readConfig();
        if (sub === 'list' || sub === undefined) {
          if (Object.keys(cfg.profiles).length === 0) {
            console.log('No environments yet. Run `appo login`.');
            return 0;
          }
          for (const [name, p] of Object.entries(cfg.profiles)) {
            const mark = name === cfg.current ? '*' : ' ';
            console.log(`  ${mark} ${name.padEnd(16)} ${p.api_base ?? '(default)'}`); // never the token
          }
          return 0;
        }
        if (sub === 'use') {
          const name = rest[0];
          if (!name) { console.error('Usage: appo env use <name>'); return 2; }
          if (!cfg.profiles[name]) {
            console.error(`No such env '${name}'. Run \`appo login --env ${name}\` first.`);
            return 2;
          }
          setCurrent(name);
          console.log(`Active env: ${name}.`);
          return 0;
        }
        console.error(`Unknown env subcommand: ${sub}`);
        return 2;
      }

      case 'apps': {
        if (sub === 'create') {
          if (!flags.name || !flags.url) {
            console.error('Usage: appo apps create --name <n> --url <u>');
            return 2;
          }
          const app = await ops.createApp(apiBase, {
            name: flags.name, base_url: flags.url,
            metadata_name: flags['meta-name'], metadata_description: flags['meta-desc'],
          }, env);
          console.log('Created app:');
          printApp(app);
          return 0;
        }
        if (sub === 'list') {
          const apps = unwrap(await apiFetch(apiBase, 'GET', '/api/v1/apps', null, env)) || [];
          if (apps.length === 0) {
            console.log('No apps yet. Create one: appo apps create --name <n> --url <u>');
            return 0;
          }
          for (const a of apps) {
            console.log(`  ${String(a.id).padEnd(5)} ${a.name}  [${a.publication_state}]  ${a.base_url}`);
          }
          return 0;
        }
        if (sub === 'show') {
          if (!rest[0]) {
            console.error('Usage: appo apps show <id>');
            return 2;
          }
          const app = unwrap(await apiFetch(apiBase, 'GET', `/api/v1/apps/${rest[0]}`, null, env));
          printApp(app);
          return 0;
        }
        if (sub === 'set-name') {
          if (!rest[0] || !rest[1]) {
            console.error('Usage: appo apps set-name <id> <name>');
            return 2;
          }
          await apiFetch(apiBase, 'PATCH', `/api/v1/apps/${rest[0]}`, { name: rest.slice(1).join(' ') }, env);
          console.log(`Updated app ${rest[0]}.`);
          return 0;
        }
        console.error(`Unknown apps subcommand: ${sub ?? '(none)'}`);
        return 2;
      }

      case 'status': {
        if (!sub) { console.error('Usage: appo status <id> [--build <buildId>]'); return 2; }
        const path = flags.build
          ? `/api/v1/apps/${sub}/builds/${flags.build}`
          : `/api/v1/apps/${sub}`;
        const res = await apiFetch(apiBase, 'GET', path, null, env);
        if (flags.json) { console.log(JSON.stringify(res)); return 0; }
        const d = unwrap(res);
        if (flags.build) printBuild(d); else printApp(d);
        return 0;
      }

      case 'preview': {
        if (!sub) { console.error('Usage: appo preview <id>'); return 2; }
        // --json: verbatim flat body (D-05/D-08). Direct apiFetch — never reaches the printer/QR.
        if (flags.json) {
          const res = await apiFetch(apiBase, 'GET', `/api/v1/apps/${sub}/preview`, null, env);
          console.log(JSON.stringify(res));
          return 0;
        }
        // Human path: 404 throws -> top-level catch -> renderError (exit 1).
        const d = await ops.getPreview(apiBase, sub, env);
        printPreviewPayload(d);
        return 0;
      }

      case 'rejection': {
        if (!sub) { console.error('Usage: appo rejection <id>'); return 2; }
        try {
          const res = await apiFetch(apiBase, 'GET', `/api/v1/apps/${sub}/rejection`, null, env);
          if (flags.json) { console.log(JSON.stringify(res)); return 0; }
          printRejection(unwrap(res));
          return 0;
        } catch (err) {
          // D-08: --json always emits the raw envelope verbatim (any status, not just 404).
          if (flags.json && err.envelope) { console.log(JSON.stringify(err.envelope)); return 1; }
          if (err.status === 404) { console.log('No active rejection for this app.'); return 1; }
          throw err;
        }
      }

      case 'fix-recipe': {
        if (!sub) { console.error('Usage: appo fix-recipe <id>'); return 2; }
        try {
          const res = await apiFetch(apiBase, 'GET', `/api/v1/apps/${sub}/rejection/recipe`, null, env);
          if (flags.json) { console.log(JSON.stringify(res)); return 0; }
          const recipes = unwrap(res) || [];
          for (const r of recipes) printRecipe(r);
          return 0;
        } catch (err) {
          // D-08: --json always emits the raw envelope verbatim (any status, not just 404).
          if (flags.json && err.envelope) { console.log(JSON.stringify(err.envelope)); return 1; }
          if (err.status === 404) { console.log('No active rejection for this app.'); return 1; }
          throw err;
        }
      }

      case 'build': {
        if (!sub) { console.error('Usage: appo build <id> [--platform ios|android|all] [--branch <ref>]'); return 2; }
        // --json carve-out: print the RAW {data:...} envelope verbatim (D-08). Gated
        // BEFORE the human path so the unwrapping op is never reached in --json mode
        // (mirrors case 'status'). ops.triggerBuild returns UNWRAPPED data and cannot
        // serve this branch without breaking the verbatim-envelope contract.
        if (flags.json) {
          const body = {};
          if (flags.platform) body.platform = flags.platform;   // ios|android|all (server-validated)
          if (flags.branch)   body.branch   = flags.branch;     // /^[A-Za-z0-9._\/-]+$/ (server-validated)
          const res = await apiFetch(apiBase, 'POST', `/api/v1/apps/${sub}/builds`, body, env);
          console.log(JSON.stringify(res));
          return 0;
        }
        // Human path: the build-trigger POST has its ONE transport definition in
        // ops.triggerBuild (shared with the Plan 02 ship orchestrator).
        // D-03: never poll/wait — return the id immediately. A 422 prerequisite_failed
        // (APP_BLOCKED etc.) propagates to the top-level renderError (D-06 actionable block).
        const b = await ops.triggerBuild(apiBase, sub, { platform: flags.platform, branch: flags.branch }, env) || {};
        console.log(`Build #${b.id} started (${b.platform}). Poll: appo status ${sub} --build ${b.id}`);
        return 0;
      }

      case 'configure': {
        if (!sub) { console.error('Usage: appo configure <id> [--name <n>] [--url <u>] [--meta-name <m>] [--meta-desc <d>] [--injected-css <css>] [--injected-js <js>]'); return 2; }
        const body = {};
        if (flags.name)            body.name = flags.name;
        if (flags.url)             body.base_url = flags.url;
        if (flags['meta-name'])    body.metadata_name = flags['meta-name'];
        if (flags['meta-desc'])    body.metadata_description = flags['meta-desc'];
        if (flags['injected-css']) body.injected_css = flags['injected-css'];
        if (flags['injected-js'])  body.injected_javascript = flags['injected-js'];
        if (Object.keys(body).length === 0) { console.error('Usage: appo configure <id> [--name <n>] [--url <u>] [--meta-name <m>] [--meta-desc <d>] [--injected-css <css>] [--injected-js <js>]'); return 2; }
        await apiFetch(apiBase, 'PATCH', `/api/v1/apps/${sub}`, body, env);   // 204 -> apiFetch returns null
        if (flags.json) { console.log('null'); return 0; }              // Pitfall 5 / D-08: no body to passthrough
        console.log(`Updated app ${sub}.`);
        return 0;
      }

      case 'publish': {
        if (!sub || !flags.stores) { console.error('Usage: appo publish <id> --stores apple_appstore,google_playstore --confirm'); return 2; }
        // --stores is a comma list of canonical AppStore tokens; the apple/google
        // alias mapping has its ONE definition in parseStores (shared with `ship`).
        // The `!flags.stores` guard above preserves "missing --stores -> exit 2";
        // the length check below rejects a present-but-empty value (e.g. `--stores ,,`).
        const stores = parseStores(flags.stores);
        if (stores.length === 0) { console.error('Usage: appo publish <id> --stores apple_appstore,google_playstore --confirm'); return 2; }
        const gated = confirmGate(flags, { will: 'publish', app_id: previewId(sub), target_stores: stores });
        if (gated !== null) return gated;                       // exit 3, NO write (D-04/D-05/D-07)
        await ops.publishApp(apiBase, sub, stores, env);        // 204 -> null
        if (flags.json) { console.log('null'); return 0; }      // Pitfall 5 / D-08: no body to passthrough
        console.log(`Publication started for: ${stores.join(', ')}`);
        return 0;
      }

      case 'resubmit': {
        if (!sub) { console.error('Usage: appo resubmit <id> --confirm'); return 2; }
        const gated = confirmGate(flags, {
          will: 'resubmit', app_id: previewId(sub),
          current_state: 'rejected', target_state: 'in_review',
          note: 'A customer-owned Apple Developer credential is required before resubmitting.',
        });
        if (gated !== null) return gated;                       // exit 3, NO write
        const res = await apiFetch(apiBase, 'POST', `/api/v1/apps/${sub}/resubmit`, null, env);  // 200 { data:{status:'in_review'} }
        // 422 prerequisite_failed (CUSTOMER_ASC_CREDENTIAL_MISSING / INVALID_APP_STATE)
        // propagates to the shared renderError as an actionable Blocked state (D-06).
        if (flags.json) { console.log(JSON.stringify(res)); return 0; }
        console.log('Resubmission started — now in review.');
        return 0;
      }

      case 'push': {
        if (!sub || !flags.title || !flags.body) { console.error('Usage: appo push <id> --title <t> --body <b> [--target-url <u>] [--image-path <p>] [--scheduled-at <when>] --confirm'); return 2; }
        // Preview OMITS the recipient count — v1 exposes it only post-send (Pitfall 2);
        // no pre-send audience-size leak.
        const gated = confirmGate(flags, { will: 'send_push', app_id: previewId(sub), title: flags.title });
        if (gated !== null) return gated;                       // exit 3, NO write
        const body = { title: flags.title, body: flags.body };
        if (flags['target-url'])   body.target_url = flags['target-url'];
        if (flags['image-path'])   body.image_path = flags['image-path'];
        if (flags['scheduled-at']) body.scheduled_at = flags['scheduled-at'];
        const res = await apiFetch(apiBase, 'POST', `/api/v1/apps/${sub}/push-notifications`, body, env);  // 201
        if (flags.json) { console.log(JSON.stringify(res)); return 0; }
        // recipients_count is a sibling of `data` (additional) — read off the raw envelope.
        console.log(`Sent to ${res?.recipients_count ?? 0} device(s).`);
        return 0;
      }

      case 'ship': {
        const hasId = sub && !sub.startsWith('--');
        if (!hasId && (!flags.url || !flags.name)) {
          // D-13 usage error — BEFORE any HTTP and BEFORE the ledger. Plain-text
          // stderr + exit 2 even under --json (the single-object ledger contract
          // applies only once a pipeline step has begun).
          console.error('Usage: appo ship <id> | appo ship --url <u> --name <n> [--stores <list>] [--platform ios|android|all] [--yes] [--timeout <s>] [--json]');
          return 2;
        }
        const json = flags.json === true;
        // Reimplement the gate DECISION — do NOT call confirmGate (it keys only on
        // flags.confirm and emits its own competing --json object, breaking the
        // single-ledger contract). printPreview is reused verbatim below.
        const wantYes = flags.yes === true || flags.confirm === true;
        const stores = parseStores(flags.stores);
        const { log, record, finish } = shipReport(json);

        // In --json mode a thrown prerequisite_failed/conflict is caught locally so
        // ONE ledger object still emits (D-12). In human mode, rethrow to the
        // top-level catch -> renderError (Blocked/Next lines).
        const handleBlock = (err, step, extra = {}) => {
          if (!json) throw err;
          record({ step, status: 'blocked', code: err.envelope?.code, message: err.message, ...extra });
          return finish('blocked', EXIT.blocked);
        };

        let appId = hasId ? sub : null;

        // STEP create (new-app form only).
        if (!appId) {
          let app;
          try {
            app = await ops.createApp(apiBase, {
              name: flags.name, base_url: flags.url,
              metadata_name: flags['meta-name'], metadata_description: flags['meta-desc'],
            }, env);
          } catch (err) { return handleBlock(err, 'create'); }
          appId = (app || {}).id;
          record({ step: 'create', status: 'ok', app_id: appId });
          log(`> create ... ok app #${appId}`);
        }

        // STEP build trigger. prerequisite_failed (Apple creds etc.) blocks HERE,
        // before any build exists. Surface app_id for resume on a post-create block.
        let build;
        try {
          build = await ops.triggerBuild(apiBase, appId, { platform: flags.platform, branch: flags.branch }, env);
        } catch (err) {
          if (!json) console.error(`  (app #${appId} exists — resume with: appo ship ${appId})`);
          return handleBlock(err, 'build', { app_id: appId });
        }
        const buildId = (build || {}).id;
        record({ step: 'build', status: 'ok', build_id: buildId });
        log(`> build #${buildId} ... ${build.status}`);

        // STEP poll to terminal (injectable sleep defaults to real setTimeout).
        // Honor an explicit --timeout 0 (forces an immediate timeout): only fall
        // back to the 1800s default when the flag is absent or non-numeric — a bare
        // `|| 1800` would coerce the legitimate 0 back to the default.
        const timeoutSecs = Number.isFinite(Number(flags.timeout)) && flags.timeout !== true
          ? Number(flags.timeout) : 1800;
        const res = await pollBuild(apiBase, appId, buildId, {
          timeoutMs: timeoutSecs * 1000,
          onChange: (s) => log(`  ${s} -> ...`),
          env,
        });
        if (res.outcome === 'failed') {
          record({ step: 'build', status: 'failed', build_id: buildId });
          log(`x build failed. Next: appo fix-recipe ${appId}  (or: appo rejection ${appId})`);
          return finish('failed', EXIT.failed);
        }
        if (res.outcome === 'timeout') {
          // The internal terminal `rejected` coarsens to public `building` (Pitfall 2):
          // point the user at the app overview as well as the build status.
          record({ step: 'build', status: 'timeout', build_id: buildId, last_status: res.last_status });
          log(`x timed out at "${res.last_status}". Resume: appo status ${appId} --build ${buildId}  (or: appo status ${appId})`);
          return finish('failed', EXIT.failed);
        }
        log(`ok build ready`);

        // STEP publish — honor the confirm-gate DECISION (reuses printPreview only).
        const preview = { will: 'publish', app_id: previewId(appId), target_stores: stores };
        if (!wantYes) {
          if (!json) printPreview(preview);
          record({ step: 'publish', status: 'gated', target_stores: stores });
          return finish('gated', EXIT.gated);   // NO publish POST issued — high-severity gate invariant
        }
        log(`> publish ...`);
        try {
          await ops.publishApp(apiBase, appId, stores, env);   // 204 == success; 409/422 throw
        } catch (err) { return handleBlock(err, 'publish', { app_id: appId }); }
        record({ step: 'publish', status: 'ok', target_stores: stores });
        log(`ok shipped: ${stores.join(', ')}`);
        return finish('shipped', EXIT.shipped);
      }

      default:
        console.error(`Unknown command: ${command}\n`);
        console.log(USAGE);
        return 2;
    }
  } catch (err) {
    return renderError(err);
  }
}
