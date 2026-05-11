#!/usr/bin/env bash
# Docker variant of stack:stop. Mirrors stack-up-docker.sh's project-name
# derivation so the same worker tears down the stack it brought up. Also
# kills the per-worker panel bridge (`.bridge.pid`) before stopping the
# compose project so the bridge isn't left polling against a torn-down
# stack and writing 1.5s noise into `.bridge.log` forever.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd -P)"
LOG="$PROJECT_DIR/.stack.stop.log"
cd "$PROJECT_DIR"

basename_dir="$(basename "$PROJECT_DIR")"
APP_DEV_PROJECT_RESERVED="${APP_DEV_PROJECT:-app-dev-host}"
if [ "$basename_dir" = "workspace" ] && [ -z "${PROJECT_NAME:-}" ]; then
  PROJECT_NAME="$APP_DEV_PROJECT_RESERVED"
fi
PROJECT_NAME="${PROJECT_NAME:-app-${basename_dir}}"

echo "[stack-down-docker] Project=${PROJECT_NAME}" | tee "$LOG"

# Kill the bridge first so we don't race against `docker compose down`.
# SIGTERM gives it 5s to flush stdout + clean up timers; SIGKILL is the
# escape hatch when it has wedged. `kill -0` is the lightest liveness
# probe we have without pulling in `ps`.
stop_worker_bridge() {
  local pid_file="$PROJECT_DIR/.bridge.pid"
  if [ ! -f "$pid_file" ]; then
    return 0
  fi
  local pid_value
  pid_value="$(cat "$pid_file" 2>/dev/null || echo '')"
  if [ -z "$pid_value" ]; then
    rm -f "$pid_file"
    return 0
  fi
  if ! kill -0 "$pid_value" 2>/dev/null; then
    echo "[stack-down-docker] bridge pid ${pid_value} not running - removing stale pid file" | tee -a "$LOG"
    rm -f "$pid_file"
    return 0
  fi
  echo "[stack-down-docker] sending SIGTERM to bridge pid ${pid_value}" | tee -a "$LOG"
  kill -TERM "$pid_value" 2>/dev/null || true
  local waited=0
  while [ "$waited" -lt 5 ]; do
    if ! kill -0 "$pid_value" 2>/dev/null; then
      break
    fi
    sleep 1
    waited=$(( waited + 1 ))
  done
  if kill -0 "$pid_value" 2>/dev/null; then
    echo "[stack-down-docker] bridge pid ${pid_value} did not exit within 5s - sending SIGKILL" | tee -a "$LOG"
    kill -KILL "$pid_value" 2>/dev/null || true
  fi
  rm -f "$pid_file"
}

stop_worker_bridge

if ! command -v docker >/dev/null 2>&1; then
  echo "[stack-down-docker] docker not on PATH - skipping compose down" | tee -a "$LOG"
  exit 0
fi

echo "[stack-down-docker] docker compose -p ${PROJECT_NAME} down --remove-orphans -v" | tee -a "$LOG"
docker compose -p "$PROJECT_NAME" down --remove-orphans -v 2>&1 | tee -a "$LOG" || true

rm -f "$PROJECT_DIR/.stack.json" "$PROJECT_DIR/.bridge.pid" "$PROJECT_DIR/.bridge.log" 2>/dev/null || true

echo "[stack-down-docker] done" | tee -a "$LOG"
