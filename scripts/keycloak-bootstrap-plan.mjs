const DEFAULT_REPO_NAME = "sfx-webapp-boilerplate";

export function deriveRealmNameFromRepoName(repoName) {
  const withoutScope = String(repoName ?? DEFAULT_REPO_NAME).split("/").pop() ?? DEFAULT_REPO_NAME;
  const normalized = withoutScope
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || DEFAULT_REPO_NAME;
}

export function buildKeycloakBootstrapPlan(manifest, devSeed, options = {}) {
  const repoName = deriveRealmNameFromRepoName(options.repoName);
  const variables = {
    repoName,
    appProxyPort: String(options.appProxyPort ?? "4181"),
  };
  const renderedManifest = interpolateObject(manifest, variables);
  const renderedSeed = interpolateObject(devSeed, variables);

  validateManifest(renderedManifest);
  validateDevSeed(renderedSeed);

  return {
    realm: {
      name: renderedManifest.realm.name,
      displayName: renderedManifest.realm.displayName,
      registrationAllowed: false,
      loginWithEmailAllowed: true,
      sslRequired: "none",
    },
    clients: {
      proxy: {
        clientId: renderedManifest.clients.proxy.clientId,
        redirectUris: renderedManifest.clients.proxy.redirectUris,
        postLogoutRedirectUris: renderedManifest.clients.proxy.postLogoutRedirectUris ?? [],
        webOrigins: renderedManifest.clients.proxy.webOrigins,
        audienceClientIds: renderedManifest.clients.proxy.audienceClientIds,
        directAccessGrantsEnabled: renderedManifest.clients.proxy.directAccessGrantsEnabled === true,
      },
      api: {
        clientId: renderedManifest.clients.api.clientId,
        audience: renderedManifest.clients.api.audience,
        roles: renderedManifest.clients.api.roles,
      },
    },
    users: renderedSeed.users,
    reconciliation: {
      allowDestructive: renderedManifest.reconciliation?.allowDestructive === true,
    },
  };
}

function interpolateObject(value, variables) {
  if (Array.isArray(value)) {
    return value.map((item) => interpolateObject(item, variables));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        interpolateObject(entryValue, variables),
      ]),
    );
  }

  if (typeof value !== "string") {
    return value;
  }

  return value.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (match, variableName) => {
    return variables[variableName] ?? match;
  });
}

function validateManifest(manifest) {
  const requiredPaths = [
    ["realm", "name"],
    ["clients", "proxy", "clientId"],
    ["clients", "api", "clientId"],
    ["clients", "api", "roles"],
  ];

  for (const path of requiredPaths) {
    if (getPath(manifest, path) === undefined) {
      throw new Error(`Keycloak manifest is missing ${path.join(".")}`);
    }
  }

  if (!Array.isArray(manifest.clients.api.roles) || manifest.clients.api.roles.length === 0) {
    throw new Error("Keycloak manifest must define at least one API client role");
  }
}

function validateDevSeed(devSeed) {
  if (!Array.isArray(devSeed.users)) {
    throw new Error("Keycloak dev seed must define a users array");
  }
}

function getPath(source, path) {
  return path.reduce((current, segment) => current?.[segment], source);
}
