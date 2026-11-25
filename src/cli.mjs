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
import { downloadArtifact } from './download.mjs';
import { renderQr } from './qr.mjs';
import { createRequire } from 'node:module';
import * as readline from 'node:readline/promises';
import { runUpgrade } from './upgrade.mjs';
import { runMcpInstall, detectAgents } from './mcp.mjs';
import { EnvironmentError } from './environment-errors.mjs';

const USAGE = `appo — create and manage Appo apps from the terminal

Start here:
  appo new <url> [--name <n>]     Create your app from a website address and walk it to your phone
  appo start [url|id]             Resume the guided session: asks what is still needed, ends with the app on your phone
  appo install [url|id]           Show the link to open the app on a phone and stop
  appo ship <id> [--stores <list>] [--yes]   Ship it to the stores (republish / resubmit after a rejection too)
  appo status <id>                Where the app stands and what comes next

  Answer the questions up front, for scripts and agents:
    --fix self|appo               Who adapts the website
    --phone iphone|android        Which phone you install it on
    --iphone direct|testflight    How an iPhone installs it
    --appo-help yes|no            Whether Appo's team helps with the next step
    --owner-authorized --accept-tos   Confirm you own the site and accept the Terms

Other lifecycle verbs:
  appo push <id> --title <t> --body <b> [--target-url <u>] [--image-path <p>] [--scheduled-at <when>] --confirm   Send a push notification
  appo suggest <id>               What Appo found on the site and how the app's web view behaves
  appo rejection <id>             Show the active App Store rejection
  appo fix-recipe <id>            Show the fix recipe for a rejection

Apps:
  appo apps list                  List your apps
  appo apps show <id>             Show one app
  appo apps update <id> [--name <n>] [--url <u>] [--icon <https-url>] [--permission <name>=<on|off>] [--prepare on|off [--owner-authorized --accept-tos]]   Update name, URL, icon, permissions; hand preparation to Appo or take it back
  appo apps check <id>            Check the site of an app again
  appo apps remove <id> [--confirm]   Remove an app that was never published (dry run without --confirm)

Test builds & devices:
  appo download <id> [--build <n>] [--output <path>]   Download the installable artifact once ready
  appo devices list               List your registered iOS test devices
  appo devices register           Show the iOS device registration link + QR (one-time per device)

AI editor:
  appo mcp [--agent-instructions]  Connect your AI agent to Appo (Claude Code, Codex, Cursor): registers the Appo MCP connector; asks before adding a section to CLAUDE.md / AGENTS.md (without a terminal, only with --agent-instructions)

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

Options:
  --api <url>    Override the API base (env: APPO_API_BASE)
  --env <name>   Select the environment/profile (env: APPO_ENV)
  --token <pat>  Personal access token for \`login --token\` (never stored elsewhere)
  --json         Print the raw v1 response body (machine-readable)
  --confirm      Perform the write for a destructive verb (push, customize, apps remove, testflight)
  --yes          Confirm the publish step of \`ship\` (alias of --confirm)
  --stores <l>   Override target stores for \`ship\` (default: the app's stores)
  --build <n>    Target a specific build id (\`status\`/\`download\`; default: latest)
  --output <p>   Write the downloaded artifact to this path (default: derived filename)
  -h, --help     Show this help
  -v, --version  Print the CLI + Node version

Exit codes:
  0  success
  1  runtime / API error (incl. auth failure — run \`appo login\`)
  2  usage error (missing or invalid arguments, or a question still waiting for an answer)
  3  confirm required (destructive verb invoked without --confirm; dry run shown, nothing written)

  ship maps these to its final lifecycle state: 0 shipped / 1 blocked /
  2 usage / 3 gated (publish dry run shown, nothing written — re-run with --yes).

Environment variables:
  APPO_TOKEN     Ephemeral token, highest precedence, never written to disk
  APPO_ENV       Active environment/profile (overridden by --env)
  APPO_API_BASE  API base URL (overridden by --api)

  Create a PAT in the dashboard, then \`appo login --token <pat>\` or set APPO_TOKEN
  in your environment (e.g. CI/agents) to authenticate without the browser flow.
`;

const SHORT_USAGE = `appo — turn your website into an app

  appo new <url>        Create an app from a website address
  appo start <url>      Walk an app from your address to your phone
  appo status <id>      Where an app stands
  appo ship <id>        Ship it to the stores
  appo login            Authenticate in the browser

  appo --help for every command`;

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
  // Flags documented without a value never consume the next token. The consent
  // flags still accept an explicit yes/no/true/false/1/0 (parseConsentFlag).
  const boolean = new Set(['json', 'yes', 'confirm', 'help', 'version', 'owner-authorized', 'accept-tos']);
  const consent = new Set(['owner-authorized', 'accept-tos']);
  const consentValue = /^(yes|no|true|false|1|0)$/i;
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
      if (next === undefined || next.startsWith('--')
        || (boolean.has(key) && !(consent.has(key) && consentValue.test(next)))) {
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

/** Colour only on a terminal, and never under NO_COLOR. */
function useColor() {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

/** Render the server's `install` block (the single readiness predicate). Nothing
 *  is derived here; every server string goes through cleanText. The agent-facing
 *  `tool`/`arguments` of each option are not printed. */
function printInstall(installBlock, { withQr = false } = {}) {
  if (!installBlock || typeof installBlock !== 'object') return;
  const pad = '  ';
  console.log(`  ${cleanText(installBlock.message)}`);
  if (installBlock.state === 'ready') {
    if (installBlock.install_url) console.log(`  Install link: ${cleanText(installBlock.install_url)}`);
    if (installBlock.how_to_open) console.log(`${pad}${cleanText(installBlock.how_to_open)}`);
    if (withQr && installBlock.install_url && process.stdout.isTTY) {
      const CONTRAST = useColor() ? '\x1b[30;47m' : ''; // black fg on white bg
      const RESET = useColor() ? '\x1b[0m' : '';
      console.log('');
      for (const row of renderQr(installBlock.install_url).split('\n')) {
        console.log(`${CONTRAST}${row}${RESET}`);
      }
    }
    return;
  }
  if (Array.isArray(installBlock.options)) {
    for (const option of installBlock.options) {
      if (typeof option?.description === 'string' && option.description) {
        console.log(`  ${pad} - ${cleanText(option.description)}`);
      }
    }
  }
  const minutes = Number(installBlock.recheck_after_minutes);
  if (Number.isFinite(minutes) && minutes > 0) {
    const when = minutes >= 120 ? `${Math.round(minutes / 60)} hours` : `${minutes} minutes`;
    console.log(`  ${pad} check again in about ${when}`);
  }
}

const PUBLICATION_SENTENCES = {
  not_ready: 'Not published yet.',
  ready: 'Ready to ship to the stores.',
  in_review: 'In review at Apple and Google.',
  rejected: 'A store rejected the app.',
  live: 'Live in the stores.',
  removing: 'Being removed from the stores.',
};

const NEXT_STEP_SENTENCES = {
  start: 'Next: start it on your phone with appo start',
  publish: 'Next: ship it to the stores with appo ship',
  resubmit: 'Next: resubmit it after the fixes with appo ship',
  setup: 'Next: finish the setup with appo start',
  fix_site: 'Next: fix the findings on the website, then run appo apps check',
};

function printApp(app) {
  if (!app) return;
  const say = (text) => console.log(`  ${text}`);
  const address = app.base_url ? ` (${cleanText(app.base_url)})` : '';
  say(`${cleanText(app.name ?? `App ${app.id}`)}${address}, id ${app.id}.`);
  const state = PUBLICATION_SENTENCES[app.publication_state];
  if (state) say(state);
  const next = NEXT_STEP_SENTENCES[app.primary_action];
  if (next) say(`${next}.`);
  if (app.decision?.question) say(`Next question: ${cleanText(app.decision.question)}`);
  if (app.demo_account?.provided) {
    say(`Demo account for the store review: provided (${cleanText(app.demo_account.url)}).`);
  } else if (app.demo_account?.needed) {
    say(`Demo account for the store review: needed, not provided yet (${cleanText(app.demo_account.url)}).`);
  }
  if (app.preparation) {
    const who = app.preparation.mode === 'appo_managed' ? 'Appo adapts the website' : 'You adapt the website';
    say(`${who} (${cleanText(app.preparation.status)}).`);
  }
  printInstall(app.install, { withQr: false });
  if (app.stores) say(`Stores: Apple ${cleanText(app.stores.apple)}, Google ${cleanText(app.stores.google)}.`);
}

/** Curated render of a build — the 9-key `CuratedBuild::for()` projection
 *  (D-04/D-11). `id`, `kind`, `artifact_url`, `error_message` no longer exist
 *  on `AppBuildResource` (Phase 252) and are never printed — the pre-252
 *  field list left them `undefined`, silently dropped by the line(k,v) guard.
 *  Reuses the aligned line(k,v) idiom. */
function printBuild(b) {
  if (!b) return;
  const line = (k, v) => v !== undefined && v !== null && console.log(`  ${k.padEnd(18)} ${v}`);
  line('platform', b.platform);
  line('status', b.status);
  line('failed', b.failed);
  line('message_code', b.message_code);
  line('message', b.message);
  line('testflight_url', b.testflight_url);
  line('created_at', b.created_at);
  line('started_at', b.started_at);
  line('finished_at', b.finished_at);
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

/** Strip ASCII control characters (except newline) from server-provided text. */
function cleanText(value) {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '');
}

/** Print the findings of a site_not_ready refusal; every sentence comes from the server. */
function printSiteRefusal(env) {
  const d = env.details ?? {};
  console.error(`\n  ${cleanText(env.message)}`);
  for (const f of d.findings ?? []) {
    console.error(`  - ${cleanText(f.finding)}`);
    if (f.fix) { console.error(`    ${cleanText(f.fix)}`); }
  }
  if (d.platform_note) { console.error(`  ${cleanText(d.platform_note)}`); }
  if (d.kept_address) { console.error(`  The app keeps ${cleanText(d.kept_address)}.`); }
  if (d.next) { console.error(`  Next: ${cleanText(d.next)}`); }
  console.error('');
}

const SITE_STATUS_LINES = {
  clear: 'Site checked: no findings.',
  notes: 'Site checked: notes only.',
  blocked: 'Site checked: findings to fix.',
  pending: 'The site is still being read; the result is recorded when the reading ends.',
  unverified: 'The site could not be read.',
};

/** Print the result of `appo apps check`: the comparison sentence or a status
 *  line, the findings and notes, and whether the site keeps the app closed. */
function printSiteCheck(site) {
  const status = site.status === 'unverified' && site.unverified?.text
    ? site.unverified.text
    : SITE_STATUS_LINES[site.status];
  console.log(cleanText(site.recheck?.sentence || status || `Site checked: ${site.status}.`));
  for (const f of site.findings ?? []) {
    console.log(`  - ${cleanText(f.finding)}`);
    if (f.fix) { console.log(`    ${cleanText(f.fix)}`); }
  }
  if ((site.notes ?? []).length > 0) {
    console.log('  Notes:');
    for (const n of site.notes) { console.log(`  - ${cleanText(n.finding)}`); }
  }
  if (site.platform_note) { console.log(`  ${cleanText(site.platform_note)}`); }
  if (!site.closed) {
    console.log('The site does not close the install link or Publish.');
    return;
  }
  const closing = site.closed_by?.findings ?? [];
  if (closing.length > 0) {
    console.log('The app was closed because of:');
    for (const f of closing) {
      console.log(`  - ${cleanText(f.finding)}`);
      if (f.fix) { console.log(`    ${cleanText(f.fix)}`); }
    }
  }
  console.log('The install link and Publish stay closed until the site is fixed.');
}

/** Render a thrown error to stderr and return the process exit code (1).
 *  prerequisite_failed envelopes (D-06) render as an actionable blocked state
 *  with next_action + dashboard_url; everything else falls back to err.message
 *  (which already carries the 401 "run `appo login`" hint from apiFetch). */
function renderError(err) {
  if (err instanceof EnvironmentError) {
    console.error(`\n  ${err.message}\n`);
    return 1;
  }
  const env = err.envelope;
  if (env?.error === 'site_not_ready') {
    printSiteRefusal(env);
    return 1;
  }
  if (env?.error === 'rate_limited' && env.code === 'site_check_limited') {
    console.error(`\n  ${cleanText(env.message)}`);
    if (env.details?.retry_after != null) {
      console.error(`  Retry in ${Number(env.details.retry_after)} seconds.\n`);
    }
    return 1;
  }
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

/** Human rendering of the adaptation brief: site findings with their fix first,
 *  then the four web view contract entries and the preparation line. */
const CONTRACT_IDS = ['insets', 'injection_timing', 'cascade', 'ascii'];

function printAdaptationBrief(id, brief) {
  const site = brief?.site ?? null;
  if (site) {
    const date = String(site.reading_fetched_at ?? '').slice(0, 10);
    console.log(`Site findings (stored reading of ${cleanText(date)}):`);
    const findings = Array.isArray(site.findings) ? site.findings : [];
    if (findings.length === 0) {
      console.log('  No finding bears on adapting the site.');
    }
    for (const f of findings) {
      console.log(`- ${cleanText(f.label)}: ${cleanText(f.finding)}`);
      console.log(`  Fix: ${cleanText(f.fix)}`);
    }
    if (brief.site_note) { console.log(cleanText(brief.site_note)); }
  } else if (brief?.site_note) {
    console.log(cleanText(brief.site_note));
  }
  console.log('');
  console.log('Web view contract:');
  const wrapper = Array.isArray(brief?.wrapper) ? brief.wrapper : [];
  for (const key of CONTRACT_IDS) {
    const entry = wrapper.find((w) => w.id === key);
    if (entry) { console.log(`  ${key}: ${cleanText(entry.statement)}`); }
  }
  const prep = brief?.preparation;
  if (prep) { console.log(`Preparation: ${cleanText(prep.mode)} (${cleanText(prep.status)})`); }
  console.log(`Full contract and policy: appo suggest ${cleanText(String(id))} --json`);
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

/** Yes-default confirmation: an empty answer (or EOF) means yes. */
async function askYesDefault(question) {
  const answer = await askLine(question);
  return answer === '' || isYes(answer);
}

const confirmInstructions = (agent, path) => askYesDefault(`Add a short Appo section to ${path}? [Y/n] `);

const TERMS_URL = 'https://goappo.io/en/terms';

/** Parses a consent flag: true only for the bare flag or true/yes/1; any other value declines. */
function parseConsentFlag(value) {
  if (value === true) { return true; }
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return v === 'true' || v === 'yes' || v === '1';
}

/** One flag per guided-flow question. The values are the enumerations the server
 *  validates again; the CLI only rejects what could never be sent. */
const ANSWER_FLAGS = [
  { flag: 'fix', key: 'fix', values: ['self', 'appo'] },
  { flag: 'phone', key: 'phone', values: ['iphone', 'android'] },
  { flag: 'iphone', key: 'iphone_install', values: ['direct', 'testflight'] },
  { flag: 'appo-help', key: 'appo_help', values: ['yes', 'no'] },
];

/** Reads the answer flags into start-body keys. Returns { answers } or { exit: 2 }
 *  after naming the accepted values; never makes an HTTP request. */
function parseAnswerFlags(flags) {
  const answers = {};
  for (const { flag, key, values } of ANSWER_FLAGS) {
    if (flags[flag] === undefined) { continue; }
    const value = typeof flags[flag] === 'string' ? flags[flag].trim().toLowerCase() : '';
    if (!values.includes(value)) {
      console.error(`Invalid --${flag} ${JSON.stringify(flags[flag])}. Value must be ${values.join(' or ')}.`);
      return { exit: 2 };
    }
    answers[key] = value;
  }
  return { answers };
}

function inputEnvelope(code, message, details) {
  return { error: 'input_required', code, message, details: { ...details, terms_of_service_url: TERMS_URL } };
}

function printEnvelope(flags, envelope) {
  if (flags.json) {
    console.log(JSON.stringify(envelope));
    return;
  }
  console.error(cleanText(envelope.message));
  const d = envelope.details;
  if (d.answers) {
    for (const a of d.answers) { console.error(`  ${cleanText(a.answer)}: ${a.flags.join(' ')}`); }
  }
  if (d.flags) { console.error(`  ${d.flags.join(' ')}`); }
  if (d.terms_of_service_url) { console.error(`Terms of Service: ${d.terms_of_service_url}`); }
}

/** Server text that may arrive as a string or as a list of strings, as lines. */
function textLines(value) {
  const list = Array.isArray(value) ? value : [value];
  return list.filter((v) => typeof v === 'string' && v).map(cleanText);
}

/** The input_required envelope of one pending decision. The flags of every
 *  answer are copied from the server's hint (cli.flags), never built here. */
function decisionEnvelope(decision) {
  const answers = (decision.options ?? []).map((option) => {
    const answer = { answer: cleanText(option.label), key: option.key, wait: option.wait, flags: option.cli?.flags ?? [] };
    for (const field of ['steps', 'pros', 'cons']) {
      if (option[field] !== undefined && option[field] !== null) { answer[field] = option[field]; }
    }
    return answer;
  });
  return {
    error: 'input_required',
    code: 'decision_required',
    message: decision.question,
    details: {
      decision: decision.key,
      question: decision.question,
      assistant_may_answer: decision.assistant_may_answer,
      answers,
    },
  };
}

/** Settles the two consents asked at every creation, shared by every surface.
 *  Returns { attrs } to merge into the request, or { exit, envelope? } when
 *  nothing may be created. Never makes an HTTP request. A terminal gets two
 *  questions; --json or no terminal gets the structured envelope (exit 2). */
async function settleConsent(flags) {
  let owner = parseConsentFlag(flags['owner-authorized']);
  let tos = parseConsentFlag(flags['accept-tos']);
  if (owner && tos) { return { attrs: { owner_authorized: true, accepted_tos: true } }; }
  if (!isInteractive(flags)) {
    const envelope = inputEnvelope(
      'attestation_required',
      'Ask the user to confirm, as separate questions, that they own the website or may publish it and that they accept the Terms of Service, then re-run with both flags.',
      {
        questions: [
          'Do you own this website, or are you authorized to publish it?',
          'Do you accept Appo\'s Terms of Service?',
        ],
        flags: ['--owner-authorized', '--accept-tos'],
      },
    );
    printEnvelope(flags, envelope);
    return { exit: 2, envelope };
  }
  if (!owner) { owner = isYes(await askLine('Do you own this website, or are you authorized to publish it? [y/n] ')); }
  if (owner && !tos) { tos = isYes(await askLine(`Do you accept Appo's Terms of Service (${TERMS_URL})? [y/n] `)); }
  if (!owner || !tos) {
    console.error('Nothing was created: an app is created only with the owner\'s confirmation and the Terms accepted.');
    return { exit: 1 };
  }
  return { attrs: { owner_authorized: true, accepted_tos: true } };
}

/** After the user says they fix the site themselves, offer to let an agent CLI found
 *  on PATH make the fixes: registers the Appo connector for it. Asked only on a
 *  terminal, once, naming the agent; nothing runs without an explicit yes. */
async function offerAgentFixes(flags, apiBase) {
  if (!isInteractive(flags)) { return; }
  const agent = detectAgents()[0];
  if (!agent) { return; }
  if (isYes(await askLine(`Do you want ${agent.name} to make the fixes? [y/N] `))) {
    await runMcpInstall({ apiBase, interactive: true, confirmInstructions });
  }
}

/** Resolve which app a verb targets when no positional id is given.
 *  One app -> use it. None -> actionable create hint (exit 1). Several -> a
 *  numbered picker on a TTY; otherwise the list plus a usage hint (exit 2),
 *  since scripts and --json runs cannot answer a prompt. Returns { id } on
 *  success or { exit } when the caller should stop with that code. */
async function resolveTargetApp(apiBase, env, flags, {
  usageHint = 'appo start <id>',
  selectLabel = 'Select an app to run:',
  quietEmpty = false,
} = {}) {
  const apps = await ops.listApps(apiBase, env);
  if (apps.length === 0) {
    if (quietEmpty) { return { exit: 1, empty: true }; }
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

/** Host of an address, lower-cased and without a leading www.; null when unparseable. */
function hostOf(address) {
  try {
    return new URL(ensureScheme(String(address))).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** The caller's app whose address has the same host as `url`, or null. */
async function findAppByAddress(apiBase, env, url) {
  const host = hostOf(url);
  if (!host) { return null; }
  const apps = await ops.listApps(apiBase, env);
  return apps.find((a) => hostOf(a.base_url) === host) ?? null;
}

/** A 422 that names the consent fields: an app created before consent was recorded
 *  being switched to Appo's help. */
function isConsentError(err) {
  if (err?.status !== 422) { return false; }
  /** @type {Record<string, unknown>} */
  const fields = err.envelope?.details ?? err.envelope?.errors ?? {};
  return typeof fields === 'object' && ('owner_authorized' in fields || 'accepted_tos' in fields);
}

const RECHECK_HINT = (minutes) => {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) { return null; }
  return `Check again in about ${m >= 120 ? `${Math.round(m / 60)} hours` : `${m} minutes`}.`;
};

const FLAG_OF_KEY = Object.fromEntries(ANSWER_FLAGS.map(({ flag, key }) => [key, `--${flag}`]));

/** Asks one decision on a terminal, one numbered option per line. Returns the chosen
 *  option, or null when the answer is not one of the numbers. */
async function askDecision(decision) {
  const options = Array.isArray(decision.options) ? decision.options : [];
  console.log(`\n${cleanText(decision.question)}`);
  options.forEach((option, i) => {
    const wait = option.wait ? ` (${cleanText(option.wait)})` : '';
    console.log(`  ${i + 1}) ${cleanText(option.label)}${wait}`);
    for (const [title, field] of [['Good', 'pros'], ['Bad', 'cons'], ['Steps', 'steps']]) {
      for (const line of textLines(option[field])) { console.log(`       ${title}: ${line}`); }
    }
  });
  const n = Number(await askLine(`Choice [1-${options.length}]: `));
  return Number.isInteger(n) && n >= 1 && n <= options.length ? options[n - 1] : null;
}

const GATING_KEYS = ['fix', 'phone', 'iphone_install'];
const MAX_ROUNDS = 8;

/** The guided session: posts the answers collected so far to start and follows the
 *  server's `decision` and `install`, nothing else. Returns the exit code. */
async function runStart(apiBase, env, flags, id, { installOnly = false, url = null } = {}) {
  const parsed = parseAnswerFlags(flags);
  if (parsed.exit) { return parsed.exit; }
  /** @type {Record<string, any>} */
  const answers = { ...parsed.answers };
  if (parseConsentFlag(flags['owner-authorized']) && parseConsentFlag(flags['accept-tos'])) {
    answers.owner_authorized = true;
    answers.accepted_tos = true;
  }
  const interactive = isInteractive(flags);
  const given = {};
  for (const [key, value] of Object.entries(parsed.answers)) { given[key] = [FLAG_OF_KEY[key], value]; }
  let asked = false;
  let consentSettled = false;
  let waited = false;
  let helpAnswered = false;

  const finish = (code) => {
    if (interactive && asked && Object.keys(given).length > 0) {
      const target = url ?? id;
      console.log(`\nNext time: appo start ${target} ${Object.values(given).flat().join(' ')}`);
    }
    return code;
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    /** @type {any} */
    let data;
    try {
      data = await ops.startApp(apiBase, id, { ...answers, install_only: installOnly || undefined }, env);
    } catch (err) {
      if (!isConsentError(err) || consentSettled) { throw err; }
      consentSettled = true;
      const consent = await settleConsent(flags);
      if (consent.exit) { return consent.exit; }
      Object.assign(answers, consent.attrs);
      continue;
    }
    data = data ?? {};
    const decision = data.decision ?? null;
    const installBlock = data.install ?? null;

    const pending = decision && (GATING_KEYS.includes(decision.key)
      || (decision.key === 'appo_help' && !installOnly && (!installBlock || waited)));
    if (pending) {
      if (!interactive) {
        printEnvelope(flags, decisionEnvelope(decision));
        return 2;
      }
      const option = await askDecision(decision);
      if (!option) {
        console.error('Invalid choice.');
        return 2;
      }
      asked = true;
      answers[decision.key] = option.value;
      given[decision.key] = option.cli?.flags ?? [FLAG_OF_KEY[decision.key], option.value];
      if (decision.key === 'appo_help') { helpAnswered = true; }
      if (decision.key === 'fix' && option.value === 'self') { await offerAgentFixes(flags, apiBase); }
      continue;
    }

    if (flags.json) {
      console.log(JSON.stringify({ data }));
      return 0;
    }
    if (!installBlock) {
      console.log('Nothing more to answer right now.');
      return finish(0);
    }
    if (installBlock.state !== 'ready') {
      console.log(cleanText(installBlock.message));
      const hint = RECHECK_HINT(installBlock.recheck_after_minutes);
      if (hint) { console.log(hint); }
      return finish(0);
    }
    if (!waited) {
      printInstall(installBlock, { withQr: interactive });
      if (installOnly || !interactive) { return finish(0); }
      await askLine('\nPress Enter once the app is open on your phone (Ctrl-C to stop) ');
      waited = true;
      continue;
    }
    if (!helpAnswered) {
      console.log('Once the app has been opened on a phone, appo start shows the next step.');
    }
    return finish(0);
  }
  console.error('The session needed more answers than expected. Run appo start again.');
  return 1;
}

/** Creation requires an account (the anonymous trial was removed, 247). A terminal
 *  asks whether one exists and opens the sign-up page or the login page in the
 *  browser; otherwise a plain message before any request. */
async function ensureLoggedIn(flags, apiBase, env) {
  let token = storedToken(env);
  if (!token && isInteractive(flags)) {
    console.log('Creating an app needs an Appo account.');
    const hasAccount = isYes(await askLine('Do you already have one? [y/N] '));
    await login(apiBase, env, hasAccount ? {} : { signup: true });
    token = storedToken(env);
  }
  if (!token) { console.error('Not authenticated. Run: appo login'); return false; }
  return true;
}

/** Consent, creation, then the session; shared by new and start on an unknown address. */
async function createAndStart(apiBase, env, flags, rawUrl, usage, { installOnly = false } = {}) {
  const base_url = ensureScheme(rawUrl);
  let name = typeof flags.name === 'string' && flags.name ? flags.name : null;
  if (!name) {
    try {
      name = nameFromUrl(base_url);
    } catch {
      console.error(usage);
      return 2;
    }
  }
  const parsed = parseAnswerFlags(flags);
  if (parsed.exit) { return parsed.exit; }
  const settled = await settleConsent(flags);
  if (settled.exit) { return settled.exit; }
  let app;
  try {
    app = (await ops.createApp(apiBase, { name, base_url, ...settled.attrs }, env)) || {};
  } catch (err) {
    if (flags.json && err.envelope?.error === 'site_not_ready') {
      console.log(JSON.stringify(err.envelope));
      return 1;
    }
    throw err;
  }
  if (!flags.json) { console.log(`Created ${cleanText(app.name ?? name)}.`); }
  const code = await runStart(apiBase, env, flags, app.id, { installOnly, url: base_url });
  return code;
}

/** The new, start and install verbs. `new` always creates; `start` and `install`
 *  resume the app at the given address or id, creating it when none exists. */
async function runGuidedVerb(command, apiBase, env, flags, target) {
  const installOnly = command === 'install';
  const usage = command === 'new'
    ? 'Usage: appo new <url> [--name <n>] [--fix self|appo] [--phone iphone|android] [--iphone direct|testflight] [--appo-help yes|no] [--owner-authorized --accept-tos] [--json]'
    : `Usage: appo ${command} [url|id] [--fix self|appo] [--phone iphone|android] [--iphone direct|testflight] [--appo-help yes|no] [--json]`;
  const parsed = parseAnswerFlags(flags);
  if (parsed.exit) { return parsed.exit; }

  let address = typeof target === 'string' && target ? target : (typeof flags.url === 'string' ? flags.url : null);
  if (command === 'new') {
    if (!address && isInteractive(flags)) { address = (await askLine('Site URL: ')) || null; }
    if (!address) { console.error(usage); return 2; }
    if (!(await ensureLoggedIn(flags, apiBase, env))) { return 1; }
    return createAndStart(apiBase, env, flags, address, usage);
  }

  if (address && /^\d+$/.test(address)) {
    return runStart(apiBase, env, flags, address, { installOnly });
  }
  if (!address) {
    const resolved = await resolveTargetApp(apiBase, env, flags, {
      usageHint: `appo ${command} <id>`,
      selectLabel: `Select an app to ${command}:`,
      quietEmpty: true,
    });
    if (resolved.empty) {
      if (!isInteractive(flags)) { console.error('No apps yet. Run: appo start <url>'); return 1; }
      address = (await askLine('Site URL: ')) || null;
      if (!address) { console.error(usage); return 2; }
    } else if (resolved.exit !== undefined) {
      return resolved.exit;
    } else {
      return runStart(apiBase, env, flags, resolved.id, { installOnly });
    }
  }
  if (!(await ensureLoggedIn(flags, apiBase, env))) { return 1; }
  const existing = await findAppByAddress(apiBase, env, address);
  if (existing) {
    return runStart(apiBase, env, flags, existing.id, { installOnly, url: address });
  }
  return createAndStart(apiBase, env, flags, address, usage, { installOnly });
}

/** `appo` alone: resume the only app through the start loop; otherwise a short help. */
async function runWithoutArguments(apiBase, env, flags) {
  if (!storedToken(env)) { console.log(SHORT_USAGE); return 0; }
  const apps = await ops.listApps(apiBase, env);
  if (apps.length === 1) { return runStart(apiBase, env, flags, apps[0].id); }
  console.log(SHORT_USAGE);
  if (apps.length > 1) {
    console.log('');
    for (const a of apps) { console.log(`  ${String(a.id).padEnd(5)} ${cleanText(a.name)}  ${cleanText(a.base_url)}`); }
  }
  return 0;
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

  if (flags.help || positional[0] === 'help') {
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
    if (positional.length === 0) { return await runWithoutArguments(apiBase, env, flags); }
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
        // Registers the remote Appo MCP connector (the resolved API host +
        // /mcp) with the agent CLIs on PATH. `new` also offers this after
        // creating an app; this verb is the direct route.
        return await runMcpInstall({
          apiBase,
          interactive: Boolean(isInteractive(flags)),
          agentInstructions: parseConsentFlag(flags['agent-instructions']),
          confirmInstructions,
        });
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
            console.error('Usage: appo apps create --name <n> --url <u> [--owner-authorized --accept-tos]');
            return 2;
          }
          const settled = await settleConsent(flags);
          if (settled.exit) { return settled.exit; }
          const app = await ops.createApp(apiBase, { name: flags.name, base_url: flags.url, ...settled.attrs }, env);
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
          const usage = 'Usage: appo apps update <id> [--name <n>] [--url <u>] [--icon <https-url>] [--permission <name>=<on|off>] [--prepare <on|off>]';
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

          // --prepare on|off. Unlike `appo new --prepare` (a one-way opt-in), update is a
          // switch, so the value is required and parsed like --permission <name>=<on|off>.
          // A bare `--prepare` parses to boolean true, fails the typeof test and exits 2.
          let wantPrepare;
          if (flags.prepare !== undefined) {
            const value = typeof flags.prepare === 'string' ? flags.prepare.trim().toLowerCase() : '';
            if (value !== 'on' && value !== 'off') {
              console.error(`Invalid --prepare ${JSON.stringify(flags.prepare)}. Value must be on or off.`);
              return 2;
            }
            wantPrepare = value;
            body.prep_mode = value === 'on' ? 'appo_managed' : 'self_managed';
            if (value === 'on') {
              if (flags['owner-authorized'] === true) { body.owner_authorized = true; }
              if (flags['accept-tos'] === true) { body.accepted_tos = true; }
            }
          }

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

          // The PATCH answered 204 (no body), so re-read to echo the resulting preparation.
          let preparation;
          if (wantPrepare) {
            const app = unwrap(await apiFetch(apiBase, 'GET', `/api/v1/apps/${id}`, null, env));
            preparation = app?.preparation;
          }

          if (flags.json) {
            // Pitfall 5: keep `null` for a name/URL-only update (204, no body); emit only the
            // sub-results that actually ran — { icon_url } and/or { permissions }.
            const out = {};
            if (wantIcon) { out.icon_url = iconUrl; }
            if (wantPermissions) { out.permissions = permissionsResult; }
            if (wantPrepare) { out.preparation = preparation; }
            console.log(Object.keys(out).length > 0 ? JSON.stringify(out) : 'null');
            return 0;
          }
          console.log(`Updated app ${id}.`);
          if (wantIcon) console.log(`  icon set: ${iconUrl}`);
          if (wantPermissions) {
            const summary = Object.entries(permissions).map(([k, v]) => `${k}=${v ? 'on' : 'off'}`).join(', ');
            console.log(`  permissions set: ${summary}`);
          }
          if (wantPrepare && preparation) {
            console.log(`  preparation: ${preparation.mode} (${preparation.status})`);
          }
          return 0;
        }
        if (sub === 'check') {
          let id = rest[0];
          if (!id && isInteractive(flags)) {
            const resolved = await resolveTargetApp(apiBase, env, flags, { usageHint: 'appo apps check <id>', selectLabel: 'Select an app to check:' });
            if (resolved.exit !== undefined) { return resolved.exit; }
            id = String(resolved.id);
          }
          if (!id) {
            console.error('Usage: appo apps check <id>');
            return 2;
          }
          const res = await ops.checkSite(apiBase, id, env);
          const site = res?.site ?? null;
          if (!site) {
            if (res?.message) { console.log(cleanText(res.message)); }
            return 0;
          }
          printSiteCheck(site);
          return 0;
        }
        if (sub === 'remove') {
          let id = rest[0];
          if (!id && isInteractive(flags)) {
            const resolved = await resolveTargetApp(apiBase, env, flags, { usageHint: 'appo apps remove <id> [--confirm]', selectLabel: 'Select an app to remove:' });
            if (resolved.exit !== undefined) { return resolved.exit; }
            id = String(resolved.id);
          }
          if (!id) {
            console.error('Usage: appo apps remove <id> [--confirm]');
            return 2;
          }
          // The server holds the gate: no ?confirm=1 means a dry run (D-16).
          const res = await ops.removeApp(apiBase, id, { confirm: Boolean(flags.confirm) }, env);
          if (flags.json) {
            console.log(JSON.stringify(res));
            return res?.confirm_required ? 3 : 0;
          }
          if (res?.confirm_required) {
            if (res.note) { console.log(cleanText(res.note)); }
            console.log('Add --confirm to remove it.');
            return 3;
          }
          if (res?.message) { console.log(cleanText(res.message)); }
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
        if (flags.build) { printBuild(d); return 0; }
        printApp(d);
        if (d?.install?.state === 'ready') {
          const payload = await ops.getInstall(apiBase, sub, env);
          const url = payload?.install?.install_url;
          if (url) console.log(`  Install link: ${cleanText(url)}`);
        }
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
        await ops.publishApp(apiBase, sub, stores, env);        // 200 {data: {demo_account}}
        if (flags.json) { console.log('null'); return 0; }      // Pitfall 5 / D-08: body not passed through; prints null as before the 200 answer
        console.log(`Publication started for: ${stores.join(', ')}`);
        return 0;
      }

      case 'suggest': {
        if (!sub && isInteractive(flags)) {
          const resolved = await resolveTargetApp(apiBase, env, flags, { usageHint: 'appo suggest <id>', selectLabel: 'Select an app:' });
          if (resolved.exit !== undefined) { return resolved.exit; }
          sub = String(resolved.id);
        }
        if (!sub) { console.error('Usage: appo suggest <id>'); return 2; }
        const res = await ops.getAdaptationBrief(apiBase, sub, env);
        if (flags.json) { console.log(JSON.stringify(res)); return 0; }
        printAdaptationBrief(sub, res);
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
        //
        // D-12 (253-05, KNOWN DEFERRED REGRESSION): the auto-select below
        // (`b.status === 'ready' && b.artifact_url`) and `--build <n>`'s
        // explicit targeting were broken by Phase 252's curated build shape —
        // `status` is now a customer-lifecycle value (never the literal
        // `'ready'`), `artifact_url` no longer exists, and no build carries any
        // exposed identifier to target by. Fixing this needs a
        // platform-addressed-download product decision; out of scope for
        // Phase 253 (see 253-05-SUMMARY.md).
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
              console.log(`No builds yet. Prepare one: appo install ${sub}`);
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
          // Same forced-contrast QR printing as `run` — black-on-white per
          // row so the code scans regardless of terminal theme.
          const CONTRAST = '\x1b[30;47m';
          const RESET = '\x1b[0m';
          for (const row of renderQr(url).split('\n')) {
            console.log(`${CONTRAST}${row}${RESET}`);
          }
          console.log('');
          console.log('Then run: appo install <id>   (shows the install link for your phone)');
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

      case 'new':
      case 'start':
      case 'install':
        return await runGuidedVerb(command, apiBase, env, flags, sub);

      // Kept for scripts: `run` is the old name of `start`.
      case 'run':
        return await runGuidedVerb('start', apiBase, env, flags, sub);

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
          await ops.publishApp(apiBase, appId, stores, env);   // 200 {data: {demo_account}} == success; 409/422 throw
        } catch (err) {
          return handleBlock(err, 'publish', { app_id: appId });
        }
        record({ step: 'publish', status: 'ok', target_stores: stores });
        log(`ok submitted: ${stores.join(', ')} — Appo will build and submit it.`);
        log(`  track: appo status ${appId}   phone: appo install ${appId}`);
        return finish('shipped', EXIT.shipped);
      }

      default:
        console.error(`Unknown command: ${command}\n`);
        console.log(USAGE);
        return 2;
    }
  } catch (err) {
    if (flags.json && err instanceof EnvironmentError) {
      console.log(JSON.stringify(err.envelope));
      return 1;
    }
    return renderError(err);
  }
}
