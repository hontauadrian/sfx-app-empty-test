'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  detectPaginationProfile,
  extractQueryParams,
  detectResponseListShape,
  buildPaginationQueryContract,
  normalizeParamType,
  pickParamSample,
  extractParamConstraints,
  buildParamInvalidators,
} = require('../detectors/pagination');

// ---------------------------------------------------------------------------
// extractQueryParams
// ---------------------------------------------------------------------------

test('extractQueryParams: extracts inline query params', () => {
  const op = {
    parameters: [
      { in: 'query', name: 'page', required: false, schema: { type: 'integer', minimum: 1, default: 1 } },
      { in: 'query', name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ],
  };
  const result = extractQueryParams({}, op);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].name, 'page');
  assert.strictEqual(result[1].name, 'limit');
});

test('extractQueryParams: resolves $ref params', () => {
  const spec = {
    components: {
      parameters: {
        PageParam: { in: 'query', name: 'page', schema: { type: 'integer' } },
      },
    },
  };
  const op = {
    parameters: [
      { $ref: '#/components/parameters/PageParam' },
    ],
  };
  const result = extractQueryParams(spec, op);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].name, 'page');
});

test('extractQueryParams: returns empty for no parameters', () => {
  assert.deepStrictEqual(extractQueryParams({}, {}), []);
  assert.deepStrictEqual(extractQueryParams({}, { parameters: [] }), []);
});

// ---------------------------------------------------------------------------
// detectResponseListShape
// ---------------------------------------------------------------------------

test('detectResponseListShape: offset-style with items + total', () => {
  const op = {
    responses: {
      '200': {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                items: { type: 'array', items: { type: 'object' } },
                total: { type: 'number' },
                page: { type: 'number' },
              },
            },
          },
        },
      },
    },
  };
  const result = detectResponseListShape({}, op);
  assert.ok(result);
  assert.strictEqual(result.itemsField, 'items');
  assert.strictEqual(result.isBareArray, false);
  assert.strictEqual(result.keys.items, 'items');
  assert.strictEqual(result.keys.total, 'total');
  assert.strictEqual(result.keys.page, 'page');
});

test('detectResponseListShape: cursor-style with items + nextCursor', () => {
  const op = {
    responses: {
      '200': {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                items: { type: 'array', items: { type: 'object' } },
                nextCursor: { type: 'string' },
              },
            },
          },
        },
      },
    },
  };
  const result = detectResponseListShape({}, op);
  assert.ok(result);
  assert.strictEqual(result.keys.nextCursor, 'nextCursor');
  assert.strictEqual(result.isBareArray, false);
});

test('detectResponseListShape: bare array response', () => {
  const op = {
    responses: {
      '200': {
        content: {
          'application/json': {
            schema: { type: 'array', items: { type: 'object' } },
          },
        },
      },
    },
  };
  const result = detectResponseListShape({}, op);
  assert.ok(result);
  assert.strictEqual(result.isBareArray, true);
  assert.strictEqual(result.itemsField, null);
});

test('detectResponseListShape: no response schema', () => {
  assert.strictEqual(detectResponseListShape({}, {}), null);
  assert.strictEqual(detectResponseListShape({}, { responses: { '200': {} } }), null);
});

test('detectResponseListShape: no array property in object', () => {
  const op = {
    responses: {
      '200': {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
              },
            },
          },
        },
      },
    },
  };
  assert.strictEqual(detectResponseListShape({}, op), null);
});

// ---------------------------------------------------------------------------
// detectPaginationProfile — offset style
// ---------------------------------------------------------------------------

test('detectPaginationProfile: offset-style with page + limit', () => {
  const op = {
    parameters: [
      { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1, default: 1 } },
      { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
    ],
    responses: {
      '200': {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                items: { type: 'array', items: { type: 'object' } },
                total: { type: 'number' },
              },
            },
          },
        },
      },
    },
  };
  const result = detectPaginationProfile({}, op);
  assert.ok(result);
  assert.strictEqual(result.style, 'offset');
  assert.strictEqual(result.paramNames.page, 'page');
  assert.strictEqual(result.paramNames.limit, 'limit');
  assert.strictEqual(result.maxLimit, 100);
  assert.strictEqual(result.defaultLimit, 20);
  assert.strictEqual(result.isBareArray, false);
});

// ---------------------------------------------------------------------------
// detectPaginationProfile — cursor style
// ---------------------------------------------------------------------------

test('detectPaginationProfile: cursor-style with cursor + limit', () => {
  const op = {
    parameters: [
      { in: 'query', name: 'cursor', schema: { type: 'string' } },
      { in: 'query', name: 'limit', schema: { type: 'integer', maximum: 50 } },
    ],
    responses: {
      '200': {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                items: { type: 'array', items: { type: 'object' } },
                nextCursor: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
    },
  };
  const result = detectPaginationProfile({}, op);
  assert.ok(result);
  assert.strictEqual(result.style, 'cursor');
  assert.strictEqual(result.paramNames.cursor, 'cursor');
  assert.strictEqual(result.paramNames.limit, 'limit');
  assert.strictEqual(result.maxLimit, 50);
  assert.strictEqual(result.isBareArray, false);
  // Cursor param should be excluded from sampleValid (first page has no cursor)
  assert.strictEqual(result.queryContract.sampleValid.cursor, undefined);
  assert.ok(result.queryContract.sampleValid.limit !== undefined);
});

// ---------------------------------------------------------------------------
// detectPaginationProfile — link-header style
// ---------------------------------------------------------------------------

test('detectPaginationProfile: link-header-style (offset params + bare array response)', () => {
  const op = {
    parameters: [
      { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1 } },
      { in: 'query', name: 'limit', schema: { type: 'integer', maximum: 100 } },
    ],
    responses: {
      '200': {
        content: {
          'application/json': {
            schema: { type: 'array', items: { type: 'object' } },
          },
        },
      },
    },
  };
  const result = detectPaginationProfile({}, op);
  assert.ok(result);
  assert.strictEqual(result.style, 'link-header');
  assert.strictEqual(result.paramNames.page, 'page');
  assert.strictEqual(result.paramNames.limit, 'limit');
  assert.strictEqual(result.isBareArray, true);
});

// ---------------------------------------------------------------------------
// detectPaginationProfile — not paginated
// ---------------------------------------------------------------------------

test('detectPaginationProfile: null for non-paginated endpoint', () => {
  const op = {
    parameters: [
      { in: 'query', name: 'search', schema: { type: 'string' } },
    ],
    responses: {
      '200': {
        content: {
          'application/json': {
            schema: { type: 'object', properties: { id: { type: 'string' } } },
          },
        },
      },
    },
  };
  assert.strictEqual(detectPaginationProfile({}, op), null);
});

test('detectPaginationProfile: null for no params', () => {
  assert.strictEqual(detectPaginationProfile({}, {}), null);
  assert.strictEqual(detectPaginationProfile({}, null), null);
  assert.strictEqual(detectPaginationProfile({}, undefined), null);
});

test('detectPaginationProfile: limit-only param still detects offset', () => {
  const op = {
    parameters: [
      { in: 'query', name: 'limit', schema: { type: 'integer', maximum: 50, default: 10 } },
    ],
    responses: {
      '200': {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                items: { type: 'array', items: { type: 'object' } },
                total: { type: 'number' },
              },
            },
          },
        },
      },
    },
  };
  const result = detectPaginationProfile({}, op);
  assert.ok(result);
  assert.strictEqual(result.style, 'offset');
  assert.strictEqual(result.paramNames.limit, 'limit');
  assert.strictEqual(result.maxLimit, 50);
  assert.strictEqual(result.defaultLimit, 10);
});

// ---------------------------------------------------------------------------
// normalizeParamType
// ---------------------------------------------------------------------------

test('normalizeParamType: normalizes integer to number', () => {
  assert.strictEqual(normalizeParamType({ type: 'integer' }), 'number');
  assert.strictEqual(normalizeParamType({ type: 'string' }), 'string');
  assert.strictEqual(normalizeParamType({ type: 'boolean' }), 'boolean');
  assert.strictEqual(normalizeParamType({ type: 'number' }), 'number');
  assert.strictEqual(normalizeParamType({}), 'string');
});

// ---------------------------------------------------------------------------
// pickParamSample
// ---------------------------------------------------------------------------

test('pickParamSample: uses example/default/enum first', () => {
  assert.strictEqual(pickParamSample({ example: 42 }, 'number', 'limit'), 42);
  assert.strictEqual(pickParamSample({ default: 5 }, 'number', 'page'), 5);
  assert.strictEqual(pickParamSample({ enum: ['a', 'b'] }, 'string', 'sort'), 'a');
});

test('pickParamSample: uses sensible defaults for pagination params', () => {
  assert.strictEqual(pickParamSample({}, 'number', 'page'), 1);
  assert.strictEqual(pickParamSample({}, 'number', 'limit'), 10);
  assert.strictEqual(pickParamSample({}, 'string', 'cursor'), 'xxx');
  assert.strictEqual(pickParamSample({}, 'number', 'offset'), 1);
});

// ---------------------------------------------------------------------------
// extractParamConstraints
// ---------------------------------------------------------------------------

test('extractParamConstraints: extracts min/max/enum', () => {
  const result = extractParamConstraints({ minimum: 1, maximum: 100, enum: ['a'] });
  assert.strictEqual(result.min, 1);
  assert.strictEqual(result.max, 100);
  assert.deepStrictEqual(result.enum, ['a']);
});

test('extractParamConstraints: empty for no constraints', () => {
  assert.deepStrictEqual(extractParamConstraints({}), {});
});

// ---------------------------------------------------------------------------
// buildParamInvalidators
// ---------------------------------------------------------------------------

test('buildParamInvalidators: number with min/max produces below-min, above-max, wrong-type', () => {
  const inv = buildParamInvalidators('limit', { minimum: 1, maximum: 100 }, 'number', false);
  const kinds = inv.map((i) => i.kind);
  assert.ok(kinds.includes('below-min'));
  assert.ok(kinds.includes('above-max'));
  assert.ok(kinds.includes('wrong-type'));
});

test('buildParamInvalidators: required param produces missing', () => {
  const inv = buildParamInvalidators('page', {}, 'number', true);
  assert.ok(inv.some((i) => i.kind === 'missing'));
});

test('buildParamInvalidators: cursor param produces invalid-cursor', () => {
  const inv = buildParamInvalidators('cursor', {}, 'string', false);
  assert.ok(inv.some((i) => i.kind === 'invalid-cursor'));
});

// ---------------------------------------------------------------------------
// buildPaginationQueryContract
// ---------------------------------------------------------------------------

test('buildPaginationQueryContract: builds contract from params', () => {
  const params = [
    { name: 'page', required: false, schema: { type: 'integer', minimum: 1, default: 1 } },
    { name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
  ];
  const contract = buildPaginationQueryContract(params, {});
  assert.strictEqual(contract.schemaRef, 'pagination-query');
  assert.strictEqual(contract.fields.length, 2);
  assert.strictEqual(contract.sampleValid.page, 1);
  assert.strictEqual(contract.sampleValid.limit, 20);
});

// ---------------------------------------------------------------------------
// detectPaginationProfile — $ref response schema
// ---------------------------------------------------------------------------

test('detectPaginationProfile: resolves $ref response schema', () => {
  const spec = {
    components: {
      schemas: {
        PaginatedResponse: {
          type: 'object',
          properties: {
            items: { type: 'array', items: { type: 'object' } },
            total: { type: 'number' },
            totalPages: { type: 'number' },
          },
        },
      },
    },
  };
  const op = {
    parameters: [
      { in: 'query', name: 'page', schema: { type: 'integer' } },
      { in: 'query', name: 'limit', schema: { type: 'integer', maximum: 50 } },
    ],
    responses: {
      '200': {
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/PaginatedResponse' },
          },
        },
      },
    },
  };
  const result = detectPaginationProfile(spec, op);
  assert.ok(result);
  assert.strictEqual(result.style, 'offset');
  assert.strictEqual(result.responseKeys.total, 'total');
  assert.strictEqual(result.responseKeys.totalPages, 'totalPages');
});
