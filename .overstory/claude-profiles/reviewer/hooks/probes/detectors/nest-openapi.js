'use strict';

/**
 * detectors/nest-openapi.js — Swagger/OpenAPI-sourced NestJS endpoint detector.
 *
 * Replaces detectors/nest.js (regex-based). NestJS publishes a fully-resolved
 * OpenAPI spec via @nestjs/swagger; we consume that spec as the single source
 * of truth for endpoint discovery, auth posture, declared statuses, and
 * request-body schemas.
 *
 * Source selection (first success wins):
 *   1. Live stack: read .stack.json → fetch http://127.0.0.1:{api_port}/api/docs-json
 *   2. Static dump: apps/api/.openapi.json (written by main.ts in dev)
 *
 * Shape: returns { source, endpoints }. Each endpoint matches the matrix
 * schema's apiEndpoints[] entry with authDecorators/swaggerDeclared/zodContract
 * pre-populated, so enrich-matrix.js does not need to re-run the nest-decorator
 * regex pipeline.
 *
 * Mirror copies live in builder/lead/merger/reviewer/scout hooks/probes/.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const { extractResponseContract } = require('../lib/response-contract');
const { extractErrorShape } = require('../lib/error-shape');
const { detectPaginationProfile } = require('./pagination');
const { detectConditionalProfile } = require('./conditional');

const HTTP_TIMEOUT_MS = 3000;
const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

function readStackFile(root) {
  const stackPath = path.join(root, '.stack.json');
  if (!fs.existsSync(stackPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(stackPath, 'utf8'));
  } catch {
    return null;
  }
}

function fetchOpenApiLive(stack) {
  return new Promise((resolve) => {
    if (!stack || !stack.api_port) return resolve(null);
    const url = `http://127.0.0.1:${stack.api_port}/api/docs-json`;
    const req = http.get(url, { timeout: HTTP_TIMEOUT_MS }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
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
  });
}

function loadOpenApiStatic(root) {
  const candidates = [
    path.join(root, 'apps', 'api', '.openapi.json'),
    path.join(root, '.openapi.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        return { spec: JSON.parse(fs.readFileSync(p, 'utf8')), source: p };
      } catch {
        /* fall through */
      }
    }
  }
  return null;
}

async function loadOpenApi(root) {
  const stack = readStackFile(root);
  if (stack && stack.api_port) {
    const live = await fetchOpenApiLive(stack);
    if (live) return { spec: live, source: 'openapi-live' };
  }
  const staticSpec = loadOpenApiStatic(root);
  if (staticSpec) return { spec: staticSpec.spec, source: 'openapi-static' };
  return null;
}

/** Convert an OpenAPI schema (3.0 or 3.1) into the matrix zodContract shape. */
function openApiSchemaToZodContract(schema, schemaRef) {
  if (!schema || typeof schema !== 'object') return null;
  const properties = schema.properties || {};
  const required = new Set(schema.required || []);
  const fields = [];
  const sampleValid = {};

  for (const [name, propSchema] of Object.entries(properties)) {
    const type = normalizeOpenApiType(propSchema);
    const sample = pickSample(propSchema, type);
    const field = {
      name,
      type,
      required: required.has(name),
      constraints: extractConstraints(propSchema),
      samples: {
        valid: sample,
        invalidators: buildInvalidators(name, propSchema, type, required.has(name)),
      },
    };
    fields.push(field);
    if (required.has(name) || propSchema.default !== undefined) {
      sampleValid[name] = sample;
    }
  }

  return {
    schemaRef: schemaRef || 'openapi',
    fields,
    sampleValid,
    diagnostics: [],
  };
}

function normalizeOpenApiType(schema) {
  const raw = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type;
  if (schema.enum) return 'enum';
  if (raw === 'integer') return 'number';
  if (raw === 'string' || raw === 'number' || raw === 'boolean' || raw === 'array' || raw === 'object') {
    return raw;
  }
  if (schema.oneOf || schema.anyOf) return 'union';
  return 'unknown';
}

function pickSample(schema, normalizedType) {
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length > 0) return schema.examples[0];
  if (schema.default !== undefined) return schema.default;
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];
  switch (normalizedType) {
    case 'string': {
      if (schema.format === 'email') return 'valid@example.com';
      if (schema.format === 'uri' || schema.format === 'url') return 'https://example.com';
      if (schema.format === 'uuid') return '00000000-0000-4000-8000-000000000000';
      if (schema.format === 'date') return '2024-01-15';
      if (schema.format === 'date-time') return '2024-01-15T10:30:00.000Z';
      const min = schema.minLength || 1;
      return 'x'.repeat(Math.max(min, 3));
    }
    case 'number': return schema.minimum != null ? schema.minimum : 1;
    case 'boolean': return true;
    case 'array': return [];
    case 'object': return {};
    default: return null;
  }
}

function extractConstraints(schema) {
  const c = {};
  if (schema.minLength != null) c.minLength = schema.minLength;
  if (schema.maxLength != null) c.maxLength = schema.maxLength;
  if (schema.minimum != null) c.min = schema.minimum;
  if (schema.maximum != null) c.max = schema.maximum;
  if (schema.pattern) c.pattern = schema.pattern;
  if (schema.format) c.format = schema.format;
  if (schema.enum) c.enum = schema.enum;
  return c;
}

function buildInvalidators(name, schema, normalizedType, isRequired) {
  const out = [];
  if (isRequired) out.push({ kind: 'missing', field: name });
  if (normalizedType === 'string' && schema.format === 'email') {
    out.push({ kind: 'wrong-format', field: name, value: 'not-an-email' });
  }
  if (normalizedType === 'string' && (schema.format === 'uri' || schema.format === 'url')) {
    out.push({ kind: 'wrong-format', field: name, value: 'not-a-url' });
  }
  if (normalizedType === 'string' && schema.format === 'uuid') {
    out.push({ kind: 'wrong-format', field: name, value: 'not-a-uuid' });
  }
  if (normalizedType === 'string' && schema.format === 'date') {
    out.push({ kind: 'wrong-format', field: name, value: 'not-a-date' });
  }
  if (normalizedType === 'string' && schema.format === 'date-time') {
    out.push({ kind: 'wrong-format', field: name, value: 'not-a-datetime' });
  }
  if (normalizedType === 'string' && schema.minLength) {
    out.push({ kind: 'too-short', field: name, value: '' });
  }
  if (normalizedType === 'number' && schema.minimum != null) {
    out.push({ kind: 'below-minimum', field: name, value: schema.minimum - 1 });
  }
  return out;
}

function resolveSchemaRef(spec, refOrSchema) {
  if (!refOrSchema) return null;
  if (refOrSchema.$ref) {
    const parts = refOrSchema.$ref.replace(/^#\//, '').split('/');
    let node = spec;
    for (const part of parts) {
      if (!node || typeof node !== 'object') return null;
      node = node[part];
    }
    return node || null;
  }
  return refOrSchema;
}

function deriveEndpointsFromSpec(spec) {
  const endpoints = [];
  const securitySchemes = extractSecuritySchemes(spec);
  const paths = spec.paths || {};
  const globalSecurity = spec.security || [];

  for (const [rawPath, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of METHODS) {
      const op = pathItem[method];
      if (!op || typeof op !== 'object') continue;

      const security = op.security !== undefined ? op.security : globalSecurity;
      const hasBearer = securityRequiresBearer(security, spec);
      const authRequired = hasBearer;

      const responses = op.responses || {};
      const statuses = Object.keys(responses)
        .map((k) => parseInt(k, 10))
        .filter((n) => Number.isInteger(n));

      let zodContract = null;
      let bodySchemaRef = null;
      let multipartFields = null;
      const requestContentTypes = [];
      if (op.requestBody && op.requestBody.content) {
        // Collect ALL declared request content types
        for (const ct of Object.keys(op.requestBody.content)) {
          requestContentTypes.push(ct);
        }
        // Extract Zod contract from JSON content (if present)
        const jsonContent = op.requestBody.content['application/json'];
        if (jsonContent && jsonContent.schema) {
          const resolvedSchema = resolveSchemaRef(spec, jsonContent.schema) || jsonContent.schema;
          const refName = jsonContent.schema.$ref
            ? jsonContent.schema.$ref.split('/').pop()
            : 'inline';
          bodySchemaRef = refName;
          zodContract = openApiSchemaToZodContract(resolvedSchema, refName);
        }
        // Extract multipart/form-data field schema (for upload field names + types)
        const multipartContent = op.requestBody.content['multipart/form-data'];
        if (multipartContent && multipartContent.schema) {
          const resolved = resolveSchemaRef(spec, multipartContent.schema) || multipartContent.schema;
          multipartFields = extractMultipartFields(resolved);
        }
      }

      // Collect ALL declared response content types across 2xx statuses
      const responseContentTypes = extractResponseContentTypes(responses);

      const guard = op['x-sfx-public'] === true
        ? 'public'
        : authRequired
          ? 'authenticated'
          : 'public';

      // Extract response contract from declared 2xx response schema
      const responseContract = extractResponseContract(spec, op);

      // Extract error shape from declared 4xx/5xx response schemas
      const errorShape = extractErrorShape(spec, pathItem, op);

      // Build per-operation security requirement array
      const securityRequirement = buildSecurityRequirement(security);

      // Detect pagination profile from query params + response shape
      const paginationProfile = detectPaginationProfile(spec, op);

      // queryContract: from pagination profile (if paginated), otherwise built
      // from declared OpenAPI query parameters (@ApiQuery decorators) so the
      // 422 emitter can construct an "omit required query params" probe. Pure
      // declaration scan — never inferred. No declared @ApiQuery → null.
      const queryContract = paginationProfile
        ? paginationProfile.queryContract
        : buildQueryContractFromDeclaredParams(op);

      // Detect conditional-request profile (ETag, If-Match, If-None-Match)
      const conditionalProfile = detectConditionalProfile(spec, op);

      // Detect Idempotency-Key header parameter → idempotencyProfile
      const idempotencyParam = (op.parameters || []).find(
        (p) => p.in === 'header' && /^idempotency[_-]?key$/i.test(p.name)
      );
      const idempotencyTtl = op['x-idempotency-ttl'] != null ? Number(op['x-idempotency-ttl']) : null;
      const idempotencyProfile = idempotencyParam
        ? { headerName: idempotencyParam.name, required: Boolean(idempotencyParam.required), ttl: idempotencyTtl, source: 'openapi-parameter' }
        : null;

      endpoints.push({
        file: op['x-source-file'] || '',
        method: method.toUpperCase(),
        path: normalizeOpenApiPath(rawPath),
        framework: 'nest',
        guard,
        inputSchemaRef: bodySchemaRef,
        operationId: op.operationId || null,
        changed: false,
        zodContract,
        queryContract,
        responseContract,
        errorShape,
        securityRequirement,
        paginationProfile,
        conditionalProfile,
        idempotencyProfile,
        requestContentTypes: requestContentTypes.length > 0 ? requestContentTypes : undefined,
        responseContentTypes: responseContentTypes.length > 0 ? responseContentTypes : undefined,
        multipartFields: multipartFields || undefined,
        authDecorators: {
          authRequired,
          authProvenance: authRequired ? 'openapi' : 'none',
          isPublic: !authRequired,
          guards: authRequired ? ['bearer'] : [],
          rolesRequired: [],
          bearerAuth: hasBearer,
        },
        swaggerDeclared: {
          tags: Array.isArray(op.tags) ? op.tags : [],
          statuses,
          parameters: extractHeaderParameters(op),
          extensions: extractVendorExtensions(op),
        },
      });
    }
  }
  return { endpoints, securitySchemes };
}

/**
 * Extract unique response content types from 2xx response declarations.
 * @param {Object} responses - OpenAPI responses object { '200': { content: { ... } }, ... }
 * @returns {string[]}
 */
function extractResponseContentTypes(responses) {
  const types = new Set();
  for (const [code, resp] of Object.entries(responses)) {
    const status = parseInt(code, 10);
    if (!Number.isInteger(status) || status < 200 || status >= 300) continue;
    if (resp && resp.content) {
      for (const ct of Object.keys(resp.content)) {
        types.add(ct);
      }
    }
  }
  return [...types];
}

function normalizeOpenApiPath(rawPath) {
  // OpenAPI uses `{id}`; matrix paths use `:id`.
  return rawPath.replace(/\{([^}]+)\}/g, ':$1');
}

/**
 * Extract `in: 'header'` parameters from an OpenAPI operation.
 * Returned as `{ name, in, required }`. Downstream detectors
 * (csrf, multi-tenant) read `swaggerDeclared.parameters` to pick up
 * declared header parameters like `X-CSRF-Token` or `X-Tenant-ID`.
 *
 * @param {Object} op - OpenAPI operation object
 * @returns {Array<{ name: string, in: 'header', required: boolean }>}
 */

/**
 * Extract field names and roles from a multipart/form-data schema.
 * Classifies each property as 'binary' (file upload) or 'text' (metadata field).
 *
 * OpenAPI represents file fields as: { type: 'string', format: 'binary' }
 * or array-of-binary: { type: 'array', items: { type: 'string', format: 'binary' } }
 *
 * @param {Object} schema - resolved OpenAPI schema for multipart/form-data
 * @returns {{ fileFields: Array<{name: string, array: boolean}>, textFields: string[] } | null}
 */
function extractMultipartFields(schema) {
  if (!schema || typeof schema !== 'object' || !schema.properties) return null;

  const fileFields = [];
  const textFields = [];

  for (const [name, prop] of Object.entries(schema.properties)) {
    if (!prop || typeof prop !== 'object') continue;

    // Direct binary field: { type: 'string', format: 'binary' }
    if (prop.type === 'string' && prop.format === 'binary') {
      fileFields.push({ name, array: false });
      continue;
    }
    // Array of binary: { type: 'array', items: { type: 'string', format: 'binary' } }
    if (prop.type === 'array' && prop.items &&
        prop.items.type === 'string' && prop.items.format === 'binary') {
      fileFields.push({ name, array: true });
      continue;
    }
    // Everything else is a text/metadata field
    textFields.push(name);
  }

  if (fileFields.length === 0 && textFields.length === 0) return null;
  return { fileFields, textFields };
}

function extractHeaderParameters(op) {
  if (!op || !Array.isArray(op.parameters)) return [];
  const out = [];
  for (const p of op.parameters) {
    if (!p || typeof p !== 'object') continue;
    if (p.in !== 'header') continue;
    if (typeof p.name !== 'string' || p.name.length === 0) continue;
    out.push({ name: p.name, in: 'header', required: Boolean(p.required) });
  }
  return out;
}

/**
 * Build a queryContract from declared OpenAPI `in: 'query'` parameters
 * (@ApiQuery decorators). Pure declaration scan — never inferred. Returns
 * null when no query parameters are declared.
 *
 * Populates `fields[]` only (no `sampleValid`) so:
 *   - The 422 emitter detects required query params and constructs an
 *     "omit required query" probe.
 *   - The happy emitter's `buildSampleQuery()` returns null (no sampleValid)
 *     and the happy flow continues to send a bare request, preserving prior
 *     behavior on endpoints whose query values are not safely synthesizable
 *     from their type alone.
 *
 * @param {Object} op - OpenAPI operation object
 * @returns {{ schemaRef: string, fields: Array, sampleValid: null, diagnostics: [] } | null}
 */
function buildQueryContractFromDeclaredParams(op) {
  if (!op || !Array.isArray(op.parameters)) return null;
  const queryParams = op.parameters.filter(
    (p) => p && typeof p === 'object' && p.in === 'query' && typeof p.name === 'string' && p.name.length > 0
  );
  if (queryParams.length === 0) return null;
  const fields = queryParams.map((p) => ({
    name: p.name,
    type: (p.schema && typeof p.schema.type === 'string') ? p.schema.type : 'string',
    required: Boolean(p.required),
    constraints: {},
    samples: { valid: undefined, invalidators: [] },
  }));
  // Build sampleValid from declared examples only (declaration-driven).
  // Only populates sampleValid when ALL required params have a declared example.
  const sampleValid = {};
  let allRequiredHaveExample = true;
  for (const qp of queryParams) {
    const example = qp.example !== undefined ? qp.example
      : (qp.schema && qp.schema.example !== undefined) ? qp.schema.example
      : undefined;
    if (example !== undefined) {
      sampleValid[qp.name] = example;
    } else if (qp.required) {
      allRequiredHaveExample = false;
    }
  }
  return {
    schemaRef: `openapi:${op.operationId || 'declared-query-params'}`,
    fields,
    sampleValid: allRequiredHaveExample && Object.keys(sampleValid).length > 0 ? sampleValid : null,
    diagnostics: [],
  };
}

/**
 * Extract OpenAPI vendor extensions (any property whose key starts with `x-`)
 * from an operation. Returned as a plain object preserving original values.
 * Downstream detectors (csrf, oauth, multi-tenant) read
 * `swaggerDeclared.extensions['x-csrf-issues-token' | 'x-oauth-role' | 'x-multi-tenant']`
 * to pick up declared roles.
 *
 * @param {Object} op - OpenAPI operation object
 * @returns {Object<string, *>} map of `x-*` keys to their declared values
 */
function extractVendorExtensions(op) {
  const out = {};
  if (!op || typeof op !== 'object') return out;
  for (const key of Object.keys(op)) {
    if (key.startsWith('x-')) {
      out[key] = op[key];
    }
  }
  return out;
}

/**
 * Build per-operation security requirement array from OpenAPI security[].
 * Each element is { schemeName: [scopes] }.
 */
function buildSecurityRequirement(security) {
  if (!Array.isArray(security) || security.length === 0) return [];
  return security.filter((req) => req && typeof req === 'object');
}

/**
 * Extract top-level securitySchemes from OpenAPI spec.
 * Returns a flat map of schemeName -> { type, scheme?, bearerFormat?, in?, name?, flows?, openIdConnectUrl? }.
 */
function extractSecuritySchemes(spec) {
  const raw = (spec.components && spec.components.securitySchemes) || {};
  const result = {};
  for (const [name, def] of Object.entries(raw)) {
    if (!def || typeof def !== 'object') continue;
    const scheme = { type: def.type };
    if (def.scheme) scheme.scheme = def.scheme;
    if (def.bearerFormat) scheme.bearerFormat = def.bearerFormat;
    if (def.in) scheme.in = def.in;
    if (def.name) scheme.name = def.name;
    if (def.flows) scheme.flows = def.flows;
    if (def.openIdConnectUrl) scheme.openIdConnectUrl = def.openIdConnectUrl;
    result[name] = scheme;
  }
  return result;
}

function securityRequiresBearer(security, spec) {
  if (!Array.isArray(security) || security.length === 0) return false;
  const schemes = (spec.components && spec.components.securitySchemes) || {};
  for (const req of security) {
    if (!req || typeof req !== 'object') continue;
    for (const name of Object.keys(req)) {
      const scheme = schemes[name];
      if (!scheme) continue;
      if (
        scheme.type === 'http' &&
        typeof scheme.scheme === 'string' &&
        scheme.scheme.toLowerCase() === 'bearer'
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Primary entry point. Async because the live branch makes an HTTP GET.
 * Returns { source, endpoints } or null when no OpenAPI spec is reachable.
 */
async function detectNestOpenApi(root, diag) {
  const loaded = await loadOpenApi(root);
  if (!loaded) {
    if (diag && typeof diag.info === 'function') {
      diag.info('nest-openapi: no live spec and no static dump found');
    }
    return null;
  }
  const derived = deriveEndpointsFromSpec(loaded.spec);
  if (diag && typeof diag.info === 'function') {
    diag.info(`nest-openapi: source=${loaded.source} endpoints=${derived.endpoints.length}`);
  }
  return { source: loaded.source, endpoints: derived.endpoints, securitySchemes: derived.securitySchemes };
}

module.exports = {
  detectNestOpenApi,
  // exported for fixture-driven tests
  deriveEndpointsFromSpec,
  openApiSchemaToZodContract,
  normalizeOpenApiPath,
  securityRequiresBearer,
  extractSecuritySchemes,
  extractResponseContentTypes,
  buildSecurityRequirement,
  extractHeaderParameters,
  extractVendorExtensions,
  extractMultipartFields,
};
