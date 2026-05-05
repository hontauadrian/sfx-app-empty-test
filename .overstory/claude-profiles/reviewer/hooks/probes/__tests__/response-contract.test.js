'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  extractResponseContract,
  resolveSchemaRef,
  collectRequiredPaths,
  resolvePropertySchema,
  mergeSchemas,
  isNullable,
} = require('../lib/response-contract');

// ---------------------------------------------------------------------------
// resolveSchemaRef
// ---------------------------------------------------------------------------

test('resolveSchemaRef resolves a $ref path', () => {
  const spec = {
    components: {
      schemas: {
        AuthResponse: { type: 'object', properties: { token: { type: 'string' } } },
      },
    },
  };
  const result = resolveSchemaRef(spec, '#/components/schemas/AuthResponse');
  assert.deepStrictEqual(result, spec.components.schemas.AuthResponse);
});

test('resolveSchemaRef returns null for invalid ref', () => {
  assert.strictEqual(resolveSchemaRef({}, '#/components/schemas/Missing'), null);
  assert.strictEqual(resolveSchemaRef({}, null), null);
  assert.strictEqual(resolveSchemaRef({}, ''), null);
});

test('resolveSchemaRef returns null for non-string ref', () => {
  assert.strictEqual(resolveSchemaRef({}, 42), null);
  assert.strictEqual(resolveSchemaRef({}, undefined), null);
});

// ---------------------------------------------------------------------------
// isNullable
// ---------------------------------------------------------------------------

test('isNullable detects nullable:true (OpenAPI 3.0)', () => {
  assert.strictEqual(isNullable({ type: 'string', nullable: true }), true);
  assert.strictEqual(isNullable({ type: 'string' }), false);
});

test('isNullable detects type array with null (OpenAPI 3.1)', () => {
  assert.strictEqual(isNullable({ type: ['string', 'null'] }), true);
  assert.strictEqual(isNullable({ type: ['string'] }), false);
});

test('isNullable returns false for null/undefined input', () => {
  assert.strictEqual(isNullable(null), false);
  assert.strictEqual(isNullable(undefined), false);
});

// ---------------------------------------------------------------------------
// collectRequiredPaths — flat schema
// ---------------------------------------------------------------------------

test('collectRequiredPaths: flat schema with required fields', () => {
  const schema = {
    type: 'object',
    required: ['accessToken', 'user'],
    properties: {
      accessToken: { type: 'string' },
      user: {
        type: 'object',
        required: ['id', 'email'],
        properties: {
          id: { type: 'string' },
          email: { type: 'string' },
          bio: { type: 'string' },
        },
      },
    },
  };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, ['accessToken', 'user', 'user.email', 'user.id']);
});

// ---------------------------------------------------------------------------
// collectRequiredPaths — nullable field excluded
// ---------------------------------------------------------------------------

test('collectRequiredPaths: nullable field excluded from required paths', () => {
  const schema = {
    type: 'object',
    required: ['id', 'name', 'avatar'],
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      avatar: { type: 'string', nullable: true },
    },
  };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, ['id', 'name']);
});

test('collectRequiredPaths: OpenAPI 3.1 nullable excluded', () => {
  const schema = {
    type: 'object',
    required: ['id', 'deletedAt'],
    properties: {
      id: { type: 'string' },
      deletedAt: { type: ['string', 'null'] },
    },
  };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, ['id']);
});

// ---------------------------------------------------------------------------
// collectRequiredPaths — $ref resolution
// ---------------------------------------------------------------------------

test('collectRequiredPaths: $ref resolution', () => {
  const spec = {
    components: {
      schemas: {
        UserDto: {
          type: 'object',
          required: ['id', 'email'],
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
          },
        },
      },
    },
  };
  const schema = {
    type: 'object',
    required: ['user'],
    properties: {
      user: { $ref: '#/components/schemas/UserDto' },
    },
  };
  const paths = collectRequiredPaths(schema, '', spec);
  assert.deepStrictEqual(paths, ['user', 'user.email', 'user.id']);
});

// ---------------------------------------------------------------------------
// collectRequiredPaths — nested array
// ---------------------------------------------------------------------------

test('collectRequiredPaths: nested array with items', () => {
  const schema = {
    type: 'object',
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'name'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            optional: { type: 'string' },
          },
        },
      },
    },
  };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, ['items', 'items[*].id', 'items[*].name']);
});

test('collectRequiredPaths: top-level array schema', () => {
  const schema = {
    type: 'array',
    items: {
      type: 'object',
      required: ['id', 'name'],
      properties: {
        id: { type: 'number' },
        name: { type: 'string' },
      },
    },
  };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, ['[*].id', '[*].name']);
});

// ---------------------------------------------------------------------------
// collectRequiredPaths — oneOf: only common fields
// ---------------------------------------------------------------------------

test('collectRequiredPaths: oneOf returns intersection of required fields', () => {
  const schema = {
    oneOf: [
      {
        type: 'object',
        required: ['id', 'name', 'type'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          type: { type: 'string' },
        },
      },
      {
        type: 'object',
        required: ['id', 'code'],
        properties: {
          id: { type: 'string' },
          code: { type: 'number' },
        },
      },
    ],
  };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, ['id']);
});

test('collectRequiredPaths: anyOf with no common fields returns empty', () => {
  const schema = {
    anyOf: [
      { type: 'object', required: ['a'], properties: { a: { type: 'string' } } },
      { type: 'object', required: ['b'], properties: { b: { type: 'string' } } },
    ],
  };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, []);
});

// ---------------------------------------------------------------------------
// collectRequiredPaths — edge cases
// ---------------------------------------------------------------------------

test('collectRequiredPaths: null/undefined schema returns empty', () => {
  assert.deepStrictEqual(collectRequiredPaths(null, '', {}), []);
  assert.deepStrictEqual(collectRequiredPaths(undefined, '', {}), []);
});

test('collectRequiredPaths: schema with no required returns empty', () => {
  const schema = {
    type: 'object',
    properties: { id: { type: 'string' }, name: { type: 'string' } },
  };
  assert.deepStrictEqual(collectRequiredPaths(schema, '', {}), []);
});

test('collectRequiredPaths: schema with prefix', () => {
  const schema = {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string' } },
  };
  const paths = collectRequiredPaths(schema, 'data', {});
  assert.deepStrictEqual(paths, ['data.id']);
});

// ---------------------------------------------------------------------------
// extractResponseContract
// ---------------------------------------------------------------------------

test('extractResponseContract: extracts from 200 response with JSON schema', () => {
  const spec = {
    components: {
      schemas: {
        AuthResponse: {
          type: 'object',
          required: ['accessToken', 'user'],
          properties: {
            accessToken: { type: 'string' },
            user: {
              type: 'object',
              required: ['id', 'email'],
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
              },
            },
          },
        },
      },
    },
  };
  const operation = {
    responses: {
      '201': {
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AuthResponse' },
          },
        },
      },
      '400': { description: 'Bad request' },
    },
  };
  const contract = extractResponseContract(spec, operation);
  assert.ok(contract);
  assert.strictEqual(contract.status, 201);
  assert.strictEqual(contract.schemaRef, 'AuthResponse');
  assert.deepStrictEqual(contract.requiredPaths, ['accessToken', 'user', 'user.email', 'user.id']);
  assert.deepStrictEqual(contract.fields, ['accessToken', 'user']);
});

test('extractResponseContract: returns null when no 2xx response', () => {
  const operation = {
    responses: {
      '400': { description: 'Bad request' },
      '500': { description: 'Error' },
    },
  };
  assert.strictEqual(extractResponseContract({}, operation), null);
});

test('extractResponseContract: returns null when no JSON content', () => {
  const operation = {
    responses: {
      '200': {
        content: {
          'text/plain': { schema: { type: 'string' } },
        },
      },
    },
  };
  assert.strictEqual(extractResponseContract({}, operation), null);
});

test('extractResponseContract: returns null for null operation', () => {
  assert.strictEqual(extractResponseContract({}, null), null);
  assert.strictEqual(extractResponseContract({}, {}), null);
});

test('extractResponseContract: inline schema (no $ref)', () => {
  const operation = {
    responses: {
      '200': {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['count'],
              properties: {
                count: { type: 'number' },
                items: { type: 'array' },
              },
            },
          },
        },
      },
    },
  };
  const contract = extractResponseContract({}, operation);
  assert.ok(contract);
  assert.strictEqual(contract.status, 200);
  assert.strictEqual(contract.schemaRef, 'inline');
  assert.deepStrictEqual(contract.requiredPaths, ['count']);
});

// ---------------------------------------------------------------------------
// resolvePropertySchema
// ---------------------------------------------------------------------------

test('resolvePropertySchema: direct $ref', () => {
  const spec = {
    components: {
      schemas: {
        AuthorDto: {
          type: 'object',
          required: ['id', 'name'],
          properties: { id: { type: 'string' }, name: { type: 'string' } },
        },
      },
    },
  };
  const result = resolvePropertySchema({ $ref: '#/components/schemas/AuthorDto' }, spec);
  assert.deepStrictEqual(result, spec.components.schemas.AuthorDto);
});

test('resolvePropertySchema: allOf with single $ref (NestJS pattern)', () => {
  const spec = {
    components: {
      schemas: {
        AuthorDto: {
          type: 'object',
          required: ['id', 'name'],
          properties: { id: { type: 'string' }, name: { type: 'string' } },
        },
      },
    },
  };
  const raw = { allOf: [{ $ref: '#/components/schemas/AuthorDto' }] };
  const result = resolvePropertySchema(raw, spec);
  assert.deepStrictEqual(result, spec.components.schemas.AuthorDto);
});

test('resolvePropertySchema: allOf merging multiple branches', () => {
  const spec = {
    components: {
      schemas: {
        Base: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
  };
  const raw = {
    allOf: [
      { $ref: '#/components/schemas/Base' },
      { type: 'object', required: ['extra'], properties: { extra: { type: 'number' } } },
    ],
  };
  const result = resolvePropertySchema(raw, spec);
  assert.strictEqual(result.type, 'object');
  assert.deepStrictEqual(result.required.sort(), ['extra', 'id']);
  assert.ok(result.properties.id);
  assert.ok(result.properties.extra);
});

test('resolvePropertySchema: inline schema returned as-is', () => {
  const schema = { type: 'string' };
  assert.deepStrictEqual(resolvePropertySchema(schema, {}), schema);
});

test('resolvePropertySchema: null/undefined input', () => {
  assert.strictEqual(resolvePropertySchema(null, {}), null);
  assert.strictEqual(resolvePropertySchema(undefined, {}), null);
});

test('resolvePropertySchema: allOf with unresolvable $ref', () => {
  const raw = { allOf: [{ $ref: '#/components/schemas/Missing' }] };
  const result = resolvePropertySchema(raw, {});
  assert.strictEqual(result, null);
});

// ---------------------------------------------------------------------------
// mergeSchemas
// ---------------------------------------------------------------------------

test('mergeSchemas: merges properties and required arrays', () => {
  const base = {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string' } },
  };
  const overlay = {
    required: ['name'],
    properties: { name: { type: 'string' } },
  };
  const merged = mergeSchemas(base, overlay);
  assert.deepStrictEqual(merged.required.sort(), ['id', 'name']);
  assert.ok(merged.properties.id);
  assert.ok(merged.properties.name);
});

test('mergeSchemas: deduplicates required entries', () => {
  const base = { required: ['id', 'name'] };
  const overlay = { required: ['id', 'extra'] };
  const merged = mergeSchemas(base, overlay);
  assert.deepStrictEqual(merged.required.sort(), ['extra', 'id', 'name']);
});

test('mergeSchemas: handles missing properties/required gracefully', () => {
  const merged = mergeSchemas({}, { type: 'object' });
  assert.strictEqual(merged.type, 'object');
  assert.strictEqual(merged.properties, undefined);
  assert.strictEqual(merged.required, undefined);
});

// ---------------------------------------------------------------------------
// collectRequiredPaths — allOf nested DTO (NestJS Swagger pattern)
// ---------------------------------------------------------------------------

test('collectRequiredPaths: allOf nested DTO resolves nested required paths', () => {
  const spec = {
    components: {
      schemas: {
        AuthorDto: {
          type: 'object',
          required: ['id', 'name'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
        },
      },
    },
  };
  const schema = {
    type: 'object',
    required: ['title', 'author'],
    properties: {
      title: { type: 'string' },
      author: { allOf: [{ $ref: '#/components/schemas/AuthorDto' }] },
      description: { type: 'string', nullable: true },
    },
  };
  const paths = collectRequiredPaths(schema, '', spec);
  assert.deepStrictEqual(paths, ['author', 'author.id', 'author.name', 'title']);
});

// ---------------------------------------------------------------------------
// extractResponseContract — allOf nested DTO end-to-end
// ---------------------------------------------------------------------------

test('extractResponseContract: allOf nested DTO produces nested requiredPaths', () => {
  const spec = {
    components: {
      schemas: {
        ProbeAuthorDto: {
          type: 'object',
          required: ['id', 'name'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
        },
        ProbeItemResponseDto: {
          type: 'object',
          required: ['id', 'title', 'author'],
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            author: { allOf: [{ $ref: '#/components/schemas/ProbeAuthorDto' }] },
            description: { type: 'string', nullable: true },
          },
        },
      },
    },
  };
  const operation = {
    responses: {
      '200': {
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ProbeItemResponseDto' },
          },
        },
      },
    },
  };
  const contract = extractResponseContract(spec, operation);
  assert.ok(contract);
  assert.strictEqual(contract.status, 200);
  assert.strictEqual(contract.schemaRef, 'ProbeItemResponseDto');
  assert.deepStrictEqual(contract.requiredPaths, ['author', 'author.id', 'author.name', 'id', 'title']);
  assert.ok(!contract.requiredPaths.includes('description'), 'nullable field excluded');
});

test('extractResponseContract: picks lowest 2xx status', () => {
  const operation = {
    responses: {
      '204': { description: 'No content' },
      '200': {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['ok'],
              properties: { ok: { type: 'boolean' } },
            },
          },
        },
      },
    },
  };
  const contract = extractResponseContract({}, operation);
  assert.ok(contract);
  assert.strictEqual(contract.status, 200);
});
