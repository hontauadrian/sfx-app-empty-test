import { strict as assert } from "node:assert";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function parseEnvOutput(output) {
  return Object.fromEntries(
    output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      }),
  );
}

describe("stack-up-docker worktree ports", () => {
  it("does not require Bun to generate docker compose overrides", () => {
    const script = readFileSync(join(REPO_ROOT, "scripts", "stack-up-docker.sh"), "utf8");

    assert.doesNotMatch(script, /\bbun --eval\b/);
    assert.match(script, /\bnode --eval\b/);
  });

  it("writes browser-facing OAuth values to web .env.local for cached worker images", () => {
    const script = readFileSync(join(REPO_ROOT, "scripts", "stack-up-docker.sh"), "utf8");

    assert.match(script, /upsert_web_env_var "NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI"/);
    assert.match(script, /upsert_web_env_var "NEXT_PUBLIC_OIDC_LOGOUT_ENDPOINT"/);
    assert.match(script, /upsert_web_env_var "NEXT_PUBLIC_OAUTH2_PROXY_CLIENT_ID"/);
  });

  it("rewrites OAuth URLs for canonical stacks with dynamic proxy and Keycloak ports", () => {
    const tempRoot = join(tmpdir(), `stack-up-docker-canonical-${Date.now()}`);
    const scriptsDir = join(tempRoot, "scripts");

    try {
      mkdirSync(scriptsDir, { recursive: true });
      copyFileSync(
        join(REPO_ROOT, "scripts", "stack-up-docker.sh"),
        join(scriptsDir, "stack-up-docker.sh"),
      );
      writeFileSync(join(tempRoot, "package.json"), JSON.stringify({ name: "sfx-webapp-boilerplate" }));

      const output = execFileSync("bash", [join(scriptsDir, "stack-up-docker.sh")], {
        cwd: tempRoot,
        env: {
          ...process.env,
          PROJECT_NAME: "app-dev-host",
          PG_PORT: "5432",
          API_PORT: "3001",
          NEXT_PORT: "3000",
          APP_PROXY_PORT: "36176",
          KEYCLOAK_PORT: "37176",
          SFX_STACK_PRINT_PORT_ENV: "1",
        },
        encoding: "utf8",
      });
      const envOutput = parseEnvOutput(output);

      assert.equal(
        envOutput.OAUTH_ISSUER_URL,
        "http://keycloak.localtest.me:37176/realms/sfx-webapp-boilerplate",
      );
      assert.equal(
        envOutput.OAUTH_JWKS_URL,
        "http://keycloak.localtest.me:37176/realms/sfx-webapp-boilerplate/protocol/openid-connect/certs",
      );
      assert.equal(
        envOutput.OAUTH2_PROXY_REDIRECT_URL,
        "http://app.localtest.me:36176/oauth2/callback",
      );
      assert.equal(envOutput.OAUTH2_PROXY_WHITELIST_DOMAIN, "keycloak.localtest.me:37176");
      assert.equal(envOutput.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI, "http://app.localtest.me:36176/");
      assert.equal(
        envOutput.NEXT_PUBLIC_OIDC_LOGOUT_ENDPOINT,
        "http://keycloak.localtest.me:37176/realms/sfx-webapp-boilerplate/protocol/openid-connect/logout",
      );
      assert.equal(envOutput.NEXT_PUBLIC_OAUTH2_PROXY_CLIENT_ID, "sfx-webapp-boilerplate-dev-proxy");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("ignores canonical .env port pins in worker worktrees and rewrites OAuth URLs", () => {
    const tempRoot = join(tmpdir(), `stack-up-docker-${Date.now()}`);
    const worktreeRoot = join(tempRoot, ".overstory", "worktrees", "probe-worker");
    const scriptsDir = join(worktreeRoot, "scripts");

    try {
      mkdirSync(scriptsDir, { recursive: true });
      copyFileSync(
        join(REPO_ROOT, "scripts", "stack-up-docker.sh"),
        join(scriptsDir, "stack-up-docker.sh"),
      );
      writeFileSync(
        join(worktreeRoot, "package.json"),
        JSON.stringify({ name: "@customer/Generated App" }),
      );
      writeFileSync(
        join(worktreeRoot, ".env"),
        [
          "APP_PROXY_PORT=4181",
          "KEYCLOAK_PORT=9080",
          "OAUTH_ISSUER_URL=http://keycloak.localtest.me:9080/realms/wrong",
          "OAUTH_JWKS_URL=http://keycloak.localtest.me:9080/realms/wrong/protocol/openid-connect/certs",
          "OAUTH2_PROXY_REDIRECT_URL=http://app.localtest.me:4181/oauth2/callback",
        ].join("\n"),
      );

      const output = execFileSync("bash", [join(scriptsDir, "stack-up-docker.sh")], {
        cwd: worktreeRoot,
        env: {
          ...process.env,
          SFX_STACK_PRINT_PORT_ENV: "1",
        },
        encoding: "utf8",
      });
      const envOutput = parseEnvOutput(output);

      assert.notEqual(envOutput.APP_PROXY_PORT, "4181");
      assert.notEqual(envOutput.KEYCLOAK_PORT, "9080");
      assert.match(envOutput.APP_PROXY_PORT, /^36\d{3}$/);
      assert.match(envOutput.KEYCLOAK_PORT, /^37\d{3}$/);
      assert.equal(
        envOutput.OAUTH_ISSUER_URL,
        `http://keycloak.localtest.me:${envOutput.KEYCLOAK_PORT}/realms/generated-app`,
      );
      assert.equal(
        envOutput.OAUTH_JWKS_URL,
        `${envOutput.OAUTH_ISSUER_URL}/protocol/openid-connect/certs`,
      );
      assert.equal(
        envOutput.OAUTH2_PROXY_REDIRECT_URL,
        `http://app.localtest.me:${envOutput.APP_PROXY_PORT}/oauth2/callback`,
      );
      assert.equal(
        envOutput.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI,
        `http://app.localtest.me:${envOutput.APP_PROXY_PORT}/`,
      );
      assert.equal(
        envOutput.NEXT_PUBLIC_OIDC_LOGOUT_ENDPOINT,
        `${envOutput.OAUTH_ISSUER_URL}/protocol/openid-connect/logout`,
      );
      assert.equal(envOutput.NEXT_PUBLIC_OAUTH2_PROXY_CLIENT_ID, "generated-app-dev-proxy");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("allows fixed worktree ports only with explicit debug opt-in", () => {
    const tempRoot = join(tmpdir(), `stack-up-docker-fixed-${Date.now()}`);
    const worktreeRoot = join(tempRoot, ".overstory", "worktrees", "probe-worker");
    const scriptsDir = join(worktreeRoot, "scripts");

    try {
      mkdirSync(scriptsDir, { recursive: true });
      copyFileSync(
        join(REPO_ROOT, "scripts", "stack-up-docker.sh"),
        join(scriptsDir, "stack-up-docker.sh"),
      );
      writeFileSync(join(worktreeRoot, "package.json"), JSON.stringify({ name: "fixed-app" }));
      writeFileSync(
        join(worktreeRoot, ".env"),
        [
          "APP_PROXY_PORT=4181",
          "KEYCLOAK_PORT=9080",
          "OAUTH_ISSUER_URL=http://keycloak.localtest.me:9080/realms/fixed-app",
          "OAUTH_JWKS_URL=http://keycloak.localtest.me:9080/realms/fixed-app/protocol/openid-connect/certs",
          "OAUTH2_PROXY_REDIRECT_URL=http://app.localtest.me:4181/oauth2/callback",
        ].join("\n"),
      );

      const output = execFileSync("bash", [join(scriptsDir, "stack-up-docker.sh")], {
        cwd: worktreeRoot,
        env: {
          ...process.env,
          SFX_STACK_ALLOW_FIXED_PORTS: "1",
          SFX_STACK_PRINT_PORT_ENV: "1",
        },
        encoding: "utf8",
      });
      const envOutput = parseEnvOutput(output);

      assert.equal(envOutput.APP_PROXY_PORT, "4181");
      assert.equal(envOutput.KEYCLOAK_PORT, "9080");
      assert.equal(
        envOutput.OAUTH2_PROXY_REDIRECT_URL,
        "http://app.localtest.me:4181/oauth2/callback",
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
