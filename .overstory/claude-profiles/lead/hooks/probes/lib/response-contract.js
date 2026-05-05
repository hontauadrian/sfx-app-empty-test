'use strict';

/**
 * lib/response-contract.js — OpenAPI response-schema extraction helpers.
 *
 * Extracts ResponseContract from an OpenAPI spec's response schemas,
 * computing required non-nullable dotted paths that the probe can assert
 * on happy-path responses.
 */

/**
 * Resolve a $ref pointer within an OpenAPI spec.
 * Returns the resolved schema object, or null if unresolvable.
 */
function resolveSchemaRef(spec, ref) {
  if (!ref || typeof ref !== 'string') return null;
  const parts = ref.replace(/^#\//, '').split('/');
  let node = spec;
  for (const part of parts) {
    if (!node || typeof node !== 'object') return null;
    node = node[part];
  }
  return node || null;
}

/**
 * Resolve a property schema that may be wrapped in $ref, allOf, or inline.
 * NestJS Swagger emits nested DTOs as `allOf: [{ $ref: ... }]` — this
 * unwraps that pattern to the resolved schema.
 */
function resolvePropertySchema(propSchemaRaw, spec) {
  if (!propSchemaRaw || typeof propSchemaRaw !== 'object') return null;

  // Direct $ref
  if (propSchemaRaw.$ref) {
    return resolveSchemaRef(spec, propSchemaRaw.$ref);
  }

  // allOf: merge all branches (NestJS wraps nested DTOs this way)
  if (Array.isArray(propSchemaRaw.allOf) && propSchemaRaw.allOf.length > 0) {
    let merged = {};
    for (const branch of propSchemaRaw.allOf) {
      const resolved = branch.$ref ? resolveSchemaRef(spec, branch.$ref) : branch;
      if (resolved && typeof resolved === 'object') {
        merged = mergeSchemas(merged, resolved);
      }
    }
    return Object.keys(merged).length > 0 ? merged : null;
  }

  return propSchemaRaw;
}

/**
 * Shallow-merge two OpenAPI schema objects. Properties, required arrays,
 * and type are combined. Used for allOf resolution.
 */
function mergeSchemas(base, overlay) {
  const merged = { ...base, ...overlay };
  if (base.properties || overlay.properties) {
    merged.properties = { ...(base.properties || {}), ...(overlay.properties || {}) };
  }
  if (base.required || overlay.required) {
    const reqSet = new Set([...(base.required || []), ...(overlay.required || [])]);
    merged.required = [...reqSet];
  }
  return merged;
}

/**
 * Recursively collect required non-nullable dotted paths from an OpenAPI schema.
 *
 * Rules:
 *   - Only fields listed in `required` are traversed.
 *   - Nullable fields (nullable:true, or type includes 'null') are excluded.
 *   - Nested objects: recurse with dotted prefix (e.g. 'user.id').
 *   - Arrays: recurse into `items` schema with '[*]' suffix (e.g. 'items[*].id').
 *   - oneOf/anyOf: conservative — only include fields required in ALL branches.
 *   - $ref schemas are resolved via `spec`.
 *
 * @param {object} schema — resolved OpenAPI schema object
 * @param {string} prefix — dotted path prefix ('' for root)
 * @param {object} spec — full OpenAPI spec (for $ref resolution)
 * @param {Set<string>} [visited] — tracked $ref paths for cycle detection
 * @returns {string[]} — sorted array of dotted paths
 */
function collectRequiredPaths(schema, prefix, spec, visited) {
  if (!schema || typeof schema !== 'object') return [];
  if (!visited) visited = new Set();

  // Handle $ref at this level
  if (schema.$ref) {
    if (visited.has(schema.$ref)) return [];
    visited.add(schema.$ref);
    const resolved = resolveSchemaRef(spec, schema.$ref);
    if (!resolved) return [];
    return collectRequiredPaths(resolved, prefix, spec, visited);
  }

  // Handle oneOf / anyOf: conservative intersection — only paths present in ALL branches
  if (schema.oneOf || schema.anyOf) {
    const branches = schema.oneOf || schema.anyOf;
    if (!Array.isArray(branches) || branches.length === 0) return [];

    const branchPaths = branches.map((branch) => {
      const resolved = branch.$ref ? resolveSchemaRef(spec, branch.$ref) : branch;
      if (!resolved) return [];
      return collectRequiredPaths(resolved, prefix, spec, visited);
    });

    // Intersection: only paths common to ALL branches
    if (branchPaths.length === 0) return [];
    let intersection = new Set(branchPaths[0]);
    for (let i = 1; i < branchPaths.length; i++) {
      const branchSet = new Set(branchPaths[i]);
      intersection = new Set([...intersection].filter((p) => branchSet.has(p)));
    }
    return [...intersection].sort();
  }

  const type = schema.type;
  const required = new Set(schema.required || []);
  const properties = schema.properties || {};

  // For array type, recurse into items
  if (type === 'array' && schema.items) {
    const itemRef = schema.items.$ref;
    if (itemRef) {
      if (visited.has(itemRef)) return [];
      visited.add(itemRef);
    }
    const itemSchema = itemRef
      ? resolveSchemaRef(spec, itemRef)
      : schema.items;
    if (!itemSchema) return [];
    const arrayPrefix = prefix ? `${prefix}[*]` : '[*]';
    return collectRequiredPaths(itemSchema, arrayPrefix, spec, visited);
  }

  // For object type (or implicit object with properties)
  if (type === 'object' || Object.keys(properties).length > 0) {
    const paths = [];
    for (const [name, propSchemaRaw] of Object.entries(properties)) {
      if (!required.has(name)) continue;

      // Resolve property schema: handle $ref, allOf (NestJS Swagger wraps
      // nested DTOs as `allOf: [{ $ref: ... }]`), and inline schemas.
      const propSchema = resolvePropertySchema(propSchemaRaw, spec);
      if (!propSchema) continue;

      // Skip nullable fields
      if (isNullable(propSchema)) continue;

      const fullPath = prefix ? `${prefix}.${name}` : name;

      const propType = propSchema.type;
      if (propType === 'object' || (propSchema.properties && Object.keys(propSchema.properties).length > 0)) {
        // Add the field itself and recurse into nested object
        paths.push(fullPath);
        const nested = collectRequiredPaths(propSchema, fullPath, spec, visited);
        paths.push(...nested);
      } else if (propType === 'array' && propSchema.items) {
        paths.push(fullPath);
        const itemRef = propSchema.items.$ref;
        if (itemRef) {
          if (visited.has(itemRef)) continue;
          visited.add(itemRef);
        }
        const itemSchema = itemRef
          ? resolveSchemaRef(spec, itemRef)
          : propSchema.items;
        if (itemSchema) {
          const nested = collectRequiredPaths(itemSchema, `${fullPath}[*]`, spec, visited);
          paths.push(...nested);
        }
      } else if (propSchema.oneOf || propSchema.anyOf) {
        paths.push(fullPath);
      } else {
        // Leaf scalar
        paths.push(fullPath);
      }
    }
    return paths.sort();
  }

  return [];
}

/**
 * Check if a schema is nullable.
 * OpenAPI 3.0: `nullable: true`
 * OpenAPI 3.1: `type: ['string', 'null']` or `type` includes 'null'
 */
function isNullable(schema) {
  if (!schema) return false;
  if (schema.nullable === true) return true;
  if (Array.isArray(schema.type) && schema.type.includes('null')) return true;
  return false;
}

/**
 * Extract a ResponseContract from an OpenAPI operation's response.
 *
 * Looks for 2xx responses with application/json content, resolves the schema,
 * and computes required paths.
 *
 * @param {object} spec — full OpenAPI spec
 * @param {object} operation — the OpenAPI operation object (pathItem[method])
 * @returns {object|null} — { status, schemaRef, fields, requiredPaths } or null
 */
function extractResponseContract(spec, operation) {
  if (!operation || !operation.responses) return null;

  const responses = operation.responses;

  // Find first 2xx response with JSON content
  const statusCodes = Object.keys(responses).sort();
  let targetStatus = null;
  let targetContent = null;

  for (const code of statusCodes) {
    const numeric = parseInt(code, 10);
    if (Number.isInteger(numeric) && numeric >= 200 && numeric < 300) {
      const resp = responses[code];
      if (resp && resp.content && resp.content['application/json']) {
        targetStatus = numeric;
        targetContent = resp.content['application/json'];
        break;
      }
    }
  }

  if (!targetStatus || !targetContent || !targetContent.schema) return null;

  const rawSchema = targetContent.schema;
  const schemaRef = rawSchema.$ref || null;
  const resolved = rawSchema.$ref
    ? resolveSchemaRef(spec, rawSchema.$ref)
    : rawSchema;

  if (!resolved) return null;

  const requiredPaths = collectRequiredPaths(resolved, '', spec);

  // Collect top-level field names for diagnostics
  const fields = Object.keys(resolved.properties || {});

  return {
    status: targetStatus,
    schemaRef: schemaRef ? schemaRef.split('/').pop() : 'inline',
    fields,
    requiredPaths,
  };
}

module.exports = {
  extractResponseContract,
  resolveSchemaRef,
  collectRequiredPaths,
  resolvePropertySchema,
  mergeSchemas,
  isNullable,
};
