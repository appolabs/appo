# Migration: apps-web-app 196 — app-lifecycle decomposition (appo CLI)

This is an informational EXPAND-step note. **No action is required** in this repo. It records
that the appo CLI already reads the resolved public contract and does not re-derive lifecycle
from the raw `status` string.

## 1. New fields available

The overloaded app `status` enum is decomposed into orthogonal lifecycle facts in apps-web-app
(phases 192–194):

- `prep_mode` (`appo_managed` | `self_managed`) — per-app preparation mode.
- an app-validity fact (`validated_at` / `invalid_reason`).
- an app-prep fact (`prepared_at`).
- a publishable fact (`hasReadyBuild()`).

Of these, only `prep_mode` is serialized today. The validity, prep, and publishable facts are
not yet on the wire — they are slated to be surfaced as explicit fields in the deferred contract
milestone.

## 2. `status` stays stable

The derived accessor keeps `status` serializing today's values. No behavior change for any
reader.

## 3. What to migrate away from — no action required

The `appo` CLI `status` command reads the V1 `/api/v1/apps/{id}` resource and prints
`publication_state` / `primary_action` / `stores` — already on the 175.1 public contract. It does
**not** read the raw app lifecycle `status` field.

The `line('status', ...)` calls in `src/cli.mjs` print build status, rejection status, and CLI
progress strings — these are unrelated to the app lifecycle `status` field and are not migration
targets. There is no re-derivation of lifecycle from raw `status` in this repo, so no migration is
needed.

## 4. Timeline

Informational only. Nothing to do when the deferred contract phase removes raw `status` from the
API, because this repo does not consume it.

## Reference

- `app/Models/App.php` — `status()` derived accessor, `isValid()`
- `app/Enums/PrepMode.php` — `appo_managed` / `self_managed`
- `app/Http/Resources/AppResource.php` — what is actually serialized to consumers
- `docs/CROSS-SURFACE-PARITY.md` — `## Lifecycle Facts`
