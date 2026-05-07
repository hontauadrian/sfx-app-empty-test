#!/usr/bin/env bash
set -euo pipefail

ATTEMPTS="${MIGRATE_RETRY_ATTEMPTS:-3}"
DELAY="${MIGRATE_RETRY_DELAY:-1}"

NAME=""
for arg in "$@"; do
  case "$arg" in
    --name=*) NAME="${arg#--name=}" ;;
    --name) NAME="__next__" ;;
    *) [ "$NAME" = "__next__" ] && NAME="$arg" ;;
  esac
done
[ -z "$NAME" ] && NAME="auto_$(date +%Y%m%d%H%M%S)"

run_with_retry() {
  local attempt=1
  while [ "$attempt" -le "$ATTEMPTS" ]; do
    if "$@"; then return 0; fi
    local status=$?
    [ "$attempt" -eq "$ATTEMPTS" ] && return "$status"
    echo "[db-migrate] attempt ${attempt}/${ATTEMPTS} failed (exit ${status}); retrying in ${DELAY}s..." >&2
    sleep "$DELAY"
    attempt=$((attempt + 1))
  done
}

run_with_retry pnpm --filter @sfx/database prisma migrate dev --create-only --name "$NAME"
run_with_retry pnpm --filter @sfx/database prisma migrate deploy
