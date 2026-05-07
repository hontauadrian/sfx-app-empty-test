---
name: stack-debug
description: Debug your worktree's docker stack. Use when the api crashed, a migration didn't apply, an env change didn't take effect, or you need to see container logs without timeouts.
---

# Stack Debug — Docker Worker Mode

Worktree runs isolated docker compose stack named `app-<basename>` (e.g. `app-w7`). Panel-bridge runs alongside as detached process, auto-applying prisma migrations, env-file edits, lockfile rebuilds. Debug in this order.

## 1. One-shot snapshot

```bash
pnpm stack:debug
```

Returns JSON: `{ project, postgres, api, web, bridge }`.

## 2. Container inventory

```bash
pnpm stack:ps
```

`docker compose ps -a` for the project. Use when `stack:debug` says something is missing.

## 3. Service logs — last 200 lines

```bash
pnpm stack:logs            # all services
pnpm stack:logs api        # one service: api / web / postgres
```

No tail truncation. Use for crash loops: `pnpm stack:logs api | grep -i "error\|fatal" | tail -30`.

## 4. Live tail (when you want to watch a request go through)

```bash
pnpm stack:follow          # all services
pnpm stack:follow api      # one service
```

`tail -f` semantics. Ctrl-C to exit. Use for: reproducing a 500 in real time, watching nest hot-reload, confirming a migration log line lands.

## 5. Bridge log — what the auto-apply layer is doing

```bash
pnpm stack:bridge          # last 200 lines
pnpm stack:bridge:tail     # tail -F live
```

Bridge writes NDJSON events to `<worktree>/.bridge.log`:
- `bridge.ready` — startup capability list
- `migration.applied` — prisma migrate result (success/stderr)
- `env_request.new` / `env_request.removed` — agent env requests
- `env.applied` — env-file edit detected, service restart
- `rebuild.started` / `rebuild.completed` — lockfile change pipeline
- `log` — info / warn / error messages

Every poll error, apply attempt, dedupe skip recorded.

## 6. Exec into a container

```bash
pnpm exec -- bash workspace-dev/scripts/stack-debug-docker.sh exec api bash
pnpm exec -- bash workspace-dev/scripts/stack-debug-docker.sh exec api sh -c "node -e 'console.log(process.env.DATABASE_URL)'"
```

Useful for: confirming env vars loaded, checking node_modules layout, running `pnpm exec prisma studio` manually.

## Decision flow

| Symptom | Where to look |
|---|---|
| `pnpm probe:smoke` reports 500s | `pnpm stack:logs api`, then `pnpm stack:follow api` to reproduce live |
| New prisma migration didn't apply | `pnpm stack:bridge` → look for `migration.applied` event with success=false |
| Edited `apps/api/.env` and api still uses old value | `pnpm stack:bridge` → look for `env.applied`. If absent, the bridge isn't watching that path (check `panel.config.json` env.files) |
| Bumped a dep and stack didn't rebuild | `pnpm stack:bridge` → look for `rebuild.started`. If absent, content-hash dedupe likely skipped a no-op write. If present but `success=false`, scroll `stderrTail` for the real error |
| Bridge log shows nothing for minutes | Bridge died. Check `cat .bridge.pid && ps -p $(cat .bridge.pid)`. Re-spawn: `bash scripts/stack-up-docker.sh` (idempotent — only respawns if PID is stale) |
| Container keeps restarting | `pnpm stack:logs <service>` then if needed `pnpm stack:follow <service>` to catch the crash on next loop |

## Anti-patterns

- DO NOT pipe `docker compose logs` through `tail -40` then grep — you'll miss the real error which is usually mid-output. Use `pnpm stack:logs`.
- DO NOT add a `timeout` wrapper to `pnpm stack:follow` — Ctrl-C is the exit signal.
- DO NOT use `docker logs <container-name>` directly — container names change on recreate. Always use the `pnpm stack:*` helpers which derive the project name from your worktree.
- DO NOT manually run `docker compose up --build` from inside your worker worktree. The bridge handles rebuild on lockfile change. To force one, edit `pnpm-lock.yaml` (any byte change) and the bridge picks it up within 500ms.

## When the bridge itself is broken

If `.bridge.log` shows JSON parse errors or capability list is empty:

1. `cat .bridge.log | tail -50` — read the last batch.
2. `kill $(cat .bridge.pid) 2>/dev/null; rm -f .bridge.pid` — clear stale state.
3. `bash scripts/stack-up-docker.sh` — idempotent: spawns a fresh bridge.

Bridge code at `workspace-dev/scripts/panel-bridge.mjs`. Node-stdlib only — no npm deps. Contract in `workspace-dev/scripts/panel-bridge.README.md`.
