#!/usr/bin/env node
import { run } from '../src/cli.mjs';
import { checkForUpdate } from '../src/upgrade.mjs';
import { createRequire } from 'node:module';

const argv = process.argv.slice(2);

run(argv)
  .then(async (code) => {
    // Post-command update-check hook: best-effort, daily-cached, non-blocking,
    // and skipped entirely under --json so machine output is never polluted.
    // Lives here (not in run()) so unit tests of run() stay free of any network
    // side effects. Never throws — a down registry can't break the CLI.
    if (!argv.includes('--json')) {
      try {
        const { version } = createRequire(import.meta.url)('../package.json');
        await checkForUpdate(version);
      } catch {
        /* best-effort */
      }
    }
    process.exit(code ?? 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
