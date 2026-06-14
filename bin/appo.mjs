#!/usr/bin/env node
import { run } from '../src/cli.mjs';

run(process.argv.slice(2))
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
