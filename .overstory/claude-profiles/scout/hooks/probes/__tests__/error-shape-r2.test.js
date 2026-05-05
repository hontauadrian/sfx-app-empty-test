'use strict';

/**
 * R2 edge-case tests for lib/error-shape.js
 *
 * Branches 21-27 from the R2 Cluster B matrix:
 *  21. nest-default {statusCode,message,error} (re-verify)
 *  22. nest-wrapped {success:false,error:{...}} (re-verify)
 *  23. problem-json RFC7807 {type,title,status,detail,instance} (re-verify)
 *  24. errors[] array {errors:[{code,message}]} (re-verify)
 *  25. nested error wrapper {result:{error:{...}}} (3+ levels deep)
 *  26. error with code AND message AND details (all three)
 *  27. error per HTTP status (different shapes for 400 vs 401 vs 500)
 */

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
// Helpers
// ---------------------------------------------------------------------------

function makeSpec(schemas) {
  return { components: { schemas }, paths: {} };
}

// ===========================================================================
// Branch 21: nest-default {statusCode, message, error} — re-verify + edges
// ===========================================================================

test('R2-B21: nest-default with all three standard fields', () => {
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

test('R2-B21: nest-default with only statusCode + message (no error field)', () => {
  const schema = {
    type: 'object',
    properties: {
      statusCode: { type: 'number' },
      message: { type: 'string' },
    },
  };
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', {}), 'nest-default');
});

test('R2-B21: nest-default with message as array of strings', () => {
  // NestJS validation pipe produces message:string[] for multiple errors
  const schema = {
    type: 'object',
    properties: {
      statusCode: { type: 'number' },
      message: { type: 'array', items: { type: 'string' } },
      error: { type: 'string' },
    },
  };
  // Still has statusCode + message properties -> nest-default
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', {}), 'nest-default');
});

test('R2-B21: nest-default via $ref resolution', () => {
  const spec = makeSpec({
    HttpError: {
      type: 'object',
      properties: {
        statusCode: { type: 'integer' },
        message: { type: 'string' },
        error: { type: 'string' },
      },
    },
  });
  const schema = { $ref: '#/components/schemas/HttpError' };
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', spec), 'nest-default');
});

test('R2-B21: buildShapeDescriptor nest-default paths are correct', () => {
  const result = buildShapeDescriptor('nest-default', '#/components/schemas/E', {}, 'application/json', {});
  assert.strictEqual(result.fieldPath, 'message');
  assert.strictEqual(result.messagePath, 'message');
  assert.strictEqual(result.statusPath, 'statusCode');
  assert.strictEqual(result.schemaRef, 'E');
  assert.strictEqual(result.contentType, 'application/json');
});

test('R2-B21: buildErrorAssertions nest-default with envelope prepend', () => {
  const errorShape = buildShapeDescriptor('nest-default', null, {}, 'application/json', {});
  const assertions = buildErrorAssertions({ errorShape, fieldName: 'email', envelope: ['data'] });
  assert.strictEqual(assertions[0].statusCodeField, 'data.statusCode');
  assert.deepStrictEqual(assertions[0].envelope, ['data']);
});

// ===========================================================================
// Branch 22: nest-wrapped {success:false, error:{...}} — re-verify + edges
// ===========================================================================

test('R2-B22: nest-wrapped with error as object containing statusCode+message', () => {
  const schema = {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: {
        type: 'object',
        properties: {
          statusCode: { type: 'number' },
          message: { type: 'string' },
          errors: { type: 'array', items: { type: 'object' } },
        },
      },
    },
  };
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', {}), 'nest-wrapped');
});

test('R2-B22: nest-wrapped takes priority over nest-default when both match', () => {
  // Has both {success, error:{...}} AND {statusCode, message}
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
      statusCode: { type: 'number' },
      message: { type: 'string' },
    },
  };
  // nest-wrapped check comes before nest-default in the code
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', {}), 'nest-wrapped');
});

test('R2-B22: NOT nest-wrapped when error is a string (not object)', () => {
  const schema = {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
    },
  };
  // error is a string, not an object -> not nest-wrapped
  // Falls through to check nest-default (no statusCode+message either) -> raw
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', {}), 'raw');
});

test('R2-B22: nest-wrapped via $ref for the error object', () => {
  const spec = makeSpec({
    ErrorDetail: {
      type: 'object',
      properties: {
        statusCode: { type: 'number' },
        message: { type: 'string' },
      },
    },
  });
  const schema = {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { $ref: '#/components/schemas/ErrorDetail' },
    },
  };
  // resolveRef inside identifyErrorFamily should resolve error's $ref
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', spec), 'nest-wrapped');
});

test('R2-B22: buildErrorAssertions nest-wrapped without envelope', () => {
  const errorShape = buildShapeDescriptor('nest-wrapped', null, {}, 'application/json', {});
  const assertions = buildErrorAssertions({ errorShape, fieldName: 'password', envelope: null });
  assert.strictEqual(assertions[0].family, 'nest-wrapped');
  assert.strictEqual(assertions[0].statusCodeField, 'statusCode');
  assert.strictEqual(assertions[0].messageContains, 'password');
  assert.strictEqual(assertions[0].envelope, undefined);
});

test('R2-B22: buildErrorAssertions nest-wrapped with error envelope', () => {
  const errorShape = buildShapeDescriptor('nest-wrapped', null, {}, 'application/json', {});
  const assertions = buildErrorAssertions({ errorShape, fieldName: 'name', envelope: ['error'] });
  assert.strictEqual(assertions[0].statusCodeField, 'error.statusCode');
  assert.deepStrictEqual(assertions[0].envelope, ['error']);
});

// ===========================================================================
// Branch 23: problem-json RFC7807 — re-verify + edges
// ===========================================================================

test('R2-B23: problem-json by content type (any schema)', () => {
  const schema = { type: 'object', properties: { msg: { type: 'string' } } };
  assert.strictEqual(identifyErrorFamily(schema, 'application/problem+json', {}), 'problem-json');
});

test('R2-B23: problem-json by schema shape (type+title+status)', () => {
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

test('R2-B23: problem-json with extended errors[] subarray', () => {
  const schema = {
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
          properties: { field: { type: 'string' }, code: { type: 'string' } },
        },
      },
    },
  };
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', {}), 'problem-json');
});

test('R2-B23: problem-json without optional fields (only type+title+status)', () => {
  const schema = {
    type: 'object',
    properties: {
      type: { type: 'string' },
      title: { type: 'string' },
      status: { type: 'integer' },
    },
  };
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', {}), 'problem-json');
});

test('R2-B23: buildShapeDescriptor problem-json with errors[] uses errors[*].field', () => {
  const resolvedSchema = {
    type: 'object',
    properties: {
      type: { type: 'string' },
      title: { type: 'string' },
      status: { type: 'integer' },
      detail: { type: 'string' },
      errors: { type: 'array', items: { type: 'object' } },
    },
  };
  const result = buildShapeDescriptor('problem-json', null, resolvedSchema, 'application/problem+json', {});
  assert.strictEqual(result.fieldPath, 'errors[*].field');
  assert.strictEqual(result.statusPath, 'status');
});

test('R2-B23: buildShapeDescriptor problem-json without errors[] uses detail', () => {
  const resolvedSchema = {
    type: 'object',
    properties: {
      type: { type: 'string' },
      title: { type: 'string' },
      status: { type: 'integer' },
      detail: { type: 'string' },
    },
  };
  const result = buildShapeDescriptor('problem-json', null, resolvedSchema, 'application/problem+json', {});
  assert.strictEqual(result.fieldPath, 'detail');
  assert.strictEqual(result.messagePath, 'detail');
  assert.strictEqual(result.statusPath, 'status');
});

test('R2-B23: extractErrorShape prefers problem+json content type over application/json', () => {
  const operation = {
    responses: {
      '422': {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { statusCode: { type: 'number' }, message: { type: 'string' } },
            },
          },
          'application/problem+json': {
            schema: {
              type: 'object',
              properties: {
                type: { type: 'string' }, title: { type: 'string' },
                status: { type: 'integer' }, detail: { type: 'string' },
              },
            },
          },
        },
      },
    },
  };
  const result = extractErrorShape({}, {}, operation);
  assert.strictEqual(result.family, 'problem-json');
  assert.strictEqual(result.contentType, 'application/problem+json');
});

// ===========================================================================
// Branch 24: errors-array {errors:[{code,message}]} — re-verify + edges
// ===========================================================================

test('R2-B24: errors-array with field+code+message items', () => {
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
            message: { type: 'string' },
          },
        },
      },
    },
  };
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', {}), 'errors-array');
});

test('R2-B24: errors-array via $ref items', () => {
  const spec = makeSpec({
    ValidationError: {
      type: 'array',
      items: {
        type: 'object',
        properties: { field: { type: 'string' }, message: { type: 'string' } },
      },
    },
  });
  const schema = {
    type: 'object',
    properties: {
      errors: { $ref: '#/components/schemas/ValidationError' },
    },
  };
  // resolveRef on the errors prop should resolve to the array schema
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', spec), 'errors-array');
});

test('R2-B24: errors-array NOT detected when errors is not an array', () => {
  const schema = {
    type: 'object',
    properties: {
      errors: { type: 'string' },
    },
  };
  // errors is a string, not an array -> falls through to raw
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', {}), 'raw');
});

test('R2-B24: buildErrorAssertions errors-array omits statusCodeField', () => {
  const errorShape = buildShapeDescriptor('errors-array', null, {}, 'application/json', {});
  const assertions = buildErrorAssertions({ errorShape, fieldName: 'email', envelope: null });
  assert.strictEqual(assertions[0].family, 'errors-array');
  assert.strictEqual(assertions[0].fieldName, 'email');
  assert.strictEqual(assertions[0].statusCodeField, undefined);
});

test('R2-B24: buildErrorAssertions errors-array with envelope', () => {
  const errorShape = buildShapeDescriptor('errors-array', null, {}, 'application/json', {});
  const assertions = buildErrorAssertions({ errorShape, fieldName: 'name', envelope: ['data'] });
  assert.strictEqual(assertions[0].family, 'errors-array');
  assert.deepStrictEqual(assertions[0].envelope, ['data']);
});

// ===========================================================================
// Branch 25: nested error wrapper {result:{error:{...}}} (3+ levels deep)
// ===========================================================================

test('R2-B25: deeply nested error object not detected as nest-wrapped', () => {
  // {result: {error: {statusCode, message}}} has a wrapper at 'result', not
  // at the top level. identifyErrorFamily looks at top-level props.
  const schema = {
    type: 'object',
    properties: {
      result: {
        type: 'object',
        properties: {
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
  };
  // Top-level has only 'result' — not matching any family pattern
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', {}), 'raw');
});

test('R2-B25: triple nested error through $ref', () => {
  const spec = makeSpec({
    InnerError: {
      type: 'object',
      properties: {
        code: { type: 'number' },
        message: { type: 'string' },
      },
    },
    MiddleWrapper: {
      type: 'object',
      properties: {
        error: { $ref: '#/components/schemas/InnerError' },
      },
    },
    OuterWrapper: {
      type: 'object',
      properties: {
        result: { $ref: '#/components/schemas/MiddleWrapper' },
      },
    },
  });
  const schema = { $ref: '#/components/schemas/OuterWrapper' };
  // Resolved: {result: {error: {code, message}}} — no family match
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', spec), 'raw');
});

test('R2-B25: buildErrorAssertions raw for unrecognized deep nesting', () => {
  const errorShape = buildShapeDescriptor('raw', null, {}, 'application/json', {});
  const assertions = buildErrorAssertions({ errorShape, fieldName: 'field', envelope: null });
  assert.strictEqual(assertions[0].errorFieldMentions, 'field');
  assert.strictEqual(assertions[0].kind, undefined);
});

// ===========================================================================
// Branch 26: error with code AND message AND details (all three)
// ===========================================================================

test('R2-B26: schema with code+message+details but no statusCode falls to raw', () => {
  const schema = {
    type: 'object',
    properties: {
      code: { type: 'string' },
      message: { type: 'string' },
      details: { type: 'array', items: { type: 'object' } },
    },
  };
  // No statusCode, no success+error, no type+title+status, no errors array -> raw
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', {}), 'raw');
});

test('R2-B26: schema with code+message+statusCode matches nest-default', () => {
  const schema = {
    type: 'object',
    properties: {
      code: { type: 'string' },
      statusCode: { type: 'number' },
      message: { type: 'string' },
      details: { type: 'object' },
    },
  };
  // Has statusCode + message -> nest-default
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', {}), 'nest-default');
});

test('R2-B26: schema with code+message+errors-array matches errors-array', () => {
  const schema = {
    type: 'object',
    properties: {
      code: { type: 'string' },
      message: { type: 'string' },
      errors: {
        type: 'array',
        items: { type: 'object', properties: { field: { type: 'string' } } },
      },
    },
  };
  // Has errors array -> errors-array wins
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', {}), 'errors-array');
});

// ===========================================================================
// Branch 27: error per HTTP status (different shapes for 400 vs 401 vs 500)
// ===========================================================================

test('R2-B27: extractErrorShape picks lowest error status code', () => {
  const operation = {
    responses: {
      '200': {
        content: { 'application/json': { schema: { type: 'object' } } },
      },
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
        },
      },
      '401': {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                statusCode: { type: 'number' },
                message: { type: 'string' },
                error: { type: 'string' },
              },
            },
          },
        },
      },
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
  const result = extractErrorShape({}, {}, operation);
  // Picks first >=400 in sorted order: 400
  assert.ok(result);
  assert.strictEqual(result.family, 'nest-default');
  assert.strictEqual(result.contentType, 'application/json');
});

test('R2-B27: extractErrorShape picks 401 when 400 has no content', () => {
  const operation = {
    responses: {
      '400': { description: 'Bad Request' },  // no content
      '401': {
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
        },
      },
    },
  };
  const result = extractErrorShape({}, {}, operation);
  assert.ok(result);
  assert.strictEqual(result.family, 'nest-default');
});

test('R2-B27: extractErrorShape picks 500 when no 4xx has content', () => {
  const operation = {
    responses: {
      '400': { description: 'Bad Request' },
      '401': { description: 'Unauthorized' },
      '500': {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                errors: {
                  type: 'array',
                  items: { type: 'object', properties: { code: { type: 'string' } } },
                },
              },
            },
          },
        },
      },
    },
  };
  const result = extractErrorShape({}, {}, operation);
  assert.ok(result);
  assert.strictEqual(result.family, 'errors-array');
});

test('R2-B27: different families per status - first one found wins', () => {
  const spec = makeSpec({
    ProblemJson: {
      type: 'object',
      properties: {
        type: { type: 'string' },
        title: { type: 'string' },
        status: { type: 'integer' },
        detail: { type: 'string' },
      },
    },
    NestError: {
      type: 'object',
      properties: {
        statusCode: { type: 'number' },
        message: { type: 'string' },
      },
    },
  });
  const operation = {
    responses: {
      '422': {
        content: {
          'application/problem+json': {
            schema: { $ref: '#/components/schemas/ProblemJson' },
          },
        },
      },
      '500': {
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/NestError' },
          },
        },
      },
    },
  };
  const result = extractErrorShape(spec, {}, operation);
  // 422 < 500, so picks problem-json first
  assert.strictEqual(result.family, 'problem-json');
  assert.strictEqual(result.contentType, 'application/problem+json');
});

// ===========================================================================
// Additional edge cases
// ===========================================================================

test('R2-extra: extractErrorShape with non-numeric status codes (e.g. "default")', () => {
  const operation = {
    responses: {
      default: {
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
        },
      },
    },
  };
  // "default" is NaN, not >= 400, so should be skipped
  const result = extractErrorShape({}, {}, operation);
  assert.strictEqual(result, null);
});

test('R2-extra: extractErrorShape with 3xx responses skipped', () => {
  const operation = {
    responses: {
      '301': {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { location: { type: 'string' } },
            },
          },
        },
      },
    },
  };
  const result = extractErrorShape({}, {}, operation);
  assert.strictEqual(result, null);
});

test('R2-extra: identifyErrorFamily with empty properties object returns raw', () => {
  const schema = { type: 'object', properties: {} };
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', {}), 'raw');
});

test('R2-extra: identifyErrorFamily with error property that has no type (implicit object)', () => {
  const schema = {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: {
        properties: {
          statusCode: { type: 'number' },
          message: { type: 'string' },
        },
      },
    },
  };
  // error has properties but no explicit type:'object'. identifyErrorFamily
  // checks for errorProp.type === 'object' || errorProp.properties
  assert.strictEqual(identifyErrorFamily(schema, 'application/json', {}), 'nest-wrapped');
});

test('R2-extra: buildErrorAssertions with empty envelope array does not prepend', () => {
  const errorShape = buildShapeDescriptor('problem-json', null, { properties: {} }, 'application/problem+json', {});
  const assertions = buildErrorAssertions({ errorShape, fieldName: 'email', envelope: [] });
  assert.strictEqual(assertions[0].statusCodeField, 'status');
  assert.strictEqual(assertions[0].envelope, undefined);
});

test('R2-extra: buildErrorAssertions with multi-segment envelope', () => {
  const errorShape = buildShapeDescriptor('nest-default', null, {}, 'application/json', {});
  const assertions = buildErrorAssertions({ errorShape, fieldName: 'email', envelope: ['response', 'error'] });
  assert.strictEqual(assertions[0].statusCodeField, 'response.error.statusCode');
  assert.deepStrictEqual(assertions[0].envelope, ['response', 'error']);
});
