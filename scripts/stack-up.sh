#!/usr/bin/env bash
# Agent-facing single command: detached start + live log stream.
# Exits 0 on first ready marker, 1 on first ERROR marker, no timeout.
# Use this instead of `pnpm stack:start` — no tail truncation, no keyword
# guessing, no batch-with-timeout. The hook redirects agents here.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG="$PROJECT_DIR/.stack.start.log"
cd "$PROJECT_DIR"

# When running inside the SFX panel container (Docker-out-of-Docker setup),
# the local-only worktree-stack.sh path can't be used: it shells out to
# pg_ctl/initdb on the host PATH and assumes brew-installed postgresql@16
# plus free TCP ports in the user's session. Inside the panel image neither
# is present, so the boot dies before the agent ever sees `=== Stack ready ===`.
# Delegate to the docker-compose variant — it spawns a per-worktree compose
# project (one PG, one API, one Web each) via the panel's mounted
# /var/run/docker.sock with deterministic ports computed from the worktree
# basename. Detection uses the standard /.dockerenv marker plus an
# SFX_PLATFORM env hint, so this path stays inert on developers' host shells.
if [ -f "/.dockerenv" ] || [ "${SFX_PLATFORM:-}" = "1" ]; then
  exec bash "$SCRIPT_DIR/stack-up-docker.sh" "$@"
fi

initial="$(bash "$SCRIPT_DIR/worktree-stack.sh" start --detach 2>&1)" || {
  printf '%s\n' "$initial"
  exit 1
}
printf '%s\n' "$initial"

# Idempotent green path: the underlying script exits 0 without writing the log.
# Print a reminder so agents don't fall into the schema/seed-edit trap where
# stack:up returns "all green" without re-running migrations or seeds.
if grep -q "Stack already running (all green)" <<<"$initial"; then
  echo ""
  echo "  Note: stack was already running — no re-init, no re-migrate, no re-seed."
  echo "  If you edited prisma schema, migrations, or seed files, run:"
  echo "      pnpm stack:reset && pnpm stack:up"
  exit 0
fi

# Wait briefly for the detached child to create the log file.
for _ in 1 2 3 4 5; do
  [ -f "$LOG" ] && break
  sleep 1
done

# Stream live and exit on the first definitive marker.
#
# Why a FIFO + explicit tail kill instead of `tail -f | awk`?
# `tail -f` only delivers SIGPIPE when it tries to write to a closed pipe.
# Once awk exits on a marker, tail's pipe end is closed — but if the boot has
# also finished, nothing else is writing to .stack.start.log, so tail never
# attempts another write, never gets SIGPIPE, and the bash pipeline hangs
# forever waiting for tail to die. The FIFO + EXIT-trap kill makes tail die
# explicitly the instant awk produces its verdict, even on a quiescent log.
TAIL_FIFO=$(mktemp -u -t stack-up-fifo.XXXXXX)
mkfifo "$TAIL_FIFO"
tail -n +1 -f "$LOG" > "$TAIL_FIFO" &
TAIL_PID=$!
trap 'kill "$TAIL_PID" 2>/dev/null || true; rm -f "$TAIL_FIFO"' EXIT

awk '
  { print; fflush() }
  /^=== Stack ready ===/        { exit 0 }
  /^=== Stack already running/  { exit 0 }
  /^ERROR:/                     { exit 1 }
' < "$TAIL_FIFO"
