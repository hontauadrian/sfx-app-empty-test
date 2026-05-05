'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  emitCsrfFlows,
  resolveCsrfSchemeHeaderName,
  resolveEndpointCsrfHeaderName,
  csrfCoveredStatuses,
} = require('../flows-generator');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMatrix({ csrf, apiEndpoints, securitySchemes, responseEnvelope } = {}) {
  return {
    csrf: csrf || { detected: true, source: 'securityScheme:csrfScheme' },
    apiEndpoints: apiEndpoints || [],
    securitySchemes: securitySchemes || {
      csrfScheme: { type: 'apiKey', in: 'header', name: 'x-probe-csrf-token' },
    },
    responseEnvelope: responseEnvelope !== undefined ? responseEnvelope : {
      wrapper: 'data',
      source: 'apps/api/src/common/interceptors/transform.interceptor.ts',
    },
  };
}

function csrfPostEndpoint(path, headerName, extras = {}) {
  return {
    method: 'POST',
    path,
    securityRequirement: [{ csrfScheme: [] }],
    parameters: headerName ? [{ in: 'header', name: headerName }] : [],
    swaggerDeclared: { statuses: [200], parameters: [], extensions: {} },
    ...extras,
  };
}

// ---------------------------------------------------------------------------
// resolveCsrfSchemeHeaderName
// ---------------------------------------------------------------------------

test('resolveCsrfSchemeHeaderName: returns header name from csrf apiKey scheme', () => {
  const schemes = {
    csrfScheme: { type: 'apiKey', in: 'header', name: 'x-csrf-token' },
  };
  assert.strictEqual(resolveCsrfSchemeHeaderName(schemes), 'x-csrf-token');
});

test('resolveCsrfSchemeHeaderName: returns null when no csrf scheme exists', () => {
  const schemes = {
    bearer: { type: 'http', scheme: 'bearer' },
  };
  assert.strictEqual(resolveCsrfSchemeHeaderName(schemes), null);
});

test('resolveCsrfSchemeHeaderName: returns null when securitySchemes is null', () => {
  assert.strictEqual(resolveCsrfSchemeHeaderName(null), null);
});

test('resolveCsrfSchemeHeaderName: matches xsrf scheme name (case-insensitive)', () => {
  const schemes = {
    XsrfProtection: { type: 'apiKey', in: 'header', name: 'x-xsrf-token' },
  };
  assert.strictEqual(resolveCsrfSchemeHeaderName(schemes), 'x-xsrf-token');
});

test('resolveCsrfSchemeHeaderName: skips non-apiKey schemes', () => {
  const schemes = {
    csrfScheme: { type: 'http', in: 'header', name: 'x-csrf-token' },
  };
  assert.strictEqual(resolveCsrfSchemeHeaderName(schemes), null);
});

test('resolveCsrfSchemeHeaderName: skips apiKey schemes not in header', () => {
  const schemes = {
    csrfScheme: { type: 'apiKey', in: 'query', name: 'csrf_token' },
  };
  assert.strictEqual(resolveCsrfSchemeHeaderName(schemes), null);
});

// ---------------------------------------------------------------------------
// resolveEndpointCsrfHeaderName
// ---------------------------------------------------------------------------

test('resolveEndpointCsrfHeaderName: returns header name from ep.parameters', () => {
  const ep = {
    parameters: [{ in: 'header', name: 'x-csrf-token-alpha' }],
  };
  assert.strictEqual(resolveEndpointCsrfHeaderName(ep), 'x-csrf-token-alpha');
});

test('resolveEndpointCsrfHeaderName: returns header name from swaggerDeclared.parameters', () => {
  const ep = {
    parameters: [],
    swaggerDeclared: {
      parameters: [{ in: 'header', name: 'x-csrf-token-beta' }],
    },
  };
  assert.strictEqual(resolveEndpointCsrfHeaderName(ep), 'x-csrf-token-beta');
});

test('resolveEndpointCsrfHeaderName: returns null when no header params exist', () => {
  const ep = {
    parameters: [{ in: 'query', name: 'page' }],
  };
  assert.strictEqual(resolveEndpointCsrfHeaderName(ep), null);
});

test('resolveEndpointCsrfHeaderName: returns null when parameters is undefined', () => {
  const ep = {};
  assert.strictEqual(resolveEndpointCsrfHeaderName(ep), null);
});

test('resolveEndpointCsrfHeaderName: prefers direct parameters over swaggerDeclared', () => {
  const ep = {
    parameters: [{ in: 'header', name: 'x-direct-header' }],
    swaggerDeclared: {
      parameters: [{ in: 'header', name: 'x-swagger-header' }],
    },
  };
  assert.strictEqual(resolveEndpointCsrfHeaderName(ep), 'x-direct-header');
});

// ---------------------------------------------------------------------------
// emitCsrfFlows
// ---------------------------------------------------------------------------

test('emitCsrfFlows: returns empty when csrf not detected', () => {
  const matrix = makeMatrix({ csrf: { detected: false } });
  assert.deepStrictEqual(emitCsrfFlows(matrix), []);
});

test('emitCsrfFlows: returns empty when no POST endpoints have csrf securityRequirement', () => {
  const matrix = makeMatrix({
    apiEndpoints: [
      { method: 'GET', path: '/api/v1/token', securityRequirement: [] },
    ],
  });
  assert.deepStrictEqual(emitCsrfFlows(matrix), []);
});

test('emitCsrfFlows: emits missing-token + invalid-token for each csrf-protected endpoint', () => {
  const matrix = makeMatrix({
    csrf: { detected: true, source: 'securityScheme:csrfScheme', tokenEndpoint: null },
    apiEndpoints: [
      csrfPostEndpoint('/api/v1/action-a', 'x-csrf-a'),
      csrfPostEndpoint('/api/v1/action-b', 'x-csrf-b'),
    ],
  });

  const flows = emitCsrfFlows(matrix);

  // No tokenEndpoint -> no happy flows, but missing-token + invalid-token per endpoint
  assert.strictEqual(flows.length, 4);

  // Endpoint A
  const missingA = flows.find((f) => f.id.includes('action-a') && f.id.includes('missing-token'));
  assert.ok(missingA, 'should have missing-token flow for action-a');
  assert.strictEqual(missingA.steps[0].method, 'POST');
  assert.strictEqual(missingA.steps[0].path, '/api/v1/action-a');
  assert.strictEqual(missingA.steps[1].status, 403);

  const invalidA = flows.find((f) => f.id.includes('action-a') && f.id.includes('invalid-token'));
  assert.ok(invalidA, 'should have invalid-token flow for action-a');
  assert.strictEqual(invalidA.steps[0].headers['x-csrf-a'], 'invalid-token-probe-12345');
  assert.strictEqual(invalidA.steps[1].status, 403);

  // Endpoint B
  const missingB = flows.find((f) => f.id.includes('action-b') && f.id.includes('missing-token'));
  assert.ok(missingB, 'should have missing-token flow for action-b');

  const invalidB = flows.find((f) => f.id.includes('action-b') && f.id.includes('invalid-token'));
  assert.ok(invalidB, 'should have invalid-token flow for action-b');
  assert.strictEqual(invalidB.steps[0].headers['x-csrf-b'], 'invalid-token-probe-12345');
});

test('emitCsrfFlows: emits happy + missing-token + invalid-token when tokenEndpoint and tokenField available', () => {
  const matrix = makeMatrix({
    csrf: {
      detected: true,
      source: 'securityScheme:csrfScheme',
      tokenEndpoint: { method: 'GET', path: '/api/v1/csrf-token', tokenField: 'csrfToken' },
      tokenHeaderName: 'x-csrf-token',
    },
    apiEndpoints: [
      csrfPostEndpoint('/api/v1/protected', 'x-csrf-token'),
    ],
  });

  const flows = emitCsrfFlows(matrix);
  assert.strictEqual(flows.length, 3);

  const happy = flows.find((f) => f.id.includes('consume:happy'));
  assert.ok(happy, 'should have consume:happy flow');
  assert.strictEqual(happy.steps[0].method, 'GET');
  assert.strictEqual(happy.steps[0].path, '/api/v1/csrf-token');
  assert.strictEqual(happy.steps[2].bindings.csrfToken, '$.data.csrfToken');
  assert.strictEqual(happy.steps[3].headers['x-csrf-token'], '${csrfToken}');

  const missing = flows.find((f) => f.id.includes('consume:missing-token'));
  assert.ok(missing, 'should have consume:missing-token flow');

  const invalid = flows.find((f) => f.id.includes('consume:invalid-token'));
  assert.ok(invalid, 'should have consume:invalid-token flow');
});

test('emitCsrfFlows: falls back to securityScheme header when endpoint has no header param', () => {
  const matrix = makeMatrix({
    csrf: { detected: true, source: 'securityScheme:csrfScheme', tokenEndpoint: null },
    apiEndpoints: [
      csrfPostEndpoint('/api/v1/no-header-param', null),
    ],
  });

  const flows = emitCsrfFlows(matrix);
  assert.strictEqual(flows.length, 2);

  const invalid = flows.find((f) => f.id.includes('invalid-token'));
  assert.ok(invalid, 'should have invalid-token flow');
  // Falls back to scheme header name 'x-probe-csrf-token'
  assert.strictEqual(invalid.steps[0].headers['x-probe-csrf-token'], 'invalid-token-probe-12345');
});

test('emitCsrfFlows: skips endpoint when no header name can be resolved', () => {
  const matrix = makeMatrix({
    csrf: { detected: true, source: 'other', tokenEndpoint: null },
    apiEndpoints: [
      csrfPostEndpoint('/api/v1/no-header', null),
    ],
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
  });

  const flows = emitCsrfFlows(matrix);
  assert.strictEqual(flows.length, 0);
});

test('emitCsrfFlows: uses per-endpoint header name even when different across endpoints', () => {
  const matrix = makeMatrix({
    csrf: { detected: true, source: 'securityScheme:csrfScheme', tokenEndpoint: null },
    apiEndpoints: [
      csrfPostEndpoint('/api/v1/ep-alpha', 'x-csrf-token-alpha'),
      csrfPostEndpoint('/api/v1/ep-beta', 'x-csrf-token-beta'),
    ],
  });

  const flows = emitCsrfFlows(matrix);

  const invalidAlpha = flows.find((f) => f.id.includes('ep-alpha') && f.id.includes('invalid-token'));
  assert.strictEqual(invalidAlpha.steps[0].headers['x-csrf-token-alpha'], 'invalid-token-probe-12345');

  const invalidBeta = flows.find((f) => f.id.includes('ep-beta') && f.id.includes('invalid-token'));
  assert.strictEqual(invalidBeta.steps[0].headers['x-csrf-token-beta'], 'invalid-token-probe-12345');
});

test('emitCsrfFlows: sets contract kind to csrf-protection', () => {
  const matrix = makeMatrix({
    csrf: { detected: true, source: 'securityScheme:csrfScheme', tokenEndpoint: null },
    apiEndpoints: [
      csrfPostEndpoint('/api/v1/action', 'x-csrf'),
    ],
  });

  const flows = emitCsrfFlows(matrix);
  for (const flow of flows) {
    assert.strictEqual(flow.contract.kind, 'csrf-protection');
  }
});

test('emitCsrfFlows: uses envelope-wrapped capture path from matrix.responseEnvelope.wrapper', () => {
  const matrix = makeMatrix({
    csrf: {
      detected: true,
      source: 'securityScheme:csrfScheme',
      tokenEndpoint: { method: 'GET', path: '/api/v1/csrf-token', tokenField: 'csrfToken' },
    },
    apiEndpoints: [
      csrfPostEndpoint('/api/v1/protected', 'x-csrf-token'),
    ],
    responseEnvelope: { wrapper: 'data', source: 'test' },
  });

  const flows = emitCsrfFlows(matrix);
  const happy = flows.find((f) => f.id.includes('consume:happy'));
  assert.strictEqual(happy.steps[2].bindings.csrfToken, '$.data.csrfToken');
});

test('emitCsrfFlows: uses bare capture path when responseEnvelope has no wrapper', () => {
  const matrix = makeMatrix({
    csrf: {
      detected: true,
      source: 'securityScheme:csrfScheme',
      tokenEndpoint: { method: 'GET', path: '/api/v1/csrf-token', tokenField: 'csrfToken' },
    },
    apiEndpoints: [
      csrfPostEndpoint('/api/v1/protected', 'x-csrf-token'),
    ],
    responseEnvelope: { wrapper: null, source: 'test' },
  });

  const flows = emitCsrfFlows(matrix);
  const happy = flows.find((f) => f.id.includes('consume:happy'));
  assert.strictEqual(happy.steps[2].bindings.csrfToken, '$.csrfToken');
});

test('emitCsrfFlows: uses bare capture path when responseEnvelope is null', () => {
  const matrix = makeMatrix({
    csrf: {
      detected: true,
      source: 'securityScheme:csrfScheme',
      tokenEndpoint: { method: 'GET', path: '/api/v1/csrf-token', tokenField: 'csrfToken' },
    },
    apiEndpoints: [
      csrfPostEndpoint('/api/v1/protected', 'x-csrf-token'),
    ],
    responseEnvelope: null,
  });

  const flows = emitCsrfFlows(matrix);
  const happy = flows.find((f) => f.id.includes('consume:happy'));
  assert.strictEqual(happy.steps[2].bindings.csrfToken, '$.csrfToken');
});

test('emitCsrfFlows: does not emit happy flow when tokenEndpoint exists but tokenField is null', () => {
  const matrix = makeMatrix({
    csrf: {
      detected: true,
      source: 'securityScheme:csrfScheme',
      tokenEndpoint: { method: 'GET', path: '/api/v1/csrf-token', tokenField: null },
    },
    apiEndpoints: [
      csrfPostEndpoint('/api/v1/protected', 'x-csrf-token'),
    ],
  });

  const flows = emitCsrfFlows(matrix);
  // Only missing-token + invalid-token (no happy because tokenField is null)
  assert.strictEqual(flows.length, 2);
  assert.ok(flows.every((f) => !f.id.includes('consume:happy')));
});

// ---------------------------------------------------------------------------
// csrfCoveredStatuses
// ---------------------------------------------------------------------------

test('csrfCoveredStatuses: returns empty map when csrf not detected', () => {
  const matrix = makeMatrix({ csrf: { detected: false } });
  const result = csrfCoveredStatuses(matrix);
  assert.strictEqual(result.size, 0);
});

test('csrfCoveredStatuses: returns empty map when matrix is null', () => {
  assert.strictEqual(csrfCoveredStatuses(null).size, 0);
});

test('csrfCoveredStatuses: returns 403 for endpoints without tokenEndpoint', () => {
  const matrix = makeMatrix({
    csrf: { detected: true, source: 'securityScheme:csrfScheme', tokenEndpoint: null },
    apiEndpoints: [
      csrfPostEndpoint('/api/v1/action', 'x-csrf-token'),
    ],
  });

  const result = csrfCoveredStatuses(matrix);
  assert.strictEqual(result.size, 1);
  const statuses = result.get('POST /api/v1/action');
  assert.ok(statuses, 'should have statuses for POST /api/v1/action');
  assert.ok(statuses.has(403));
  assert.ok(!statuses.has(200));
});

test('csrfCoveredStatuses: returns 200 and 403 when tokenEndpoint with tokenField exists', () => {
  const matrix = makeMatrix({
    csrf: {
      detected: true,
      source: 'securityScheme:csrfScheme',
      tokenEndpoint: { method: 'GET', path: '/api/v1/csrf-token', tokenField: 'csrfToken' },
    },
    apiEndpoints: [
      csrfPostEndpoint('/api/v1/action', 'x-csrf-token'),
    ],
  });

  const result = csrfCoveredStatuses(matrix);
  const statuses = result.get('POST /api/v1/action');
  assert.ok(statuses, 'should have statuses for POST /api/v1/action');
  assert.ok(statuses.has(200));
  assert.ok(statuses.has(403));
});

test('csrfCoveredStatuses: covers multiple endpoints independently', () => {
  const matrix = makeMatrix({
    csrf: {
      detected: true,
      source: 'securityScheme:csrfScheme',
      tokenEndpoint: { method: 'GET', path: '/api/v1/csrf-token', tokenField: 'csrfToken' },
    },
    apiEndpoints: [
      csrfPostEndpoint('/api/v1/action-a', 'x-csrf-a'),
      csrfPostEndpoint('/api/v1/action-b', 'x-csrf-b'),
    ],
  });

  const result = csrfCoveredStatuses(matrix);
  assert.strictEqual(result.size, 2);
  assert.ok(result.get('POST /api/v1/action-a').has(200));
  assert.ok(result.get('POST /api/v1/action-b').has(200));
});

test('csrfCoveredStatuses: skips endpoints where no header name can be resolved', () => {
  const matrix = makeMatrix({
    csrf: { detected: true, source: 'other', tokenEndpoint: null },
    apiEndpoints: [
      csrfPostEndpoint('/api/v1/no-header', null),
    ],
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
  });

  const result = csrfCoveredStatuses(matrix);
  assert.strictEqual(result.size, 0);
});

test('csrfCoveredStatuses: does not include non-CSRF POST endpoints', () => {
  const matrix = makeMatrix({
    csrf: { detected: true, source: 'securityScheme:csrfScheme', tokenEndpoint: null },
    apiEndpoints: [
      { method: 'POST', path: '/api/v1/plain', securityRequirement: [{ bearer: [] }], parameters: [] },
    ],
  });

  const result = csrfCoveredStatuses(matrix);
  assert.strictEqual(result.size, 0);
});
