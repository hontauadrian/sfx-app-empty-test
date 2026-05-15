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
      assert.equal(envOutput.OAUTH2_PROXY_WHITELIST_DOMAIN, `keycloak.localtest.me:${envOutput.KEYCLOAK_PORT}`);
      assert.equal(envOutput.NEXT_PUBLIC_OAUTH2_PROXY_CLIENT_ID, "generated-app-dev-proxy");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("rewrites stale dynamic OAuth/PORT keys in the worker .env on stack:up", () => {
    const tempRoot = join(tmpdir(), `stack-up-docker-syncenv-${Date.now()}`);
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
        JSON.stringify({ name: "sfx-webapp-boilerplate" }),
      );
      const stalePins = [
        "POSTGRES_USER=app",
        "POSTGRES_PASSWORD=app",
        "POSTGRES_DB=app_db",
        "APP_PROXY_PORT=4181",
        "KEYCLOAK_PORT=9080",
        "OAUTH_ISSUER_URL=http://keycloak.localtest.me:9080/realms/sfx-webapp-boilerplate",
        "OAUTH_JWKS_URL=http://keycloak.localtest.me:9080/realms/sfx-webapp-boilerplate/protocol/openid-connect/certs",
        "OAUTH2_PROXY_REDIRECT_URL=http://app.localtest.me:4181/oauth2/callback",
        "NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI=http://app.localtest.me:4181/",
        "OAUTH2_PROXY_CLIENT_SECRET=keep-me-untouched",
        "",
      ].join("\n");
      writeFileSync(join(worktreeRoot, ".env"), stalePins);

      execFileSync("bash", [join(scriptsDir, "stack-up-docker.sh")], {
        cwd: worktreeRoot,
        env: {
          ...process.env,
          SFX_STACK_PRINT_PORT_ENV: "1",
          SFX_STACK_SYNC_WORKER_ENV: "1",
        },
        encoding: "utf8",
      });

      const updatedEnv = readFileSync(join(worktreeRoot, ".env"), "utf8");
      const envMap = Object.fromEntries(
        updatedEnv
          .trim()
          .split("\n")
          .filter(Boolean)
          .filter((line) => !line.startsWith("#"))
          .map((line) => {
            const idx = line.indexOf("=");
            return [line.slice(0, idx), line.slice(idx + 1)];
          }),
      );

      assert.notEqual(envMap.KEYCLOAK_PORT, "9080", "stale boilerplate Keycloak port must be replaced");
      assert.notEqual(envMap.APP_PROXY_PORT, "4181", "stale boilerplate proxy port must be replaced");
      assert.match(envMap.KEYCLOAK_PORT, /^37\d{3}$/);
      assert.match(envMap.APP_PROXY_PORT, /^36\d{3}$/);
      assert.equal(
        envMap.OAUTH_ISSUER_URL,
        `http://keycloak.localtest.me:${envMap.KEYCLOAK_PORT}/realms/sfx-webapp-boilerplate`,
        "issuer URL must use keycloak.localtest.me — single-hostname strategy. Browsers reach it via *.localtest.me public wildcard DNS; api/oauth2-proxy/panel containers reach it via extra_hosts mapping to host-gateway. Both paths produce identical iss claims, so api validation succeeds for browser-issued and probe-issued tokens.",
      );
      assert.equal(
        envMap.OAUTH_JWKS_URL,
        `${envMap.OAUTH_ISSUER_URL}/protocol/openid-connect/certs`,
      );
      assert.equal(
        envMap.OAUTH2_PROXY_REDIRECT_URL,
        `http://app.localtest.me:${envMap.APP_PROXY_PORT}/oauth2/callback`,
      );
      assert.equal(
        envMap.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI,
        `http://app.localtest.me:${envMap.APP_PROXY_PORT}/`,
      );
      assert.equal(
        envMap.OAUTH2_PROXY_CLIENT_SECRET,
        "keep-me-untouched",
        "non-managed keys in .env must be preserved",
      );
      assert.equal(envMap.POSTGRES_DB, "app_db");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("leaves canonical app-dev-host .env alone (worker-only sync)", () => {
    const tempRoot = join(tmpdir(), `stack-up-docker-canonical-noenv-${Date.now()}`);
    const scriptsDir = join(tempRoot, "scripts");

    try {
      mkdirSync(scriptsDir, { recursive: true });
      copyFileSync(
        join(REPO_ROOT, "scripts", "stack-up-docker.sh"),
        join(scriptsDir, "stack-up-docker.sh"),
      );
      writeFileSync(join(tempRoot, "package.json"), JSON.stringify({ name: "sfx-webapp-boilerplate" }));
      const canonicalEnv = [
        "POSTGRES_USER=app",
        "KEYCLOAK_PORT=9080",
        "OAUTH_ISSUER_URL=http://keycloak.localtest.me:9080/realms/sfx-webapp-boilerplate",
        "",
      ].join("\n");
      writeFileSync(join(tempRoot, ".env"), canonicalEnv);

      execFileSync("bash", [join(scriptsDir, "stack-up-docker.sh")], {
        cwd: tempRoot,
        env: {
          ...process.env,
          PROJECT_NAME: "app-dev-host",
          PG_PORT: "5432",
          API_PORT: "3001",
          NEXT_PORT: "3000",
          APP_PROXY_PORT: "4181",
          KEYCLOAK_PORT: "9080",
          SFX_STACK_PRINT_PORT_ENV: "1",
          SFX_STACK_SYNC_WORKER_ENV: "1",
        },
        encoding: "utf8",
      });

      const after = readFileSync(join(tempRoot, ".env"), "utf8");
      assert.equal(after, canonicalEnv, "canonical .env must not be rewritten by worker-only sync");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("does not warn about /etc/hosts host.docker.internal when running inside a container", () => {
    // QA probe agents run `pnpm stack:up` from inside the SFX panel container,
    // where Docker provides host.docker.internal via its DNS — NOT via /etc/hosts.
    // The historical /etc/hosts grep always fails inside containers and floods
    // probe:smoke output with a false-positive WARN. The fix is `[ ! -f /.dockerenv ]`
    // gating: skip the check when the marker file (created by every Docker
    // image at build time) is present.
    const script = readFileSync(join(REPO_ROOT, "scripts", "stack-up-docker.sh"), "utf8");

    assert.ok(
      script.includes("[ ! -f /.dockerenv ] && ! grep -q") &&
        script.includes("host\\.docker\\.internal") &&
        script.includes("/etc/hosts"),
      "/etc/hosts host.docker.internal warning must be gated on `[ ! -f /.dockerenv ]` so it never fires inside containers",
    );
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

  it("caps `pnpm install --frozen-lockfile` with a timeout watchdog so a registry hang surfaces fast", () => {
    // 2026-05-15 incident: a closeout-gate-driven re-run of probe:smoke
    // entered the install branch (NEEDS_INSTALL=1) and `pnpm install
    // --frozen-lockfile` then hung for 7+ minutes with no progress,
    // stalling the version-builder Stop hook chain. Manual SIGTERM cleanup
    // was the only way out. The probe-bootstrap fast-path prevents this
    // chain from being re-entered in the hot probe scenario, but the
    // timeout watchdog below makes any future regression surface within
    // STACK_INSTALL_TIMEOUT seconds (default 300) instead of holding the
    // builder hostage. Pin the wiring here so a future refactor can't
    // drop it silently.
    const script = readFileSync(join(REPO_ROOT, "scripts", "stack-up-docker.sh"), "utf8");

    assert.match(
      script,
      /STACK_INSTALL_TIMEOUT="\$\{STACK_INSTALL_TIMEOUT:-300\}"/,
      "stack-up-docker.sh must expose a STACK_INSTALL_TIMEOUT env override (default 300s)",
    );
    assert.match(
      script,
      /timeout\s+"\$\{STACK_INSTALL_TIMEOUT\}"\s+sh\s+-c\s+'NODE_ENV=development pnpm install --frozen-lockfile/,
      "pnpm install --frozen-lockfile must be wrapped in `timeout ${STACK_INSTALL_TIMEOUT}` to bound a registry/store hang",
    );
    assert.match(
      script,
      /install_exit=\$\{PIPESTATUS\[0\]\}[\s\S]*if\s+\[\s*"\$install_exit"\s*=\s*"124"\s*\];\s*then[\s\S]*timed out/,
      "the failure branch must distinguish the timeout exit code (124) from a generic install failure",
    );
  });
});
