// Per-worker config isolation for the vitest suite.
//
// Vitest's default pool (`forks`) runs each test FILE in its own worker process
// IN PARALLEL. The fetch-stub harness (mockFetch.mjs / stubToken) writes the
// active config via configPath(), which falls back to the real ~/.appo/config.json
// when APPO_CONFIG_HOME is unset. Files that use stubToken() (without a per-test
// mkdtemp beforeEach) would therefore have multiple workers read/write the same
// real file concurrently — corrupting it mid-write (the "Unexpected end of JSON
// input" race the old single-process `--test-concurrency=1` runner masked).
//
// We allocate ONE temp config home per worker and re-assert it before EVERY test
// via a global beforeEach. The re-assert is load-bearing (WR-01): several files
// `delete process.env.APPO_CONFIG_HOME` in their afterEach, and setupFiles do NOT
// re-run between tests — without this, a config read outside a per-test beforeEach
// would fall back to the real ~/.appo/config.json. Files that set their own
// per-test mkdtemp in beforeEach still override this (their hook runs after ours).

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach } from 'vitest';

// One isolated config home for this worker process, created once.
const WORKER_CONFIG_HOME = mkdtempSync(join(tmpdir(), 'appo-worker-'));
process.env.APPO_CONFIG_HOME = WORKER_CONFIG_HOME;

// Re-assert before every test so a prior afterEach that deleted the var can never
// expose the real ~/.appo/config.json to a stubToken/config read.
beforeEach(() => {
  if (!process.env.APPO_CONFIG_HOME) {
    process.env.APPO_CONFIG_HOME = WORKER_CONFIG_HOME;
  }
});

// Clean up the worker's temp config home on process exit (WR-02 — no leaked
// 0600 config dirs accumulating across runs). Sync handler: rmSync only.
process.on('exit', () => {
  rmSync(WORKER_CONFIG_HOME, { recursive: true, force: true });
});
