import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("docker-compose oauth2-proxy baseline", () => {
  it("protects generated app web and API traffic through oauth2-proxy", () => {
    const compose = readFileSync(join(REPO_ROOT, "docker-compose.yml"), "utf8");

    assert.match(compose, /app-oauth2-proxy:/);
    assert.match(compose, /--provider=keycloak-oidc/);
    assert.match(compose, /--upstream=http:\/\/api:3001\/api\/v1\//);
    assert.match(compose, /--upstream=http:\/\/api:3001\/api\/docs-json/);
    assert.match(compose, /--upstream=http:\/\/api:3001\/api\/docs\//);
    assert.match(compose, /--upstream=http:\/\/api:3001\/api\/docs/);
    assert.match(compose, /--upstream=http:\/\/web:3000\//);
    assert.match(compose, /--skip-auth-route=GET=\^\/api\/docs/);
    assert.match(compose, /--set-authorization-header=true/);
    assert.match(compose, /--pass-authorization-header=true/);
    assert.match(compose, /--pass-access-token=true/);
    assert.match(compose, /--whitelist-domain=\$\{OAUTH2_PROXY_WHITELIST_DOMAIN:-keycloak\.localtest\.me:9080\}/);
    assert.match(compose, /--cookie-secure=\$\{OAUTH2_PROXY_COOKIE_SECURE:-false\}/);
    assert.doesNotMatch(compose, /--cookie-domain=/);
    assert.match(compose, /keycloak:/);
    assert.match(compose, /keycloak-bootstrap:/);
    assert.match(compose, /condition: service_completed_successfully/);
    assert.doesNotMatch(compose, /\.\/apps\/api\/\.env:\/app\/apps\/api\/\.env/);
    assert.doesNotMatch(compose, /\.\/apps\/web\/\.env\.local:\/app\/apps\/web\/\.env\.local/);
  });

  it("allows the compose default to bake same-origin API requests into the web image", () => {
    const dockerfile = readFileSync(join(REPO_ROOT, "apps/web/Dockerfile"), "utf8");

    assert.match(dockerfile, /echo "NEXT_PUBLIC_API_URL=\$NEXT_PUBLIC_API_URL"/);
    assert.doesNotMatch(dockerfile, /if \[ -n "\$NEXT_PUBLIC_API_URL" \]/);
  });
});
