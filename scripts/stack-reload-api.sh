#!/usr/bin/env bash
# Fast-iteration api restart: regenerates the dist-mount overlay from
# the current workspace, then `docker compose restart api` so the
# container picks up freshly-built dist files without rebuilding the
# image. Saves ~5 minutes per schema change vs `pnpm stack:up
# --rebuild`.
#
# Workflow:
#   pnpm --filter @sfx/<pkg> build    # writes <pkg>/dist on host
#   pnpm stack:reload-api             # mount + restart picks it up
#
# Falls back to `pnpm stack:up --rebuild` (loud message, exit 1) when
# the api container is not running — restarting a non-existent
# container is a no-op that hides the real problem.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd -P)"
cd "$PROJECT_DIR"

basename_dir="$(basename "$PROJECT_DIR")"
PROJECT_NAME="app-${basename_dir}"

# Step 1 — regenerate the mount list. New packages added since last
# `stack:up` are picked up here; the file is bind-mounted volume so
# regeneration alone makes the new mounts take effect on next restart.
node scripts/generate-stack-mounts.mjs

# Step 2 — confirm the api container is actually running. A restart
# against a stopped/missing service silently succeeds with `Service
# api: skipped`, which would otherwise look like the reload worked.
if ! docker compose -p "$PROJECT_NAME" ps --status running --services 2>/dev/null | grep -q '^api$'; then
  echo "[stack-reload-api] api container for project '$PROJECT_NAME' is not running"
  echo "[stack-reload-api] run 'pnpm stack:up' first, or use 'pnpm stack:up --rebuild' if a full image rebuild is genuinely needed (new dep, Dockerfile change, env var)"
  exit 1
fi

# Step 3 — restart. The api container picks up mounted dist on boot;
# Node clears its require cache on process start so the new module
# graph is loaded fresh.
echo "[stack-reload-api] restarting api in project '$PROJECT_NAME'..."
docker compose -p "$PROJECT_NAME" restart api

# Step 4 — wait for /api/health to return 200 again so the caller can
# probe immediately without racing the boot. Bounded; if the api
# crashes on the new dist, surface that fast instead of hanging.
HEALTH_HOST="host.docker.internal"
if ! [ -f /.dockerenv ]; then
  HEALTH_HOST="localhost"
fi
ACTUAL_API_PORT="$(docker compose -p "$PROJECT_NAME" port api 3001 2>/dev/null | awk -F: 'END{print $NF}')"
if [ -z "${ACTUAL_API_PORT:-}" ]; then
  echo "[stack-reload-api] api port not published — cannot poll health"
  exit 1
fi
ATTEMPTS=30
while [ "$ATTEMPTS" -gt 0 ]; do
  if curl -sf "http://${HEALTH_HOST}:${ACTUAL_API_PORT}/api/v1/health" >/dev/null 2>&1 \
     || curl -sf "http://${HEALTH_HOST}:${ACTUAL_API_PORT}/api/health" >/dev/null 2>&1; then
    echo "[stack-reload-api] api healthy on port ${ACTUAL_API_PORT}"
    exit 0
  fi
  ATTEMPTS=$(( ATTEMPTS - 1 ))
  sleep 1
done
echo "[stack-reload-api] api did not become healthy within 30s — check 'pnpm stack:logs api' for the crash reason"
exit 1
