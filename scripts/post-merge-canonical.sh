#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd -P)"
cd "$PROJECT_DIR"

# Compose project that owns the canonical stack. Mirrors stack-up-docker.sh.
PROJECT_NAME="${PROJECT_NAME:-app-dev-host}"

echo "[post-merge-canonical] pnpm install"
CI=true NODE_ENV=development pnpm install --frozen-lockfile --prefer-offline

# docker-compose.mounts.generated.yml bind-mounts the HOST packages/<pkg>/dist
# directories into the api+web containers. Image dist is masked by that mount,
# so rebuilding shared packages on the host IS the operation that propagates
# new code into canonical. Image rebuild stays for Dockerfile changes
# (system deps, node_modules) but isn't sufficient on its own.
echo "[post-merge-canonical] rebuild shared package dists on host"
pnpm --filter @sfx/domain --filter @sfx/shared --filter @sfx/validation --filter @sfx/database build

echo "[post-merge-canonical] stack-up-docker.sh --rebuild"
PROJECT_NAME="$PROJECT_NAME" PG_PORT=5432 API_PORT=3001 NEXT_PORT=3000 \
  bash "$SCRIPT_DIR/stack-up-docker.sh" --rebuild

# Apply prisma migrations against canonical's pgdata. The bridge's migration
# watcher only fires on schema.prisma file changes; a merge that adds new
# migration directories (without touching schema.prisma) is invisible to it.
# Run deploy unconditionally — it's a no-op if up to date.
#
# If deploy reports P3009 (a prior migration failed and Prisma refuses to
# proceed), reset the canonical volume and reapply everything. Canonical
# pgdata is dev-only and not user-owned, so reset is safe; the alternative
# is a permanently broken canonical that hides drift behind a 500.
echo "[post-merge-canonical] prisma migrate deploy"
if ! pnpm --filter @sfx/database prisma migrate deploy 2>&1 | tee /tmp/post-merge-migrate.log; then
  if grep -q 'P3009' /tmp/post-merge-migrate.log; then
    echo "[post-merge-canonical] P3009 detected — resetting canonical pgdata volume"
    docker compose -p "$PROJECT_NAME" down -v
    PROJECT_NAME="$PROJECT_NAME" PG_PORT=5432 API_PORT=3001 NEXT_PORT=3000 \
      bash "$SCRIPT_DIR/stack-up-docker.sh" --rebuild
    pnpm --filter @sfx/database prisma migrate deploy
  else
    echo "[post-merge-canonical] migrate deploy failed without P3009 — see log"
    exit 1
  fi
fi

echo "[post-merge-canonical] pnpm db:seed"
pnpm db:seed || echo "[post-merge-canonical] WARN: db:seed exited non-zero"

# Restart api so it picks up the migrated DB without race against bridge's
# auto-reload. nest --watch reloads on source changes but not on DB schema
# changes — the connection pool keeps stale prepared statements.
echo "[post-merge-canonical] restart api"
docker compose -p "$PROJECT_NAME" restart api 2>&1 | tail -3 || true

# Smoke-test baseline endpoints that exist in every seeded boilerplate app.
# Feature-specific routes are covered by probes; hard-coding one here makes
# clean boilerplate reseeds look like infra failures when that feature is absent.
#
# Readiness poll: `docker compose restart api` returns as soon as the container
# is up, but NestJS still needs ~3-8s to register routes and bind. The host
# port mapping is active immediately, so `curl` accepts the TCP connection
# during the bind window and returns "empty reply" (exit 52) — looks like a
# real failure. Poll /api/v1/health until it returns 2xx (health is the
# fastest route to register), then run the smoke battery against the
# now-bound API. This replaces the hard-coded `sleep 4`.
echo "[post-merge-canonical] canonical smoke check"
HOST="${POST_MERGE_HOST:-host.docker.internal}"
READY_TIMEOUT="${POST_MERGE_READY_TIMEOUT:-60}"
READY_DEADLINE=$(( $(date +%s) + READY_TIMEOUT ))
echo "[post-merge-canonical] waiting up to ${READY_TIMEOUT}s for api to bind..."
while true; do
  ready_code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 "http://${HOST}:3001/api/v1/health" 2>/dev/null || echo 000)
  case "$ready_code" in
    2*|401|403)
      echo "[post-merge-canonical]   api ready (health -> $ready_code)"
      break
      ;;
  esac
  if [ "$(date +%s)" -ge "$READY_DEADLINE" ]; then
    echo "[post-merge-canonical] FAIL: api never bound within ${READY_TIMEOUT}s (last code: $ready_code)"
    docker logs --tail 50 "${PROJECT_NAME}-api-1" 2>&1 || true
    exit 1
  fi
  sleep 1
done
SMOKE_FAIL=0
for path in /api/v1/health /api/docs-json; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "http://${HOST}:3001${path}" || echo 000)
  echo "[post-merge-canonical]   GET $path -> $code"
  case "$code" in
    2*|401|403) ;;
    *) SMOKE_FAIL=1 ;;
  esac
done
if [ "$SMOKE_FAIL" = "1" ]; then
  echo "[post-merge-canonical] FAIL: canonical baseline smoke check failed — investigate"
  docker logs --tail 30 "${PROJECT_NAME}-api-1" 2>&1 || true
  exit 1
fi

echo "[post-merge-canonical] done"
