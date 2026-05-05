'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  emitCsrfFlows,
  emitOAuthFlows,
  emitTenantIsolationFlows,
} = require('../flows-generator');

// ---------------------------------------------------------------------------
// emitCsrfFlows
// ---------------------------------------------------------------------------

test('emitCsrfFlows: returns empty when csrf not detected', () => {
  const matrix = { csrf: null, apiEndpoints: [] };
  assert.deepStrictEqual(emitCsrfFlows(matrix), []);
});

test('emitCsrfFlows: returns empty when csrf detected but no tokenEndpoint', () => {
  const matrix = {
    csrf: { detected: true, tokenEndpoint: null, tokenHeaderName: 'x-csrf-token', source: 'package.json:csurf' },
    apiEndpoints: [],
  };
  assert.deepStrictEqual(emitCsrfFlows(matrix), []);
});

test('emitCsrfFlows: returns empty when no POST endpoint has csrf securityRequirement', () => {
  const matrix = {
    csrf: {
      detected: true,
      tokenEndpoint: { method: 'GET', path: '/api/v1/csrf-token' },
      tokenHeaderName: 'x-csrf-token',
      source: 'securityScheme:csrf-token',
    },
    apiEndpoints: [
      { method: 'POST', path: '/api/v1/users', securityRequirement: [{ bearer: [] }] },
      { method: 'GET', path: '/api/v1/csrf-token', securityRequirement: [] },
    ],
  };
  assert.deepStrictEqual(emitCsrfFlows(matrix), []);
});

test('emitCsrfFlows: emits 3 flows when CSRF-protected POST endpoint found via securityRequirement', () => {
  // Declaration-driven: securitySchemes provides the CSRF scheme definition,
  // endpoint parameters declare the header, securityRequirement links them.
  const matrix = {
    csrf: {
      detected: true,
      tokenEndpoint: { method: 'GET', path: '/api/v1/csrf-token', tokenField: 'token' },
      source: 'securityScheme:csrf-token',
    },
    securitySchemes: {
      'csrf-token': { type: 'apiKey', in: 'header', name: 'x-csrf-token' },
    },
    responseEnvelope: { wrapper: 'data', source: 'test' },
    apiEndpoints: [
      { method: 'GET', path: '/api/v1/csrf-token', securityRequirement: [] },
      { method: 'POST', path: '/api/v1/probe-ref/csrf-protected', securityRequirement: [{ 'csrf-token': [] }], parameters: [{ in: 'header', name: 'x-csrf-token' }] },
      { method: 'POST', path: '/api/v1/users', securityRequirement: [{ bearer: [] }] },
    ],
  };
  const flows = emitCsrfFlows(matrix);
  // 3 flows per endpoint: happy + missing-token + invalid-token
  assert.strictEqual(flows.length, 3);

  // Flow 1: happy path (fetch token then POST with it)
  const happyFlow = flows.find((f) => f.id.includes('consume:happy'));
  assert.ok(happyFlow, 'should have consume:happy flow');
  assert.strictEqual(happyFlow.steps[0].path, '/api/v1/csrf-token');
  assert.strictEqual(happyFlow.steps[0].method, 'GET');
  assert.strictEqual(happyFlow.steps[2].bindings.csrfToken, '$.data.token');
  assert.strictEqual(happyFlow.steps[3].path, '/api/v1/probe-ref/csrf-protected');
  assert.strictEqual(happyFlow.steps[3].headers['x-csrf-token'], '${csrfToken}');

  // Flow 2: missing-token rejected
  const missingFlow = flows.find((f) => f.id.includes('consume:missing-token'));
  assert.ok(missingFlow, 'should have consume:missing-token flow');
  assert.strictEqual(missingFlow.steps[0].path, '/api/v1/probe-ref/csrf-protected');
  assert.strictEqual(missingFlow.steps[1].status, 403);

  // Flow 3: invalid-token rejected
  const invalidFlow = flows.find((f) => f.id.includes('consume:invalid-token'));
  assert.ok(invalidFlow, 'should have consume:invalid-token flow');
  assert.strictEqual(invalidFlow.steps[0].headers['x-csrf-token'], 'invalid-token-probe-12345');
  assert.strictEqual(invalidFlow.steps[1].status, 403);
});

test('emitCsrfFlows: derives header name from securitySchemes declaration', () => {
  // Declaration-driven: securitySchemes declares 'xsrf' as apiKey in header
  // named 'x-xsrf-token'. The emitter resolves this from the scheme, NOT
  // from csrf.tokenHeaderName (which is a detector shortcut the emitter
  // correctly ignores per source-of-truth principle).
  const matrix = {
    csrf: {
      detected: true,
      tokenEndpoint: { method: 'GET', path: '/api/v1/xsrf-token', tokenField: 'xsrfToken' },
      source: 'securityScheme:xsrf',
    },
    securitySchemes: {
      xsrf: { type: 'apiKey', in: 'header', name: 'x-xsrf-token' },
    },
    responseEnvelope: { wrapper: 'data', source: 'test' },
    apiEndpoints: [
      { method: 'POST', path: '/api/v1/data', securityRequirement: [{ xsrf: [] }], parameters: [{ in: 'header', name: 'x-xsrf-token' }] },
    ],
  };
  const flows = emitCsrfFlows(matrix);
  assert.strictEqual(flows.length, 3);
  const happyFlow = flows.find((f) => f.id.includes('consume:happy'));
  assert.ok(happyFlow);
  assert.strictEqual(happyFlow.steps[2].bindings.csrfToken, '$.data.xsrfToken');
  assert.strictEqual(happyFlow.steps[3].headers['x-xsrf-token'], '${csrfToken}');
});

test('emitCsrfFlows: resolves header from securitySchemes even when source is not securityScheme prefixed', () => {
  // When csrf.source is 'package.json:csurf' (not a securityScheme prefix),
  // the emitter still resolves headers from the declared securitySchemes and
  // endpoint parameters — NOT from csrf.tokenHeaderName.
  const matrix = {
    csrf: {
      detected: true,
      tokenEndpoint: { method: 'GET', path: '/api/v1/csrf-token', tokenField: 'token' },
      source: 'package.json:csurf',
    },
    securitySchemes: {
      'csrf-token': { type: 'apiKey', in: 'header', name: 'x-csrf-token' },
    },
    responseEnvelope: { wrapper: 'data', source: 'test' },
    apiEndpoints: [
      { method: 'POST', path: '/api/v1/data', securityRequirement: [{ 'csrf-token': [] }], parameters: [{ in: 'header', name: 'x-csrf-token' }] },
    ],
  };
  const flows = emitCsrfFlows(matrix);
  assert.strictEqual(flows.length, 3);
});

test('emitCsrfFlows: emits only missing-token + invalid-token when tokenField is absent', () => {
  // When tokenEndpoint exists but tokenField is absent, no happy flow is
  // emitted (can't capture token). Still emits missing-token + invalid-token
  // because the endpoint is CSRF-protected.
  const matrix = {
    csrf: {
      detected: true,
      tokenEndpoint: { method: 'GET', path: '/api/v1/csrf-token' },
      source: 'securityScheme:csrf-token',
    },
    securitySchemes: {
      'csrf-token': { type: 'apiKey', in: 'header', name: 'x-csrf-token' },
    },
    apiEndpoints: [
      { method: 'POST', path: '/api/v1/data', securityRequirement: [{ 'csrf-token': [] }], parameters: [{ in: 'header', name: 'x-csrf-token' }] },
    ],
  };
  const flows = emitCsrfFlows(matrix);
  // 2 flows: missing-token + invalid-token (no happy because tokenField is absent)
  assert.strictEqual(flows.length, 2);
  assert.ok(flows.every((f) => !f.id.includes('consume:happy')));
  assert.ok(flows.some((f) => f.id.includes('consume:missing-token')));
  assert.ok(flows.some((f) => f.id.includes('consume:invalid-token')));
});

// ---------------------------------------------------------------------------
// emitOAuthFlows
// ---------------------------------------------------------------------------

test('emitOAuthFlows: returns empty when oauth not detected', () => {
  const matrix = { oauth: null };
  assert.deepStrictEqual(emitOAuthFlows(matrix), []);
});

test('emitOAuthFlows: returns empty when oauth.detected is false', () => {
  const matrix = { oauth: { detected: false } };
  assert.deepStrictEqual(emitOAuthFlows(matrix), []);
});

test('emitOAuthFlows: emits 3 token flows when tokenUrl present', () => {
  const matrix = {
    oauth: {
      detected: true,
      tokenUrl: '/api/v1/oauth/token',
      authorizeUrl: null,
      callbackUrl: null,
      source: 'endpoint-paths',
    },
  };
  const flows = emitOAuthFlows(matrix);
  assert.strictEqual(flows.length, 3);
  const ids = flows.map((f) => f.id).sort();
  assert.deepStrictEqual(ids, [
    'oauth:token:client-credentials',
    'oauth:token:invalid-grant',
    'oauth:token:missing-grant-type',
  ]);
  const invalidGrant = flows.find((f) => f.id === 'oauth:token:invalid-grant');
  assert.strictEqual(invalidGrant.steps[0].method, 'POST');
  assert.strictEqual(invalidGrant.steps[0].path, '/api/v1/oauth/token');
  assert.deepStrictEqual(invalidGrant.steps[1].statusAnyOf, [400, 401]);
});

test('emitOAuthFlows: emits 2 authorize flows when authorizeUrl present', () => {
  const matrix = {
    oauth: {
      detected: true,
      tokenUrl: null,
      authorizeUrl: '/api/v1/oauth/authorize',
      callbackUrl: null,
      source: 'endpoint-paths',
    },
  };
  const flows = emitOAuthFlows(matrix);
  assert.strictEqual(flows.length, 2);
  const reachable = flows.find((f) => f.id === 'oauth:authorize:reachable');
  assert.ok(reachable);
  assert.strictEqual(reachable.steps[0].method, 'GET');
  assert.deepStrictEqual(reachable.steps[1].statusAnyOf, [200, 302, 303]);
});

test('emitOAuthFlows: emits 3 callback flows when callbackUrl present', () => {
  const matrix = {
    oauth: {
      detected: true,
      tokenUrl: null,
      authorizeUrl: null,
      callbackUrl: '/api/v1/oauth/callback',
      source: 'endpoint-paths',
    },
  };
  const flows = emitOAuthFlows(matrix);
  assert.strictEqual(flows.length, 3);
  const noCode = flows.find((f) => f.id === 'oauth:callback:no-code');
  assert.ok(noCode);
  assert.deepStrictEqual(noCode.steps[1].statusAnyOf, [400, 401, 302]);
});

test('emitOAuthFlows: emits all 11 flows when all URLs present (including refresh)', () => {
  const matrix = {
    oauth: {
      detected: true,
      tokenUrl: '/api/v1/oauth/token',
      authorizeUrl: '/api/v1/oauth/authorize',
      callbackUrl: '/api/v1/oauth/callback',
      refreshUrl: '/api/v1/oauth/refresh',
      source: 'securityScheme:oauth2',
    },
  };
  const flows = emitOAuthFlows(matrix);
  assert.strictEqual(flows.length, 11);
  const ids = flows.map((f) => f.id).sort();
  assert.deepStrictEqual(ids, [
    'oauth:authorize:missing-client-id',
    'oauth:authorize:reachable',
    'oauth:callback:error-param',
    'oauth:callback:no-code',
    'oauth:callback:with-code',
    'oauth:refresh-token:happy',
    'oauth:refresh-token:invalid-grant',
    'oauth:refresh-token:missing-token',
    'oauth:token:client-credentials',
    'oauth:token:invalid-grant',
    'oauth:token:missing-grant-type',
  ]);
});

test('emitOAuthFlows: emits no refresh flows when refreshUrl is null', () => {
  const matrix = {
    oauth: {
      detected: true,
      tokenUrl: '/api/v1/oauth/token',
      authorizeUrl: null,
      callbackUrl: null,
      refreshUrl: null,
      source: 'endpoint-paths',
      roles: { authorize: null, token: null, callback: null, refresh: null },
    },
  };
  const flows = emitOAuthFlows(matrix);
  assert.ok(!flows.some((f) => f.id.includes('refresh-token')));
});

test('emitOAuthFlows: emits 3 refresh flows when roles.refresh is set', () => {
  const matrix = {
    oauth: {
      detected: true,
      tokenUrl: null,
      authorizeUrl: null,
      callbackUrl: null,
      refreshUrl: null,
      source: 'extension',
      roles: {
        authorize: null,
        token: null,
        callback: null,
        refresh: { method: 'POST', path: '/api/v1/oauth/refresh', source: 'extension' },
      },
    },
  };
  const flows = emitOAuthFlows(matrix);
  assert.strictEqual(flows.length, 3);
  const ids = flows.map((f) => f.id).sort();
  assert.deepStrictEqual(ids, [
    'oauth:refresh-token:happy',
    'oauth:refresh-token:invalid-grant',
    'oauth:refresh-token:missing-token',
  ]);
  const happy = flows.find((f) => f.id === 'oauth:refresh-token:happy');
  assert.strictEqual(happy.steps[0].method, 'POST');
  assert.strictEqual(happy.steps[0].path, '/api/v1/oauth/refresh');
  assert.strictEqual(happy.steps[0].body.grant_type, 'refresh_token');
  assert.ok(happy.steps[0].body.refresh_token);
});

test('emitOAuthFlows: refresh flow targets the canonical declared path (not heuristic)', () => {
  const matrix = {
    oauth: {
      detected: true,
      tokenUrl: null,
      authorizeUrl: null,
      callbackUrl: null,
      refreshUrl: '/api/v1/should-not-use',
      source: 'extension',
      roles: {
        authorize: null,
        token: null,
        callback: null,
        refresh: { method: 'POST', path: '/api/v1/declared-refresh', source: 'operationId' },
      },
    },
  };
  const flows = emitOAuthFlows(matrix);
  const happy = flows.find((f) => f.id === 'oauth:refresh-token:happy');
  assert.ok(happy);
  assert.strictEqual(happy.steps[0].path, '/api/v1/declared-refresh');
});

// ---------------------------------------------------------------------------
// emitTenantIsolationFlows
// ---------------------------------------------------------------------------

test('emitTenantIsolationFlows: returns empty when multiTenant not detected', () => {
  const matrix = { multiTenant: null };
  assert.deepStrictEqual(emitTenantIsolationFlows(matrix), []);
});

test('emitTenantIsolationFlows: returns empty when multiTenant.detected is false', () => {
  const matrix = { multiTenant: { detected: false } };
  assert.deepStrictEqual(emitTenantIsolationFlows(matrix), []);
});

test('emitTenantIsolationFlows: header strategy emits 3 flows targeting canonical declared endpoint', () => {
  const matrix = {
    multiTenant: {
      detected: true,
      strategy: 'header',
      headerName: 'X-Tenant-ID',
      canonicalEndpoint: { method: 'GET', path: '/api/v1/probe-ref/tenant/header-strategy' },
      source: 'declared-header:GET /api/v1/probe-ref/tenant/header-strategy',
    },
    apiEndpoints: [
      {
        method: 'GET',
        path: '/api/v1/probe-ref/tenant/header-strategy',
        authDecorators: { authRequired: true },
      },
      {
        method: 'GET',
        path: '/api/v1/probe-ref/auth-flows/me',
        authDecorators: { authRequired: true },
      },
    ],
  };
  const flows = emitTenantIsolationFlows(matrix);
  assert.strictEqual(flows.length, 3);
  const ids = flows.map((f) => f.id).sort();
  assert.deepStrictEqual(ids, [
    'tenant-isolation:header:cross-tenant:rejected',
    'tenant-isolation:header:missing:rejected',
    'tenant-isolation:header:tenant-a:access',
  ]);

  // All flows must target the canonical declared endpoint, NOT /auth-flows/me
  for (const flow of flows) {
    assert.strictEqual(flow.steps[0].path, '/api/v1/probe-ref/tenant/header-strategy',
      `flow ${flow.id} must target canonical declared endpoint`);
    assert.strictEqual(flow.steps[0].method, 'GET',
      `flow ${flow.id} must use canonical declared method`);
  }
});

test('emitTenantIsolationFlows: header strategy returns empty when canonicalEndpoint is null even if auth-required GET endpoints exist', () => {
  // This proves the heuristic is gone: auth-required endpoints in apiEndpoints
  // are IGNORED — only canonicalEndpoint from the detector is used.
  const matrix = {
    multiTenant: {
      detected: true,
      strategy: 'header',
      headerName: 'X-Tenant-ID',
      canonicalEndpoint: null,
      source: 'endpoint-header:GET /api/v1/projects',
    },
    apiEndpoints: [
      {
        method: 'GET',
        path: '/api/v1/projects',
        authDecorators: { authRequired: true },
      },
    ],
  };
  const flows = emitTenantIsolationFlows(matrix);
  assert.strictEqual(flows.length, 0);
});

test('emitTenantIsolationFlows: header strategy returns empty when canonicalEndpoint has no path', () => {
  const matrix = {
    multiTenant: {
      detected: true,
      strategy: 'header',
      headerName: 'X-Tenant-ID',
      canonicalEndpoint: { method: 'GET', path: null },
      source: 'endpoint-header:GET /api/v1/projects',
    },
    apiEndpoints: [],
  };
  const flows = emitTenantIsolationFlows(matrix);
  assert.strictEqual(flows.length, 0);
});

test('emitTenantIsolationFlows: extension strategy emits 3 flows when canonicalEndpoint and headerName both declared', () => {
  const matrix = {
    multiTenant: {
      detected: true,
      strategy: 'extension',
      headerName: 'x-tenant-id',
      canonicalEndpoint: { method: 'GET', path: '/api/v1/probe-ref/tenant/extension-strategy' },
      source: 'extension:GET /api/v1/probe-ref/tenant/extension-strategy',
    },
    apiEndpoints: [
      {
        method: 'GET',
        path: '/api/v1/probe-ref/tenant/extension-strategy',
        authDecorators: { authRequired: true },
      },
    ],
  };
  const flows = emitTenantIsolationFlows(matrix);
  assert.strictEqual(flows.length, 3);
  const ids = flows.map((f) => f.id).sort();
  assert.deepStrictEqual(ids, [
    'tenant-isolation:header:cross-tenant:rejected',
    'tenant-isolation:header:missing:rejected',
    'tenant-isolation:header:tenant-a:access',
  ]);

  // All flows target the canonical declared endpoint
  for (const flow of flows) {
    assert.strictEqual(flow.steps[0].path, '/api/v1/probe-ref/tenant/extension-strategy',
      `flow ${flow.id} must target canonical declared endpoint`);
    assert.strictEqual(flow.steps[0].method, 'GET',
      `flow ${flow.id} must use canonical declared method`);
  }

  // Tenant-a flow sends the declared header
  const tenantA = flows.find((f) => f.id.includes('tenant-a:access'));
  assert.strictEqual(tenantA.steps[0].headers['x-tenant-id'], 'tenant-probe-a');
});

test('emitTenantIsolationFlows: extension strategy returns empty when canonicalEndpoint is null', () => {
  const matrix = {
    multiTenant: {
      detected: true,
      strategy: 'extension',
      headerName: 'x-tenant-id',
      canonicalEndpoint: null,
      source: 'extension:document',
    },
    apiEndpoints: [],
  };
  const flows = emitTenantIsolationFlows(matrix);
  assert.strictEqual(flows.length, 0);
});

test('emitTenantIsolationFlows: extension strategy returns empty when headerName is null', () => {
  const matrix = {
    multiTenant: {
      detected: true,
      strategy: 'extension',
      headerName: null,
      canonicalEndpoint: { method: 'GET', path: '/api/v1/probe-ref/tenant/ext' },
      source: 'extension:GET /api/v1/probe-ref/tenant/ext',
    },
    apiEndpoints: [],
  };
  const flows = emitTenantIsolationFlows(matrix);
  assert.strictEqual(flows.length, 0);
});
