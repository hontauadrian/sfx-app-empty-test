'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  identifyErrorFamily,
  extractErrorShape,
  buildErrorAssertions,
  resolveRef,
  buildShapeDescriptor,
} = require('../lib/error-shape');

// ---------------------------------------------------------------------------
// resolveRef
// ---------------------------------------------------------------------------

test('resolveRef resolves a $ref path', () => {
  const spec = {
    components: { schemas: { Err: { type: 'object', properties: { msg: { type: 'string' } } } } },
  };
  const result = resolveRef(spec, { $ref: '#/components/schemas/Err' });
  assert.deepStrictEqual(result, spec.components.schemas.Err);
});

test('resolveRef returns schema as-is when no $ref', () => {
  const schema = { type: 'object' };
  assert.strictEqual(resolveRef({}, schema), schema);
});

test('resolveRef returns null for null/undefined input', () => {
  assert.strictEqual(resolveRef({}, null), null);
  assert.strictEqual(resolveRef({}, undefined), null);
});

test('resolveRef returns null for unresolvable $ref', () => {
  assert.strictEqual(resolveRef({}, { $ref: '#/components/schemas/Missing' }), null);
});

// ---------------------------------------------------------------------------
// identifyErrorFamily — nest-default
// ---------------------------------------------------------------------------

test('identifyErrorFamily returns nest-default for { statusCode, message }', () => {
  const schema = {
    type: 'object',
    properties: {
      statusCode: { type: 'number' },
      message: { type: 'string' },
      error: { type: 'string' },
    },
  };
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', {}), 'nest-default');
});

// ---------------------------------------------------------------------------
// identifyErrorFamily — nest-wrapped
// ---------------------------------------------------------------------------

test('identifyErrorFamily returns nest-wrapped for { success, error: {...} }', () => {
  const schema = {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: {
        type: 'object',
        properties: {
          statusCode: { type: 'number' },
          message: { type: 'string' },
        },
      },
    },
  };
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', {}), 'nest-wrapped');
});

// ---------------------------------------------------------------------------
// identifyErrorFamily — problem-json (by content type)
// ---------------------------------------------------------------------------

test('identifyErrorFamily returns problem-json for application/problem+json content type', () => {
  const schema = { type: 'object', properties: { detail: { type: 'string' } } };
  assert.strictEqual(identifyErrorFamily(schema, 'application/problem+json', {}), 'problem-json');
});

// ---------------------------------------------------------------------------
// identifyErrorFamily — problem-json (by schema shape)
// ---------------------------------------------------------------------------

test('identifyErrorFamily returns problem-json for schema with type+title+status', () => {
  const schema = {
    type: 'object',
    properties: {
      type: { type: 'string' },
      title: { type: 'string' },
      status: { type: 'integer' },
      detail: { type: 'string' },
      instance: { type: 'string' },
    },
  };
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', {}), 'problem-json');
});

// ---------------------------------------------------------------------------
// identifyErrorFamily — errors-array
// ---------------------------------------------------------------------------

test('identifyErrorFamily returns errors-array for schema with errors[] array', () => {
  const schema = {
    type: 'object',
    properties: {
      errors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
  };
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', {}), 'errors-array');
});

// ---------------------------------------------------------------------------
// identifyErrorFamily — raw
// ---------------------------------------------------------------------------

test('identifyErrorFamily returns raw for unrecognized schema', () => {
  const schema = { type: 'object', properties: { custom: { type: 'string' } } };
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', {}), 'raw');
});

test('identifyErrorFamily returns raw for null schema', () => {
  assert.strictEqual(identifyErrorFamily(null, 'application/json', {}), 'raw');
});

test('identifyErrorFamily returns raw for non-object schema', () => {
  assert.strictEqual(identifyErrorFamily('string', 'application/json', {}), 'raw');
});

// ---------------------------------------------------------------------------
// identifyErrorFamily — $ref resolution
// ---------------------------------------------------------------------------

test('identifyErrorFamily resolves $ref before identifying', () => {
  const spec = {
    components: {
      schemas: {
        NestError: {
          type: 'object',
          properties: {
            statusCode: { type: 'number' },
            message: { type: 'string' },
          },
        },
      },
    },
  };
  const schema = { $ref: '#/components/schemas/NestError' };
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', spec), 'nest-default');
});

// ---------------------------------------------------------------------------
// extractErrorShape — nest-default
// ---------------------------------------------------------------------------

test('extractErrorShape returns nest-default shape for 400 response', () => {
  const spec = {
    paths: {},
    components: {
      schemas: {
        BadRequest: {
          type: 'object',
          properties: {
            statusCode: { type: 'number' },
            message: { type: 'string' },
            error: { type: 'string' },
          },
        },
      },
    },
  };
  const operation = {
    responses: {
      '400': {
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/BadRequest' },
          },
        },
      },
    },
  };

  const result = extractErrorShape(spec, {}, operation);
  assert.strictEqual(result.family, 'nest-default');
  assert.strictEqual(result.schemaRef, 'BadRequest');
  assert.strictEqual(result.fieldPath, 'message');
  assert.strictEqual(result.messagePath, 'message');
  assert.strictEqual(result.statusPath, 'statusCode');
  assert.strictEqual(result.contentType, 'application/json');
});

// ---------------------------------------------------------------------------
// extractErrorShape — nest-wrapped
// ---------------------------------------------------------------------------

test('extractErrorShape returns nest-wrapped shape for wrapped error', () => {
  const spec = { paths: {} };
  const operation = {
    responses: {
      '422': {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                error: {
                  type: 'object',
                  properties: {
                    statusCode: { type: 'number' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  const result = extractErrorShape(spec, {}, operation);
  assert.strictEqual(result.family, 'nest-wrapped');
  assert.strictEqual(result.fieldPath, 'error.message');
  assert.strictEqual(result.statusPath, 'error.statusCode');
});

// ---------------------------------------------------------------------------
// extractErrorShape — problem-json
// ---------------------------------------------------------------------------

test('extractErrorShape returns problem-json for application/problem+json', () => {
  const spec = { paths: {} };
  const operation = {
    responses: {
      '400': {
        content: {
          'application/problem+json': {
            schema: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                title: { type: 'string' },
                status: { type: 'integer' },
                detail: { type: 'string' },
                instance: { type: 'string' },
              },
            },
          },
        },
      },
    },
  };

  const result = extractErrorShape(spec, {}, operation);
  assert.strictEqual(result.family, 'problem-json');
  assert.strictEqual(result.statusPath, 'status');
  assert.strictEqual(result.contentType, 'application/problem+json');
});

test('extractErrorShape returns problem-json with errors[] subfield', () => {
  const spec = { paths: {} };
  const operation = {
    responses: {
      '400': {
        content: {
          'application/problem+json': {
            schema: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                title: { type: 'string' },
                status: { type: 'integer' },
                detail: { type: 'string' },
                errors: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      field: { type: 'string' },
                      code: { type: 'string' },
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

  const result = extractErrorShape(spec, {}, operation);
  assert.strictEqual(result.family, 'problem-json');
  assert.strictEqual(result.fieldPath, 'errors[*].field');
  assert.strictEqual(result.statusPath, 'status');
});

// ---------------------------------------------------------------------------
// extractErrorShape — errors-array
// ---------------------------------------------------------------------------

test('extractErrorShape returns errors-array shape', () => {
  const spec = { paths: {} };
  const operation = {
    responses: {
      '400': {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                errors: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      field: { type: 'string' },
                      code: { type: 'string' },
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

  const result = extractErrorShape(spec, {}, operation);
  assert.strictEqual(result.family, 'errors-array');
  assert.strictEqual(result.fieldPath, 'errors[*].field');
  assert.strictEqual(result.statusPath, null);
});

// ---------------------------------------------------------------------------
// extractErrorShape — raw (no schema)
// ---------------------------------------------------------------------------

test('extractErrorShape returns raw for unrecognized schema', () => {
  const spec = { paths: {} };
  const operation = {
    responses: {
      '500': {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                custom: { type: 'string' },
              },
            },
          },
        },
      },
    },
  };

  const result = extractErrorShape(spec, {}, operation);
  assert.strictEqual(result.family, 'raw');
  assert.strictEqual(result.fieldPath, null);
  assert.strictEqual(result.messagePath, null);
  assert.strictEqual(result.statusPath, null);
});

// ---------------------------------------------------------------------------
// extractErrorShape — null cases
// ---------------------------------------------------------------------------

test('extractErrorShape returns null when no responses', () => {
  assert.strictEqual(extractErrorShape({}, {}, {}), null);
  assert.strictEqual(extractErrorShape({}, {}, null), null);
  assert.strictEqual(extractErrorShape({}, {}, { responses: {} }), null);
});

test('extractErrorShape returns null when only 2xx responses', () => {
  const operation = {
    responses: {
      '200': {
        content: { 'application/json': { schema: { type: 'object' } } },
      },
    },
  };
  assert.strictEqual(extractErrorShape({}, {}, operation), null);
});

test('extractErrorShape returns null when 4xx has no content', () => {
  const operation = {
    responses: {
      '400': { description: 'Bad Request' },
    },
  };
  assert.strictEqual(extractErrorShape({}, {}, operation), null);
});

// ---------------------------------------------------------------------------
// extractErrorShape — prefers problem+json over application/json
// ---------------------------------------------------------------------------

test('extractErrorShape prefers problem+json content type when both present', () => {
  const spec = { paths: {} };
  const operation = {
    responses: {
      '400': {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                statusCode: { type: 'number' },
                message: { type: 'string' },
              },
            },
          },
          'application/problem+json': {
            schema: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                title: { type: 'string' },
                status: { type: 'integer' },
                detail: { type: 'string' },
              },
            },
          },
        },
      },
    },
  };

  const result = extractErrorShape(spec, {}, operation);
  assert.strictEqual(result.family, 'problem-json');
  assert.strictEqual(result.contentType, 'application/problem+json');
});

// ---------------------------------------------------------------------------
// buildErrorAssertions — nest-default
// ---------------------------------------------------------------------------

test('buildErrorAssertions nest-default produces expect-error-shape step', () => {
  const errorShape = {
    family: 'nest-default',
    schemaRef: 'BadRequest',
    fieldPath: 'message',
    messagePath: 'message',
    statusPath: 'statusCode',
    contentType: 'application/json',
  };

  const assertions = buildErrorAssertions({ errorShape, fieldName: 'email', envelope: null });
  assert.strictEqual(assertions.length, 1);
  assert.strictEqual(assertions[0].kind, 'expect-error-shape');
  assert.strictEqual(assertions[0].family, 'nest-default');
  assert.strictEqual(assertions[0].fieldName, 'email');
  assert.strictEqual(assertions[0].messageContains, 'email');
  assert.strictEqual(assertions[0].statusCodeField, 'statusCode');
});

// ---------------------------------------------------------------------------
// buildErrorAssertions — nest-wrapped
// ---------------------------------------------------------------------------

test('buildErrorAssertions nest-wrapped without envelope produces bare statusCode', () => {
  // When envelope is null, nest-wrapped produces bare 'statusCode' because the
  // 'error.' prefix is externalized to the envelope parameter (supplied by the
  // error-envelope detector in the live flow). See commit d6e2592.
  const errorShape = {
    family: 'nest-wrapped',
    fieldPath: 'error.message',
    messagePath: 'error.message',
    statusPath: 'error.statusCode',
    contentType: 'application/json',
  };

  const assertions = buildErrorAssertions({ errorShape, fieldName: 'password', envelope: null });
  assert.strictEqual(assertions.length, 1);
  assert.strictEqual(assertions[0].family, 'nest-wrapped');
  assert.strictEqual(assertions[0].statusCodeField, 'statusCode');
  assert.strictEqual(assertions[0].messageContains, 'password');
});

test('buildErrorAssertions nest-wrapped with envelope produces error.statusCode', () => {
  // In the live flow, the error-envelope detector supplies envelope: ['error']
  // which is prepended to 'statusCode' to produce the full 'error.statusCode'
  // path matching the actual response shape { success:false, error: { statusCode, message } }.
  const errorShape = {
    family: 'nest-wrapped',
    fieldPath: 'error.message',
    messagePath: 'error.message',
    statusPath: 'error.statusCode',
    contentType: 'application/json',
  };

  const assertions = buildErrorAssertions({ errorShape, fieldName: 'password', envelope: ['error'] });
  assert.strictEqual(assertions.length, 1);
  assert.strictEqual(assertions[0].family, 'nest-wrapped');
  assert.strictEqual(assertions[0].statusCodeField, 'error.statusCode');
  assert.strictEqual(assertions[0].messageContains, 'password');
  assert.deepStrictEqual(assertions[0].envelope, ['error']);
});

// ---------------------------------------------------------------------------
// buildErrorAssertions — problem-json (with errors[])
// ---------------------------------------------------------------------------

test('buildErrorAssertions problem-json with errors[] has fieldName no messageContains', () => {
  const errorShape = {
    family: 'problem-json',
    fieldPath: 'errors[*].field',
    messagePath: 'detail',
    statusPath: 'status',
    contentType: 'application/problem+json',
  };

  const assertions = buildErrorAssertions({ errorShape, fieldName: 'email', envelope: null });
  assert.strictEqual(assertions.length, 1);
  assert.strictEqual(assertions[0].family, 'problem-json');
  assert.strictEqual(assertions[0].fieldName, 'email');
  assert.strictEqual(assertions[0].statusCodeField, 'status');
  // Should NOT have messageContains when fieldPath is errors[*].field
  assert.strictEqual(assertions[0].messageContains, undefined);
});

// ---------------------------------------------------------------------------
// buildErrorAssertions — problem-json (without errors[])
// ---------------------------------------------------------------------------

test('buildErrorAssertions problem-json without errors[] uses messageContains', () => {
  const errorShape = {
    family: 'problem-json',
    fieldPath: 'detail',
    messagePath: 'detail',
    statusPath: 'status',
    contentType: 'application/problem+json',
  };

  const assertions = buildErrorAssertions({ errorShape, fieldName: 'name', envelope: null });
  assert.strictEqual(assertions[0].messageContains, 'name');
});

// ---------------------------------------------------------------------------
// buildErrorAssertions — errors-array
// ---------------------------------------------------------------------------

test('buildErrorAssertions errors-array produces correct step', () => {
  const errorShape = {
    family: 'errors-array',
    fieldPath: 'errors[*].field',
    messagePath: 'errors[*].message',
    statusPath: null,
    contentType: 'application/json',
  };

  const assertions = buildErrorAssertions({ errorShape, fieldName: 'email', envelope: null });
  assert.strictEqual(assertions.length, 1);
  assert.strictEqual(assertions[0].family, 'errors-array');
  assert.strictEqual(assertions[0].fieldName, 'email');
  assert.strictEqual(assertions[0].statusCodeField, undefined);
});

// ---------------------------------------------------------------------------
// buildErrorAssertions — raw fallback
// ---------------------------------------------------------------------------

test('buildErrorAssertions raw falls back to errorFieldMentions', () => {
  const errorShape = {
    family: 'raw',
    fieldPath: null,
    messagePath: null,
    statusPath: null,
    contentType: 'application/json',
  };

  const assertions = buildErrorAssertions({ errorShape, fieldName: 'email', envelope: null });
  assert.strictEqual(assertions.length, 1);
  assert.strictEqual(assertions[0].errorFieldMentions, 'email');
  assert.strictEqual(assertions[0].kind, undefined);
});

// ---------------------------------------------------------------------------
// buildErrorAssertions — null errorShape fallback
// ---------------------------------------------------------------------------

test('buildErrorAssertions with null errorShape falls back to heuristic', () => {
  const assertions = buildErrorAssertions({ errorShape: null, fieldName: 'email', envelope: null });
  assert.strictEqual(assertions.length, 1);
  assert.strictEqual(assertions[0].errorFieldMentions, 'email');
});

// ---------------------------------------------------------------------------
// buildErrorAssertions — envelope prepending
// ---------------------------------------------------------------------------

test('buildErrorAssertions prepends envelope to statusCodeField', () => {
  const errorShape = {
    family: 'nest-default',
    fieldPath: 'message',
    messagePath: 'message',
    statusPath: 'statusCode',
    contentType: 'application/json',
  };

  const assertions = buildErrorAssertions({ errorShape, fieldName: 'email', envelope: ['data'] });
  assert.strictEqual(assertions[0].statusCodeField, 'data.statusCode');
});

test('buildErrorAssertions propagates envelope array to generated step', () => {
  const errorShape = {
    family: 'nest-default',
    fieldPath: 'message',
    messagePath: 'message',
    statusPath: 'statusCode',
    contentType: 'application/json',
  };

  const assertions = buildErrorAssertions({ errorShape, fieldName: 'email', envelope: ['error'] });
  assert.deepStrictEqual(assertions[0].envelope, ['error']);
});

test('buildErrorAssertions omits envelope property when envelope is null', () => {
  const errorShape = {
    family: 'nest-default',
    fieldPath: 'message',
    messagePath: 'message',
    statusPath: 'statusCode',
    contentType: 'application/json',
  };

  const assertions = buildErrorAssertions({ errorShape, fieldName: 'email', envelope: null });
  assert.strictEqual(assertions[0].envelope, undefined);
});

test('buildErrorAssertions does not prepend empty envelope', () => {
  const errorShape = {
    family: 'nest-default',
    fieldPath: 'message',
    messagePath: 'message',
    statusPath: 'statusCode',
    contentType: 'application/json',
  };

  const assertions = buildErrorAssertions({ errorShape, fieldName: 'email', envelope: [] });
  assert.strictEqual(assertions[0].statusCodeField, 'statusCode');
});

// ---------------------------------------------------------------------------
// buildShapeDescriptor — direct tests
// ---------------------------------------------------------------------------

test('buildShapeDescriptor nest-default has correct paths', () => {
  const result = buildShapeDescriptor('nest-default', '#/components/schemas/Err', {}, 'application/json', {});
  assert.strictEqual(result.family, 'nest-default');
  assert.strictEqual(result.schemaRef, 'Err');
  assert.strictEqual(result.fieldPath, 'message');
  assert.strictEqual(result.statusPath, 'statusCode');
});

test('buildShapeDescriptor errors-array has null statusPath', () => {
  const result = buildShapeDescriptor('errors-array', null, {}, 'application/json', {});
  assert.strictEqual(result.statusPath, null);
  assert.strictEqual(result.schemaRef, null);
});

test('buildShapeDescriptor raw has all null paths', () => {
  const result = buildShapeDescriptor('raw', null, {}, 'application/json', {});
  assert.strictEqual(result.fieldPath, null);
  assert.strictEqual(result.messagePath, null);
  assert.strictEqual(result.statusPath, null);
});
