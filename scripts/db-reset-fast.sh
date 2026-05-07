#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$PROJECT_DIR"

if [ ! -f "packages/database/.env" ] || ! grep -q '^DATABASE_URL=' packages/database/.env 2>/dev/null; then
  echo "[db-reset-fast] FATAL: packages/database/.env missing DATABASE_URL — run pnpm stack:up first" >&2
  exit 1
fi

pnpm --silent --filter @sfx/database prisma db execute --stdin <<'SQL'
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOR table_name IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename != '_prisma_migrations'
  LOOP
    EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', table_name);
  END LOOP;
END
$$;
SQL

if pnpm --silent run 2>/dev/null | grep -q '^  db:seed$'; then
  pnpm --silent db:seed
fi

echo "[db-reset-fast] done"
