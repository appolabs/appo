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
// Setting APPO_CONFIG_HOME to a unique per-worker temp dir here — before any test
// in the worker runs — gives every file an isolated config home and never touches
// the real ~/.appo. Files that set APPO_CONFIG_HOME in their own beforeEach simply
// override this per test, unchanged.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (!process.env.APPO_CONFIG_HOME) {
  process.env.APPO_CONFIG_HOME = mkdtempSync(join(tmpdir(), 'appo-worker-'));
}
