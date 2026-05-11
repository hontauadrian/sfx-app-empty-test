#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd -P)"
cd "$PROJECT_DIR"

echo "[post-merge-canonical] pnpm install"
pnpm install --prefer-offline --silent

echo "[post-merge-canonical] stack-up-docker.sh --rebuild"
PROJECT_NAME=app-dev-host PG_PORT=5432 API_PORT=3001 NEXT_PORT=3000 \
  bash "$SCRIPT_DIR/stack-up-docker.sh" --rebuild

echo "[post-merge-canonical] done"
