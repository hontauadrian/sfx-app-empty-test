'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  emitAuthScheme401Flows,
  resolveSchemeType,
} = require('../flows-generator');

// ---------------------------------------------------------------------------
// resolveSchemeType
// ---------------------------------------------------------------------------

test('resolveSchemeType: returns bearer for null/undefined', () => {
  assert.strictEqual(resolveSchemeType(null), 'bearer');
  assert.strictEqual(resolveSchemeType(undefined), 'bearer');
});

test('resolveSchemeType: returns bearer for http scheme without scheme field', () => {
  assert.strictEqual(resolveSchemeType({ type: 'http' }), 'bearer');
});

test('resolveSchemeType: returns bearer for http bearer', () => {
  assert.strictEqual(resolveSchemeType({ type: 'http', scheme: 'bearer' }), 'bearer');
});

test('resolveSchemeType: returns basic for http basic', () => {
  assert.strictEqual(resolveSchemeType({ type: 'http', scheme: 'basic' }), 'basic');
});

test('resolveSchemeType: returns basic for http Basic (case-insensitive)', () => {
  assert.strictEqual(resolveSchemeType({ type: 'http', scheme: 'Basic' }), 'basic');
});

test('resolveSchemeType: returns apiKey for apiKey type', () => {
  assert.strictEqual(resolveSchemeType({ type: 'apiKey', in: 'header', name: 'X-API-Key' }), 'apiKey');
});

test('resolveSchemeType: returns oauth2 for oauth2 type', () => {
  assert.strictEqual(resolveSchemeType({ type: 'oauth2' }), 'oauth2');
});

test('resolveSchemeType: returns openIdConnect for openIdConnect type', () => {
  assert.strictEqual(resolveSchemeType({ type: 'openIdConnect' }), 'openIdConnect');
});

test('resolveSchemeType: returns bearer for unknown type', () => {
  assert.strictEqual(resolveSchemeType({ type: 'unknown' }), 'bearer');
});

// ---------------------------------------------------------------------------
// emitAuthScheme401Flows — basic gating
// ---------------------------------------------------------------------------

test('emitAuthScheme401Flows: returns empty when authDecorators.authRequired is true', () => {
  const ep = {
    method: 'GET',
    path: '/api/v1/test',
    file: 'test.ts',
    authDecorators: { authRequired: true },
    securityRequirement: [{ apiKeyHeader: [] }],
    swaggerDeclared: { statuses: [200, 401] },
  };
  assert.deepStrictEqual(emitAuthScheme401Flows(ep, {}), []);
});

test('emitAuthScheme401Flows: returns empty when no securityRequirement', () => {
  const ep = {
    method: 'GET',
    path: '/api/v1/test',
    file: 'test.ts',
    authDecorators: { authRequired: false },
    securityRequirement: [],
    swaggerDeclared: { statuses: [200, 401] },
  };
  assert.deepStrictEqual(emitAuthScheme401Flows(ep, {}), []);
});

test('emitAuthScheme401Flows: returns empty when securityRequirement is null', () => {
  const ep = {
    method: 'GET',
    path: '/api/v1/test',
    file: 'test.ts',
    authDecorators: { authRequired: false },
    securityRequirement: null,
    swaggerDeclared: { statuses: [200, 401] },
  };
  assert.deepStrictEqual(emitAuthScheme401Flows(ep, {}), []);
});

test('emitAuthScheme401Flows: returns empty when 401 not declared', () => {
  const ep = {
    method: 'GET',
    path: '/api/v1/test',
    file: 'test.ts',
    authDecorators: { authRequired: false },
    securityRequirement: [{ apiKeyHeader: [] }],
    swaggerDeclared: { statuses: [200] },
  };
  assert.deepStrictEqual(emitAuthScheme401Flows(ep, { securitySchemes: { apiKeyHeader: { type: 'apiKey', in: 'header', name: 'x-api-key' } } }), []);
});

test('emitAuthScheme401Flows: returns empty when scheme not found in securitySchemes', () => {
  const ep = {
    method: 'GET',
    path: '/api/v1/test',
    file: 'test.ts',
    authDecorators: { authRequired: false },
    securityRequirement: [{ unknownScheme: [] }],
    swaggerDeclared: { statuses: [200, 401] },
  };
  assert.deepStrictEqual(emitAuthScheme401Flows(ep, { securitySchemes: {} }), []);
});

test('emitAuthScheme401Flows: skips bearer schemes', () => {
  const ep = {
    method: 'GET',
    path: '/api/v1/test',
    file: 'test.ts',
    authDecorators: { authRequired: false },
    securityRequirement: [{ bearerAuth: [] }],
    swaggerDeclared: { statuses: [200, 401] },
  };
  const flows = emitAuthScheme401Flows(ep, {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
  });
  assert.deepStrictEqual(flows, []);
});

// ---------------------------------------------------------------------------
// emitAuthScheme401Flows — apiKey in header
// ---------------------------------------------------------------------------

test('emitAuthScheme401Flows: emits missing-key flow for apiKey-in-header scheme', () => {
  const ep = {
    method: 'GET',
    path: '/api/v1/probe-ref/auth-flows/apikey-header-protected',
    file: 'auth-flows.controller.ts',
    authDecorators: { authRequired: false, isPublic: true, guards: [], rolesRequired: [] },
    securityRequirement: [{ apiKeyHeader: [] }],
    swaggerDeclared: { statuses: [200, 401], tags: [] },
  };
  const opts = {
    securitySchemes: {
      apiKeyHeader: { type: 'apiKey', in: 'header', name: 'x-api-key' },
    },
  };
  const flows = emitAuthScheme401Flows(ep, opts);
  assert.strictEqual(flows.length, 1);

  const flow = flows[0];
  assert.strictEqual(flow.id, 'probe-ref-auth-flows-apikey-header-protected:get:auth-scheme:missing-apiKeyHeader');
  assert.strictEqual(flow.contract.kind, 'auth-scheme');
  assert.strictEqual(flow.contract.endpoint, 'GET /api/v1/probe-ref/auth-flows/apikey-header-protected');
  assert.strictEqual(flow.steps.length, 2);
  assert.strictEqual(flow.steps[0].kind, 'api');
  assert.strictEqual(flow.steps[0].method, 'GET');
  assert.strictEqual(flow.steps[0].path, '/api/v1/probe-ref/auth-flows/apikey-header-protected');
  assert.strictEqual(flow.steps[1].kind, 'expect');
  assert.strictEqual(flow.steps[1].status, 401);
  assert.ok(flow.onFail.implies.includes('apiKeyHeader'));
  assert.ok(flow.onFail.implies.includes('header'));
  assert.ok(flow.onFail.implies.includes('x-api-key'));
});

// ---------------------------------------------------------------------------
// emitAuthScheme401Flows — apiKey in query
// ---------------------------------------------------------------------------

test('emitAuthScheme401Flows: emits missing-key flow for apiKey-in-query scheme', () => {
  const ep = {
    method: 'GET',
    path: '/api/v1/probe-ref/auth-flows/apikey-query-protected',
    file: 'auth-flows.controller.ts',
    authDecorators: { authRequired: false, isPublic: true, guards: [], rolesRequired: [] },
    securityRequirement: [{ apiKeyQuery: [] }],
    swaggerDeclared: { statuses: [200, 401], tags: [] },
  };
  const opts = {
    securitySchemes: {
      apiKeyQuery: { type: 'apiKey', in: 'query', name: 'api_key' },
    },
  };
  const flows = emitAuthScheme401Flows(ep, opts);
  assert.strictEqual(flows.length, 1);

  const flow = flows[0];
  assert.strictEqual(flow.id, 'probe-ref-auth-flows-apikey-query-protected:get:auth-scheme:missing-apiKeyQuery');
  assert.ok(flow.onFail.implies.includes('query'));
  assert.ok(flow.onFail.implies.includes('api_key'));
  assert.strictEqual(flow.steps[1].status, 401);
});

// ---------------------------------------------------------------------------
// emitAuthScheme401Flows — basic auth
// ---------------------------------------------------------------------------

test('emitAuthScheme401Flows: emits missing-basic flow for basic auth scheme', () => {
  const ep = {
    method: 'GET',
    path: '/api/v1/probe-ref/auth-flows/basic-protected',
    file: 'auth-flows.controller.ts',
    authDecorators: { authRequired: false, isPublic: true, guards: [], rolesRequired: [] },
    securityRequirement: [{ basicAuth: [] }],
    swaggerDeclared: { statuses: [200, 401], tags: [] },
  };
  const opts = {
    securitySchemes: {
      basicAuth: { type: 'http', scheme: 'basic' },
    },
  };
  const flows = emitAuthScheme401Flows(ep, opts);
  assert.strictEqual(flows.length, 1);

  const flow = flows[0];
  assert.strictEqual(flow.id, 'probe-ref-auth-flows-basic-protected:get:auth-scheme:missing-basicAuth');
  assert.strictEqual(flow.contract.kind, 'auth-scheme');
  assert.ok(flow.onFail.implies.includes('Basic auth'));
  assert.ok(flow.onFail.implies.includes('basicAuth'));
  assert.strictEqual(flow.steps[1].status, 401);
});

// ---------------------------------------------------------------------------
// emitAuthScheme401Flows — body included for POST
// ---------------------------------------------------------------------------

test('emitAuthScheme401Flows: includes body for POST endpoints with zodContract', () => {
  const ep = {
    method: 'POST',
    path: '/api/v1/test/apikey-post',
    file: 'test.ts',
    authDecorators: { authRequired: false },
    securityRequirement: [{ apiKeyHeader: [] }],
    swaggerDeclared: { statuses: [200, 401] },
    zodContract: { sampleValid: { name: 'test' }, fields: [{ name: 'name' }] },
  };
  const opts = {
    securitySchemes: { apiKeyHeader: { type: 'apiKey', in: 'header', name: 'x-api-key' } },
  };
  const flows = emitAuthScheme401Flows(ep, opts);
  assert.strictEqual(flows.length, 1);
  assert.deepStrictEqual(flows[0].steps[0].body, { name: 'test' });
});

test('emitAuthScheme401Flows: no body for GET endpoints even with zodContract', () => {
  const ep = {
    method: 'GET',
    path: '/api/v1/test/apikey-get',
    file: 'test.ts',
    authDecorators: { authRequired: false },
    securityRequirement: [{ apiKeyHeader: [] }],
    swaggerDeclared: { statuses: [200, 401] },
    zodContract: { sampleValid: { name: 'test' }, fields: [{ name: 'name' }] },
  };
  const opts = {
    securitySchemes: { apiKeyHeader: { type: 'apiKey', in: 'header', name: 'x-api-key' } },
  };
  const flows = emitAuthScheme401Flows(ep, opts);
  assert.strictEqual(flows.length, 1);
  assert.strictEqual(flows[0].steps[0].body, undefined);
});

// ---------------------------------------------------------------------------
// emitAuthScheme401Flows — multiple schemes
// ---------------------------------------------------------------------------

test('emitAuthScheme401Flows: emits flows for multiple non-bearer schemes', () => {
  const ep = {
    method: 'GET',
    path: '/api/v1/test/multi-scheme',
    file: 'test.ts',
    authDecorators: { authRequired: false },
    securityRequirement: [{ apiKeyHeader: [] }, { basicAuth: [] }],
    swaggerDeclared: { statuses: [200, 401] },
  };
  const opts = {
    securitySchemes: {
      apiKeyHeader: { type: 'apiKey', in: 'header', name: 'x-api-key' },
      basicAuth: { type: 'http', scheme: 'basic' },
    },
  };
  const flows = emitAuthScheme401Flows(ep, opts);
  assert.strictEqual(flows.length, 2);
  assert.ok(flows.some((f) => f.id.includes('missing-apiKeyHeader')));
  assert.ok(flows.some((f) => f.id.includes('missing-basicAuth')));
});

test('emitAuthScheme401Flows: skips oauth2 schemes', () => {
  const ep = {
    method: 'GET',
    path: '/api/v1/test/oauth',
    file: 'test.ts',
    authDecorators: { authRequired: false },
    securityRequirement: [{ oauthScheme: [] }],
    swaggerDeclared: { statuses: [200, 401] },
  };
  const opts = {
    securitySchemes: { oauthScheme: { type: 'oauth2' } },
  };
  const flows = emitAuthScheme401Flows(ep, opts);
  assert.deepStrictEqual(flows, []);
});

test('emitAuthScheme401Flows: skips invalid securityRequirement entries', () => {
  const ep = {
    method: 'GET',
    path: '/api/v1/test',
    file: 'test.ts',
    authDecorators: { authRequired: false },
    securityRequirement: [null, undefined, 'invalid', { apiKeyHeader: [] }],
    swaggerDeclared: { statuses: [200, 401] },
  };
  const opts = {
    securitySchemes: { apiKeyHeader: { type: 'apiKey', in: 'header', name: 'x-api-key' } },
  };
  const flows = emitAuthScheme401Flows(ep, opts);
  assert.strictEqual(flows.length, 1);
});
