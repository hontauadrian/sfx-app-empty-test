import { strict as assert } from "node:assert";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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
