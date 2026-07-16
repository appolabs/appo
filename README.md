# @appolabs/appo

Create and manage native Appo apps from the terminal or an agent — at parity with
the dashboard. A thin, dependency-free Node client over the Appo public API
(`/api/v1`) and the RFC 8628 device-authorization grant (`/api/oauth/device/*`).

> Looking for the JavaScript bridge inside the app (push, biometrics, camera
> from your web code)? That is
> [`@appolabs/sdk`](https://www.npmjs.com/package/@appolabs/sdk).
> Note: versions of this package below 3.0.0 were that legacy bridge SDK —
> they are deprecated on npm and point here. Docs: <https://goappo.io/docs>.

## Install

```bash
npm install -g @appolabs/appo
```

Requires Node 18 or newer. After install the `appo` command is on your `PATH`.
Check the version with:

```bash
appo --version   # prints: appo/<version> node/<version>
```

## appo new

The two canonical commands: `appo new` — the app on your phone; `appo ship` —
the app on the stores.

`appo new` creates your app from a URL:

```bash
npm install -g @appolabs/appo
appo init                                  # bootstrap config + first login
appo new --url tuosito.com                 # create the app (name: Tuosito)
```

`--url` is required; a bare domain gets `https://` prepended. `--name` is
optional — without it the name derives from the URL hostname: leading `www.`
stripped, first label, capitalized (`www.pizza-mario.it` -> `Pizza-mario`).

```bash
appo new --url <u> --name <n>              # explicit name
appo new --url <u> --json                  # raw creation response envelope
```

On success it prints the new app id and the two next steps: `appo preview <id>`
(the app on your phone) and `appo ship <id>` (the app on the stores). A missing
`--url` is a usage error (exit `2`, no request issued); API errors exit `1`.

## Ship

`appo ship <id>` signals publish-intent on an existing app — Appo issues the
build server-side and submits it to the stores for you. It stops at a
confirm-gate before the publish unless you pass `--yes`. The same verb covers
republishing and resubmitting after an App Store rejection — there is no
separate `reship`/`build`/`resubmit` verb.

```bash
appo ship <id>                             # publish preview (gate), no write
appo ship <id> --yes                       # confirm and ship
```

Appo builds and submits server-side; track progress with `appo status <id>` or
`appo preview <id>`. Flags: `--stores <list>` (override the target stores;
defaults to the app's stores), `--yes` (confirm the publish step; `--confirm`
is an alias), `--json` (emit one `{steps, final_state}` object — `final_state`
in `{shipped, gated, blocked}` — instead of the live stream). The build platform
is decided by Appo (the operator) — you ship an outcome, not a build
configuration. `ship` maps its final lifecycle state to the
[exit codes](#exit-codes): `0` shipped, `1` blocked, `2` usage error,
`3` gated (publish preview shown, no write — re-run with `--yes`).

## appo init

```bash
appo init                  # device-flow login, then a readiness report
appo init --token <pat>    # non-interactive first login for CI/agents
```

Bootstraps the config in `~/.appo/config.json` (owner-only) and performs the first
login. It is idempotent: if the active environment already has a stored token,
`init` reports the active env and writes nothing (no clobber). On success it prints
the active env, the API base, and the next step (`appo new --url <u>`).

## Auth

```bash
appo login                 # authenticate via the browser (device flow)
appo login --token <pat>   # authenticate non-interactively with a dashboard PAT
appo logout                # revoke the token server-side and clear it locally
appo whoami                # show the active environment + API base + liveness
```

`appo login` prints a link and a short code and opens your browser. Register or
sign in, approve the connection, and the CLI receives its token automatically. The
token is stored in `~/.appo/config.json` (owner-only) and is never printed.

`appo login --token <pat>` validates a pasted personal access token against the API
before storing it; a rejected token is not written. Create a PAT in the dashboard.

`appo logout` revokes the token server-side, then always clears it locally (even if
the revocation call fails). `appo whoami` reports the environment, API base, and an
app count as a liveness probe — it never prints the token.

## Environments

```bash
appo env list              # list configured environments
appo env use <name>        # switch the active environment
```

Each environment is a named profile in `~/.appo/config.json` with its own stored
token and API base. Authenticating against a new environment (`appo login --env
staging`) adds a profile without clobbering the others. `env list` marks the active
profile with `*` and never prints tokens. Select an environment per-command with
`--env <name>` or the `APPO_ENV` variable.

## Apps

```bash
appo apps create --name <n> --url <u>
appo apps list             # list your apps
appo apps show <id>        # show one app
appo apps update <id> [--name <n>] [--url <u>] [--icon <https-url>]   # edit name, base URL, icon
```

`apps create` registers a new app from a name and a base URL. `apps list` prints id,
name, publication state, and base URL per app. `apps show <id>` prints the full app
overview. `apps update <id>` edits only the fields you supply — the app name, its base
URL, and the app icon; at least one field is required. `--icon` takes an https image
URL, which Appo fetches and sets via the icon endpoint. When `--name`/`--url` and
`--icon` are given together the field update runs first, then the icon is set. `--json`
prints `null` for a name/URL-only update (it returns no body) and `{ icon_url }` when
an icon was set. Not confirm-gated (reversible).

> To republish an existing app (or resubmit after a rejection), use `appo ship <id>` —
> Appo rebuilds and resubmits server-side. There is no separate `reship`/`build`/`resubmit`
> verb. You ship an outcome, not a build configuration.

## status

```bash
appo status <id>                    # app overview
appo status <id> --build <buildId>  # one build's status
```

Prints the app overview, or a single build's status when `--build` is given. With
`--json` it prints the raw v1 response body verbatim.

## preview

```bash
appo preview [id]
```

Shows the preview target for an app — per-platform readiness, the iOS TestFlight
URL, the Android deeplink, the canonical `preview_url`, and a scannable terminal QR
code (when at least one platform is preview-ready).

The id is optional. Without it, `appo preview` targets your only app directly, or —
when the account has several — shows a numbered picker on an interactive terminal.
In scripts and with `--json`, several apps produce an error listing the ids instead
of a prompt.

The output prints readiness first (`ios: preview-ready` / `not preview-ready yet`,
same for `android`), then the platform-specific URLs (TestFlight URL only when iOS
is ready, Android deeplink only when Android is ready), then the `preview_url`
(always present), then the QR encoding `preview_url`.

When neither platform is ready the QR is skipped and a `(no preview target yet)`
line is printed instead. With `--json` the raw v1 response body is emitted verbatim
— no QR, no curation. Exit 1 on API error (including app not found, or no apps to
resolve); exit 2 when several apps exist and no id was given outside a TTY.

## rejection

```bash
appo rejection <id>
```

Shows the active App Store rejection (status + required action). When there is no
active rejection it reports so and exits non-zero. `--json` emits the raw envelope.

## fix-recipe

```bash
appo fix-recipe <id>
```

Shows the fix recipe for a rejection — slug, fix type, agent steps, and
limitations. `--json` emits the raw envelope.

## publish

```bash
appo publish <id> --confirm
```

Publishes to the app's stores. Destructive: without `--confirm` it prints a preview
and exits with code `3` (confirm required) — no write is performed. By default it
targets the app's stores; `--stores <list>` is an optional override accepting the
canonical store tokens or the `apple`/`google` aliases.

## push

```bash
appo push <id> --title <t> --body <b> [--target-url <u>] [--image-path <p>] [--scheduled-at <when>] --confirm
```

Sends a push notification. Destructive: without `--confirm` it prints a preview and
exits with code `3` — no write. The preview omits the recipient count (exposed only
after send). On success it reports the number of devices reached.

## build

```bash
appo build <id>                     # trigger a test build (android, the default)
appo build <id> --platform ios      # iOS test build (requires a registered device)
```

Triggers a self-serve **test** build — an installable you download and try on your
own device, distinct from store publishing (`appo ship` / `appo publish`). Available
on self-managed apps only; other apps get a clear capability error. The trigger
returns immediately (the build takes minutes): track it with
`appo status <id> --build <n>`, then fetch it with `appo download <id>`.

iOS test builds install only on registered devices. If none is registered yet the
command exits with the registration hint — run `appo devices register` first.
`--json` emits the raw v1 response body verbatim (envelope on error too).

## download

```bash
appo download <id>                          # newest ready artifact
appo download <id> --build <n>              # a specific build
appo download <id> --output <path>          # choose the destination file
```

Downloads the installable artifact (APK/AAB for Android, ad-hoc IPA for iOS) once
the build is `ready`. Without `--build` it picks the newest ready build; if the
latest build is still running it reports that build's status instead. The filename
derives from the artifact URL unless `--output` is given. `--json` reports
`{ build_id, file, bytes }`.

## devices

```bash
appo devices list          # registered iOS test devices
appo devices register      # registration link + QR (open on the iPhone)
```

iOS test builds are signed ad-hoc against your registered devices — no Apple
developer account and no Apple login needed. `devices register` prints a signed
24h link and a scannable QR; open it on the iPhone and follow the enrollment
prompt to register the device's UDID, one time per device. `devices list` shows
your pool (UDIDs are truncated server-side).

## upgrade

```bash
appo upgrade               # update to the latest @appolabs/appo via npm
appo --version             # print the CLI + Node version (alias: -v)
```

`appo upgrade` runs `npm install -g @appolabs/appo@latest` and reports the result.
The CLI also performs a daily, best-effort update check and prints a one-line
notice to stderr when a newer version is available; the check is skipped under
`--json` and silently swallows network errors.

## Environment variables

| Variable        | Purpose                                                          |
| --------------- | --------------------------------------------------------------- |
| `APPO_TOKEN`    | Ephemeral token, highest precedence, never written to disk      |
| `APPO_ENV`      | Active environment/profile (overridden by `--env`)              |
| `APPO_API_BASE` | API base URL (overridden by `--api`)                            |

Create a PAT in the dashboard, then `appo login --token <pat>` or set `APPO_TOKEN`
in your environment (for example in CI/agents) to authenticate without the browser
flow. The default API base is `https://apps.goappo.io` (production); override it with
`--api` or `APPO_API_BASE` (for example `http://localhost:8002` for local development).

## Exit codes

| Code | Meaning                                                                       |
| ---- | ---------------------------------------------------------------------------- |
| `0`  | success                                                                       |
| `1`  | runtime / API error (including auth failure — run `appo login`)              |
| `2`  | usage error (missing or invalid arguments)                                   |
| `3`  | confirm required (destructive verb invoked without `--confirm`; no write)    |

`ship` maps these to its final lifecycle state: `0` shipped, `1` blocked,
`2` usage, `3` gated (publish preview shown, no write — re-run with `--yes`).

## CI auth

For non-interactive contexts (CI pipelines, agents) authenticate without the
browser device flow:

```bash
export APPO_TOKEN=<pat>            # ephemeral, never written to disk
# or, to persist into a profile:
appo login --token <pat>
```

`APPO_TOKEN` has the highest precedence and is never persisted. `appo login
--token <pat>` validates the token and stores it in the active profile. Combine
with `APPO_ENV` and `APPO_API_BASE` to fully configure a headless environment.

## Releasing

Releasing `@appolabs/appo` to the npm registry is a deliberate human action. The
CLI tooling never publishes automatically.

The release workflow (`.github/workflows/release.yml`) publishes on push to
`master`/`main` using npm OIDC trusted publishing (`--provenance --access public`).
There is no `NPM_TOKEN` secret to manage.

One-time setup (user-performed):

1. On npmjs.com, open the package's **Settings → Trusted Publisher**.
2. Provider: **GitHub Actions**; Organization/user: `appolabs`; Repository:
   `appo`; Workflow filename: `release.yml`; Environment: blank.
3. Confirm `package.json` `repository.url` matches the GitHub repository exactly.

First publish: npm trusted publishing requires the package to already exist on the
registry. Two paths are available, and you choose:

- Run one manual `npm publish --access public` for `v0.1.0`, then rely on
  `release.yml` for subsequent patch releases; or
- If your local npm is OIDC-capable, publish via that path for the first release.

Before any publish, confirm package ownership and the intended version: a package
named `@appolabs/appo` already appears on the registry. Verify you own the name and
that the version you are publishing is correct before running `npm publish` — do not
assume the name is unclaimed.

## Library usage

The API core ships as importable modules alongside the CLI — the first consumer
is `@appolabs/appo-mcp`, which reuses the same lifecycle calls, auth resolution,
and profiles instead of maintaining a parallel client:

```js
import { getPreview, listApps } from "@appolabs/appo/ops";
import { resolveApiBase, activeProfileName, storedToken } from "@appolabs/appo/config";

const env = activeProfileName();
const apiBase = resolveApiBase(undefined, env);
const preview = await getPreview(apiBase, 128, env);
```

Token resolution matches the CLI: `APPO_TOKEN` first, then the active profile's
stored token from `appo login`. The exported modules (`./ops`, `./api`,
`./config`) never print or exit — errors throw with the v1 envelope attached
(`err.status`, `err.envelope`). Type stubs ship as `.d.mts` next to each module.
