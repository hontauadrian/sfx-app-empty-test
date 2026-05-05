'use strict';

/**
 * Unit tests for cookie step kinds (C15) in assertion-library.ts.
 *
 * Tests: capture-cookie, assert-cookie-rotated, assert-cookie-cleared,
 * assert-cookie-attrs, replay-cookie-as-header, omit-cookie, tamper-cookie,
 * modifier-without-request guard.
 *
 * Run with: npx tsx --test __tests__/run-flow-step/cookie-step-kinds.test.js
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Load the RFC 6265bis CookieJar for creating pre-seeded jars
const { CookieJar } = require(path.resolve(
  __dirname, '..', '..', 'probes', 'lib', 'cookie-jar.js'
));

// Lazy-load assertion-library (supports tsx or compiled output)
let _mod;
function loadModule() {
  if (_mod) return _mod;
  try {
    _mod = require('../../probes/assertion-library');
  } catch {
    _mod = require('../../probes/assertion-library.ts');
  }
  return _mod;
}

// Helper: make a minimal FlowContext with a cookie jar
function makeCtx(overrides = {}) {
  const { HttpClient } = require('../../probes/http-client');
  const jar = new CookieJar();
  return {
    httpClient: new HttpClient('http://localhost:3001'),
    bindings: {},
    authHeader: null,
    authSchemeConfig: null,
    lastResponse: null,
    flowId: 'cookie-test',
    envelopeKey: null,
    wsConnection: null,
    cookieJar: jar,
    savedCookieValues: {},
    pendingHeaderInjection: null,
    suppressedCookies: [],
    cookieOverrides: null,
    ...overrides,
  };
}

function makeFlow(overrides = {}) {
  return {
    id: 'cookie-test-flow',
    contract: { endpoint: 'POST /api/v1/test', kind: 'cookie', source: 'cookie-test.ts' },
    dependsOn: [],
    onFail: { check: ['cookie-test.ts'], implies: 'Cookie assertion failed.' },
    steps: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// capture-cookie
// ---------------------------------------------------------------------------

describe('runFlowStep — capture-cookie', () => {
  test('captures cookie value into savedCookieValues when present', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    ctx.cookieJar.capture(['refresh_token=rt-abc123; Path=/; HttpOnly'], 'http://localhost:3001/login');
    const flow = makeFlow();
    const step = { kind: 'capture-cookie', name: 'refresh_token' };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, true);
    assert.equal(ctx.savedCookieValues['cookie:refresh_token'], 'rt-abc123');
    assert.equal(ctx.bindings['cookie:refresh_token'], 'rt-abc123');
  });

  test('captures with custom savePath', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    ctx.cookieJar.capture(['tok=val1; Path=/'], 'http://localhost:3001/');
    const flow = makeFlow();
    const step = { kind: 'capture-cookie', name: 'tok', savePath: 'initial_tok' };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, true);
    assert.equal(ctx.savedCookieValues['initial_tok'], 'val1');
    assert.equal(ctx.bindings['initial_tok'], 'val1');
  });

  test('fails when cookie is not in jar', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    const flow = makeFlow();
    const step = { kind: 'capture-cookie', name: 'nonexistent' };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
    assert.match(result.blockReason, /cookie-not-issued: nonexistent/);
  });
});

// ---------------------------------------------------------------------------
// assert-cookie-rotated
// ---------------------------------------------------------------------------

describe('runFlowStep — assert-cookie-rotated', () => {
  test('passes when value differs from previous', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    ctx.savedCookieValues['cookie:refresh_token'] = 'old-value';
    ctx.cookieJar.capture(['refresh_token=new-value; Path=/'], 'http://localhost:3001/refresh');
    const flow = makeFlow();
    const step = { kind: 'assert-cookie-rotated', name: 'refresh_token', previousFromBag: 'cookie:refresh_token' };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, true);
  });

  test('fails when value is same (no rotation)', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    ctx.savedCookieValues['cookie:tok'] = 'same-val';
    ctx.cookieJar.capture(['tok=same-val; Path=/'], 'http://localhost:3001/');
    const flow = makeFlow();
    const step = { kind: 'assert-cookie-rotated', name: 'tok', previousFromBag: 'cookie:tok' };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
    assert.match(result.blockReason, /value unchanged/);
  });

  test('fails when cookie is absent from jar', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    ctx.savedCookieValues['cookie:tok'] = 'prev';
    const flow = makeFlow();
    const step = { kind: 'assert-cookie-rotated', name: 'tok', previousFromBag: 'cookie:tok' };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
    assert.match(result.blockReason, /cookie absent from jar/);
  });

  test('fails when previousFromBag key not found', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    ctx.cookieJar.capture(['tok=new; Path=/'], 'http://localhost:3001/');
    const flow = makeFlow();
    const step = { kind: 'assert-cookie-rotated', name: 'tok', previousFromBag: 'missing-key' };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
    assert.match(result.blockReason, /bag key "missing-key" not found/);
  });

  test('fails when rotated value is empty string', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    ctx.savedCookieValues['cookie:tok'] = 'old';
    // Capture an empty value (but different from old)
    ctx.cookieJar.capture(['tok=; Path=/'], 'http://localhost:3001/');
    const flow = makeFlow();
    const step = { kind: 'assert-cookie-rotated', name: 'tok', previousFromBag: 'cookie:tok' };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
    assert.match(result.blockReason, /rotated value is empty string/);
  });
});

// ---------------------------------------------------------------------------
// assert-cookie-cleared
// ---------------------------------------------------------------------------

describe('runFlowStep — assert-cookie-cleared', () => {
  test('passes when cookie is cleared and absent', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    // Issue then clear
    ctx.cookieJar.capture(['tok=val; Path=/'], 'http://localhost:3001/');
    ctx.cookieJar.capture(['tok=; Path=/; Max-Age=0'], 'http://localhost:3001/');
    const flow = makeFlow();
    const step = { kind: 'assert-cookie-cleared', name: 'tok' };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, true);
  });

  test('fails when cookie is still present (not cleared)', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    ctx.cookieJar.capture(['tok=val; Path=/'], 'http://localhost:3001/');
    const flow = makeFlow();
    const step = { kind: 'assert-cookie-cleared', name: 'tok' };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
    assert.match(result.blockReason, /still present and NOT cleared/);
  });

  test('fails when cookie was never issued', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    const flow = makeFlow();
    const step = { kind: 'assert-cookie-cleared', name: 'never-seen' };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
    assert.match(result.blockReason, /cookie was never issued/);
  });
});

// ---------------------------------------------------------------------------
// assert-cookie-attrs
// ---------------------------------------------------------------------------

describe('runFlowStep — assert-cookie-attrs', () => {
  test('passes when all declared attrs match', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    ctx.cookieJar.capture(
      ['tok=v; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=300'],
      'http://localhost:3001/'
    );
    const flow = makeFlow();
    const step = {
      kind: 'assert-cookie-attrs',
      name: 'tok',
      expected: { httpOnly: true, secure: true, sameSite: 'Strict', path: '/api', maxAge: 300 },
    };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, true);
  });

  test('fails with diff when attribute mismatches', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    ctx.cookieJar.capture(['tok=v; Path=/; Max-Age=100'], 'http://localhost:3001/');
    const flow = makeFlow();
    const step = {
      kind: 'assert-cookie-attrs',
      name: 'tok',
      expected: { httpOnly: true, maxAge: 300 },
    };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
    assert.match(result.blockReason, /attr drift/);
    assert.match(result.blockReason, /httpOnly/);
    assert.match(result.blockReason, /maxAge/);
  });

  test('fails when cookie is absent from jar', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    const flow = makeFlow();
    const step = {
      kind: 'assert-cookie-attrs',
      name: 'missing',
      expected: { httpOnly: true },
    };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
    assert.match(result.blockReason, /cookie absent from jar/);
  });

  test('passes with partial match (only declared attrs checked)', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    ctx.cookieJar.capture(
      ['tok=v; Path=/; HttpOnly; Secure; SameSite=Lax'],
      'http://localhost:3001/'
    );
    const flow = makeFlow();
    const step = {
      kind: 'assert-cookie-attrs',
      name: 'tok',
      expected: { httpOnly: true },
    };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, true);
  });
});

// ---------------------------------------------------------------------------
// replay-cookie-as-header
// ---------------------------------------------------------------------------

describe('runFlowStep — replay-cookie-as-header', () => {
  test('sets pendingHeaderInjection with cookie value', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    ctx.cookieJar.capture(['XSRF-TOKEN=csrf123; Path=/'], 'http://localhost:3001/');
    const flow = makeFlow({
      steps: [
        { kind: 'replay-cookie-as-header', cookieName: 'XSRF-TOKEN', headerName: 'X-CSRF-Token' },
        { kind: 'api', method: 'POST', path: '/mutate' },
      ],
    });
    const step = flow.steps[0];

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, true);
    assert.deepEqual(ctx.pendingHeaderInjection, { 'X-CSRF-Token': 'csrf123' });
  });

  test('fails when cookie is absent', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    const flow = makeFlow({
      steps: [
        { kind: 'replay-cookie-as-header', cookieName: 'missing', headerName: 'X-Missing' },
        { kind: 'api', method: 'POST', path: '/test' },
      ],
    });
    const step = flow.steps[0];

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
    assert.match(result.blockReason, /cookie absent from jar/);
  });

  test('fails with modifier-without-request when next step is another modifier', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    ctx.cookieJar.capture(['tok=val; Path=/'], 'http://localhost:3001/');
    const flow = makeFlow({
      steps: [
        { kind: 'replay-cookie-as-header', cookieName: 'tok', headerName: 'X-Tok' },
        { kind: 'omit-cookie', name: 'other' },
      ],
    });
    const step = flow.steps[0];

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
    assert.match(result.blockReason, /modifier-without-request/);
  });
});

// ---------------------------------------------------------------------------
// omit-cookie
// ---------------------------------------------------------------------------

describe('runFlowStep — omit-cookie', () => {
  test('sets suppressedCookies with the cookie name', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    const flow = makeFlow({
      steps: [
        { kind: 'omit-cookie', name: 'session' },
        { kind: 'api', method: 'GET', path: '/protected' },
      ],
    });
    const step = flow.steps[0];

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, true);
    assert.deepEqual(ctx.suppressedCookies, ['session']);
  });

  test('fails with modifier-without-request when next step is another modifier', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    const flow = makeFlow({
      steps: [
        { kind: 'omit-cookie', name: 'session' },
        { kind: 'tamper-cookie', name: 'other', withValue: 'bad' },
      ],
    });
    const step = flow.steps[0];

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
    assert.match(result.blockReason, /modifier-without-request/);
  });
});

// ---------------------------------------------------------------------------
// tamper-cookie
// ---------------------------------------------------------------------------

describe('runFlowStep — tamper-cookie', () => {
  test('sets cookieOverrides with the tampered value', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    const flow = makeFlow({
      steps: [
        { kind: 'tamper-cookie', name: 'session', withValue: 'tampered-value' },
        { kind: 'api', method: 'GET', path: '/protected' },
      ],
    });
    const step = flow.steps[0];

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, true);
    assert.deepEqual(ctx.cookieOverrides, { session: 'tampered-value' });
  });

  test('fails with modifier-without-request when next step is replay', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    const flow = makeFlow({
      steps: [
        { kind: 'tamper-cookie', name: 'tok', withValue: 'bad' },
        { kind: 'replay-cookie-as-header', cookieName: 'csrf', headerName: 'X-CSRF' },
      ],
    });
    const step = flow.steps[0];

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
    assert.match(result.blockReason, /modifier-without-request/);
  });

  test('does not mutate the cookie jar value', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx();
    ctx.cookieJar.capture(['tok=original; Path=/'], 'http://localhost:3001/');
    const flow = makeFlow({
      steps: [
        { kind: 'tamper-cookie', name: 'tok', withValue: 'tampered' },
        { kind: 'api', method: 'GET', path: '/test' },
      ],
    });
    const step = flow.steps[0];

    await runFlowStep(step, ctx, 0, flow);
    // Jar value should remain untouched
    assert.equal(ctx.cookieJar.get('tok').value, 'original');
    // Override is set
    assert.equal(ctx.cookieOverrides.tok, 'tampered');
  });
});
