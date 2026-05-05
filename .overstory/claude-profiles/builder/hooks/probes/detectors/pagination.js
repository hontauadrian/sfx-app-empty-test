'use strict';

/**
 * detectors/pagination.js — Detect pagination style from OpenAPI response schema.
 *
 * Declaration-driven: inspects OpenAPI parameters[in=query] and response schema
 * shape to classify endpoints as offset, cursor, or link-header paginators.
 * Never pattern-matches on path strings.
 *
 * Returns a PaginationProfile per endpoint, or null if not paginated.
 */

const { resolveSchemaRef } = require('../lib/response-contract');

// ---------------------------------------------------------------------------
// Known query-param name sets per pagination style
// ---------------------------------------------------------------------------

const OFFSET_PARAM_NAMES = new Set(['page', 'offset', 'skip']);
const LIMIT_PARAM_NAMES = new Set(['limit', 'pageSize', 'size', 'per_page', 'perPage', 'take']);
const CURSOR_PARAM_NAMES = new Set(['cursor', 'after', 'before', 'startCursor', 'endCursor']);

// ---------------------------------------------------------------------------
// Known response field patterns per style
// ---------------------------------------------------------------------------

const OFFSET_META_FIELDS = new Set(['total', 'totalCount', 'totalItems', 'count', 'page', 'pages', 'totalPages', 'pageCount']);
const CURSOR_META_FIELDS = new Set(['nextCursor', 'endCursor', 'hasNextPage', 'hasPreviousPage', 'pageInfo']);

/**
 * Detect pagination style from an OpenAPI operation's parameters and response schema.
 *
 * @param {object} spec — full OpenAPI spec (for $ref resolution)
 * @param {object} operation — the OpenAPI operation object (pathItem[method])
 * @returns {object|null} — PaginationProfile or null
 */
function detectPaginationProfile(spec, operation) {
  if (!operation || typeof operation !== 'object') return null;

  // --- 1. Extract query parameters ---
  const params = extractQueryParams(spec, operation);
  if (params.length === 0) return null;

  // --- 2. Classify param names ---
  const offsetParams = params.filter((p) => OFFSET_PARAM_NAMES.has(p.name));
  const limitParams = params.filter((p) => LIMIT_PARAM_NAMES.has(p.name));
  const cursorParams = params.filter((p) => CURSOR_PARAM_NAMES.has(p.name));

  // Must have at least one pagination-related param
  if (offsetParams.length === 0 && cursorParams.length === 0 && limitParams.length === 0) {
    return null;
  }

  // --- 3. Inspect response schema for list shape ---
  const responseInfo = detectResponseListShape(spec, operation);

  // --- 4. Determine style ---
  let style = null;
  const paramNames = {};

  if (cursorParams.length > 0) {
    style = 'cursor';
    paramNames.cursor = cursorParams[0].name;
    if (limitParams.length > 0) paramNames.limit = limitParams[0].name;
  } else if (offsetParams.length > 0 || limitParams.length > 0) {
    style = 'offset';
    if (offsetParams.length > 0) paramNames.page = offsetParams[0].name;
    if (limitParams.length > 0) paramNames.limit = limitParams[0].name;
  }

  if (!style) return null;

  // Check for Link-header style: offset params + response is bare array (no wrapper)
  if (style === 'offset' && responseInfo && responseInfo.isBareArray) {
    style = 'link-header';
  }

  // --- 5. Extract constraints ---
  const constraints = {};
  for (const p of [...offsetParams, ...limitParams, ...cursorParams]) {
    if (p.schema) {
      if (p.schema.maximum !== undefined) {
        constraints[`${p.name}Max`] = p.schema.maximum;
      }
      if (p.schema.minimum !== undefined) {
        constraints[`${p.name}Min`] = p.schema.minimum;
      }
      if (p.schema.default !== undefined) {
        constraints[`${p.name}Default`] = p.schema.default;
      }
    }
  }

  // --- 6. Build queryContract for pagination params ---
  const queryContract = buildPaginationQueryContract(params, spec);

  return {
    style,
    paramNames,
    responseKeys: responseInfo ? responseInfo.keys : {},
    isBareArray: responseInfo ? responseInfo.isBareArray : false,
    maxLimit: constraints.limitMax || constraints.pageSizeMax || constraints.sizeMax || null,
    defaultLimit: constraints.limitDefault || constraints.pageSizeDefault || constraints.sizeDefault || null,
    constraints,
    queryContract,
  };
}

/**
 * Extract query parameters from an OpenAPI operation.
 * Handles both inline and $ref'd parameters.
 */
function extractQueryParams(spec, operation) {
  const parameters = operation.parameters || [];
  const result = [];

  for (const param of parameters) {
    const resolved = param.$ref ? resolveSchemaRef(spec, param.$ref) : param;
    if (!resolved || resolved.in !== 'query') continue;

    result.push({
      name: resolved.name,
      required: resolved.required || false,
      schema: resolved.schema || {},
      description: resolved.description || null,
    });
  }

  return result;
}

/**
 * Detect list shape from response schema.
 * Returns { itemsField, metaFields, keys, isBareArray } or null.
 */
function detectResponseListShape(spec, operation) {
  if (!operation.responses) return null;

  // Find first 2xx response with JSON content
  const statusCodes = Object.keys(operation.responses).sort();
  let responseSchema = null;

  for (const code of statusCodes) {
    const numeric = parseInt(code, 10);
    if (Number.isInteger(numeric) && numeric >= 200 && numeric < 300) {
      const resp = operation.responses[code];
      if (resp && resp.content && resp.content['application/json']) {
        const schemaRaw = resp.content['application/json'].schema;
        responseSchema = schemaRaw && schemaRaw.$ref
          ? resolveSchemaRef(spec, schemaRaw.$ref)
          : schemaRaw;
        break;
      }
    }
  }

  if (!responseSchema) return null;

  // Case 1: bare array response
  if (responseSchema.type === 'array') {
    return { itemsField: null, metaFields: [], keys: {}, isBareArray: true };
  }

  // Case 2: object with array property (items, data, results, records, etc.)
  if (responseSchema.type === 'object' || responseSchema.properties) {
    const props = responseSchema.properties || {};
    const keys = {};

    // Find the array field
    let itemsField = null;
    for (const [name, propSchema] of Object.entries(props)) {
      const resolved = propSchema.$ref ? resolveSchemaRef(spec, propSchema.$ref) : propSchema;
      if (!resolved) continue;

      if (resolved.type === 'array') {
        if (!itemsField) {
          itemsField = name;
          keys.items = name;
        }
      }

      // Detect offset meta fields
      if (OFFSET_META_FIELDS.has(name)) {
        keys[name] = name;
      }

      // Detect cursor meta fields
      if (CURSOR_META_FIELDS.has(name)) {
        keys[name] = name;
      }
    }

    if (!itemsField) return null;

    const metaFields = Object.keys(keys).filter((k) => k !== 'items');
    return { itemsField, metaFields, keys, isBareArray: false };
  }

  return null;
}

/**
 * Build a queryContract from pagination-related query params.
 * This enables emitQueryInvalidatorFlows to generate validation flows.
 */
function buildPaginationQueryContract(params, _spec) {
  const fields = [];
  const sampleValid = {};

  for (const param of params) {
    const schema = param.schema || {};
    const type = normalizeParamType(schema);
    const sample = pickParamSample(schema, type, param.name);

    fields.push({
      name: param.name,
      type,
      required: param.required,
      constraints: extractParamConstraints(schema),
      samples: {
        valid: sample,
        invalidators: buildParamInvalidators(param.name, schema, type, param.required),
      },
    });

    // Cursor params are optional for first-page queries — omit from sampleValid
    // so that the happy flow hits the first page without an invalid cursor value.
    if (!CURSOR_PARAM_NAMES.has(param.name)) {
      sampleValid[param.name] = sample;
    }
  }

  return {
    schemaRef: 'pagination-query',
    fields,
    sampleValid,
    diagnostics: [],
  };
}

function normalizeParamType(schema) {
  const raw = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type;
  if (raw === 'integer') return 'number';
  if (raw === 'string' || raw === 'number' || raw === 'boolean') return raw;
  return 'string';
}

function pickParamSample(schema, type, name) {
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];

  // Sensible defaults for pagination params
  if (OFFSET_PARAM_NAMES.has(name)) return 1;
  if (LIMIT_PARAM_NAMES.has(name)) return 10;
  if (CURSOR_PARAM_NAMES.has(name)) return 'xxx';

  switch (type) {
    case 'number': return schema.minimum != null ? schema.minimum : 1;
    case 'string': return 'xxx';
    case 'boolean': return true;
    default: return 'xxx';
  }
}

function extractParamConstraints(schema) {
  const constraints = {};
  if (schema.minimum !== undefined) constraints.min = schema.minimum;
  if (schema.maximum !== undefined) constraints.max = schema.maximum;
  if (schema.minLength !== undefined) constraints.minLength = schema.minLength;
  if (schema.maxLength !== undefined) constraints.maxLength = schema.maxLength;
  if (schema.enum) constraints.enum = schema.enum;
  return constraints;
}

function buildParamInvalidators(name, schema, type, required) {
  const invalidators = [];

  if (required) {
    invalidators.push({ kind: 'missing' });
  }

  if (type === 'number') {
    // Below minimum
    if (schema.minimum !== undefined) {
      invalidators.push({ kind: 'below-min', value: schema.minimum - 1 });
    }
    // Above maximum
    if (schema.maximum !== undefined) {
      invalidators.push({ kind: 'above-max', value: schema.maximum + 1 });
    }
    // Wrong type
    invalidators.push({ kind: 'wrong-type', value: 'not-a-number' });
  }

  if (type === 'string' && CURSOR_PARAM_NAMES.has(name)) {
    // Invalid cursor format — the server should reject gibberish cursors
    invalidators.push({ kind: 'invalid-cursor', value: '__invalid_cursor_value__' });
  }

  return invalidators;
}

module.exports = {
  detectPaginationProfile,
  extractQueryParams,
  detectResponseListShape,
  buildPaginationQueryContract,
  normalizeParamType,
  pickParamSample,
  extractParamConstraints,
  buildParamInvalidators,
};
