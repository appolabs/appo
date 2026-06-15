# @appolabs/appo

Create and manage native Appo apps from the terminal or an agent — at parity with
the dashboard. A thin, dependency-free Node client over the Appo public API
(`/api/v1`) and the RFC 8628 device-authorization grant (`/api/oauth/device/*`).

## Install

```bash
npm install -g @appolabs/appo
```

Requires Node 18 or newer. After install the `appo` command is on your `PATH`.
Check the version with:

```bash
appo --version   # prints: appo/<version> node/<version>
```

## Ship

`appo ship` is the one-command lifecycle: it creates an app (when given a URL and
name), triggers a build, polls until the build is ready, then publishes — stopping
at a confirm-gate before the publish unless you pass `--yes`.

```bash
npm install -g @appolabs/appo
appo init                                          # bootstrap config + first login
appo ship --url https://example.com --name "My App"
```

That single `ship` call runs create → build → poll → publish and streams each step
as it happens. Drop `--yes` to inspect the publish preview before anything is
written; re-run with `--yes` (or `--confirm`) to publish.

```bash
appo ship <id>                                     # build + publish an existing app
appo ship --url <u> --name <n> --yes               # full pipeline, skip the gate
```

Flags: `--stores <list>` (target stores, default both), `--platform ios|android|all`,
`--timeout <s>` (max seconds to poll a build, default 1800), `--yes` (confirm the
publish step), `--json` (emit one `{steps, final_state}` object instead of the live
stream). `ship` maps its final lifecycle state to the [exit codes](#exit-codes):
`0` shipped, `1` blocked or failed, `2` usage error, `3` gated (publish preview
shown, no write — re-run with `--yes`).

## appo init

```bash
appo init                  # device-flow login, then a readiness report
appo init --token <pat>    # non-interactive first login for CI/agents
```

Bootstraps the config in `~/.appo/config.json` (owner-only) and performs the first
login. It is idempotent: if the active environment already has a stored token,
`init` reports the active env and writes nothing (no clobber). On success it prints
the active env, the API base, and the next step (`appo ship --url <u> --name <n>`).

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
appo apps create --name <n> --url <u> [--meta-name <m>] [--meta-desc <d>]
appo apps list             # list your apps
appo apps show <id>        # show one app
appo apps set-name <id> <name>   # rename an app
```

`apps create` registers a new app from a name and a base URL, with optional store
metadata name and description. `apps list` prints id, name, publication state, and
base URL per app. `apps show <id>` prints the full app overview. `apps set-name`
updates only the app name.

## build

```bash
appo build <id> [--platform ios|android|all] [--branch <ref>]
```

Triggers a build and returns the build id immediately — it does not wait. Poll it
with `appo status <id> --build <buildId>`. A blocked prerequisite (for example a
missing Apple credential) is rendered as an actionable blocked state. `--json`
prints the raw v1 response.

## status

```bash
appo status <id>                    # app overview
appo status <id> --build <buildId>  # one build's status
```

Prints the app overview, or a single build's status when `--build` is given. With
`--json` it prints the raw v1 response body verbatim.

## configure

```bash
appo configure <id> [--name <n>] [--url <u>] [--meta-name <m>] [--meta-desc <d>] [--injected-css <css>] [--injected-js <js>]
```

Updates only the fields you supply. At least one field is required. `--json` prints
`null` (the update returns no body). Not confirm-gated (reversible).

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
appo publish <id> --stores apple_appstore,google_playstore --confirm
```

Publishes to the named stores. Destructive: without `--confirm` it prints a preview
and exits with code `3` (confirm required) — no write is performed. `--stores`
accepts the canonical store tokens or the `apple`/`google` aliases.

## push

```bash
appo push <id> --title <t> --body <b> [--target-url <u>] [--image-path <p>] [--scheduled-at <when>] --confirm
```

Sends a push notification. Destructive: without `--confirm` it prints a preview and
exits with code `3` — no write. The preview omits the recipient count (exposed only
after send). On success it reports the number of devices reached.

## resubmit

```bash
appo resubmit <id> --confirm
```

Resubmits a rejected app for review. Destructive: without `--confirm` it prints a
preview and exits with code `3` — no write. A missing customer Apple Developer
credential is rendered as an actionable blocked state.

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
flow. The default API base is `http://localhost:8002` (local development).

## Exit codes

| Code | Meaning                                                                       |
| ---- | ---------------------------------------------------------------------------- |
| `0`  | success                                                                       |
| `1`  | runtime / API error (including auth failure — run `appo login`)              |
| `2`  | usage error (missing or invalid arguments)                                   |
| `3`  | confirm required (destructive verb invoked without `--confirm`; no write)    |

`ship` maps these to its final lifecycle state: `0` shipped, `1` blocked or failed,
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
