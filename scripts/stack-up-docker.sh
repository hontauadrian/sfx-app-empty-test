#!/usr/bin/env bash
# Docker variant of stack:up. Spawns per-worktree docker compose stacks with
# unique port allocations so multiple builders can run in parallel inside the
# panel container without colliding. Uses the same Stack-ready / first-ERROR
# contract as scripts/stack-up.sh so callers (and the agent prompt) treat
# both variants identically.
#
# Port plan: deterministic from worktree basename. PG = 6000+hash, API =
# 16000+hash, WEB = 26000+hash (matches scripts/worktree-stack.sh ranges).
# Project name = app-<basename> so docker compose treats parallel worktrees
# as independent stacks.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd -P)"
LOG="$PROJECT_DIR/.stack.start.log"
cd "$PROJECT_DIR"

# Source compose env (POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB / JWT_SECRET).
# Without this, every per-worker stack would default to `app/app/app_db`
# while the primary uses whatever the operator put in `.env` — migrations
# that hard-code `sfx_db` would then 500 in worker stacks. `set -a` exports
# every assignment so docker compose picks them up.
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$PROJECT_DIR/.env"
  set +a
fi

basename_dir="$(basename "$PROJECT_DIR")"
hash_value="$(printf '%s' "$basename_dir" | cksum | awk '{print $1}')"
index=$(( hash_value % 1000 ))

# Hash-based port assignment: deterministic per worktree name so the same
# worker always lands on the same ports across restarts (easier to debug).
# Collision is theoretically possible (~0.1% with a 1000-port window), so
# walk the candidate forward until each port is free. Bash `read` against
# `/dev/tcp/<host>/<port>` is the lightest probe available without pulling
# in nc/lsof — succeeds when the port is in use, fails (with timeout=1)
# when nothing answers. Bound the walk so a saturated host eventually
# errors out instead of looping forever.
find_free_port() {
  local start="$1"
  local max="$2"
  local probe="$start"
  while [ "$probe" -lt "$max" ]; do
    if ! (echo > "/dev/tcp/127.0.0.1/${probe}") 2>/dev/null; then
      echo "$probe"
      return 0
    fi
    probe=$(( probe + 1 ))
  done
  echo "ERROR: no free port between $start and $max" >&2
  return 1
}

PG_PORT="${PG_PORT:-$(find_free_port "$(( 6000 + index ))" 6999)}"
API_PORT="${API_PORT:-$(find_free_port "$(( 16000 + index ))" 16999)}"
NEXT_PORT="${NEXT_PORT:-$(find_free_port "$(( 26000 + index ))" 26999)}"
export PG_PORT API_PORT NEXT_PORT
PROJECT_NAME="${PROJECT_NAME:-app-${basename_dir}}"

# Guard against worker worktrees hijacking the host-side main-app compose
# project. The "main" stack runs against the unmerged-from-main shared
# workspace (the directory humans see on the standard host ports), and is
# managed under a dedicated project name (default `app-dev-host`, override
# with $APP_DEV_PROJECT). Worker worktrees must NEVER claim that project
# name — doing so rewrites the bind mounts of the main stack's containers
# to point at the worktree, so the merged code on the workspace's default
# branch stops being reflected on the main stack.
APP_DEV_PROJECT_RESERVED="${APP_DEV_PROJECT:-app-dev-host}"
case "$PROJECT_DIR" in
  */.overstory/worktrees/*)
    if [ "$PROJECT_NAME" = "$APP_DEV_PROJECT_RESERVED" ]; then
      echo "ERROR: refusing to run stack:up for worker worktree under PROJECT_NAME=$APP_DEV_PROJECT_RESERVED." >&2
      echo "       That project name is reserved for the host-side main app stack." >&2
      echo "       Worker worktrees must use a unique project (default: app-${basename_dir})." >&2
      echo "       Override PROJECT_NAME or APP_DEV_PROJECT if you intentionally want a different layout." >&2
      exit 1
    fi
    ;;
esac

# Per-worker panel bridge spawn. The panel-side bridge runs against the
# connected workspace + `app-dev-host`; this one is scoped to THIS worktree
# + THIS compose project, so prisma migrations / env edits / lockfile bumps
# inside the worktree auto-apply to the worker's stack instead of waiting
# for merge. Idempotent: skip if a live PID is already on disk. Graceful
# no-op when `node` is missing (non-Node panel images).
spawn_worker_bridge() {
  local bridge_script="$PROJECT_DIR/scripts/panel-bridge.mjs"
  local pid_file="$PROJECT_DIR/.bridge.pid"
  local log_file="$PROJECT_DIR/.bridge.log"
  if [ ! -f "$bridge_script" ]; then
    echo "[stack-up-docker] panel-bridge.mjs not found at $bridge_script - skipping bridge spawn" | tee -a "$LOG"
    return 0
  fi
  if ! command -v node >/dev/null 2>&1; then
    echo "[stack-up-docker] node not on PATH - skipping bridge spawn" | tee -a "$LOG"
    return 0
  fi
  if [ -f "$pid_file" ]; then
    local existing_pid
    existing_pid="$(cat "$pid_file" 2>/dev/null || echo '')"
    if [ -n "$existing_pid" ] && kill -0 "$existing_pid" 2>/dev/null; then
      echo "[stack-up-docker] bridge already running (pid ${existing_pid}) - skipping spawn" | tee -a "$LOG"
      return 0
    fi
    rm -f "$pid_file"
  fi
  PANEL_BRIDGE_WORKSPACE="$PROJECT_DIR" \
  PANEL_BRIDGE_COMPOSE_PROJECT="$PROJECT_NAME" \
    nohup node "$bridge_script" \
      > "$log_file" 2>&1 &
  local spawned_pid=$!
  echo "$spawned_pid" > "$pid_file"
  echo "[stack-up-docker] spawned panel-bridge (pid ${spawned_pid}) -> ${log_file}" | tee -a "$LOG"
}

echo "[stack-up-docker] Project=${PROJECT_NAME} PG=${PG_PORT} API=${API_PORT} WEB=${NEXT_PORT}" | tee "$LOG"

BUILD_FLAG=""
FORCE_RECREATE_FLAG=""
SKIP_INSTALL=""
for arg in "$@"; do
  case "$arg" in
    --rebuild|--build|reset|force) BUILD_FLAG="--build" ;;
    --env-recreate) FORCE_RECREATE_FLAG="--force-recreate" ;;
  esac
done
if [ "${SFX_PRIMARY_STACK:-0}" = "1" ]; then
  SKIP_INSTALL="1"
fi
running_count="$(docker compose -p "$PROJECT_NAME" ps --format json 2>/dev/null | grep -c '"State":"running"' || true)"
expected_count="$(docker compose -f "$PROJECT_DIR/docker-compose.yml" config --services 2>/dev/null | wc -l | awk '{print $1}')"
if [ -z "$BUILD_FLAG" ] && [ -z "$FORCE_RECREATE_FLAG" ] && [ "${running_count:-0}" -ge "${expected_count:-0}" ] && [ "${expected_count:-0}" -gt 0 ]; then
  echo "Stack already running (all green) on $PROJECT_NAME (${running_count}/${expected_count} services)" | tee -a "$LOG"
  echo ""
  echo "  Note: stack was already running - no re-init."
  echo "  If you edited prisma schema, migrations, or seed files, run:"
  echo "      pnpm stack:reset && pnpm stack:up"
  STATE_HEALTH_HOST="host.docker.internal"
  if ! [ -f /.dockerenv ]; then
    STATE_HEALTH_HOST="localhost"
  fi
  ACTUAL_PG_PORT="$(docker compose -p "$PROJECT_NAME" port postgres 5432 2>/dev/null | awk -F: 'END{print $NF}')"
  ACTUAL_API_PORT="$(docker compose -p "$PROJECT_NAME" port api 3001 2>/dev/null | awk -F: 'END{print $NF}')"
  ACTUAL_WEB_PORT="$(docker compose -p "$PROJECT_NAME" port web 3000 2>/dev/null | awk -F: 'END{print $NF}')"
  ACTUAL_PG_PORT="${ACTUAL_PG_PORT:-$PG_PORT}"
  ACTUAL_API_PORT="${ACTUAL_API_PORT:-$API_PORT}"
  ACTUAL_WEB_PORT="${ACTUAL_WEB_PORT:-$NEXT_PORT}"
  cat > "$PROJECT_DIR/.stack.json" <<JSON
{
  "pg_port": ${ACTUAL_PG_PORT},
  "api_port": ${ACTUAL_API_PORT},
  "web_port": ${ACTUAL_WEB_PORT},
  "host": "${STATE_HEALTH_HOST}",
  "is_worktree": true,
  "compose_project": "${PROJECT_NAME}",
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "reused": true
}
JSON
  spawn_worker_bridge
  exit 0
fi

# When this script runs inside the SFX panel container, the docker daemon
# we talk to lives on the host (DooD via the mounted /var/run/docker.sock).
# Daemon resolves bind-mount sources on the HOST filesystem, but the compose
# file's paths (`./apps/web/src` etc.) are panel-container-relative. They
# point at `/workspace/...`, which has no equivalent on the host because
# `/workspace` itself is a bind mount.
#
# Solution: generate a compose override that re-maps every bind source to
# its host-absolute path. The panel's `docker-compose.override.yml` exposes
# `SFX_HOST_WORKSPACE_PATH` (= host-absolute path of `workspace-dev/`), so
# we can compute the worker worktree's host path and rewrite the volumes
# block with `!override`. This keeps hot-reload working: the daemon binds
# the source files on the host fs into the running container, so any code
# change the agent makes in its worktree is reflected immediately by
# `next dev` / `nest --watch` instead of requiring a `pnpm stack:reset`.
COMPOSE_OVERLAY_ARG=""
if [ -f /.dockerenv ]; then
  if [ -n "${SFX_HOST_WORKSPACE_PATH:-}" ]; then
    HOST_WORKTREE_PATH="${SFX_HOST_WORKSPACE_PATH}/.overstory/worktrees/${basename_dir}"
    # If the worker is launched at the workspace root itself (the entrypoint
    # path used by the operator's host-side `pnpm stack:up`), the compose
    # bind sources should resolve straight to the workspace root.
    if [ "$PROJECT_DIR" = "/workspace" ]; then
      HOST_WORKTREE_PATH="${SFX_HOST_WORKSPACE_PATH}"
    fi
    OVERRIDE_FILE="$(mktemp -t stack-up-docker-override-XXXXXX.yml)"
    # Generic transform: ask `docker compose config` for the fully-resolved
    # compose model, walk every service's volumes, and rewrite each bind
    # source that begins with the panel-container worktree path to its
    # host-absolute equivalent. Works for any shape of app — agnostic to
    # whether the boilerplate has `apps/web`, `services/api`, a flat
    # `src/`, or anything else. Anonymous volumes, named volumes, and
    # volume-mode entries are passed through untouched.
    docker compose -f "$PROJECT_DIR/docker-compose.yml" config --format json 2>/dev/null \
      | bun --eval "
        const fs = require('fs');
        const cfg = JSON.parse(fs.readFileSync(0, 'utf8'));
        const panelRoot = process.argv[1];
        const hostRoot = process.argv[2];
        const services = cfg.services ?? {};
        const escape = (value) => {
          if (typeof value !== 'string') return JSON.stringify(value);
          if (value === '' || /[\\s:#\\[\\]{},&*?!|>'\"%@\`\\\\]/.test(value)) {
            return JSON.stringify(value);
          }
          return value;
        };
        // Preserve EVERY volume entry — bind, named, anonymous, tmpfs — so we
        // don't drop docker.sock or pgdata when rewriting. Only the bind
        // entries whose source begins with the panel-container worktree path
        // get re-pointed at the host filesystem; all other options
        // (read_only, consistency, propagation, …) flow through unchanged.
        const lines = ['services:'];
        for (const [name, svc] of Object.entries(services)) {
          const vols = Array.isArray(svc.volumes) ? svc.volumes : [];
          if (vols.length === 0) continue;
          lines.push('  ' + name + ':');
          lines.push('    volumes: !override');
          for (const vol of vols) {
            if (typeof vol === 'string') {
              lines.push('      - ' + escape(vol));
              continue;
            }
            if (typeof vol !== 'object' || vol === null) continue;
            const entry = { ...vol };
            if (entry.type === 'bind' && typeof entry.source === 'string' && entry.source) {
              if (entry.source === panelRoot) {
                entry.source = hostRoot;
              } else if (entry.source.startsWith(panelRoot + '/')) {
                entry.source = hostRoot + entry.source.slice(panelRoot.length);
              }
            }
            lines.push('      - ' + escape(entry.type ?? 'bind'));
            const objLines = ['        type: ' + escape(entry.type ?? 'bind')];
            if (entry.source) objLines.push('        source: ' + escape(entry.source));
            if (entry.target) objLines.push('        target: ' + escape(entry.target));
            if (entry.read_only) objLines.push('        read_only: true');
            if (entry.consistency) objLines.push('        consistency: ' + escape(entry.consistency));
            if (entry.bind && entry.bind.propagation) {
              objLines.push('        bind:');
              objLines.push('          propagation: ' + escape(entry.bind.propagation));
            }
            // Replace the placeholder type-only line with the full long-form block.
            lines.pop();
            lines.push('      -');
            for (const objLine of objLines) lines.push(objLine);
          }
        }
        process.stdout.write(lines.join('\\n') + '\\n');
      " "$PROJECT_DIR" "$HOST_WORKTREE_PATH" > "$OVERRIDE_FILE"
    COMPOSE_OVERLAY_ARG="-f $OVERRIDE_FILE"
    trap 'rm -f "$OVERRIDE_FILE"' EXIT
  else
    # SFX_HOST_WORKSPACE_PATH not provided — fall back to the
    # bind-mount-stripping overlay used by app-primary so the stack at
    # least starts (no hot-reload, but probes still pass).
    SOCKET_OVERLAY="/app/infra/docker-compose.app-primary-from-socket-overlay.yml"
    if [ -f "$SOCKET_OVERLAY" ]; then
      COMPOSE_OVERLAY_ARG="-f $SOCKET_OVERLAY"
    fi
  fi
fi

NEEDS_INSTALL=0
if [ -z "$SKIP_INSTALL" ]; then
  [ ! -d "$PROJECT_DIR/node_modules" ] && NEEDS_INSTALL=1
  [ ! -f "$PROJECT_DIR/node_modules/.bin/tsc" ] && NEEDS_INSTALL=1
  [ ! -f "$PROJECT_DIR/node_modules/.bin/prisma" ] && NEEDS_INSTALL=1
fi
if [ "$NEEDS_INSTALL" = "1" ]; then
  echo "[stack-up-docker] Installing worktree dependencies (pnpm, devDeps included)..." | tee -a "$LOG"
  # `--config.confirm-modules-purge=false` skips pnpm's interactive
  # "modules directories will be removed and reinstalled from scratch.
  # Proceed?" prompt that fires when the existing node_modules layout
  # disagrees with the lockfile (common after a fresh seed where the
  # pnpm-store inherits state from the boilerplate clone). Without
  # this flag pnpm hangs forever on stdin in non-interactive contexts
  # (panel UI Save → restart, CI, anywhere stdin is closed) and the
  # whole stack:up appears to silently fail.
  if ! (cd "$PROJECT_DIR" && NODE_ENV=development pnpm install --frozen-lockfile --prefer-offline --config.confirm-modules-purge=false 2>&1) | tee -a "$LOG"; then
    echo "ERROR: pnpm install failed in $PROJECT_DIR" | tee -a "$LOG"
    exit 1
  fi
fi

# Discover workspace packages from pnpm-workspace.yaml so adding a new
# package doesn't require touching this script. The list of names is
# emitted to stdout, one `<name>:<dist-relpath>` pair per line, by a
# `--list` mode of the same generator that produces the dist mount
# overlay below.
SHARED_PACKAGES_LIST="$(cd "$PROJECT_DIR" && node scripts/generate-stack-mounts.mjs --list 2>/dev/null || true)"
SHARED_BUILD_NEEDED=0
while IFS=: read -r pkg_name pkg_dist; do
  [ -z "$pkg_name" ] && continue
  if [ -d "$PROJECT_DIR/$(dirname "$pkg_dist")" ] && [ ! -f "$PROJECT_DIR/$pkg_dist/index.js" ]; then
    SHARED_BUILD_NEEDED=1
    break
  fi
done <<< "$SHARED_PACKAGES_LIST"
if [ "$SHARED_BUILD_NEEDED" = "1" ]; then
  echo "[stack-up-docker] Building shared packages..." | tee -a "$LOG"
  while IFS=: read -r pkg_name pkg_dist; do
    [ -z "$pkg_name" ] && continue
    if ! (cd "$PROJECT_DIR" && pnpm --filter "$pkg_name" build 2>&1) | tee -a "$LOG"; then
      echo "ERROR: shared package build failed for $pkg_name" | tee -a "$LOG"
      exit 1
    fi
  done <<< "$SHARED_PACKAGES_LIST"
fi

# Generate the dist-mount overlay so a `stack:reload-api` after a
# `pnpm --filter X build` propagates the new dist into the container
# without rebuilding the image. The overlay is regenerated every
# stack:up so the mount list always matches the current workspace
# state — newly added packages are picked up automatically.
if ! (cd "$PROJECT_DIR" && node scripts/generate-stack-mounts.mjs 2>&1) | tee -a "$LOG"; then
  echo "ERROR: failed to generate dist-mount overlay" | tee -a "$LOG"
  exit 1
fi
MOUNTS_OVERLAY="$PROJECT_DIR/docker-compose.mounts.generated.yml"
if [ -f "$MOUNTS_OVERLAY" ]; then
  if [ -n "$COMPOSE_OVERLAY_ARG" ]; then
    COMPOSE_OVERLAY_ARG="$COMPOSE_OVERLAY_ARG -f $MOUNTS_OVERLAY"
  else
    COMPOSE_OVERLAY_ARG="-f $MOUNTS_OVERLAY"
  fi
fi

if [ -n "$BUILD_FLAG" ]; then
  echo "[stack-up-docker] Building + starting compose project ${PROJECT_NAME} (rebuild requested)..." | tee -a "$LOG"
else
  echo "[stack-up-docker] Starting compose project ${PROJECT_NAME} (using cached images)..." | tee -a "$LOG"
fi
# shellcheck disable=SC2086 -- COMPOSE_OVERLAY_ARG is intentionally word-split
docker compose -p "$PROJECT_NAME" -f "$PROJECT_DIR/docker-compose.yml" $COMPOSE_OVERLAY_ARG up -d $BUILD_FLAG $FORCE_RECREATE_FLAG 2>&1 | tee -a "$LOG"

# Inside the panel container the worker stack lives on the HOST docker
# daemon's bridge — its published ports bind to the host's loopback, not
# the panel container's. From the panel we reach them via
# `host.docker.internal` (Docker Desktop exposes this hostname; Linux
# Docker would use the gateway IP). The same hostname falls through to
# `localhost` on the host shell, so this single probe address works for
# both `pnpm stack:up` callers (operators on the host) and ov agents
# running inside the panel container.
HEALTH_HOST="host.docker.internal"
if ! [ -f /.dockerenv ]; then
  HEALTH_HOST="localhost"
fi

echo "[stack-up-docker] Waiting for API health on http://${HEALTH_HOST}:${API_PORT}/api/docs-json..." | tee -a "$LOG"
# probe:smoke's preflight checks the API's /api/docs-json endpoint on api_port.
# Without this wait the script returned as soon as the WEB port responded
# (Next.js boots first) — but builders run probe:smoke immediately after
# `pnpm stack:up` returns and the probe failed with
# `PROBE_INTERNAL_ERROR:preflight:stack not started` because Nest/api was
# still bootstrapping. Builder then writes a red `.http-smoke.json`,
# `worker-done-evidence` blocks worker_done, lead can't merge — a full
# round-trip wasted on a startup race the script could have absorbed.
api_ready=0
for attempt in $(seq 1 60); do
  if curl -sf --connect-timeout 2 --max-time 5 "http://${HEALTH_HOST}:${API_PORT}/api/docs-json" > /dev/null 2>&1; then
    api_ready=1
    break
  fi
  sleep 1
done
if [ "$api_ready" != "1" ]; then
  echo "WARN: api on ${HEALTH_HOST}:${API_PORT} did not respond to /api/docs-json within 60s — probe:smoke is likely to fail preflight" | tee -a "$LOG"
fi

echo "[stack-up-docker] Waiting for web health on http://${HEALTH_HOST}:${NEXT_PORT}..." | tee -a "$LOG"
for attempt in $(seq 1 60); do
  if curl -sf --connect-timeout 2 --max-time 5 "http://${HEALTH_HOST}:${NEXT_PORT}/" > /dev/null 2>&1; then
    pg_user="${POSTGRES_USER:-app}"
    pg_db="${POSTGRES_DB:-app_db}"
    pg_pass="${POSTGRES_PASSWORD:-app}"
    pg_ready=0
    # Use docker compose exec instead of a host psql client. The panel
    # container does not ship postgresql-client, so the previous host-
    # psql check always failed silently and made stack:up exit non-zero
    # even when the DB was actually fine. Running psql inside the
    # postgres container itself (already on PATH there) is portable
    # across host environments and avoids that dependency.
    for pg_attempt in $(seq 1 60); do
      if docker compose -p "$PROJECT_NAME" exec -T postgres \
        env PGPASSWORD="$pg_pass" \
        psql -U "$pg_user" -d "$pg_db" -c 'SELECT 1' >/dev/null 2>&1; then
        pg_ready=1
        break
      fi
      sleep 1
    done
    if [ "$pg_ready" != "1" ]; then
      # Don't hard-exit: containers and HTTP health are up, this is just
      # the readiness probe timing out (docker-in-docker exec from the
      # panel can be slow on first boot). Hard-exiting here skipped the
      # bridge spawn below, leaving the worktree without auto-migrate so
      # the builder hit a P1002 advisory-lock timeout when running a
      # manual `prisma migrate deploy`. The bridge tolerates a not-ready
      # DB on startup and retries migrations on its own poll, so let it
      # take over instead of aborting.
      echo "WARN: postgres on ${HEALTH_HOST}:${PG_PORT} accepted curl health but rejected SELECT 1 within 60s — bridge will converge async" | tee -a "$LOG"
      docker compose -p "$PROJECT_NAME" logs --tail 40 postgres 2>&1 | tee -a "$LOG"
    fi
    # Run db:seed if the project declares it. Idempotent (upsert) — safe
    # to call on every stack:up. Without this, contract-flow probes that
    # need to log in as a seeded actor (auth-bootstrap-*, etc.) hit 401
    # against a freshly migrated but empty users table and the agent
    # spends iterations guessing why login fails.
    # Skip if pg_ready=0: seeding against a not-yet-ready DB would just
    # error; bridge will converge once DB is up and a future stack:up
    # call (or the bridge's own poll) can re-run seed.
    # Export the correct DATABASE_URL for this worktree's compose project
    # so `pnpm db:seed` / `db:migrate:deploy` reach the right postgres.
    # apps/api/.env ships with a default localhost URL (for local dev) but
    # per-worktree stacks bind postgres on a hashed port via OrbStack /
    # Docker Desktop and use compose-project credentials, not the boilerplate
    # defaults. process.env beats .env in Prisma's loader, so this export
    # wins for the immediate stack:up call. Agents historically spent hours
    # re-discovering the right URL.
    WORKTREE_DATABASE_URL="postgresql://${pg_user}:${pg_pass}@${HEALTH_HOST}:${PG_PORT}/${pg_db}"
    export DATABASE_URL="$WORKTREE_DATABASE_URL"
    echo "[stack-up-docker] DATABASE_URL=postgresql://${pg_user}:***@${HEALTH_HOST}:${PG_PORT}/${pg_db}" | tee -a "$LOG"
    # Persist for any LATER `pnpm db:seed` / `db:migrate:deploy` an agent
    # invokes from its own shell. Prisma's loader uses plain `dotenv` (not
    # dotenv-flow), so `.env.local` is ignored and only `.env` is read,
    # and the file must live in the schema's directory (packages/database)
    # — apps/api/.env is irrelevant for the seed/migrate path. Write a
    # gitignored `packages/database/.env` so prisma resolves
    # DATABASE_URL on every later invocation. Without this, builders
    # re-discover the right URL on every iteration and frequently get
    # blocked by the bash-allowlist when trying to `export` it manually.
    if [ -d "$PROJECT_DIR/packages/database" ]; then
      DB_ENV_FILE="$PROJECT_DIR/packages/database/.env"
      # Upsert DATABASE_URL only — preserve any other vars an operator or
      # downstream tool may have added. If the file is missing, create it
      # with just this var. If DATABASE_URL exists, replace its line. If
      # not, append.
      if [ ! -f "$DB_ENV_FILE" ]; then
        echo "DATABASE_URL=$WORKTREE_DATABASE_URL" > "$DB_ENV_FILE"
      elif grep -q '^DATABASE_URL=' "$DB_ENV_FILE"; then
        # Use a temp file to avoid in-place edit portability issues across
        # GNU/BSD sed. The escaped URL keeps any `&` or `/` from breaking
        # the substitution.
        escaped_url="$(printf '%s' "$WORKTREE_DATABASE_URL" | sed -e 's/[\/&]/\\&/g')"
        sed "s|^DATABASE_URL=.*|DATABASE_URL=${escaped_url}|" "$DB_ENV_FILE" > "$DB_ENV_FILE.tmp" \
          && mv "$DB_ENV_FILE.tmp" "$DB_ENV_FILE"
      else
        echo "DATABASE_URL=$WORKTREE_DATABASE_URL" >> "$DB_ENV_FILE"
      fi
      echo "[stack-up-docker] upserted DATABASE_URL in packages/database/.env" | tee -a "$LOG"
    fi

    # Also upsert apps/api/.env. NestJS boots via dotenv from apps/api at
    # runtime (and during integration tests), and the seeded file ships with
    # `localhost:6651` which is wrong inside the panel container — the host
    # Postgres is reachable as `host.docker.internal` from there. Without
    # this, every builder hits the wall when running `pnpm --filter @sfx/api
    # test:integration` and burns 30+ minutes diagnosing connection refused.
    if [ -d "$PROJECT_DIR/apps/api" ]; then
      API_ENV_FILE="$PROJECT_DIR/apps/api/.env"
      if [ ! -f "$API_ENV_FILE" ]; then
        # Seed from .env.example if present so we don't drop JWT secrets etc.
        if [ -f "$PROJECT_DIR/apps/api/.env.example" ]; then
          cp "$PROJECT_DIR/apps/api/.env.example" "$API_ENV_FILE"
        else
          : > "$API_ENV_FILE"
        fi
      fi
      if grep -q '^DATABASE_URL=' "$API_ENV_FILE"; then
        escaped_url="$(printf '%s' "$WORKTREE_DATABASE_URL" | sed -e 's/[\/&]/\\&/g')"
        sed "s|^DATABASE_URL=.*|DATABASE_URL=${escaped_url}|" "$API_ENV_FILE" > "$API_ENV_FILE.tmp" \
          && mv "$API_ENV_FILE.tmp" "$API_ENV_FILE"
      else
        echo "DATABASE_URL=$WORKTREE_DATABASE_URL" >> "$API_ENV_FILE"
      fi
      echo "[stack-up-docker] upserted DATABASE_URL in apps/api/.env" | tee -a "$LOG"
    fi
    if [ "$pg_ready" = "1" ] \
      && command -v pnpm >/dev/null 2>&1 \
      && [ -f "$PROJECT_DIR/package.json" ] \
      && pnpm --silent --dir "$PROJECT_DIR" run 2>/dev/null | grep -q '^  db:seed$'; then
      echo "[stack-up-docker] running pnpm db:seed (idempotent)..." | tee -a "$LOG"
      if ! (cd "$PROJECT_DIR" && pnpm db:seed >> "$LOG" 2>&1); then
        echo "WARNING: pnpm db:seed exited non-zero — bootstrap actor flows may fail" | tee -a "$LOG"
      fi
    fi

    # Verify every actor email referenced by a login-style step in
    # _shared.json contract flows actually exists in the seeded DB.
    # When a single seed user is missing, contract-flow chain probes
    # cascade-fail with 24+ FLOW_STEP_FAILED entries rooted in one
    # 401 — agents historically spent hours tracing the cascade. The
    # verifier prints an explicit "seed missing actor X" warning before
    # the agent ever runs probe:smoke. Non-fatal: warning only, exit 0.
    if [ "$pg_ready" = "1" ] && [ -f "$PROJECT_DIR/scripts/verify-seed-actors.mjs" ]; then
      PANEL_BRIDGE_COMPOSE_PROJECT="$PROJECT_NAME" \
        POSTGRES_USER="${POSTGRES_USER:-app}" \
        POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-app}" \
        POSTGRES_DB="${POSTGRES_DB:-app_db}" \
        node "$PROJECT_DIR/scripts/verify-seed-actors.mjs" "$PROJECT_DIR" 2>&1 | tee -a "$LOG"
    fi

    echo "=== Stack ready ===" | tee -a "$LOG"
    echo "    web: http://${HEALTH_HOST}:${NEXT_PORT}" | tee -a "$LOG"
    echo "    api: http://${HEALTH_HOST}:${API_PORT}" | tee -a "$LOG"
    echo "    pg:  ${HEALTH_HOST}:${PG_PORT}" | tee -a "$LOG"
    cat > "$PROJECT_DIR/.stack.json" <<JSON
{
  "pg_port": ${PG_PORT},
  "api_port": ${API_PORT},
  "web_port": ${NEXT_PORT},
  "host": "${HEALTH_HOST}",
  "is_worktree": true,
  "compose_project": "${PROJECT_NAME}",
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON
    spawn_worker_bridge
    exit 0
  fi
  sleep 2
done

echo "ERROR: stack did not become ready on http://${HEALTH_HOST}:${NEXT_PORT}/ within 120s" | tee -a "$LOG"
docker compose -p "$PROJECT_NAME" logs --tail 80 2>&1 | tee -a "$LOG"
exit 1
