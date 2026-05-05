#!/usr/bin/env bash
# Wrap `prisma migrate dev` in a retry loop. Prisma raises P1002 ("server reached
# but timed out") transiently when migrations fire too soon after the postgres
# container becomes reachable — auth handshakes can stall under load even after
# pg_isready and `SELECT 1` both pass. A short retry burns ~3 sec instead of
# letting the agent run `pnpm stack:reset` (~40 sec).
set -euo pipefail

ATTEMPTS="${MIGRATE_RETRY_ATTEMPTS:-3}"
DELAY="${MIGRATE_RETRY_DELAY:-1}"

attempt=1
while [ "$attempt" -le "$ATTEMPTS" ]; do
  if pnpm --filter @sfx/database prisma migrate dev "$@"; then
    exit 0
  fi
  status=$?
  if [ "$attempt" -eq "$ATTEMPTS" ]; then
    exit "$status"
  fi
  echo "[db-migrate] attempt ${attempt}/${ATTEMPTS} failed (exit ${status}); retrying in ${DELAY}s..." >&2
  sleep "$DELAY"
  attempt=$((attempt + 1))
done
