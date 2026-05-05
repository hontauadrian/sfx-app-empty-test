'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { emitCookieRefreshRotation } = require('../emitters/cookie-refresh-rotation');
const { emitCookieSession } = require('../emitters/cookie-session');
const { emitCookieCsrfDoubleSubmit } = require('../emitters/cookie-csrf-double-submit');
const { emitCookieOAuthState } = require('../emitters/cookie-oauth-state');
const { emitCookieTenantScope } = require('../emitters/cookie-tenant-scope');
const { emitCookieAppState } = require('../emitters/cookie-app-state');

// Also test via the generate() pipeline to confirm wiring
const { generate } = require('../flows-generator');

// ---------------------------------------------------------------------------
// Helpers: build CookieFlow fixtures
// ---------------------------------------------------------------------------

function refreshFlow(overrides = {}) {
  return {
    name: 'refresh_token',
    role: 'refresh-token',
    issuers: [
      // Register-style: 201 Created (non-idempotent per RFC 7231 §6.3.2 — the
      // emitter must skip this and pick the next rotation-safe issuer).
      { operationId: 'cookieRefreshRegister', path: '/api/v1/probe-ref/cookie-flows/refresh-register', method: 'POST', declaredStatus: 201 },
      // Login-style: 200 OK — rotation-safe seed.
      { operationId: 'cookieRefreshLogin', path: '/api/v1/probe-ref/cookie-flows/refresh-login', method: 'POST', declaredStatus: 200 },
    ],
    consumers: [{ operationId: 'cookieRefreshRotate', path: '/api/v1/probe-ref/cookie-flows/refresh-rotate', method: 'POST', declaredStatus: 200 }],
    clearers: [{ operationId: 'cookieRefreshClear', path: '/api/v1/probe-ref/cookie-flows/refresh-clear', method: 'POST', declaredStatus: 204 }],
    rotators: [{ operationId: 'cookieRefreshRotate', path: '/api/v1/probe-ref/cookie-flows/refresh-rotate', method: 'POST', declaredStatus: 200 }],
    attrs: { httpOnly: true, secure: true, sameSite: 'Strict', path: '/', maxAge: 604800 },
    securitySchemeRef: null,
    diagnostics: [],
    ...overrides,
  };
}

function sessionFlow(overrides = {}) {
  return {
    name: 'pr_session',
    role: 'session',
    issuers: [{ operationId: 'cookieSessionLogin', path: '/api/v1/probe-ref/cookie-flows/session-login', method: 'POST' }],
    consumers: [{ operationId: 'cookieSessionProtected', path: '/api/v1/probe-ref/cookie-flows/session-protected', method: 'GET' }],
    clearers: [{ operationId: 'cookieSessionLogout', path: '/api/v1/probe-ref/cookie-flows/session-logout', method: 'POST' }],
    rotators: [],
    attrs: { httpOnly: true, secure: true, sameSite: 'Strict', path: '/' },
    securitySchemeRef: null,
    diagnostics: [],
    ...overrides,
  };
}

function csrfFlow(overrides = {}) {
  return {
    name: 'pr_xsrf',
    role: 'csrf-double-submit',
    issuers: [{ operationId: 'cookieCsrfIssue', path: '/api/v1/probe-ref/cookie-flows/csrf-issue', method: 'GET' }],
    consumers: [{ operationId: 'cookieCsrfMutate', path: '/api/v1/probe-ref/cookie-flows/csrf-mutate', method: 'POST', headerEcho: 'X-Probe-CSRF-Token' }],
    clearers: [],
    rotators: [],
    attrs: {},
    securitySchemeRef: null,
    diagnostics: [],
    ...overrides,
  };
}

function oauthStateFlow(overrides = {}) {
  return {
    name: 'pr_oauth_state',
    role: 'oauth-state',
    issuers: [{ operationId: 'cookieOAuthStateAuthorize', path: '/api/v1/probe-ref/cookie-flows/oauth-state-authorize', method: 'GET' }],
    consumers: [{ operationId: 'cookieOAuthStateCallback', path: '/api/v1/probe-ref/cookie-flows/oauth-state-callback', method: 'GET' }],
    clearers: [],
    rotators: [],
    attrs: {},
    securitySchemeRef: null,
    diagnostics: [],
    ...overrides,
  };
}

function tenantFlow(overrides = {}) {
  return {
    name: 'pr_tenant',
    role: 'tenant-scope',
    issuers: [{ operationId: 'cookieTenantSet', path: '/api/v1/probe-ref/cookie-flows/tenant-set', method: 'POST' }],
    consumers: [{ operationId: 'cookieTenantScoped', path: '/api/v1/probe-ref/cookie-flows/tenant-scoped', method: 'GET' }],
    clearers: [],
    rotators: [],
    attrs: {},
    securitySchemeRef: null,
    diagnostics: [],
    ...overrides,
  };
}

function localeFlow(overrides = {}) {
  return {
    name: 'pr_locale',
    role: 'locale',
    issuers: [{ operationId: 'cookieLocaleSet', path: '/api/v1/probe-ref/cookie-flows/locale-set', method: 'GET' }],
    consumers: [{ operationId: 'cookieLocaleRead', path: '/api/v1/probe-ref/cookie-flows/locale-read', method: 'GET' }],
    clearers: [],
    rotators: [],
    attrs: { path: '/' },
    securitySchemeRef: null,
    diagnostics: [],
    ...overrides,
  };
}

function themeFlow(overrides = {}) {
  return {
    name: 'pr_theme',
    role: 'theme',
    issuers: [{ operationId: 'cookieThemeSet', path: '/api/v1/probe-ref/cookie-flows/theme-set', method: 'GET' }],
    consumers: [{ operationId: 'cookieThemeRead', path: '/api/v1/probe-ref/cookie-flows/theme-read', method: 'GET' }],
    clearers: [],
    rotators: [],
    attrs: {},
    securitySchemeRef: null,
    diagnostics: [],
    ...overrides,
  };
}

// =========================================================================
// cookie-refresh-rotation
// =========================================================================

test('emitCookieRefreshRotation: returns empty for null flow', () => {
  assert.deepStrictEqual(emitCookieRefreshRotation(null), []);
});

test('emitCookieRefreshRotation: returns empty for wrong role', () => {
  assert.deepStrictEqual(emitCookieRefreshRotation({ role: 'session', issuers: [] }), []);
});

test('emitCookieRefreshRotation: returns empty when no issuers', () => {
  assert.deepStrictEqual(emitCookieRefreshRotation(refreshFlow({ issuers: [] })), []);
});

test('emitCookieRefreshRotation: full chain with rotator + clearer + attrs', () => {
  const flow = refreshFlow();
  const result = emitCookieRefreshRotation(flow);

  assert.strictEqual(result.length, 1);
  const chain = result[0];
  assert.strictEqual(chain.id, 'cookie:refresh-token:refresh_token:rotation');
  assert.strictEqual(chain.contract.kind, 'cookie-refresh-rotation');

  const kinds = chain.steps.map((s) => s.kind);
  // issue -> expect -> capture -> rotate -> expect -> capture -> assert-rotated -> attrs -> clear -> expect -> assert-cleared
  assert.deepStrictEqual(kinds, [
    'api', 'expect', 'capture-cookie',
    'api', 'expect', 'capture-cookie',
    'assert-cookie-rotated',
    'assert-cookie-attrs',
    'api', 'expect', 'assert-cookie-cleared',
  ]);

  // Verify savePaths
  const captures = chain.steps.filter((s) => s.kind === 'capture-cookie');
  assert.strictEqual(captures[0].savePath, 'cookie:refresh_token:initial');
  assert.strictEqual(captures[1].savePath, 'cookie:refresh_token:rotated');

  // Verify rotation assertion references initial
  const rotated = chain.steps.find((s) => s.kind === 'assert-cookie-rotated');
  assert.strictEqual(rotated.previousFromBag, 'cookie:refresh_token:initial');

  // Verify attrs are passed through from declaration
  const attrs = chain.steps.find((s) => s.kind === 'assert-cookie-attrs');
  assert.deepStrictEqual(attrs.expected, flow.attrs);
});

test('emitCookieRefreshRotation: chain without clearer omits clear steps', () => {
  const flow = refreshFlow({ clearers: [] });
  const result = emitCookieRefreshRotation(flow);

  assert.strictEqual(result.length, 1);
  const chain = result[0];
  const kinds = chain.steps.map((s) => s.kind);
  assert.ok(!kinds.includes('assert-cookie-cleared'), 'should not include clear assertion');
  assert.ok(!kinds.includes('api') || kinds.lastIndexOf('api') === 3,
    'should not have API call after rotation assertion');
});

test('emitCookieRefreshRotation: chain without attrs omits attrs step', () => {
  const flow = refreshFlow({ attrs: {} });
  const result = emitCookieRefreshRotation(flow);

  assert.strictEqual(result.length, 1);
  const kinds = result[0].steps.map((s) => s.kind);
  assert.ok(!kinds.includes('assert-cookie-attrs'), 'should not include attrs assertion');
});

test('emitCookieRefreshRotation: issue-only chain when no rotator', () => {
  const flow = refreshFlow({ rotators: [], consumers: [] });
  const result = emitCookieRefreshRotation(flow);

  assert.strictEqual(result.length, 1);
  const chain = result[0];
  assert.strictEqual(chain.id, 'cookie:refresh-token:refresh_token:issue');

  const kinds = chain.steps.map((s) => s.kind);
  assert.ok(!kinds.includes('assert-cookie-rotated'), 'issue-only should not assert rotation');
  assert.ok(kinds.includes('capture-cookie'), 'should still capture cookie');
  assert.ok(kinds.includes('assert-cookie-attrs'), 'should assert attrs if declared');
  assert.ok(kinds.includes('assert-cookie-cleared'), 'should assert clear if clearer declared');
});

test('emitCookieRefreshRotation: issue-only without clearer or attrs', () => {
  const flow = refreshFlow({ rotators: [], consumers: [], clearers: [], attrs: {} });
  const result = emitCookieRefreshRotation(flow);

  assert.strictEqual(result.length, 1);
  const chain = result[0];
  const kinds = chain.steps.map((s) => s.kind);
  assert.deepStrictEqual(kinds, ['api', 'expect', 'capture-cookie']);
});

// ---------------------------------------------------------------------------
// emitCookieRefreshRotation — declaration-driven status (NEVER-HEURISTIC)
// ---------------------------------------------------------------------------

test('emitCookieRefreshRotation: uses declaredStatus from each opRef verbatim', () => {
  const flow = refreshFlow();
  const chain = emitCookieRefreshRotation(flow)[0];
  const expects = chain.steps.filter((s) => s.kind === 'expect');
  // [issuer, rotator, clearer] declared statuses from refreshFlow fixture.
  // Issuer is the 200 login-style entry — emitter skipped the 201 register-style
  // (non-idempotent per RFC 7231 §6.3.2) and picked the rotation-safe one.
  assert.strictEqual(expects[0].status, 200); // issuer (login-style, 200)
  assert.strictEqual(expects[1].status, 200); // rotator
  assert.strictEqual(expects[2].status, 204); // clearer
  // No statusAnyOf anywhere — declaration-only.
  for (const e of expects) {
    assert.strictEqual(e.statusAnyOf, undefined, 'must not use statusAnyOf fallback');
  }
});

test('emitCookieRefreshRotation: skip + diag when issuer has no declaredStatus', () => {
  const flow = refreshFlow({
    issuers: [{ operationId: 'cookieRefreshIssue', path: '/x', method: 'POST', declaredStatus: null }],
  });
  const diagnostics = [];
  const result = emitCookieRefreshRotation(flow, { diagnostics });
  assert.deepStrictEqual(result, []);
  const diag = diagnostics.find((d) => d.code === 'COOKIE_REFRESH_CHAIN_SKIPPED_NO_DECLARED_STATUS');
  assert.ok(diag, 'expected COOKIE_REFRESH_CHAIN_SKIPPED_NO_DECLARED_STATUS diagnostic');
  assert.ok(diag.endpoint.includes('/x'));
});

test('emitCookieRefreshRotation: skip + diag when rotator has no declaredStatus', () => {
  const flow = refreshFlow({
    rotators: [{ operationId: 'cookieRefreshRotate', path: '/y', method: 'POST', declaredStatus: null }],
  });
  const diagnostics = [];
  const result = emitCookieRefreshRotation(flow, { diagnostics });
  assert.deepStrictEqual(result, []);
  const diag = diagnostics.find((d) => d.code === 'COOKIE_REFRESH_CHAIN_SKIPPED_NO_DECLARED_STATUS');
  assert.ok(diag);
  assert.ok(diag.endpoint.includes('/y'));
});

test('emitCookieRefreshRotation: skip + diag when clearer has no declaredStatus', () => {
  const flow = refreshFlow({
    clearers: [{ operationId: 'cookieRefreshClear', path: '/z', method: 'POST', declaredStatus: null }],
  });
  const diagnostics = [];
  const result = emitCookieRefreshRotation(flow, { diagnostics });
  assert.deepStrictEqual(result, []);
  const diag = diagnostics.find((d) => d.code === 'COOKIE_REFRESH_CHAIN_SKIPPED_NO_DECLARED_STATUS');
  assert.ok(diag);
  assert.ok(diag.endpoint.includes('/z'));
});

// ---------------------------------------------------------------------------
// emitCookieRefreshRotation — rotation-safe issuer selection (RFC 7231 §6.3.2)
// ---------------------------------------------------------------------------

test('emitCookieRefreshRotation: prefers 200 issuer over 201 issuer for rotation seed', () => {
  // Default refreshFlow fixture has [register 201, login 200].
  // Emitter must pick login (rotation-safe) — never register (creates state).
  const flow = refreshFlow();
  const chain = emitCookieRefreshRotation(flow)[0];
  const seedStep = chain.steps[0];
  assert.strictEqual(seedStep.kind, 'api');
  assert.strictEqual(seedStep.path, '/api/v1/probe-ref/cookie-flows/refresh-login');
  // First expect must match the picked issuer's declared status (200), not 201.
  const firstExpect = chain.steps[1];
  assert.strictEqual(firstExpect.status, 200);
});

test('emitCookieRefreshRotation: skip + DIAG when only issuer is 201 Created', () => {
  // Single 201 issuer = no rotation-safe seed. Per RFC 7231 §6.3.2 the emitter
  // must NOT use it. Skip with COOKIE_REFRESH_NO_REPEATABLE_ISSUER.
  const flow = refreshFlow({
    issuers: [{ operationId: 'createOnly', path: '/api/v1/x', method: 'POST', declaredStatus: 201 }],
  });
  const diagnostics = [];
  const result = emitCookieRefreshRotation(flow, { diagnostics });
  assert.deepStrictEqual(result, []);
  const diag = diagnostics.find((d) => d.code === 'COOKIE_REFRESH_NO_REPEATABLE_ISSUER');
  assert.ok(diag, 'expected COOKIE_REFRESH_NO_REPEATABLE_ISSUER diagnostic');
  assert.ok(diag.message.includes('refresh_token'));
});

test('emitCookieRefreshRotation: skip + DIAG when only issuer is the rotator itself', () => {
  // The rotator is also declared as an issuer (it re-issues on rotate). If
  // it's the ONLY issuer, picking it as the seed would make step1 == step4.
  // Emitter must skip with COOKIE_REFRESH_NO_REPEATABLE_ISSUER.
  const sameOp = { operationId: 'cookieRefreshRotate', path: '/api/v1/probe-ref/cookie-flows/refresh-rotate', method: 'POST', declaredStatus: 200 };
  const flow = refreshFlow({ issuers: [sameOp], rotators: [sameOp], consumers: [sameOp] });
  const diagnostics = [];
  const result = emitCookieRefreshRotation(flow, { diagnostics });
  assert.deepStrictEqual(result, []);
  const diag = diagnostics.find((d) => d.code === 'COOKIE_REFRESH_NO_REPEATABLE_ISSUER');
  assert.ok(diag, 'expected COOKIE_REFRESH_NO_REPEATABLE_ISSUER when only issuer is rotator');
});

test('emitCookieRefreshRotation: 200 issuer that is also the rotator is filtered out, falls back to next', () => {
  // [rotator-as-issuer 200, login 200] — emitter must filter the rotator-ref
  // and pick the login. Step1 path must be /refresh-login, NOT the rotator path.
  const rotatorOp = { operationId: 'cookieRefreshRotate', path: '/api/v1/probe-ref/cookie-flows/refresh-rotate', method: 'POST', declaredStatus: 200 };
  const loginOp = { operationId: 'cookieRefreshLogin', path: '/api/v1/probe-ref/cookie-flows/refresh-login', method: 'POST', declaredStatus: 200 };
  const flow = refreshFlow({ issuers: [rotatorOp, loginOp], rotators: [rotatorOp], consumers: [rotatorOp] });
  const chain = emitCookieRefreshRotation(flow)[0];
  assert.ok(chain, 'expected a rotation chain');
  assert.strictEqual(chain.steps[0].path, '/api/v1/probe-ref/cookie-flows/refresh-login');
});

// =========================================================================
// cookie-session
// =========================================================================

test('emitCookieSession: returns empty for null flow', () => {
  assert.deepStrictEqual(emitCookieSession(null), []);
});

test('emitCookieSession: returns empty for wrong role', () => {
  assert.deepStrictEqual(emitCookieSession({ role: 'refresh-token', issuers: [] }), []);
});

test('emitCookieSession: returns empty when no issuers', () => {
  assert.deepStrictEqual(emitCookieSession(sessionFlow({ issuers: [] })), []);
});

test('emitCookieSession: full lifecycle with logout (4 flows)', () => {
  const flow = sessionFlow();
  const result = emitCookieSession(flow);

  // lifecycle + cold-access + omit-cookie + tamper-cookie = 4 flows
  assert.strictEqual(result.length, 4);

  const ids = result.map((f) => f.id).sort();
  assert.deepStrictEqual(ids, [
    'cookie:session:pr_session:cold-access',
    'cookie:session:pr_session:lifecycle',
    'cookie:session:pr_session:omit-cookie',
    'cookie:session:pr_session:tamper-cookie',
  ]);
});

test('emitCookieSession: lifecycle chain includes login -> access -> logout -> re-access(401)', () => {
  const flow = sessionFlow();
  const result = emitCookieSession(flow);
  const lifecycle = result.find((f) => f.id.endsWith(':lifecycle'));

  const kinds = lifecycle.steps.map((s) => s.kind);
  // login -> expect -> capture -> attrs -> access -> expect -> logout -> expect -> cleared -> re-access -> expect(401)
  assert.deepStrictEqual(kinds, [
    'api', 'expect', 'capture-cookie', 'assert-cookie-attrs',
    'api', 'expect',
    'api', 'expect', 'assert-cookie-cleared',
    'api', 'expect',
  ]);

  // Last expect should be 401
  const lastExpect = lifecycle.steps[lifecycle.steps.length - 1];
  assert.strictEqual(lastExpect.status, 401);
});

test('emitCookieSession: lifecycle without logout omits clear+re-access steps', () => {
  const flow = sessionFlow({ clearers: [] });
  const result = emitCookieSession(flow);
  const lifecycle = result.find((f) => f.id.endsWith(':lifecycle'));

  const kinds = lifecycle.steps.map((s) => s.kind);
  assert.ok(!kinds.includes('assert-cookie-cleared'), 'no clear assertion without logout');
  // Should end at: login -> expect -> capture -> attrs -> access -> expect
  assert.strictEqual(kinds.length, 6);
});

test('emitCookieSession: lifecycle without attrs omits attrs step', () => {
  const flow = sessionFlow({ attrs: {} });
  const result = emitCookieSession(flow);
  const lifecycle = result.find((f) => f.id.endsWith(':lifecycle'));

  const kinds = lifecycle.steps.map((s) => s.kind);
  assert.ok(!kinds.includes('assert-cookie-attrs'));
});

test('emitCookieSession: cold-access chain is a simple request -> 401', () => {
  const flow = sessionFlow();
  const result = emitCookieSession(flow);
  const cold = result.find((f) => f.id.endsWith(':cold-access'));

  assert.strictEqual(cold.steps.length, 2);
  assert.strictEqual(cold.steps[0].kind, 'api');
  assert.strictEqual(cold.steps[1].kind, 'expect');
  assert.strictEqual(cold.steps[1].status, 401);
});

test('emitCookieSession: omit-cookie chain uses omit-cookie step before access', () => {
  const flow = sessionFlow();
  const result = emitCookieSession(flow);
  const omit = result.find((f) => f.id.endsWith(':omit-cookie'));

  const kinds = omit.steps.map((s) => s.kind);
  // login -> expect -> capture -> omit-cookie -> access -> expect(401)
  assert.deepStrictEqual(kinds, [
    'api', 'expect', 'capture-cookie',
    'omit-cookie',
    'api', 'expect',
  ]);

  const omitStep = omit.steps.find((s) => s.kind === 'omit-cookie');
  assert.strictEqual(omitStep.name, 'pr_session');
});

test('emitCookieSession: tamper-cookie chain uses tamper-cookie step before access', () => {
  const flow = sessionFlow();
  const result = emitCookieSession(flow);
  const tamper = result.find((f) => f.id.endsWith(':tamper-cookie'));

  const kinds = tamper.steps.map((s) => s.kind);
  assert.deepStrictEqual(kinds, [
    'api', 'expect', 'capture-cookie',
    'tamper-cookie',
    'api', 'expect',
  ]);

  const tamperStep = tamper.steps.find((s) => s.kind === 'tamper-cookie');
  assert.strictEqual(tamperStep.name, 'pr_session');
  assert.strictEqual(tamperStep.withValue, 'tampered-invalid-session-probe');
});

test('emitCookieSession: returns empty when no consumer declared', () => {
  const flow = sessionFlow({ consumers: [] });
  const result = emitCookieSession(flow);
  assert.strictEqual(result.length, 0);
});

// =========================================================================
// cookie-csrf-double-submit
// =========================================================================

test('emitCookieCsrfDoubleSubmit: returns empty for null flow', () => {
  assert.deepStrictEqual(emitCookieCsrfDoubleSubmit(null), []);
});

test('emitCookieCsrfDoubleSubmit: returns empty for wrong role', () => {
  assert.deepStrictEqual(emitCookieCsrfDoubleSubmit({ role: 'session', issuers: [] }), []);
});

test('emitCookieCsrfDoubleSubmit: returns empty when no issuers', () => {
  assert.deepStrictEqual(emitCookieCsrfDoubleSubmit(csrfFlow({ issuers: [] })), []);
});

test('emitCookieCsrfDoubleSubmit: returns empty when no headerEcho consumer', () => {
  const flow = csrfFlow({
    consumers: [{ operationId: 'test', path: '/test', method: 'POST' }], // no headerEcho
  });
  assert.deepStrictEqual(emitCookieCsrfDoubleSubmit(flow), []);
});

test('emitCookieCsrfDoubleSubmit: emits 4 distinct chains', () => {
  const flow = csrfFlow();
  const result = emitCookieCsrfDoubleSubmit(flow);

  assert.strictEqual(result.length, 4);

  const ids = result.map((f) => f.id).sort();
  assert.deepStrictEqual(ids, [
    'cookie:csrf-double-submit:pr_xsrf:cold',
    'cookie:csrf-double-submit:pr_xsrf:happy',
    'cookie:csrf-double-submit:pr_xsrf:no-header',
    'cookie:csrf-double-submit:pr_xsrf:tampered-header',
  ]);
});

test('emitCookieCsrfDoubleSubmit: happy chain uses replay-cookie-as-header', () => {
  const flow = csrfFlow();
  const result = emitCookieCsrfDoubleSubmit(flow);
  const happy = result.find((f) => f.id.endsWith(':happy'));

  const kinds = happy.steps.map((s) => s.kind);
  // issue -> expect -> capture -> replay-cookie-as-header -> request -> expect(not 403)
  assert.deepStrictEqual(kinds, [
    'api', 'expect', 'capture-cookie',
    'replay-cookie-as-header',
    'api', 'expect',
  ]);

  const replay = happy.steps.find((s) => s.kind === 'replay-cookie-as-header');
  assert.strictEqual(replay.cookieName, 'pr_xsrf');
  assert.strictEqual(replay.headerName, 'X-Probe-CSRF-Token');

  // Expect statusNot: 403 (not a specific 2xx)
  const lastExpect = happy.steps[happy.steps.length - 1];
  assert.strictEqual(lastExpect.statusNot, 403);
});

test('emitCookieCsrfDoubleSubmit: no-header chain sends request without header echo -> 403', () => {
  const flow = csrfFlow();
  const result = emitCookieCsrfDoubleSubmit(flow);
  const noHeader = result.find((f) => f.id.endsWith(':no-header'));

  const kinds = noHeader.steps.map((s) => s.kind);
  // issue -> expect -> capture -> request (no replay) -> expect 403
  assert.deepStrictEqual(kinds, ['api', 'expect', 'capture-cookie', 'api', 'expect']);

  const lastExpect = noHeader.steps[noHeader.steps.length - 1];
  assert.strictEqual(lastExpect.status, 403);
});

test('emitCookieCsrfDoubleSubmit: tampered-header chain sends wrong header value -> 403', () => {
  const flow = csrfFlow();
  const result = emitCookieCsrfDoubleSubmit(flow);
  const tampered = result.find((f) => f.id.endsWith(':tampered-header'));

  const kinds = tampered.steps.map((s) => s.kind);
  // issue -> expect -> capture -> request with wrong header -> expect 403
  assert.deepStrictEqual(kinds, ['api', 'expect', 'capture-cookie', 'api', 'expect']);

  // The API step should have the header with a tampered value
  const apiStep = tampered.steps[3];
  assert.strictEqual(apiStep.headers['X-Probe-CSRF-Token'], 'tampered-csrf-token-probe');

  const lastExpect = tampered.steps[tampered.steps.length - 1];
  assert.strictEqual(lastExpect.status, 403);
});

test('emitCookieCsrfDoubleSubmit: cold chain is a bare request -> 403', () => {
  const flow = csrfFlow();
  const result = emitCookieCsrfDoubleSubmit(flow);
  const cold = result.find((f) => f.id.endsWith(':cold'));

  assert.strictEqual(cold.steps.length, 2);
  assert.strictEqual(cold.steps[0].kind, 'api');
  assert.strictEqual(cold.steps[1].kind, 'expect');
  assert.strictEqual(cold.steps[1].status, 403);
});

// =========================================================================
// cookie-oauth-state
// =========================================================================

test('emitCookieOAuthState: returns empty for null flow', () => {
  assert.deepStrictEqual(emitCookieOAuthState(null), []);
});

test('emitCookieOAuthState: returns empty for wrong role', () => {
  assert.deepStrictEqual(emitCookieOAuthState({ role: 'session', issuers: [] }), []);
});

test('emitCookieOAuthState: returns empty when no issuers', () => {
  assert.deepStrictEqual(emitCookieOAuthState(oauthStateFlow({ issuers: [] })), []);
});

test('emitCookieOAuthState: returns empty when no consumers', () => {
  assert.deepStrictEqual(emitCookieOAuthState(oauthStateFlow({ consumers: [] })), []);
});

test('emitCookieOAuthState: emits 3 flows (happy + tampered + no-cookie)', () => {
  const flow = oauthStateFlow();
  const result = emitCookieOAuthState(flow);

  assert.strictEqual(result.length, 3);
  const ids = result.map((f) => f.id).sort();
  assert.deepStrictEqual(ids, [
    'cookie:oauth-state:pr_oauth_state:happy',
    'cookie:oauth-state:pr_oauth_state:no-cookie',
    'cookie:oauth-state:pr_oauth_state:tampered',
  ]);
});

test('emitCookieOAuthState: happy chain captures state cookie then callbacks', () => {
  const flow = oauthStateFlow();
  const result = emitCookieOAuthState(flow);
  const happy = result.find((f) => f.id.endsWith(':happy'));

  const kinds = happy.steps.map((s) => s.kind);
  assert.deepStrictEqual(kinds, [
    'api', 'expect', 'capture-cookie',
    'api', 'expect',
  ]);

  // First expect allows 200 or 302 (authorize may redirect)
  assert.deepStrictEqual(happy.steps[1].statusAnyOf, [200, 302]);
  // Last expect is 200
  assert.strictEqual(happy.steps[4].status, 200);
});

test('emitCookieOAuthState: tampered chain uses tamper-cookie before callback', () => {
  const flow = oauthStateFlow();
  const result = emitCookieOAuthState(flow);
  const tampered = result.find((f) => f.id.endsWith(':tampered'));

  const kinds = tampered.steps.map((s) => s.kind);
  assert.deepStrictEqual(kinds, [
    'api', 'expect', 'capture-cookie',
    'tamper-cookie',
    'api', 'expect',
  ]);

  const tamperStep = tampered.steps.find((s) => s.kind === 'tamper-cookie');
  assert.strictEqual(tamperStep.name, 'pr_oauth_state');
  assert.strictEqual(tamperStep.withValue, 'tampered-oauth-state-probe');

  // Expect 4xx
  assert.deepStrictEqual(tampered.steps[5].statusAnyOf, [400, 401, 403]);
});

test('emitCookieOAuthState: no-cookie chain is a bare callback -> 4xx', () => {
  const flow = oauthStateFlow();
  const result = emitCookieOAuthState(flow);
  const noCookie = result.find((f) => f.id.endsWith(':no-cookie'));

  assert.strictEqual(noCookie.steps.length, 2);
  assert.strictEqual(noCookie.steps[0].kind, 'api');
  assert.deepStrictEqual(noCookie.steps[1].statusAnyOf, [400, 401, 403]);
});

test('emitCookieOAuthState: happy chain includes query substitution when consumer has valueSubstitutions', () => {
  const flow = oauthStateFlow({
    consumers: [{
      operationId: 'cookieOAuthStateCallback',
      path: '/api/v1/probe-ref/cookie-flows/oauth-state-callback',
      method: 'GET',
      valueSubstitutions: [{
        cookieName: 'pr_oauth_state',
        target: { in: 'query', name: 'state' },
      }],
    }],
  });
  const result = emitCookieOAuthState(flow);
  const happy = result.find((f) => f.id.endsWith(':happy'));

  // The consumer api step should have a query with state binding sigil
  const consumerStep = happy.steps.find((s) => s.kind === 'api' && s.path.includes('callback'));
  assert.ok(consumerStep.query, 'consumer step should have query');
  assert.strictEqual(consumerStep.query.state, '${cookie:pr_oauth_state:state}');
});

test('emitCookieOAuthState: tampered chain uses substitution from tamper savePath', () => {
  const flow = oauthStateFlow({
    consumers: [{
      operationId: 'cookieOAuthStateCallback',
      path: '/api/v1/probe-ref/cookie-flows/oauth-state-callback',
      method: 'GET',
      valueSubstitutions: [{
        cookieName: 'pr_oauth_state',
        target: { in: 'query', name: 'state' },
      }],
    }],
  });
  const result = emitCookieOAuthState(flow);
  const tampered = result.find((f) => f.id.endsWith(':tampered'));

  // The consumer api step should use the tamper-specific savePath
  const consumerStep = tampered.steps.find((s) => s.kind === 'api' && s.path.includes('callback'));
  assert.ok(consumerStep.query, 'tampered consumer step should have query');
  assert.strictEqual(consumerStep.query.state, '${cookie:pr_oauth_state:state-tamper}');
});

test('emitCookieOAuthState: no substitutions when consumer has no valueSubstitutions', () => {
  const flow = oauthStateFlow(); // default consumer has no valueSubstitutions
  const result = emitCookieOAuthState(flow);
  const happy = result.find((f) => f.id.endsWith(':happy'));

  const consumerStep = happy.steps.find((s) => s.kind === 'api' && s.path.includes('callback'));
  assert.strictEqual(consumerStep.query, undefined, 'consumer step should not have query without valueSubstitutions');
});

test('emitCookieOAuthState: header substitution target injects into step headers', () => {
  const flow = oauthStateFlow({
    consumers: [{
      operationId: 'cookieOAuthStateCallback',
      path: '/api/v1/probe-ref/cookie-flows/oauth-state-callback',
      method: 'GET',
      valueSubstitutions: [{
        cookieName: 'pr_oauth_state',
        target: { in: 'header', name: 'X-OAuth-State' },
      }],
    }],
  });
  const result = emitCookieOAuthState(flow);
  const happy = result.find((f) => f.id.endsWith(':happy'));

  const consumerStep = happy.steps.find((s) => s.kind === 'api' && s.path.includes('callback'));
  assert.ok(consumerStep.headers, 'consumer step should have headers');
  assert.strictEqual(consumerStep.headers['X-OAuth-State'], '${cookie:pr_oauth_state:state}');
});

test('emitCookieOAuthState: body substitution target injects into step body', () => {
  const flow = oauthStateFlow({
    consumers: [{
      operationId: 'cookieOAuthStateCallback',
      path: '/api/v1/probe-ref/cookie-flows/oauth-state-callback',
      method: 'POST',
      valueSubstitutions: [{
        cookieName: 'pr_oauth_state',
        target: { in: 'body', name: '$.stateToken' },
      }],
    }],
  });
  const result = emitCookieOAuthState(flow);
  const happy = result.find((f) => f.id.endsWith(':happy'));

  const consumerStep = happy.steps.find((s) => s.kind === 'api' && s.path.includes('callback'));
  assert.ok(consumerStep.body, 'consumer step should have body');
  assert.strictEqual(consumerStep.body.stateToken, '${cookie:pr_oauth_state:state}');
});

// =========================================================================
// cookie-tenant-scope
// =========================================================================

test('emitCookieTenantScope: returns empty for null flow', () => {
  assert.deepStrictEqual(emitCookieTenantScope(null), []);
});

test('emitCookieTenantScope: returns empty for wrong role', () => {
  assert.deepStrictEqual(emitCookieTenantScope({ role: 'session', issuers: [] }), []);
});

test('emitCookieTenantScope: returns empty when no issuers', () => {
  assert.deepStrictEqual(emitCookieTenantScope(tenantFlow({ issuers: [] })), []);
});

test('emitCookieTenantScope: returns empty when no consumers', () => {
  assert.deepStrictEqual(emitCookieTenantScope(tenantFlow({ consumers: [] })), []);
});

test('emitCookieTenantScope: emits 3 flows (happy + omit + tamper)', () => {
  const flow = tenantFlow();
  const result = emitCookieTenantScope(flow);

  assert.strictEqual(result.length, 3);
  const ids = result.map((f) => f.id).sort();
  assert.deepStrictEqual(ids, [
    'cookie:tenant-scope:pr_tenant:happy',
    'cookie:tenant-scope:pr_tenant:omit',
    'cookie:tenant-scope:pr_tenant:tamper',
  ]);
});

test('emitCookieTenantScope: happy chain sets tenant + accesses resource', () => {
  const flow = tenantFlow();
  const result = emitCookieTenantScope(flow);
  const happy = result.find((f) => f.id.endsWith(':happy'));

  const kinds = happy.steps.map((s) => s.kind);
  // set -> expect -> capture -> access -> expect
  assert.deepStrictEqual(kinds, ['api', 'expect', 'capture-cookie', 'api', 'expect']);
  assert.strictEqual(happy.steps[4].status, 200);
});

test('emitCookieTenantScope: happy chain includes attrs assertion when declared', () => {
  const flow = tenantFlow({ attrs: { httpOnly: true, path: '/' } });
  const result = emitCookieTenantScope(flow);
  const happy = result.find((f) => f.id.endsWith(':happy'));

  const kinds = happy.steps.map((s) => s.kind);
  assert.ok(kinds.includes('assert-cookie-attrs'));
});

test('emitCookieTenantScope: happy chain omits attrs assertion when not declared', () => {
  const flow = tenantFlow({ attrs: {} });
  const result = emitCookieTenantScope(flow);
  const happy = result.find((f) => f.id.endsWith(':happy'));

  const kinds = happy.steps.map((s) => s.kind);
  assert.ok(!kinds.includes('assert-cookie-attrs'));
});

test('emitCookieTenantScope: omit chain uses omit-cookie -> 4xx', () => {
  const flow = tenantFlow();
  const result = emitCookieTenantScope(flow);
  const omit = result.find((f) => f.id.endsWith(':omit'));

  const kinds = omit.steps.map((s) => s.kind);
  assert.deepStrictEqual(kinds, [
    'api', 'expect', 'capture-cookie',
    'omit-cookie',
    'api', 'expect',
  ]);

  const lastExpect = omit.steps[omit.steps.length - 1];
  assert.deepStrictEqual(lastExpect.statusAnyOf, [400, 401, 403]);
});

test('emitCookieTenantScope: tamper chain uses tamper-cookie -> 4xx', () => {
  const flow = tenantFlow();
  const result = emitCookieTenantScope(flow);
  const tamper = result.find((f) => f.id.endsWith(':tamper'));

  const tamperStep = tamper.steps.find((s) => s.kind === 'tamper-cookie');
  assert.strictEqual(tamperStep.name, 'pr_tenant');
  assert.strictEqual(tamperStep.withValue, 'tampered-tenant-id-probe');
});

// =========================================================================
// cookie-app-state (locale, theme, feature-flag)
// =========================================================================

test('emitCookieAppState: returns empty for null flow', () => {
  assert.deepStrictEqual(emitCookieAppState(null), []);
});

test('emitCookieAppState: returns empty for wrong role', () => {
  assert.deepStrictEqual(emitCookieAppState({ role: 'session', issuers: [] }), []);
  assert.deepStrictEqual(emitCookieAppState({ role: 'refresh-token', issuers: [] }), []);
});

test('emitCookieAppState: returns empty when no issuers', () => {
  assert.deepStrictEqual(emitCookieAppState(localeFlow({ issuers: [] })), []);
});

test('emitCookieAppState: locale role emits 2 flows (set + omit)', () => {
  const flow = localeFlow();
  const result = emitCookieAppState(flow);

  assert.strictEqual(result.length, 2);
  const ids = result.map((f) => f.id).sort();
  assert.deepStrictEqual(ids, [
    'cookie:app-state:locale:pr_locale:omit',
    'cookie:app-state:locale:pr_locale:set',
  ]);
});

test('emitCookieAppState: theme role emits 2 flows', () => {
  const flow = themeFlow();
  const result = emitCookieAppState(flow);

  assert.strictEqual(result.length, 2);
  assert.ok(result[0].id.includes('theme'));
  assert.strictEqual(result[0].contract.kind, 'cookie-app-state-theme');
});

test('emitCookieAppState: feature-flag role emits flows', () => {
  const flow = {
    name: 'pr_feature',
    role: 'feature-flag',
    issuers: [{ operationId: 'featureSet', path: '/api/v1/feature-set', method: 'GET' }],
    consumers: [{ operationId: 'featureRead', path: '/api/v1/feature-read', method: 'GET' }],
    clearers: [],
    rotators: [],
    attrs: {},
    diagnostics: [],
  };
  const result = emitCookieAppState(flow);

  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].contract.kind, 'cookie-app-state-feature-flag');
});

test('emitCookieAppState: set chain captures cookie and asserts attrs when declared', () => {
  const flow = localeFlow();
  const result = emitCookieAppState(flow);
  const set = result.find((f) => f.id.endsWith(':set'));

  const kinds = set.steps.map((s) => s.kind);
  // issue -> expect -> capture -> attrs -> read -> expect
  assert.deepStrictEqual(kinds, [
    'api', 'expect', 'capture-cookie', 'assert-cookie-attrs',
    'api', 'expect',
  ]);
});

test('emitCookieAppState: set chain omits attrs when empty', () => {
  const flow = localeFlow({ attrs: {} });
  const result = emitCookieAppState(flow);
  const set = result.find((f) => f.id.endsWith(':set'));

  const kinds = set.steps.map((s) => s.kind);
  assert.ok(!kinds.includes('assert-cookie-attrs'));
});

test('emitCookieAppState: omit chain uses omit-cookie -> still 200 (default)', () => {
  const flow = localeFlow();
  const result = emitCookieAppState(flow);
  const omit = result.find((f) => f.id.endsWith(':omit'));

  const kinds = omit.steps.map((s) => s.kind);
  assert.deepStrictEqual(kinds, [
    'api', 'expect', 'capture-cookie',
    'omit-cookie',
    'api', 'expect',
  ]);

  // App-state omit still returns 200 (falls back to default)
  const lastExpect = omit.steps[omit.steps.length - 1];
  assert.strictEqual(lastExpect.status, 200);
});

test('emitCookieAppState: without consumer emits only set flow (1 flow)', () => {
  const flow = localeFlow({ consumers: [] });
  const result = emitCookieAppState(flow);

  assert.strictEqual(result.length, 1);
  assert.ok(result[0].id.endsWith(':set'));
});

// =========================================================================
// generate() pipeline wiring — verifies cookie emitters are called
// =========================================================================

test('generate: cookie emitters fire when matrix.cookieFlows is populated', () => {
  const matrix = {
    apiEndpoints: [],
    pages: [],
    cookieFlows: [
      refreshFlow(),
      sessionFlow(),
      csrfFlow(),
      oauthStateFlow(),
      tenantFlow(),
      localeFlow(),
      themeFlow(),
    ],
  };

  const result = generate(matrix, { rows: [] }, { ignore: [] });

  // Count cookie-specific flow ids
  const cookieFlowIds = result.flows.filter((f) => f.id.startsWith('cookie:'));
  // refresh: 1, session: 4, csrf: 4, oauth-state: 3, tenant: 3, locale: 2, theme: 2 = 19
  assert.strictEqual(cookieFlowIds.length, 19);
});

// =========================================================================
// requestBodyExample — emitter body-passing tests
// =========================================================================

test('emitCookieTenantScope: issuer api steps include body when requestBodyExample is set', () => {
  const flow = tenantFlow();
  flow.issuers[0].requestBodyExample = { tenantId: 'probe-tenant-a' };
  const result = emitCookieTenantScope(flow);

  assert.strictEqual(result.length, 3);

  for (const f of result) {
    const issuerStep = f.steps.find((s) => s.kind === 'api' && s.path === flow.issuers[0].path);
    assert.ok(issuerStep, `flow ${f.id} should have issuer api step`);
    assert.deepStrictEqual(issuerStep.body, { tenantId: 'probe-tenant-a' },
      `flow ${f.id} issuer api step should carry declared body`);
  }
});

test('emitCookieTenantScope: issuer api steps have no body when requestBodyExample is undefined', () => {
  const flow = tenantFlow();
  // requestBodyExample not set (undefined) — no body on steps
  const result = emitCookieTenantScope(flow);

  assert.strictEqual(result.length, 3);
  for (const f of result) {
    const issuerStep = f.steps.find((s) => s.kind === 'api' && s.path === flow.issuers[0].path);
    assert.strictEqual(issuerStep.body, undefined,
      `flow ${f.id} issuer api step should NOT have body when requestBodyExample is undefined`);
  }
});

test('emitCookieTenantScope: returns empty when POST issuer has requestBodyExample=null (undeclared)', () => {
  const flow = tenantFlow();
  flow.issuers[0].requestBodyExample = null;
  const result = emitCookieTenantScope(flow);

  assert.strictEqual(result.length, 0, 'POST issuer with null requestBodyExample should skip flows');
});

test('emitCookieSession: issuer api steps include body when requestBodyExample is set', () => {
  const flow = sessionFlow();
  flow.issuers[0].requestBodyExample = { username: 'test', password: 'pass' };
  const result = emitCookieSession(flow);

  // lifecycle + cold-access + omit + tamper = 4
  assert.strictEqual(result.length, 4);

  // Flows with issuer steps should have body (lifecycle, omit, tamper — not cold-access)
  const lifecycle = result.find((f) => f.id.endsWith(':lifecycle'));
  const issuerStep = lifecycle.steps[0];
  assert.deepStrictEqual(issuerStep.body, { username: 'test', password: 'pass' });
});

test('emitCookieSession: returns empty when POST issuer has requestBodyExample=null', () => {
  const flow = sessionFlow();
  flow.issuers[0].requestBodyExample = null;
  const result = emitCookieSession(flow);
  assert.strictEqual(result.length, 0);
});

test('emitCookieRefreshRotation: issuer api steps include body when requestBodyExample is set', () => {
  const flow = refreshFlow();
  // The emitter picks the rotation-safe issuer (login-style at index 1, 200);
  // index 0 is the register-style 201 which is skipped per RFC 7231 §6.3.2.
  flow.issuers[1].requestBodyExample = { credentials: 'initial-grant' };
  const result = emitCookieRefreshRotation(flow);

  assert.strictEqual(result.length, 1);
  const chain = result[0];
  const issuerStep = chain.steps[0];
  assert.deepStrictEqual(issuerStep.body, { credentials: 'initial-grant' });
});

test('emitCookieRefreshRotation: returns empty when POST issuer has requestBodyExample=null', () => {
  const flow = refreshFlow();
  // Set null example on the rotation-safe (login) issuer the emitter actually picks.
  flow.issuers[1].requestBodyExample = null;
  const result = emitCookieRefreshRotation(flow);
  assert.strictEqual(result.length, 0);
});

test('emitCookieCsrfDoubleSubmit: GET issuer with no requestBodyExample works normally', () => {
  const flow = csrfFlow();
  // GET issuer — no requestBodyExample
  const result = emitCookieCsrfDoubleSubmit(flow);
  assert.strictEqual(result.length, 4);

  // No body on issuer steps
  for (const f of result) {
    const issuerSteps = f.steps.filter((s) => s.kind === 'api' && s.path === flow.issuers[0].path);
    for (const step of issuerSteps) {
      assert.strictEqual(step.body, undefined, 'GET issuer should not have body');
    }
  }
});

test('emitCookieAppState: GET issuer with no requestBodyExample works normally', () => {
  const flow = localeFlow();
  const result = emitCookieAppState(flow);
  assert.strictEqual(result.length, 2);

  for (const f of result) {
    const issuerSteps = f.steps.filter((s) => s.kind === 'api' && s.path === flow.issuers[0].path);
    for (const step of issuerSteps) {
      assert.strictEqual(step.body, undefined, 'GET issuer should not have body');
    }
  }
});

test('emitCookieOAuthState: GET issuer with no requestBodyExample works normally', () => {
  const flow = oauthStateFlow();
  const result = emitCookieOAuthState(flow);
  assert.strictEqual(result.length, 3);
});

// =========================================================================
// generate() pipeline — existing tests
// =========================================================================

test('generate: empty cookieFlows produces no cookie flows', () => {
  const matrix = {
    apiEndpoints: [],
    pages: [],
    cookieFlows: [],
  };

  const result = generate(matrix, { rows: [] }, { ignore: [] });
  const cookieFlowIds = result.flows.filter((f) => f.id.startsWith('cookie:'));
  assert.strictEqual(cookieFlowIds.length, 0);
});

test('generate: missing cookieFlows property produces no cookie flows', () => {
  const matrix = {
    apiEndpoints: [],
    pages: [],
  };

  const result = generate(matrix, { rows: [] }, { ignore: [] });
  const cookieFlowIds = result.flows.filter((f) => f.id.startsWith('cookie:'));
  assert.strictEqual(cookieFlowIds.length, 0);
});

test('generate: cookieFlows entries with null role are skipped', () => {
  const matrix = {
    apiEndpoints: [],
    pages: [],
    cookieFlows: [
      { name: 'unknown_cookie', role: null, issuers: [], consumers: [], clearers: [], rotators: [], attrs: {}, diagnostics: [] },
    ],
  };

  const result = generate(matrix, { rows: [] }, { ignore: [] });
  const cookieFlowIds = result.flows.filter((f) => f.id.startsWith('cookie:'));
  assert.strictEqual(cookieFlowIds.length, 0);
});

test('generate: cookieFlows entry with custom role is skipped (no emitter for custom)', () => {
  const matrix = {
    apiEndpoints: [],
    pages: [],
    cookieFlows: [
      { name: 'custom_cookie', role: 'custom', issuers: [{ operationId: 'x', path: '/x', method: 'GET' }], consumers: [], clearers: [], rotators: [], attrs: {}, diagnostics: [] },
    ],
  };

  const result = generate(matrix, { rows: [] }, { ignore: [] });
  const cookieFlowIds = result.flows.filter((f) => f.id.startsWith('cookie:'));
  assert.strictEqual(cookieFlowIds.length, 0);
});

// =========================================================================
// Modifier-step placement invariant
// =========================================================================

test('modifier steps (omit-cookie, tamper-cookie, replay-cookie-as-header) are always followed by api step', () => {
  const allFlows = [
    ...emitCookieRefreshRotation(refreshFlow()),
    ...emitCookieSession(sessionFlow()),
    ...emitCookieCsrfDoubleSubmit(csrfFlow()),
    ...emitCookieOAuthState(oauthStateFlow()),
    ...emitCookieTenantScope(tenantFlow()),
    ...emitCookieAppState(localeFlow()),
  ];

  const modifierKinds = new Set(['omit-cookie', 'tamper-cookie', 'replay-cookie-as-header']);

  for (const flow of allFlows) {
    for (let idx = 0; idx < flow.steps.length; idx++) {
      const step = flow.steps[idx];
      if (modifierKinds.has(step.kind)) {
        const next = flow.steps[idx + 1];
        assert.ok(next, `Modifier step ${step.kind} at index ${idx} in flow ${flow.id} has no following step`);
        assert.strictEqual(next.kind, 'api',
          `Modifier step ${step.kind} at index ${idx} in flow ${flow.id} must be followed by api step, got ${next.kind}`);
      }
    }
  }
});

// =========================================================================
// All emitted flows have required fields
// =========================================================================

test('all cookie flows have required top-level fields', () => {
  const allFlows = [
    ...emitCookieRefreshRotation(refreshFlow()),
    ...emitCookieSession(sessionFlow()),
    ...emitCookieCsrfDoubleSubmit(csrfFlow()),
    ...emitCookieOAuthState(oauthStateFlow()),
    ...emitCookieTenantScope(tenantFlow()),
    ...emitCookieAppState(localeFlow()),
    ...emitCookieAppState(themeFlow()),
  ];

  for (const flow of allFlows) {
    assert.ok(flow.id, `flow missing id`);
    assert.ok(flow.contract, `flow ${flow.id} missing contract`);
    assert.ok(flow.contract.kind, `flow ${flow.id} missing contract.kind`);
    assert.ok(Array.isArray(flow.steps), `flow ${flow.id} missing steps array`);
    assert.ok(flow.steps.length > 0, `flow ${flow.id} has empty steps`);
    assert.ok(Array.isArray(flow.dependsOn), `flow ${flow.id} missing dependsOn`);
    assert.ok(flow.onFail, `flow ${flow.id} missing onFail`);
    assert.ok(typeof flow.onFail.implies === 'string', `flow ${flow.id} missing onFail.implies`);
  }
});

// =========================================================================
// generate() — endpoint-happy suppression for cookie-guarded endpoints
// =========================================================================

// Helper: build a minimal apiEndpoint entry that would normally emit endpoint-happy
function makeApiEndpoint(method, path, extras = {}) {
  return {
    method,
    path,
    file: 'test.controller.ts',
    framework: 'nest',
    guard: 'public',
    inputSchemaRef: null,
    zodContract: null,
    queryContract: null,
    responseContract: null,
    authDecorators: null,
    securityRequirement: [],
    parameters: [],
    swaggerDeclared: { statuses: [200] },
    ...extras,
  };
}

test('generate: endpoint-happy is suppressed for cookie-flow consumer endpoints', () => {
  // A session consumer endpoint that would normally get endpoint-happy
  const consumerEp = makeApiEndpoint('GET', '/api/v1/probe-ref/cookie-flows/session-protected');
  const matrix = {
    apiEndpoints: [consumerEp],
    pages: [],
    cookieFlows: [sessionFlow()],
  };

  const result = generate(matrix, { rows: [] }, { ignore: [] });

  // Should NOT have endpoint-happy for the consumer path
  const happyFlows = result.flows.filter(
    (f) => f.contract.kind === 'endpoint-happy' && f.contract.endpoint === 'GET /api/v1/probe-ref/cookie-flows/session-protected'
  );
  assert.strictEqual(happyFlows.length, 0, 'cookie consumer should not get endpoint-happy');

  // Should have the DIAG
  const diags = result.diagnostics.filter(
    (d) => d.code === 'ENDPOINT_HAPPY_SKIPPED_COOKIE_GUARDED' && d.endpoint === 'GET /api/v1/probe-ref/cookie-flows/session-protected'
  );
  assert.strictEqual(diags.length, 1, 'should emit DIAG for skipped consumer');
  assert.ok(diags[0].message.includes('pr_session'), 'DIAG should name the cookie');
  assert.ok(diags[0].message.includes('session'), 'DIAG should name the role');
});

test('generate: endpoint-happy is suppressed for cookie-flow rotator endpoints', () => {
  const rotatorEp = makeApiEndpoint('POST', '/api/v1/probe-ref/cookie-flows/refresh-rotate');
  const matrix = {
    apiEndpoints: [rotatorEp],
    pages: [],
    cookieFlows: [refreshFlow()],
  };

  const result = generate(matrix, { rows: [] }, { ignore: [] });

  const happyFlows = result.flows.filter(
    (f) => f.contract.kind === 'endpoint-happy' && f.contract.endpoint === 'POST /api/v1/probe-ref/cookie-flows/refresh-rotate'
  );
  assert.strictEqual(happyFlows.length, 0, 'cookie rotator should not get endpoint-happy');

  // Rotator appears in both consumers and rotators — at least one DIAG
  const diags = result.diagnostics.filter(
    (d) => d.code === 'ENDPOINT_HAPPY_SKIPPED_COOKIE_GUARDED' && d.endpoint === 'POST /api/v1/probe-ref/cookie-flows/refresh-rotate'
  );
  assert.ok(diags.length >= 1, 'should emit DIAG for skipped rotator');
});

test('generate: endpoint-happy is emitted for non-cookie-guarded endpoints', () => {
  // An endpoint that is NOT a cookie consumer/rotator
  const normalEp = makeApiEndpoint('GET', '/api/v1/users');
  const matrix = {
    apiEndpoints: [normalEp],
    pages: [],
    cookieFlows: [sessionFlow()],
  };

  const result = generate(matrix, { rows: [] }, { ignore: [] });

  const happyFlows = result.flows.filter(
    (f) => (f.contract.kind === 'endpoint-happy' || f.contract.kind === 'endpoint-stub-untyped') && f.contract.endpoint === 'GET /api/v1/users'
  );
  assert.strictEqual(happyFlows.length, 1, 'non-cookie endpoint should still get endpoint-happy');

  // No DIAG for this endpoint
  const diags = result.diagnostics.filter(
    (d) => d.code === 'ENDPOINT_HAPPY_SKIPPED_COOKIE_GUARDED' && d.endpoint === 'GET /api/v1/users'
  );
  assert.strictEqual(diags.length, 0, 'non-cookie endpoint should not get skip DIAG');
});

test('generate: endpoint-happy suppressed for all cookie-flow roles (csrf, oauth, tenant, locale, theme)', () => {
  // Build consumer endpoints for every cookie-flow role
  const endpoints = [
    makeApiEndpoint('POST', '/api/v1/probe-ref/cookie-flows/csrf-mutate'),
    makeApiEndpoint('GET', '/api/v1/probe-ref/cookie-flows/oauth-state-callback'),
    makeApiEndpoint('GET', '/api/v1/probe-ref/cookie-flows/tenant-scoped'),
    makeApiEndpoint('GET', '/api/v1/probe-ref/cookie-flows/locale-read'),
    makeApiEndpoint('GET', '/api/v1/probe-ref/cookie-flows/theme-read'),
  ];
  const matrix = {
    apiEndpoints: endpoints,
    pages: [],
    cookieFlows: [
      csrfFlow(),
      oauthStateFlow(),
      tenantFlow(),
      localeFlow(),
      themeFlow(),
    ],
  };

  const result = generate(matrix, { rows: [] }, { ignore: [] });

  const consumerPaths = [
    'POST /api/v1/probe-ref/cookie-flows/csrf-mutate',
    'GET /api/v1/probe-ref/cookie-flows/oauth-state-callback',
    'GET /api/v1/probe-ref/cookie-flows/tenant-scoped',
    'GET /api/v1/probe-ref/cookie-flows/locale-read',
    'GET /api/v1/probe-ref/cookie-flows/theme-read',
  ];

  for (const cp of consumerPaths) {
    const happyFlows = result.flows.filter(
      (f) => f.contract.kind === 'endpoint-happy' && f.contract.endpoint === cp
    );
    assert.strictEqual(happyFlows.length, 0, `${cp} should not get endpoint-happy`);
  }

  // All should have DIAGs
  const diags = result.diagnostics.filter((d) => d.code === 'ENDPOINT_HAPPY_SKIPPED_COOKIE_GUARDED');
  assert.ok(diags.length >= consumerPaths.length, `should have at least ${consumerPaths.length} DIAGs, got ${diags.length}`);
});

test('generate: cookie-flow with no consumers does not suppress any endpoint-happy', () => {
  const normalEp = makeApiEndpoint('POST', '/api/v1/probe-ref/cookie-flows/diags/no-consumer');
  const matrix = {
    apiEndpoints: [normalEp],
    pages: [],
    cookieFlows: [{
      name: 'orphan_cookie',
      role: 'session',
      issuers: [{ operationId: 'x', path: '/api/v1/x', method: 'POST' }],
      consumers: [],
      clearers: [],
      rotators: [],
      attrs: {},
      securitySchemeRef: null,
      diagnostics: [],
    }],
  };

  const result = generate(matrix, { rows: [] }, { ignore: [] });

  const happyFlows = result.flows.filter(
    (f) => (f.contract.kind === 'endpoint-happy' || f.contract.kind === 'endpoint-stub-untyped') && f.contract.endpoint === 'POST /api/v1/probe-ref/cookie-flows/diags/no-consumer'
  );
  assert.strictEqual(happyFlows.length, 1, 'endpoint not in any consumer list should keep endpoint-happy');
});
