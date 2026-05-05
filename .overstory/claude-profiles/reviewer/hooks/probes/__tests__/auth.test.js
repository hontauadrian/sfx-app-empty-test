'use strict';

// Tests for detectors/auth.js — declaration-driven surface detection.
//
// Verifies that deriveAuth:
//   1. Delegates surface paths (login/register/logout) to auth-flows.js
//      (operationId / x-* extension only — no path regex).
//   2. Derives sessionMechanism from frameworks.auth flags (package.json).
//   3. Returns tokenStorage='unknown' + persistsAcrossRefresh=false
//      (source-code sniffing removed — requires overlay declaration).
//   4. Emits DIAG when tokenStorage undeclared but session mechanism known.
//
// Run directly: `node --test __tests__/auth.test.js`

const { test } = require('node:test');
const assert = require('node:assert');
const { deriveAuth } = require('../detectors/auth');

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
    operationId: undefined,
    swaggerDeclared: undefined,
    authDecorators: undefined,
    zodContract: undefined,
    responseContract: undefined,
    securityRequirement: [],
    ...overrides,
  };
}

function makeDiag() {
  const entries = [];
  return {
    entries,
    info: (msg) => entries.push({ level: 'info', message: msg }),
    warn: (msg) => entries.push({ level: 'warn', message: msg }),
    push: (entry) => entries.push(entry),
  };
}

// ---------------------------------------------------------------------------
// Surface detection via auth-flows.js delegation
// ---------------------------------------------------------------------------

test('deriveAuth returns loginSurface from auth-flows.js when operationId=authLogin', () => {
  const endpoints = [
    makeEndpoint({ operationId: 'authLogin', path: '/api/v1/auth/login' }),
  ];
  const diag = makeDiag();
  const result = deriveAuth('/fake', {}, [], endpoints, diag);
  assert.strictEqual(result.loginSurface, '/api/v1/auth/login');
});

test('deriveAuth returns registerSurface from auth-flows.js when operationId=authRegister', () => {
  const endpoints = [
    makeEndpoint({ operationId: 'authRegister', path: '/api/v1/auth/register' }),
  ];
  const diag = makeDiag();
  const result = deriveAuth('/fake', {}, [], endpoints, diag);
  assert.strictEqual(result.registerSurface, '/api/v1/auth/register');
});

test('deriveAuth returns logoutSurface from auth-flows.js when operationId=authLogout', () => {
  const endpoints = [
    makeEndpoint({ operationId: 'authLogout', path: '/api/v1/auth/logout' }),
  ];
  const diag = makeDiag();
  const result = deriveAuth('/fake', {}, [], endpoints, diag);
  assert.strictEqual(result.logoutSurface, '/api/v1/auth/logout');
});

test('deriveAuth returns null surfaces when no operationId or extension declared', () => {
  const endpoints = [
    makeEndpoint({ path: '/api/v1/auth/login' }), // no operationId — NOT detected
  ];
  const diag = makeDiag();
  const result = deriveAuth('/fake', {}, [], endpoints, diag);
  assert.strictEqual(result.loginSurface, null);
  assert.strictEqual(result.registerSurface, null);
  assert.strictEqual(result.logoutSurface, null);
});

test('deriveAuth detects surfaces via x-* extensions', () => {
  const endpoints = [
    makeEndpoint({
      path: '/custom/sign-in',
      swaggerDeclared: { extensions: { 'x-auth-issues-token': true } },
    }),
  ];
  const diag = makeDiag();
  const result = deriveAuth('/fake', {}, [], endpoints, diag);
  assert.strictEqual(result.loginSurface, '/custom/sign-in');
});

test('deriveAuth does NOT use path regex to detect surfaces', () => {
  // Path contains /login but no operationId or extension — must NOT detect
  const endpoints = [
    makeEndpoint({ path: '/api/v1/auth/login' }),
    makeEndpoint({ path: '/api/v1/auth/register' }),
    makeEndpoint({ path: '/api/v1/auth/logout' }),
  ];
  const diag = makeDiag();
  const result = deriveAuth('/fake', {}, [], endpoints, diag);
  assert.strictEqual(result.loginSurface, null);
  assert.strictEqual(result.registerSurface, null);
  assert.strictEqual(result.logoutSurface, null);
});

// ---------------------------------------------------------------------------
// Session mechanism from frameworks.auth flags
// ---------------------------------------------------------------------------

test('deriveAuth sets sessionMechanism=jwt-in-header when frameworks.auth includes jwt', () => {
  const diag = makeDiag();
  const result = deriveAuth('/fake', { auth: ['jwt'] }, [], [], diag);
  assert.strictEqual(result.sessionMechanism, 'jwt-in-header');
});

test('deriveAuth sets sessionMechanism=supabase when frameworks.auth includes supabase', () => {
  const diag = makeDiag();
  const result = deriveAuth('/fake', { auth: ['supabase'] }, [], [], diag);
  assert.strictEqual(result.sessionMechanism, 'supabase');
});

test('deriveAuth sets sessionMechanism=clerk when frameworks.auth includes clerk', () => {
  const diag = makeDiag();
  const result = deriveAuth('/fake', { auth: ['clerk'] }, [], [], diag);
  assert.strictEqual(result.sessionMechanism, 'clerk');
});

test('deriveAuth sets sessionMechanism=auth.js when frameworks.auth includes auth.js', () => {
  const diag = makeDiag();
  const result = deriveAuth('/fake', { auth: ['auth.js'] }, [], [], diag);
  assert.strictEqual(result.sessionMechanism, 'auth.js');
});

test('deriveAuth sets sessionMechanism=unknown when frameworks.auth is empty', () => {
  const diag = makeDiag();
  const result = deriveAuth('/fake', {}, [], [], diag);
  assert.strictEqual(result.sessionMechanism, 'unknown');
});

// ---------------------------------------------------------------------------
// Token storage: always unknown (source sniffing removed)
// ---------------------------------------------------------------------------

test('deriveAuth always returns tokenStorage=unknown (no source-code sniffing)', () => {
  const diag = makeDiag();
  const result = deriveAuth('/fake', {}, [], [], diag);
  assert.strictEqual(result.tokenStorage, 'unknown');
  assert.strictEqual(result.persistsAcrossRefresh, false);
});

// ---------------------------------------------------------------------------
// DIAG emission
// ---------------------------------------------------------------------------

test('deriveAuth emits info DIAG when tokenStorage undeclared but sessionMechanism known', () => {
  const diag = makeDiag();
  deriveAuth('/fake', { auth: ['jwt'] }, [], [], diag);
  const undeclared = diag.entries.find(
    (entry) => typeof entry.message === 'string' && entry.message.includes('AUTH_TOKEN_STORAGE_UNDECLARED')
  );
  assert.ok(undeclared, 'Expected AUTH_TOKEN_STORAGE_UNDECLARED diag');
});

test('deriveAuth does NOT emit tokenStorage DIAG when sessionMechanism is also unknown', () => {
  const diag = makeDiag();
  deriveAuth('/fake', {}, [], [], diag);
  const undeclared = diag.entries.find(
    (entry) => typeof entry.message === 'string' && entry.message.includes('AUTH_TOKEN_STORAGE_UNDECLARED')
  );
  assert.strictEqual(undeclared, undefined);
});

test('deriveAuth forwards auth-flows diagnostics to caller diag', () => {
  // Two endpoints with same operationId should produce AUTH_FLOW_OPID_DUPLICATE
  const endpoints = [
    makeEndpoint({ operationId: 'authLogin', path: '/api/v1/auth/login' }),
    makeEndpoint({ operationId: 'authLogin', path: '/api/v1/auth/login2' }),
  ];
  const diag = makeDiag();
  deriveAuth('/fake', {}, [], endpoints, diag);
  const duplicate = diag.entries.find((entry) => entry.code === 'AUTH_FLOW_OPID_DUPLICATE');
  assert.ok(duplicate, 'Expected AUTH_FLOW_OPID_DUPLICATE diag forwarded from auth-flows.js');
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test('deriveAuth handles null/undefined endpoints gracefully', () => {
  const diag = makeDiag();
  const result = deriveAuth('/fake', {}, [], null, diag);
  assert.strictEqual(result.loginSurface, null);
  assert.strictEqual(result.registerSurface, null);
});

test('deriveAuth handles missing frameworks.auth gracefully', () => {
  const diag = makeDiag();
  const result = deriveAuth('/fake', { auth: undefined }, [], [], diag);
  assert.strictEqual(result.sessionMechanism, 'unknown');
});

test('deriveAuth handles all three surfaces simultaneously', () => {
  const endpoints = [
    makeEndpoint({ operationId: 'authLogin', path: '/auth/login' }),
    makeEndpoint({ operationId: 'authRegister', path: '/auth/register' }),
    makeEndpoint({ operationId: 'authLogout', path: '/auth/logout' }),
  ];
  const diag = makeDiag();
  const result = deriveAuth('/fake', { auth: ['jwt'] }, [], endpoints, diag);
  assert.strictEqual(result.loginSurface, '/auth/login');
  assert.strictEqual(result.registerSurface, '/auth/register');
  assert.strictEqual(result.logoutSurface, '/auth/logout');
  assert.strictEqual(result.sessionMechanism, 'jwt-in-header');
  assert.strictEqual(result.tokenStorage, 'unknown');
  assert.strictEqual(result.persistsAcrossRefresh, false);
});
