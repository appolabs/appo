import { resolveApiBase, clearConfig, readConfig } from './config.mjs';
import { login } from './login.mjs';
import { apiFetch } from './api.mjs';

const USAGE = `appo — create and manage Appo apps from the terminal

Usage:
  appo login [--api <url>]        Authenticate via the browser (device flow)
  appo logout                     Forget the stored token
  appo whoami                     Show the active account + API
  appo apps create --name <n> --url <u> [--meta-name <m>] [--meta-desc <d>]
  appo apps list                  List your apps
  appo apps show <id>             Show one app
  appo apps set-name <id> <name>  Update an app's name

Lifecycle:
  appo status <id> [--build <buildId>]   App overview (or one build's status)
  appo build <id> [--platform ios|android|all] [--branch <ref>]   Trigger a build (returns immediately)
  appo configure <id> [--name <n>] [--url <u>] [--meta-name <m>] [--meta-desc <d>] [--injected-css <css>] [--injected-js <js>]   Update app fields
  appo rejection <id>                     Show the active App Store rejection
  appo fix-recipe <id>                    Show the fix recipe for a rejection
  (more added in this phase: publish, push, resubmit)

Options:
  --api <url>    Override the API base (env: APPO_API_BASE)
  -h, --help     Show this help
`;

/** Minimal flag parser: collects --key value / --flag and positionals. */
function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
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

function unwrap(payload) {
  return payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
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

export { confirmGate, renderError };

export async function run(argv) {
  const { flags, positional } = parseArgs(argv);

  if (flags.help || positional[0] === 'help' || positional.length === 0) {
    console.log(USAGE);
    return 0;
  }

  const apiBase = resolveApiBase(flags.api);
  const [command, sub, ...rest] = positional;

  try {
    switch (command) {
      case 'login': {
        const { apiBase: base } = await login(apiBase);
        console.log(`\n  Authenticated. Connected to ${base}.\n`);
        return 0;
      }

      case 'logout':
        clearConfig();
        console.log('Logged out — token forgotten.');
        return 0;

      case 'whoami': {
        const cfg = readConfig();
        if (!cfg.token) {
          console.log('Not authenticated. Run `appo login`.');
          return 1;
        }
        // Hit a cheap authenticated endpoint to prove the token is live.
        const apps = unwrap(await apiFetch(apiBase, 'GET', '/api/v1/apps'));
        console.log(`Authenticated against ${apiBase} — ${Array.isArray(apps) ? apps.length : 0} app(s).`);
        return 0;
      }

      case 'apps': {
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
        if (sub === 'show') {
          if (!rest[0]) {
            console.error('Usage: appo apps show <id>');
            return 2;
          }
          const app = unwrap(await apiFetch(apiBase, 'GET', `/api/v1/apps/${rest[0]}`));
          printApp(app);
          return 0;
        }
        if (sub === 'set-name') {
          if (!rest[0] || !rest[1]) {
            console.error('Usage: appo apps set-name <id> <name>');
            return 2;
          }
          await apiFetch(apiBase, 'PATCH', `/api/v1/apps/${rest[0]}`, { name: rest.slice(1).join(' ') });
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
        const res = await apiFetch(apiBase, 'GET', path);
        if (flags.json) { console.log(JSON.stringify(res)); return 0; }
        const d = unwrap(res);
        if (flags.build) printBuild(d); else printApp(d);
        return 0;
      }

      case 'rejection': {
        if (!sub) { console.error('Usage: appo rejection <id>'); return 2; }
        try {
          const res = await apiFetch(apiBase, 'GET', `/api/v1/apps/${sub}/rejection`);
          if (flags.json) { console.log(JSON.stringify(res)); return 0; }
          printRejection(unwrap(res));
          return 0;
        } catch (err) {
          if (err.status === 404 && flags.json) { console.log(JSON.stringify(err.envelope)); return 1; }
          if (err.status === 404) { console.log('No active rejection for this app.'); return 1; }
          throw err;
        }
      }

      case 'fix-recipe': {
        if (!sub) { console.error('Usage: appo fix-recipe <id>'); return 2; }
        try {
          const res = await apiFetch(apiBase, 'GET', `/api/v1/apps/${sub}/rejection/recipe`);
          if (flags.json) { console.log(JSON.stringify(res)); return 0; }
          const recipes = unwrap(res) || [];
          for (const r of recipes) printRecipe(r);
          return 0;
        } catch (err) {
          if (err.status === 404 && flags.json) { console.log(JSON.stringify(err.envelope)); return 1; }
          if (err.status === 404) { console.log('No active rejection for this app.'); return 1; }
          throw err;
        }
      }

      case 'build': {
        if (!sub) { console.error('Usage: appo build <id> [--platform ios|android|all] [--branch <ref>]'); return 2; }
        const body = {};
        if (flags.platform) body.platform = flags.platform;   // ios|android|all (server-validated)
        if (flags.branch)   body.branch   = flags.branch;     // /^[A-Za-z0-9._\/-]+$/ (server-validated)
        const res = await apiFetch(apiBase, 'POST', `/api/v1/apps/${sub}/builds`, body);
        if (flags.json) { console.log(JSON.stringify(res)); return 0; }
        const b = unwrap(res);
        // D-03: never poll/wait — return the id immediately. A 422 prerequisite_failed
        // (APP_BLOCKED etc.) propagates to the top-level renderError (D-06 actionable block).
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
        await apiFetch(apiBase, 'PATCH', `/api/v1/apps/${sub}`, body);   // 204 -> apiFetch returns null
        if (flags.json) { console.log('null'); return 0; }              // Pitfall 5 / D-08: no body to passthrough
        console.log(`Updated app ${sub}.`);
        return 0;
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
