'use strict';

// Tests for detectors/auth-flows.js — declaration-driven detection.
//
// ROLE selection (which endpoint plays which role): canonical signals only —
// operationId === 'authLogin'/'authRegister'/... or x-auth-* extension flags.
// No path regex, no body-shape, no field-name guessing for role selection.
//
// FIELD NAME extraction (what each endpoint calls its tokens): pure
// introspection — the probe reads whatever the project's Zod / OpenAPI
// schemas declare and uses those names verbatim. snake_case, camelCase,
// `rt`, anything — the probe adapts. No naming-convention enforcement.
//
// Run directly: `node --test __tests__/auth-flows.test.js`

const { test } = require('node:test');
const assert = require('node:assert');
const { detectAuthFlows, filterScalarFields } = require('../detectors/auth-flows');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEndpoint(overrides) {
  return {
    file: 'test.controller.ts',
    method: 'POST',
    path: '/api/v1/test',
    framework: 'nest',
    guard: 'public',
    operationId: null,
    zodContract: null,
    responseContract: null,
    errorShape: null,
    securityRequirement: [],
    authDecorators: {
      authRequired: false,
      authProvenance: 'none',
      isPublic: true,
      guards: [],
      rolesRequired: [],
      bearerAuth: false,
    },
    swaggerDeclared: { tags: [], statuses: [200] },
    ...overrides,
  };
}

function makeProtectedGet(overrides) {
  return makeEndpoint({
    method: 'GET',
    guard: 'authenticated',
    authDecorators: {
      authRequired: true,
      authProvenance: 'openapi',
      isPublic: false,
      guards: ['bearer'],
      rolesRequired: [],
      bearerAuth: true,
    },
    ...overrides,
  });
}

function makeTokenResponse(fields) {
  return {
    status: 200,
    schemaRef: 'TokenResponse',
    fields: fields || ['accessToken', 'refreshToken'],
    requiredPaths: [],
  };
}

// ---------------------------------------------------------------------------
// Empty / no-auth projects: detector stays silent
// ---------------------------------------------------------------------------

test('empty matrix: returns all null with no DIAGs', () => {
  const diag = [];
  const result = detectAuthFlows({ apiEndpoints: [] }, diag);

  assert.strictEqual(result.tokenIssuer, null);
  assert.strictEqual(result.register, null);
  assert.strictEqual(result.logout, null);
  assert.strictEqual(result.refresh, null);
  assert.strictEqual(result.mePoll, null);
  assert.strictEqual(diag.length, 0);
});

test('public-only API (no auth signals): all null, no DIAGs', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({ method: 'GET', path: '/api/v1/products' }),
      makeEndpoint({ method: 'POST', path: '/api/v1/products' }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.tokenIssuer, null);
  assert.strictEqual(result.register, null);
  assert.strictEqual(diag.length, 0);
});

// ---------------------------------------------------------------------------
// Fully-declared project via canonical operationId
// ---------------------------------------------------------------------------

test('canonical operationId: detects all roles cleanly with no DIAGs', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({ path: '/api/v1/auth/login', operationId: 'authLogin' }),
      makeEndpoint({ path: '/api/v1/auth/register', operationId: 'authRegister' }),
      makeEndpoint({ path: '/api/v1/auth/logout', operationId: 'authLogout' }),
      makeEndpoint({ path: '/api/v1/auth/refresh', operationId: 'authRefresh' }),
      makeProtectedGet({ path: '/api/v1/auth/me', operationId: 'authMe' }),
    ],
  };

  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.tokenIssuer.path, '/api/v1/auth/login');
  assert.strictEqual(result.tokenIssuer.source, 'operationId');
  assert.strictEqual(result.register.path, '/api/v1/auth/register');
  assert.strictEqual(result.register.source, 'operationId');
  assert.strictEqual(result.logout.path, '/api/v1/auth/logout');
  assert.strictEqual(result.logout.source, 'operationId');
  assert.strictEqual(result.refresh.path, '/api/v1/auth/refresh');
  assert.strictEqual(result.refresh.source, 'operationId');
  assert.strictEqual(result.mePoll.path, '/api/v1/auth/me');
  assert.strictEqual(result.mePoll.source, 'operationId');
  assert.strictEqual(diag.length, 0);
});

// ---------------------------------------------------------------------------
// Fully-declared project via canonical x-auth-* extensions
// ---------------------------------------------------------------------------

test('canonical extensions: detects all roles via x-auth-* flags', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({ path: '/oauth/token', 'x-auth-issues-token': true }),
      makeEndpoint({ path: '/users', 'x-auth-registers-user': true }),
      makeEndpoint({ path: '/sessions/end', 'x-auth-logs-out': true }),
      makeEndpoint({ path: '/oauth/refresh', 'x-auth-refreshes-token': true }),
      makeProtectedGet({ path: '/users/current', 'x-auth-current-user': true }),
    ],
  };

  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.tokenIssuer.source, 'extension');
  assert.strictEqual(result.tokenIssuer.path, '/oauth/token');
  assert.strictEqual(result.register.source, 'extension');
  assert.strictEqual(result.logout.source, 'extension');
  assert.strictEqual(result.refresh.source, 'extension');
  assert.strictEqual(result.mePoll.source, 'extension');
  assert.strictEqual(diag.length, 0);
});

// ---------------------------------------------------------------------------
// Mixed declarations: operationId AND extension on different endpoints
// ---------------------------------------------------------------------------

test('mixed: operationId for some roles, extension for others', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({ path: '/api/v1/auth/login', operationId: 'authLogin' }),
      makeEndpoint({ path: '/api/v1/auth/register', 'x-auth-registers-user': true }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.tokenIssuer.source, 'operationId');
  assert.strictEqual(result.register.source, 'extension');
  // tokenIssuer + register are eligible roles in this matrix; logout/refresh
  // are not declared but POSTs exist → those roles emit UNDETECTED DIAGs.
  assert.ok(diag.some((d) => d.code === 'AUTH_FLOW_LOGOUT_UNDETECTED'));
  assert.ok(diag.some((d) => d.code === 'AUTH_FLOW_REFRESH_UNDETECTED'));
});

// ---------------------------------------------------------------------------
// Path-regex / body-shape / response-shape are NOT used
// ---------------------------------------------------------------------------

test('path /auth/login WITHOUT operationId is NOT detected (no path-regex fallback)', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({ path: '/api/v1/auth/login' }),
      makeEndpoint({ path: '/api/v1/auth/register' }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  // No auth signals at all → silent.
  assert.strictEqual(result.tokenIssuer, null);
  assert.strictEqual(result.register, null);
  assert.strictEqual(diag.length, 0);
});

test('body has password+email is NOT a detection signal', () => {
  // Project has authRequired GET /me (signals it has auth) so DIAGs fire,
  // but the POST endpoints with credential-shaped bodies are NOT picked.
  const matrix = {
    apiEndpoints: [
      makeEndpoint({
        path: '/api/v1/auth/login',
        zodContract: {
          fields: [
            { name: 'email', type: 'string' },
            { name: 'password', type: 'string' },
          ],
        },
      }),
      makeProtectedGet({ path: '/api/v1/me', operationId: 'authMe' }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.tokenIssuer, null);
  assert.ok(diag.some((d) => d.code === 'AUTH_FLOW_TOKENISSUER_UNDETECTED'));
});

test('response has accessToken is NOT a detection signal', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({
        path: '/api/v1/auth/login',
        responseContract: makeTokenResponse(['accessToken']),
      }),
      makeProtectedGet({ path: '/api/v1/me', operationId: 'authMe' }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.tokenIssuer, null);
  assert.ok(diag.some((d) => d.code === 'AUTH_FLOW_TOKENISSUER_UNDETECTED'));
});

test('body has refreshToken field is NOT a detection signal', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({
        path: '/api/v1/auth/refresh',
        zodContract: { fields: [{ name: 'refreshToken', type: 'string' }] },
      }),
      makeProtectedGet({ path: '/api/v1/me', operationId: 'authMe' }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.refresh, null);
  assert.ok(diag.some((d) => d.code === 'AUTH_FLOW_REFRESH_UNDETECTED'));
});

// ---------------------------------------------------------------------------
// Register-with-auto-login (the SFX project's actual case)
// ---------------------------------------------------------------------------

test('two POSTs both declare token responses, neither has canonical opId → tokenIssuer undetected, DIAG fires', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({
        path: '/api/v1/auth/register',
        responseContract: makeTokenResponse(['accessToken', 'user']),
      }),
      makeEndpoint({
        path: '/api/v1/auth/login',
        responseContract: makeTokenResponse(['accessToken', 'user']),
      }),
      makeProtectedGet({ path: '/api/v1/me', operationId: 'authMe' }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.tokenIssuer, null);
  assert.strictEqual(result.register, null);
  const undetected = diag.find((d) => d.code === 'AUTH_FLOW_TOKENISSUER_UNDETECTED');
  assert.ok(undetected, 'must emit TOKENISSUER_UNDETECTED DIAG');
  assert.match(undetected.message, /authLogin/);
  assert.match(undetected.message, /x-auth-issues-token/);
});

test('developer adds operationId=authLogin → resolved cleanly', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({
        path: '/api/v1/auth/register',
        operationId: 'authRegister',
        responseContract: makeTokenResponse(['accessToken', 'user']),
      }),
      makeEndpoint({
        path: '/api/v1/auth/login',
        operationId: 'authLogin',
        responseContract: makeTokenResponse(['accessToken', 'user']),
      }),
      makeProtectedGet({ path: '/api/v1/me', operationId: 'authMe' }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.tokenIssuer.path, '/api/v1/auth/login');
  assert.strictEqual(result.tokenIssuer.source, 'operationId');
  assert.strictEqual(result.register.path, '/api/v1/auth/register');
  assert.strictEqual(result.register.source, 'operationId');
  assert.ok(!diag.some((d) => d.code === 'AUTH_FLOW_TOKENISSUER_UNDETECTED'));
});

// ---------------------------------------------------------------------------
// Duplicate declarations
// ---------------------------------------------------------------------------

test('two endpoints with operationId=authLogin → DIAG OPID_DUPLICATE, null', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({ path: '/api/v1/auth/login', operationId: 'authLogin' }),
      makeEndpoint({ path: '/api/v1/auth/login-alt', operationId: 'authLogin' }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.tokenIssuer, null);
  assert.ok(diag.some((d) => d.code === 'AUTH_FLOW_OPID_DUPLICATE'));
});

test('two endpoints with x-auth-issues-token=true → DIAG EXT_DUPLICATE, null', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({ path: '/api/v1/oauth/token', 'x-auth-issues-token': true }),
      makeEndpoint({ path: '/api/v1/oauth/exchange', 'x-auth-issues-token': true }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.tokenIssuer, null);
  assert.ok(diag.some((d) => d.code === 'AUTH_FLOW_EXT_DUPLICATE'));
});

// ---------------------------------------------------------------------------
// mePoll structural prerequisite
// ---------------------------------------------------------------------------

test('mePoll: operationId=authMe on a public endpoint → DIAG MEPOLL_NOT_PROTECTED', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({
        method: 'GET',
        path: '/api/v1/me',
        operationId: 'authMe',
        // public — authRequired stays false in default makeEndpoint authDecorators
      }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.mePoll, null);
  assert.ok(diag.some((d) => d.code === 'AUTH_FLOW_MEPOLL_NOT_PROTECTED'));
});

test('mePoll: x-auth-current-user on a public endpoint → DIAG MEPOLL_NOT_PROTECTED', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({ method: 'GET', path: '/api/v1/me', 'x-auth-current-user': true }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.mePoll, null);
  assert.ok(diag.some((d) => d.code === 'AUTH_FLOW_MEPOLL_NOT_PROTECTED'));
});

// ---------------------------------------------------------------------------
// Security scheme passthrough
// ---------------------------------------------------------------------------

test('schemeName carried through from securityRequirement', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({
        path: '/api/v1/auth/login',
        operationId: 'authLogin',
        securityRequirement: [{ basicAuth: [] }],
      }),
      makeProtectedGet({
        path: '/api/v1/me',
        operationId: 'authMe',
        securityRequirement: [{ bearerAuth: [] }],
      }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.tokenIssuer.schemeName, 'basicAuth');
  assert.strictEqual(result.mePoll.schemeName, 'bearerAuth');
});

// ---------------------------------------------------------------------------
// Field-name extraction — pure introspection (no canonical enforcement)
// ---------------------------------------------------------------------------

test('field extraction: camelCase refreshToken/accessToken extracted verbatim', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({
        path: '/api/v1/auth/refresh',
        operationId: 'authRefresh',
        zodContract: { fields: [{ name: 'refreshToken', type: 'string' }] },
        responseContract: { fields: ['accessToken'] },
      }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.refresh.refreshInputField, 'refreshToken');
  assert.strictEqual(result.refresh.accessTokenField, 'accessToken');
  assert.strictEqual(result.refresh.refreshTokenField, null);
  assert.strictEqual(result.refresh.tokenRotation, false);
  assert.strictEqual(diag.filter((d) => d.code.startsWith('AUTH_FLOW_REFRESH_')).length, 0);
});

test('field extraction: snake_case refresh_token/access_token extracted verbatim — no DIAG', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({
        path: '/api/v1/auth/refresh',
        operationId: 'authRefresh',
        zodContract: { fields: [{ name: 'refresh_token', type: 'string' }] },
        responseContract: { fields: ['access_token'] },
      }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.refresh.refreshInputField, 'refresh_token');
  assert.strictEqual(result.refresh.accessTokenField, 'access_token');
  assert.strictEqual(result.refresh.refreshTokenField, null);
  assert.strictEqual(diag.filter((d) => d.code.startsWith('AUTH_FLOW_REFRESH_')).length, 0);
});

test('field extraction: unusual names like rt/at extracted verbatim — no DIAG', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({
        path: '/api/v1/auth/refresh',
        operationId: 'authRefresh',
        zodContract: { fields: [{ name: 'rt', type: 'string' }] },
        responseContract: { fields: ['at'] },
      }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.refresh.refreshInputField, 'rt');
  assert.strictEqual(result.refresh.accessTokenField, 'at');
  assert.strictEqual(diag.filter((d) => d.code.startsWith('AUTH_FLOW_REFRESH_')).length, 0);
});

test('field extraction: rotation detected by name correspondence (snake_case)', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({
        path: '/api/v1/auth/refresh',
        operationId: 'authRefresh',
        zodContract: { fields: [{ name: 'refresh_token', type: 'string' }] },
        responseContract: { fields: ['access_token', 'refresh_token'] },
      }),
    ],
  };
  const result = detectAuthFlows(matrix);

  assert.strictEqual(result.refresh.refreshInputField, 'refresh_token');
  assert.strictEqual(result.refresh.accessTokenField, 'access_token');
  assert.strictEqual(result.refresh.refreshTokenField, 'refresh_token');
  assert.strictEqual(result.refresh.tokenRotation, true);
});

test('field extraction: rotation detected by name correspondence (camelCase)', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({
        path: '/api/v1/auth/refresh',
        operationId: 'authRefresh',
        zodContract: { fields: [{ name: 'refreshToken', type: 'string' }] },
        responseContract: { fields: ['accessToken', 'refreshToken'] },
      }),
    ],
  };
  const result = detectAuthFlows(matrix);

  assert.strictEqual(result.refresh.refreshInputField, 'refreshToken');
  assert.strictEqual(result.refresh.accessTokenField, 'accessToken');
  assert.strictEqual(result.refresh.refreshTokenField, 'refreshToken');
  assert.strictEqual(result.refresh.tokenRotation, true);
});

test('field extraction: empty request body → silent (project may use cookie/header instead)', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({
        path: '/api/v1/auth/refresh',
        operationId: 'authRefresh',
        zodContract: { fields: [] },
        responseContract: { fields: ['accessToken'] },
      }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.refresh.refreshInputField, null);
  assert.strictEqual(result.refresh.accessTokenField, 'accessToken');
  // No DIAG — empty body is legitimate (cookie-based or header-based refresh).
  assert.strictEqual(diag.filter((d) => d.code.startsWith('AUTH_FLOW_REFRESH_REQUEST_')).length, 0);
});

test('field extraction: multi-field request with NO correspondence → AMBIGUOUS DIAG', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({
        path: '/api/v1/auth/refresh',
        operationId: 'authRefresh',
        zodContract: {
          fields: [
            { name: 'token', type: 'string' },
            { name: 'deviceId', type: 'string' },
          ],
        },
        responseContract: { fields: ['accessToken'] },
      }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.refresh.refreshInputField, null);
  // Single response string field still resolves cleanly via single-field rule.
  assert.strictEqual(result.refresh.accessTokenField, 'accessToken');
  assert.ok(diag.some((d) => d.code === 'AUTH_FLOW_REFRESH_REQUEST_AMBIGUOUS'));
});

test('field extraction: multi-field response with correspondence → access by elimination', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({
        path: '/api/v1/auth/refresh',
        operationId: 'authRefresh',
        zodContract: { fields: [{ name: 'rt', type: 'string' }] },
        responseContract: { fields: ['at', 'rt'] },
      }),
    ],
  };
  const result = detectAuthFlows(matrix);

  assert.strictEqual(result.refresh.refreshInputField, 'rt');
  assert.strictEqual(result.refresh.accessTokenField, 'at');
  assert.strictEqual(result.refresh.refreshTokenField, 'rt');
});

test('field extraction: multi-field response with NO correspondence → RESPONSE_AMBIGUOUS DIAG', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({
        path: '/api/v1/auth/refresh',
        operationId: 'authRefresh',
        zodContract: { fields: [{ name: 'refreshToken', type: 'string' }] },
        responseContract: { fields: ['token', 'expiresIn'] },
      }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.refresh.refreshInputField, 'refreshToken');
  assert.strictEqual(result.refresh.accessTokenField, null);
  assert.ok(diag.some((d) => d.code === 'AUTH_FLOW_RESPONSE_AMBIGUOUS'));
});

test('field extraction: empty schemas → no introspection DIAGs (developer has not declared yet)', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({
        path: '/api/v1/auth/refresh',
        operationId: 'authRefresh',
      }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.refresh.refreshInputField, null);
  assert.strictEqual(result.refresh.accessTokenField, null);
  assert.strictEqual(result.refresh.refreshTokenField, null);
  // No Zod schemas declared at all → no introspection DIAGs (silent).
  assert.ok(!diag.some((d) => d.code === 'AUTH_FLOW_REFRESH_REQUEST_AMBIGUOUS'));
  assert.ok(!diag.some((d) => d.code === 'AUTH_FLOW_RESPONSE_AMBIGUOUS'));
});

test('tokenIssuer enrichment: extracts accessToken field name verbatim from response', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({
        path: '/api/v1/auth/login',
        operationId: 'authLogin',
        responseContract: { fields: ['access_token'] },
      }),
    ],
  };
  const result = detectAuthFlows(matrix);

  assert.strictEqual(result.tokenIssuer.accessTokenField, 'access_token');
  assert.strictEqual(result.tokenIssuer.refreshTokenField, null);
});

test('tokenIssuer enrichment: cross-references refresh input field for rotation in login response', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({
        path: '/api/v1/auth/login',
        operationId: 'authLogin',
        responseContract: { fields: ['accessToken', 'refreshToken'] },
      }),
      makeEndpoint({
        path: '/api/v1/auth/refresh',
        operationId: 'authRefresh',
        zodContract: { fields: [{ name: 'refreshToken', type: 'string' }] },
        responseContract: { fields: ['accessToken', 'refreshToken'] },
      }),
    ],
  };
  const result = detectAuthFlows(matrix);

  // Login response correlated with refresh input via name.
  assert.strictEqual(result.tokenIssuer.accessTokenField, 'accessToken');
  assert.strictEqual(result.tokenIssuer.refreshTokenField, 'refreshToken');
});

// ---------------------------------------------------------------------------
// UNDETECTED DIAG suppression rules
// ---------------------------------------------------------------------------

test('UNDETECTED suppressed when no POST endpoints exist (project has only GETs)', () => {
  const matrix = {
    apiEndpoints: [
      makeProtectedGet({ path: '/api/v1/me', operationId: 'authMe' }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.mePoll.path, '/api/v1/me');
  // No POSTs anywhere → no point asking for tokenIssuer/register/logout/refresh.
  assert.ok(!diag.some((d) => d.code === 'AUTH_FLOW_TOKENISSUER_UNDETECTED'));
  assert.ok(!diag.some((d) => d.code === 'AUTH_FLOW_REGISTER_UNDETECTED'));
  assert.ok(!diag.some((d) => d.code === 'AUTH_FLOW_LOGOUT_UNDETECTED'));
  assert.ok(!diag.some((d) => d.code === 'AUTH_FLOW_REFRESH_UNDETECTED'));
});

test('UNDETECTED for mePoll suppressed when no authRequired GETs exist', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({ path: '/api/v1/auth/login', operationId: 'authLogin' }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.tokenIssuer.path, '/api/v1/auth/login');
  assert.strictEqual(result.mePoll, null);
  assert.ok(!diag.some((d) => d.code === 'AUTH_FLOW_MEPOLL_UNDETECTED'));
});

// ---------------------------------------------------------------------------
// filterScalarFields — requiredPaths-based nested-object exclusion
// ---------------------------------------------------------------------------

test('filterScalarFields: excludes fields with sub-paths in requiredPaths', () => {
  const fields = ['accessToken', 'refreshToken', 'user'];
  const contract = {
    fields: ['accessToken', 'refreshToken', 'user'],
    requiredPaths: ['accessToken', 'refreshToken', 'user', 'user.email', 'user.id'],
  };
  const scalars = filterScalarFields(fields, contract);
  assert.deepStrictEqual(scalars, ['accessToken', 'refreshToken']);
});

test('filterScalarFields: all scalars when no sub-paths exist', () => {
  const fields = ['accessToken', 'refreshToken'];
  const contract = {
    fields: ['accessToken', 'refreshToken'],
    requiredPaths: ['accessToken', 'refreshToken'],
  };
  const scalars = filterScalarFields(fields, contract);
  assert.deepStrictEqual(scalars, ['accessToken', 'refreshToken']);
});

test('filterScalarFields: handles missing requiredPaths gracefully', () => {
  const fields = ['accessToken', 'user'];
  const scalars = filterScalarFields(fields, { fields: ['accessToken', 'user'] });
  assert.deepStrictEqual(scalars, ['accessToken', 'user']);
});

test('filterScalarFields: handles null responseContract gracefully', () => {
  const fields = ['accessToken'];
  const scalars = filterScalarFields(fields, null);
  assert.deepStrictEqual(scalars, ['accessToken']);
});

// ---------------------------------------------------------------------------
// pickResponseTokenFields — scalar-based disambiguation
// ---------------------------------------------------------------------------

test('tokenIssuer: 3-field response with nested user object resolves via requiredPaths', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({
        path: '/api/v1/auth/login',
        operationId: 'authLogin',
        responseContract: {
          fields: ['accessToken', 'refreshToken', 'user'],
          requiredPaths: ['accessToken', 'refreshToken', 'user', 'user.email', 'user.id'],
        },
      }),
      makeEndpoint({
        path: '/api/v1/auth/refresh',
        operationId: 'authRefresh',
        zodContract: { fields: [{ name: 'refreshToken', type: 'string' }] },
        responseContract: { fields: ['accessToken', 'refreshToken'] },
      }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.tokenIssuer.accessTokenField, 'accessToken');
  assert.strictEqual(result.tokenIssuer.refreshTokenField, 'refreshToken');
  assert.ok(!diag.some((d) => d.code === 'AUTH_FLOW_RESPONSE_AMBIGUOUS'),
    'Should not emit AMBIGUOUS when requiredPaths disambiguates nested objects');
});

test('tokenIssuer: 3-field response with all scalars still emits AMBIGUOUS', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({
        path: '/api/v1/auth/login',
        operationId: 'authLogin',
        responseContract: {
          fields: ['accessToken', 'refreshToken', 'sessionId'],
          requiredPaths: ['accessToken', 'refreshToken', 'sessionId'],
        },
      }),
      makeEndpoint({
        path: '/api/v1/auth/refresh',
        operationId: 'authRefresh',
        zodContract: { fields: [{ name: 'refreshToken', type: 'string' }] },
        responseContract: { fields: ['accessToken', 'refreshToken'] },
      }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  assert.strictEqual(result.tokenIssuer.accessTokenField, null);
  assert.ok(diag.some((d) => d.code === 'AUTH_FLOW_RESPONSE_AMBIGUOUS'),
    'Should emit AMBIGUOUS when multiple scalar fields remain after excluding refresh');
});

test('tokenIssuer: multi-field response without refresh match uses scalar filtering', () => {
  const matrix = {
    apiEndpoints: [
      makeEndpoint({
        path: '/api/v1/auth/login',
        operationId: 'authLogin',
        responseContract: {
          fields: ['token', 'profile'],
          requiredPaths: ['token', 'profile', 'profile.name', 'profile.avatar'],
        },
      }),
    ],
  };
  const diag = [];
  const result = detectAuthFlows(matrix, diag);

  // No refresh endpoint, so no refresh input field. Multi-field response
  // with only one scalar ('token') should resolve via requiredPaths.
  assert.strictEqual(result.tokenIssuer.accessTokenField, 'token');
  assert.ok(!diag.some((d) => d.code === 'AUTH_FLOW_RESPONSE_AMBIGUOUS'));
});
