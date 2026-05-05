'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  detectConditionalProfile,
  extractResponseHeaders,
  extractRequestConditionalHeaders,
  extractConditionalStatuses,
} = require('../detectors/conditional');

// ---------------------------------------------------------------------------
// extractResponseHeaders
// ---------------------------------------------------------------------------

test('extractResponseHeaders: extracts ETag from 200 response', () => {
  const op = {
    responses: {
      '200': {
        headers: {
          ETag: { schema: { type: 'string' }, description: 'Entity tag' },
          'X-Request-Id': { schema: { type: 'string' } },
        },
      },
    },
  };
  const result = extractResponseHeaders(op);
  assert.ok(result.has('etag'));
  assert.strictEqual(result.has('x-request-id'), false);
  assert.strictEqual(result.size, 1);
});

test('extractResponseHeaders: extracts Last-Modified', () => {
  const op = {
    responses: {
      '200': {
        headers: {
          'Last-Modified': { schema: { type: 'string' } },
        },
      },
    },
  };
  const result = extractResponseHeaders(op);
  assert.ok(result.has('last-modified'));
});

test('extractResponseHeaders: extracts from multiple response codes', () => {
  const op = {
    responses: {
      '200': {
        headers: { ETag: { schema: { type: 'string' } } },
      },
      '304': {
        description: 'Not Modified',
      },
    },
  };
  const result = extractResponseHeaders(op);
  assert.ok(result.has('etag'));
  assert.strictEqual(result.size, 1);
});

test('extractResponseHeaders: returns empty for no headers', () => {
  const op = { responses: { '200': {} } };
  const result = extractResponseHeaders(op);
  assert.strictEqual(result.size, 0);
});

// ---------------------------------------------------------------------------
// extractRequestConditionalHeaders
// ---------------------------------------------------------------------------

test('extractRequestConditionalHeaders: extracts If-None-Match from parameters', () => {
  const op = {
    parameters: [
      { in: 'header', name: 'If-None-Match', required: false },
      { in: 'query', name: 'page', schema: { type: 'integer' } },
    ],
  };
  const result = extractRequestConditionalHeaders(op);
  assert.ok(result.has('if-none-match'));
  assert.strictEqual(result.size, 1);
});

test('extractRequestConditionalHeaders: extracts If-Match', () => {
  const op = {
    parameters: [
      { in: 'header', name: 'If-Match', required: true },
    ],
  };
  const result = extractRequestConditionalHeaders(op);
  assert.ok(result.has('if-match'));
});

test('extractRequestConditionalHeaders: extracts multiple conditional headers', () => {
  const op = {
    parameters: [
      { in: 'header', name: 'If-None-Match', required: false },
      { in: 'header', name: 'If-Match', required: true },
      { in: 'header', name: 'If-Modified-Since', required: false },
    ],
  };
  const result = extractRequestConditionalHeaders(op);
  assert.strictEqual(result.size, 3);
  assert.ok(result.has('if-none-match'));
  assert.ok(result.has('if-match'));
  assert.ok(result.has('if-modified-since'));
});

test('extractRequestConditionalHeaders: ignores non-conditional headers', () => {
  const op = {
    parameters: [
      { in: 'header', name: 'Authorization', required: true },
      { in: 'header', name: 'Content-Type', required: false },
    ],
  };
  const result = extractRequestConditionalHeaders(op);
  assert.strictEqual(result.size, 0);
});

test('extractRequestConditionalHeaders: returns empty for no parameters', () => {
  const op = {};
  const result = extractRequestConditionalHeaders(op);
  assert.strictEqual(result.size, 0);
});

// ---------------------------------------------------------------------------
// extractConditionalStatuses
// ---------------------------------------------------------------------------

test('extractConditionalStatuses: extracts 304 and 412', () => {
  const op = {
    responses: {
      '200': { description: 'OK' },
      '304': { description: 'Not Modified' },
      '412': { description: 'Precondition Failed' },
    },
  };
  const result = extractConditionalStatuses(op);
  assert.deepStrictEqual(result, [304, 412]);
});

test('extractConditionalStatuses: extracts 428', () => {
  const op = {
    responses: {
      '200': { description: 'OK' },
      '428': { description: 'Precondition Required' },
    },
  };
  const result = extractConditionalStatuses(op);
  assert.deepStrictEqual(result, [428]);
});

test('extractConditionalStatuses: returns empty for no conditional statuses', () => {
  const op = {
    responses: {
      '200': { description: 'OK' },
      '400': { description: 'Bad Request' },
    },
  };
  const result = extractConditionalStatuses(op);
  assert.deepStrictEqual(result, []);
});

// ---------------------------------------------------------------------------
// detectConditionalProfile — ETag via response headers
// ---------------------------------------------------------------------------

test('detectConditionalProfile: detects ETag from response header', () => {
  const op = {
    responses: {
      '200': {
        headers: { ETag: { schema: { type: 'string' } } },
      },
      '304': { description: 'Not Modified' },
    },
    parameters: [
      { in: 'header', name: 'If-None-Match', required: false },
    ],
  };
  const result = detectConditionalProfile({}, op);
  assert.ok(result);
  assert.strictEqual(result.supportsETag, true);
  assert.strictEqual(result.supportsLastModified, false);
  assert.ok(result.patterns.includes('if-none-match'));
  assert.deepStrictEqual(result.conditionalStatuses, [304]);
});

test('detectConditionalProfile: detects If-Match pattern', () => {
  const op = {
    responses: {
      '200': { description: 'OK' },
      '412': { description: 'Precondition Failed' },
    },
    parameters: [
      { in: 'header', name: 'If-Match', required: true },
    ],
  };
  const result = detectConditionalProfile({}, op);
  assert.ok(result);
  assert.strictEqual(result.supportsETag, true);
  assert.ok(result.patterns.includes('if-match'));
  assert.deepStrictEqual(result.conditionalStatuses, [412]);
});

test('detectConditionalProfile: detects Last-Modified', () => {
  const op = {
    responses: {
      '200': {
        headers: { 'Last-Modified': { schema: { type: 'string' } } },
      },
    },
  };
  const result = detectConditionalProfile({}, op);
  assert.ok(result);
  assert.strictEqual(result.supportsETag, false);
  assert.strictEqual(result.supportsLastModified, true);
  assert.ok(result.patterns.includes('if-modified-since'));
});

test('detectConditionalProfile: full conditional endpoint (ETag + If-Match + If-None-Match)', () => {
  const op = {
    responses: {
      '200': {
        headers: { ETag: { schema: { type: 'string' } } },
      },
      '304': { description: 'Not Modified' },
      '412': { description: 'Precondition Failed' },
    },
    parameters: [
      { in: 'header', name: 'If-None-Match', required: false },
      { in: 'header', name: 'If-Match', required: false },
    ],
  };
  const result = detectConditionalProfile({}, op);
  assert.ok(result);
  assert.strictEqual(result.supportsETag, true);
  assert.ok(result.patterns.includes('if-none-match'));
  assert.ok(result.patterns.includes('if-match'));
  assert.deepStrictEqual(result.conditionalStatuses, [304, 412]);
});

test('detectConditionalProfile: null for non-conditional endpoint', () => {
  const op = {
    responses: {
      '200': { description: 'OK' },
    },
    parameters: [
      { in: 'query', name: 'page', schema: { type: 'integer' } },
    ],
  };
  assert.strictEqual(detectConditionalProfile({}, op), null);
});

test('detectConditionalProfile: null for null/undefined op', () => {
  assert.strictEqual(detectConditionalProfile({}, null), null);
  assert.strictEqual(detectConditionalProfile({}, undefined), null);
});

test('detectConditionalProfile: ETag only from response header (no request params)', () => {
  const op = {
    responses: {
      '200': {
        headers: { ETag: { schema: { type: 'string' } } },
      },
    },
  };
  const result = detectConditionalProfile({}, op);
  assert.ok(result);
  assert.strictEqual(result.supportsETag, true);
  assert.ok(result.patterns.includes('if-none-match'));
  assert.deepStrictEqual(result.responseHeaders, ['etag']);
});

test('detectConditionalProfile: 428 precondition required', () => {
  const op = {
    responses: {
      '200': { description: 'OK' },
      '428': { description: 'Precondition Required' },
    },
    parameters: [
      { in: 'header', name: 'If-Match', required: true },
    ],
  };
  const result = detectConditionalProfile({}, op);
  assert.ok(result);
  assert.ok(result.patterns.includes('if-match'));
  assert.deepStrictEqual(result.conditionalStatuses, [428]);
});

// ---------------------------------------------------------------------------
// x-etag-type extension support
// ---------------------------------------------------------------------------

test('detectConditionalProfile: reads x-etag-type weak', () => {
  const op = {
    'x-etag-type': 'weak',
    responses: {
      '200': {
        description: 'OK',
        headers: { ETag: { schema: { type: 'string' } } },
      },
      '304': { description: 'Not Modified' },
    },
    parameters: [{ in: 'header', name: 'If-None-Match', required: false }],
  };
  const result = detectConditionalProfile({}, op);
  assert.ok(result);
  assert.strictEqual(result.etagType, 'weak');
});

test('detectConditionalProfile: reads x-etag-type strong', () => {
  const op = {
    'x-etag-type': 'strong',
    responses: {
      '200': {
        description: 'OK',
        headers: { ETag: { schema: { type: 'string' } } },
      },
    },
    parameters: [{ in: 'header', name: 'If-None-Match', required: false }],
  };
  const result = detectConditionalProfile({}, op);
  assert.ok(result);
  assert.strictEqual(result.etagType, 'strong');
});

test('detectConditionalProfile: etagType is null when x-etag-type not present', () => {
  const op = {
    responses: {
      '200': {
        description: 'OK',
        headers: { ETag: { schema: { type: 'string' } } },
      },
    },
    parameters: [{ in: 'header', name: 'If-None-Match', required: false }],
  };
  const result = detectConditionalProfile({}, op);
  assert.ok(result);
  assert.strictEqual(result.etagType, null);
});

// ---------------------------------------------------------------------------
// Vary header detection
// ---------------------------------------------------------------------------

test('detectConditionalProfile: detects Vary header from response headers', () => {
  const op = {
    responses: {
      '200': {
        description: 'OK',
        headers: {
          ETag: { schema: { type: 'string' } },
          Vary: { schema: { type: 'string' }, description: 'Accept-Language' },
        },
      },
      '304': { description: 'Not Modified' },
    },
    parameters: [{ in: 'header', name: 'If-None-Match', required: false }],
  };
  const result = detectConditionalProfile({}, op);
  assert.ok(result);
  assert.ok(result.supportsVary);
  assert.deepStrictEqual(result.supportsVary, ['Accept-Language']);
});

test('detectConditionalProfile: supportsVary is null when no Vary header', () => {
  const op = {
    responses: {
      '200': {
        description: 'OK',
        headers: { ETag: { schema: { type: 'string' } } },
      },
    },
    parameters: [{ in: 'header', name: 'If-None-Match', required: false }],
  };
  const result = detectConditionalProfile({}, op);
  assert.ok(result);
  assert.strictEqual(result.supportsVary, null);
});
