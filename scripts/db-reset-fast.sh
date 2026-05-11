#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$PROJECT_DIR"

if [ ! -f "packages/database/.env" ] || ! grep -q '^DATABASE_URL=' packages/database/.env 2>/dev/null; then
  echo "[db-reset-fast] FATAL: packages/database/.env missing DATABASE_URL — run pnpm stack:up first" >&2
  exit 1
fi

# Truncate every public table and verify the truncate actually ran. Locks held
# by the running api/web prisma pools can otherwise cause TRUNCATE to silently
# wait forever or fail without surfacing the error. lock_timeout makes the
# command return an error fast; the verify loop turns any surviving row into a
# hard exception so the caller never proceeds with a half-clean DB.
run_truncate() {
  pnpm --silent --filter @sfx/database prisma db execute --stdin <<'SQL'
SET lock_timeout = '5s';
SET statement_timeout = '30s';
DO $$
DECLARE
  table_name TEXT;
  leftover_table TEXT;
  leftover_count BIGINT;
BEGIN
  FOR table_name IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename != '_prisma_migrations'
  LOOP
    EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', table_name);
  END LOOP;

  FOR leftover_table IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename != '_prisma_migrations'
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I', leftover_table) INTO leftover_count;
    IF leftover_count > 0 THEN
      RAISE EXCEPTION '[db-reset-fast] table % not empty after truncate (count=%) — likely lock contention with api connections', leftover_table, leftover_count;
    END IF;
  END LOOP;
END
$$;
SQL
}

attempt=1
max_attempts=3
while [ "$attempt" -le "$max_attempts" ]; do
  if run_truncate >/dev/null 2>&1; then
    break
  fi
  echo "[db-reset-fast] truncate attempt $attempt failed; retrying after 1s..." >&2
  attempt=$((attempt + 1))
  sleep 1
done

if [ "$attempt" -gt "$max_attempts" ]; then
  echo "[db-reset-fast] FATAL: truncate failed after $max_attempts attempts. Run truncate manually:" >&2
  echo "  pnpm --filter @sfx/database prisma db execute --stdin < scripts/db-reset-fast.sh" >&2
  exit 1
fi

if pnpm --silent run 2>/dev/null | grep -q '^  db:seed$'; then
  pnpm --silent db:seed >/dev/null 2>&1 || {
    echo "[db-reset-fast] FATAL: db:seed failed — run 'pnpm db:seed' directly to see error" >&2
    exit 1
  }
fi

echo "[db-reset-fast] done"
