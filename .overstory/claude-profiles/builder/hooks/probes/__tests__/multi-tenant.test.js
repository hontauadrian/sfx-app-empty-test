'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  collectExtensionCandidates,
  resolveTenancyScope,
} = require('../detectors/multi-tenant');

// ---------------------------------------------------------------------------
// collectExtensionCandidates — endpointRef + headerName enrichment
// ---------------------------------------------------------------------------

test('collectExtensionCandidates: per-endpoint extension captures endpointRef and headerName from x-multi-tenant-header', () => {
  const matrix = {
    apiEndpoints: [
      {
        method: 'GET',
        path: '/api/v1/tenant/ext',
        'x-multi-tenant': true,
        'x-multi-tenant-header': 'x-tenant-id',
      },
    ],
  };
  const candidates = collectExtensionCandidates(matrix);
  assert.strictEqual(candidates.length, 1);
  assert.deepStrictEqual(candidates[0].endpointRef, { method: 'GET', path: '/api/v1/tenant/ext' });
  assert.strictEqual(candidates[0].headerName, 'x-tenant-id');
  assert.strictEqual(candidates[0].endpoint, 'GET /api/v1/tenant/ext');
});

test('collectExtensionCandidates: per-endpoint extension without x-multi-tenant-header has headerName null', () => {
  const matrix = {
    apiEndpoints: [
      {
        method: 'GET',
        path: '/api/v1/tenant/ext-no-header',
        'x-multi-tenant': true,
      },
    ],
  };
  const candidates = collectExtensionCandidates(matrix);
  assert.strictEqual(candidates.length, 1);
  assert.deepStrictEqual(candidates[0].endpointRef, { method: 'GET', path: '/api/v1/tenant/ext-no-header' });
  assert.strictEqual(candidates[0].headerName, null);
});

test('collectExtensionCandidates: document-level extension has endpointRef null and headerName null', () => {
  const matrix = {
    'x-multi-tenant': true,
    apiEndpoints: [],
  };
  const candidates = collectExtensionCandidates(matrix);
  assert.strictEqual(candidates.length, 1);
  assert.strictEqual(candidates[0].endpointRef, null);
  assert.strictEqual(candidates[0].headerName, null);
  assert.strictEqual(candidates[0].endpoint, null);
});

test('collectExtensionCandidates: reads x-multi-tenant-header from swaggerDeclared.extensions', () => {
  const matrix = {
    apiEndpoints: [
      {
        method: 'POST',
        path: '/api/v1/tenant/nested',
        swaggerDeclared: {
          extensions: {
            'x-multi-tenant': true,
            'x-multi-tenant-header': 'x-org-id',
          },
        },
      },
    ],
  };
  const candidates = collectExtensionCandidates(matrix);
  assert.strictEqual(candidates.length, 1);
  assert.strictEqual(candidates[0].headerName, 'x-org-id');
  assert.deepStrictEqual(candidates[0].endpointRef, { method: 'POST', path: '/api/v1/tenant/nested' });
});

// ---------------------------------------------------------------------------
// resolveTenancyScope — extension strategy resolution
// ---------------------------------------------------------------------------

test('resolveTenancyScope: extension with endpointRef + headerName resolves strategy=extension', () => {
  const matrix = {
    apiEndpoints: [
      {
        method: 'GET',
        path: '/api/v1/tenant/ext',
        'x-multi-tenant': true,
        'x-multi-tenant-header': 'x-tenant-id',
      },
    ],
  };
  const diag = [];
  // projectDir with no source files so decorator scan returns null
  const result = resolveTenancyScope(matrix, '/nonexistent', diag);
  assert.ok(result, 'should resolve');
  assert.strictEqual(result.strategy, 'extension');
  assert.strictEqual(result.headerName, 'x-tenant-id');
  assert.deepStrictEqual(result.canonicalEndpoint, { method: 'GET', path: '/api/v1/tenant/ext' });
  assert.strictEqual(diag.length, 0);
});

test('resolveTenancyScope: extension without x-multi-tenant-header emits TENANCY_EXTENSION_HEADER_UNDECLARED', () => {
  const matrix = {
    apiEndpoints: [
      {
        method: 'GET',
        path: '/api/v1/tenant/ext-no-header',
        'x-multi-tenant': true,
      },
    ],
  };
  const diag = [];
  const result = resolveTenancyScope(matrix, '/nonexistent', diag);
  assert.strictEqual(result, null, 'should return null when header undeclared');
  assert.strictEqual(diag.length, 1);
  assert.strictEqual(diag[0].code, 'TENANCY_EXTENSION_HEADER_UNDECLARED');
  assert.ok(diag[0].reason.includes('x-multi-tenant-header'));
});

test('resolveTenancyScope: document-level extension emits TENANCY_EXTENSION_DOCUMENT_SCOPE_UNRESOLVED', () => {
  const matrix = {
    'x-multi-tenant': true,
    apiEndpoints: [],
  };
  const diag = [];
  const result = resolveTenancyScope(matrix, '/nonexistent', diag);
  assert.strictEqual(result, null, 'should return null for document-level');
  assert.strictEqual(diag.length, 1);
  assert.strictEqual(diag[0].code, 'TENANCY_EXTENSION_DOCUMENT_SCOPE_UNRESOLVED');
});

test('resolveTenancyScope: header candidate still wins over extension on same endpoint', () => {
  const matrix = {
    apiEndpoints: [
      {
        method: 'GET',
        path: '/api/v1/tenant/reinforced',
        'x-multi-tenant': true,
        'x-multi-tenant-header': 'x-tenant-id',
        parameters: [{ in: 'header', name: 'x-tenant-id' }],
      },
    ],
  };
  const diag = [];
  const result = resolveTenancyScope(matrix, '/nonexistent', diag);
  assert.ok(result);
  // Header wins priority over extension (both on same endpoint = reinforcement)
  assert.strictEqual(result.strategy, 'header');
  assert.strictEqual(result.headerName, 'x-tenant-id');
  assert.strictEqual(diag.length, 0);
});
