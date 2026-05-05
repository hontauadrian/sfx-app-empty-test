'use strict';

/**
 * detectors/graphql.js — GraphQL endpoint detection + introspection.
 *
 * Detection strategy:
 *   1. Source-scan: look for NestJS @Resolver/@Query/@Mutation decorators,
 *      Apollo Server imports, or graphql-yoga/mercurius patterns.
 *   2. Live introspection: POST an introspection query to
 *      http://127.0.0.1:{api_port}/graphql (3s timeout).
 *      Parses __schema to extract types, queries, mutations, subscriptions
 *      with their arguments.
 *
 * Returns: { endpoint, source, types, queries, mutations, subscriptions }
 *          or null if no GraphQL endpoint is detected.
 *
 * Mirror copies live in builder/lead/merger/reviewer/scout hooks/probes/.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const HTTP_TIMEOUT_MS = 3000;

// NestJS GraphQL decorators
const RESOLVER_RE = /@Resolver\b/;
const GQL_QUERY_RE = /@Query\b/;
const GQL_MUTATION_RE = /@Mutation\b/;
const GQL_SUBSCRIPTION_RE = /@Subscription\b/;

// Apollo / graphql-yoga / mercurius imports
const APOLLO_IMPORT_RE = /from\s+['"](@nestjs\/graphql|apollo-server|@apollo\/server|graphql-yoga|mercurius)['"]/;

// Standard introspection query (simplified)
// Type-ref fragment with 7 levels of ofType nesting — handles
// NON_NULL(LIST(NON_NULL(LIST(NON_NULL(OBJECT))))) and beyond.
const TYPE_REF_FRAGMENT = `
  fragment TypeRef on __Type {
    name kind
    ofType { name kind
      ofType { name kind
        ofType { name kind
          ofType { name kind
            ofType { name kind
              ofType { name kind
                ofType { name kind }
              }
            }
          }
        }
      }
    }
  }`;

const INTROSPECTION_QUERY = JSON.stringify({
  query: `{
    __schema {
      queryType { name }
      mutationType { name }
      subscriptionType { name }
      types {
        name
        kind
        enumValues { name }
        fields {
          name
          args {
            name
            type { ...TypeRef }
          }
          type { ...TypeRef }
        }
        inputFields {
          name
          type { ...TypeRef }
        }
        possibleTypes { name }
        interfaces { name }
      }
    }
  }
  ${TYPE_REF_FRAGMENT}`,
});

/**
 * Scan source files for GraphQL-related decorators/imports.
 * Returns { detected: boolean, resolverFiles: string[], source: string }.
 */
function scanSources(root) {
  const resolverFiles = [];
  const candidates = [
    path.join(root, 'apps', 'api', 'src'),
    path.join(root, 'src'),
  ];

  const schemaFiles = [];

  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    walkDir(dir, (filePath) => {
      // Detect .graphql / .gql schema files
      if (/\.(graphql|gql)$/.test(filePath)) {
        schemaFiles.push(path.relative(root, filePath));
        return;
      }
      if (!/\.(ts|js)$/.test(filePath)) return;
      if (/node_modules|\.d\.ts$|\.test\.|\.spec\./.test(filePath)) return;
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        if (RESOLVER_RE.test(content) || APOLLO_IMPORT_RE.test(content)) {
          resolverFiles.push(path.relative(root, filePath));
        }
      } catch {
        // skip unreadable files
      }
    });
  }

  const detected = resolverFiles.length > 0 || schemaFiles.length > 0;
  return {
    detected,
    resolverFiles,
    schemaFiles,
    source: detected ? 'source-scan' : null,
  };
}

function walkDir(dir, cb) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walkDir(full, cb);
    } else if (entry.isFile()) {
      cb(full);
    }
  }
}

/**
 * Read .stack.json to get the API port.
 */
function readStackFile(root) {
  const stackPath = path.join(root, '.stack.json');
  if (!fs.existsSync(stackPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(stackPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Run a GraphQL introspection query against the live stack.
 * Returns the parsed __schema or null.
 */
function fetchIntrospection(port, endpoint) {
  return new Promise((resolve) => {
    const url = `http://127.0.0.1:${port}${endpoint}`;
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(INTROSPECTION_QUERY),
      },
      timeout: HTTP_TIMEOUT_MS,
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.data && parsed.data.__schema ? parsed.data.__schema : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.write(INTROSPECTION_QUERY);
    req.end();
  });
}

/**
 * Parse a __schema introspection result into structured types/queries/mutations/subscriptions.
 */
function parseIntrospectionSchema(schema) {
  const queryTypeName = schema.queryType ? schema.queryType.name : null;
  const mutationTypeName = schema.mutationType ? schema.mutationType.name : null;
  const subscriptionTypeName = schema.subscriptionType ? schema.subscriptionType.name : null;

  const userTypes = [];
  const queries = [];
  const mutations = [];
  const subscriptions = [];

  for (const type of schema.types || []) {
    // Skip introspection types and built-in scalars
    if (!type.name || type.name.startsWith('__')) continue;
    if (['String', 'Int', 'Float', 'Boolean', 'ID'].includes(type.name)) continue;

    if (type.name === queryTypeName && type.fields) {
      for (const field of type.fields) {
        queries.push(parseOperation(field));
      }
      continue;
    }

    if (type.name === mutationTypeName && type.fields) {
      for (const field of type.fields) {
        mutations.push(parseOperation(field));
      }
      continue;
    }

    if (type.name === subscriptionTypeName && type.fields) {
      for (const field of type.fields) {
        subscriptions.push(parseOperation(field));
      }
      continue;
    }

    if (type.kind === 'ENUM') {
      userTypes.push({
        name: type.name,
        kind: 'ENUM',
        enumValues: (type.enumValues || []).map((v) => v.name),
        fields: [],
      });
      continue;
    }

    if (type.kind === 'UNION') {
      userTypes.push({
        name: type.name,
        kind: 'UNION',
        possibleTypes: (type.possibleTypes || []).map((t) => t.name),
        fields: [],
      });
      continue;
    }

    if (type.kind === 'INTERFACE') {
      const rawFields = type.fields || [];
      userTypes.push({
        name: type.name,
        kind: 'INTERFACE',
        possibleTypes: (type.possibleTypes || []).map((t) => t.name),
        fields: rawFields.map((f) => ({
          name: f.name,
          type: resolveTypeName(f.type),
        })),
      });
      continue;
    }

    if (type.kind === 'OBJECT' || type.kind === 'INPUT_OBJECT') {
      // INPUT_OBJECT uses `inputFields`; OBJECT uses `fields`
      const rawFields = type.kind === 'INPUT_OBJECT'
        ? (type.inputFields || type.fields || [])
        : (type.fields || []);
      userTypes.push({
        name: type.name,
        kind: type.kind,
        interfaces: (type.interfaces || []).map((i) => i.name),
        fields: rawFields.map((f) => ({
          name: f.name,
          type: resolveTypeName(f.type),
        })),
      });
    }
  }

  return { types: userTypes, queries, mutations, subscriptions };
}

/**
 * Parse a single operation (query/mutation/subscription) field.
 */
function parseOperation(field) {
  return {
    name: field.name,
    args: (field.args || []).map((arg) => ({
      name: arg.name,
      type: resolveTypeName(arg.type),
      required: isNonNull(arg.type),
    })),
    returnType: resolveTypeName(field.type),
  };
}

/**
 * Resolve a GraphQL type reference to a string name.
 * Handles NON_NULL and LIST wrappers.
 */
function resolveTypeName(typeRef) {
  if (!typeRef) return 'Unknown';
  if (typeRef.kind === 'NON_NULL') {
    return resolveTypeName(typeRef.ofType) + '!';
  }
  if (typeRef.kind === 'LIST') {
    return '[' + resolveTypeName(typeRef.ofType) + ']';
  }
  return typeRef.name || 'Unknown';
}

/**
 * Check if a GraphQL type reference is NON_NULL (required).
 */
function isNonNull(typeRef) {
  return typeRef && typeRef.kind === 'NON_NULL';
}

/**
 * Generate a sample value for a GraphQL argument type.
 * Handles built-in scalars and common custom scalars (DateTime, JSON, etc.).
 */
function sampleValueForType(typeName) {
  const base = typeName.replace(/[!\[\]]/g, '');
  switch (base) {
    case 'String': return 'probe-sample';
    case 'Int': return 1;
    case 'Float': return 1.5;
    case 'Boolean': return true;
    case 'ID': return 'probe-id-1';
    // Common custom scalars
    case 'DateTime': case 'Date': return '2024-01-01T00:00:00.000Z';
    case 'JSON': case 'JSONObject': return {};
    case 'Upload': return null; // File uploads need special handling
    case 'BigInt': return 1;
    case 'Decimal': return '1.00';
    case 'UUID': return '00000000-0000-0000-0000-000000000001';
    case 'URL': case 'Uri': return 'https://example.com';
    case 'Email': case 'EmailAddress': return 'probe@example.com';
    default: return null;
  }
}

/**
 * Primary entry point. Async because live introspection makes HTTP POST.
 *
 * @param {string} root — project root directory
 * @param {object} [diag] — diagnostics logger
 * @returns {{ endpoint, source, types, queries, mutations, subscriptions } | null}
 */
async function detectGraphQL(root, diag) {
  const sourceResult = scanSources(root);

  // Try live introspection
  const stack = readStackFile(root);
  const port = stack && stack.api_port ? stack.api_port : null;
  const graphqlEndpoints = ['/graphql', '/api/graphql'];

  let schema = null;
  let detectedEndpoint = null;

  // Runtime introspection is OPT-IN via MATRIX_GRAPHQL_INTROSPECT=1.
  // We only attempt it when (a) env var is set, (b) stack is running,
  // and (c) static phase found GraphQL source (no point probing a stack
  // that has no GraphQL endpoint).
  const introspectEnabled = process.env.MATRIX_GRAPHQL_INTROSPECT === '1';

  if (introspectEnabled && port && sourceResult.detected) {
    for (const ep of graphqlEndpoints) {
      schema = await fetchIntrospection(port, ep);
      if (schema) {
        detectedEndpoint = ep;
        break;
      }
    }
    if (!schema && diag && typeof diag.info === 'function') {
      diag.info('graphql: MATRIX_GRAPHQL_INTROSPECT=1 but introspection failed — falling back to source-scan');
    }
  } else if (port && sourceResult.detected && !introspectEnabled) {
    if (diag && typeof diag.info === 'function') {
      diag.info('graphql: source-scan found resolvers, stack running — set MATRIX_GRAPHQL_INTROSPECT=1 to enable runtime introspection');
    }
  }

  if (schema) {
    const parsed = parseIntrospectionSchema(schema);
    if (diag && typeof diag.info === 'function') {
      diag.info(
        `graphql: introspection OK at :${port}${detectedEndpoint} — ` +
        `${parsed.queries.length} queries, ${parsed.mutations.length} mutations, ` +
        `${parsed.subscriptions.length} subscriptions, ${parsed.types.length} types`
      );
    }
    return {
      endpoint: detectedEndpoint,
      source: 'introspection',
      ...parsed,
    };
  }

  // If source scan detected resolvers but introspection failed, return stub
  if (sourceResult.detected) {
    if (diag && typeof diag.info === 'function') {
      diag.info(
        `graphql: source-scan found ${sourceResult.resolverFiles.length} resolver files ` +
        `but introspection failed (stack ${port ? 'running on :' + port : 'not running'})`
      );
    }
    return {
      endpoint: '/graphql',
      source: 'source-scan',
      resolverFiles: sourceResult.resolverFiles,
      types: [],
      queries: [],
      mutations: [],
      subscriptions: [],
    };
  }

  if (diag && typeof diag.info === 'function') {
    diag.info('graphql: no GraphQL endpoint detected');
  }
  return null;
}

module.exports = {
  detectGraphQL,
  // Exported for tests
  scanSources,
  fetchIntrospection,
  parseIntrospectionSchema,
  parseOperation,
  resolveTypeName,
  isNonNull,
  sampleValueForType,
  INTROSPECTION_QUERY,
};
