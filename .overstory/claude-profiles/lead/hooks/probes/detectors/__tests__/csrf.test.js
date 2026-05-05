'use strict';

// Tests for detectors/csrf.js — declaration-driven detection.
//
// ROLE selection (which endpoint issues CSRF tokens): canonical declarations
// only — `csrf:issuer` SetMetadata, `x-csrf-issues-token` extension, or the
// canonical operationId `'csrfToken'`. NO path regex.
//
// FIELD/HEADER NAME extraction: pure introspection — read the project's
// declared response schema and header parameters verbatim. snake_case,
// camelCase, anything — the probe adapts.
//
// Run directly: `node --test detectors/__tests__/csrf.test.js`

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  detectCsrf,
  scanPackageDeps,
  scanMiddleware,
  scanOpenApiSchemes,
  scanEndpointHeaders,
  findTokenEndpoint,
  pickTokenField,
  pickHeaderName,
  CSRF_ISSUER,
} = require('../csrf');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csrf-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEndpoint(overrides) {
  return {
    file: 'test.controller.ts',
    method: 'GET',
    path: '/api/v1/test',
    framework: 'nest',
    operationId: null,
    responseContract: null,
    securityRequirement: [],
    parameters: [],
    swaggerDeclared: { tags: [], statuses: [200], parameters: [] },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// scanPackageDeps (orthogonal to role detection — kept for library presence)
// ---------------------------------------------------------------------------

describe('scanPackageDeps', () => {
  it('detects csurf in root package.json', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { csurf: '1.0.0' } }),
    );
    const result = scanPackageDeps(tmpDir);
    assert.notEqual(result, null);
    assert.equal(result.library, 'csurf');
  });

  it('returns null when no CSRF package present', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({}));
    assert.equal(scanPackageDeps(tmpDir), null);
  });

  it('handles malformed package.json gracefully', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), 'not json');
    assert.equal(scanPackageDeps(tmpDir), null);
  });
});

// ---------------------------------------------------------------------------
// scanMiddleware
// ---------------------------------------------------------------------------

describe('scanMiddleware', () => {
  it('detects csurf() middleware in apps/api/src/main.ts', () => {
    fs.mkdirSync(path.join(tmpDir, 'apps/api/src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'apps/api/src/main.ts'), 'app.use(csurf());');
    const result = scanMiddleware(tmpDir);
    assert.notEqual(result, null);
    assert.equal(result.library, 'csurf');
  });

  it('returns null when no middleware present', () => {
    fs.mkdirSync(path.join(tmpDir, 'apps/api/src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'apps/api/src/main.ts'), 'app.use(helmet());');
    assert.equal(scanMiddleware(tmpDir), null);
  });
});

// ---------------------------------------------------------------------------
// scanOpenApiSchemes — schemeName carries the CSRF role flag, scheme.name is
// the header name VERBATIM
// ---------------------------------------------------------------------------

describe('scanOpenApiSchemes', () => {
  it('detects apiKey-in-header CSRF scheme; reads header name verbatim', () => {
    const matrix = {
      securitySchemes: {
        csrfToken: { type: 'apiKey', in: 'header', name: 'x-csrf-token' },
      },
    };
    const result = scanOpenApiSchemes(matrix);
    assert.equal(result.tokenHeaderName, 'x-csrf-token');
    assert.equal(result.schemeName, 'csrfToken');
  });

  it('reads alternate header names verbatim (csrf-token)', () => {
    const matrix = {
      securitySchemes: {
        csrf: { type: 'apiKey', in: 'header', name: 'csrf-token' },
      },
    };
    const result = scanOpenApiSchemes(matrix);
    assert.equal(result.tokenHeaderName, 'csrf-token');
  });

  it('reads alternate header names verbatim (X-XSRF, name only)', () => {
    const matrix = {
      securitySchemes: {
        xsrf: { type: 'apiKey', in: 'header', name: 'X-XSRF' },
      },
    };
    const result = scanOpenApiSchemes(matrix);
    assert.equal(result.tokenHeaderName, 'X-XSRF');
  });

  it('skips non-apiKey schemes', () => {
    const matrix = { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } };
    assert.equal(scanOpenApiSchemes(matrix), null);
  });

  it('skips apiKey-in-query', () => {
    const matrix = {
      securitySchemes: {
        csrf: { type: 'apiKey', in: 'query', name: 'csrf' },
      },
    };
    assert.equal(scanOpenApiSchemes(matrix), null);
  });
});

// ---------------------------------------------------------------------------
// findTokenEndpoint — Layer 1: declaration-driven role detection
// ---------------------------------------------------------------------------

describe('findTokenEndpoint — Layer 1 role detection', () => {
  it('detects via @SetMetadata(\'csrf:issuer\', true) (matrix-passed flag)', () => {
    const matrix = {
      apiEndpoints: [
        makeEndpoint({ path: '/api/v1/security/token', 'csrf:issuer': true }),
      ],
    };
    const diag = [];
    const result = findTokenEndpoint(matrix, diag);
    assert.equal(result.path, '/api/v1/security/token');
    assert.equal(result.source, 'set-metadata');
    assert.equal(diag.length, 0);
  });

  it('detects via OpenAPI extension x-csrf-issues-token: true', () => {
    const matrix = {
      apiEndpoints: [
        makeEndpoint({ path: '/some/arbitrary/path', 'x-csrf-issues-token': true }),
      ],
    };
    const diag = [];
    const result = findTokenEndpoint(matrix, diag);
    assert.equal(result.path, '/some/arbitrary/path');
    assert.equal(result.source, 'extension');
    assert.equal(diag.length, 0);
  });

  it('detects via canonical operationId csrfToken', () => {
    const matrix = {
      apiEndpoints: [
        makeEndpoint({ path: '/yet/another/path', operationId: 'csrfToken' }),
      ],
    };
    const diag = [];
    const result = findTokenEndpoint(matrix, diag);
    assert.equal(result.path, '/yet/another/path');
    assert.equal(result.source, 'operationId');
    assert.equal(diag.length, 0);
  });

  it('returns null when 0 endpoints carry any role declaration', () => {
    const matrix = {
      apiEndpoints: [
        makeEndpoint({ path: '/api/v1/users', operationId: 'getUsers' }),
        makeEndpoint({ method: 'POST', path: '/api/v1/login', operationId: 'authLogin' }),
      ],
    };
    const diag = [];
    const result = findTokenEndpoint(matrix, diag);
    assert.equal(result, null);
    assert.equal(diag.length, 0);
  });

  it('returns null + DIAG CSRF_ISSUER_AMBIGUOUS when >1 endpoints declare', () => {
    const matrix = {
      apiEndpoints: [
        makeEndpoint({ path: '/csrf-a', operationId: 'csrfToken' }),
        makeEndpoint({ path: '/csrf-b', 'x-csrf-issues-token': true }),
      ],
    };
    const diag = [];
    const result = findTokenEndpoint(matrix, diag);
    assert.equal(result, null);
    assert.equal(diag.length, 1);
    assert.equal(diag[0].code, 'CSRF_ISSUER_AMBIGUOUS');
    assert.equal(diag[0].candidates.length, 2);
  });

  it('NEVER matches by path regex — /api/v1/csrf-token without declarations is silent', () => {
    const matrix = {
      apiEndpoints: [
        makeEndpoint({ path: '/api/v1/csrf-token' }),       // no operationId, no extension, no SetMetadata
        makeEndpoint({ path: '/api/v1/csrf_token' }),       // ditto
        makeEndpoint({ path: '/csrf-token' }),              // ditto
      ],
    };
    const diag = [];
    const result = findTokenEndpoint(matrix, diag);
    assert.equal(result, null, 'path regex must NOT trigger detection');
    assert.equal(diag.length, 0, 'silent when no declarations exist');
  });

  it('an endpoint with multiple signals on the SAME endpoint is counted once', () => {
    const matrix = {
      apiEndpoints: [
        makeEndpoint({
          path: '/csrf',
          operationId: 'csrfToken',
          'x-csrf-issues-token': true,
          'csrf:issuer': true,
        }),
      ],
    };
    const diag = [];
    const result = findTokenEndpoint(matrix, diag);
    assert.equal(result.path, '/csrf');
    // SetMetadata wins (priority order); count is 1 → no AMBIGUOUS DIAG.
    assert.equal(result.source, 'set-metadata');
    assert.equal(diag.length, 0);
  });

  it('false x-csrf-issues-token does not trigger detection', () => {
    const matrix = {
      apiEndpoints: [
        makeEndpoint({ path: '/csrf', 'x-csrf-issues-token': false }),
      ],
    };
    const result = findTokenEndpoint(matrix);
    assert.equal(result, null);
  });

  it('non-canonical operationId (substring match) does NOT trigger', () => {
    const matrix = {
      apiEndpoints: [
        makeEndpoint({ path: '/x', operationId: 'getCsrfToken' }),  // not exact
        makeEndpoint({ path: '/y', operationId: 'fetchCsrfToken' }), // not exact
      ],
    };
    const diag = [];
    const result = findTokenEndpoint(matrix, diag);
    assert.equal(result, null);
    assert.equal(diag.length, 0);
  });
});

// ---------------------------------------------------------------------------
// pickTokenField — Layer 2: response-schema introspection (verbatim)
// ---------------------------------------------------------------------------

describe('pickTokenField — Layer 2 token field name introspection', () => {
  it('extracts snake_case csrf_token verbatim (single string field)', () => {
    const ep = makeEndpoint({
      operationId: 'csrfToken',
      responseContract: { fields: [{ name: 'csrf_token', type: 'string' }] },
    });
    const diag = [];
    assert.equal(pickTokenField(ep, diag), 'csrf_token');
    assert.equal(diag.length, 0);
  });

  it('extracts camelCase csrfToken verbatim (single string field)', () => {
    const ep = makeEndpoint({
      operationId: 'csrfToken',
      responseContract: { fields: [{ name: 'csrfToken', type: 'string' }] },
    });
    const diag = [];
    assert.equal(pickTokenField(ep, diag), 'csrfToken');
    assert.equal(diag.length, 0);
  });

  it('extracts short name `token` verbatim (single string field)', () => {
    const ep = makeEndpoint({
      operationId: 'csrfToken',
      responseContract: { fields: [{ name: 'token', type: 'string' }] },
    });
    const diag = [];
    assert.equal(pickTokenField(ep, diag), 'token');
    assert.equal(diag.length, 0);
  });

  it('extracts `xsrf` verbatim (single string field)', () => {
    const ep = makeEndpoint({
      operationId: 'csrfToken',
      responseContract: { fields: [{ name: 'xsrf', type: 'string' }] },
    });
    const diag = [];
    assert.equal(pickTokenField(ep, diag), 'xsrf');
    assert.equal(diag.length, 0);
  });

  it('multi-field response → DIAG CSRF_TOKEN_FIELD_AMBIGUOUS, returns null', () => {
    const ep = makeEndpoint({
      method: 'GET',
      path: '/csrf',
      operationId: 'csrfToken',
      responseContract: {
        fields: [
          { name: 'token', type: 'string' },
          { name: 'expires', type: 'string' },
        ],
      },
    });
    const diag = [];
    assert.equal(pickTokenField(ep, diag), null);
    assert.equal(diag.length, 1);
    assert.equal(diag[0].code, 'CSRF_TOKEN_FIELD_AMBIGUOUS');
  });

  it('zero string fields (empty fields[]) but schema declared → DIAG UNDETECTED', () => {
    const ep = makeEndpoint({
      method: 'GET',
      path: '/csrf',
      operationId: 'csrfToken',
      responseContract: { fields: [] },
    });
    const diag = [];
    assert.equal(pickTokenField(ep, diag), null);
    assert.equal(diag.length, 1);
    assert.equal(diag[0].code, 'CSRF_TOKEN_FIELD_UNDETECTED');
  });

  it('no responseContract → silent (project may not have declared yet)', () => {
    const ep = makeEndpoint({ operationId: 'csrfToken' });
    const diag = [];
    assert.equal(pickTokenField(ep, diag), null);
    assert.equal(diag.length, 0);
  });

  it('non-string field is ignored, single string field still resolves', () => {
    const ep = makeEndpoint({
      operationId: 'csrfToken',
      responseContract: {
        fields: [
          { name: 'token', type: 'string' },
          { name: 'expiresIn', type: 'number' },
        ],
      },
    });
    const diag = [];
    assert.equal(pickTokenField(ep, diag), 'token');
    assert.equal(diag.length, 0);
  });

  it('plain string-array fields (no type) accepted as candidates', () => {
    const ep = makeEndpoint({
      operationId: 'csrfToken',
      responseContract: { fields: ['csrfToken'] },
    });
    assert.equal(pickTokenField(ep), 'csrfToken');
  });
});

// ---------------------------------------------------------------------------
// pickHeaderName — Layer 2: header name introspection (verbatim)
// ---------------------------------------------------------------------------

describe('pickHeaderName — header name introspection', () => {
  it('reads x-csrf-token from declared parameters verbatim', () => {
    const matrix = {
      apiEndpoints: [
        makeEndpoint({
          method: 'POST',
          path: '/api/v1/data',
          parameters: [{ in: 'header', name: 'x-csrf-token' }],
          securityRequirement: [{ csrfToken: [] }],
        }),
      ],
    };
    assert.equal(pickHeaderName(matrix), 'x-csrf-token');
  });

  it('reads alternate name csrf-token verbatim', () => {
    const matrix = {
      apiEndpoints: [
        makeEndpoint({
          method: 'POST',
          path: '/api/v1/data',
          parameters: [{ in: 'header', name: 'csrf-token' }],
          securityRequirement: [{ 'csrf-token': [] }],
        }),
      ],
    };
    assert.equal(pickHeaderName(matrix), 'csrf-token');
  });

  it('reads alternate name x-xsrf verbatim', () => {
    const matrix = {
      apiEndpoints: [
        makeEndpoint({
          method: 'POST',
          path: '/api/v1/data',
          parameters: [{ in: 'header', name: 'x-xsrf' }],
          securityRequirement: [{ xsrf: [] }],
        }),
      ],
    };
    assert.equal(pickHeaderName(matrix), 'x-xsrf');
  });

  it('falls back to securitySchemes name when no per-endpoint param', () => {
    const matrix = {
      apiEndpoints: [],
      securitySchemes: {
        csrfToken: { type: 'apiKey', in: 'header', name: 'X-CSRF-TOKEN' },
      },
    };
    assert.equal(pickHeaderName(matrix), 'X-CSRF-TOKEN');
  });

  it('multiple distinct header names → DIAG CSRF_HEADER_AMBIGUOUS, null', () => {
    const matrix = {
      apiEndpoints: [
        makeEndpoint({
          method: 'POST',
          path: '/a',
          parameters: [{ in: 'header', name: 'x-csrf-token' }],
          securityRequirement: [{ csrf: [] }],
        }),
        makeEndpoint({
          method: 'POST',
          path: '/b',
          parameters: [{ in: 'header', name: 'csrf-token' }],
          securityRequirement: [{ csrf: [] }],
        }),
      ],
    };
    const diag = [];
    assert.equal(pickHeaderName(matrix, diag), null);
    assert.equal(diag.length, 1);
    assert.equal(diag[0].code, 'CSRF_HEADER_AMBIGUOUS');
  });

  it('reads from swaggerDeclared.parameters when ep.parameters absent', () => {
    const matrix = {
      apiEndpoints: [
        makeEndpoint({
          method: 'POST',
          path: '/api/v1/data',
          parameters: [],
          swaggerDeclared: { parameters: [{ in: 'header', name: 'X-CSRF-TOKEN' }] },
          securityRequirement: [{ csrfToken: [] }],
        }),
      ],
    };
    assert.equal(pickHeaderName(matrix), 'X-CSRF-TOKEN');
  });

  it('returns null when no signal at all', () => {
    const matrix = { apiEndpoints: [], securitySchemes: {} };
    assert.equal(pickHeaderName(matrix), null);
  });
});

// ---------------------------------------------------------------------------
// detectCsrf integration
// ---------------------------------------------------------------------------

describe('detectCsrf integration', () => {
  it('returns detected:false when nothing signals CSRF', () => {
    const result = detectCsrf(tmpDir);
    assert.equal(result.detected, false);
    assert.equal(result.tokenEndpoint, null);
    assert.equal(result.tokenHeaderName, null);
  });

  it('detected via package + tokenEndpoint via operationId + tokenField verbatim', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { csurf: '1.0.0' } }),
    );
    const matrix = {
      apiEndpoints: [
        makeEndpoint({
          path: '/api/v1/security/csrf',
          operationId: 'csrfToken',
          responseContract: { fields: [{ name: 'token', type: 'string' }] },
        }),
      ],
      securitySchemes: {
        csrfToken: { type: 'apiKey', in: 'header', name: 'x-csrf-token' },
      },
    };
    const diag = [];
    const result = detectCsrf(tmpDir, matrix, diag);
    assert.equal(result.detected, true);
    assert.equal(result.library, 'csurf');
    assert.equal(result.tokenHeaderName, 'x-csrf-token');
    assert.notEqual(result.tokenEndpoint, null);
    assert.equal(result.tokenEndpoint.source, 'operationId');
    assert.equal(result.tokenEndpoint.tokenField, 'token');
    assert.equal(diag.length, 0);
  });

  it('detected via middleware + tokenEndpoint via SetMetadata', () => {
    fs.mkdirSync(path.join(tmpDir, 'apps/api/src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'apps/api/src/main.ts'), 'app.use(csurf());');
    const matrix = {
      apiEndpoints: [
        makeEndpoint({
          path: '/csrf',
          'csrf:issuer': true,
          responseContract: { fields: [{ name: 'csrfToken', type: 'string' }] },
        }),
      ],
    };
    const result = detectCsrf(tmpDir, matrix);
    assert.equal(result.detected, true);
    assert.equal(result.tokenEndpoint.source, 'set-metadata');
    assert.equal(result.tokenEndpoint.tokenField, 'csrfToken');
  });

  it('library detected but no role declaration → DIAG CSRF_ISSUER_UNDETECTED', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { csurf: '1.0.0' } }),
    );
    const matrix = {
      apiEndpoints: [
        // path looks csrf-y but no declaration — must NOT be picked
        makeEndpoint({ path: '/api/v1/csrf-token' }),
        makeEndpoint({ method: 'POST', path: '/api/v1/users' }),
      ],
    };
    const diag = [];
    const result = detectCsrf(tmpDir, matrix, diag);
    assert.equal(result.detected, true);
    assert.equal(result.tokenEndpoint, null);
    assert.equal(diag.length, 1);
    assert.equal(diag[0].code, 'CSRF_ISSUER_UNDETECTED');
  });

  it('two declarations on different endpoints → DIAG CSRF_ISSUER_AMBIGUOUS', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { csurf: '1.0.0' } }),
    );
    const matrix = {
      apiEndpoints: [
        makeEndpoint({ path: '/csrf-a', operationId: 'csrfToken' }),
        makeEndpoint({ path: '/csrf-b', 'x-csrf-issues-token': true }),
      ],
    };
    const diag = [];
    const result = detectCsrf(tmpDir, matrix, diag);
    assert.equal(result.detected, true);
    assert.equal(result.tokenEndpoint, null);
    const ambig = diag.find((d) => d.code === 'CSRF_ISSUER_AMBIGUOUS');
    assert.ok(ambig, 'must emit AMBIGUOUS DIAG');
  });

  it('header name read verbatim from declared parameter, not hardcoded default', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { csurf: '1.0.0' } }),
    );
    const matrix = {
      apiEndpoints: [
        makeEndpoint({
          path: '/csrf',
          operationId: 'csrfToken',
          responseContract: { fields: [{ name: 'token', type: 'string' }] },
        }),
        makeEndpoint({
          method: 'POST',
          path: '/api/v1/data',
          parameters: [{ in: 'header', name: 'x-xsrf' }],
          securityRequirement: [{ xsrfScheme: [] }],
        }),
      ],
    };
    const result = detectCsrf(tmpDir, matrix);
    // Header name comes from the consumer endpoint's declared parameter,
    // verbatim — NOT hardcoded to 'x-csrf-token'.
    assert.equal(result.tokenHeaderName, 'x-xsrf');
  });

  it('CSRF_ISSUER constant exposes the canonical declaration keys', () => {
    assert.equal(CSRF_ISSUER.setMetadataKey, 'csrf:issuer');
    assert.equal(CSRF_ISSUER.extension, 'x-csrf-issues-token');
    assert.equal(CSRF_ISSUER.operationId, 'csrfToken');
  });

  it('matrix-only call (no project dir match) — empty matrix → silent, detected:false', () => {
    const matrix = { apiEndpoints: [] };
    const diag = [];
    const result = detectCsrf(tmpDir, matrix, diag);
    assert.equal(result.detected, false);
    assert.equal(diag.length, 0);
  });
});
