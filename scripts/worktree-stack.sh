#!/usr/bin/env bash
# scripts/worktree-stack.sh
#
# Starts/stops an isolated dev stack fully locally — no Docker.
# Each worktree gets its own PostgreSQL instance (own data dir, own port),
# NestJS API, and NextJS frontend — all on unique ports.
#
# Requires: brew install postgresql@16 (just the binaries, no service needed)
#
# Port ranges (worktrees only — main repo uses default ports):
#   PG:  6000–15999
#   API: 16000–25999
#   WEB: 26000–35999
#
# Usage:
#   ./scripts/worktree-stack.sh start   # Start PG + API + Web
#   ./scripts/worktree-stack.sh stop    # Stop everything, cleanup
#   ./scripts/worktree-stack.sh ports   # Print computed ports (JSON)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd -P)"
STACK_FILE="$PROJECT_DIR/.stack.json"
PG_DATA_DIR="$PROJECT_DIR/.pgdata"
TURBO_WATCH_PID_FILE="$PROJECT_DIR/.turbo-watch.pid"
TURBO_WATCH_LOG="$PROJECT_DIR/.turbo-watch.log"
START_PID_FILE="$PROJECT_DIR/.stack.starting.pid"
START_LOG="$PROJECT_DIR/.stack.start.log"

if [ -f /.dockerenv ]; then
  DB_HOST_FOR_TOOLING="host.docker.internal"
else
  DB_HOST_FOR_TOOLING="localhost"
fi

# ── Find PostgreSQL binaries ───────────────────────────────────────

find_pg_bin() {
  local pg_bin=""

  # Check brew postgresql@16
  if [ -d "/opt/homebrew/opt/postgresql@16/bin" ]; then
    pg_bin="/opt/homebrew/opt/postgresql@16/bin"
  elif [ -d "/usr/local/opt/postgresql@16/bin" ]; then
    pg_bin="/usr/local/opt/postgresql@16/bin"
  # Check brew postgresql (unversioned)
  elif [ -d "/opt/homebrew/opt/postgresql/bin" ]; then
    pg_bin="/opt/homebrew/opt/postgresql/bin"
  elif [ -d "/usr/local/opt/postgresql/bin" ]; then
    pg_bin="/usr/local/opt/postgresql/bin"
  # Check if pg_ctl is in PATH
  elif command -v pg_ctl >/dev/null 2>&1; then
    pg_bin="$(dirname "$(command -v pg_ctl)")"
  fi

  if [ -z "$pg_bin" ] || [ ! -x "$pg_bin/pg_ctl" ]; then
    echo ""
    return 1
  fi

  echo "$pg_bin"
}

# ── Worktree detection ──────────────────────────────────────────────

is_worktree() {
  local git_dir git_common_dir
  git_dir=$(cd "$PROJECT_DIR" && git rev-parse --git-dir 2>/dev/null) || return 1
  git_common_dir=$(cd "$PROJECT_DIR" && git rev-parse --git-common-dir 2>/dev/null) || return 1
  git_dir=$(cd "$PROJECT_DIR" && cd "$git_dir" 2>/dev/null && pwd)
  git_common_dir=$(cd "$PROJECT_DIR" && cd "$git_common_dir" 2>/dev/null && pwd)
  [ "$git_dir" != "$git_common_dir" ]
}

# ── Port computation ────────────────────────────────────────────────

find_free_port() {
  local port=$1
  local max=$((port + 100))
  while [ "$port" -lt "$max" ] && lsof -i :"$port" -sTCP:LISTEN >/dev/null 2>&1; do
    port=$((port + 1))
  done
  echo "$port"
}

compute_ports() {
  if is_worktree; then
    local folder_name hash index
    folder_name=$(basename "$PROJECT_DIR")
    hash=$(echo -n "$folder_name" | cksum | awk '{print $1}')
    index=$((hash % 10000))

    PG_PORT=$(find_free_port $((6000 + index)))
    API_PORT=$(find_free_port $((16000 + index)))
    WEB_PORT=$(find_free_port $((26000 + index)))
    IN_WORKTREE=true
  else
    PG_PORT=5432
    API_PORT=3001
    WEB_PORT=3000
    IN_WORKTREE=false
  fi

  DB_NAME="sfx_db"
  DB_USER="sfx"
  DB_URL="postgresql://${DB_USER}@${DB_HOST_FOR_TOOLING}:${PG_PORT}/${DB_NAME}"
}

# ── Status helpers ─────────────────────────────────────────────────

# Query a service's state in a compose project. Prints: up | starting | stale | down
# Reads compose's own State/Health fields — declarative truth, not a probe.
# Args: $1 = compose project name, $2 = service name (postgres|api|web)
docker_compose_service_state() {
  local project=$1
  local service=$2
  local row
  row=$(docker compose -p "$project" ps "$service" --all --format json 2>/dev/null | head -n 1)
  if [ -z "$row" ]; then
    echo "down"
    return
  fi
  local state health
  state=$(echo "$row" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).State||'')}catch{console.log('')}})" 2>/dev/null)
  health=$(echo "$row" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).Health||'')}catch{console.log('')}})" 2>/dev/null)
  case "$state" in
    running)
      case "$health" in
        unhealthy)   echo "stale" ;;
        starting)    echo "starting" ;;
        *)           echo "up" ;;
      esac
      ;;
    restarting|created|paused) echo "starting" ;;
    exited|dead|removing)      echo "stale" ;;
    *)                         echo "down" ;;
  esac
}

# Probe a component. Prints one of: up | down | stale
# Args: $1 = component name (pg|api|web|turbo_watch), $2 = port (for pg/api/web)
component_status() {
  local name=$1
  local port=${2:-}
  case "$name" in
    pg)
      [ -z "$port" ] && { echo "down"; return; }
      local pg_bin
      pg_bin=$(find_pg_bin) || true
      if [ -n "$pg_bin" ] && "$pg_bin/pg_isready" -h localhost -p "$port" >/dev/null 2>&1; then
        echo "up"
      elif [ -f "$PG_DATA_DIR/postmaster.pid" ]; then
        echo "stale"
      else
        echo "down"
      fi
      ;;
    api)
      [ -z "$port" ] && { echo "down"; return; }
      if curl -sf "http://localhost:${port}/api/v1/health" >/dev/null 2>&1; then
        echo "up"
      elif lsof -i :"$port" -sTCP:LISTEN >/dev/null 2>&1; then
        echo "stale"
      else
        echo "down"
      fi
      ;;
    web)
      [ -z "$port" ] && { echo "down"; return; }
      if curl -sf "http://localhost:${port}" >/dev/null 2>&1; then
        echo "up"
      elif lsof -i :"$port" -sTCP:LISTEN >/dev/null 2>&1; then
        echo "stale"
      else
        echo "down"
      fi
      ;;
    turbo_watch)
      if [ -f "$TURBO_WATCH_PID_FILE" ]; then
        local pid
        pid=$(cat "$TURBO_WATCH_PID_FILE" 2>/dev/null | tr -d '[:space:]')
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
          echo "up"
        else
          echo "stale"
        fi
      else
        echo "down"
      fi
      ;;
  esac
}

# Returns 0 if every component reports "up", else 1.
stack_all_green() {
  if [ ! -f "$STACK_FILE" ]; then return 1; fi
  local pg_port api_port web_port
  pg_port=$(node -e "console.log(require('$STACK_FILE').pg_port || '')" 2>/dev/null)
  api_port=$(node -e "console.log(require('$STACK_FILE').api_port || '')" 2>/dev/null)
  web_port=$(node -e "console.log(require('$STACK_FILE').web_port || '')" 2>/dev/null)
  [ -z "$pg_port" ] || [ -z "$api_port" ] || [ -z "$web_port" ] && return 1
  [ "$(component_status pg "$pg_port")" = "up" ] || return 1
  [ "$(component_status api "$api_port")" = "up" ] || return 1
  [ "$(component_status web "$web_port")" = "up" ] || return 1
  # turbo_watch is advisory; don't block idempotent no-op on it.
  return 0
}

# ── Turbo watch (shared-package hot recompile) ─────────────────────

start_turbo_watch() {
  # Idempotent: no-op if a live watcher already exists.
  if [ "$(component_status turbo_watch)" = "up" ]; then
    return 0
  fi
  # Clear stale pid before spawning.
  rm -f "$TURBO_WATCH_PID_FILE" 2>/dev/null || true

  # turbo watch re-runs the `build` task on edits inside packages/*.
  # Nest picks up the compiled dist/ via symlinks; Next picks up src/ via
  # transpilePackages — so web doesn't actually need the rebuild, but it's
  # cheap and keeps behavior uniform for anything that does import from dist.
  (cd "$PROJECT_DIR" && \
    nohup pnpm turbo watch build --filter='./packages/*' \
      > "$TURBO_WATCH_LOG" 2>&1 &)

  # pnpm wraps turbo in several forks (pnpm → pnpm:exec → turbo → turbo-darwin-arm64).
  # $! from the subshell captures an intermediate wrapper that may exit quickly.
  # Wait briefly, then pgrep for the authoritative turbo binary PID.
  local tries=20 pid=""
  while [ $tries -gt 0 ]; do
    pid=$(pgrep -f "turbo watch build --filter=./packages/\*" | tail -n 1)
    [ -n "$pid" ] && break
    tries=$((tries - 1))
    sleep 0.1
  done
  if [ -n "$pid" ]; then
    echo "$pid" > "$TURBO_WATCH_PID_FILE"
  fi
}

stop_turbo_watch() {
  # Primary: pid file, if it exists.
  if [ -f "$TURBO_WATCH_PID_FILE" ]; then
    local pid
    pid=$(cat "$TURBO_WATCH_PID_FILE" 2>/dev/null | tr -d '[:space:]')
    if [ -n "$pid" ]; then
      kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    fi
    rm -f "$TURBO_WATCH_PID_FILE"
  fi
  # Fallback: pgrep for any surviving turbo watch wrapping our packages/* filter.
  # Catches pnpm → turbo → turbo-darwin-arm64 forks that pid-file tracking misses.
  # `|| true` guards against pgrep's exit 1 on no-match tripping `set -e`.
  local pids
  pids=$(pgrep -f "turbo watch build --filter=./packages/\*" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill 2>/dev/null || true
    sleep 0.3
    pids=$(pgrep -f "turbo watch build --filter=./packages/\*" 2>/dev/null || true)
    [ -n "$pids" ] && echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
}

# ── Start ───────────────────────────────────────────────────────────

preflight() {
  # Ensure apps/api/.env exists so Nest's ConfigModule has every var its
  # current schema requires (incl. ones added by a feature without updating
  # .env.example, e.g. JWT_REFRESH_SECRET). Sourcing in cmd_start already
  # merges .env.example, but a feature-added value only ever lives in .env.
  if [ ! -f "$PROJECT_DIR/apps/api/.env" ] && \
     [ -f "$PROJECT_DIR/apps/api/.env.example" ]; then
    cp "$PROJECT_DIR/apps/api/.env.example" "$PROJECT_DIR/apps/api/.env"
    echo "  preflight: seeded apps/api/.env from .env.example"
  fi

  # Validate apps/api/.env against the Zod schema in env.validation.ts and
  # synthesize any required vars that are missing from .env.example. This
  # catches the case where the validator declares a new required var (e.g.
  # JWT_REFRESH_SECRET) but .env.example wasn't updated — instead of the API
  # crashing 60s later inside boot with a cryptic "Required" error, we
  # patch the env now and tell the agent exactly what was added.
  if [ -f "$PROJECT_DIR/apps/api/.env" ] && \
     [ -f "$PROJECT_DIR/apps/api/src/config/env.validation.ts" ]; then
    local missing
    missing=$(node -e '
      const fs = require("fs");
      const path = require("path");
      const root = process.argv[1];
      const envFile = path.join(root, "apps/api/.env");
      const schemaFile = path.join(root, "apps/api/src/config/env.validation.ts");
      const env = {};
      for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m) env[m[1]] = m[2];
      }
      const schema = fs.readFileSync(schemaFile, "utf8");
      // Match each line like `  FOO_BAR: z.string()...` inside envSchema.
      const re = /^\s+([A-Z_][A-Z0-9_]*):\s*z\.([^,\n]+)/gm;
      const required = [];
      let m;
      while ((m = re.exec(schema)) !== null) {
        const name = m[1];
        const decl = m[2];
        // Skip vars with .default(...) — they are optional.
        if (/\.default\(/.test(decl)) continue;
        if (!(name in env) || env[name] === "") required.push(name);
      }
      console.log(required.join(" "));
    ' "$PROJECT_DIR" 2>/dev/null || true)

    if [ -n "$missing" ]; then
      echo "  preflight: env.validation.ts requires vars missing from .env: $missing"
      for var in $missing; do
        # Synthesize a min-16-char placeholder so Zod's .min(16) passes; the
        # developer/agent can replace it with a real value later.
        local val="auto-generated-$(date +%s)-$RANDOM-placeholder-min-16-chars"
        echo "$var=$val" >> "$PROJECT_DIR/apps/api/.env"
        echo "  preflight: appended $var=<placeholder> to apps/api/.env"
      done
      echo "  preflight: ⚠ ACTION FOR AGENT: add these vars to apps/api/.env.example so future worktrees seed them: $missing"
    fi
  fi

  # Guarantee the Prisma client is generated. Cheap when cached (~200ms).
  # Without this, AppModule.boot crashes on `this.$connect is not a function`
  # which kills both the static OpenAPI dump and the live Nest boot.
  if [ ! -f "$PROJECT_DIR/node_modules/@prisma/client/index.js" ]; then
    echo "  preflight: regenerating Prisma client"
    (cd "$PROJECT_DIR" && pnpm db:generate >/dev/null 2>&1) || true
  fi
}

cmd_start() {
  if [ -f "/.dockerenv" ] || [ "${SFX_PLATFORM:-}" = "1" ]; then
    exec bash "$SCRIPT_DIR/stack-up-docker.sh" "$@"
  fi

  local detach=false
  if [ "${1:-}" = "--detach" ]; then
    detach=true
  fi

  # Idempotent: if everything reports healthy, exit 0 without rework.
  if stack_all_green; then
    local pg_port api_port web_port
    pg_port=$(node -e "console.log(require('$STACK_FILE').pg_port)")
    api_port=$(node -e "console.log(require('$STACK_FILE').api_port)")
    web_port=$(node -e "console.log(require('$STACK_FILE').web_port)")
    echo "=== Stack already running (all green) ==="
    echo "  Frontend: http://localhost:$web_port"
    echo "  Backend:  http://localhost:$api_port/api/v1"
    echo "  Database: localhost:$pg_port"
    # Make sure the package watcher is up even if a previous run missed it.
    if [ "$(component_status turbo_watch)" != "up" ]; then
      echo "  (starting turbo watch for shared packages)"
      start_turbo_watch
    fi
    exit 0
  fi

  # Detach mode: if a start is already in flight, report it and exit.
  # Otherwise fork the foreground body as a background child, write its PID,
  # and return immediately so the caller can poll `status`.
  if [ "$detach" = true ]; then
    if [ -f "$START_PID_FILE" ]; then
      local prev_pid
      prev_pid=$(cat "$START_PID_FILE" 2>/dev/null | tr -d '[:space:]')
      if [ -n "$prev_pid" ] && kill -0 "$prev_pid" 2>/dev/null; then
        echo "=== Stack start already in progress (pid $prev_pid) ==="
        echo "  Poll: scripts/worktree-stack.sh status"
        echo "  Log:  $START_LOG"
        exit 0
      fi
      rm -f "$START_PID_FILE"
    fi
    echo "=== Spawning detached start ==="
    # setsid puts the child in its own session so it survives shell exit and
    # stop_turbo_watch's group-kill never targets the wrong pgid.
    nohup bash "$SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")" start \
      > "$START_LOG" 2>&1 < /dev/null &
    local child_pid=$!
    echo "$child_pid" > "$START_PID_FILE"
    echo "  pid:  $child_pid"
    echo "  log:  $START_LOG"
    echo "  poll: scripts/worktree-stack.sh status"
    exit 0
  fi

  # Foreground path from here on — guarantee the detach marker is cleared
  # even if we exit 1 below. Only clears this shell's own pid file.
  trap 'rm -f "$START_PID_FILE" 2>/dev/null || true' EXIT

  # Self-heal on dirty worktrees so an agent can call `stack:start` blindly
  # into any state. Main repo behaves as before to protect human-owned dev
  # data (seed records, in-progress test data).
  if [ -f "$STACK_FILE" ]; then
    if is_worktree; then
      echo "Stale .stack.json in worktree — auto-resetting (--hard)."
      cmd_reset --hard >/dev/null 2>&1 || true
    else
      echo "Stack already running (found .stack.json). Run 'stop' first."
      exit 1
    fi
  fi

  preflight

  # ── Worktree skill purge ──────────────────────────────────────────
  # Tracked .claude/skills/ entries (task-flow-authoring, shared-flow-authoring,
  # flow-failure-response) are coordinator/lead-only authoring guides. Worker
  # worktrees should never see them — workers don't author flows, the
  # flows-path-boundary.js hook blocks their writes anyway. Removing the dirs
  # here keeps them out of every fresh worktree's working tree without
  # untracking them in main. The deletion is uncommitted local state in the
  # worktree, ignored by daily ops.
  if is_worktree; then
    local purged=0
    for skill in task-flow-authoring shared-flow-authoring flow-failure-response; do
      if [ -d "$PROJECT_DIR/.claude/skills/$skill" ]; then
        rm -rf "$PROJECT_DIR/.claude/skills/$skill"
        purged=$((purged + 1))
      fi
    done
    if [ "$purged" -gt 0 ]; then
      echo "  worktree skill-purge: removed $purged coordinator-only skill dir(s) from .claude/skills/"
    fi
  fi

  # Find PostgreSQL binaries
  local pg_bin
  pg_bin=$(find_pg_bin) || true
  if [ -z "$pg_bin" ]; then
    echo "ERROR: PostgreSQL not found."
    echo ""
    echo "Install it with:  brew install postgresql@16"
    echo ""
    echo "You do NOT need to start a service. This script runs its own"
    echo "PostgreSQL instance per worktree with its own data directory."
    exit 1
  fi

  compute_ports

  echo "=== Starting stack (no Docker) ==="
  echo "  PG:  localhost:$PG_PORT (data: $PG_DATA_DIR)"
  echo "  API: localhost:$API_PORT"
  echo "  WEB: localhost:$WEB_PORT"
  echo ""

  # 1. Initialize PostgreSQL data directory if needed
  echo "[1/9] Setting up PostgreSQL..."
  if [ ! -d "$PG_DATA_DIR" ]; then
    "$pg_bin/initdb" -D "$PG_DATA_DIR" --username="$DB_USER" --auth=trust -E UTF8 --no-locale >/dev/null 2>&1
    echo "  Initialized data directory."
  else
    echo "  Data directory exists."
  fi

  # 2. Start PostgreSQL on the computed port
  # 2a. Use pg_ctl status (canonical PG liveness check — understands the pid
  # file format incl. negative-PID process-group encoding) to classify state.
  # Exit codes: 0 = server running, 3 = no server running, 4 = bad data dir.
  local pid_file="$PG_DATA_DIR/postmaster.pid"
  local pg_status_out pg_status_code=0
  pg_status_out=$("$pg_bin/pg_ctl" -D "$PG_DATA_DIR" status 2>&1) || pg_status_code=$?

  if [ "$pg_status_code" -eq 0 ]; then
    # Live postmaster. Adopt its port if readable, else keep our computed one.
    local existing_port
    existing_port=$(sed -n '4p' "$pid_file" 2>/dev/null | tr -d '[:space:]')
    if [ -n "$existing_port" ] && "$pg_bin/pg_isready" -h localhost -p "$existing_port" >/dev/null 2>&1; then
      echo "  Found live PostgreSQL on port $existing_port — reusing it."
      PG_PORT="$existing_port"
      DB_URL="postgresql://${DB_USER}@${DB_HOST_FOR_TOOLING}:${PG_PORT}/${DB_NAME}"
    else
      echo "  pg_ctl reports running but port $existing_port not responding — stopping it."
      "$pg_bin/pg_ctl" -D "$PG_DATA_DIR" -m immediate stop >/dev/null 2>&1 || true
      rm -f "$pid_file" "$PG_DATA_DIR/postmaster.opts" 2>/dev/null || true
    fi
  elif [ -f "$pid_file" ]; then
    # Stale pid file (pg_ctl status != 0 but file exists). Clean up.
    echo "  Found stale postmaster.pid (no live server) — removing."
    "$pg_bin/pg_ctl" -D "$PG_DATA_DIR" -m immediate stop >/dev/null 2>&1 || true
    rm -f "$pid_file" "$PG_DATA_DIR/postmaster.opts" 2>/dev/null || true
  fi

  # 2b. If the chosen port is bound by a non-PG process, pick a new free one.
  if lsof -i :"$PG_PORT" -sTCP:LISTEN >/dev/null 2>&1 \
     && ! "$pg_bin/pg_isready" -h localhost -p "$PG_PORT" >/dev/null 2>&1; then
    local old_port="$PG_PORT"
    PG_PORT=$(find_free_port $((PG_PORT + 1)))
    echo "  Port $old_port in use by another process — falling back to $PG_PORT."
    DB_URL="postgresql://${DB_USER}@${DB_HOST_FOR_TOOLING}:${PG_PORT}/${DB_NAME}"
  fi

  # 2c. Spawn only if we didn't already adopt an existing postmaster.
  if ! "$pg_bin/pg_isready" -h localhost -p "$PG_PORT" >/dev/null 2>&1; then
    echo "[2/9] Starting PostgreSQL on port $PG_PORT..."
    local pg_ctl_err
    # LC_ALL=C works around a macOS-ARM Postgres 16 init failure ("postmaster
    # became multithreaded during startup"); the DB itself is UTF-8 via initdb.
    if ! pg_ctl_err=$(LC_ALL=C "$pg_bin/pg_ctl" -D "$PG_DATA_DIR" -l "$PROJECT_DIR/.pg.log" \
        -o "-p $PG_PORT -k /tmp" \
        start 2>&1); then
      echo "  ERROR: pg_ctl start failed:"
      echo "  $pg_ctl_err" | sed 's/^/  /'
      echo "  --- .pg.log tail ---"
      tail -n 20 "$PROJECT_DIR/.pg.log" 2>/dev/null | sed 's/^/  /'
      exit 1
    fi

    # Wait for it
    local retries=30
    until "$pg_bin/pg_isready" -h localhost -p "$PG_PORT" >/dev/null 2>&1; do
      retries=$((retries - 1))
      if [ "$retries" -le 0 ]; then
        echo "  ERROR: PostgreSQL failed to become ready on port $PG_PORT."
        echo "  --- .pg.log tail ---"
        tail -n 20 "$PROJECT_DIR/.pg.log" 2>/dev/null | sed 's/^/  /'
        exit 1
      fi
      sleep 0.5
    done
  else
    echo "[2/9] PostgreSQL already ready on port $PG_PORT."
  fi
  echo "  PostgreSQL ready."

  # 3. Create database if it doesn't exist
  echo "[3/9] Creating database '${DB_NAME}'..."
  "$pg_bin/createdb" -h localhost -p "$PG_PORT" -U "$DB_USER" "$DB_NAME" 2>/dev/null || true
  echo "  Database ready."

  # 4. Install dependencies if needed
  if [ ! -d "$PROJECT_DIR/node_modules" ]; then
    echo "[4/9] Installing dependencies..."
    (cd "$PROJECT_DIR" && pnpm install --frozen-lockfile)
  else
    echo "[4/9] Dependencies already installed."
  fi

  # 5. Build shared packages (Node needs compiled JS at runtime, not raw TS)
  echo "[5/9] Building shared packages..."
  for pkg in @sfx/domain @sfx/shared @sfx/validation; do
    if ! (cd "$PROJECT_DIR" && pnpm --filter "$pkg" build 2>&1); then
      echo "ERROR: Failed to build $pkg. Aborting."
      exit 1
    fi
  done
  echo "  Packages built."

  # 6. Prisma generate + build database package + sync schema
  #
  # Schema-sync strategy (deterministic, no interactive prompts, no advisory
  # lock contention):
  #
  #   IF packages/database/prisma/migrations/ has migration files
  #     → `prisma migrate deploy`  (production-style, replays history)
  #   ELSE
  #     → `prisma db push --skip-generate --accept-data-loss`
  #       (dev/ephemeral, syncs schema without creating migration files,
  #        does NOT take an advisory lock)
  #
  # The previous logic ran `migrate deploy` then fell back to `migrate dev`.
  # Two latent bugs:
  #   (a) `migrate deploy` SILENTLY no-ops with "No migrations found" when the
  #       migrations folder doesn't exist (exit 0). The DB stays empty and the
  #       API boots against a schema-less database.
  #   (b) `migrate dev` without `--name` requires an interactive TTY to prompt
  #       for the migration name. In a non-TTY subshell it hangs while still
  #       holding the postgres advisory lock (id 72707369), causing later
  #       migrations to fail with P1002 "Timed out trying to acquire a
  #       postgres advisory lock" for 10s+. Repeated `--detach` boots stack
  #       multiple zombie migrate-dev processes, compounding the contention.
  echo "[6/9] Running Prisma generate + schema sync..."
  if ! (cd "$PROJECT_DIR" && DATABASE_URL="$DB_URL" pnpm db:generate 2>&1); then
    echo "ERROR: pnpm db:generate failed. Prisma client out of sync."
    exit 1
  fi
  if ! (cd "$PROJECT_DIR" && DATABASE_URL="$DB_URL" pnpm --filter @sfx/database build 2>&1); then
    echo "ERROR: Failed to build @sfx/database. Aborting."
    exit 1
  fi

  local migrations_dir="$PROJECT_DIR/packages/database/prisma/migrations"
  local has_migrations=false
  if [ -d "$migrations_dir" ]; then
    # A migrations folder is "real" only if it has at least one
    # `<timestamp>_<name>/` subdirectory. `migration_lock.toml` alone doesn't
    # count.
    if [ -n "$(find "$migrations_dir" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | head -n 1)" ]; then
      has_migrations=true
    fi
  fi

  if [ "$has_migrations" = true ]; then
    echo "  Migration history detected — applying with prisma migrate deploy."
    if ! (cd "$PROJECT_DIR" && DATABASE_URL="$DB_URL" pnpm db:migrate:deploy 2>&1); then
      echo "ERROR: prisma migrate deploy failed. DB out of sync with migration history."
      echo "  Try: scripts/worktree-stack.sh reset  # nukes .stack.json/.pgdata and re-migrates"
      exit 1
    fi
  else
    echo "  No migration history — syncing schema with prisma db push (dev/ephemeral)."
    # --skip-generate: client was already generated above.
    # --accept-data-loss: ephemeral worktree DBs have no data worth preserving;
    #   suppresses the interactive confirmation prompt so this stays non-TTY safe.
    if ! (cd "$PROJECT_DIR" && DATABASE_URL="$DB_URL" \
          pnpm --filter @sfx/database exec prisma db push \
            --skip-generate --accept-data-loss 2>&1); then
      echo "ERROR: prisma db push failed. Schema could not be synced."
      echo "  Try: scripts/worktree-stack.sh reset"
      exit 1
    fi
  fi

  # 7. Start turbo watch for shared packages (hot recompile on edits).
  # nest-watch and next-dev handle apps/* themselves; this covers packages/*
  # where compiled dist/ is consumed by Nest via symlinks. Web picks up the
  # same packages' src/ via transpilePackages so it doesn't rely on this.
  echo "[7/9] Starting turbo watch for shared packages..."
  start_turbo_watch
  echo "  Turbo watch running (log: .turbo-watch.log)."

  # 7b. Static OpenAPI dump — FOREGROUND, hard-abort on failure.
  #
  # Previously this ran with `&` in the background so it would cost ~0s on
  # the critical path. The trade-off was that openapi:dump's exit code was
  # silently lost (the trailing `wait $dump_pid` didn't propagate failure).
  # That meant a malformed DTO (missing @ApiProperty(type:) — see CLAUDE.md
  # meta-principle B) or a missing @Inject(Token) on a constructor would
  # silently break .openapi.json generation. The stack would then boot the
  # API anyway, and the runtime probe would fail far downstream with a
  # confusing matrix-regen error instead of pointing at the DTO/constructor.
  #
  # Foreground + hard-abort surfaces the failure HERE, where the cause is
  # one diff away. dump-openapi.ts boots Nest without binding a port, so
  # blocking on it costs ~5–10s but prevents far costlier confusion later.
  local dump_log="$PROJECT_DIR/.openapi-dump.log"
  echo "[7b/9] Running OpenAPI static dump (foreground; fail-loud on errors)..."
  if ! (cd "$PROJECT_DIR" && pnpm --filter @sfx/api openapi:dump > "$dump_log" 2>&1); then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "ERROR: openapi:dump failed — boot ABORTED"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  Root cause (CLAUDE.md meta-principle B):"
    echo "    tsx + esbuild do NOT reliably emit reflect-metadata. NestJS"
    echo "    Swagger then can't resolve property/parameter types and fails"
    echo "    with a misleading 'circular dependency' or 'unresolved"
    echo "    dependency' error. Two declaration rules MUST be followed:"
    echo ""
    echo "      1. Every @ApiProperty() / @ApiPropertyOptional() MUST"
    echo "         declare an explicit \`type:\` field"
    echo "         (e.g. @ApiProperty({ type: String }) or"
    echo "          @ApiProperty({ type: [SomeDto] })).  See:"
    echo "         apps/api/src/modules/probe-ref/auth-r2/application/dtos/*"
    echo ""
    echo "      2. Every constructor parameter whose type is a class or"
    echo "         interface MUST be annotated with @Inject(Token) directly"
    echo "         on the parameter."
    echo ""
    echo "  Apply the meta-principle to any future quirk with the same"
    echo "  root cause — these two are worked examples, not an exhaustive"
    echo "  list."
    echo ""
    echo "  Last 50 lines of $dump_log:"
    tail -n 50 "$dump_log" 2>/dev/null | sed 's/^/    /'
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    # Tear down any partial state we already brought up so the user has a
    # clean slate to retry against.
    stop_turbo_watch >/dev/null 2>&1 || true
    rm -f "$STACK_FILE" 2>/dev/null || true
    exit 1
  fi
  echo "  OpenAPI static dump complete (log: $dump_log)."

  # 8. Start NestJS API
  # 8a. Pre-build @sfx/api so apps/api/dist/main.js exists BEFORE
  #     `nest start --watch` spawns its `node dist/main` child.
  #     Nest's watcher launches that node process in parallel with the
  #     initial compile, NOT after it. On a fresh worktree dist/main.js
  #     doesn't exist yet, so node crash-loops with MODULE_NOT_FOUND
  #     for ~2s until tsc emits. The Stop-hook probe scrapes .api.log
  #     for MODULE_NOT_FOUND and fast-fails the boot before watch mode
  #     can self-heal. Pre-building eliminates the race deterministically:
  #     dist/main.js is guaranteed present, watch mode then handles
  #     incremental updates without ever re-spawning node from a missing
  #     entrypoint. Fail fast on TS errors here — better to surface them
  #     at boot than to ship a broken stack.
  echo "[8a/9] Pre-building @sfx/api (one-shot, eliminates nest --watch boot race)..."
  if ! (cd "$PROJECT_DIR" && pnpm --filter @sfx/api build 2>&1); then
    echo "ERROR: Failed to build @sfx/api. Aborting."
    echo "  Fix the TypeScript errors above and re-run: scripts/worktree-stack.sh start"
    exit 1
  fi
  if [ ! -f "$PROJECT_DIR/apps/api/dist/main.js" ]; then
    echo "ERROR: @sfx/api build reported success but apps/api/dist/main.js is missing."
    echo "  Check apps/api/tsconfig.json outDir and apps/api/nest-cli.json."
    exit 1
  fi
  echo "  @sfx/api built (dist/main.js ready)."

  # 8a.5. Kill stale dev processes from previous boots in THIS worktree.
  # Re-invocations (e.g. probe:smoke retried) leave orphaned `nest --watch`
  # and `pnpm dev` processes alive holding API/web ports, causing EADDRINUSE
  # on the next boot. Scope is $PROJECT_DIR so we never touch processes from
  # other worktrees.
  # `|| true` guards: pgrep exits 1 on no-match, and `set -euo pipefail` would
  # otherwise propagate that through the pipe and silently kill the script
  # between [8a/9] and [8/9] in the common (no-stale-procs) case. Same pattern
  # as the line ~220 guard.
  local stale
  stale=$(pgrep -f "$PROJECT_DIR.*(pnpm.*@sfx/.*dev|nest.*--watch)" 2>/dev/null | tr '\n' ' ' || true)
  if [ -n "$stale" ]; then
    echo "  Killing stale dev processes from previous boots: $stale"
    kill -TERM $stale 2>/dev/null || true
    sleep 1
    stale=$(pgrep -f "$PROJECT_DIR.*(pnpm.*@sfx/.*dev|nest.*--watch)" 2>/dev/null | tr '\n' ' ' || true)
    if [ -n "$stale" ]; then
      echo "  Force-killing stragglers: $stale"
      kill -KILL $stale 2>/dev/null || true
    fi
  fi

  # 8b. Port preflight — if the port is already bound, roll to the next free port.
  if lsof -i :"$API_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    local old_api_port="$API_PORT"
    API_PORT=$(find_free_port $((API_PORT + 1)))
    echo "  API port $old_api_port already bound — falling back to $API_PORT."
  fi
  echo "[8/9] Starting NestJS API on port $API_PORT..."
  # Source project env files so the API gets whatever vars its current schema
  # requires (JWT_SECRET, JWT_REFRESH_SECRET, OAuth keys, etc.) without this
  # script having to know the schema. Resolution order (later wins):
  #   1. apps/api/.env.example   (committed dev defaults — always present)
  #   2. apps/api/.env           (developer local overrides — optional)
  #   3. .env                    (monorepo root overrides — optional)
  # Stack-managed values (DATABASE_URL, PORT) are exported AFTER sourcing so
  # they win over any stale values in the env files.
  local api_env_files=(
    "$PROJECT_DIR/apps/api/.env.example"
    "$PROJECT_DIR/apps/api/.env"
    "$PROJECT_DIR/.env"
  )
  (cd "$PROJECT_DIR" && \
    set -a; \
    for ef in "${api_env_files[@]}"; do [ -f "$ef" ] && . "$ef"; done; \
    DATABASE_URL="$DB_URL"; PORT="$API_PORT"; NODE_ENV=development; \
    set +a; \
    pnpm --filter @sfx/api dev > "$PROJECT_DIR/.api.log" 2>&1 &)

  local retries=60
  until curl -sf "http://localhost:${API_PORT}/api/v1/health" >/dev/null 2>&1 || \
        curl -sf "http://localhost:${API_PORT}/api/v1" >/dev/null 2>&1 || \
        curl -sf "http://localhost:${API_PORT}" >/dev/null 2>&1; do
    retries=$((retries - 1))
    if [ "$retries" -le 0 ]; then
      echo "ERROR: API failed to become ready on port $API_PORT (timeout)."
      echo "  --- .api.log tail ---"
      tail -n 40 "$PROJECT_DIR/.api.log" 2>/dev/null | sed 's/^/  /'
      # Note: openapi:dump already ran (and succeeded) in step 7b foreground.
      # If it had failed, boot would have aborted before reaching API start.
      if [ -s "$PROJECT_DIR/apps/api/.openapi.json" ]; then
        echo "  Static OpenAPI dump exists at apps/api/.openapi.json — matrix regen will use it."
      else
        echo "  WARN: apps/api/.openapi.json missing. Boot likely aborted earlier; this branch should be unreachable."
      fi
      echo "  Try: scripts/worktree-stack.sh reset"
      exit 1
    fi
    sleep 1
  done
  echo "  API ready."

  # 8b. (Reserved — step 7b now runs foreground with hard-abort, so the
  #      previous "wait for background dump" gate is no longer needed.)

  # 8c. Refresh from live spec — overwrites the static dump with the served
  # version so matrix regen sees what the API actually returns at runtime.
  if curl -sf "http://localhost:${API_PORT}/api/docs-json" \
      -o "$PROJECT_DIR/apps/api/.openapi.json" 2>/dev/null; then
    echo "  OpenAPI spec refreshed from live /api/docs-json."
  elif [ -s "$PROJECT_DIR/apps/api/.openapi.json" ]; then
    echo "  WARN: /api/docs-json not reachable — using static dump from step 7b."
  else
    echo "  WARN: /api/docs-json not reachable AND static dump empty — matrix regen will fail."
  fi

  # 9. Start NextJS Web
  # 9a. Port preflight — same story as API.
  if lsof -i :"$WEB_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    local old_web_port="$WEB_PORT"
    WEB_PORT=$(find_free_port $((WEB_PORT + 1)))
    echo "  Web port $old_web_port already bound — falling back to $WEB_PORT."
  fi
  echo "[9/9] Starting NextJS Web on port $WEB_PORT..."
  (cd "$PROJECT_DIR" && \
    NEXT_PUBLIC_API_URL="http://localhost:${API_PORT}" \
    pnpm --filter @sfx/web dev --port "$WEB_PORT" > "$PROJECT_DIR/.web.log" 2>&1 &)

  retries=60
  until curl -sf "http://localhost:${WEB_PORT}" >/dev/null 2>&1; do
    retries=$((retries - 1))
    if [ "$retries" -le 0 ]; then
      echo "ERROR: Web failed to become ready on port $WEB_PORT (timeout)."
      echo "  --- .web.log tail ---"
      tail -n 40 "$PROJECT_DIR/.web.log" 2>/dev/null | sed 's/^/  /'
      echo "  Try: scripts/worktree-stack.sh reset"
      exit 1
    fi
    sleep 1
  done
  echo "  Web ready."

  # Write stack info
  cat > "$STACK_FILE" <<EOF
{
  "pg_port": $PG_PORT,
  "api_port": $API_PORT,
  "web_port": $WEB_PORT,
  "db_name": "$DB_NAME",
  "db_url": "$DB_URL",
  "pg_data_dir": "$PG_DATA_DIR",
  "pg_bin": "$pg_bin",
  "is_worktree": $IN_WORKTREE,
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

  # Clear the detach marker — a subsequent `start --detach` should be
  # a fast no-op (all-green path), not report a ghost in-progress start.
  rm -f "$START_PID_FILE" 2>/dev/null || true

  echo ""
  echo "=== Stack ready ==="
  echo "  Frontend: http://localhost:$WEB_PORT"
  echo "  Backend:  http://localhost:$API_PORT/api/v1"
  echo "  Database: $DB_URL"
}

# ── Stop ────────────────────────────────────────────────────────────

kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null) || true
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill 2>/dev/null || true
    sleep 1
    pids=$(lsof -ti :"$port" 2>/dev/null) || true
    [ -n "$pids" ] && echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
}

cmd_stop() {
  if [ -f "/.dockerenv" ] || [ "${SFX_PLATFORM:-}" = "1" ]; then
    exec bash "$SCRIPT_DIR/stack-down-docker.sh" "$@"
  fi
  if [ ! -f "$STACK_FILE" ]; then
    echo "No stack running (.stack.json not found)"
    exit 0
  fi

  local api_port web_port pg_bin pg_data_dir
  api_port=$(node -e "console.log(require('$STACK_FILE').api_port)")
  web_port=$(node -e "console.log(require('$STACK_FILE').web_port)")
  pg_bin=$(node -e "console.log(require('$STACK_FILE').pg_bin || '')")
  pg_data_dir=$(node -e "console.log(require('$STACK_FILE').pg_data_dir || '')")

  echo "=== Stopping stack ==="

  echo "Stopping turbo watch..."
  stop_turbo_watch

  echo "Stopping Web (port $web_port)..."
  kill_port "$web_port"

  echo "Stopping API (port $api_port)..."
  kill_port "$api_port"

  if [ -n "$pg_bin" ] && [ -n "$pg_data_dir" ] && [ -d "$pg_data_dir" ]; then
    echo "Stopping PostgreSQL..."
    "$pg_bin/pg_ctl" -D "$pg_data_dir" stop -m fast >/dev/null 2>&1 || true
  fi

  rm -f "$STACK_FILE" \
        "$PROJECT_DIR/.api.log" "$PROJECT_DIR/.web.log" "$PROJECT_DIR/.pg.log" \
        "$TURBO_WATCH_LOG" \
        "$START_PID_FILE" "$START_LOG"
  echo "Stack stopped."
}

# ── Reset (force-clean all state without needing a live daemon) ────

cmd_reset() {
  if [ -f "/.dockerenv" ] || [ "${SFX_PLATFORM:-}" = "1" ]; then
    exec bash "$SCRIPT_DIR/stack-down-docker.sh" "$@"
  fi
  local hard=false
  if [ "${1:-}" = "--hard" ]; then
    hard=true
  fi
  echo "=== Resetting stack ==="

  # Best-effort graceful teardown if a stack.json is present.
  if [ -f "$STACK_FILE" ]; then
    cmd_stop || true
  fi

  # Force-stop turbo watch even if cmd_stop wasn't reached.
  stop_turbo_watch

  # Multi-worktree safety: only kill processes whose cwd is under THIS
  # PROJECT_DIR. Parallel worktrees of the same repo live in sibling
  # directories, each with its own stack; we must not cross-kill.
  local self_pid=$$
  _pid_cwd_matches_project() {
    # Returns 0 iff pid's cwd is under $PROJECT_DIR.
    # Case-insensitive: macOS HFS+/APFS is case-insensitive by default and
    # `pwd` may return different case than lsof's kernel-canonical cwd.
    local pid="$1" cwd rc
    cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/ {sub(/^n/,""); print; exit}')
    [ -n "$cwd" ] || return 1
    shopt -s nocasematch
    case "$cwd" in
      "$PROJECT_DIR"|"$PROJECT_DIR"/*) rc=0 ;;
      *) rc=1 ;;
    esac
    shopt -u nocasematch
    return $rc
  }

  # Kill any lingering `pnpm --filter @sfx/(api|web) dev` wrappers for THIS
  # project. kill_port only kills the leaf node process; the pnpm parent
  # lingers waitpid'ing on it, which keeps the bash subshell alive too.
  local pnpm_candidates
  pnpm_candidates=$(pgrep -f "pnpm --filter @sfx/(api|web) dev" 2>/dev/null | grep -v "^${self_pid}$" || true)
  if [ -n "$pnpm_candidates" ]; then
    local pnpm_matched=""
    for pid in $pnpm_candidates; do
      if _pid_cwd_matches_project "$pid"; then
        pnpm_matched="$pnpm_matched $pid"
      fi
    done
    if [ -n "$pnpm_matched" ]; then
      echo "  Killing pnpm dev wrapper(s) for this project:$pnpm_matched"
      # shellcheck disable=SC2086
      kill $pnpm_matched 2>/dev/null || true
      sleep 0.3
      # shellcheck disable=SC2086
      kill -9 $pnpm_matched 2>/dev/null || true
    fi
  fi

  # Kill any orphaned worktree-stack.sh start scripts for THIS PROJECT_DIR
  # (prior sessions, crashes, or unclean exits leave these behind; they're
  # the subshell containers for the backgrounded dev servers).
  local orphans
  orphans=$(pgrep -f "worktree-stack.sh start" 2>/dev/null | grep -v "^${self_pid}$" || true)
  if [ -n "$orphans" ]; then
    local matched=""
    for pid in $orphans; do
      local pcmd
      pcmd=$(ps -o command= -p "$pid" 2>/dev/null || true)
      if [ -z "$pcmd" ]; then continue; fi
      # Accept either: absolute argv anchored at our PROJECT_DIR,
      # OR relative argv whose cwd is under PROJECT_DIR.
      case "$pcmd" in
        *"$PROJECT_DIR/scripts/worktree-stack.sh"*)
          matched="$matched $pid"
          ;;
        *"scripts/worktree-stack.sh start"*)
          if _pid_cwd_matches_project "$pid"; then
            matched="$matched $pid"
          fi
          ;;
      esac
    done
    if [ -n "$matched" ]; then
      echo "  Killing orphaned start script(s):$matched"
      # shellcheck disable=SC2086
      kill $matched 2>/dev/null || true
      sleep 0.3
      # shellcheck disable=SC2086
      kill -9 $matched 2>/dev/null || true
    fi
  fi

  # Recompute ports from the worktree identity — same derivation as cmd_start.
  compute_ports

  # Force-kill anything listening on the computed worktree ports.
  for p in "$PG_PORT" "$API_PORT" "$WEB_PORT"; do
    local pids
    pids=$(lsof -ti :"$p" 2>/dev/null) || true
    if [ -n "$pids" ]; then
      echo "  Killing PID(s) on port $p: $pids"
      echo "$pids" | xargs kill -9 2>/dev/null || true
    fi
  done

  # Force-kill any postgres owning the postmaster pid for this data dir.
  if [ -f "$PG_DATA_DIR/postmaster.pid" ]; then
    local pg_pid
    pg_pid=$(sed -n '1p' "$PG_DATA_DIR/postmaster.pid" 2>/dev/null | tr -d '[:space:]')
    if [ -n "$pg_pid" ]; then
      echo "  Killing PostgreSQL postmaster (pid $pg_pid)"
      kill -9 "$pg_pid" 2>/dev/null || true
    fi
  fi

  # Kill any in-flight detached start so it can't resurrect the stack.
  if [ -f "$START_PID_FILE" ]; then
    local start_pid
    start_pid=$(cat "$START_PID_FILE" 2>/dev/null | tr -d '[:space:]')
    if [ -n "$start_pid" ]; then
      echo "  Killing detached start (pid $start_pid)"
      kill -- "-$start_pid" 2>/dev/null || kill "$start_pid" 2>/dev/null || true
      kill -9 -- "-$start_pid" 2>/dev/null || kill -9 "$start_pid" 2>/dev/null || true
    fi
  fi

  rm -f "$STACK_FILE" \
        "$TURBO_WATCH_PID_FILE" \
        "$TURBO_WATCH_LOG" \
        "$START_PID_FILE" \
        "$START_LOG" \
        "$PG_DATA_DIR/postmaster.pid" \
        "$PG_DATA_DIR/postmaster.opts" \
        "$PROJECT_DIR/.api.log" \
        "$PROJECT_DIR/.web.log" \
        "$PROJECT_DIR/.pg.log"

  # --hard: also nuke the data cluster + Prisma client cache so the next
  # start runs initdb + db:generate from scratch. Fixes P3005 loops on
  # schema drift and `this.$connect is not a function` on cold worktrees.
  if [ "$hard" = true ]; then
    echo "  --hard: removing PG data cluster ($PG_DATA_DIR)"
    rm -rf "$PG_DATA_DIR"
    echo "  --hard: removing generated Prisma client"
    rm -rf "$PROJECT_DIR/node_modules/.prisma" \
           "$PROJECT_DIR/node_modules/@prisma/client"
  fi

  echo "  Reset complete. Run 'start' next."
}

# ── Clean (stop + delete data) ─────────────────────────────────────

cmd_clean() {
  cmd_stop
  if [ -d "$PG_DATA_DIR" ]; then
    echo "Removing PostgreSQL data directory..."
    rm -rf "$PG_DATA_DIR"
    echo "Cleaned."
  fi
}

# ── Sweep (reclaim disk from abandoned worktrees) ──────────────────

# Enumerates .pgdata dirs under .overstory/worktrees/*/ at the main-repo
# root and deletes ones whose worktree is no longer registered with git.
# Run from the main checkout (not a worktree) for the full sweep.
cmd_sweep() {
  local main_dir
  # Resolve main-repo dir regardless of whether we're inside a worktree.
  # --git-common-dir points at the main repo's .git; its parent is main.
  local common_dir
  common_dir=$(git -C "$PROJECT_DIR" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
  if [ -n "$common_dir" ] && [ -d "$common_dir" ]; then
    main_dir=$(dirname "$common_dir")
  else
    main_dir="$PROJECT_DIR"
  fi

  if [ -z "$main_dir" ] || [ ! -d "$main_dir" ]; then
    echo "ERROR: unable to resolve main-repo directory for sweep."
    exit 1
  fi

  echo "=== Sweeping orphaned .pgdata under $main_dir/.overstory/worktrees/ ==="

  local alive
  alive=$(git -C "$main_dir" worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2}')

  local freed_bytes=0
  local removed=0

  shopt -s nullglob
  for pgdir in "$main_dir"/.overstory/worktrees/*/.pgdata; do
    local wt_dir
    wt_dir=$(dirname "$pgdir")
    # Consider a worktree "orphaned" if its directory is missing OR if
    # the directory exists but git no longer tracks it as a worktree.
    if [ ! -d "$wt_dir" ] || ! echo "$alive" | grep -Fxq "$wt_dir"; then
      local size
      size=$(du -sk "$pgdir" 2>/dev/null | awk '{print $1}')
      # Try a best-effort shutdown of any postgres that pinned the dir.
      if [ -f "$pgdir/postmaster.pid" ]; then
        local pg_pid
        pg_pid=$(sed -n '1p' "$pgdir/postmaster.pid" 2>/dev/null | tr -d '[:space:]')
        [ -n "$pg_pid" ] && kill -9 "$pg_pid" 2>/dev/null || true
      fi
      echo "  Removing $pgdir (~${size}KB)"
      rm -rf "$pgdir"
      freed_bytes=$((freed_bytes + size))
      removed=$((removed + 1))
    fi
  done
  shopt -u nullglob

  echo "  Done. Removed $removed orphan(s), reclaimed ~${freed_bytes}KB."
}

# ── Status (JSON per-component health) ────────────────────────────

cmd_status() {
  local pg_port="" api_port="" web_port=""
  local pg_state="down" api_state="down" web_state="down"
  local has_stack=false
  local compose_project=""

  if [ -f "$STACK_FILE" ]; then
    has_stack=true
    pg_port=$(node -e "console.log(require('$STACK_FILE').pg_port || '')" 2>/dev/null)
    api_port=$(node -e "console.log(require('$STACK_FILE').api_port || '')" 2>/dev/null)
    web_port=$(node -e "console.log(require('$STACK_FILE').web_port || '')" 2>/dev/null)
    compose_project=$(node -e "console.log(require('$STACK_FILE').compose_project || '')" 2>/dev/null)

    # When the stack runs under docker compose (declared in .stack.json via
    # stack-up-docker.sh), the legacy host-process probes (pg_isready / curl
    # localhost / lsof) are wrong: the panel container's `localhost` is the
    # container's own loopback, not the docker host where published ports
    # bind. Truth lives in the compose project. Query it directly. Pure
    # declarative path — no string-pattern inference, no ENV guessing.
    if [ -n "$compose_project" ] && command -v docker >/dev/null 2>&1; then
      pg_state=$(docker_compose_service_state  "$compose_project" postgres)
      api_state=$(docker_compose_service_state "$compose_project" api)
      web_state=$(docker_compose_service_state "$compose_project" web)
    else
      [ -n "$pg_port" ]  && pg_state=$(component_status pg  "$pg_port")
      [ -n "$api_port" ] && api_state=$(component_status api "$api_port")
      [ -n "$web_port" ] && web_state=$(component_status web "$web_port")
    fi
  fi
  local watch_state
  watch_state=$(component_status turbo_watch)

  # Report a detached start if one is in flight — callers can distinguish
  # "never booted" (down) from "booting right now" (starting).
  local starting=false start_pid="null"
  if [ -f "$START_PID_FILE" ]; then
    local pid
    pid=$(cat "$START_PID_FILE" 2>/dev/null | tr -d '[:space:]')
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      starting=true
      start_pid="$pid"
    fi
  fi

  cat <<EOF
{
  "has_stack_file": $has_stack,
  "starting": $starting,
  "start_pid": $start_pid,
  "pg":  { "state": "$pg_state",  "port": ${pg_port:-null} },
  "api": { "state": "$api_state", "port": ${api_port:-null} },
  "web": { "state": "$web_state", "port": ${web_port:-null} },
  "turbo_watch": { "state": "$watch_state" }
}
EOF
}

# ── Refresh watch (respawn turbo + next-dev without full boot) ─────

cmd_refresh_watch() {
  echo "=== Refreshing watchers ==="
  stop_turbo_watch

  # Next.js caches workspace topology at startup; restart next-dev so it
  # picks up any newly added @sfx/* package via transpilePackages.
  if [ -f "$STACK_FILE" ]; then
    local web_port
    web_port=$(node -e "console.log(require('$STACK_FILE').web_port)" 2>/dev/null)
    if [ -n "$web_port" ]; then
      echo "  Restarting Next.js dev server on port $web_port..."
      kill_port "$web_port"
      local api_port
      api_port=$(node -e "console.log(require('$STACK_FILE').api_port)" 2>/dev/null)
      (cd "$PROJECT_DIR" && \
        NEXT_PUBLIC_API_URL="http://localhost:${api_port}" \
        pnpm --filter @sfx/web dev --port "$web_port" > "$PROJECT_DIR/.web.log" 2>&1 &)
    fi
  fi

  start_turbo_watch
  echo "  Watchers refreshed."
}

# Silent no-op if the stack isn't running. Used by postinstall.
cmd_refresh_watch_if_running() {
  if [ -f "/.dockerenv" ] || [ "${SFX_PLATFORM:-}" = "1" ]; then
    return 0
  fi
  if [ -f "$STACK_FILE" ]; then
    cmd_refresh_watch
  fi
}

# ── Health (compares running API spec to fresh static dump) ─────────
#
# Observer, not actor. We do NOT auto-reset the stack on divergence —
# instead we surface the divergence and let the developer decide. Auto-reset
# would silently mask the bug class this command exists to detect: a stale
# in-memory NestJS process serving an OpenAPI spec that no longer matches
# the source after a hot-reload glitch or a missed restart. The probe and
# matrix regen consume the running spec, so divergence here means the probe
# is testing something other than what the source code says.

cmd_health() {
  local api_port=""
  if [ -f "$STACK_FILE" ]; then
    api_port=$(node -e "console.log(require('$STACK_FILE').api_port || '')" 2>/dev/null)
  fi
  # Default to 3001 (main repo) when there is no .stack.json.
  if [ -z "$api_port" ]; then api_port=3001; fi

  # Step 1: pull the live spec.
  local live_body
  if ! live_body=$(curl -sf "http://localhost:${api_port}/api/docs-json" 2>/dev/null); then
    echo "[stack-health] FAIL — running api not reachable on http://localhost:${api_port}/api/docs-json"
    echo "  Run: pnpm stack:up"
    exit 1
  fi
  if [ -z "$live_body" ]; then
    echo "[stack-health] FAIL — /api/docs-json returned an empty body"
    exit 1
  fi

  # Step 2: run a fresh static dump to a temp file.
  local tmp_dump
  tmp_dump=$(mktemp -t stack-health-dump.XXXXXX) || {
    echo "[stack-health] FAIL — could not create temp file"
    exit 1
  }
  # Always clean up the temp file, even on early exit.
  trap 'rm -f "$tmp_dump" 2>/dev/null || true' EXIT INT TERM

  local dump_log
  dump_log=$(mktemp -t stack-health-log.XXXXXX) || {
    echo "[stack-health] FAIL — could not create temp log file"
    exit 1
  }
  trap 'rm -f "$tmp_dump" "$dump_log" 2>/dev/null || true' EXIT INT TERM

  if ! (cd "$PROJECT_DIR" && pnpm --filter @sfx/api openapi:dump > "$dump_log" 2>&1); then
    echo "[stack-health] FAIL — fresh openapi:dump errored. Last 20 lines:"
    tail -n 20 "$dump_log" 2>/dev/null | sed 's/^/  /'
    exit 1
  fi
  if [ ! -s "$PROJECT_DIR/apps/api/.openapi.json" ]; then
    echo "[stack-health] FAIL — openapi:dump succeeded but apps/api/.openapi.json is empty"
    exit 1
  fi
  cp "$PROJECT_DIR/apps/api/.openapi.json" "$tmp_dump"

  # Step 3: canonicalize both as compact JSON, then md5.
  # The live API serves compact JSON (no whitespace) while
  # `apps/api/.openapi.json` is pretty-printed by dump-openapi.ts. Comparing
  # raw bytes would always report DIVERGENT even when the two are
  # semantically identical. Round-tripping through JSON.parse + JSON.stringify
  # removes whitespace differences and gives a meaningful comparison.
  local canonicalize='process.stdout.write(JSON.stringify(JSON.parse(require("fs").readFileSync(0,"utf8"))))'
  local live_md5 dump_md5
  live_md5=$(printf '%s' "$live_body" | node -e "$canonicalize" | { md5 -q 2>/dev/null || md5sum 2>/dev/null | awk '{print $1}'; })
  dump_md5=$(node -e "$canonicalize" < "$tmp_dump" | { md5 -q 2>/dev/null || md5sum 2>/dev/null | awk '{print $1}'; })

  if [ -z "$live_md5" ] || [ -z "$dump_md5" ]; then
    echo "[stack-health] FAIL — could not compute md5 (missing both md5 and md5sum on PATH)"
    exit 1
  fi

  if [ "$live_md5" = "$dump_md5" ]; then
    echo "[stack-health] OK — running api matches static dump."
    echo "  api_port: $api_port"
    echo "  md5:      $live_md5"
    exit 0
  fi

  echo "[stack-health] DIVERGENT — running api is stale. Run: pnpm stack:reset && pnpm stack:up"
  echo "  api_port:    $api_port"
  echo "  live  md5:   $live_md5"
  echo "  static md5:  $dump_md5"
  exit 1
}

# ── Ports (JSON output for programmatic use) ────────────────────────

cmd_ports() {
  compute_ports
  cat <<EOF
{
  "pg_port": $PG_PORT,
  "api_port": $API_PORT,
  "web_port": $WEB_PORT,
  "db_name": "$DB_NAME",
  "db_url": "$DB_URL",
  "is_worktree": $IN_WORKTREE
}
EOF
}

# ── Main ────────────────────────────────────────────────────────────

case "${1:-}" in
  start)  shift; cmd_start "$@" ;;
  stop)   cmd_stop ;;
  reset)  cmd_reset ;;
  clean)  cmd_clean ;;
  sweep)  cmd_sweep ;;
  ports)  cmd_ports ;;
  status) cmd_status ;;
  health) cmd_health ;;
  refresh-watch) cmd_refresh_watch ;;
  refresh-watch-if-running) cmd_refresh_watch_if_running ;;
  *)
    echo "Usage: $(basename "$0") start [--detach]|stop|reset|clean|sweep|ports|status|health|refresh-watch"
    echo ""
    echo "  start [--detach]             Start stack (idempotent — no-op if all green)."
    echo "                               --detach: fork in background, exit 0 immediately,"
    echo "                               caller polls 'status' to wait for readiness."
    echo "  stop                         Stop all services (via .stack.json)"
    echo "  reset                        Force-clean state (kills zombies, clears .stack.json + postmaster.pid)"
    echo "  clean                        Stop + delete PostgreSQL data directory"
    echo "  sweep                        Delete .pgdata of worktrees no longer registered with git"
    echo "  ports                        Print computed ports as JSON"
    echo "  status                       Print per-component health as JSON (pg/api/web/turbo_watch)"
    echo "  health                       Compare running api spec to a fresh static dump (observer-only)"
    echo "  refresh-watch                Respawn turbo watch + next-dev (picks up new packages)"
    echo "  refresh-watch-if-running     Silent no-op if no stack — safe to call from postinstall"
    exit 1
    ;;
esac
