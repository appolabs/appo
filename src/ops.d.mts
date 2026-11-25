/** Type stubs for the exported library surface (`@appolabs/appo/ops`).
 *  Hand-maintained: keep in sync with ops.mjs exports. */

/** Unwrap a v1 `{ data: ... }` envelope to its payload; pass through anything else. */
export function unwrap(payload: unknown): any;

export function createApp(
  apiBase: string,
  input: {
    name: string;
    base_url: string;
    prep_mode?: string;
    owner_authorized?: boolean;
    accepted_tos?: boolean;
  },
  env?: string,
): Promise<any>;

/** Answers to the guided-flow questions; only the keys present are sent. */
export function startApp(
  apiBase: string,
  id: string | number,
  answers: {
    fix?: 'self' | 'appo';
    phone?: 'iphone' | 'android';
    iphone_install?: 'direct' | 'testflight';
    appo_help?: 'yes' | 'no';
    install_only?: boolean;
    owner_authorized?: boolean;
    accepted_tos?: boolean;
  },
  env?: string,
): Promise<any>;

export function getApp(apiBase: string, id: string | number, env?: string): Promise<any>;

/** Runs the site readiness check for the app; resolves to the server payload. */
export function checkSite(apiBase: string, id: string | number, env?: string): Promise<any>;

export function listApps(apiBase: string, env?: string): Promise<any[]>;

export function getBuild(
  apiBase: string,
  id: string | number,
  buildId: string | number,
  env?: string,
): Promise<any>;

/** Resolves on success (204 -> null). */
export function publishApp(
  apiBase: string,
  id: string | number,
  app_stores: string[],
  env?: string,
): Promise<null>;

/** Flat payload: { install }. */
export function getInstall(apiBase: string, id: string | number, env?: string): Promise<any>;

/** Flat payload: { icon_url }. */
export function setIcon(
  apiBase: string,
  id: string | number,
  icon_url: string,
  env?: string,
): Promise<any>;

/** Flat payload: { permissions }. Partial merge of a subset of
 *  { tracking | camera | microphone | nfc } to booleans. */
export function setPermissions(
  apiBase: string,
  id: string | number,
  permissions: Record<string, boolean>,
  env?: string,
): Promise<any>;

export interface AdaptationFinding {
  id: string;
  label: string;
  finding: string;
  fix: string;
}

export interface AdaptationStatement {
  id: string;
  statement: string;
}

/** Flat body of GET /api/v1/apps/{id}/adaptation-brief. */
export interface AdaptationBrief {
  app: number;
  base_url: string;
  prep_mode: string;
  preparation: { mode: string; status: string };
  reviewed_at: string | null;
  wrapper: AdaptationStatement[];
  policy: AdaptationStatement[];
  cookie_check: { state: string };
  site: null | {
    reading_fetched_at: string;
    consent_managers: unknown;
    age_gate: unknown;
    findings: AdaptationFinding[];
  };
  site_note: string | null;
}

export function getAdaptationBrief(
  apiBase: string,
  id: string | number,
  env?: string,
): Promise<AdaptationBrief>;

/** Dry run body (confirm_required) or removal body (deleted). */
export interface RemoveAppResult {
  will?: 'delete';
  deleted?: boolean;
  app: number;
  name: string;
  confirm_required?: boolean;
  note?: string;
  message?: string;
}

/** Without `confirm` the server answers a dry run; with it, removes. */
export function removeApp(
  apiBase: string,
  id: string | number,
  options: { confirm?: boolean },
  env?: string,
): Promise<RemoveAppResult>;

export interface AppearanceBody {
  injected_css?: string;
  injected_javascript?: string;
  preset?: string;
  confirm?: boolean;
}

/** Flat body of PATCH /api/v1/apps/{id}/appearance. */
export function customizeAppearance(
  apiBase: string,
  id: string | number,
  body: AppearanceBody,
  env?: string,
): Promise<any>;

/** Unwrapped AppBuildResource of the requested TestFlight build. */
export function requestTestFlightBuild(
  apiBase: string,
  id: string | number,
  env?: string,
): Promise<any>;
