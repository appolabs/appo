# @appolabs/appo

The Appo CLI — create and manage native apps from the terminal or an agent.

A thin, dependency-free Node client over the Appo public API (`/api/v1`) and the
RFC 8628 device-authorization grant (`/api/oauth/device/*`).

## Install

```bash
npm install -g @appolabs/appo
# or, from this repo:
npm link
```

## Authenticate

```bash
appo login
```

Prints a link and a short code, opens your browser. Register or sign in, approve
the connection, and the CLI receives its token automatically. The token is stored
in `~/.appo/config.json` (owner-only).

Point at a non-default backend with `--api` or `APPO_API_BASE`:

```bash
appo login --api https://app.example.com
```

## Manage apps

```bash
appo apps create --name "Photographer Dashboard" --url https://example.com/page
appo apps list
appo apps show <id>
appo apps set-name <id> "New name"
appo whoami
appo logout
```

The default API base is `http://localhost:8002` (local development).
