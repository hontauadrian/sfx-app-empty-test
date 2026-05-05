'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  emitOAuthFlows,
  oauthCoveredStatuses,
} = require('../flows-generator');

// ---------------------------------------------------------------------------
// Helper: build a matrix with oauth detected and specific role paths
// ---------------------------------------------------------------------------

function oauthMatrix(overrides = {}) {
  return {
    oauth: {
      detected: true,
      tokenUrl: null,
      authorizeUrl: null,
      callbackUrl: null,
      source: 'endpoint-paths',
      roles: { authorize: null, token: null, callback: null },
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// emitOAuthFlows: base cases
// ---------------------------------------------------------------------------

test('emitOAuthFlows: returns empty when oauth is null', () => {
  assert.deepStrictEqual(emitOAuthFlows({ oauth: null }), []);
});

test('emitOAuthFlows: returns empty when oauth.detected is false', () => {
  assert.deepStrictEqual(emitOAuthFlows({ oauth: { detected: false } }), []);
});

// ---------------------------------------------------------------------------
// Token endpoint flows
// ---------------------------------------------------------------------------

test('emitOAuthFlows: emits 3 token flows when tokenUrl present', () => {
  const matrix = oauthMatrix({ tokenUrl: '/api/v1/oauth/token' });
  const flows = emitOAuthFlows(matrix);
  assert.strictEqual(flows.length, 3);

  const ids = flows.map((f) => f.id).sort();
  assert.deepStrictEqual(ids, [
    'oauth:token:client-credentials',
    'oauth:token:invalid-grant',
    'oauth:token:missing-grant-type',
  ]);
});

test('emitOAuthFlows: token:invalid-grant sends POST with authorization_code grant', () => {
  const matrix = oauthMatrix({ tokenUrl: '/api/v1/oauth/token' });
  const flows = emitOAuthFlows(matrix);
  const flow = flows.find((f) => f.id === 'oauth:token:invalid-grant');
  assert.ok(flow);
  assert.strictEqual(flow.steps[0].method, 'POST');
  assert.strictEqual(flow.steps[0].path, '/api/v1/oauth/token');
  assert.strictEqual(flow.steps[0].body.grant_type, 'authorization_code');
  assert.deepStrictEqual(flow.steps[1].statusAnyOf, [400, 401]);
});

test('emitOAuthFlows: token:missing-grant-type sends POST with empty body', () => {
  const matrix = oauthMatrix({ tokenUrl: '/api/v1/oauth/token' });
  const flows = emitOAuthFlows(matrix);
  const flow = flows.find((f) => f.id === 'oauth:token:missing-grant-type');
  assert.ok(flow);
  assert.strictEqual(flow.steps[0].method, 'POST');
  assert.deepStrictEqual(flow.steps[0].body, {});
  assert.deepStrictEqual(flow.steps[1].statusAnyOf, [400, 401, 422]);
});

test('emitOAuthFlows: token:client-credentials sends POST with client_credentials grant', () => {
  const matrix = oauthMatrix({ tokenUrl: '/api/v1/oauth/token' });
  const flows = emitOAuthFlows(matrix);
  const flow = flows.find((f) => f.id === 'oauth:token:client-credentials');
  assert.ok(flow);
  assert.strictEqual(flow.steps[0].method, 'POST');
  assert.strictEqual(flow.steps[0].body.grant_type, 'client_credentials');
  assert.strictEqual(flow.steps[0].body.client_id, 'probe-client');
  assert.strictEqual(flow.steps[0].body.client_secret, 'probe-secret');
  assert.deepStrictEqual(flow.steps[1].statusAnyOf, [200, 400, 401]);
});

test('emitOAuthFlows: token flows use resolved role path over tokenUrl', () => {
  const matrix = oauthMatrix({
    tokenUrl: '/api/v1/should-not-use',
    roles: {
      authorize: null,
      token: { method: 'POST', path: '/api/v1/auth/token', source: 'operationId' },
      callback: null,
    },
  });
  const flows = emitOAuthFlows(matrix);
  const flow = flows.find((f) => f.id === 'oauth:token:invalid-grant');
  assert.ok(flow);
  assert.strictEqual(flow.steps[0].path, '/api/v1/auth/token');
});

// ---------------------------------------------------------------------------
// Authorize endpoint flows
// ---------------------------------------------------------------------------

test('emitOAuthFlows: emits 2 authorize flows when authorizeUrl present', () => {
  const matrix = oauthMatrix({ authorizeUrl: '/api/v1/oauth/authorize' });
  const flows = emitOAuthFlows(matrix);
  assert.strictEqual(flows.length, 2);

  const ids = flows.map((f) => f.id).sort();
  assert.deepStrictEqual(ids, [
    'oauth:authorize:missing-client-id',
    'oauth:authorize:reachable',
  ]);
});

test('emitOAuthFlows: authorize:reachable sends GET with query params and followRedirects false', () => {
  const matrix = oauthMatrix({ authorizeUrl: '/api/v1/oauth/authorize' });
  const flows = emitOAuthFlows(matrix);
  const flow = flows.find((f) => f.id === 'oauth:authorize:reachable');
  assert.ok(flow);
  assert.strictEqual(flow.steps[0].method, 'GET');
  assert.strictEqual(flow.steps[0].path, '/api/v1/oauth/authorize');
  assert.strictEqual(flow.steps[0].query.response_type, 'code');
  assert.strictEqual(flow.steps[0].query.client_id, 'probe-client');
  assert.strictEqual(flow.steps[0].followRedirects, false);
  assert.deepStrictEqual(flow.steps[1].statusAnyOf, [200, 302, 303]);
});

test('emitOAuthFlows: authorize:missing-client-id sends GET without client_id', () => {
  const matrix = oauthMatrix({ authorizeUrl: '/api/v1/oauth/authorize' });
  const flows = emitOAuthFlows(matrix);
  const flow = flows.find((f) => f.id === 'oauth:authorize:missing-client-id');
  assert.ok(flow);
  assert.strictEqual(flow.steps[0].query.response_type, 'code');
  assert.strictEqual(flow.steps[0].query.client_id, undefined);
  assert.deepStrictEqual(flow.steps[1].statusAnyOf, [302, 400, 401]);
});

test('emitOAuthFlows: authorize flows use resolved role path over authorizeUrl', () => {
  const matrix = oauthMatrix({
    authorizeUrl: '/api/v1/should-not-use',
    roles: {
      authorize: { method: 'GET', path: '/api/v1/auth/authorize', source: 'extension' },
      token: null,
      callback: null,
    },
  });
  const flows = emitOAuthFlows(matrix);
  const flow = flows.find((f) => f.id === 'oauth:authorize:reachable');
  assert.ok(flow);
  assert.strictEqual(flow.steps[0].path, '/api/v1/auth/authorize');
});

// ---------------------------------------------------------------------------
// Callback endpoint flows
// ---------------------------------------------------------------------------

test('emitOAuthFlows: emits 3 callback flows when callbackUrl present', () => {
  const matrix = oauthMatrix({ callbackUrl: '/api/v1/oauth/callback' });
  const flows = emitOAuthFlows(matrix);
  assert.strictEqual(flows.length, 3);

  const ids = flows.map((f) => f.id).sort();
  assert.deepStrictEqual(ids, [
    'oauth:callback:error-param',
    'oauth:callback:no-code',
    'oauth:callback:with-code',
  ]);
});

test('emitOAuthFlows: callback:with-code sends GET with code and state', () => {
  const matrix = oauthMatrix({ callbackUrl: '/api/v1/oauth/callback' });
  const flows = emitOAuthFlows(matrix);
  const flow = flows.find((f) => f.id === 'oauth:callback:with-code');
  assert.ok(flow);
  assert.strictEqual(flow.steps[0].method, 'GET');
  assert.strictEqual(flow.steps[0].path, '/api/v1/oauth/callback');
  assert.strictEqual(flow.steps[0].query.code, 'probe-test-code');
  assert.strictEqual(flow.steps[0].query.state, 'probe-state');
  assert.deepStrictEqual(flow.steps[1].statusAnyOf, [200, 400, 401, 302]);
});

test('emitOAuthFlows: callback:no-code sends GET with no query params', () => {
  const matrix = oauthMatrix({ callbackUrl: '/api/v1/oauth/callback' });
  const flows = emitOAuthFlows(matrix);
  const flow = flows.find((f) => f.id === 'oauth:callback:no-code');
  assert.ok(flow);
  assert.strictEqual(flow.steps[0].query, undefined);
  assert.deepStrictEqual(flow.steps[1].statusAnyOf, [400, 401, 302]);
});

test('emitOAuthFlows: callback:error-param sends GET with error=access_denied', () => {
  const matrix = oauthMatrix({ callbackUrl: '/api/v1/oauth/callback' });
  const flows = emitOAuthFlows(matrix);
  const flow = flows.find((f) => f.id === 'oauth:callback:error-param');
  assert.ok(flow);
  assert.strictEqual(flow.steps[0].query.error, 'access_denied');
  assert.deepStrictEqual(flow.steps[1].statusAnyOf, [400, 401, 302]);
});

test('emitOAuthFlows: callback flows use resolved role path over callbackUrl', () => {
  const matrix = oauthMatrix({
    callbackUrl: '/api/v1/should-not-use',
    roles: {
      authorize: null,
      token: null,
      callback: { method: 'GET', path: '/api/v1/auth/callback', source: 'operationId' },
    },
  });
  const flows = emitOAuthFlows(matrix);
  const flow = flows.find((f) => f.id === 'oauth:callback:with-code');
  assert.ok(flow);
  assert.strictEqual(flow.steps[0].path, '/api/v1/auth/callback');
});

// ---------------------------------------------------------------------------
// All 3 roles together
// ---------------------------------------------------------------------------

test('emitOAuthFlows: emits 8 flows when 3 roles present (no refresh)', () => {
  const matrix = oauthMatrix({
    tokenUrl: '/api/v1/oauth/token',
    authorizeUrl: '/api/v1/oauth/authorize',
    callbackUrl: '/api/v1/oauth/callback',
  });
  const flows = emitOAuthFlows(matrix);
  assert.strictEqual(flows.length, 8);

  const ids = flows.map((f) => f.id).sort();
  assert.deepStrictEqual(ids, [
    'oauth:authorize:missing-client-id',
    'oauth:authorize:reachable',
    'oauth:callback:error-param',
    'oauth:callback:no-code',
    'oauth:callback:with-code',
    'oauth:token:client-credentials',
    'oauth:token:invalid-grant',
    'oauth:token:missing-grant-type',
  ]);
});

test('emitOAuthFlows: emits 11 flows when all 4 roles present (including refresh)', () => {
  const matrix = oauthMatrix({
    tokenUrl: '/api/v1/oauth/token',
    authorizeUrl: '/api/v1/oauth/authorize',
    callbackUrl: '/api/v1/oauth/callback',
    refreshUrl: '/api/v1/oauth/refresh',
  });
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

test('emitOAuthFlows: contract references first available path', () => {
  const matrix = oauthMatrix({
    tokenUrl: '/api/v1/oauth/token',
    authorizeUrl: '/api/v1/oauth/authorize',
    callbackUrl: '/api/v1/oauth/callback',
    source: 'securityScheme:oauth2',
  });
  const flows = emitOAuthFlows(matrix);
  // contract.endpoint should be tokenPath (first in precedence)
  assert.strictEqual(flows[0].contract.endpoint, '/api/v1/oauth/token');
  assert.strictEqual(flows[0].contract.source, 'securityScheme:oauth2');
});

// ---------------------------------------------------------------------------
// Refresh token endpoint flows
// ---------------------------------------------------------------------------

test('emitOAuthFlows: emits 3 refresh flows when refreshUrl present', () => {
  const matrix = oauthMatrix({ refreshUrl: '/api/v1/oauth/refresh' });
  const flows = emitOAuthFlows(matrix);
  assert.strictEqual(flows.length, 3);

  const ids = flows.map((f) => f.id).sort();
  assert.deepStrictEqual(ids, [
    'oauth:refresh-token:happy',
    'oauth:refresh-token:invalid-grant',
    'oauth:refresh-token:missing-token',
  ]);
});

test('emitOAuthFlows: refresh-token:happy sends POST with grant_type=refresh_token', () => {
  const matrix = oauthMatrix({ refreshUrl: '/api/v1/oauth/refresh' });
  const flows = emitOAuthFlows(matrix);
  const flow = flows.find((f) => f.id === 'oauth:refresh-token:happy');
  assert.ok(flow);
  assert.strictEqual(flow.steps[0].method, 'POST');
  assert.strictEqual(flow.steps[0].path, '/api/v1/oauth/refresh');
  assert.strictEqual(flow.steps[0].body.grant_type, 'refresh_token');
  assert.strictEqual(flow.steps[0].body.refresh_token, 'probe-refresh-token-001');
  assert.deepStrictEqual(flow.steps[1].statusAnyOf, [200, 400, 401]);
});

test('emitOAuthFlows: refresh-token:missing-token sends POST without refresh_token', () => {
  const matrix = oauthMatrix({ refreshUrl: '/api/v1/oauth/refresh' });
  const flows = emitOAuthFlows(matrix);
  const flow = flows.find((f) => f.id === 'oauth:refresh-token:missing-token');
  assert.ok(flow);
  assert.strictEqual(flow.steps[0].method, 'POST');
  assert.deepStrictEqual(flow.steps[0].body, { grant_type: 'refresh_token' });
  assert.deepStrictEqual(flow.steps[1].statusAnyOf, [400, 401, 422]);
});

test('emitOAuthFlows: refresh-token:invalid-grant sends POST with wrong grant_type', () => {
  const matrix = oauthMatrix({ refreshUrl: '/api/v1/oauth/refresh' });
  const flows = emitOAuthFlows(matrix);
  const flow = flows.find((f) => f.id === 'oauth:refresh-token:invalid-grant');
  assert.ok(flow);
  assert.strictEqual(flow.steps[0].body.grant_type, 'invalid_grant_type');
  assert.deepStrictEqual(flow.steps[1].statusAnyOf, [400, 401]);
});

test('emitOAuthFlows: refresh flows use resolved role path over refreshUrl', () => {
  const matrix = oauthMatrix({
    refreshUrl: '/api/v1/should-not-use',
    roles: {
      authorize: null,
      token: null,
      callback: null,
      refresh: { method: 'POST', path: '/api/v1/auth/refresh', source: 'operationId' },
    },
  });
  const flows = emitOAuthFlows(matrix);
  const flow = flows.find((f) => f.id === 'oauth:refresh-token:happy');
  assert.ok(flow);
  assert.strictEqual(flow.steps[0].path, '/api/v1/auth/refresh');
});

test('emitOAuthFlows: emits no refresh flows when roles.refresh is null and refreshUrl is null', () => {
  const matrix = oauthMatrix({
    tokenUrl: '/api/v1/oauth/token',
    roles: { authorize: null, token: null, callback: null, refresh: null },
  });
  const flows = emitOAuthFlows(matrix);
  assert.ok(!flows.some((f) => f.id.includes('refresh-token')));
  assert.strictEqual(flows.length, 3); // only token flows
});

// ---------------------------------------------------------------------------
// Absolute URL handling (toRelativePath)
// ---------------------------------------------------------------------------

test('emitOAuthFlows: handles absolute URLs via toRelativePath', () => {
  const matrix = oauthMatrix({
    tokenUrl: 'https://auth.example.com/api/v1/oauth/token',
    authorizeUrl: 'https://auth.example.com/api/v1/oauth/authorize',
  });
  const flows = emitOAuthFlows(matrix);
  const tokenFlow = flows.find((f) => f.id === 'oauth:token:invalid-grant');
  assert.ok(tokenFlow);
  assert.strictEqual(tokenFlow.steps[0].path, '/api/v1/oauth/token');

  const authorizeFlow = flows.find((f) => f.id === 'oauth:authorize:reachable');
  assert.ok(authorizeFlow);
  assert.strictEqual(authorizeFlow.steps[0].path, '/api/v1/oauth/authorize');
});

test('emitOAuthFlows: handles absolute refreshUrl via toRelativePath', () => {
  const matrix = oauthMatrix({
    refreshUrl: 'https://auth.example.com/api/v1/oauth/refresh',
  });
  const flows = emitOAuthFlows(matrix);
  const refreshFlow = flows.find((f) => f.id === 'oauth:refresh-token:happy');
  assert.ok(refreshFlow);
  assert.strictEqual(refreshFlow.steps[0].path, '/api/v1/oauth/refresh');
});

// ---------------------------------------------------------------------------
// oauthCoveredStatuses
// ---------------------------------------------------------------------------

test('oauthCoveredStatuses: returns empty map when oauth is null', () => {
  const result = oauthCoveredStatuses({ oauth: null });
  assert.strictEqual(result.size, 0);
});

test('oauthCoveredStatuses: returns empty map when oauth not detected', () => {
  const result = oauthCoveredStatuses({ oauth: { detected: false } });
  assert.strictEqual(result.size, 0);
});

test('oauthCoveredStatuses: returns covered statuses for token endpoint', () => {
  const matrix = oauthMatrix({ tokenUrl: '/api/v1/oauth/token' });
  const result = oauthCoveredStatuses(matrix);
  assert.strictEqual(result.size, 1);
  const tokenStatuses = result.get('POST /api/v1/oauth/token');
  assert.ok(tokenStatuses);
  assert.ok(tokenStatuses.has(200), 'should cover 200');
  assert.ok(tokenStatuses.has(400), 'should cover 400');
  assert.ok(tokenStatuses.has(401), 'should cover 401');
  assert.ok(tokenStatuses.has(422), 'should cover 422');
});

test('oauthCoveredStatuses: returns covered statuses for authorize endpoint', () => {
  const matrix = oauthMatrix({ authorizeUrl: '/api/v1/oauth/authorize' });
  const result = oauthCoveredStatuses(matrix);
  assert.strictEqual(result.size, 1);
  const authStatuses = result.get('GET /api/v1/oauth/authorize');
  assert.ok(authStatuses);
  assert.ok(authStatuses.has(200), 'should cover 200');
  assert.ok(authStatuses.has(302), 'should cover 302');
  assert.ok(authStatuses.has(303), 'should cover 303');
  assert.ok(authStatuses.has(400), 'should cover 400');
  assert.ok(authStatuses.has(401), 'should cover 401');
});

test('oauthCoveredStatuses: returns covered statuses for callback endpoint', () => {
  const matrix = oauthMatrix({ callbackUrl: '/api/v1/oauth/callback' });
  const result = oauthCoveredStatuses(matrix);
  assert.strictEqual(result.size, 1);
  const cbStatuses = result.get('GET /api/v1/oauth/callback');
  assert.ok(cbStatuses);
  assert.ok(cbStatuses.has(200), 'should cover 200');
  assert.ok(cbStatuses.has(302), 'should cover 302');
  assert.ok(cbStatuses.has(400), 'should cover 400');
  assert.ok(cbStatuses.has(401), 'should cover 401');
});

test('oauthCoveredStatuses: returns covered statuses for refresh endpoint', () => {
  const matrix = oauthMatrix({ refreshUrl: '/api/v1/oauth/refresh' });
  const result = oauthCoveredStatuses(matrix);
  assert.strictEqual(result.size, 1);
  const refreshStatuses = result.get('POST /api/v1/oauth/refresh');
  assert.ok(refreshStatuses);
  assert.ok(refreshStatuses.has(200), 'should cover 200');
  assert.ok(refreshStatuses.has(400), 'should cover 400');
  assert.ok(refreshStatuses.has(401), 'should cover 401');
  assert.ok(refreshStatuses.has(422), 'should cover 422');
});

test('oauthCoveredStatuses: returns 3 entries when 3 roles present (no refresh)', () => {
  const matrix = oauthMatrix({
    tokenUrl: '/api/v1/oauth/token',
    authorizeUrl: '/api/v1/oauth/authorize',
    callbackUrl: '/api/v1/oauth/callback',
  });
  const result = oauthCoveredStatuses(matrix);
  assert.strictEqual(result.size, 3);
});

test('oauthCoveredStatuses: returns 4 entries when all 4 roles present', () => {
  const matrix = oauthMatrix({
    tokenUrl: '/api/v1/oauth/token',
    authorizeUrl: '/api/v1/oauth/authorize',
    callbackUrl: '/api/v1/oauth/callback',
    refreshUrl: '/api/v1/oauth/refresh',
  });
  const result = oauthCoveredStatuses(matrix);
  assert.strictEqual(result.size, 4);
});

test('oauthCoveredStatuses: prefers role path over URL', () => {
  const matrix = oauthMatrix({
    tokenUrl: '/api/v1/old-token',
    roles: {
      authorize: null,
      token: { method: 'POST', path: '/api/v1/new-token', source: 'operationId' },
      callback: null,
    },
  });
  const result = oauthCoveredStatuses(matrix);
  assert.ok(result.has('POST /api/v1/new-token'));
  assert.ok(!result.has('POST /api/v1/old-token'));
});
