/** Type stubs for the exported library surface (`@appolabs/appo/config`).
 *  Hand-maintained: keep in sync with config.mjs exports. */

export interface AppoProfile {
  api_base?: string;
  token?: string;
  [key: string]: unknown;
}

export interface AppoConfig {
  current?: string;
  profiles?: Record<string, AppoProfile>;
  update_check?: any;
  [key: string]: unknown;
}

/** Config location: `{ dir, file }` under APPO_CONFIG_HOME or ~/.appo. */
export function configPath(): { dir: string; file: string };
export function readConfig(): AppoConfig;
export function readUpdateCache(): any;
export function writeUpdateCache(update_check: any): void;
export function writeConfig(config: AppoConfig): void;
export function clearConfig(): void;

/** Active profile name: flag > APPO_ENV > config.current > "default". */
export function activeProfileName(flagEnv?: string): string;

/** API base URL: flag > profile.api_base > production default. */
export function resolveApiBase(flagValue?: string, env?: string): string;

/** Token for the env: APPO_TOKEN env var > the profile's stored token. Null when absent. */
export function storedToken(env?: string): string | null;

export function writeProfile(env: string, patch: Partial<AppoProfile>): void;
export function clearProfileToken(env: string): void;
export function setCurrent(env: string): void;
