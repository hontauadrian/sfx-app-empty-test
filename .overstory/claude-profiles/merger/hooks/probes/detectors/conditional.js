'use strict';

/**
 * detectors/conditional.js — Detect ETag / conditional-request support from OpenAPI.
 *
 * Declaration-driven: inspects OpenAPI response headers for ETag/Last-Modified
 * and request parameters/headers for If-None-Match/If-Match/If-Modified-Since.
 *
 * Returns a ConditionalProfile per endpoint, or null if not conditional.
 */

// ---------------------------------------------------------------------------
// Known conditional header names
// ---------------------------------------------------------------------------

/** Response headers that indicate conditional support. */
const RESPONSE_CONDITIONAL_HEADERS = new Set([
  'etag', 'last-modified',
]);

/** Request headers that indicate conditional negotiation. */
const REQUEST_CONDITIONAL_HEADERS = new Set([
  'if-none-match', 'if-match', 'if-modified-since', 'if-unmodified-since',
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect conditional-request profile from an OpenAPI operation.
 *
 * @param {object} _spec - Full OpenAPI spec (for $ref resolution)
 * @param {object|null} op - Single operation object
 * @returns {object|null} ConditionalProfile or null
 */
function detectConditionalProfile(_spec, op) {
  if (!op) return null;

  const responseHeaders = extractResponseHeaders(op);
  const requestHeaders = extractRequestConditionalHeaders(op);

  const supportsETag = responseHeaders.has('etag') ||
    requestHeaders.has('if-none-match') ||
    requestHeaders.has('if-match');

  const supportsLastModified = responseHeaders.has('last-modified') ||
    requestHeaders.has('if-modified-since') ||
    requestHeaders.has('if-unmodified-since');

  if (!supportsETag && !supportsLastModified) return null;

  // Read x-etag-type extension (weak|strong) — declared by developer on the operation
  const etagType = op['x-etag-type'] || null;

  // Read x-etag-source extension — operationId of the GET endpoint that provides
  // ETag values for this mutating endpoint's If-Match flow. Declared by developer
  // on PUT/PATCH endpoints where the ETag source is at a different path.
  const etagSourceOperationId = op['x-etag-source'] || null;

  // Read Vary header from response headers
  const supportsVary = extractVaryHeaders(op);

  // Determine which conditional negotiation patterns are declared
  const patterns = [];

  if (requestHeaders.has('if-none-match') || (supportsETag && responseHeaders.has('etag'))) {
    patterns.push('if-none-match');
  }
  if (requestHeaders.has('if-match')) {
    patterns.push('if-match');
  }
  if (requestHeaders.has('if-modified-since') || (supportsLastModified && responseHeaders.has('last-modified'))) {
    patterns.push('if-modified-since');
  }
  if (requestHeaders.has('if-unmodified-since')) {
    patterns.push('if-unmodified-since');
  }

  // Extract declared conditional statuses from responses
  const conditionalStatuses = extractConditionalStatuses(op);

  return {
    supportsETag,
    supportsLastModified,
    etagType,
    etagSourceOperationId,
    supportsVary,
    patterns,
    conditionalStatuses,
    responseHeaders: Array.from(responseHeaders),
    requestHeaders: Array.from(requestHeaders),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract response headers from all response status codes.
 * Looks at responses.*.headers for ETag/Last-Modified declarations.
 *
 * @param {object} op - OpenAPI operation
 * @returns {Set<string>} lowercase header names
 */
function extractResponseHeaders(op) {
  const found = new Set();
  const responses = op.responses || {};

  for (const [_statusCode, responseObj] of Object.entries(responses)) {
    const headers = responseObj.headers || {};
    for (const headerName of Object.keys(headers)) {
      const lc = headerName.toLowerCase();
      if (RESPONSE_CONDITIONAL_HEADERS.has(lc)) {
        found.add(lc);
      }
    }
  }

  return found;
}

/**
 * Extract request-side conditional headers from parameters.
 * Looks at parameters[in=header] for If-None-Match/If-Match etc.
 *
 * @param {object} op - OpenAPI operation
 * @returns {Set<string>} lowercase header names
 */
function extractRequestConditionalHeaders(op) {
  const found = new Set();
  const parameters = op.parameters || [];

  for (const param of parameters) {
    if (param.in !== 'header') continue;
    const lc = (param.name || '').toLowerCase();
    if (REQUEST_CONDITIONAL_HEADERS.has(lc)) {
      found.add(lc);
    }
  }

  // Also check x-conditional extension
  if (op['x-conditional']) {
    const headers = Array.isArray(op['x-conditional']) ? op['x-conditional'] : [op['x-conditional']];
    for (const h of headers) {
      const lc = (h || '').toLowerCase();
      if (REQUEST_CONDITIONAL_HEADERS.has(lc)) {
        found.add(lc);
      }
    }
  }

  return found;
}

/**
 * Extract Vary response header declarations from operation responses.
 * Returns the declared Vary header values, or null if no Vary declared.
 *
 * @param {object} op - OpenAPI operation
 * @returns {string[]|null} Vary header values or null
 */
function extractVaryHeaders(op) {
  const responses = op.responses || {};
  for (const [_statusCode, responseObj] of Object.entries(responses)) {
    const headers = responseObj.headers || {};
    for (const headerName of Object.keys(headers)) {
      if (headerName.toLowerCase() === 'vary') {
        // Extract declared Vary values from schema description or enum
        const headerObj = headers[headerName];
        const schema = headerObj.schema || {};
        if (schema.enum) return schema.enum;
        if (headerObj.description) return [headerObj.description];
        return ['*'];
      }
    }
  }
  return null;
}

/**
 * Extract status codes related to conditional responses (304, 412, 428).
 *
 * @param {object} op - OpenAPI operation
 * @returns {number[]} declared conditional status codes
 */
function extractConditionalStatuses(op) {
  const statuses = [];
  const responses = op.responses || {};

  for (const statusCode of Object.keys(responses)) {
    const code = parseInt(statusCode, 10);
    if (code === 304 || code === 412 || code === 428) {
      statuses.push(code);
    }
  }

  return statuses.sort((a, b) => a - b);
}

module.exports = {
  detectConditionalProfile,
  extractResponseHeaders,
  extractRequestConditionalHeaders,
  extractConditionalStatuses,
  extractVaryHeaders,
};
