'use strict';

/**
 * lib/error-shape.js — OpenAPI error-schema detection and assertion builder.
 *
 * Identifies error response families from OpenAPI 4xx/5xx response schemas
 * and builds family-aware assertion steps for flows-generator.js.
 *
 * Supported families:
 *   - nest-default:  { statusCode, message, error }
 *   - nest-wrapped:  { success: false, error: { statusCode, message } }
 *   - problem-json:  RFC 7807 { type, title, status, detail, instance }
 *   - errors-array:  { errors: [{ field, code, ... }] }
 *   - raw:           no recognizable schema — fallback to heuristic
 */

/**
 * Resolve a $ref pointer within an OpenAPI spec.
 */
function resolveRef(spec, refOrSchema) {
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

/**
 * Identify the error family from an OpenAPI schema and content type.
 *
 * @param {object|null} schema — resolved OpenAPI schema object
 * @param {string} contentType — media type (e.g. 'application/json', 'application/problem+json')
 * @param {object} spec — full OpenAPI spec (for $ref resolution)
 * @returns {'nest-default'|'nest-wrapped'|'problem-json'|'errors-array'|'raw'}
 */
function identifyErrorFamily(schema, contentType, spec) {
  // Problem+JSON by content type
  if (contentType === 'application/problem+json') {
    return 'problem-json';
  }

  if (!schema || typeof schema !== 'object') {
    return 'raw';
  }

  const resolved = resolveRef(spec, schema) || schema;
  const props = resolved.properties || {};
  const propNames = new Set(Object.keys(props));

  // Problem+JSON by schema shape: has type + title + status
  if (propNames.has('type') && propNames.has('title') && propNames.has('status')) {
    return 'problem-json';
  }

  // errors-array: has required 'errors' property that is an array
  if (propNames.has('errors')) {
    const errorsProp = resolveRef(spec, props.errors) || props.errors;
    if (errorsProp && (errorsProp.type === 'array' || Array.isArray(errorsProp.items))) {
      return 'errors-array';
    }
  }

  // nest-wrapped: has { success, error } where error is an object
  if (propNames.has('success') && propNames.has('error')) {
    const errorProp = resolveRef(spec, props.error) || props.error;
    if (errorProp && (errorProp.type === 'object' || errorProp.properties)) {
      return 'nest-wrapped';
    }
  }

  // nest-default: has { statusCode, message }
  if (propNames.has('statusCode') && propNames.has('message')) {
    return 'nest-default';
  }

  return 'raw';
}

/**
 * Extract error shape from an OpenAPI operation's 4xx/5xx responses.
 *
 * Loops through response codes, picks the first declared error content schema,
 * identifies the family, and computes assertion paths per family.
 *
 * @param {object} spec — full OpenAPI spec
 * @param {object} pathObj — the path item (unused, kept for API symmetry)
 * @param {object} operation — the operation object (pathItem[method])
 * @returns {object|null} — ErrorShape or null
 */
function extractErrorShape(spec, pathObj, operation) {
  if (!operation || !operation.responses) return null;

  const responses = operation.responses;
  const statusCodes = Object.keys(responses).sort();

  for (const code of statusCodes) {
    const numeric = parseInt(code, 10);
    if (!Number.isInteger(numeric) || numeric < 400) continue;

    const resp = responses[code];
    if (!resp || !resp.content) continue;

    // Check application/problem+json first, then application/json
    const contentTypes = ['application/problem+json', 'application/json'];
    for (const ct of contentTypes) {
      const content = resp.content[ct];
      if (!content || !content.schema) continue;

      const rawSchema = content.schema;
      const schemaRef = rawSchema.$ref || null;
      const resolved = resolveRef(spec, rawSchema) || rawSchema;
      const family = identifyErrorFamily(resolved, ct, spec);

      return buildShapeDescriptor(family, schemaRef, resolved, ct, spec);
    }
  }

  return null;
}

/**
 * Build the ErrorShape descriptor with family-specific field/message/status paths.
 */
function buildShapeDescriptor(family, schemaRef, resolvedSchema, contentType, spec) {
  const base = {
    family,
    schemaRef: schemaRef ? schemaRef.split('/').pop() : null,
    contentType,
  };

  switch (family) {
    case 'nest-default':
      return {
        ...base,
        fieldPath: 'message',
        messagePath: 'message',
        statusPath: 'statusCode',
      };

    case 'nest-wrapped':
      return {
        ...base,
        fieldPath: 'error.message',
        messagePath: 'error.message',
        statusPath: 'error.statusCode',
      };

    case 'problem-json': {
      // Check if schema has errors[] sub-array (extended Problem+JSON)
      const props = resolvedSchema.properties || {};
      const hasErrors = props.errors && (
        (resolveRef(spec, props.errors) || props.errors).type === 'array'
      );
      return {
        ...base,
        fieldPath: hasErrors ? 'errors[*].field' : 'detail',
        messagePath: 'detail',
        statusPath: 'status',
      };
    }

    case 'errors-array':
      return {
        ...base,
        fieldPath: 'errors[*].field',
        messagePath: 'errors[*].message',
        statusPath: null,
      };

    case 'raw':
    default:
      return {
        ...base,
        fieldPath: null,
        messagePath: null,
        statusPath: null,
      };
  }
}

/**
 * Build assertion steps for a given error shape + field name.
 *
 * These steps are suitable for injection into generated flows as 'expect' steps
 * that validate the error response mentions the offending field.
 *
 * @param {object} params
 * @param {object} params.errorShape — ErrorShape from extractErrorShape
 * @param {string} params.fieldName — the field being invalidated
 * @param {string[]|null} params.envelope — optional envelope wrapper keys
 * @returns {object[]} — array of assertion step descriptors
 */
function buildErrorAssertions({ errorShape, fieldName, envelope }) {
  if (!errorShape) {
    // Fallback: heuristic errorFieldMentions (legacy behavior)
    return [{ errorFieldMentions: fieldName }];
  }

  const prependEnvelope = (dotPath) => {
    if (!envelope || envelope.length === 0 || !dotPath) return dotPath;
    return envelope.join('.') + '.' + dotPath;
  };

  // Pass the envelope path to each generated step so the assertion runner
  // can unwrap the body before family-specific checks. Only include the
  // property when a non-empty envelope exists (keeps generated JSON clean).
  const envelopeProp = (envelope && envelope.length > 0) ? { envelope } : {};

  switch (errorShape.family) {
    case 'nest-default':
      // NestJS default: { statusCode: 400, message: ["email must be ..."], error: "Bad Request" }
      // message is either a string or an array of strings containing the field name
      return [{
        kind: 'expect-error-shape',
        family: 'nest-default',
        fieldName,
        messageContains: fieldName,
        statusCodeField: prependEnvelope('statusCode'),
        ...envelopeProp,
      }];

    case 'nest-wrapped':
      // Wrapped: { success: false, error: { statusCode: 400, message: "..." } }
      // The `error` key in the shape IS the errorEnvelope wrapper itself — not a
      // nested object inside another envelope. statusCodeField should be relative
      // to the unwrapped body (after envelope traversal), so use 'statusCode'
      // directly and let prependEnvelope add the envelope path (e.g. 'error.').
      return [{
        kind: 'expect-error-shape',
        family: 'nest-wrapped',
        fieldName,
        messageContains: fieldName,
        statusCodeField: prependEnvelope('statusCode'),
        ...envelopeProp,
      }];

    case 'problem-json':
      // RFC 7807: { type, title, status, detail, errors?: [{ field, code }] }
      if (errorShape.fieldPath === 'errors[*].field') {
        return [{
          kind: 'expect-error-shape',
          family: 'problem-json',
          fieldName,
          statusCodeField: prependEnvelope('status'),
          ...envelopeProp,
        }];
      }
      return [{
        kind: 'expect-error-shape',
        family: 'problem-json',
        fieldName,
        messageContains: fieldName,
        statusCodeField: prependEnvelope('status'),
        ...envelopeProp,
      }];

    case 'errors-array':
      // { errors: [{ field: "email", code: "INVALID" }] }
      return [{
        kind: 'expect-error-shape',
        family: 'errors-array',
        fieldName,
        ...envelopeProp,
      }];

    case 'raw':
    default:
      // No schema — fallback to heuristic
      return [{ errorFieldMentions: fieldName }];
  }
}

module.exports = {
  identifyErrorFamily,
  extractErrorShape,
  buildErrorAssertions,
  // exported for tests
  resolveRef,
  buildShapeDescriptor,
};
