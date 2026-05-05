# Panel bridge

`panel-bridge.mjs` is a Node script the SFX panel spawns whenever this
workspace is connected. It owns the runtime side of three concerns the
panel previously polled directly:

1. Database migrations - watches `migrations.schemaPaths` for new
   sub-directories under each schema's sibling `migrations/` folder and
   runs `migrations.applyCommand` inside the configured compose service.
2. Env requests - watches `envRequests.dir` for `*.json` drops, surfaces
   them in the panel UI, and on operator resolve writes the value into
   `envRequests.targetEnvFile` and optionally restarts `env.restartService`.
3. Rebuilds - watches `rebuild.watch` paths for mtime + content-hash
   changes, debounces 500ms, then runs the manifest's `rebuild.command`
   when set OR falls back to `pnpm install --prefer-offline --silent`
   followed by `docker compose -p <composeProject> up -d` (with `--build`
   unless only `pnpm-lock.yaml` changed and the existing image still
   post-dates the Dockerfile).
4. Env files - watches each `env.files` path for mtime + content-hash
   changes and runs `docker compose -p <composeProject> restart
   <env.restartService>`, emitting `env.applied`. Direct edits to
   `apps/api/.env` therefore take effect within ~5-8s without forcing a
   rebuild. Resolved env-requests still go through the env-request
   handler (the request-resolution flow restarts the service inline).

All runtime parameters come from the sibling `panel.config.json` so
swapping the bridge implementation never requires a panel rebuild.

## Performance budget

The bridge is the test-loop hot path. The following SLA holds when the
panel container is healthy and the docker daemon is responsive:

| Trigger | Target latency | How |
| --- | --- | --- |
| Source code change (`apps/*/src/**`) | ~1s | Docker bind mount + `next dev` / `nest --watch`. The bridge MUST NOT fire on this path. |
| Prisma schema -> new migration dir | 2-4s | Migration watcher polls every 500ms and runs `prisma migrate deploy` inside the api container. |
| Env file edit (`apps/api/.env`) | 5-8s | Env-file watcher polls every 500ms, debounces 500ms, then `docker compose restart <service>`. Skipped when content-hash unchanged. |
| `env_request.resolve` (panel UI) | 5-8s | Operator's value is merged into the env file, then the same compose-restart path. |
| `package.json` / `pnpm-lock.yaml` content change | 20-60s | Rebuild watcher polls every 500ms, debounces 500ms. `pnpm install --prefer-offline --silent` + `docker compose up -d` (no `--build` when only `pnpm-lock.yaml` changed and the image post-dates the Dockerfile, otherwise full `--build`). |

Effective interval values (see `panel-bridge.mjs` constants):

| Constant | Value |
| --- | --- |
| `MIGRATION_POLL_INTERVAL_MS` | 500 |
| `ENV_REQUEST_POLL_INTERVAL_MS` | 500 |
| `REBUILD_POLL_INTERVAL_MS` | 500 |
| `ENV_FILE_POLL_INTERVAL_MS` | 500 |
| `REBUILD_DEBOUNCE_MS` | 500 |
| `ENV_FILE_DEBOUNCE_MS` | 500 |

The rebuild watcher uses a SHA-256 content-hash dedupe on top of mtime so
`touch`, formatter re-saves, and lockfile no-op writes do NOT trigger a
rebuild. Same applies to the env-file watcher.

Watch-path discipline: the rebuild watcher fires ONLY on the literal
paths declared in `rebuild.watch`. Subdirectories are NEVER walked. This
is non-negotiable - the test loop's source-code change SLA depends on
the docker bind mount, not the bridge.

## Contract

The panel spawns the bridge with stdio piped (`["pipe","pipe","pipe"]`) and
the inherited environment merged with `bridge.env` from the manifest.
Two environment variables are added by the panel:

| Var | Purpose |
| --- | --- |
| `PANEL_BRIDGE_WORKSPACE_ROOT` | Absolute workspace root the bridge should treat as its `cwd` baseline. |
| `PANEL_BRIDGE_COMPOSE_PROJECT` | Effective compose project name (panel's manifest overrides workspace's). |

The bridge MUST emit `bridge.ready` as the first line on stdout.

## Events (bridge -> panel, NDJSON over stdout)

One JSON object per line. Lines without a `type` field are dropped.

| `type` | Payload |
| --- | --- |
| `bridge.ready` | `{ capabilities: string[] }` |
| `log` | `{ level: "info"\|"warn"\|"error", message: string }` |
| `migration.applied` | `{ id, schemaPath, migrationName, success, stdout, stderr, startedAt, finishedAt, project?, service? }` |
| `env_request.new` | `{ id, key, description?, sensitive?, requestedAt?, requestedBy?, sourceFile? }` |
| `env_request.removed` | `{ id }` |
| `rebuild.started` | `{ id, trigger: string[], startedAt, project? }` |
| `rebuild.completed` | `{ id, trigger: string[], success, stdoutTail, stderrTail, startedAt, finishedAt, durationMs, project?, failedPhase? }` |
| `env.applied` | `{ file, restarted, project, success, stdoutTail, stderrTail }` |

## Commands (panel -> bridge, NDJSON over stdin)

| `type` | Payload |
| --- | --- |
| `env_request.resolve` | `{ id, value, restart?: boolean }` |
| `env_request.dismiss` | `{ id }` |
| `rebuild.trigger` | `{ trigger: string[] }` |

After resolving an env request, the bridge MUST emit `env_request.removed`
so the panel's in-memory store stays in sync.

## How to extend

1. Add a new capability section to `panel.config.json` under a new key
   (e.g. `seeds`).
2. Add a `startSeedsWatcher(manifest)` helper to `panel-bridge.mjs` that
   schedules the polling and emits whatever new event types you need.
3. Push the capability string into the `capabilities` array before the
   `bridge.ready` emit so the panel can feature-flag UI accordingly.
4. Add new stdin command handlers in the `switch (command.type)` block
   for any operator-triggered actions.
5. Document the new event/command types in the contract table above.

## Self-contained

The script intentionally uses only Node stdlib (`node:child_process`,
`node:fs`, `node:path`, `node:readline`). Do NOT add npm dependencies -
the boilerplate stays portable when the panel container ships a stock
Node 22 runtime.

## Local debug

```bash
PANEL_BRIDGE_WORKSPACE_ROOT="$PWD" \
PANEL_BRIDGE_COMPOSE_PROJECT="app-dev-host" \
  node scripts/panel-bridge.mjs
```

Then paste a command on stdin:

```
{"type":"rebuild.trigger","trigger":["manual"]}
```

Each event the bridge emits prints as a JSON line on stdout.

## Per-worker mode

When `scripts/stack-up-docker.sh` brings up a per-worktree compose stack
(project name `app-<basename>`, e.g. `app-w7`), it ALSO spawns a bridge
scoped to that worktree so prisma migrations, env edits, and lockfile
bumps inside the worktree auto-apply to that worker's stack instead of
waiting for merge into the main workspace.

The worker bridge is just `panel-bridge.mjs` invoked with two extra env
vars on top of the contract above:

| Var | Purpose |
| --- | --- |
| `PANEL_BRIDGE_WORKSPACE` | Absolute path to the worker's worktree. Overrides `PANEL_BRIDGE_WORKSPACE_ROOT` and `process.cwd()`. The manifest at `<workspace>/panel.config.json` is read from this path; schema files, env files, env-request dirs, and rebuild watch globs all resolve relative to it. |
| `PANEL_BRIDGE_COMPOSE_PROJECT` | Compose project name to `docker compose -p <project> exec` against. Overrides the manifest's `composeProject`. |

When BOTH are set, the bridge logs `[worker mode (compose project: …)]`
in its `bridge.ready` log line and runs `migration.applied` /
`rebuild.completed` events against the worker's project name, not the
panel's.

`scripts/stack-up-docker.sh` writes two sibling files into the worktree:

| File | Contents |
| --- | --- |
| `.bridge.pid` | PID of the spawned bridge process. Used by `stack-down-docker.sh` and `sfx-overstory`'s `ov stop --clean-worktree` for SIGTERM → SIGKILL teardown. |
| `.bridge.log` | Combined stdout + stderr of the bridge. Tail this to see `bridge.ready`, `migration.applied`, `rebuild.completed`, etc. for the worker. |

`scripts/stack-down-docker.sh` is the symmetric teardown: it sends
SIGTERM to the pid in `.bridge.pid`, waits up to 5s, escalates to
SIGKILL on timeout, then runs `docker compose -p <project> down
--remove-orphans -v`.

### Local-only today (no panel UI)

Worker bridges write events to their per-worktree `.bridge.log` only.
The panel UI does NOT yet aggregate worker bridge events — it shows
events from the panel-side bridge (the one connected to `app-dev-host`)
exclusively. Surfacing worker events in the panel UI is tracked as a
follow-up: either bridges POST to `/api/bridge-events` over
`host.docker.internal:6009`, or each worktree's `.overstory/` writes
into a shared SQLite at `bridge-events.db`. For now, agents tail
`.bridge.log` directly when debugging worker auto-apply.
