#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$PROJECT_DIR"

if [ ! -f "packages/database/.env" ] || ! grep -q '^DATABASE_URL=' packages/database/.env 2>/dev/null; then
  echo "[db-reset-fast] FATAL: packages/database/.env missing DATABASE_URL — run pnpm stack:up first" >&2
  exit 1
fi

# Truncate every public table once postgres confirms no other backend is
# holding a transaction. We poll pg_stat_activity *inside* the DO block so
# the wait is exactly as long as needed — not a magic sleep — and bounded
# (≤ wait_max_steps × wait_step_seconds). lock_timeout is the fallback if
# a connection becomes non-idle between the poll and the TRUNCATE.
# The post-truncate verify loop raises an exception on any surviving row,
# turning silent no-ops into hard failures.
pnpm --silent --filter @sfx/database prisma db execute --stdin <<'SQL'
SET lock_timeout = '10s';
SET statement_timeout = '60s';
DO $$
DECLARE
  table_name TEXT;
  leftover_table TEXT;
  leftover_count BIGINT;
  busy_count INT;
  wait_step INT := 0;
  wait_max_steps INT := 60;        -- 60 × 0.5s = 30s ceiling
BEGIN
  -- Smart wait: poll until every non-self backend on this DB is idle.
  -- Right after `stack:reload-api`, prisma's reopened pool walks
  -- 'authenticating' → 'idle' over a few hundred ms. TRUNCATE only needs
  -- ACCESS EXCLUSIVE so as soon as no other backend is mid-statement or
  -- mid-transaction, we proceed. If something is genuinely stuck non-idle
  -- past the ceiling we fall through and let lock_timeout report it.
  LOOP
    SELECT COUNT(*) INTO busy_count
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND state IS DISTINCT FROM 'idle';
    EXIT WHEN busy_count = 0 OR wait_step >= wait_max_steps;
    PERFORM pg_sleep(0.5);
    wait_step := wait_step + 1;
  END LOOP;
  IF busy_count > 0 THEN
    RAISE NOTICE '[db-reset-fast] proceeding with % non-idle backend(s) after % steps — lock_timeout will gate', busy_count, wait_step;
  END IF;

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

if pnpm --silent run 2>/dev/null | grep -q '^  db:seed$'; then
  pnpm --silent db:seed >/dev/null 2>&1 || {
    echo "[db-reset-fast] FATAL: db:seed failed — run 'pnpm db:seed' directly to see error" >&2
    exit 1
  }
fi

echo "[db-reset-fast] done"
