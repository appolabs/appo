import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, chmodSync } from 'node:fs';

const CONFIG_DIR = join(homedir(), '.appo');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

const DEFAULT_API_BASE = 'http://localhost:8002';

/** Read the stored config, or an empty object if none exists. */
export function readConfig() {
  if (!existsSync(CONFIG_PATH)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

/** Persist config, creating ~/.appo with owner-only perms (the token lives here). */
export function writeConfig(config) {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  chmodSync(CONFIG_PATH, 0o600);
}

export function clearConfig() {
  if (existsSync(CONFIG_PATH)) {
    rmSync(CONFIG_PATH);
  }
}

/**
 * Resolve the API base URL. Precedence: --api flag > APPO_API_BASE env >
 * stored config > built-in default. Trailing slashes are stripped.
 */
export function resolveApiBase(flagValue) {
  const value =
    flagValue ||
    process.env.APPO_API_BASE ||
    readConfig().api_base ||
    DEFAULT_API_BASE;
  return value.replace(/\/+$/, '');
}

export function storedToken() {
  return readConfig().token ?? null;
}

export { CONFIG_PATH };
