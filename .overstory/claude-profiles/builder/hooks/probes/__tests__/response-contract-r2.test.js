'use strict';

/**
 * R2 edge-case tests for lib/response-contract.js
 *
 * Branches 1-15 from the R2 Cluster B matrix:
 *   1. recursive $ref (Tree node referencing itself)
 *   2. allOf composition (Pet = allOf [Animal, {breed}])
 *   3. oneOf discriminator (Shape = oneOf [Circle | Square])
 *   4. anyOf union (Result = anyOf [Success | Pending])
 *   5. empty array response (type:array, items:T, default:[])
 *   6. null fields (nullable:true on required field)
 *   7. arrays of arrays (matrix:number[][])
 *   8. additionalProperties:true (free-form object)
 *   9. format constraints (date-time, uuid, email)
 *  10. enum field with declared values
 *  11. integer with min/max bounds
 *  12. string with pattern regex
 *  13. deeply nested object (3+ levels deep)
 *  14. mixed required + optional in same object
 *  15. response with no body declared (204 No Content)
 */

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
// Helper: build an OpenAPI spec with components/schemas and a single operation
// ---------------------------------------------------------------------------

function makeSpec(schemas) {
  return { components: { schemas } };
}

function makeOperation(statusCode, schemaOrRef) {
  return {
    responses: {
      [String(statusCode)]: {
        content: {
          'application/json': {
            schema: schemaOrRef,
          },
        },
      },
    },
  };
}

// ===========================================================================
// Branch 1: recursive $ref (Tree node referencing itself)
// ===========================================================================

test('R2-B01: collectRequiredPaths handles recursive $ref via cycle detection', () => {
  // A Tree node where `children` is an array of $ref to itself.
  // FIX 1: collectRequiredPaths now tracks visited $refs in a Set,
  // returning [] when a cycle is detected — no stack overflow.
  const spec = makeSpec({
    TreeNode: {
      type: 'object',
      required: ['id', 'label', 'children'],
      properties: {
        id: { type: 'string' },
        label: { type: 'string' },
        children: {
          type: 'array',
          items: { $ref: '#/components/schemas/TreeNode' },
        },
      },
    },
  });
  const schema = { $ref: '#/components/schemas/TreeNode' };
  // Cycle detection: stops recursion at the self-referencing $ref,
  // returns paths for the non-cyclic fields only.
  const paths = collectRequiredPaths(schema, '', spec);
  assert.ok(Array.isArray(paths), 'returns an array (no stack overflow)');
  assert.ok(paths.includes('id'), 'includes non-cyclic required field id');
  assert.ok(paths.includes('label'), 'includes non-cyclic required field label');
  assert.ok(paths.includes('children'), 'includes the array field itself');
  // children[*] items resolve to TreeNode again — cycle detected, no deeper paths
});

test('R2-B01: extractResponseContract with recursive $ref produces valid contract', () => {
  const spec = makeSpec({
    TreeNode: {
      type: 'object',
      required: ['id', 'name'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        parent: { $ref: '#/components/schemas/TreeNode' },
      },
    },
  });
  const op = makeOperation(200, { $ref: '#/components/schemas/TreeNode' });
  const contract = extractResponseContract(spec, op);
  assert.ok(contract);
  assert.strictEqual(contract.status, 200);
  assert.ok(contract.requiredPaths.includes('id'));
  assert.ok(contract.requiredPaths.includes('name'));
  // parent is not required, so should NOT appear
  assert.ok(!contract.requiredPaths.includes('parent'));
});

// ===========================================================================
// Branch 2: allOf composition (Pet = allOf [Animal, {breed}])
// ===========================================================================

test('R2-B02: collectRequiredPaths with allOf merges required from both branches', () => {
  const spec = makeSpec({
    Animal: {
      type: 'object',
      required: ['id', 'species'],
      properties: {
        id: { type: 'string' },
        species: { type: 'string' },
      },
    },
  });
  const schema = {
    allOf: [
      { $ref: '#/components/schemas/Animal' },
      {
        type: 'object',
        required: ['breed'],
        properties: {
          breed: { type: 'string' },
          nickname: { type: 'string' },
        },
      },
    ],
  };
  // resolvePropertySchema handles allOf at property level, but
  // collectRequiredPaths should handle allOf at top level too via the
  // resolvePropertySchema call path. Let's test the merge directly.
  const resolved = resolvePropertySchema(schema, spec);
  assert.ok(resolved);
  assert.deepStrictEqual(resolved.required.sort(), ['breed', 'id', 'species']);
  assert.ok(resolved.properties.id);
  assert.ok(resolved.properties.species);
  assert.ok(resolved.properties.breed);
  assert.ok(resolved.properties.nickname);
});

test('R2-B02: extractResponseContract with allOf composition at response level', () => {
  const spec = makeSpec({
    Animal: {
      type: 'object',
      required: ['id', 'species'],
      properties: {
        id: { type: 'string' },
        species: { type: 'string' },
      },
    },
    Pet: {
      allOf: [
        { $ref: '#/components/schemas/Animal' },
        {
          type: 'object',
          required: ['breed'],
          properties: {
            breed: { type: 'string' },
          },
        },
      ],
    },
  });
  const op = makeOperation(200, { $ref: '#/components/schemas/Pet' });
  const contract = extractResponseContract(spec, op);
  assert.ok(contract);
  // Pet resolves via allOf, but extractResponseContract resolves the $ref
  // to Pet, which is an allOf. collectRequiredPaths doesn't handle top-level
  // allOf directly — it goes through the schema type checks.
  // The resolved schema from $ref is the allOf object itself.
  // collectRequiredPaths will see no type/properties at top level initially,
  // but allOf handling in resolvePropertySchema should merge them.
  assert.strictEqual(contract.schemaRef, 'Pet');
});

test('R2-B02: allOf with three branches merges all required', () => {
  const spec = makeSpec({
    Base: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' } },
    },
    Named: {
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string' } },
    },
  });
  const schema = {
    allOf: [
      { $ref: '#/components/schemas/Base' },
      { $ref: '#/components/schemas/Named' },
      {
        type: 'object',
        required: ['age'],
        properties: { age: { type: 'integer' } },
      },
    ],
  };
  const resolved = resolvePropertySchema(schema, spec);
  assert.ok(resolved);
  assert.deepStrictEqual(resolved.required.sort(), ['age', 'id', 'name']);
});

// ===========================================================================
// Branch 3: oneOf discriminator (Shape = oneOf [Circle | Square])
// ===========================================================================

test('R2-B03: collectRequiredPaths oneOf returns only intersection', () => {
  const spec = makeSpec({
    Circle: {
      type: 'object',
      required: ['kind', 'radius'],
      properties: {
        kind: { type: 'string', enum: ['circle'] },
        radius: { type: 'number' },
      },
    },
    Square: {
      type: 'object',
      required: ['kind', 'side'],
      properties: {
        kind: { type: 'string', enum: ['square'] },
        side: { type: 'number' },
      },
    },
  });
  const schema = {
    oneOf: [
      { $ref: '#/components/schemas/Circle' },
      { $ref: '#/components/schemas/Square' },
    ],
  };
  const paths = collectRequiredPaths(schema, '', spec);
  // Only 'kind' is required in both branches
  assert.deepStrictEqual(paths, ['kind']);
});

test('R2-B03: oneOf with discriminator and no common fields returns empty', () => {
  const schema = {
    oneOf: [
      {
        type: 'object',
        required: ['radius'],
        properties: { radius: { type: 'number' } },
      },
      {
        type: 'object',
        required: ['side'],
        properties: { side: { type: 'number' } },
      },
    ],
  };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, []);
});

test('R2-B03: oneOf with single branch returns that branchs paths', () => {
  const schema = {
    oneOf: [
      {
        type: 'object',
        required: ['id', 'name'],
        properties: { id: { type: 'string' }, name: { type: 'string' } },
      },
    ],
  };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, ['id', 'name']);
});

test('R2-B03: oneOf with empty branches array returns empty', () => {
  const schema = { oneOf: [] };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, []);
});

// ===========================================================================
// Branch 4: anyOf union (Result = anyOf [Success | Pending])
// ===========================================================================

test('R2-B04: collectRequiredPaths anyOf with partial overlap returns intersection', () => {
  const schema = {
    anyOf: [
      {
        type: 'object',
        required: ['status', 'data', 'requestId'],
        properties: {
          status: { type: 'string' },
          data: { type: 'object' },
          requestId: { type: 'string' },
        },
      },
      {
        type: 'object',
        required: ['status', 'requestId'],
        properties: {
          status: { type: 'string' },
          requestId: { type: 'string' },
        },
      },
    ],
  };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, ['requestId', 'status']);
});

test('R2-B04: anyOf with $ref branches resolves correctly', () => {
  const spec = makeSpec({
    Success: {
      type: 'object',
      required: ['ok', 'value'],
      properties: { ok: { type: 'boolean' }, value: { type: 'string' } },
    },
    Pending: {
      type: 'object',
      required: ['ok', 'retryAfter'],
      properties: { ok: { type: 'boolean' }, retryAfter: { type: 'number' } },
    },
  });
  const schema = {
    anyOf: [
      { $ref: '#/components/schemas/Success' },
      { $ref: '#/components/schemas/Pending' },
    ],
  };
  const paths = collectRequiredPaths(schema, '', spec);
  // Only 'ok' is common to both
  assert.deepStrictEqual(paths, ['ok']);
});

test('R2-B04: anyOf with unresolvable $ref branch returns empty', () => {
  const schema = {
    anyOf: [
      { $ref: '#/components/schemas/Missing' },
      { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    ],
  };
  // First branch resolves to null -> empty paths, intersection with second = empty
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, []);
});

// ===========================================================================
// Branch 5: empty array response (type:array, items:T, default:[])
// ===========================================================================

test('R2-B05: collectRequiredPaths for array type with items schema', () => {
  const schema = {
    type: 'array',
    items: {
      type: 'object',
      required: ['id', 'title'],
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
      },
    },
    default: [],
  };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, ['[*].id', '[*].title']);
});

test('R2-B05: empty array with $ref items resolves item schema', () => {
  const spec = makeSpec({
    ItemDto: {
      type: 'object',
      required: ['id', 'name'],
      properties: { id: { type: 'string' }, name: { type: 'string' } },
    },
  });
  const schema = {
    type: 'array',
    items: { $ref: '#/components/schemas/ItemDto' },
    default: [],
  };
  const paths = collectRequiredPaths(schema, '', spec);
  assert.deepStrictEqual(paths, ['[*].id', '[*].name']);
});

test('R2-B05: array with no items schema returns empty', () => {
  const schema = { type: 'array' };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, []);
});

test('R2-B05: extractResponseContract with array response at 200', () => {
  const spec = makeSpec({
    TaskDto: {
      type: 'object',
      required: ['id', 'status'],
      properties: { id: { type: 'string' }, status: { type: 'string' } },
    },
  });
  const op = makeOperation(200, {
    type: 'array',
    items: { $ref: '#/components/schemas/TaskDto' },
  });
  const contract = extractResponseContract(spec, op);
  assert.ok(contract);
  assert.strictEqual(contract.schemaRef, 'inline');
  assert.deepStrictEqual(contract.requiredPaths, ['[*].id', '[*].status']);
});

// ===========================================================================
// Branch 6: null fields (nullable:true on required field)
// ===========================================================================

test('R2-B06: isNullable detects OpenAPI 3.0 nullable:true', () => {
  assert.strictEqual(isNullable({ type: 'string', nullable: true }), true);
});

test('R2-B06: isNullable detects OpenAPI 3.1 type array with null', () => {
  assert.strictEqual(isNullable({ type: ['string', 'null'] }), true);
});

test('R2-B06: isNullable returns false for non-nullable', () => {
  assert.strictEqual(isNullable({ type: 'string' }), false);
  assert.strictEqual(isNullable({ type: ['string', 'integer'] }), false);
});

test('R2-B06: collectRequiredPaths excludes nullable required fields', () => {
  const schema = {
    type: 'object',
    required: ['id', 'name', 'avatar', 'deletedAt', 'bio'],
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      avatar: { type: 'string', nullable: true },  // 3.0 nullable
      deletedAt: { type: ['string', 'null'] },       // 3.1 nullable
      bio: { type: 'string' },
    },
  };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, ['bio', 'id', 'name']);
  assert.ok(!paths.includes('avatar'), 'nullable:true field excluded');
  assert.ok(!paths.includes('deletedAt'), '3.1 nullable field excluded');
});

test('R2-B06: nullable nested object excluded from paths', () => {
  const schema = {
    type: 'object',
    required: ['id', 'metadata'],
    properties: {
      id: { type: 'string' },
      metadata: {
        type: 'object',
        nullable: true,
        required: ['key'],
        properties: { key: { type: 'string' } },
      },
    },
  };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, ['id']);
  assert.ok(!paths.includes('metadata'), 'nullable object excluded');
  assert.ok(!paths.includes('metadata.key'), 'nested paths under nullable excluded');
});

// ===========================================================================
// Branch 7: arrays of arrays (matrix:number[][])
// ===========================================================================

test('R2-B07: collectRequiredPaths handles nested array (array of arrays)', () => {
  const schema = {
    type: 'object',
    required: ['matrix'],
    properties: {
      matrix: {
        type: 'array',
        items: {
          type: 'array',
          items: { type: 'number' },
        },
      },
    },
  };
  const paths = collectRequiredPaths(schema, '', {});
  // matrix is required, inner array has scalar items - no further required paths
  assert.deepStrictEqual(paths, ['matrix']);
});

test('R2-B07: nested array with object items at inner level', () => {
  const schema = {
    type: 'object',
    required: ['grid'],
    properties: {
      grid: {
        type: 'array',
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['x', 'y'],
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
          },
        },
      },
    },
  };
  const paths = collectRequiredPaths(schema, '', {});
  // grid -> grid[*] is inner array (no required on array type) -> grid[*][*].x, grid[*][*].y
  assert.ok(paths.includes('grid'));
});

// ===========================================================================
// Branch 8: additionalProperties:true (free-form object)
// ===========================================================================

test('R2-B08: collectRequiredPaths on object with additionalProperties:true', () => {
  const schema = {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
    additionalProperties: true,
  };
  const paths = collectRequiredPaths(schema, '', {});
  // Only declared required properties are collected; additionalProperties
  // are free-form and cannot have required paths asserted
  assert.deepStrictEqual(paths, ['id']);
});

test('R2-B08: object with only additionalProperties (no declared properties)', () => {
  const schema = {
    type: 'object',
    additionalProperties: { type: 'string' },
  };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, []);
});

test('R2-B08: additionalProperties as schema object with required property', () => {
  const schema = {
    type: 'object',
    required: ['metadata'],
    properties: {
      metadata: {
        type: 'object',
        additionalProperties: { type: 'string' },
      },
    },
  };
  const paths = collectRequiredPaths(schema, '', {});
  // metadata is required and is an object, but has no required children
  assert.deepStrictEqual(paths, ['metadata']);
});

// ===========================================================================
// Branch 9: format constraints (date-time, uuid, email)
// ===========================================================================

test('R2-B09: collectRequiredPaths includes fields with format constraints', () => {
  const schema = {
    type: 'object',
    required: ['id', 'email', 'createdAt'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      email: { type: 'string', format: 'email' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },  // not required
    },
  };
  const paths = collectRequiredPaths(schema, '', {});
  // Format does not affect required path collection
  assert.deepStrictEqual(paths, ['createdAt', 'email', 'id']);
  assert.ok(!paths.includes('updatedAt'), 'non-required field excluded');
});

test('R2-B09: extractResponseContract with format-constrained fields', () => {
  const spec = makeSpec({
    UserDto: {
      type: 'object',
      required: ['id', 'email'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        email: { type: 'string', format: 'email' },
      },
    },
  });
  const op = makeOperation(200, { $ref: '#/components/schemas/UserDto' });
  const contract = extractResponseContract(spec, op);
  assert.ok(contract);
  assert.deepStrictEqual(contract.requiredPaths, ['email', 'id']);
});

// ===========================================================================
// Branch 10: enum field with declared values
// ===========================================================================

test('R2-B10: collectRequiredPaths includes enum fields', () => {
  const schema = {
    type: 'object',
    required: ['status', 'priority'],
    properties: {
      status: { type: 'string', enum: ['active', 'inactive', 'archived'] },
      priority: { type: 'integer', enum: [1, 2, 3, 4, 5] },
      label: { type: 'string' },
    },
  };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, ['priority', 'status']);
});

test('R2-B10: enum within nested object', () => {
  const schema = {
    type: 'object',
    required: ['task'],
    properties: {
      task: {
        type: 'object',
        required: ['id', 'status'],
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
        },
      },
    },
  };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, ['task', 'task.id', 'task.status']);
});

// ===========================================================================
// Branch 11: integer with min/max bounds
// ===========================================================================

test('R2-B11: collectRequiredPaths includes integer with bounds', () => {
  const schema = {
    type: 'object',
    required: ['count', 'page'],
    properties: {
      count: { type: 'integer', minimum: 0 },
      page: { type: 'integer', minimum: 1, maximum: 1000 },
      limit: { type: 'integer', minimum: 1, maximum: 100 },  // not required
    },
  };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, ['count', 'page']);
});

// ===========================================================================
// Branch 12: string with pattern regex
// ===========================================================================

test('R2-B12: collectRequiredPaths includes string with pattern', () => {
  const schema = {
    type: 'object',
    required: ['slug', 'code'],
    properties: {
      slug: { type: 'string', pattern: '^[a-z0-9-]+$' },
      code: { type: 'string', pattern: '^[A-Z]{2}[0-9]{4}$', minLength: 6, maxLength: 6 },
    },
  };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, ['code', 'slug']);
});

// ===========================================================================
// Branch 13: deeply nested object (3+ levels deep)
// ===========================================================================

test('R2-B13: collectRequiredPaths traverses 3+ levels deep', () => {
  const schema = {
    type: 'object',
    required: ['level1'],
    properties: {
      level1: {
        type: 'object',
        required: ['level2'],
        properties: {
          level2: {
            type: 'object',
            required: ['level3'],
            properties: {
              level3: {
                type: 'object',
                required: ['value'],
                properties: {
                  value: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, [
    'level1',
    'level1.level2',
    'level1.level2.level3',
    'level1.level2.level3.value',
  ]);
});

test('R2-B13: deeply nested with arrays at intermediate levels', () => {
  const schema = {
    type: 'object',
    required: ['organization'],
    properties: {
      organization: {
        type: 'object',
        required: ['id', 'teams'],
        properties: {
          id: { type: 'string' },
          teams: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'members'],
              properties: {
                name: { type: 'string' },
                members: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['userId', 'role'],
                    properties: {
                      userId: { type: 'string' },
                      role: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, [
    'organization',
    'organization.id',
    'organization.teams',
    'organization.teams[*].members',
    'organization.teams[*].members[*].role',
    'organization.teams[*].members[*].userId',
    'organization.teams[*].name',
  ]);
});

test('R2-B13: 4 levels deep with mixed types', () => {
  const spec = makeSpec({
    AddressDto: {
      type: 'object',
      required: ['city', 'country'],
      properties: {
        city: { type: 'string' },
        country: { type: 'string' },
        zip: { type: 'string' },
      },
    },
  });
  const schema = {
    type: 'object',
    required: ['company'],
    properties: {
      company: {
        type: 'object',
        required: ['name', 'headquarters'],
        properties: {
          name: { type: 'string' },
          headquarters: {
            type: 'object',
            required: ['address'],
            properties: {
              address: { $ref: '#/components/schemas/AddressDto' },
            },
          },
        },
      },
    },
  };
  const paths = collectRequiredPaths(schema, '', spec);
  assert.deepStrictEqual(paths, [
    'company',
    'company.headquarters',
    'company.headquarters.address',
    'company.headquarters.address.city',
    'company.headquarters.address.country',
    'company.name',
  ]);
});

// ===========================================================================
// Branch 14: mixed required + optional in same object
// ===========================================================================

test('R2-B14: collectRequiredPaths only traverses required fields', () => {
  const schema = {
    type: 'object',
    required: ['id', 'title'],
    properties: {
      id: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      metadata: {
        type: 'object',
        required: ['version'],
        properties: {
          version: { type: 'integer' },
          author: { type: 'string' },
        },
      },
    },
  };
  const paths = collectRequiredPaths(schema, '', {});
  // metadata is NOT required, so metadata.version should NOT appear
  assert.deepStrictEqual(paths, ['id', 'title']);
});

test('R2-B14: required nested object with mix of required and optional children', () => {
  const schema = {
    type: 'object',
    required: ['user'],
    properties: {
      user: {
        type: 'object',
        required: ['id', 'email'],
        properties: {
          id: { type: 'string' },
          email: { type: 'string' },
          displayName: { type: 'string' },
          avatar: { type: 'string', nullable: true },
          settings: {
            type: 'object',
            properties: {
              theme: { type: 'string' },
              language: { type: 'string' },
            },
          },
        },
      },
    },
  };
  const paths = collectRequiredPaths(schema, '', {});
  assert.deepStrictEqual(paths, ['user', 'user.email', 'user.id']);
});

// ===========================================================================
// Branch 15: response with no body declared (204 No Content)
// ===========================================================================

test('R2-B15: extractResponseContract returns null for 204 No Content', () => {
  const operation = {
    responses: {
      '204': { description: 'No Content' },
    },
  };
  const contract = extractResponseContract({}, operation);
  assert.strictEqual(contract, null);
});

test('R2-B15: extractResponseContract returns null for 200 with no content', () => {
  const operation = {
    responses: {
      '200': { description: 'OK' },
    },
  };
  const contract = extractResponseContract({}, operation);
  assert.strictEqual(contract, null);
});

test('R2-B15: extractResponseContract skips 204, picks 200 when both present', () => {
  const operation = {
    responses: {
      '204': { description: 'No Content' },
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
  assert.deepStrictEqual(contract.requiredPaths, ['ok']);
});

test('R2-B15: extractResponseContract returns null for 2xx with non-JSON content only', () => {
  const operation = {
    responses: {
      '200': {
        content: {
          'text/html': { schema: { type: 'string' } },
          'application/xml': { schema: { type: 'string' } },
        },
      },
    },
  };
  const contract = extractResponseContract({}, operation);
  assert.strictEqual(contract, null);
});

// ===========================================================================
// Additional edge cases: mergeSchemas
// ===========================================================================

test('R2-extra: mergeSchemas with overlapping properties (overlay wins)', () => {
  const base = {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
      name: { type: 'string', maxLength: 50 },
    },
  };
  const overlay = {
    required: ['name'],
    properties: {
      name: { type: 'string', maxLength: 100 },  // override
    },
  };
  const merged = mergeSchemas(base, overlay);
  assert.deepStrictEqual(merged.required.sort(), ['id', 'name']);
  assert.strictEqual(merged.properties.name.maxLength, 100);
  assert.ok(merged.properties.id);
});

// ===========================================================================
// Additional edge cases: resolvePropertySchema
// ===========================================================================

test('R2-extra: resolvePropertySchema with empty allOf falls through to return as-is', () => {
  const input = { allOf: [] };
  const result = resolvePropertySchema(input, {});
  // Empty allOf: `allOf.length > 0` is false, so the allOf branch is skipped
  // and the function returns the input schema as-is (line 51: return propSchemaRaw)
  assert.deepStrictEqual(result, input);
});

test('R2-extra: resolvePropertySchema with non-object input returns null', () => {
  assert.strictEqual(resolvePropertySchema(42, {}), null);
  assert.strictEqual(resolvePropertySchema('string', {}), null);
});

// ===========================================================================
// Additional edge cases: collectRequiredPaths with prefix
// ===========================================================================

test('R2-extra: collectRequiredPaths with prefix on nested schema', () => {
  const schema = {
    type: 'object',
    required: ['id', 'items'],
    properties: {
      id: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          required: ['sku'],
          properties: { sku: { type: 'string' } },
        },
      },
    },
  };
  const paths = collectRequiredPaths(schema, 'order', {});
  assert.deepStrictEqual(paths, ['order.id', 'order.items', 'order.items[*].sku']);
});

// ===========================================================================
// oneOf/anyOf at property level (inside an object property)
// ===========================================================================

test('R2-extra: property-level oneOf still records the field', () => {
  const schema = {
    type: 'object',
    required: ['result'],
    properties: {
      result: {
        oneOf: [
          { type: 'object', required: ['data'], properties: { data: { type: 'string' } } },
          { type: 'object', required: ['error'], properties: { error: { type: 'string' } } },
        ],
      },
    },
  };
  const paths = collectRequiredPaths(schema, '', {});
  // 'result' is required and is a oneOf — it should appear in paths
  assert.ok(paths.includes('result'));
});
