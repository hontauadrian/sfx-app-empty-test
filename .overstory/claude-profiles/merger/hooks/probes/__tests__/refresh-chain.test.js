'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { emitRefreshChain } = require('../flows-generator');

// ---------------------------------------------------------------------------
// Helper: endpoint factories
// ---------------------------------------------------------------------------

function makeRegister(overrides = {}) {
  return {
    method: 'POST',
    path: '/api/v1/auth/register',
    file: 'src/modules/auth/auth.controller.ts',
    operationId: 'register',
    zodContract: {
      schemaRef: 'RegisterSchema',
      sampleValid: { email: 'user@example.com', password: 'Password1!', name: 'Test User' },
      fields: [
        { name: 'email', type: 'string' },
        { name: 'password', type: 'string' },
        { name: 'name', type: 'string' },
      ],
    },
    swaggerDeclared: { statuses: [201, 400] },
    authDecorators: null,
    ...overrides,
  };
}

function makeRefresh(overrides = {}) {
  return {
    method: 'POST',
    path: '/api/v1/auth/refresh',
    file: 'src/modules/auth/auth.controller.ts',
    operationId: 'refreshToken',
    zodContract: {
      schemaRef: 'RefreshSchema',
      sampleValid: { refreshToken: 'some-token' },
      fields: [
        { name: 'refreshToken', type: 'string' },
      ],
    },
    swaggerDeclared: { statuses: [200, 401] },
    authDecorators: null,
    ...overrides,
  };
}

function makeMePoll(overrides = {}) {
  return {
    method: 'GET',
    path: '/api/v1/auth/me',
    file: 'src/modules/auth/auth.controller.ts',
    operationId: 'getMe',
    authDecorators: { authRequired: true },
    swaggerDeclared: { statuses: [200, 401] },
    ...overrides,
  };
}

function makeAuthFlows({ register = true, refresh = true, mePoll = true, tokenRotation = false, refreshTokenField = null } = {}) {
  const flows = {};
  if (register) flows.register = { method: 'POST', path: '/api/v1/auth/register', source: 'operationId' };
  if (refresh) {
    flows.refresh = {
      method: 'POST',
      path: '/api/v1/auth/refresh',
      source: 'operationId',
      accessTokenField: 'accessToken',
      refreshTokenField: refreshTokenField || 'refreshToken',
      tokenRotation,
    };
  }
  if (mePoll) flows.mePoll = { method: 'GET', path: '/api/v1/auth/me', source: 'operationId' };
  return flows;
}

// ---------------------------------------------------------------------------
// emitRefreshChain — null guards
// ---------------------------------------------------------------------------

test('emitRefreshChain: returns null when no register endpoint', () => {
  const endpoints = [makeRefresh(), makeMePoll()];
  const result = emitRefreshChain(endpoints, { authFlows: makeAuthFlows({ register: false }) });
  assert.strictEqual(result, null);
});

test('emitRefreshChain: returns null when no refresh endpoint', () => {
  const endpoints = [makeRegister(), makeMePoll()];
  const result = emitRefreshChain(endpoints, { authFlows: makeAuthFlows({ refresh: false }) });
  assert.strictEqual(result, null);
});

test('emitRefreshChain: returns null when authFlows is empty', () => {
  const endpoints = [makeRegister(), makeRefresh(), makeMePoll()];
  const result = emitRefreshChain(endpoints, { authFlows: {} });
  assert.strictEqual(result, null);
});

// ---------------------------------------------------------------------------
// emitRefreshChain — basic flow structure
// ---------------------------------------------------------------------------

test('emitRefreshChain: emits chain with register + refresh + me', () => {
  const endpoints = [makeRegister(), makeRefresh(), makeMePoll()];
  const flow = emitRefreshChain(endpoints, { authFlows: makeAuthFlows() });

  assert.ok(flow);
  assert.strictEqual(flow.id, 'chain:refresh-token-rotation');
  assert.strictEqual(flow.contract.kind, 'chain-refresh-token-rotation');
  assert.deepStrictEqual(flow.dependsOn, []);
});

test('emitRefreshChain: step sequence is register -> capture -> wait -> refresh -> capture -> me -> me', () => {
  const endpoints = [makeRegister(), makeRefresh(), makeMePoll()];
  const flow = emitRefreshChain(endpoints, { authFlows: makeAuthFlows() });

  const kinds = flow.steps.map((s) => s.kind);
  assert.deepStrictEqual(kinds, [
    'api',      // register
    'expect',   // expect 200/201
    'capture',  // capture oldAccessToken + refreshToken
    'wait',     // wait 1s
    'api',      // refresh
    'expect',   // expect 200/201
    'capture',  // capture newAccessToken
    'setAuth',  // set newAccessToken
    'api',      // GET /me with new token
    'expect',   // expect 200
    'setAuth',  // set oldAccessToken
    'api',      // GET /me with old token
    'expect',   // expect 200 or 401 (non-rotating)
  ]);
});

// ---------------------------------------------------------------------------
// emitRefreshChain — step details
// ---------------------------------------------------------------------------

test('emitRefreshChain: register step has body from zodContract', () => {
  const endpoints = [makeRegister(), makeRefresh(), makeMePoll()];
  const flow = emitRefreshChain(endpoints, { authFlows: makeAuthFlows() });

  const registerStep = flow.steps[0];
  assert.strictEqual(registerStep.method, 'POST');
  assert.strictEqual(registerStep.path, '/api/v1/auth/register');
  assert.deepStrictEqual(registerStep.body, {
    email: 'user@example.com',
    password: 'Password1!',
    name: 'Test User',
  });
});

test('emitRefreshChain: captures oldAccessToken and refreshToken from register', () => {
  const endpoints = [makeRegister(), makeRefresh(), makeMePoll()];
  const flow = emitRefreshChain(endpoints, { authFlows: makeAuthFlows() });

  const captureStep = flow.steps[2];
  assert.strictEqual(captureStep.kind, 'capture');
  assert.deepStrictEqual(captureStep.bindings, {
    oldAccessToken: '$.accessToken',
    refreshToken: '$.refreshToken',
  });
});

test('emitRefreshChain: wait step is 1000ms', () => {
  const endpoints = [makeRegister(), makeRefresh(), makeMePoll()];
  const flow = emitRefreshChain(endpoints, { authFlows: makeAuthFlows() });

  const waitStep = flow.steps.find((s) => s.kind === 'wait');
  assert.ok(waitStep);
  assert.strictEqual(waitStep.ms, 1000);
});

test('emitRefreshChain: refresh step uses captured refreshToken binding', () => {
  const endpoints = [makeRegister(), makeRefresh(), makeMePoll()];
  const flow = emitRefreshChain(endpoints, { authFlows: makeAuthFlows() });

  const refreshApiStep = flow.steps[4];
  assert.strictEqual(refreshApiStep.method, 'POST');
  assert.strictEqual(refreshApiStep.path, '/api/v1/auth/refresh');
  assert.strictEqual(refreshApiStep.body.refreshToken, '${refreshToken}');
});

test('emitRefreshChain: captures newAccessToken from refresh response', () => {
  const endpoints = [makeRegister(), makeRefresh(), makeMePoll()];
  const flow = emitRefreshChain(endpoints, { authFlows: makeAuthFlows() });

  const captureSteps = flow.steps.filter((s) => s.kind === 'capture');
  assert.strictEqual(captureSteps.length, 2);
  assert.deepStrictEqual(captureSteps[1].bindings, { newAccessToken: '$.accessToken' });
});

// ---------------------------------------------------------------------------
// emitRefreshChain — non-rotating (default)
// ---------------------------------------------------------------------------

test('emitRefreshChain: non-rotating expects 200|401 for old token', () => {
  const endpoints = [makeRegister(), makeRefresh(), makeMePoll()];
  const flow = emitRefreshChain(endpoints, { authFlows: makeAuthFlows({ tokenRotation: false }) });

  const expectSteps = flow.steps.filter((s) => s.kind === 'expect');
  // Last expect is the old-token check
  const oldTokenExpect = expectSteps[expectSteps.length - 1];
  assert.deepStrictEqual(oldTokenExpect.statusAnyOf, [200, 401]);
});

// ---------------------------------------------------------------------------
// emitRefreshChain — token rotation
// ---------------------------------------------------------------------------

test('emitRefreshChain: rotating expects strict 401 for old token', () => {
  const endpoints = [makeRegister(), makeRefresh(), makeMePoll()];
  const flow = emitRefreshChain(endpoints, { authFlows: makeAuthFlows({ tokenRotation: true }) });

  const expectSteps = flow.steps.filter((s) => s.kind === 'expect');
  const oldTokenExpect = expectSteps[expectSteps.length - 1];
  assert.strictEqual(oldTokenExpect.status, 401);
  assert.strictEqual(oldTokenExpect.statusAnyOf, undefined);
});

// ---------------------------------------------------------------------------
// emitRefreshChain — refreshTokenField from authFlows
// ---------------------------------------------------------------------------

test('emitRefreshChain: uses refreshTokenField from authFlows.refresh', () => {
  const endpoints = [makeRegister(), makeRefresh(), makeMePoll()];
  const flow = emitRefreshChain(endpoints, {
    authFlows: makeAuthFlows({ refreshTokenField: 'refresh_token' }),
  });

  const refreshApiStep = flow.steps[4];
  assert.strictEqual(refreshApiStep.body.refresh_token, '${refreshToken}');
  assert.strictEqual(refreshApiStep.body.refreshToken, undefined);
});

// ---------------------------------------------------------------------------
// emitRefreshChain — without mePoll
// ---------------------------------------------------------------------------

test('emitRefreshChain: works without mePoll endpoint (shorter chain)', () => {
  const endpoints = [makeRegister(), makeRefresh()];
  const flow = emitRefreshChain(endpoints, { authFlows: makeAuthFlows({ mePoll: false }) });

  assert.ok(flow);
  assert.strictEqual(flow.id, 'chain:refresh-token-rotation');

  const kinds = flow.steps.map((s) => s.kind);
  assert.deepStrictEqual(kinds, [
    'api',      // register
    'expect',   // expect 200/201
    'capture',  // capture tokens
    'wait',     // wait 1s
    'api',      // refresh
    'expect',   // expect 200/201
    'capture',  // capture newAccessToken
  ]);
});

// ---------------------------------------------------------------------------
// emitRefreshChain — declaration-driven skip behavior (NEVER-HEURISTIC)
// ---------------------------------------------------------------------------

test('emitRefreshChain: returns null + emits diagnostic when refreshTokenField is not declared', () => {
  const refresh = makeRefresh({
    zodContract: {
      schemaRef: 'RefreshSchema',
      sampleValid: { refresh_token: 'some-token' },
      fields: [{ name: 'refresh_token', type: 'string' }],
    },
  });
  const endpoints = [makeRegister(), refresh, makeMePoll()];
  const authFlows = makeAuthFlows();
  authFlows.refresh.refreshTokenField = null;
  const diagnostics = [];
  const flow = emitRefreshChain(endpoints, { authFlows, diagnostics });

  // Declaration-driven: no field declared → skip + diagnostic. NO regex fallback.
  assert.strictEqual(flow, null);
  const skip = diagnostics.find((d) => d.code === 'REFRESH_CHAIN_SKIPPED_NO_REFRESH_FIELD');
  assert.ok(skip, 'expected REFRESH_CHAIN_SKIPPED_NO_REFRESH_FIELD diagnostic');
  assert.strictEqual(skip.level, 'info');
  assert.ok(skip.endpoint.includes('/api/v1/auth/refresh'));
});

test('emitRefreshChain: returns null + emits diagnostic when refresh endpoint is covered by cookieFlows', () => {
  const endpoints = [makeRegister(), makeRefresh(), makeMePoll()];
  const cookieFlows = [{
    name: 'refresh_token',
    role: 'refresh-token',
    issuers: [{ operationId: 'authRegister', method: 'POST', path: '/api/v1/auth/register' }],
    rotators: [{ operationId: 'authRefresh', method: 'POST', path: '/api/v1/auth/refresh' }],
    clearers: [],
  }];
  const diagnostics = [];
  const flow = emitRefreshChain(endpoints, {
    authFlows: makeAuthFlows(),
    cookieFlows,
    diagnostics,
  });

  // Cookie-flow already covers refresh — skip body-based chain to avoid duplicate (broken) coverage.
  assert.strictEqual(flow, null);
  const skip = diagnostics.find((d) => d.code === 'REFRESH_CHAIN_SKIPPED_COOKIE_GUARDED');
  assert.ok(skip, 'expected REFRESH_CHAIN_SKIPPED_COOKIE_GUARDED diagnostic');
  assert.strictEqual(skip.level, 'info');
});

// ---------------------------------------------------------------------------
// emitRefreshChain — metadata
// ---------------------------------------------------------------------------

test('emitRefreshChain: onFail includes all source files', () => {
  const endpoints = [makeRegister(), makeRefresh(), makeMePoll()];
  const flow = emitRefreshChain(endpoints, { authFlows: makeAuthFlows() });

  assert.deepStrictEqual(flow.onFail.check, [
    'src/modules/auth/auth.controller.ts',
    'src/modules/auth/auth.controller.ts',
    'src/modules/auth/auth.controller.ts',
  ]);
  assert.ok(flow.onFail.implies.includes('refresh'));
});

test('emitRefreshChain: contract endpoint lists all endpoints', () => {
  const endpoints = [makeRegister(), makeRefresh(), makeMePoll()];
  const flow = emitRefreshChain(endpoints, { authFlows: makeAuthFlows() });

  assert.ok(flow.contract.endpoint.includes('POST /api/v1/auth/register'));
  assert.ok(flow.contract.endpoint.includes('POST /api/v1/auth/refresh'));
  assert.ok(flow.contract.endpoint.includes('GET /api/v1/auth/me'));
});

test('emitRefreshChain: unique fields get sigil substitution in register body', () => {
  const endpoints = [makeRegister(), makeRefresh(), makeMePoll()];
  const uniqueFieldSet = new Set(['email']);
  const flow = emitRefreshChain(endpoints, {
    authFlows: makeAuthFlows(),
    uniqueFieldSet,
  });

  const registerStep = flow.steps[0];
  assert.strictEqual(registerStep.body.email, '${uniqEmail}');
  assert.strictEqual(registerStep.body.name, 'Test User');
});

test('emitRefreshChain: contract source lists all files without mePoll', () => {
  const endpoints = [makeRegister(), makeRefresh()];
  const flow = emitRefreshChain(endpoints, { authFlows: makeAuthFlows({ mePoll: false }) });

  assert.ok(!flow.contract.endpoint.includes('GET'));
  assert.ok(!flow.contract.source.includes('GET'));
});
