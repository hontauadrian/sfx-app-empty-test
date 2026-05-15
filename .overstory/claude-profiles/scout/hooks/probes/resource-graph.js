'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Read `flows.config.json` from the project root and return the configured
 * resource-graph ignore list. Used to suppress
 * `RESOURCE_GRAPH_NO_CREATE_ENDPOINT` diagnostics for Prisma models that
 * intentionally have no controller — the canonical use case is the
 * boilerplate's `BoilerplatePlaceholder` (Prisma requires at least one
 * non-ignored model for `prisma generate` to succeed, and that model has
 * no business endpoints).
 *
 * Schema:
 *   {
 *     "resourceGraph": {
 *       "ignoreModels": ["ModelA", "ModelB"]
 *     }
 *   }
 *
 * Returns an empty array when:
 *   - `flows.config.json` is missing
 *   - the file is unreadable / malformed
 *   - `resourceGraph.ignoreModels` is missing or not an array
 *
 * Lookups are case-sensitive and exact (no globs, no patterns) — keeping
 * the contract declarative and grep-able.
 */
function loadIgnoredModels(projectDir) {
  const configFile = path.join(projectDir || process.cwd(), 'flows.config.json');
  if (!fs.existsSync(configFile)) return [];
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch {
    return [];
  }
  const list = parsed && parsed.resourceGraph && parsed.resourceGraph.ignoreModels;
  return Array.isArray(list) ? list.filter((modelName) => typeof modelName === 'string') : [];
}

function buildResourceGraph(matrix, diagnostics) {
  const prismaModels = (matrix && matrix.prismaModels && matrix.prismaModels.models) || {};
  const endpoints = matrix.apiEndpoints || [];
  const projectDir = (matrix && matrix.projectDir) || process.cwd();
  const ignoredModels = new Set(loadIgnoredModels(projectDir));

  const labelToCreateEndpoint = new Map();
  for (const endpoint of endpoints) {
    if (endpoint.method !== 'POST') continue;
    const captures = (endpoint.swaggerDeclared && endpoint.swaggerDeclared.extensions
      && endpoint.swaggerDeclared.extensions['x-resource-captures']) || [];
    const capList = Array.isArray(captures) ? captures : [captures];
    for (const cap of capList) {
      if (!cap || !cap.resource) continue;
      if (!labelToCreateEndpoint.has(cap.resource)) labelToCreateEndpoint.set(cap.resource, endpoint);
    }
  }

  function findCreateEndpoint(modelName) {
    const explicit = labelToCreateEndpoint.get(modelName);
    if (explicit) return { endpoint: explicit, via: 'x-resource-captures-exact' };
    const camel = modelName.charAt(0).toLowerCase() + modelName.slice(1);
    const fallback = labelToCreateEndpoint.get(camel);
    if (fallback) return { endpoint: fallback, via: 'x-resource-captures-camel' };
    return null;
  }

  function readOnCreateGrant(endpoint) {
    const ext = (endpoint && endpoint.swaggerDeclared && endpoint.swaggerDeclared.extensions) || {};
    const grant = ext['x-on-create-grant-role'];
    if (!grant) return null;
    if (typeof grant !== 'object') return null;
    if (typeof grant.role !== 'string' || !grant.role) return null;
    return {
      role: grant.role,
      toCaller: grant.toCaller !== false,
    };
  }

  function readRequiredParentRole(endpoint) {
    const ext = (endpoint && endpoint.swaggerDeclared && endpoint.swaggerDeclared.extensions) || {};
    const requirement = ext['x-requires-parent-role'];
    if (!requirement) return null;
    if (typeof requirement !== 'object') return null;
    if (typeof requirement.parentField !== 'string' || !requirement.parentField) return null;
    if (typeof requirement.minimumRole !== 'string' || !requirement.minimumRole) return null;
    return {
      parentField: requirement.parentField,
      minimumRole: requirement.minimumRole,
      acceptableRoles: Array.isArray(requirement.acceptableRoles) ? requirement.acceptableRoles : [requirement.minimumRole],
    };
  }

  const resources = new Map();

  for (const [modelName, model] of Object.entries(prismaModels)) {
    if (!model || typeof model !== 'object') continue;
    if (ignoredModels.has(modelName)) continue;
    const lookup = findCreateEndpoint(modelName);
    const createEndpoint = lookup ? lookup.endpoint : null;
    const idField = model.idField;
    const idType = idField && model.fieldTypes ? model.fieldTypes[idField] : null;
    const fks = [];
    for (const rel of model.relations || []) {
      for (const fkCol of rel.fkFields || []) {
        fks.push({
          column: fkCol,
          parent: rel.parentModel,
          referencedColumn: (rel.referencedFields && rel.referencedFields[0]) || 'id',
        });
      }
    }
    const grant = createEndpoint ? readOnCreateGrant(createEndpoint) : null;
    const parentRoleRequirement = createEndpoint ? readRequiredParentRole(createEndpoint) : null;
    const rolesFromGuard = (createEndpoint && createEndpoint.authDecorators && createEndpoint.authDecorators.rolesRequired) || [];

    resources.set(modelName, {
      model: modelName,
      resourceLabel: lookup && lookup.via.startsWith('x-resource-captures') ? extractCapturedLabel(createEndpoint) : null,
      createEndpoint,
      createEndpointLookupSource: lookup ? lookup.via : null,
      idField: idField || null,
      idType: idType || null,
      fks,
      onCreateGrant: grant,
      requiredParentRole: parentRoleRequirement,
      authRolesRequired: rolesFromGuard,
    });

    if (!createEndpoint) {
      diagnostics.push({
        code: 'RESOURCE_GRAPH_NO_CREATE_ENDPOINT',
        model: modelName,
        message: `Prisma model "${modelName}" has no matching POST endpoint with @ResourceCaptures({ resource: '${modelName}' or '${modelName.charAt(0).toLowerCase() + modelName.slice(1)}', ... }). Chain emitters cannot bootstrap this resource. Add @ResourceCaptures to its create endpoint.`,
      });
    } else if (!idField || !idType) {
      diagnostics.push({
        code: 'RESOURCE_GRAPH_NO_ID_TYPE',
        model: modelName,
        message: `Prisma model "${modelName}" has no idField/idType. Schema needs an @id column.`,
      });
    }

    if (parentRoleRequirement && createEndpoint) {
      const parentFkInfo = fks.find((fk) => fk.column === parentRoleRequirement.parentField);
      if (!parentFkInfo) {
        diagnostics.push({
          code: 'ROLE_REQUIREMENT_PARENT_FK_UNKNOWN',
          model: modelName,
          parentField: parentRoleRequirement.parentField,
          message: `${createEndpoint.method} ${createEndpoint.path} declares @x-requires-parent-role for "${parentRoleRequirement.parentField}", but Prisma model "${modelName}" has no @relation declaring "${parentRoleRequirement.parentField}" as a FK. Either fix the field name in the extension OR add @relation in Prisma.`,
        });
      }
    }
  }

  function extractCapturedLabel(endpoint) {
    const captures = (endpoint && endpoint.swaggerDeclared && endpoint.swaggerDeclared.extensions
      && endpoint.swaggerDeclared.extensions['x-resource-captures']) || [];
    const capList = Array.isArray(captures) ? captures : [captures];
    for (const cap of capList) {
      if (cap && cap.resource) return cap.resource;
    }
    return null;
  }

  function resolveGrantPath(model) {
    const node = resources.get(model);
    if (!node) return { kind: 'unsupported', reason: 'model-not-in-graph' };
    if (node.onCreateGrant && node.onCreateGrant.toCaller) {
      return {
        kind: 'creator-becomes-owner',
        role: node.onCreateGrant.role,
        endpoint: node.createEndpoint,
      };
    }
    return { kind: 'unsupported', reason: 'no-x-on-create-grant-role-declared' };
  }

  function fkLookup(column) {
    for (const node of resources.values()) {
      const hit = node.fks.find((fk) => fk.column === column);
      if (hit) {
        return {
          ownerModel: node.model,
          ownerCreateEndpoint: node.createEndpoint,
          parentModel: hit.parent,
          referencedColumn: hit.referencedColumn,
        };
      }
    }
    return null;
  }

  function parentIdType(parentModel) {
    const parent = resources.get(parentModel);
    return parent ? parent.idType : null;
  }

  return {
    resources,
    findResourceByModel: (model) => resources.get(model) || null,
    findResourceByEndpoint(endpoint) {
      for (const node of resources.values()) {
        if (node.createEndpoint === endpoint) return node;
      }
      return null;
    },
    fkLookup,
    parentIdType,
    resolveGrantPath,
  };
}

module.exports = { buildResourceGraph, loadIgnoredModels };
