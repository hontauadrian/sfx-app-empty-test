import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildKeycloakBootstrapPlan,
  deriveRealmNameFromRepoName,
} from "../keycloak-bootstrap-plan.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(REPO_ROOT, relativePath), "utf8"));
}

describe("deriveRealmNameFromRepoName", () => {
  it("normalizes repository names into deterministic realm names", () => {
    assert.equal(deriveRealmNameFromRepoName("@sfx/My Generated_App"), "my-generated-app");
  });
});

describe("buildKeycloakBootstrapPlan", () => {
  it("builds clients, roles, and dev users from version-controlled files", () => {
    const manifest = readJson("infra/keycloak/manifest.json");
    const devSeed = readJson("infra/keycloak/dev-seed.json");
    const plan = buildKeycloakBootstrapPlan(manifest, devSeed, {
      repoName: "customer-portal",
      appProxyPort: "4181",
    });

    assert.equal(plan.realm.name, "customer-portal");
    assert.equal(plan.clients.proxy.clientId, "customer-portal-dev-proxy");
    assert.equal(plan.clients.proxy.directAccessGrantsEnabled, true);
    assert.equal(plan.clients.api.clientId, "customer-portal-dev-api");
    assert.deepEqual(plan.clients.api.roles, ["viewer", "editor", "admin"]);
    assert.equal(plan.users[0].username, "admin@example.com");
    assert.deepEqual(plan.users[0].clientRoleAssignments, [
      {
        clientId: "customer-portal-dev-api",
        roles: ["admin"],
      },
    ]);
  });

  it("keeps destructive reconciliation disabled by default", () => {
    const manifest = readJson("infra/keycloak/manifest.json");
    const devSeed = readJson("infra/keycloak/dev-seed.json");
    const plan = buildKeycloakBootstrapPlan(manifest, devSeed, {
      repoName: "customer-portal",
      appProxyPort: "4181",
    });

    assert.equal(plan.reconciliation.allowDestructive, false);
  });
});
