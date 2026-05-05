'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  detectConditionalProfile,
  extractResponseHeaders,
  extractRequestConditionalHeaders,
  extractConditionalStatuses,
  extractVaryHeaders,
} = require('../conditional');

// ---------------------------------------------------------------------------
// Helper: minimal OpenAPI operation factory
// ---------------------------------------------------------------------------

function makeOp(overrides = {}) {
  return {
    responses: {},
    parameters: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// detectConditionalProfile — null for non-conditional
// ---------------------------------------------------------------------------

test('detectConditionalProfile: returns null for operation without conditional headers', () => {
  const op = makeOp({
    responses: { 200: { description: 'OK' } },
  });
  const result = detectConditionalProfile({}, op);
  assert.strictEqual(result, null);
});

test('detectConditionalProfile: returns null for null operation', () => {
  const result = detectConditionalProfile({}, null);
  assert.strictEqual(result, null);
});

// ---------------------------------------------------------------------------
// ETag detection via response headers
// ---------------------------------------------------------------------------

test('detectConditionalProfile: detects ETag from response headers', () => {
  const op = makeOp({
    responses: {
      200: {
        description: 'OK',
        headers: { ETag: { schema: { type: 'string' } } },
      },
    },
  });
  const result = detectConditionalProfile({}, op);
  assert.ok(result);
  assert.strictEqual(result.supportsETag, true);
  assert.ok(result.patterns.includes('if-none-match'));
});

// ---------------------------------------------------------------------------
// If-Match detection via request parameters
// ---------------------------------------------------------------------------

test('detectConditionalProfile: detects If-Match from parameters', () => {
  const op = makeOp({
    parameters: [
      { in: 'header', name: 'If-Match', required: true },
    ],
    responses: {
      200: { description: 'Updated' },
      412: { description: 'Precondition Failed' },
    },
  });
  const result = detectConditionalProfile({}, op);
  assert.ok(result);
  assert.strictEqual(result.supportsETag, true);
  assert.ok(result.patterns.includes('if-match'));
  assert.ok(result.conditionalStatuses.includes(412));
});

// ---------------------------------------------------------------------------
// Last-Modified detection
// ---------------------------------------------------------------------------

test('detectConditionalProfile: detects Last-Modified from response headers', () => {
  const op = makeOp({
    responses: {
      200: {
        description: 'OK',
        headers: { 'Last-Modified': { schema: { type: 'string' } } },
      },
    },
  });
  const result = detectConditionalProfile({}, op);
  assert.ok(result);
  assert.strictEqual(result.supportsLastModified, true);
  assert.ok(result.patterns.includes('if-modified-since'));
});

// ---------------------------------------------------------------------------
// x-etag-type extension
// ---------------------------------------------------------------------------

test('detectConditionalProfile: reads x-etag-type weak extension', () => {
  const op = makeOp({
    'x-etag-type': 'weak',
    responses: {
      200: {
        description: 'OK',
        headers: { ETag: { schema: { type: 'string' } } },
      },
    },
  });
  const result = detectConditionalProfile({}, op);
  assert.ok(result);
  assert.strictEqual(result.etagType, 'weak');
});

test('detectConditionalProfile: reads x-etag-type strong extension', () => {
  const op = makeOp({
    'x-etag-type': 'strong',
    responses: {
      200: {
        description: 'OK',
        headers: { ETag: { schema: { type: 'string' } } },
      },
    },
  });
  const result = detectConditionalProfile({}, op);
  assert.ok(result);
  assert.strictEqual(result.etagType, 'strong');
});

test('detectConditionalProfile: etagType is null when not declared', () => {
  const op = makeOp({
    responses: {
      200: {
        description: 'OK',
        headers: { ETag: { schema: { type: 'string' } } },
      },
    },
  });
  const result = detectConditionalProfile({}, op);
  assert.ok(result);
  assert.strictEqual(result.etagType, null);
});

// ---------------------------------------------------------------------------
// x-etag-source extension (Commit E)
// ---------------------------------------------------------------------------

test('detectConditionalProfile: reads x-etag-source operationId extension', () => {
  const op = makeOp({
    'x-etag-source': 'httpR2EtagStrong',
    parameters: [
      { in: 'header', name: 'If-Match', required: true },
    ],
    responses: {
      200: { description: 'Updated' },
      412: { description: 'Precondition Failed' },
    },
  });
  const result = detectConditionalProfile({}, op);
  assert.ok(result);
  assert.strictEqual(result.etagSourceOperationId, 'httpR2EtagStrong');
});

test('detectConditionalProfile: etagSourceOperationId is null when not declared', () => {
  const op = makeOp({
    parameters: [
      { in: 'header', name: 'If-Match', required: true },
    ],
    responses: {
      200: { description: 'Updated' },
      412: { description: 'Precondition Failed' },
    },
  });
  const result = detectConditionalProfile({}, op);
  assert.ok(result);
  assert.strictEqual(result.etagSourceOperationId, null);
});

// ---------------------------------------------------------------------------
// Conditional statuses extraction
// ---------------------------------------------------------------------------

test('extractConditionalStatuses: extracts 304, 412, 428', () => {
  const op = makeOp({
    responses: {
      200: { description: 'OK' },
      304: { description: 'Not Modified' },
      412: { description: 'Precondition Failed' },
      428: { description: 'Precondition Required' },
    },
  });
  const statuses = extractConditionalStatuses(op);
  assert.deepStrictEqual(statuses, [304, 412, 428]);
});

test('extractConditionalStatuses: returns empty array when no conditional statuses', () => {
  const op = makeOp({
    responses: { 200: { description: 'OK' }, 400: { description: 'Bad' } },
  });
  const statuses = extractConditionalStatuses(op);
  assert.deepStrictEqual(statuses, []);
});

// ---------------------------------------------------------------------------
// Vary header extraction
// ---------------------------------------------------------------------------

test('extractVaryHeaders: returns enum values when Vary has schema.enum', () => {
  const op = makeOp({
    responses: {
      200: {
        description: 'OK',
        headers: {
          Vary: { schema: { type: 'string', enum: ['Accept-Language', 'Accept'] } },
        },
      },
    },
  });
  const result = extractVaryHeaders(op);
  assert.deepStrictEqual(result, ['Accept-Language', 'Accept']);
});

test('extractVaryHeaders: returns null when no Vary header', () => {
  const op = makeOp({
    responses: { 200: { description: 'OK' } },
  });
  const result = extractVaryHeaders(op);
  assert.strictEqual(result, null);
});

// ---------------------------------------------------------------------------
// x-conditional extension for request headers
// ---------------------------------------------------------------------------

test('extractRequestConditionalHeaders: reads x-conditional array extension', () => {
  const op = makeOp({
    'x-conditional': ['If-Match', 'If-None-Match'],
    parameters: [],
  });
  const headers = extractRequestConditionalHeaders(op);
  assert.ok(headers.has('if-match'));
  assert.ok(headers.has('if-none-match'));
});

test('extractRequestConditionalHeaders: reads x-conditional string extension', () => {
  const op = makeOp({
    'x-conditional': 'If-Match',
    parameters: [],
  });
  const headers = extractRequestConditionalHeaders(op);
  assert.ok(headers.has('if-match'));
});

// ---------------------------------------------------------------------------
// Response headers extraction
// ---------------------------------------------------------------------------

test('extractResponseHeaders: finds etag and last-modified across response statuses', () => {
  const op = makeOp({
    responses: {
      200: {
        description: 'OK',
        headers: { ETag: { schema: { type: 'string' } } },
      },
      304: {
        description: 'Not Modified',
        headers: { 'Last-Modified': { schema: { type: 'string' } } },
      },
    },
  });
  const headers = extractResponseHeaders(op);
  assert.ok(headers.has('etag'));
  assert.ok(headers.has('last-modified'));
});
