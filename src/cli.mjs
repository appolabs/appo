import {
  resolveApiBase,
  activeProfileName,
  storedToken,
  writeProfile,
  clearProfileToken,
  setCurrent,
  readConfig,
} from './config.mjs';
import { login, loginWithToken } from './login.mjs';
import { apiFetch } from './api.mjs';
import * as ops from './ops.mjs';
import { unwrap } from './ops.mjs';
import { downloadArtifact } from './download.mjs';
import { renderQr } from './qr.mjs';
import { createRequire } from 'node:module';
import * as readline from 'node:readline/promises';
import { runUpgrade } from './upgrade.mjs';
import { runMcpInstall } from './mcp.mjs';

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
  appo apps create --name <n> --url <u>   Create a new app
  appo apps list                  List your apps
  appo apps show <id>             Show one app
  appo apps update <id> [--name <n>] [--url <u>] [--icon <https-url>] [--permission <name>=<on|off>]   Update name, URL, icon, permissions

Lifecycle:
  appo new --url <u> [--name <n>] [--prepare]   Create your app — name defaults from the URL
  appo ship <id> [--stores <list>] [--yes]   Ship it to the stores (republish / resubmit after a rejection too)
  appo status <id>                        App overview (publication state + next action)
  appo preview [id]                       Show preview target (TestFlight/deeplink + QR); no id: your only app, or a picker
  appo rejection <id>                     Show the active App Store rejection
  appo fix-recipe <id>                    Show the fix recipe for a rejection
  appo publish <id> [--confirm]           Publish an already-built app to its stores
  appo push <id> --title <t> --body <b> [--target-url <u>] [--image-path <p>] [--scheduled-at <when>] --confirm   Send a push notification

Test builds & devices:
  appo download <id> [--build <n>] [--output <path>]   Download the installable artifact once ready (prepare one with \`appo preview\`)
  appo devices list               List your registered iOS test devices
  appo devices register           Show the iOS device registration link + QR (one-time per device)

AI editor:
  appo mcp                        Install the Appo MCP server so your AI editor can drive Appo (Claude Code, Codex, Cursor)

Options:
  --api <url>    Override the API base (env: APPO_API_BASE)
  --env <name>   Select the environment/profile (env: APPO_ENV)
  --token <pat>  Personal access token for \`login --token\` (never stored elsewhere)
  --json         Print the raw v1 response body (machine-readable)
  --confirm      Perform the write for a destructive verb (publish/push)
  --yes          Confirm the publish step of \`ship\` (alias of --confirm)
  --stores <l>   Override target stores for \`ship\`/\`publish\` (default: the app's stores)
  --build <n>    Target a specific build id (\`status\`/\`download\`; default: latest)
  --output <p>   Write the downloaded artifact to this path (default: derived filename)
  -h, --help     Show this help
  -v, --version  Print the CLI + Node version

Exit codes:
  0  success
  1  runtime / API error (incl. auth failure — run \`appo login\`)
  2  usage error (missing or invalid arguments)
  3  confirm required (destructive verb invoked without --confirm; preview shown, no write)

  ship maps these to its final lifecycle state: 0 shipped / 1 blocked /
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
  // Flags allowed to repeat collect their values into an array
  // (e.g. `--permission camera=on --permission nfc=off`); all others take the last value.
  const repeatable = new Set(['permission']);
  const assign = (key, value) => {
    if (repeatable.has(key)) {
      if (!Array.isArray(flags[key])) { flags[key] = []; }
      flags[key].push(value);
    } else {
      flags[key] = value;
    }
  };
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
        assign(a.slice(2, eq), a.slice(eq + 1));
        continue;
      }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        assign(key, true);
      } else {
        assign(key, next);
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
  line('kind', b.kind);
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
  // D-02 (Pitfall 1): renderQr returns the BARE matrix (snapshot-stable). Hoisted to
  // function scope so both the ad-hoc switch and the null-fallback branch can call printQr
  // without a ReferenceError (CONTRAST/RESET were previously scoped to the old if-block).
  const CONTRAST = '\x1b[30;47m'; // black fg on white bg
  const RESET = '\x1b[0m';
  const printQr = (url) => {
    console.log('');
    for (const row of renderQr(url).split('\n')) {
      console.log(`${CONTRAST}${row}${RESET}`);
    }
  };
  // D-04: readiness lines FIRST, per-platform. preview_ready is {ios:bool, android:bool}.
  // appo mode (preview_mode_ios=appo): iOS opens via the APPO container, so it is
  // preview-ready even though preview_ready.ios (TestFlight-gated) stays false (GAP-AGENT-IOS).
  const iosAppo = !!(d.ios && d.ios.mode && d.ios.mode !== 'native');
  const iosReady = r.ios || iosAppo;
  console.log(`  ios                ${iosReady ? 'preview-ready' : 'not preview-ready yet'}`);
  console.log(`  android            ${r.android ? 'preview-ready' : 'not preview-ready yet'}`);
  if (r.ios)     line('ios_testflight_url', d.ios_testflight_url);
  if (iosAppo)   console.log('  ios                opens via the APPO container (scan preview_url below)');
  if (r.android) line('android_deeplink',   d.android_deeplink);
  line('preview_url', d.preview_url);   // always present
  // D-10/D-09: when ios_ad_hoc is present its state drives the render; the ad-hoc QR
  // (registration/install URL) replaces the preview_url QR to avoid two QRs on screen.
  const adHoc = d.ios_ad_hoc;
  if (adHoc && adHoc.state) {
    switch (adHoc.state) {
      case 'awaiting-registration':
        console.log('  ios (ad-hoc)       register your iPhone to preview this app');
        if (adHoc.registration_url) {
          line('registration_url', adHoc.registration_url);
          printQr(adHoc.registration_url);
        }
        return;
      case 'stamping':
        console.log('  ios (ad-hoc)       building your iOS preview — usually under 2 minutes');
        return;
      case 'ready':
        console.log('  ios (ad-hoc)       ready to install');
        if (adHoc.install_url) {
          line('install_url', adHoc.install_url);
          printQr(adHoc.install_url);
        }
        return;
      case 'blocked':
        // D-09: print message verbatim, no QR, no fallback.
        console.log(`  ios (ad-hoc)       ${adHoc.message || 'iOS preview is not available — the device registration limit has been reached.'}`);
        return;
    }
  }
  // No ad-hoc block (null) — D-03: gate the QR on READINESS, not on preview_url nullness.
  if (iosReady || r.android) {
    printQr(d.preview_url);
  } else {
    console.log('  (no preview target yet — build and publish to enable preview)');
  }
}

/** Human-readable preview of a pending destructive write (publish/push).
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
async function confirmGate(flags, preview) {
  if (flags.confirm) return null;
  if (flags.json) {
    console.log(JSON.stringify({ ...preview, confirm_required: true }));
    return 3;
  }
  printPreview(preview);
  // Interactive sessions turn the gate into a question; scripts keep exit 3.
  if (isInteractive(flags) && isYes(await askLine('Proceed? [y/N] '))) {
    return null;
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

/** Preview-safe app id (IN-01): coerce to a number only when the positional id is
 *  numeric, otherwise echo the raw string the user typed. A bare `Number(sub)` on a
 *  non-numeric id (typo/slug) surfaces `NaN` in the human preview and the JSON literal
 *  `null` under --json (JSON.stringify(NaN) === 'null'). The server call always uses the
 *  raw `sub` in the path, so the preview must echo the requested id faithfully. */
function previewId(id) {
  const n = Number(id);
  return Number.isInteger(n) && String(n) === String(id) ? n : id;
}

/** Interactive-session test shared by every prompt: never under --json and only
 *  when both stdio ends are TTYs, so scripts and agents keep exit-code behavior. */
function isInteractive(flags) {
  return !flags.json && process.stdin.isTTY && process.stdout.isTTY;
}

/** One-line readline question; always closes the interface. EOF (Ctrl-D)
 *  resolves to an empty answer so callers fall through to their usage error
 *  or default instead of hanging on a settled stream. */
async function askLine(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise((resolve) => {
      rl.once('close', () => resolve(''));
      rl.question(question).then(
        (answer) => resolve(answer.trim()),
        () => resolve(''),
      );
    });
  } finally {
    rl.close();
  }
}

function isYes(answer) {
  return /^y(es)?$/i.test(answer);
}

/** After an interactive `new`, offer to wire the Appo MCP so the user's AI
 *  editor can drive Appo. Opt-in ([y/N]) so it never touches editor config
 *  unsolicited, and never runs under --json / non-TTY. */
async function maybeOfferMcp(flags) {
  if (!isInteractive(flags)) { return; }
  console.log('');
  if (isYes(await askLine('Let your AI editor drive Appo? Install the MCP (Claude Code, Codex) [y/N] '))) {
    await runMcpInstall();
  }
}

/** Resolve which app a verb targets when no positional id is given.
 *  One app -> use it. None -> actionable create hint (exit 1). Several -> a
 *  numbered picker on a TTY; otherwise the list plus a usage hint (exit 2),
 *  since scripts and --json runs cannot answer a prompt. Returns { id } on
 *  success or { exit } when the caller should stop with that code. */
async function resolveTargetApp(apiBase, env, flags, {
  usageHint = 'appo preview <id>',
  selectLabel = 'Select an app to preview:',
} = {}) {
  const apps = await ops.listApps(apiBase, env);
  if (apps.length === 0) {
    console.error('No apps yet. Create one: appo new --url <u>');
    return { exit: 1 };
  }
  if (apps.length === 1) {
    if (!flags.json) {
      console.log(`Using ${apps[0].name} (id ${apps[0].id}), your only app.\n`);
    }
    return { id: apps[0].id };
  }
  const interactive = !flags.json && process.stdin.isTTY && process.stdout.isTTY;
  if (!interactive) {
    console.error(`Several apps found. Pass an id: ${usageHint}`);
    for (const a of apps) {
      console.error(`  ${String(a.id).padEnd(5)} ${a.name}  ${a.base_url}`);
    }
    return { exit: 2 };
  }
  console.log(selectLabel);
  apps.forEach((a, i) => {
    console.log(`  ${i + 1}) ${a.name}  (id ${a.id})  ${a.base_url}`);
  });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let answer;
  try {
    answer = (await rl.question(`Choice [1-${apps.length}]: `)).trim();
  } finally {
    rl.close();
  }
  const n = Number(answer);
  if (!Number.isInteger(n) || n < 1 || n > apps.length) {
    console.error('Invalid choice.');
    return { exit: 2 };
  }
  return { id: apps[n - 1].id };
}

/** Ensure the URL carries a scheme; a bare domain (`tuosito.com`) gets https
 *  prepended client-side, before any HTTP. */
function ensureScheme(raw) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/** Default app name from a URL: hostname minus a leading `www.`, first label,
 *  capitalized (`https://www.pizza-mario.it` -> `Pizza-mario`). Throws on an
 *  unparseable URL — the caller maps that to a usage error. */
function nameFromUrl(url) {
  const label = new URL(url).hostname.replace(/^www\./, '').split('.')[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
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

const EXIT = { shipped: 0, gated: 3, blocked: 1 };  // failed/timeout removed (no build); usage error (2) returned before any step

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
  let [command, sub, ...rest] = positional;

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
        line('status', `ready — ${apps.length} app(s). Next: appo new --url <u>`);
        return 0;
      }

      case 'mcp': {
        // The primary way to wire the Appo MCP into an AI editor. `new` also
        // offers this after creating an app; this verb is the direct route.
        return await runMcpInstall();
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
          let name = rest[0];
          if (!name && isInteractive(flags)) {
            const names = Object.keys(cfg.profiles);
            if (names.length > 0) {
              console.log('Environments:');
              names.forEach((n, i) => {
                console.log(`  ${i + 1}) ${n}${n === cfg.current ? ' (current)' : ''}`);
              });
              const answer = await askLine(`Choice [1-${names.length}]: `);
              const n = Number(answer);
              if (Number.isInteger(n) && n >= 1 && n <= names.length) { name = names[n - 1]; }
            }
          }
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
          if (isInteractive(flags)) {
            if (!flags.url) { flags.url = await askLine('Site URL: '); }
            if (!flags.name) { flags.name = await askLine('App name: '); }
          }
          if (!flags.name || !flags.url) {
            console.error('Usage: appo apps create --name <n> --url <u>');
            return 2;
          }
          const app = await ops.createApp(apiBase, { name: flags.name, base_url: flags.url }, env);
          console.log('Created app:');
          printApp(app);
          return 0;
        }
        if (sub === 'list') {
          const apps = await ops.listApps(apiBase, env);
          if (apps.length === 0) {
            console.log('No apps yet. Create one: appo new --url <u>');
            return 0;
          }
          for (const a of apps) {
            console.log(`  ${String(a.id).padEnd(5)} ${a.name}  [${a.publication_state}]  ${a.base_url}`);
          }
          return 0;
        }
        if (sub === 'show') {
          let id = rest[0];
          if (!id && isInteractive(flags)) {
            const resolved = await resolveTargetApp(apiBase, env, flags, { usageHint: 'appo apps show <id>', selectLabel: 'Select an app:' });
            if (resolved.exit !== undefined) { return resolved.exit; }
            id = String(resolved.id);
          }
          if (!id) {
            console.error('Usage: appo apps show <id>');
            return 2;
          }
          const app = unwrap(await apiFetch(apiBase, 'GET', `/api/v1/apps/${id}`, null, env));
          printApp(app);
          return 0;
        }
        if (sub === 'update') {
          let id = rest[0];
          const usage = 'Usage: appo apps update <id> [--name <n>] [--url <u>] [--icon <https-url>] [--permission <name>=<on|off>]';
          if (!id && isInteractive(flags)) {
            const resolved = await resolveTargetApp(apiBase, env, flags, { usageHint: 'appo apps update <id>', selectLabel: 'Select an app to update:' });
            if (resolved.exit !== undefined) { return resolved.exit; }
            id = String(resolved.id);
          }
          if (!id) { console.error(usage); return 2; }

          const body = {};
          if (flags.name) body.name = flags.name;
          if (flags.url)  body.base_url = flags.url;
          // Empty-value guard: a bare `--icon` parses to boolean true, failing the typeof
          // string test — falls through to the usage error when it is the only flag.
          let wantIcon = typeof flags.icon === 'string' && flags.icon;

          // --permission <name>=<on|off>, repeatable. Parsed into a partial toggle map
          // merged server-side (PATCH /permissions). Names and values are validated here
          // so a malformed flag fails with exit 2 before any write is issued.
          const ALLOWED_PERMISSIONS = ['tracking', 'camera', 'microphone', 'nfc'];
          const permissionInputs = flags.permission === undefined
            ? []
            : (Array.isArray(flags.permission) ? flags.permission : [flags.permission]);
          /** @type {Record<string, boolean>} */
          const permissions = {};
          for (const raw of permissionInputs) {
            const spec = typeof raw === 'string' ? raw : '';
            const eq = spec.indexOf('=');
            const name = eq === -1 ? '' : spec.slice(0, eq).trim().toLowerCase();
            const value = eq === -1 ? '' : spec.slice(eq + 1).trim().toLowerCase();
            if (!ALLOWED_PERMISSIONS.includes(name)) {
              console.error(`Invalid --permission ${JSON.stringify(spec)}. Use <name>=<on|off> where name is one of: ${ALLOWED_PERMISSIONS.join(', ')}.`);
              return 2;
            }
            if (value !== 'on' && value !== 'off') {
              console.error(`Invalid --permission ${JSON.stringify(spec)}. Value must be on or off.`);
              return 2;
            }
            permissions[name] = value === 'on';
          }
          const wantPermissions = Object.keys(permissions).length > 0;

          if (Object.keys(body).length === 0 && !wantIcon && !wantPermissions && isInteractive(flags)) {
            const name = await askLine('New name (enter to skip): ');
            if (name) { body.name = name; }
            const url = await askLine('New URL (enter to skip): ');
            if (url) { body.base_url = url; }
            const icon = await askLine('Icon https URL (enter to skip): ');
            if (icon) { flags.icon = icon; wantIcon = icon; }
          }

          if (Object.keys(body).length === 0 && !wantIcon && !wantPermissions) { console.error(usage); return 2; }

          // Multi-call dispatch (D-04): PATCH name/url, THEN POST /icon, THEN PATCH /permissions.
          // No transaction — an earlier throw skips the rest and renders the error (the user re-runs).
          let iconUrl;
          if (Object.keys(body).length > 0) {
            await apiFetch(apiBase, 'PATCH', `/api/v1/apps/${id}`, body, env);   // 204 -> null
          }
          if (wantIcon) {
            const res = await ops.setIcon(apiBase, id, flags.icon, env);         // 200 { icon_url }
            iconUrl = res?.icon_url;
          }
          let permissionsResult;
          if (wantPermissions) {
            const res = await ops.setPermissions(apiBase, id, permissions, env); // 200 { permissions }
            permissionsResult = res?.permissions;
          }

          if (flags.json) {
            // Pitfall 5: keep `null` for a name/URL-only update (204, no body); emit only the
            // sub-results that actually ran — { icon_url } and/or { permissions }.
            const out = {};
            if (wantIcon) { out.icon_url = iconUrl; }
            if (wantPermissions) { out.permissions = permissionsResult; }
            console.log(Object.keys(out).length > 0 ? JSON.stringify(out) : 'null');
            return 0;
          }
          console.log(`Updated app ${id}.`);
          if (wantIcon) console.log(`  icon set: ${iconUrl}`);
          if (wantPermissions) {
            const summary = Object.entries(permissions).map(([k, v]) => `${k}=${v ? 'on' : 'off'}`).join(', ');
            console.log(`  permissions set: ${summary}`);
          }
          return 0;
        }
        console.error(`Unknown apps subcommand: ${sub ?? '(none)'}`);
        return 2;
      }

      case 'status': {
        if (!sub && isInteractive(flags)) {
          const resolved = await resolveTargetApp(apiBase, env, flags, { usageHint: 'appo status <id>', selectLabel: 'Select an app:' });
          if (resolved.exit !== undefined) { return resolved.exit; }
          sub = String(resolved.id);
        }
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
        let id = sub;
        if (!id) {
          const resolved = await resolveTargetApp(apiBase, env, flags);
          if (resolved.exit !== undefined) { return resolved.exit; }
          id = resolved.id;
        }
        // --json: verbatim flat body (D-05/D-08). Direct apiFetch — never reaches the printer/QR.
        if (flags.json) {
          const res = await apiFetch(apiBase, 'GET', `/api/v1/apps/${id}/preview`, null, env);
          console.log(JSON.stringify(res));
          return 0;
        }
        // Human path: 404 throws -> top-level catch -> renderError (exit 1).
        const d = await ops.getPreview(apiBase, id, env);
        printPreviewPayload(d);
        return 0;
      }

      case 'rejection': {
        if (!sub && isInteractive(flags)) {
          const resolved = await resolveTargetApp(apiBase, env, flags, { usageHint: 'appo rejection <id>', selectLabel: 'Select an app:' });
          if (resolved.exit !== undefined) { return resolved.exit; }
          sub = String(resolved.id);
        }
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
        if (!sub && isInteractive(flags)) {
          const resolved = await resolveTargetApp(apiBase, env, flags, { usageHint: 'appo fix-recipe <id>', selectLabel: 'Select an app:' });
          if (resolved.exit !== undefined) { return resolved.exit; }
          sub = String(resolved.id);
        }
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

      case 'publish': {
        if (!sub && isInteractive(flags)) {
          const resolved = await resolveTargetApp(apiBase, env, flags, { usageHint: 'appo publish <id>', selectLabel: 'Select an app to publish:' });
          if (resolved.exit !== undefined) { return resolved.exit; }
          sub = String(resolved.id);
        }
        if (!sub) { console.error('Usage: appo publish <id> [--stores <list>] [--confirm]'); return 2; }
        // --stores is an OPTIONAL override; when ABSENT (undefined), parseStores
        // defaults to the app's canonical stores (both) so the user never has to know
        // store tokens. But an EXPLICIT empty value is a usage error: the user meant
        // to name stores and gave none. '' is falsy (parseStores would default it), so
        // reject it here; `--stores ,,` is caught by the length check below (IN-01).
        if (flags.stores === '') { console.error('Usage: appo publish <id> [--stores <list>] [--confirm]'); return 2; }
        const stores = parseStores(flags.stores);
        if (stores.length === 0) { console.error('Usage: appo publish <id> [--stores <list>] [--confirm]'); return 2; }
        const gated = await confirmGate(flags, { will: 'publish', app_id: previewId(sub), target_stores: stores });
        if (gated !== null) return gated;                       // exit 3, NO write (D-04/D-05/D-07)
        await ops.publishApp(apiBase, sub, stores, env);        // 204 -> null
        if (flags.json) { console.log('null'); return 0; }      // Pitfall 5 / D-08: no body to passthrough
        console.log(`Publication started for: ${stores.join(', ')}`);
        return 0;
      }

      case 'push': {
        if (!sub && isInteractive(flags)) {
          const resolved = await resolveTargetApp(apiBase, env, flags, { usageHint: 'appo push <id> --title <t> --body <b> --confirm', selectLabel: 'Select an app for the push:' });
          if (resolved.exit !== undefined) { return resolved.exit; }
          sub = String(resolved.id);
        }
        if (isInteractive(flags)) {
          if (!flags.title) { flags.title = await askLine('Title: '); }
          if (!flags.body) { flags.body = await askLine('Body: '); }
        }
        if (!sub || !flags.title || !flags.body) { console.error('Usage: appo push <id> --title <t> --body <b> [--target-url <u>] [--image-path <p>] [--scheduled-at <when>] --confirm'); return 2; }
        // Preview OMITS the recipient count — v1 exposes it only post-send (Pitfall 2);
        // no pre-send audience-size leak.
        const gated = await confirmGate(flags, { will: 'send_push', app_id: previewId(sub), title: flags.title });
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

      case 'download': {
        // Fetch the installable artifact (DL-01). Without --build, targets the
        // newest ready build; a not-yet-ready latest build reports its status
        // instead of failing opaquely.
        if (!sub && isInteractive(flags)) {
          const resolved = await resolveTargetApp(apiBase, env, flags, { usageHint: 'appo download <id>', selectLabel: 'Select an app to download:' });
          if (resolved.exit !== undefined) { return resolved.exit; }
          sub = String(resolved.id);
        }
        if (!sub) { console.error('Usage: appo download <id> [--build <n>] [--output <path>]'); return 2; }
        try {
          let buildId = flags.build;
          if (!buildId) {
            const builds = unwrap(await apiFetch(apiBase, 'GET', `/api/v1/apps/${sub}/builds`, null, env)) || [];
            if (builds.length === 0) {
              console.log(`No builds yet. Prepare one: appo preview ${sub}`);
              return 1;
            }
            const ready = builds.find((b) => b.status === 'ready' && b.artifact_url);
            if (!ready) {
              const latest = builds[0];
              console.log(`Latest build #${latest.id} is '${latest.status}' — artifact not ready yet.`);
              console.log(`  check: appo status ${sub} --build ${latest.id}`);
              return 1;
            }
            buildId = ready.id;
          }
          const { file, bytes } = await downloadArtifact(apiBase, sub, buildId, env, typeof flags.output === 'string' ? flags.output : undefined);
          if (flags.json) { console.log(JSON.stringify({ build_id: previewId(buildId), file, bytes })); return 0; }
          console.log(`Saved build #${buildId} artifact -> ${file} (${bytes} bytes)`);
          return 0;
        } catch (err) {
          // D-08: --json always emits the raw envelope verbatim.
          if (flags.json && err.envelope) { console.log(JSON.stringify(err.envelope)); return 1; }
          throw err; // 409 not-ready / 403 / 404 -> renderError
        }
      }

      case 'devices': {
        // iOS ad-hoc test-device surface (DEV-01). `register` renders the signed
        // 24h enrollment link + QR (opened on the iPhone, zero Apple login);
        // `list` shows the registered pool (UDIDs arrive pre-truncated server-side).
        if (sub === 'register') {
          const res = await apiFetch(apiBase, 'GET', '/api/v1/devices/ad-hoc/registration-url', null, env);
          if (flags.json) { console.log(JSON.stringify(res)); return 0; }
          const url = unwrap(res)?.url;
          console.log('Open this link on your iPhone to register it (valid 24h):');
          console.log(`  ${url}`);
          console.log('');
          // Same forced-contrast QR printing as `preview` — black-on-white per
          // row so the code scans regardless of terminal theme.
          const CONTRAST = '\x1b[30;47m';
          const RESET = '\x1b[0m';
          for (const row of renderQr(url).split('\n')) {
            console.log(`${CONTRAST}${row}${RESET}`);
          }
          console.log('');
          console.log('Then run: appo preview <id>   (builds and opens your iOS preview)');
          return 0;
        }
        if (sub === 'list' || sub === undefined) {
          const res = await apiFetch(apiBase, 'GET', '/api/v1/devices/ad-hoc', null, env);
          if (flags.json) { console.log(JSON.stringify(res)); return 0; }
          const devices = unwrap(res) || [];
          if (devices.length === 0) {
            console.log('No registered devices. Run `appo devices register` to add your iPhone.');
            return 0;
          }
          for (const d of devices) {
            console.log(`  ${String(d.id).padEnd(5)} ${String(d.device_name ?? '(unnamed)').padEnd(24)} ${String(d.status).padEnd(10)} ${d.udid}`);
          }
          return 0;
        }
        console.error(`Unknown devices subcommand: ${sub}`);
        return 2;
      }

      case 'new': {
        // Creation verb — `new` puts the app on your phone, `ship <id>` puts it
        // on the stores. Single-step (no ledger): errors flow to the top-level
        // catch -> renderError like the other simple verbs.
        const usage = 'Usage: appo new --url <u> [--name <n>] [--prepare] [--json]';
        // Interactive sessions ask for the URL instead of failing on it.
        if ((typeof flags.url !== 'string' || !flags.url) && isInteractive(flags)) {
          const answer = await askLine('Site URL: ');
          if (answer) { flags.url = answer; }
        }
        // Empty-value guard: a bare `--url` parses as boolean true; both it and
        // a missing flag are usage errors — BEFORE any HTTP.
        if (typeof flags.url !== 'string' || !flags.url) { console.error(usage); return 2; }
        // `new` takes no --platform: the trial builds BOTH platforms (the choice
        // is gone). Any --platform passed to `new` is silently ignored.
        const base_url = ensureScheme(flags.url);
        let name = typeof flags.name === 'string' && flags.name ? flags.name : null;
        if (!name) {
          try {
            name = nameFromUrl(base_url);
          } catch {
            console.error(usage);   // unparseable URL — usage error, no HTTP
            return 2;
          }
        }

        // Auth-state branch — check BEFORE any apiFetch call (apiFetch throws
        // "Not authenticated" when no token; anonymous path bypasses it entirely).
        let token = storedToken(env);
        if (!token && isInteractive(flags)) {
          // The account is optional for the trial: offer the choice, default to
          // continuing anonymously so Enter stays the fast path.
          console.log('Not logged in. The trial works without an account (one per device).');
          if (isYes(await askLine('Log in first to keep this app in your account? [y/N] '))) {
            await login(apiBase, env);
            token = storedToken(env);
          }
        }
        if (!token) {
          // Anonymous path — public endpoint, no Authorization header, no apiFetch.
          // The trial builds BOTH platforms with no platform choice (mirrors the
          // dashboard /new): Android is stamped immediately; iOS is offered via a
          // device-registration QR and stamped on the callback. The app-scoped
          // status_url is polled for both until each is ready. --prepare is
          // silently ignored (anonymous apps are always self-prepared, D-07).
          const CONTRAST_ANON = '\x1b[30;47m';
          const RESET_ANON = '\x1b[0m';
          const printQr = (text) => {
            for (const row of renderQr(text).split('\n')) {
              console.log(`${CONTRAST_ANON}${row}${RESET_ANON}`);
            }
          };

          const res = await fetch(`${apiBase}/anonymous/create`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: base_url }),
          });
          const data = await res.json().catch(() => ({}));

          if (res.status === 409) {
            console.error(data.message || 'This device already has an anonymous trial.');
            console.error('Claim it or create an account to make more:');
            if (data.register_url) console.error(`  ${data.register_url}`);
            return 1;
          }
          if (!res.ok) {
            console.error(`Anonymous create failed (${res.status}).`);
            return 1;
          }

          // Persist the claim token so the user can claim later from any surface.
          writeProfile(env, { anonymous_app_id: data.id, anonymous_claim_token: data.claim_token });

          console.log(`Created anonymous app #${data.id} — ${data.name}`);
          console.log(`  url: ${data.base_url}`);
          console.log('');

          // iOS is offered unless the reserve pool guard is closed. When open,
          // print the device-registration QR up front (scanned on the iPhone,
          // zero Apple login). When closed, degrade honestly — Android still builds.
          const iosWanted = data.ios?.available === true;
          if (iosWanted) {
            console.log('Add the iOS build — scan this on your iPhone to register it (valid 24h):');
            printQr(data.ios.registration_url);
            console.log('');
          } else if (data.ios?.full) {
            console.log('iOS trial slots are full right now — your Android build is on the way.');
            console.log('');
          }

          // Poll the app-scoped status URL for both platforms. Android stamps in
          // seconds; iOS waits on the human registration step (generous timeout).
          // Each platform's install QR is printed once, as soon as it is ready.
          console.log('Building your Android app...');
          const POLL_INTERVAL_MS = 5000;
          const POLL_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes (iOS registration is human-gated)
          const pollStart = Date.now();
          let androidResolved = false;
          let androidReady = false;
          let iosResolved = !iosWanted; // nothing to wait for when iOS is unavailable

          while (Date.now() - pollStart < POLL_TIMEOUT_MS) {
            let s;
            try {
              const statusRes = await fetch(data.status_url, { headers: { Accept: 'application/json' } });
              s = await statusRes.json().catch(() => ({}));
            } catch {
              await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
              continue;
            }

            if (!androidResolved) {
              if (s.android?.status === 'ready') {
                console.log('');
                console.log('Your Android app is ready. Scan to install:');
                printQr(s.android.install_url);
                console.log('');
                androidResolved = true;
                androidReady = true;
              } else if (s.android?.status === 'failed') {
                console.error('Android build failed.');
                androidResolved = true;
              }
            }

            if (iosWanted && !iosResolved) {
              if (s.ios?.status === 'ready') {
                console.log('');
                console.log('Your iOS app is ready. Scan to install:');
                printQr(s.ios.install_url);
                console.log('');
                iosResolved = true;
              } else if (s.ios?.status === 'failed') {
                console.error('iOS build failed.');
                iosResolved = true;
              }
            }

            if (androidResolved && iosResolved) { break; }
            await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          }

          console.log(`Claim this app: ${apiBase}/register?claim_token=${data.claim_token}`);

          await maybeOfferMcp(flags);

          // iOS may still be awaiting registration at timeout — the app is created
          // and claimable, and the iOS build stamps once the iPhone registers.
          // Exit non-zero only when the Android build itself failed.
          return androidReady ? 0 : 1;
        }

        const prepMode = flags.prepare === true ? 'appo_managed' : undefined;
        // --json: verbatim creation envelope (D-08). Direct apiFetch — never
        // reaches the human renderer.
        if (flags.json) {
          const body = { name, base_url };
          if (prepMode) body.prep_mode = prepMode;
          const res = await apiFetch(apiBase, 'POST', '/api/v1/apps', body, env);
          console.log(JSON.stringify(res));
          return 0;
        }
        const attrs = { name, base_url };
        if (prepMode) attrs.prep_mode = prepMode;
        const app = (await ops.createApp(apiBase, attrs, env)) || {};
        console.log(`Created app #${app.id} — ${app.name}`);
        console.log(`  url: ${app.base_url}`);
        console.log(`  preview on your phone: appo preview ${app.id}`);
        console.log(`  ship to the stores:    appo ship ${app.id}`);
        await maybeOfferMcp(flags);
        return 0;
      }

      case 'ship': {
        // Store-publication verb — `ship <id>` signals publish-intent on an
        // existing app (this also covers republish / resubmit-after-rejection).
        // Creation lives in `appo new`. No first-vs-Nth distinction is surfaced
        // — the user expresses the outcome, the platform decides build/publish
        // mechanics.
        let appId = sub && !sub.startsWith('--') ? sub : null;
        if (!appId && flags.url === undefined && isInteractive(flags)) {
          const resolved = await resolveTargetApp(apiBase, env, flags, { usageHint: 'appo ship <id>', selectLabel: 'Select an app to ship:' });
          if (resolved.exit !== undefined) { return resolved.exit; }
          appId = String(resolved.id);
        }
        if (!appId || flags.url !== undefined) {
          // D-13 usage error — BEFORE any HTTP and BEFORE the ledger. Plain-text
          // stderr + exit 2 even under --json (the single-object ledger contract
          // applies only once a pipeline step has begun). The retired creation
          // arm (--url/--name) points at its new home: appo new.
          console.error('Usage: appo ship <id> [--stores <list>] [--yes] [--json]');
          console.error('New app? Create it first: appo new --url <u>');
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

        // STEP publish-intent — the only step. Builds are issued by Appo staff
        // server-side; the CLI never triggers or polls one. publishApp on a
        // never-built app is valid (StartPublication has no build dependency).
        // Honor the confirm-gate DECISION (reuses printPreview only).
        const preview = { will: 'publish', app_id: previewId(appId), target_stores: stores };
        if (!wantYes) {
          if (!json) printPreview(preview);
          record({ step: 'publish', status: 'gated', target_stores: stores });
          return finish('gated', EXIT.gated);   // NO publish POST issued — high-severity gate invariant
        }
        log(`> publish ...`);
        try {
          await ops.publishApp(apiBase, appId, stores, env);   // 204 == success; 409/422 throw
        } catch (err) {
          return handleBlock(err, 'publish', { app_id: appId });
        }
        record({ step: 'publish', status: 'ok', target_stores: stores });
        log(`ok submitted: ${stores.join(', ')} — Appo will build and submit it.`);
        log(`  track: appo status ${appId}   preview: appo preview ${appId}`);
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
