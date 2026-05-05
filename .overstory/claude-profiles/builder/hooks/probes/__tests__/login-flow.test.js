'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  emitLoginFlowFlows,
} = require('../flows-generator');

// ---------------------------------------------------------------------------
// emitLoginFlowFlows — gating
// ---------------------------------------------------------------------------

test('emitLoginFlowFlows: returns empty when no x-auth-flow extension', () => {
  const ep = {
    method: 'POST',
    path: '/api/v1/auth/login',
    file: 'auth.ts',
    swaggerDeclared: { statuses: [200, 401], extensions: {} },
    zodContract: { sampleValid: { email: 'a@b.com', password: 'pw' }, fields: [{ name: 'email' }, { name: 'password' }] },
  };
  assert.deepStrictEqual(emitLoginFlowFlows(ep, {}), []);
});

test('emitLoginFlowFlows: returns empty when x-auth-flow is not login', () => {
  const ep = {
    method: 'POST',
    path: '/api/v1/auth/register',
    file: 'auth.ts',
    swaggerDeclared: { statuses: [201], extensions: { 'x-auth-flow': 'register' } },
    zodContract: { sampleValid: { email: 'a@b.com', password: 'pw' }, fields: [{ name: 'email' }, { name: 'password' }] },
  };
  assert.deepStrictEqual(emitLoginFlowFlows(ep, {}), []);
});

test('emitLoginFlowFlows: returns empty for non-POST method', () => {
  const ep = {
    method: 'GET',
    path: '/api/v1/auth/login',
    file: 'auth.ts',
    swaggerDeclared: { statuses: [200], extensions: { 'x-auth-flow': 'login' } },
  };
  assert.deepStrictEqual(emitLoginFlowFlows(ep, {}), []);
});

test('emitLoginFlowFlows: returns empty when extensions is missing', () => {
  const ep = {
    method: 'POST',
    path: '/api/v1/auth/login',
    file: 'auth.ts',
    swaggerDeclared: { statuses: [200, 401] },
  };
  assert.deepStrictEqual(emitLoginFlowFlows(ep, {}), []);
});

// ---------------------------------------------------------------------------
// emitLoginFlowFlows — happy flow
// ---------------------------------------------------------------------------

test('emitLoginFlowFlows: emits happy flow with declared 2xx status', () => {
  const ep = {
    method: 'POST',
    path: '/api/v1/probe-ref/auth-flows/login',
    file: 'auth-flows.controller.ts',
    swaggerDeclared: { statuses: [200, 401], extensions: { 'x-auth-flow': 'login', 'x-auth-flow-credential': 'password' } },
    zodContract: { sampleValid: { email: 'test@test.com', password: 'Password1!' }, fields: [{ name: 'email' }, { name: 'password' }] },
  };
  const flows = emitLoginFlowFlows(ep, {});
  const happy = flows.find((f) => f.id.includes(':login:happy'));
  assert.ok(happy, 'should emit happy flow');
  assert.strictEqual(happy.contract.kind, 'login-flow');
  assert.strictEqual(happy.contract.endpoint, 'POST /api/v1/probe-ref/auth-flows/login');
  assert.strictEqual(happy.steps[0].kind, 'api');
  assert.strictEqual(happy.steps[0].method, 'POST');
  assert.deepStrictEqual(happy.steps[0].body, { email: 'test@test.com', password: 'Password1!' });
  assert.strictEqual(happy.steps[1].kind, 'expect');
  assert.strictEqual(happy.steps[1].status, 200);
});

test('emitLoginFlowFlows: uses default 200 when no statuses declared', () => {
  const ep = {
    method: 'POST',
    path: '/api/v1/auth/login',
    file: 'auth.ts',
    swaggerDeclared: { statuses: [], extensions: { 'x-auth-flow': 'login' } },
    zodContract: { sampleValid: { email: 'a@b.com', password: 'pw' }, fields: [{ name: 'email' }, { name: 'password' }] },
  };
  const flows = emitLoginFlowFlows(ep, {});
  const happy = flows.find((f) => f.id.includes(':login:happy'));
  assert.ok(happy, 'should emit happy flow with default 200');
  assert.strictEqual(happy.steps[1].status, 200);
});

test('emitLoginFlowFlows: skips happy flow when only error statuses declared', () => {
  const ep = {
    method: 'POST',
    path: '/api/v1/auth/login',
    file: 'auth.ts',
    swaggerDeclared: { statuses: [401, 500], extensions: { 'x-auth-flow': 'login', 'x-auth-flow-credential': 'password' } },
    zodContract: { sampleValid: { email: 'a@b.com', password: 'pw' }, fields: [{ name: 'email' }, { name: 'password' }] },
  };
  const flows = emitLoginFlowFlows(ep, {});
  const happy = flows.find((f) => f.id.includes(':login:happy'));
  assert.strictEqual(happy, undefined, 'should not emit happy flow when no 2xx declared');
});

test('emitLoginFlowFlows: uses empty body when no zodContract', () => {
  const ep = {
    method: 'POST',
    path: '/api/v1/auth/login',
    file: 'auth.ts',
    swaggerDeclared: { statuses: [200, 401], extensions: { 'x-auth-flow': 'login' } },
  };
  const flows = emitLoginFlowFlows(ep, {});
  const happy = flows.find((f) => f.id.includes(':login:happy'));
  assert.ok(happy);
  assert.deepStrictEqual(happy.steps[0].body, {});
});

// ---------------------------------------------------------------------------
// emitLoginFlowFlows — invalid-credentials flow
// ---------------------------------------------------------------------------

test('emitLoginFlowFlows: emits invalid-credentials flow when 401 declared', () => {
  const ep = {
    method: 'POST',
    path: '/api/v1/probe-ref/auth-flows/login',
    file: 'auth-flows.controller.ts',
    swaggerDeclared: { statuses: [200, 401], extensions: { 'x-auth-flow': 'login', 'x-auth-flow-credential': 'password' } },
    zodContract: { sampleValid: { email: 'test@test.com', password: 'Password1!' }, fields: [{ name: 'email' }, { name: 'password' }] },
  };
  const flows = emitLoginFlowFlows(ep, {});
  const invalid = flows.find((f) => f.id.includes(':login:invalid-credentials'));
  assert.ok(invalid, 'should emit invalid-credentials flow');
  assert.strictEqual(invalid.contract.kind, 'login-flow');
  assert.strictEqual(invalid.steps[0].kind, 'api');
  assert.strictEqual(invalid.steps[0].method, 'POST');
  // The credential field (password) should be corrupted
  assert.strictEqual(invalid.steps[0].body.email, 'test@test.com');
  assert.strictEqual(invalid.steps[0].body.password, 'probe-invalid-credential-00000');
  assert.strictEqual(invalid.steps[1].kind, 'expect');
  assert.strictEqual(invalid.steps[1].status, 401);
});

test('emitLoginFlowFlows: does not emit invalid-credentials when 401 not declared', () => {
  const ep = {
    method: 'POST',
    path: '/api/v1/auth/login',
    file: 'auth.ts',
    swaggerDeclared: { statuses: [200], extensions: { 'x-auth-flow': 'login', 'x-auth-flow-credential': 'password' } },
    zodContract: { sampleValid: { email: 'a@b.com', password: 'pw' }, fields: [{ name: 'email' }, { name: 'password' }] },
  };
  const flows = emitLoginFlowFlows(ep, {});
  const invalid = flows.find((f) => f.id.includes(':login:invalid-credentials'));
  assert.strictEqual(invalid, undefined, 'should not emit invalid-credentials without 401');
  assert.strictEqual(flows.length, 1, 'should only emit happy flow');
});

test('emitLoginFlowFlows: uses empty body for invalid-credentials when no credential field declared', () => {
  const ep = {
    method: 'POST',
    path: '/api/v1/auth/login',
    file: 'auth.ts',
    swaggerDeclared: { statuses: [200, 401], extensions: { 'x-auth-flow': 'login' } },
    zodContract: { sampleValid: { email: 'a@b.com', password: 'pw' }, fields: [{ name: 'email' }, { name: 'password' }] },
  };
  const flows = emitLoginFlowFlows(ep, {});
  const invalid = flows.find((f) => f.id.includes(':login:invalid-credentials'));
  assert.ok(invalid, 'should emit invalid-credentials');
  assert.deepStrictEqual(invalid.steps[0].body, {});
});

test('emitLoginFlowFlows: corrupts credential field even when no zodContract', () => {
  const ep = {
    method: 'POST',
    path: '/api/v1/auth/login',
    file: 'auth.ts',
    swaggerDeclared: { statuses: [200, 401], extensions: { 'x-auth-flow': 'login', 'x-auth-flow-credential': 'password' } },
  };
  const flows = emitLoginFlowFlows(ep, {});
  const invalid = flows.find((f) => f.id.includes(':login:invalid-credentials'));
  assert.ok(invalid);
  // With credential field but no zodContract, body is {} with corrupted credential
  assert.strictEqual(invalid.steps[0].body.password, 'probe-invalid-credential-00000');
});

// ---------------------------------------------------------------------------
// emitLoginFlowFlows — both flows together
// ---------------------------------------------------------------------------

test('emitLoginFlowFlows: emits both happy and invalid-credentials when 200+401 declared', () => {
  const ep = {
    method: 'POST',
    path: '/api/v1/auth/login',
    file: 'auth.ts',
    swaggerDeclared: { statuses: [200, 401], extensions: { 'x-auth-flow': 'login', 'x-auth-flow-credential': 'password' } },
    zodContract: { sampleValid: { email: 'a@b.com', password: 'pw' }, fields: [{ name: 'email' }, { name: 'password' }] },
  };
  const flows = emitLoginFlowFlows(ep, {});
  assert.strictEqual(flows.length, 2);
  assert.ok(flows.find((f) => f.id.includes(':login:happy')));
  assert.ok(flows.find((f) => f.id.includes(':login:invalid-credentials')));
});

test('emitLoginFlowFlows: only invalid-credentials when only 401 declared (no 2xx)', () => {
  const ep = {
    method: 'POST',
    path: '/api/v1/auth/login',
    file: 'auth.ts',
    swaggerDeclared: { statuses: [401], extensions: { 'x-auth-flow': 'login', 'x-auth-flow-credential': 'password' } },
    zodContract: { sampleValid: { email: 'a@b.com', password: 'pw' }, fields: [{ name: 'email' }, { name: 'password' }] },
  };
  const flows = emitLoginFlowFlows(ep, {});
  assert.strictEqual(flows.length, 1);
  assert.ok(flows[0].id.includes(':login:invalid-credentials'));
});

// ---------------------------------------------------------------------------
// emitLoginFlowFlows — flow ID format
// ---------------------------------------------------------------------------

test('emitLoginFlowFlows: flow IDs follow methodPrefix:login:variant pattern', () => {
  const ep = {
    method: 'POST',
    path: '/api/v1/auth/login',
    file: 'auth.ts',
    swaggerDeclared: { statuses: [200, 401], extensions: { 'x-auth-flow': 'login', 'x-auth-flow-credential': 'password' } },
    zodContract: { sampleValid: { email: 'a@b.com', password: 'pw' }, fields: [{ name: 'email' }, { name: 'password' }] },
  };
  const flows = emitLoginFlowFlows(ep, {});
  assert.ok(flows[0].id.match(/^auth-login:post:login:happy$/));
  assert.ok(flows[1].id.match(/^auth-login:post:login:invalid-credentials$/));
});
