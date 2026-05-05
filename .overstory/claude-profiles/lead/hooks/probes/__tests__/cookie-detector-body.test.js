'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { detectCookieFlows, extractRequestBodyExample } = require('../detectors/cookie-flows');

// ---------------------------------------------------------------------------
// extractRequestBodyExample — unit tests
// ---------------------------------------------------------------------------

test('extractRequestBodyExample: returns null for null/undefined operation', () => {
  assert.strictEqual(extractRequestBodyExample({}, null), null);
  assert.strictEqual(extractRequestBodyExample({}, undefined), null);
});

test('extractRequestBodyExample: returns null when no requestBody', () => {
  const op = { responses: {} };
  assert.strictEqual(extractRequestBodyExample({}, op), null);
});

test('extractRequestBodyExample: returns null when no application/json content', () => {
  const op = {
    requestBody: {
      content: {
        'multipart/form-data': { schema: { type: 'object' } },
      },
    },
  };
  assert.strictEqual(extractRequestBodyExample({}, op), null);
});

test('extractRequestBodyExample: P1 — extracts schema.example (inline schema)', () => {
  const op = {
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: { tenantId: { type: 'string' } },
            example: { tenantId: 'probe-tenant-a' },
          },
        },
      },
    },
  };
  assert.deepStrictEqual(extractRequestBodyExample({}, op), { tenantId: 'probe-tenant-a' });
});

test('extractRequestBodyExample: P1 — extracts schema.example via $ref resolution', () => {
  const spec = {
    components: {
      schemas: {
        TenantSetBody: {
          type: 'object',
          properties: { tenantId: { type: 'string' } },
          example: { tenantId: 'ref-tenant' },
        },
      },
    },
  };
  const op = {
    requestBody: {
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/TenantSetBody' },
        },
      },
    },
  };
  assert.deepStrictEqual(extractRequestBodyExample(spec, op), { tenantId: 'ref-tenant' });
});

test('extractRequestBodyExample: P2 — extracts content-level example', () => {
  const op = {
    requestBody: {
      content: {
        'application/json': {
          schema: { type: 'object' },
          example: { foo: 'bar' },
        },
      },
    },
  };
  assert.deepStrictEqual(extractRequestBodyExample({}, op), { foo: 'bar' });
});

test('extractRequestBodyExample: P1 takes priority over P2', () => {
  const op = {
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            example: { from: 'schema' },
          },
          example: { from: 'content' },
        },
      },
    },
  };
  // P1 (schema.example) should win
  assert.deepStrictEqual(extractRequestBodyExample({}, op), { from: 'schema' });
});

test('extractRequestBodyExample: P3 — extracts examples map first value', () => {
  const op = {
    requestBody: {
      content: {
        'application/json': {
          schema: { type: 'object' },
          examples: {
            default: { summary: 'default', value: { id: 'example-1' } },
            alternate: { summary: 'alt', value: { id: 'example-2' } },
          },
        },
      },
    },
  };
  assert.deepStrictEqual(extractRequestBodyExample({}, op), { id: 'example-1' });
});

test('extractRequestBodyExample: P2 takes priority over P3', () => {
  const op = {
    requestBody: {
      content: {
        'application/json': {
          schema: { type: 'object' },
          example: { from: 'content-example' },
          examples: {
            default: { value: { from: 'examples-map' } },
          },
        },
      },
    },
  };
  // P2 (content.example) should win over P3 (content.examples)
  assert.deepStrictEqual(extractRequestBodyExample({}, op), { from: 'content-example' });
});

test('extractRequestBodyExample: returns null when schema exists but no example anywhere', () => {
  const op = {
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
        },
      },
    },
  };
  assert.strictEqual(extractRequestBodyExample({}, op), null);
});

test('extractRequestBodyExample: returns null when examples map has no value field', () => {
  const op = {
    requestBody: {
      content: {
        'application/json': {
          schema: { type: 'object' },
          examples: {
            broken: { summary: 'missing value' },
          },
        },
      },
    },
  };
  assert.strictEqual(extractRequestBodyExample({}, op), null);
});

// ---------------------------------------------------------------------------
// detectCookieFlows — requestBodyExample integration
// ---------------------------------------------------------------------------

function buildOpenApiWithTenantIssuer(requestBodyOverrides) {
  return {
    paths: {
      '/tenant-set': {
        post: {
          operationId: 'cookieTenantSet',
          'x-cookie-roles': [{ name: 'pr_tenant', role: 'tenant-scope' }],
          requestBody: requestBodyOverrides,
          responses: {
            '200': {
              headers: {
                'Set-Cookie': {
                  'x-cookie-role': 'tenant-scope',
                  'x-cookie-name': 'pr_tenant',
                  'x-cookie-attrs': { httpOnly: true },
                },
              },
            },
          },
        },
      },
      '/tenant-scoped': {
        get: {
          operationId: 'cookieTenantScoped',
          'x-cookie-consumes': [{ name: 'pr_tenant' }],
          responses: { '200': {} },
        },
      },
    },
  };
}

test('detectCookieFlows: POST issuer with schema.example -> requestBodyExample set', () => {
  const openapi = buildOpenApiWithTenantIssuer({
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: { tenantId: { type: 'string' } },
          example: { tenantId: 'probe-tenant-a' },
        },
      },
    },
  });

  const { cookieFlows, diagnostics } = detectCookieFlows(openapi);
  const tenantFlow = cookieFlows.find((cf) => cf.role === 'tenant-scope');
  assert.ok(tenantFlow, 'should find tenant-scope flow');
  assert.strictEqual(tenantFlow.issuers.length, 1);
  assert.deepStrictEqual(tenantFlow.issuers[0].requestBodyExample, { tenantId: 'probe-tenant-a' });

  // No DIAG for undeclared body
  const bodyDiags = diagnostics.filter((d) => d.code === 'COOKIE_ISSUER_BODY_EXAMPLE_UNDECLARED');
  assert.strictEqual(bodyDiags.length, 0);
});

test('detectCookieFlows: POST issuer with examples map -> requestBodyExample set', () => {
  const openapi = buildOpenApiWithTenantIssuer({
    content: {
      'application/json': {
        schema: { type: 'object' },
        examples: {
          default: { summary: 'default', value: { tenantId: 'from-examples' } },
        },
      },
    },
  });

  const { cookieFlows } = detectCookieFlows(openapi);
  const tenantFlow = cookieFlows.find((cf) => cf.role === 'tenant-scope');
  assert.deepStrictEqual(tenantFlow.issuers[0].requestBodyExample, { tenantId: 'from-examples' });
});

test('detectCookieFlows: POST issuer with schema but no example -> DIAG + requestBodyExample=null', () => {
  const openapi = buildOpenApiWithTenantIssuer({
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: { tenantId: { type: 'string' } },
        },
      },
    },
  });

  const { cookieFlows, diagnostics } = detectCookieFlows(openapi);
  const tenantFlow = cookieFlows.find((cf) => cf.role === 'tenant-scope');
  assert.strictEqual(tenantFlow.issuers[0].requestBodyExample, null);

  const bodyDiags = diagnostics.filter((d) => d.code === 'COOKIE_ISSUER_BODY_EXAMPLE_UNDECLARED');
  assert.strictEqual(bodyDiags.length, 1);
  assert.strictEqual(bodyDiags[0].details.operationId, 'cookieTenantSet');
  assert.strictEqual(bodyDiags[0].details.cookieName, 'pr_tenant');
  assert.strictEqual(bodyDiags[0].details.role, 'tenant-scope');
});

test('detectCookieFlows: GET issuer has no requestBodyExample field', () => {
  const openapi = {
    paths: {
      '/csrf-issue': {
        get: {
          operationId: 'cookieCsrfIssue',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': {
                  'x-cookie-role': 'csrf-double-submit',
                  'x-cookie-name': 'csrf_token',
                },
              },
            },
          },
        },
      },
    },
  };

  const { cookieFlows } = detectCookieFlows(openapi);
  const csrfFlow = cookieFlows.find((cf) => cf.role === 'csrf-double-submit');
  assert.ok(csrfFlow);
  // GET issuer should NOT have requestBodyExample at all
  assert.strictEqual(csrfFlow.issuers[0].requestBodyExample, undefined);
});

test('detectCookieFlows: POST issuer with no requestBody property -> no requestBodyExample, no DIAG', () => {
  const openapi = {
    paths: {
      '/session-login': {
        post: {
          operationId: 'cookieSessionLogin',
          responses: {
            '200': {
              headers: {
                'Set-Cookie': {
                  'x-cookie-role': 'session',
                  'x-cookie-name': 'pr_session',
                },
              },
            },
          },
        },
      },
    },
  };

  const { cookieFlows, diagnostics } = detectCookieFlows(openapi);
  const sessionFlow = cookieFlows.find((cf) => cf.role === 'session');
  assert.ok(sessionFlow);
  // POST with NO requestBody at all: requestBodyExample stays undefined
  assert.strictEqual(sessionFlow.issuers[0].requestBodyExample, undefined);

  const bodyDiags = diagnostics.filter((d) => d.code === 'COOKIE_ISSUER_BODY_EXAMPLE_UNDECLARED');
  assert.strictEqual(bodyDiags.length, 0);
});
