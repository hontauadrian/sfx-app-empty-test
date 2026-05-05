'use strict';

/**
 * Fixture-driven tests for runFlowStep and probeFlow.
 *
 * Each test creates a mock HttpClient with canned responses, feeds generated
 * flow steps through runFlowStep, and asserts pass/fail + error messages.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');

// ---------------------------------------------------------------------------
// Helper: mock HTTP server for integration-style flow tests
// ---------------------------------------------------------------------------

async function withMockServer(routes, fn) {
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      for (const route of routes) {
        if (route.match(req.method ?? 'GET', req.url ?? '/')) {
          route.handler(req, res, raw);
          return;
        }
      }
      res.statusCode = 404;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ message: 'not found' }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`, server);
  } finally {
    await new Promise((r) => server.close(() => r()));
  }
}

// ---------------------------------------------------------------------------
// Helper: make a minimal GeneratedFlow
// ---------------------------------------------------------------------------

function makeFlow(overrides = {}) {
  return {
    id: 'test-flow',
    contract: { endpoint: 'POST /api/v1/test', kind: 'test', source: 'test.ts' },
    dependsOn: [],
    onFail: { check: ['test.ts'], implies: 'Test assertion failed.' },
    steps: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: make a minimal FlowContext with a real HttpClient
// ---------------------------------------------------------------------------

function makeCtx(baseUrl, overrides = {}) {
  const { HttpClient } = require('../../probes/http-client');
  return {
    httpClient: new HttpClient(baseUrl),
    bindings: {},
    authHeader: null,
    lastResponse: null,
    flowId: 'test-flow',
    ...overrides,
  };
}

// We dynamically import the TS module via tsx. The test runner must use
// tsx or ts-node. For raw Node, we rely on the compiled output. We use
// a lazy-load helper so the require happens at test time (not parse time).
let _mod;
function loadModule() {
  if (_mod) return _mod;
  try {
    _mod = require('../../probes/assertion-library');
  } catch {
    // If running under tsx, try the .ts path directly
    _mod = require('../../probes/assertion-library.ts');
  }
  return _mod;
}

// ---------------------------------------------------------------------------
// api step
// ---------------------------------------------------------------------------

describe('runFlowStep — api', () => {
  test('api step stores lastResponse and passes', async () => {
    await withMockServer(
      [{
        match: (m, u) => m === 'POST' && u === '/api/v1/auth/register',
        handler: (_req, res) => {
          res.statusCode = 201;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ accessToken: 'tok123', user: { id: 'u1' } }));
        },
      }],
      async (baseUrl) => {
        const { runFlowStep } = loadModule();
        const ctx = makeCtx(baseUrl);
        const flow = makeFlow();
        const step = { kind: 'api', method: 'POST', path: '/api/v1/auth/register', body: { email: 'a@b.com', password: 'pass' } };

        const result = await runFlowStep(step, ctx, 0, flow);
        assert.equal(result.passed, true);
        assert.equal(result.status, 201);
        assert.ok(ctx.lastResponse, 'lastResponse should be set');
        assert.equal(ctx.lastResponse.status, 201);
      },
    );
  });

  test('api step sends Authorization header when authHeader is set', async () => {
    let capturedAuth = null;
    await withMockServer(
      [{
        match: () => true,
        handler: (req, res) => {
          capturedAuth = req.headers.authorization;
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json');
          res.end('{}');
        },
      }],
      async (baseUrl) => {
        const { runFlowStep } = loadModule();
        const ctx = makeCtx(baseUrl, { authHeader: 'my-token-123' });
        const flow = makeFlow();
        const step = { kind: 'api', method: 'GET', path: '/api/v1/me' };

        await runFlowStep(step, ctx, 0, flow);
        assert.ok(capturedAuth, 'Authorization header should be sent');
        assert.match(capturedAuth, /Bearer my-token-123/);
      },
    );
  });

  test('api step does not override explicit Authorization header', async () => {
    let capturedAuth = null;
    await withMockServer(
      [{
        match: () => true,
        handler: (req, res) => {
          capturedAuth = req.headers.authorization;
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json');
          res.end('{}');
        },
      }],
      async (baseUrl) => {
        const { runFlowStep } = loadModule();
        const ctx = makeCtx(baseUrl, { authHeader: 'ctx-token' });
        const flow = makeFlow();
        const step = { kind: 'api', method: 'GET', path: '/x', headers: { Authorization: 'Bearer explicit-token' } };

        await runFlowStep(step, ctx, 0, flow);
        assert.ok(capturedAuth);
        assert.match(capturedAuth, /explicit-token/);
      },
    );
  });

  test('api step resolves ${binding} in path', async () => {
    let capturedUrl = null;
    await withMockServer(
      [{
        match: () => true,
        handler: (req, res) => {
          capturedUrl = req.url;
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json');
          res.end('{}');
        },
      }],
      async (baseUrl) => {
        const { runFlowStep } = loadModule();
        const ctx = makeCtx(baseUrl, { bindings: { resourceId: 'abc-123' } });
        const flow = makeFlow();
        const step = { kind: 'api', method: 'GET', path: '/api/v1/items/${resourceId}' };

        await runFlowStep(step, ctx, 0, flow);
        assert.equal(capturedUrl, '/api/v1/items/abc-123');
      },
    );
  });
});

// ---------------------------------------------------------------------------
// expect step
// ---------------------------------------------------------------------------

describe('runFlowStep — expect', () => {
  test('expect.status passes on match', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', {
      lastResponse: { status: 201, headers: {}, body: { id: '1' }, bodyText: '{"id":"1"}' },
    });
    const flow = makeFlow();
    const step = { kind: 'expect', status: 201 };

    const result = await runFlowStep(step, ctx, 1, flow);
    assert.equal(result.passed, true);
  });

  test('expect.status fails on mismatch with correct error format', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', {
      lastResponse: { status: 400, headers: {}, body: { error: 'bad' }, bodyText: '{"error":"bad"}' },
    });
    const flow = makeFlow({ id: 'my-flow' });
    const step = { kind: 'expect', status: 201 };

    const result = await runFlowStep(step, ctx, 1, flow);
    assert.equal(result.passed, false);
    assert.ok(result.blockReason);
    assert.match(result.blockReason, /FLOW_STEP_FAILED/);
    assert.ok(result.failureContext);
    assert.equal(result.failureContext.contractSource, 'test.ts');
    assert.equal(result.failureContext.implies, 'Test assertion failed.');
    assert.deepEqual(result.failureContext.checkPaths, ['test.ts']);
  });

  test('expect.statusAnyOf passes when status is in list', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', {
      lastResponse: { status: 409, headers: {}, body: {}, bodyText: '{}' },
    });
    const flow = makeFlow();
    const step = { kind: 'expect', statusAnyOf: [400, 409, 422] };

    const result = await runFlowStep(step, ctx, 1, flow);
    assert.equal(result.passed, true);
  });

  test('expect.statusAnyOf fails when status not in list', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', {
      lastResponse: { status: 500, headers: {}, body: {}, bodyText: '{}' },
    });
    const flow = makeFlow();
    const step = { kind: 'expect', statusAnyOf: [400, 409, 422] };

    const result = await runFlowStep(step, ctx, 1, flow);
    assert.equal(result.passed, false);
    assert.match(result.blockReason, /FLOW_STEP_FAILED/);
  });

  test('expect.forbidden fails when status is in forbidden list', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', {
      lastResponse: { status: 500, headers: {}, body: {}, bodyText: 'internal error' },
    });
    const flow = makeFlow();
    const step = { kind: 'expect', forbidden: [500, 502, 503, 504] };

    const result = await runFlowStep(step, ctx, 1, flow);
    assert.equal(result.passed, false);
    assert.match(result.blockReason, /FLOW_STEP_FAILED/);
  });

  test('expect.forbidden passes when status is not forbidden', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', {
      lastResponse: { status: 200, headers: {}, body: {}, bodyText: '{}' },
    });
    const flow = makeFlow();
    const step = { kind: 'expect', forbidden: [500, 502, 503, 504] };

    const result = await runFlowStep(step, ctx, 1, flow);
    assert.equal(result.passed, true);
  });

  test('expect.bodyHas passes when JSON path exists and is non-null', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', {
      lastResponse: { status: 200, headers: {}, body: { user: { id: 'u1' } }, bodyText: '{}' },
    });
    const flow = makeFlow();
    const step = { kind: 'expect', bodyHas: ['user.id'] };

    const result = await runFlowStep(step, ctx, 1, flow);
    assert.equal(result.passed, true);
  });

  test('expect.bodyHas fails when JSON path is null', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', {
      lastResponse: { status: 200, headers: {}, body: { user: { id: null } }, bodyText: '{}' },
    });
    const flow = makeFlow();
    const step = { kind: 'expect', bodyHas: ['user.id'] };

    const result = await runFlowStep(step, ctx, 1, flow);
    assert.equal(result.passed, false);
  });

  test('expect.bodyHas checks response header when path starts with header:', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', {
      lastResponse: { status: 200, headers: { 'set-cookie': 'sess=abc' }, body: {}, bodyText: '{}' },
    });
    const flow = makeFlow();
    const step = { kind: 'expect', bodyHas: ['header:set-cookie'] };

    const result = await runFlowStep(step, ctx, 1, flow);
    assert.equal(result.passed, true);
  });

  test('expect.bodyContainsAny passes when at least one substring found', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', {
      lastResponse: { status: 200, headers: {}, body: {}, bodyText: '<h1>Welcome to Dashboard</h1>' },
    });
    const flow = makeFlow();
    const step = { kind: 'expect', bodyContainsAny: ['Welcome', 'Login'] };

    const result = await runFlowStep(step, ctx, 1, flow);
    assert.equal(result.passed, true);
  });

  test('expect.bodyContainsAny fails when none found', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', {
      lastResponse: { status: 200, headers: {}, body: {}, bodyText: '<h1>Error Page</h1>' },
    });
    const flow = makeFlow();
    const step = { kind: 'expect', bodyContainsAny: ['Welcome', 'Dashboard'] };

    const result = await runFlowStep(step, ctx, 1, flow);
    assert.equal(result.passed, false);
  });

  test('expect.errorFieldMentions passes when field is in errors array', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', {
      lastResponse: {
        status: 400,
        headers: {},
        body: { errors: [{ field: 'email', message: 'required' }] },
        bodyText: '{"errors":[{"field":"email","message":"required"}]}',
      },
    });
    const flow = makeFlow();
    const step = { kind: 'expect', status: 400, errorFieldMentions: 'email' };

    const result = await runFlowStep(step, ctx, 1, flow);
    assert.equal(result.passed, true);
  });

  test('expect.errorFieldMentions passes when field mentioned in body.message', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', {
      lastResponse: {
        status: 400,
        headers: {},
        body: { message: 'Validation failed for field: email' },
        bodyText: '{"message":"Validation failed for field: email"}',
      },
    });
    const flow = makeFlow();
    const step = { kind: 'expect', status: 400, errorFieldMentions: 'email' };

    const result = await runFlowStep(step, ctx, 1, flow);
    assert.equal(result.passed, true);
  });

  test('expect.errorFieldMentions passes via bodyText substring fallback', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', {
      lastResponse: {
        status: 400,
        headers: {},
        body: {},
        bodyText: 'Error: invalid email format',
      },
    });
    const flow = makeFlow();
    const step = { kind: 'expect', status: 400, errorFieldMentions: 'email' };

    const result = await runFlowStep(step, ctx, 1, flow);
    assert.equal(result.passed, true);
  });

  test('expect.errorFieldMentions fails when field is not mentioned', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', {
      lastResponse: {
        status: 400,
        headers: {},
        body: { message: 'Something went wrong' },
        bodyText: '{"message":"Something went wrong"}',
      },
    });
    const flow = makeFlow();
    const step = { kind: 'expect', status: 400, errorFieldMentions: 'email' };

    const result = await runFlowStep(step, ctx, 1, flow);
    assert.equal(result.passed, false);
  });

  test('expect fails when no lastResponse exists', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost');
    const flow = makeFlow();
    const step = { kind: 'expect', status: 200 };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
    assert.match(result.blockReason, /FLOW_STEP_FAILED/);
  });

  test('expect with no assertions passes (pass-through)', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', {
      lastResponse: { status: 200, headers: {}, body: {}, bodyText: '{}' },
    });
    const flow = makeFlow();
    const step = { kind: 'expect' };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, true);
  });
});

// ---------------------------------------------------------------------------
// capture step
// ---------------------------------------------------------------------------

describe('runFlowStep — capture', () => {
  test('capture binds $.accessToken from JSON body', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', {
      lastResponse: {
        status: 200,
        headers: {},
        body: { accessToken: 'jwt-abc', user: { id: 'u42' } },
        bodyText: '{}',
      },
    });
    const flow = makeFlow();
    const step = { kind: 'capture', bindings: { accessToken: '$.accessToken', userId: '$.user.id' } };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, true);
    assert.equal(ctx.bindings.accessToken, 'jwt-abc');
    assert.equal(ctx.bindings.userId, 'u42');
  });

  test('capture falls back to $.token when $.accessToken is missing', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', {
      lastResponse: {
        status: 200,
        headers: {},
        body: { token: 'fallback-token' },
        bodyText: '{}',
      },
    });
    const flow = makeFlow();
    const step = { kind: 'capture', bindings: { accessToken: '$.accessToken' } };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, true);
    assert.equal(ctx.bindings.accessToken, 'fallback-token');
  });

  test('capture binds header:set-cookie from response headers', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', {
      lastResponse: {
        status: 200,
        headers: { 'set-cookie': 'session=xyz; HttpOnly' },
        body: {},
        bodyText: '{}',
      },
    });
    const flow = makeFlow();
    const step = { kind: 'capture', bindings: { sessionCookie: 'header:set-cookie' } };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, true);
    assert.equal(ctx.bindings.sessionCookie, 'session=xyz; HttpOnly');
  });

  test('capture fails when no lastResponse', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost');
    const flow = makeFlow();
    const step = { kind: 'capture', bindings: { tok: '$.accessToken' } };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
  });
});

// ---------------------------------------------------------------------------
// setAuth step
// ---------------------------------------------------------------------------

describe('runFlowStep — setAuth', () => {
  test('setAuth sets authHeader from bindings', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', { bindings: { accessToken: 'my-jwt' } });
    const flow = makeFlow();
    const step = { kind: 'setAuth', binding: 'accessToken' };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, true);
    assert.equal(ctx.authHeader, 'my-jwt');
  });

  test('setAuth fails when binding is missing', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', { bindings: {} });
    const flow = makeFlow();
    const step = { kind: 'setAuth', binding: 'accessToken' };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
    assert.ok(result.blockReason);
    assert.match(result.blockReason, /FLOW_STEP_FAILED/);
  });

  test('setAuth fails when binding is not a string', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', { bindings: { accessToken: 12345 } });
    const flow = makeFlow();
    const step = { kind: 'setAuth', binding: 'accessToken' };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
  });
});

// ---------------------------------------------------------------------------
// logout step
// ---------------------------------------------------------------------------

describe('runFlowStep — logout', () => {
  test('logout clears authHeader and cookie jar', async () => {
    const { runFlowStep } = loadModule();
    const { HttpClient, CookieJar } = require('../../probes/http-client');
    const jar = new CookieJar();
    jar.storeSetCookieHeaders('http://localhost', ['session=abc']);
    const client = new HttpClient('http://localhost', { jar });
    const ctx = {
      httpClient: client,
      bindings: { tok: 'x' },
      authHeader: 'Bearer old-token',
      lastResponse: null,
      flowId: 'test',
    };
    const flow = makeFlow();
    const step = { kind: 'logout' };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, true);
    assert.equal(ctx.authHeader, null);
    assert.equal(jar.buildCookieHeader('http://localhost'), '');
  });
});

// ---------------------------------------------------------------------------
// navigate step
// ---------------------------------------------------------------------------

describe('runFlowStep — navigate', () => {
  test('navigate GETs a page and stores lastResponse', async () => {
    await withMockServer(
      [{
        match: (m, u) => m === 'GET' && u === '/dashboard',
        handler: (_req, res) => {
          res.statusCode = 200;
          res.setHeader('content-type', 'text/html');
          res.end('<h1>Dashboard</h1>');
        },
      }],
      async (baseUrl) => {
        const { runFlowStep } = loadModule();
        const ctx = makeCtx(baseUrl);
        const flow = makeFlow();
        const step = { kind: 'navigate', path: '/dashboard' };

        const result = await runFlowStep(step, ctx, 0, flow);
        assert.equal(result.passed, true);
        assert.equal(result.status, 200);
        assert.ok(ctx.lastResponse);
        assert.ok(ctx.lastResponse.bodyText.includes('Dashboard'));
      },
    );
  });
});

// ---------------------------------------------------------------------------
// wait step
// ---------------------------------------------------------------------------

describe('runFlowStep — wait', () => {
  test('wait delays execution and passes', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost');
    const flow = makeFlow();
    const step = { kind: 'wait', ms: 10 };
    const start = Date.now();

    const result = await runFlowStep(step, ctx, 0, flow);
    const elapsed = Date.now() - start;
    assert.equal(result.passed, true);
    assert.ok(elapsed >= 9, `expected at least 9ms, got ${elapsed}ms`);
  });
});

// ---------------------------------------------------------------------------
// unknown step kind
// ---------------------------------------------------------------------------

describe('runFlowStep — unknown kind', () => {
  test('rejects unknown step kind with UNKNOWN_STEP_KIND', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost', { flowId: 'bad-flow' });
    const flow = makeFlow({ id: 'bad-flow' });
    const step = { kind: 'fillForm', data: { email: 'x' } };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
    assert.match(result.blockReason, /UNKNOWN_STEP_KIND/);
    assert.match(result.blockReason, /bad-flow/);
  });

  test('rejects legacy visit step', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost');
    const flow = makeFlow();
    const step = { visit: '/login' };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
    assert.match(result.blockReason, /UNKNOWN_STEP_KIND/);
  });

  test('rejects legacy submit step', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost');
    const flow = makeFlow();
    const step = { submit: true };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
    assert.match(result.blockReason, /UNKNOWN_STEP_KIND/);
  });

  test('rejects legacy expectToken step', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost');
    const flow = makeFlow();
    const step = { expectToken: 'Welcome' };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
    assert.match(result.blockReason, /UNKNOWN_STEP_KIND/);
  });

  test('rejects legacy expectUrl step', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost');
    const flow = makeFlow();
    const step = { expectUrl: '/dashboard' };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
    assert.match(result.blockReason, /UNKNOWN_STEP_KIND/);
  });

  test('rejects legacy expectStatus step', async () => {
    const { runFlowStep } = loadModule();
    const ctx = makeCtx('http://localhost');
    const flow = makeFlow();
    const step = { expectStatus: 200 };

    const result = await runFlowStep(step, ctx, 0, flow);
    assert.equal(result.passed, false);
    assert.match(result.blockReason, /UNKNOWN_STEP_KIND/);
  });
});

// ---------------------------------------------------------------------------
// probeFlow — chained flow tests
// ---------------------------------------------------------------------------

describe('probeFlow — chained flows', () => {
  test('auth-bootstrap chain: register -> capture -> setAuth -> api -> expect', async () => {
    await withMockServer(
      [
        {
          match: (m, u) => m === 'POST' && u === '/api/v1/auth/register',
          handler: (_req, res) => {
            res.statusCode = 201;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ accessToken: 'jwt-real', user: { id: 'u1' } }));
          },
        },
        {
          match: (m, u) => m === 'GET' && u === '/api/v1/auth/me',
          handler: (req, res) => {
            if (req.headers.authorization && req.headers.authorization.includes('jwt-real')) {
              res.statusCode = 200;
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ id: 'u1', email: 'a@b.com' }));
            } else {
              res.statusCode = 401;
              res.end('{}');
            }
          },
        },
      ],
      async (baseUrl) => {
        const { probeFlow } = loadModule();
        const { HttpClient } = require('../../probes/http-client');
        const client = new HttpClient(baseUrl);

        const flow = makeFlow({
          id: 'chain:auth-bootstrap',
          steps: [
            { kind: 'api', method: 'POST', path: '/api/v1/auth/register', body: { email: 'a@b.com', password: 'pass' } },
            { kind: 'capture', bindings: { accessToken: '$.accessToken', userId: '$.user.id' } },
            { kind: 'setAuth', binding: 'accessToken' },
            { kind: 'api', method: 'GET', path: '/api/v1/auth/me' },
            { kind: 'expect', status: 200 },
          ],
        });

        // makeMatrix stub
        const matrix = {
          raw: {}, overlay: null, compiled: null, pages: [], endpoints: [],
          forms: [], middleware: [],
          authDetection: { registerSurface: '/api/v1/auth/register', loginSurface: '/login', apiPrefix: 'api/v1' },
          bootPlan: { driver: 'worktree-stack' }, scope: 'session', ignoredRoutes: new Set(),
        };

        const results = await probeFlow(client, flow, matrix);
        const allPassed = results.every((r) => r.passed);
        assert.ok(allPassed, `Expected all steps passed. Failures: ${JSON.stringify(results.filter((r) => !r.passed))}`);
      },
    );
  });

  test('capture -> setAuth -> api -> logout -> api -> expect 401 (session lifecycle)', async () => {
    await withMockServer(
      [
        {
          match: (m, u) => m === 'POST' && u === '/api/v1/auth/login',
          handler: (_req, res) => {
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ accessToken: 'session-jwt' }));
          },
        },
        {
          match: (m, u) => m === 'GET' && u === '/api/v1/auth/me',
          handler: (req, res) => {
            if (req.headers.authorization && req.headers.authorization.includes('session-jwt')) {
              res.statusCode = 200;
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ id: 'u1' }));
            } else {
              res.statusCode = 401;
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ message: 'Unauthorized' }));
            }
          },
        },
      ],
      async (baseUrl) => {
        const { probeFlow } = loadModule();
        const { HttpClient } = require('../../probes/http-client');
        const client = new HttpClient(baseUrl);

        const flow = makeFlow({
          id: 'chain:session-lifecycle',
          steps: [
            { kind: 'api', method: 'POST', path: '/api/v1/auth/login', body: { email: 'a@b.com', password: 'pass' } },
            { kind: 'capture', bindings: { accessToken: '$.accessToken' } },
            { kind: 'setAuth', binding: 'accessToken' },
            { kind: 'api', method: 'GET', path: '/api/v1/auth/me' },
            { kind: 'expect', status: 200 },
            { kind: 'logout' },
            { kind: 'api', method: 'GET', path: '/api/v1/auth/me' },
            { kind: 'expect', status: 401 },
          ],
        });

        const matrix = {
          raw: {}, overlay: null, compiled: null, pages: [], endpoints: [],
          forms: [], middleware: [],
          authDetection: { registerSurface: '/api/v1/auth/register', loginSurface: '/login', apiPrefix: 'api/v1' },
          bootPlan: { driver: 'worktree-stack' }, scope: 'session', ignoredRoutes: new Set(),
        };

        const results = await probeFlow(client, flow, matrix);
        const allPassed = results.every((r) => r.passed);
        assert.ok(allPassed, `Expected all steps passed. Failures: ${JSON.stringify(results.filter((r) => !r.passed))}`);
      },
    );
  });

  test('probeFlow stops on first failure', async () => {
    await withMockServer(
      [{
        match: () => true,
        handler: (_req, res) => {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end('{"error":"boom"}');
        },
      }],
      async (baseUrl) => {
        const { probeFlow } = loadModule();
        const { HttpClient } = require('../../probes/http-client');
        const client = new HttpClient(baseUrl);

        const flow = makeFlow({
          steps: [
            { kind: 'api', method: 'GET', path: '/fail' },
            { kind: 'expect', status: 200 },
            { kind: 'api', method: 'GET', path: '/never-reached' },
            { kind: 'expect', status: 200 },
          ],
        });

        const matrix = {
          raw: {}, overlay: null, compiled: null, pages: [], endpoints: [],
          forms: [], middleware: [],
          authDetection: { registerSurface: null, loginSurface: null, apiPrefix: 'api/v1' },
          bootPlan: { driver: 'worktree-stack' }, scope: 'session', ignoredRoutes: new Set(),
        };

        const results = await probeFlow(client, flow, matrix);
        // api step passes (it just stores lastResponse), expect step should fail
        assert.equal(results.length, 2);
        assert.equal(results[0].passed, true); // api step
        assert.equal(results[1].passed, false); // expect step
      },
    );
  });
});

// ---------------------------------------------------------------------------
// extractJsonPath
// ---------------------------------------------------------------------------

describe('extractJsonPath', () => {
  test('extracts nested value', () => {
    const { extractJsonPath } = loadModule();
    assert.equal(extractJsonPath({ user: { id: 42 } }, '$.user.id'), 42);
  });

  test('returns undefined for missing path', () => {
    const { extractJsonPath } = loadModule();
    assert.equal(extractJsonPath({ user: {} }, '$.user.email'), undefined);
  });

  test('handles path without $ prefix', () => {
    const { extractJsonPath } = loadModule();
    assert.equal(extractJsonPath({ name: 'test' }, 'name'), 'test');
  });

  test('returns undefined for null/undefined json', () => {
    const { extractJsonPath } = loadModule();
    assert.equal(extractJsonPath(null, '$.x'), undefined);
    assert.equal(extractJsonPath(undefined, '$.x'), undefined);
  });
});
