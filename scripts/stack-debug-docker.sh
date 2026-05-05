#!/usr/bin/env bash
# Agent-facing debug helpers for the docker-mode worker stack. Mirrors the
# spirit of worktree-stack.sh but operates against the per-worker compose
# project (`app-<basename>`) and surfaces the same info points agents need
# to debug a hung or broken stack quickly:
#
#   stack-debug-docker.sh status     - one-shot JSON health snapshot (pg/api/web)
#   stack-debug-docker.sh logs       - last 200 lines of every service, no tail truncation
#   stack-debug-docker.sh logs api   - last 200 lines of one service
#   stack-debug-docker.sh follow     - tail -f compose logs (Ctrl-C to exit)
#   stack-debug-docker.sh bridge     - last 200 lines of .bridge.log
#   stack-debug-docker.sh bridge -f  - tail -f .bridge.log
#   stack-debug-docker.sh ps         - docker compose ps for this project
#   stack-debug-docker.sh exec api  bash    - exec into a service
#
# All commands exit cleanly with a real exit code so agents can chain them
# (no buffered tails, no timeouts, no keyword guessing).
#
# Project name is derived from the worktree basename the same way
# stack-up-docker.sh derives it (`app-<basename>`), so an agent running
# this from /workspace/.overstory/worktrees/foo will hit `app-foo`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd -P)"
basename_dir="$(basename "$PROJECT_DIR")"
PROJECT_NAME="app-${basename_dir}"
BRIDGE_LOG="$PROJECT_DIR/.bridge.log"
BRIDGE_PID="$PROJECT_DIR/.bridge.pid"

usage() {
  cat <<EOF
usage: $0 <command> [args]
  status                 one-shot health snapshot (pg/api/web/bridge)
  logs [service]         last 200 lines of compose logs (all or one service)
  follow [service]       tail -f compose logs (Ctrl-C to exit)
  bridge [-f]            cat or tail .bridge.log
  ps                     docker compose ps -a
  exec <service> <cmd>   docker compose exec into a service
EOF
}

cmd_status() {
  local pg api web bridge_state="absent"
  pg="$(docker compose -p "$PROJECT_NAME" ps postgres --format json 2>/dev/null | head -n 1)"
  api="$(docker compose -p "$PROJECT_NAME" ps api --format json 2>/dev/null | head -n 1)"
  web="$(docker compose -p "$PROJECT_NAME" ps web --format json 2>/dev/null | head -n 1)"
  if [ -f "$BRIDGE_PID" ]; then
    local pid_value
    pid_value="$(cat "$BRIDGE_PID" 2>/dev/null || echo '')"
    if [ -n "$pid_value" ] && kill -0 "$pid_value" 2>/dev/null; then
      bridge_state="running (pid ${pid_value})"
    else
      bridge_state="stale-pid (file exists, process dead)"
    fi
  fi
  printf '{"project":"%s","postgres":%s,"api":%s,"web":%s,"bridge":"%s"}\n' \
    "$PROJECT_NAME" \
    "${pg:-{}}" \
    "${api:-{}}" \
    "${web:-{}}" \
    "$bridge_state"
}

cmd_logs() {
  local service="${1:-}"
  if [ -n "$service" ]; then
    docker compose -p "$PROJECT_NAME" logs --tail 200 --no-color "$service"
  else
    docker compose -p "$PROJECT_NAME" logs --tail 200 --no-color
  fi
}

cmd_follow() {
  local service="${1:-}"
  if [ -n "$service" ]; then
    exec docker compose -p "$PROJECT_NAME" logs -f --no-color "$service"
  else
    exec docker compose -p "$PROJECT_NAME" logs -f --no-color
  fi
}

cmd_bridge() {
  if [ ! -f "$BRIDGE_LOG" ]; then
    echo "no bridge log at $BRIDGE_LOG (bridge never spawned for this worktree)" >&2
    return 1
  fi
  if [ "${1:-}" = "-f" ]; then
    exec tail -F "$BRIDGE_LOG"
  fi
  tail -n 200 "$BRIDGE_LOG"
}

cmd_ps() {
  docker compose -p "$PROJECT_NAME" ps -a
}

cmd_exec() {
  if [ "$#" -lt 2 ]; then
    echo "usage: $0 exec <service> <cmd> [args...]" >&2
    return 2
  fi
  local service="$1"
  shift
  exec docker compose -p "$PROJECT_NAME" exec "$service" "$@"
}

action="${1:-}"
shift || true

case "$action" in
  status) cmd_status "$@" ;;
  logs) cmd_logs "$@" ;;
  follow) cmd_follow "$@" ;;
  bridge) cmd_bridge "$@" ;;
  ps) cmd_ps "$@" ;;
  exec) cmd_exec "$@" ;;
  ""|help|-h|--help) usage ;;
  *)
    echo "unknown command: $action" >&2
    usage
    exit 2
    ;;
esac
