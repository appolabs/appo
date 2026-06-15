import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, chmodSync } from 'node:fs';

const DEFAULT_API_BASE = 'http://localhost:8002';

/**
 * Resolve the config directory and file PER CALL.
 *
 * Resolved lazily (not at module load) so that a test setting APPO_CONFIG_HOME
 * after ESM imports have run is honored on the very next read/write. The
 * override only relocates the path; the owner-only write discipline is reapplied
 * on every writeConfig.
 */
export function configPath() {
  const dir = process.env.APPO_CONFIG_HOME || join(homedir(), '.appo');
  return { dir, file: join(dir, 'config.json') };
}

/**
 * Read the stored config, normalizing the legacy flat shape into the
 * profile-aware shape `{ current, profiles: { <name>: { api_base, token } } }`.
 *
 * A legacy flat config `{ token, api_base }` is folded into `profiles.default`
 * so existing users are never logged out. The flat keys disappear from disk on
 * the next writeConfig (no separate migration step). An absent or unparseable
 * file yields `{ current: 'default', profiles: {} }` so `.profiles[env]` is
 * always safe.
 */
export function readConfig() {
  const { file } = configPath();
  let raw = {};
  if (existsSync(file)) {
    try {
      raw = JSON.parse(readFileSync(file, 'utf-8'));
    } catch {
      raw = {};
    }
  }

  const profiles = raw.profiles && typeof raw.profiles === 'object' ? { ...raw.profiles } : {};

  // Legacy flat shape: top-level token/api_base fold into profiles.default. This
  // also covers a hybrid object that carries both flat keys and a profiles map
  // without an explicit default (so an existing user is never logged out).
  if ((raw.token || raw.api_base) && !profiles.default) {
    profiles.default = { api_base: raw.api_base ?? null, token: raw.token ?? null };
  }

  return { current: raw.current ?? 'default', profiles };
}

/** Persist config, creating the config dir with owner-only perms (tokens live here). */
export function writeConfig(config) {
  const { dir, file } = configPath();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(config, null, 2));
  chmodSync(file, 0o600);
}

export function clearConfig() {
  const { file } = configPath();
  if (existsSync(file)) {
    rmSync(file);
  }
}

/**
 * Resolve the active profile name. Precedence: --env flag > APPO_ENV env >
 * config `current` > 'default'.
 */
export function activeProfileName(flagEnv) {
  return (
    (typeof flagEnv === 'string' && flagEnv) ||
    process.env.APPO_ENV ||
    readConfig().current ||
    'default'
  );
}

/**
 * Resolve the API base URL for a profile. Precedence: --api flag >
 * APPO_API_BASE env > profile api_base > built-in default. Trailing slashes are
 * stripped.
 */
export function resolveApiBase(flagValue, env = activeProfileName()) {
  const prof = readConfig().profiles[env] || {};
  const value = flagValue || process.env.APPO_API_BASE || prof.api_base || DEFAULT_API_BASE;
  return value.replace(/\/+$/, '');
}

/**
 * Resolve the token for a profile. Precedence: APPO_TOKEN env (ephemeral, never
 * persisted) > profile token. APPO_TOKEN is read-only here — no writer sources
 * from it.
 */
export function storedToken(env = activeProfileName()) {
  if (process.env.APPO_TOKEN) {
    return process.env.APPO_TOKEN;
  }
  return readConfig().profiles[env]?.token ?? null;
}

/** Merge a patch into a profile, leaving sibling profiles untouched (no clobber). */
export function writeProfile(env, patch) {
  const cfg = readConfig();
  cfg.profiles[env] = { ...(cfg.profiles[env] || {}), ...patch };
  if (!cfg.current) {
    cfg.current = env;
  }
  writeConfig(cfg);
}

/** Drop a profile's token, keeping its api_base (logout for one environment). */
export function clearProfileToken(env) {
  const cfg = readConfig();
  if (cfg.profiles[env]) {
    delete cfg.profiles[env].token;
    writeConfig(cfg);
  }
}

/** Set the top-level active profile name. */
export function setCurrent(env) {
  writeConfig({ ...readConfig(), current: env });
}
