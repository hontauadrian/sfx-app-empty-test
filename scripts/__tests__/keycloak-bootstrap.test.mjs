import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { describe, it } from "node:test";

function readRequestBody(request) {
  return new Promise((resolve) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      resolve(body);
    });
  });
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function createKeycloakMock() {
  const clientUpdates = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const method = request.method ?? "GET";

    if (method === "GET" && url.pathname === "/realms/master") {
      sendJson(response, 200, {});
      return;
    }

    if (
      method === "POST" &&
      url.pathname === "/realms/master/protocol/openid-connect/token"
    ) {
      sendJson(response, 200, { access_token: "admin-token" });
      return;
    }

    if (
      method === "GET" &&
      url.pathname === "/admin/realms/sfx-webapp-boilerplate"
    ) {
      sendJson(response, 200, { realm: "sfx-webapp-boilerplate" });
      return;
    }

    if (
      method === "PUT" &&
      url.pathname === "/admin/realms/sfx-webapp-boilerplate"
    ) {
      response.writeHead(204);
      response.end();
      return;
    }

    if (method === "GET" && url.pathname === "/admin/realms/sfx-webapp-boilerplate/clients") {
      const clientId = url.searchParams.get("clientId");
      const id = clientId?.endsWith("-dev-proxy") ? "proxy-client-id" : "api-client-id";
      sendJson(response, 200, [{ id, clientId }]);
      return;
    }

    if (
      method === "PUT" &&
      url.pathname.startsWith("/admin/realms/sfx-webapp-boilerplate/clients/")
    ) {
      const body = JSON.parse(await readRequestBody(request));
      clientUpdates.push(body);
      response.writeHead(204);
      response.end();
      return;
    }

    if (
      method === "GET" &&
      url.pathname.startsWith("/admin/realms/sfx-webapp-boilerplate/clients/api-client-id/roles/")
    ) {
      const roleName = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
      sendJson(response, 200, { id: `${roleName}-role-id`, name: roleName });
      return;
    }

    if (method === "GET" && url.pathname === "/admin/realms/sfx-webapp-boilerplate/users") {
      const username = url.searchParams.get("username");
      const id = username?.startsWith("admin") ? "admin-user-id" : "viewer-user-id";
      sendJson(response, 200, [{ id, username }]);
      return;
    }

    if (
      (method === "PUT" || method === "POST") &&
      url.pathname.startsWith("/admin/realms/sfx-webapp-boilerplate/users/")
    ) {
      response.writeHead(204);
      response.end();
      return;
    }

    sendJson(response, 404, { error: `Unhandled ${method} ${url.pathname}` });
  });

  return {
    clientUpdates,
    async start() {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");
      assert.notEqual(address, null);
      return `http://127.0.0.1:${address.port}`;
    },
    async stop() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function runBootstrap(baseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/keycloak-bootstrap.mjs"], {
      cwd: new URL("../..", import.meta.url),
      env: {
        ...process.env,
        KEYCLOAK_INTERNAL_URL: baseUrl,
        KEYCLOAK_ADMIN: "admin",
        KEYCLOAK_ADMIN_PASSWORD: "admin",
        APP_PROXY_PORT: "4181",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`bootstrap exited ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
    });
  });
}

describe("keycloak-bootstrap", () => {
  it("registers allowed post-logout redirect URIs on the proxy client", async () => {
    const keycloak = createKeycloakMock();
    const baseUrl = await keycloak.start();
    try {
      await runBootstrap(baseUrl);
    } finally {
      await keycloak.stop();
    }

    const proxyUpdate = keycloak.clientUpdates.find(
      (client) => client.clientId === "sfx-webapp-boilerplate-dev-proxy",
    );

    assert.deepEqual(proxyUpdate?.attributes, {
      "post.logout.redirect.uris":
        "http://app.localtest.me:4181/##http://host.docker.internal:4181/",
    });
  });
});
