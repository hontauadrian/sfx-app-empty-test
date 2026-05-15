import { strict as assert } from "node:assert";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function setupHydrateFixture(label, { stack, packageJson, envContents }) {
  const tempRoot = join(tmpdir(), `probe-bootstrap-${label}-${Date.now()}-${process.pid}`);
  const scriptsDir = join(tempRoot, "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  copyFileSync(
    join(REPO_ROOT, "scripts", "probe-bootstrap.sh"),
    join(scriptsDir, "probe-bootstrap.sh"),
  );
  writeFileSync(join(tempRoot, "package.json"), JSON.stringify(packageJson));
  writeFileSync(join(tempRoot, ".stack.json"), JSON.stringify(stack));
  if (envContents !== undefined) {
    writeFileSync(join(tempRoot, ".env"), envContents);
  }
  return { tempRoot, scriptsDir };
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  return Object.fromEntries(
    readFileSync(filePath, "utf8")
      .split("\n")
      .map((line) => line.trim().replace(/^export\s+/, ""))
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const idx = line.indexOf("=");
        return [line.slice(0, idx), line.slice(idx + 1).replace(/^'(.*)'$/, "$1")];
      }),
  );
}

describe("probe-bootstrap hydrate persistence", () => {
  it("upserts stack.json port values into .env so the next pipeline step sees them", () => {
    const { tempRoot, scriptsDir } = setupHydrateFixture("upsert-into-stale-env", {
      stack: {
        pg_port: 6903,
        api_port: 16903,
        web_port: 26903,
        proxy_port: 36903,
        keycloak_port: 37903,
        host: "host.docker.internal",
        oauth_issuer_url:
          "http://keycloak.localtest.me:37903/realms/sfx-webapp-boilerplate",
        oauth_jwks_url:
          "http://keycloak.localtest.me:37903/realms/sfx-webapp-boilerplate/protocol/openid-connect/certs",
        oauth2_proxy_redirect_url: "http://app.localtest.me:36903/oauth2/callback",
        is_worktree: true,
      },
      packageJson: { name: "sfx-webapp-boilerplate" },
      envContents: [
        "POSTGRES_USER=app",
        "POSTGRES_PASSWORD=app",
        "POSTGRES_DB=app_db",
        "JWT_SECRET=keep-me",
        "KEYCLOAK_PORT=9080",
        "OAUTH_ISSUER_URL=http://keycloak.localtest.me:9080/realms/wrong",
        "",
      ].join("\n"),
    });

    try {
      execFileSync("bash", [join(scriptsDir, "probe-bootstrap.sh"), "--hydrate-only"], {
        cwd: tempRoot,
        env: { ...process.env },
        encoding: "utf8",
      });

      const env = parseEnvFile(join(tempRoot, ".env"));
      assert.equal(env.KEYCLOAK_PORT, "37903", "stale boilerplate port replaced from .stack.json");
      assert.equal(env.APP_PROXY_PORT, "36903");
      assert.equal(env.PG_PORT, "6903");
      assert.equal(env.API_PORT, "16903");
      assert.equal(env.NEXT_PORT, "26903");
      assert.equal(
        env.OAUTH_ISSUER_URL,
        "http://keycloak.localtest.me:37903/realms/sfx-webapp-boilerplate",
      );
      assert.equal(
        env.OAUTH_JWKS_URL,
        "http://keycloak.localtest.me:37903/realms/sfx-webapp-boilerplate/protocol/openid-connect/certs",
      );
      assert.equal(
        env.OAUTH2_PROXY_REDIRECT_URL,
        "http://app.localtest.me:36903/oauth2/callback",
      );
      assert.equal(env.JWT_SECRET, "keep-me", "non-managed keys preserved");
      assert.equal(env.POSTGRES_DB, "app_db");

      const runtime = parseEnvFile(join(tempRoot, ".env.runtime"));
      assert.equal(runtime.OAUTH_ISSUER_URL, env.OAUTH_ISSUER_URL);
      assert.equal(runtime.KEYCLOAK_PORT, "37903");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("derives realm name from package.json when stack.json omits oauth URLs (fallback uses keycloak.localtest.me)", () => {
    // When .stack.json doesn't carry pre-built oauth_issuer_url / oauth_jwks_url
    // (older stack snapshots, partial fixtures), the probe builds the fallback
    // URL. The fallback MUST use keycloak.localtest.me, not stack.host —
    // stack.host is `host.docker.internal` (the api/web health-probe hostname,
    // panel container can resolve it natively). OAuth needs the same hostname
    // the api validates against (OAUTH_ISSUER_URL in docker-compose.yml, which
    // defaults to keycloak.localtest.me); otherwise the probe issues tokens
    // with iss=host.docker.internal:<port> and the api rejects them.
    const { tempRoot, scriptsDir } = setupHydrateFixture("derive-realm", {
      stack: {
        pg_port: 5432,
        api_port: 3001,
        web_port: 3000,
        proxy_port: 4181,
        keycloak_port: 9080,
        host: "host.docker.internal",
        is_worktree: false,
      },
      packageJson: { name: "@customer/Brand Manager" },
      envContents: "POSTGRES_USER=app\n",
    });

    try {
      execFileSync("bash", [join(scriptsDir, "probe-bootstrap.sh"), "--hydrate-only"], {
        cwd: tempRoot,
        env: { ...process.env },
        encoding: "utf8",
      });

      const env = parseEnvFile(join(tempRoot, ".env"));
      assert.equal(
        env.OAUTH_ISSUER_URL,
        "http://keycloak.localtest.me:9080/realms/brand-manager",
        "fallback OAuth URL must use keycloak.localtest.me even when stack.host is host.docker.internal",
      );
      assert.equal(
        env.OAUTH_JWKS_URL,
        "http://keycloak.localtest.me:9080/realms/brand-manager/protocol/openid-connect/certs",
      );
      assert.equal(env.OAUTH_API_CLIENT_ID, "brand-manager-dev-api");
      assert.equal(env.OAUTH2_PROXY_CLIENT_ID, "brand-manager-dev-proxy");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("noop when .stack.json is missing (no .env touched)", () => {
    const tempRoot = join(tmpdir(), `probe-bootstrap-nostack-${Date.now()}`);
    const scriptsDir = join(tempRoot, "scripts");
    mkdirSync(scriptsDir, { recursive: true });
    copyFileSync(
      join(REPO_ROOT, "scripts", "probe-bootstrap.sh"),
      join(scriptsDir, "probe-bootstrap.sh"),
    );
    writeFileSync(join(tempRoot, "package.json"), JSON.stringify({ name: "noop" }));
    const original = "KEEP_ME=yes\n";
    writeFileSync(join(tempRoot, ".env"), original);

    try {
      execFileSync("bash", [join(scriptsDir, "probe-bootstrap.sh"), "--hydrate-only"], {
        cwd: tempRoot,
        env: { ...process.env },
        encoding: "utf8",
      });
      assert.equal(readFileSync(join(tempRoot, ".env"), "utf8"), original);
      assert.equal(existsSync(join(tempRoot, ".env.runtime")), false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("declares a fast-path that skips stack:up when .stack.json + health probe show a healthy stack", () => {
    // Closeout-gate re-runs of `pnpm probe:smoke` were observed (2026-05-15)
    // to invoke `stack-up-docker.sh`'s install path against an already-up
    // stack and hang for 7+ minutes inside `pnpm install --frozen-lockfile`,
    // stalling the worker's Stop hook chain. The fast-path below short-
    // circuits stack:up when the api health endpoint is reachable, so this
    // class of stall cannot recur. Pin the wiring here so a future refactor
    // doesn't quietly drop the fast-path.
    const script = readFileSync(join(REPO_ROOT, "scripts", "probe-bootstrap.sh"), "utf8");

    assert.match(
      script,
      /should_skip_stack_up\s*\(\)\s*\{/,
      "probe-bootstrap.sh must define should_skip_stack_up()",
    );
    assert.match(
      script,
      /\.stack\.json/,
      "fast-path must consult .stack.json (it is the only signal that we have a healthy stack)",
    );
    assert.match(
      script,
      /\/api\/v1\/health/,
      "fast-path must probe the api health endpoint to confirm the stack is bound, not just declared",
    );
    assert.match(
      script,
      /if\s+should_skip_stack_up;\s+then[\s\S]*step[^\n]*skipping stack:up[\s\S]*else[\s\S]*pnpm[\s\S]*stack:up/,
      "stack:up call must be guarded by should_skip_stack_up with a step log on the skip branch",
    );
  });
});
