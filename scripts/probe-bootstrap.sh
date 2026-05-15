#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd -P)"
cd "$PROJECT_DIR"

step() { printf '[probe-bootstrap] %s\n' "$1"; }
fail() { printf '[probe-bootstrap] FATAL: %s\n' "$1" >&2; exit 1; }

has_script() {
  node -e "const p=require('./package.json'); process.exit(p.scripts&&p.scripts['$1']?0:1)" 2>/dev/null
}

hydrate_stack_runtime_env() {
  [ -f ".stack.json" ] || return 0

  # The values must survive across the `&&`-chained `pnpm probe:smoke`
  # pipeline (probe-bootstrap.sh && pnpm openapi:check &&
  # probe-run-with-ownership-check.sh). Each segment runs in its own bash
  # subshell, so plain `export` from this script's process dies at the
  # first `&&`. We materialise the values two ways:
  #
  #   1. .env.runtime — a sourceable file the next pipeline segment can
  #      `set -a; . .env.runtime; set +a`. Treated as a transient artefact;
  #      regenerated on every probe-bootstrap invocation.
  #   2. .env — upserted in place so dotenv-driven readers (pnpm scripts
  #      via dotenvy/dotenv-flow, the Nest API at integration-test boot)
  #      see the live values without needing to source anything explicitly.
  #
  # In a healthy worker stack, scripts/stack-up-docker.sh has already
  # written these into .env. This is the safety net for the rare case
  # where probe:smoke runs without a fresh stack:up (idempotent green
  # path, manual debugging, etc.).
  local runtime_env_file=".env.runtime"
  : > "$runtime_env_file"
  node >> "$runtime_env_file" <<'NODE'
const fs = require('node:fs');

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function normalizeRealmName(rawName) {
  return String(rawName || 'sfx-webapp-boilerplate')
    .replace(/^@[^/]+\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'sfx-webapp-boilerplate';
}

const stack = JSON.parse(fs.readFileSync('.stack.json', 'utf8'));
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const realmName = normalizeRealmName(packageJson.name);
const stackHost = typeof stack.host === 'string' && stack.host.length > 0
  ? stack.host
  : 'host.docker.internal';
const keycloakPort = stack.keycloak_port;
const proxyPort = stack.proxy_port;

// OAuth issuer/JWKS use keycloak.localtest.me explicitly — NOT stackHost.
// stackHost is the script-context hostname for api/web health probes
// (`host.docker.internal` from inside the panel container, `localhost` from
// the host shell). OAuth URLs are special: they must match the iss claim
// the api validates against, which the api gets from OAUTH_ISSUER_URL in
// docker-compose.yml — that defaults to keycloak.localtest.me. If we built
// the OAuth fallback from stackHost the probe would fetch tokens via
// host.docker.internal, getting iss=host.docker.internal:<port>, while the
// api expects iss=keycloak.localtest.me:<port>, causing 401 on every
// authenticated probe step. See sfx-team-panel/docker-compose.yml for the
// extra_hosts entry that makes keycloak.localtest.me resolvable from
// inside the panel container.
const oauthHost = 'keycloak.localtest.me';

const values = {
  OAUTH_ISSUER_URL: stack.oauth_issuer_url || (keycloakPort
    ? 'http://' + oauthHost + ':' + keycloakPort + '/realms/' + realmName
    : undefined),
  OAUTH_JWKS_URL: stack.oauth_jwks_url || (keycloakPort
    ? 'http://' + oauthHost + ':' + keycloakPort + '/realms/' + realmName + '/protocol/openid-connect/certs'
    : undefined),
  OAUTH_API_CLIENT_ID: realmName + '-dev-api',
  OAUTH_AUDIENCE: realmName + '-dev-api',
  OAUTH2_PROXY_CLIENT_ID: realmName + '-dev-proxy',
  OAUTH2_PROXY_CLIENT_SECRET: process.env.OAUTH2_PROXY_CLIENT_SECRET || 'dev-generated-app-proxy-secret',
  OAUTH2_PROXY_REDIRECT_URL: stack.oauth2_proxy_redirect_url || (proxyPort
    ? 'http://app.localtest.me:' + proxyPort + '/oauth2/callback'
    : undefined),
  KEYCLOAK_PORT: keycloakPort != null ? String(keycloakPort) : undefined,
  APP_PROXY_PORT: proxyPort != null ? String(proxyPort) : undefined,
  PG_PORT: stack.pg_port != null ? String(stack.pg_port) : undefined,
  API_PORT: stack.api_port != null ? String(stack.api_port) : undefined,
  NEXT_PORT: stack.web_port != null ? String(stack.web_port) : undefined,
};

for (const [key, value] of Object.entries(values)) {
  if (value) console.log('export ' + key + '=' + shellQuote(value));
}
NODE
  # shellcheck disable=SC1090
  . "$runtime_env_file"

  # Upsert into .env so the next `&&`-chained shell (which loads .env via
  # pnpm/dotenv) sees these values. Idempotent: replaces the line if the
  # key exists, appends otherwise.
  upsert_dotenv_var() {
    local _key="$1"
    local _value="$2"
    [ -n "$_value" ] || return 0
    [ -f .env ] || return 0
    if grep -q "^[[:space:]]*${_key}=" .env 2>/dev/null; then
      _tmp="$(mktemp ".env.XXXXXX")"
      if awk -v key="$_key" -v value="$_value" '
        BEGIN { replaced = 0 }
        $0 ~ "^[[:space:]]*" key "=" { print key "=" value; replaced = 1; next }
        { print }
        END { if (!replaced) print key "=" value }
      ' .env > "$_tmp"; then
        mv "$_tmp" .env
      else
        rm -f "$_tmp"
      fi
    else
      printf '%s=%s\n' "$_key" "$_value" >> .env
    fi
  }
  for _var in OAUTH_ISSUER_URL OAUTH_JWKS_URL OAUTH_API_CLIENT_ID OAUTH_AUDIENCE \
              OAUTH2_PROXY_CLIENT_ID OAUTH2_PROXY_CLIENT_SECRET OAUTH2_PROXY_REDIRECT_URL \
              KEYCLOAK_PORT APP_PROXY_PORT PG_PORT API_PORT NEXT_PORT; do
    upsert_dotenv_var "$_var" "$(eval "printf '%s' \"\${${_var}:-}\"")"
  done
}

if [ "${1:-}" = "--hydrate-only" ]; then
  # Diagnostic / test mode: run only the .stack.json → env hydration step
  # and exit. Useful for regression tests that exercise the upsert logic
  # without booting docker compose.
  hydrate_stack_runtime_env
  exit 0
fi

step "1/6 ensure stack is up"

declare -A env_targets=()

if [ -f "panel.config.json" ]; then
  while IFS= read -r target; do
    [ -n "$target" ] && env_targets["$target"]=1
  done < <(node -e "try{const c=require('./panel.config.json'); for (const f of (c.env&&c.env.files)||[]) if (f.path) console.log(f.path)}catch(e){}" 2>/dev/null)
fi

while IFS= read -r example; do
  dir="$(dirname "$example")"
  env_targets["$dir/.env"]=1
  if [ "$dir" = "./apps/web" ] || [ -f "$dir/next.config.ts" ] || [ -f "$dir/next.config.js" ] || [ -f "$dir/next.config.mjs" ]; then
    env_targets["$dir/.env.local"]=1
  fi
done < <(find . -maxdepth 3 -name '.env.example' -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null)

for target in "${!env_targets[@]}"; do
  [ -e "$target" ] && continue
  dir="$(dirname "$target")"
  for candidate in "${target}.example" "$dir/.env.example"; do
    if [ -f "$candidate" ]; then
      cp "$candidate" "$target"
      break
    fi
  done
done

if [ ! -d "node_modules" ]; then
  pnpm --silent install >/dev/null 2>&1 || fail "pnpm install failed — run 'pnpm install' directly to see error"
fi

needs_build=0
for pkg_json in packages/*/package.json; do
  [ -f "$pkg_json" ] || continue
  pkg_dir="$(dirname "$pkg_json")"
  main="$(node -e "const p=require('./$pkg_json'); console.log(p.main||'')" 2>/dev/null)"
  if [ -n "$main" ] && [ ! -f "$pkg_dir/$main" ]; then
    needs_build=1
    break
  fi
done
if [ "$needs_build" -eq 1 ]; then
  if has_script build; then
    pnpm --silent build --filter "!./apps/web" >/dev/null 2>&1 \
      || pnpm --silent build >/dev/null 2>&1 \
      || fail "pnpm build failed — run 'pnpm build' directly to see error"
  fi
fi

if has_script stack:up; then
  pnpm --silent stack:up >/dev/null || fail "stack:up failed — run 'pnpm stack:up' directly to see error"
fi

hydrate_stack_runtime_env

if has_script db:migrate:deploy; then
  step "2/6 apply pending migrations"
  pnpm --silent db:migrate:deploy >/dev/null || fail "db:migrate:deploy failed — check schema or DB connectivity"
fi

if has_script db:generate; then
  step "3/6 regenerate prisma client"
  pnpm --silent db:generate >/dev/null 2>&1 || fail "db:generate failed"
fi

if has_script stack:reload-api; then
  step "4/6 reload api container (apply prisma client + dist)"
  reload_out="$(pnpm --silent stack:reload-api 2>&1 || true)"
  if printf '%s' "$reload_out" | grep -q 'is not running'; then
    step "  api was freshly booted — skipping reload"
  elif printf '%s' "$reload_out" | grep -q 'api healthy'; then
    printf '%s\n' "$reload_out" | grep -E 'api healthy|Restarting|Started' | tail -3
  else
    printf '%s\n' "$reload_out" | tail -3
    fail "stack:reload-api did not confirm health — check 'pnpm stack:logs api'"
  fi
fi

step "5/6 regenerate openapi.json"
if pnpm --silent openapi:dump >/dev/null 2>&1; then
  :
elif pnpm --silent -r openapi:dump >/dev/null 2>&1; then
  :
else
  step "  openapi:dump script not found — skipping (assuming swagger is regenerated by the running api)"
fi

if has_script db:reset:fast; then
  step "6/6 reset db data (truncate + seed)"
  # db-reset-fast.sh runs its own smart wait on pg_stat_activity (waits for
  # api prisma connections to reach 'idle' before TRUNCATE), so the
  # bootstrap doesn't need a magic sleep here. We do still capture stderr
  # so the real reason surfaces on failure instead of an opaque FATAL.
  reset_output="$(pnpm --silent db:reset:fast 2>&1)"
  reset_exit=$?
  if [ "$reset_exit" -ne 0 ]; then
    printf '%s\n' "$reset_output" >&2
    fail "db:reset:fast failed (exit=$reset_exit) — see output above"
  fi

  step "6.5/6 reload api container (invalidate post-seed cache)"
  pnpm --silent stack:reload-api >/dev/null \
    || fail "stack:reload-api after seed did not confirm health — check 'pnpm stack:logs api'"
fi

step "ready — probe can now run"
