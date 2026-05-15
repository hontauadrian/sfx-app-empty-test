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
    // `--api-route=^/api/` is the load-bearing flag that turns the
    // oauth2-proxy from "redirect everything to login" into "401 for
    // unauth API calls, redirect to login only for browser routes".
    // Without it, every contract probe step that exercises an unauth
    // API endpoint sees 302 (oauth2-proxy redirecting to Keycloak)
    // instead of 401 (the actual `JwtAuthGuard` decision), and
    // `unauth-anonymous-rejected` flows fail. Pinned here so a
    // future config refactor does not drop it.
    assert.match(compose, /--api-route=\^\/api\//);
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
    assert.match(dockerfile, /NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI/);
    assert.match(dockerfile, /NEXT_PUBLIC_OIDC_LOGOUT_ENDPOINT/);
    assert.match(dockerfile, /NEXT_PUBLIC_OAUTH2_PROXY_CLIENT_ID/);
    assert.doesNotMatch(dockerfile, /if \[ -n "\$NEXT_PUBLIC_API_URL" \]/);
  });

  it("declares keycloak.localtest.me:host-gateway on api and oauth2-proxy", () => {
    // Single-hostname strategy: OAUTH_ISSUER_URL uses keycloak.localtest.me
    // so browsers (which resolve the hostname via *.localtest.me public
    // wildcard DNS) and server-side consumers (which resolve it via this
    // extra_hosts entry mapped to the host gateway) agree on the iss claim
    // they observe in tokens. The api service validates iss against
    // OAUTH_ISSUER_URL — without this mapping, the api can't fetch JWKS
    // from inside its container.
    const compose = readFileSync(join(REPO_ROOT, "docker-compose.yml"), "utf8");
    const apiSection = compose.match(/^\s{2}api:[\s\S]*?(?=^\s{2}\S|\Z)/m)?.[0] ?? "";
    const proxySection = compose.match(/^\s{2}app-oauth2-proxy:[\s\S]*?(?=^\s{2}\S|\Z)/m)?.[0] ?? "";

    assert.notEqual(apiSection, "", "expected api: service block in docker-compose.yml");
    assert.notEqual(proxySection, "", "expected app-oauth2-proxy: service block in docker-compose.yml");
    assert.match(apiSection, /keycloak\.localtest\.me:host-gateway/);
    assert.match(proxySection, /keycloak\.localtest\.me:host-gateway/);
  });

  it("declares host.docker.internal:host-gateway on api and oauth2-proxy for Linux portability", () => {
    // Auto-provided on Docker Desktop, missing on Linux. Declared so dev
    // tooling that hard-codes this hostname (db tunnels, port forwarders,
    // etc.) keeps working in Linux CI even though the OAuth flow itself
    // uses keycloak.localtest.me.
    const compose = readFileSync(join(REPO_ROOT, "docker-compose.yml"), "utf8");
    const apiSection = compose.match(/^\s{2}api:[\s\S]*?(?=^\s{2}\S|\Z)/m)?.[0] ?? "";
    const proxySection = compose.match(/^\s{2}app-oauth2-proxy:[\s\S]*?(?=^\s{2}\S|\Z)/m)?.[0] ?? "";

    assert.notEqual(apiSection, "", "expected api: service block in docker-compose.yml");
    assert.notEqual(proxySection, "", "expected app-oauth2-proxy: service block in docker-compose.yml");
    assert.match(apiSection, /host\.docker\.internal:host-gateway/);
    assert.match(proxySection, /host\.docker\.internal:host-gateway/);
  });

  it("defaults OAUTH_ISSUER_URL/JWKS_URL to keycloak.localtest.me (single-hostname strategy)", () => {
    // The same hostname must work from real browsers (primary stack human
    // users) AND from server-side consumers (api, oauth2-proxy, panel
    // running probes). keycloak.localtest.me satisfies both: public
    // wildcard DNS resolves it to 127.0.0.1 in browsers; extra_hosts
    // mapping resolves it to the host gateway from inside containers.
    const compose = readFileSync(join(REPO_ROOT, "docker-compose.yml"), "utf8");

    assert.match(
      compose,
      /OAUTH_ISSUER_URL=\$\{OAUTH_ISSUER_URL:-http:\/\/keycloak\.localtest\.me:9080\/realms\/sfx-webapp-boilerplate\}/,
    );
    assert.match(
      compose,
      /OAUTH_JWKS_URL=\$\{OAUTH_JWKS_URL:-http:\/\/keycloak\.localtest\.me:9080\/realms\/sfx-webapp-boilerplate\/protocol\/openid-connect\/certs\}/,
    );
    assert.doesNotMatch(
      compose,
      /OAUTH_ISSUER_URL=\$\{OAUTH_ISSUER_URL:-http:\/\/host\.docker\.internal/,
      "default issuer URL must not point at host.docker.internal — real browsers can't resolve Docker-only hostnames, so primary-stack human users would fail at the OIDC redirect",
    );
  });
});
