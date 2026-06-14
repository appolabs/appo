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

      default:
        console.error(`Unknown command: ${command}\n`);
        console.log(USAGE);
        return 2;
    }
  } catch (err) {
    console.error(`\n  Error: ${err.message}\n`);
    return 1;
  }
}
