import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { buildKeycloakBootstrapPlan, deriveRealmNameFromRepoName } from "./keycloak-bootstrap-plan.mjs";

const KEYCLOAK_BASE_URL = process.env.KEYCLOAK_INTERNAL_URL ?? "http://keycloak:9080";
const KEYCLOAK_ADMIN = process.env.KEYCLOAK_ADMIN ?? "admin";
const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD ?? "admin";
const REPO_ROOT = process.cwd();

async function main() {
  const packageJson = await readJson("package.json");
  const manifest = await readJson("infra/keycloak/manifest.json");
  const devSeed = await readJson("infra/keycloak/dev-seed.json");
  const plan = buildKeycloakBootstrapPlan(manifest, devSeed, {
    repoName: deriveRealmNameFromRepoName(packageJson.name),
    appProxyPort: process.env.APP_PROXY_PORT ?? "4181",
  });

  await waitForKeycloak(KEYCLOAK_BASE_URL);
  const accessToken = await getAdminAccessToken(KEYCLOAK_BASE_URL);
  await ensureRealm(KEYCLOAK_BASE_URL, accessToken, plan.realm);

  const proxyClientUuid = await ensureClient(KEYCLOAK_BASE_URL, accessToken, plan.realm.name, {
    clientId: plan.clients.proxy.clientId,
    redirectUris: plan.clients.proxy.redirectUris,
    webOrigins: plan.clients.proxy.webOrigins,
    secret: process.env.OAUTH2_PROXY_CLIENT_SECRET ?? "dev-generated-app-proxy-secret",
    audienceClientIds: plan.clients.proxy.audienceClientIds,
  });
  const apiClientUuid = await ensureClient(KEYCLOAK_BASE_URL, accessToken, plan.realm.name, {
    clientId: plan.clients.api.clientId,
    redirectUris: [],
    webOrigins: [],
    secret: process.env.OAUTH_API_CLIENT_SECRET ?? "dev-generated-app-api-secret",
    audienceClientIds: [],
  });

  for (const roleName of plan.clients.api.roles) {
    await ensureClientRole(KEYCLOAK_BASE_URL, accessToken, plan.realm.name, apiClientUuid, roleName);
  }

  for (const user of plan.users) {
    const userId = await ensureUser(KEYCLOAK_BASE_URL, accessToken, plan.realm.name, user);
    await resetUserPassword(KEYCLOAK_BASE_URL, accessToken, plan.realm.name, userId, user.password);
    for (const assignment of user.clientRoleAssignments) {
      const clientUuid = assignment.clientId === plan.clients.api.clientId ? apiClientUuid : proxyClientUuid;
      await assignClientRolesToUser(
        KEYCLOAK_BASE_URL,
        accessToken,
        plan.realm.name,
        userId,
        clientUuid,
        assignment.roles,
      );
    }
  }

  console.log(JSON.stringify({ status: "ok", realm: plan.realm.name }, null, 2));
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(join(REPO_ROOT, relativePath), "utf8"));
}

async function waitForKeycloak(baseUrl) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/realms/master`);
      if (response.ok) return;
    } catch {
      // Keycloak is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Keycloak did not become ready at ${baseUrl}`);
}

async function getAdminAccessToken(baseUrl) {
  const response = await fetch(`${baseUrl}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: KEYCLOAK_ADMIN,
      password: KEYCLOAK_ADMIN_PASSWORD,
    }),
  });
  const body = await parseJson(response);
  if (!response.ok || !body.access_token) {
    throw new Error(`Failed to obtain Keycloak admin token: ${formatKeycloakError(body)}`);
  }
  return body.access_token;
}

async function ensureRealm(baseUrl, accessToken, realm) {
  const existing = await keycloakFetch(`${baseUrl}/admin/realms/${realm.name}`, accessToken, {
    expectedStatuses: [200, 404],
  });
  const payload = {
    realm: realm.name,
    displayName: realm.displayName,
    enabled: true,
    registrationAllowed: realm.registrationAllowed,
    loginWithEmailAllowed: realm.loginWithEmailAllowed,
    sslRequired: realm.sslRequired,
  };

  if (existing.status === 200) {
    await keycloakFetch(`${baseUrl}/admin/realms/${realm.name}`, accessToken, {
      method: "PUT",
      body: payload,
      expectedStatuses: [204],
    });
    return;
  }

  await keycloakFetch(`${baseUrl}/admin/realms`, accessToken, {
    method: "POST",
    body: payload,
    expectedStatuses: [201],
  });
}

async function ensureClient(baseUrl, accessToken, realmName, client) {
  const existingClient = await findClient(baseUrl, accessToken, realmName, client.clientId);
  const payload = {
    clientId: client.clientId,
    enabled: true,
    protocol: "openid-connect",
    publicClient: false,
    standardFlowEnabled: true,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false,
    redirectUris: client.redirectUris,
    webOrigins: client.webOrigins,
    secret: client.secret,
    protocolMappers: buildAudienceProtocolMappers(client.audienceClientIds),
  };

  if (existingClient?.id) {
    await keycloakFetch(`${baseUrl}/admin/realms/${realmName}/clients/${existingClient.id}`, accessToken, {
      method: "PUT",
      body: payload,
      expectedStatuses: [204],
    });
    return existingClient.id;
  }

  await keycloakFetch(`${baseUrl}/admin/realms/${realmName}/clients`, accessToken, {
    method: "POST",
    body: payload,
    expectedStatuses: [201],
  });

  const createdClient = await findClient(baseUrl, accessToken, realmName, client.clientId);
  if (!createdClient?.id) {
    throw new Error(`Keycloak client was created but cannot be found: ${client.clientId}`);
  }
  return createdClient.id;
}

async function findClient(baseUrl, accessToken, realmName, clientId) {
  const response = await keycloakFetch(
    `${baseUrl}/admin/realms/${realmName}/clients?clientId=${encodeURIComponent(clientId)}`,
    accessToken,
    { expectedStatuses: [200] },
  );
  const clients = await parseJson(response);
  return clients.find((client) => client.clientId === clientId) ?? null;
}

async function ensureClientRole(baseUrl, accessToken, realmName, clientUuid, roleName) {
  const existing = await keycloakFetch(
    `${baseUrl}/admin/realms/${realmName}/clients/${clientUuid}/roles/${roleName}`,
    accessToken,
    { expectedStatuses: [200, 404] },
  );
  if (existing.status === 200) return;

  await keycloakFetch(`${baseUrl}/admin/realms/${realmName}/clients/${clientUuid}/roles`, accessToken, {
    method: "POST",
    body: { name: roleName },
    expectedStatuses: [201],
  });
}

async function ensureUser(baseUrl, accessToken, realmName, user) {
  const existingUser = await findUser(baseUrl, accessToken, realmName, user.username);
  const payload = {
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    enabled: user.enabled,
    emailVerified: true,
  };

  if (existingUser?.id) {
    await keycloakFetch(`${baseUrl}/admin/realms/${realmName}/users/${existingUser.id}`, accessToken, {
      method: "PUT",
      body: payload,
      expectedStatuses: [204],
    });
    return existingUser.id;
  }

  await keycloakFetch(`${baseUrl}/admin/realms/${realmName}/users`, accessToken, {
    method: "POST",
    body: payload,
    expectedStatuses: [201],
  });

  const createdUser = await findUser(baseUrl, accessToken, realmName, user.username);
  if (!createdUser?.id) {
    throw new Error(`Keycloak user was created but cannot be found: ${user.username}`);
  }
  return createdUser.id;
}

async function findUser(baseUrl, accessToken, realmName, username) {
  const response = await keycloakFetch(
    `${baseUrl}/admin/realms/${realmName}/users?username=${encodeURIComponent(username)}&exact=true`,
    accessToken,
    { expectedStatuses: [200] },
  );
  const users = await parseJson(response);
  return users.find((user) => user.username === username) ?? null;
}

async function resetUserPassword(baseUrl, accessToken, realmName, userId, password) {
  await keycloakFetch(`${baseUrl}/admin/realms/${realmName}/users/${userId}/reset-password`, accessToken, {
    method: "PUT",
    body: {
      type: "password",
      value: password,
      temporary: false,
    },
    expectedStatuses: [204],
  });
}

async function assignClientRolesToUser(baseUrl, accessToken, realmName, userId, clientUuid, roleNames) {
  const roles = await Promise.all(
    roleNames.map((roleName) => getClientRole(baseUrl, accessToken, realmName, clientUuid, roleName)),
  );

  await keycloakFetch(
    `${baseUrl}/admin/realms/${realmName}/users/${userId}/role-mappings/clients/${clientUuid}`,
    accessToken,
    {
      method: "POST",
      body: roles,
      expectedStatuses: [204],
    },
  );
}

async function getClientRole(baseUrl, accessToken, realmName, clientUuid, roleName) {
  const response = await keycloakFetch(
    `${baseUrl}/admin/realms/${realmName}/clients/${clientUuid}/roles/${roleName}`,
    accessToken,
    { expectedStatuses: [200] },
  );
  return parseJson(response);
}

async function keycloakFetch(url, accessToken, options) {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!options.expectedStatuses.includes(response.status)) {
    const body = await parseJson(response);
    throw new Error(`Keycloak request failed (${response.status}) ${url}: ${formatKeycloakError(body)}`);
  }
  return response;
}

async function parseJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function buildAudienceProtocolMappers(audienceClientIds = []) {
  return audienceClientIds.map((audienceClientId) => ({
    name: `${audienceClientId}-audience`,
    protocol: "openid-connect",
    protocolMapper: "oidc-audience-mapper",
    consentRequired: false,
    config: {
      "included.client.audience": audienceClientId,
      "id.token.claim": "false",
      "access.token.claim": "true",
    },
  }));
}

function formatKeycloakError(error) {
  return error.errorMessage ?? error.error ?? "unknown error";
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
