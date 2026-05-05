'use strict';

/**
 * Integration tests for CookieJar wiring in http-smoke flow runner.
 *
 * Tests: cookie auto-replay across requests, concurrent flow isolation,
 * one-shot modifier semantics, Set-Cookie capture from responses.
 *
 * Uses a real HTTP server (node:http) to verify end-to-end cookie behavior.
 *
 * Run with: npx tsx --test __tests__/run-flow-step/http-smoke-jar-wiring.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');

// ---------------------------------------------------------------------------
// Helper: mock HTTP server
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

// Lazy-load assertion-library
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

function makeFlow(overrides = {}) {
  return {
    id: 'jar-wiring-test',
    contract: { endpoint: 'POST /api/v1/test', kind: 'test', source: 'test.ts' },
    dependsOn: [],
    onFail: { check: ['test.ts'], implies: 'Jar wiring assertion failed.' },
    steps: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Flow with two requests: response 1 sets cookie → request 2 includes it
// ---------------------------------------------------------------------------

describe('http-smoke jar wiring — auto-cookie replay', () => {
  test('cookie from response 1 is auto-sent in request 2', async () => {
    let capturedCookieHeader = null;

    await withMockServer(
      [
        {
          match: (m, u) => m === 'POST' && u === '/api/v1/login',
          handler: (_req, res) => {
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.setHeader('set-cookie', 'session=abc123; Path=/; HttpOnly');
            res.end(JSON.stringify({ accessToken: 'tok' }));
          },
        },
        {
          match: (m, u) => m === 'GET' && u === '/api/v1/dashboard',
          handler: (req, res) => {
            capturedCookieHeader = req.headers.cookie ?? null;
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ page: 'dashboard' }));
          },
        },
      ],
      async (baseUrl) => {
        const { probeFlow } = loadModule();
        const { HttpClient } = require('../../probes/http-client');
        const client = new HttpClient(baseUrl);

        const flow = makeFlow({
          steps: [
            { kind: 'api', method: 'POST', path: '/api/v1/login', body: { email: 'a@b.com', password: 'pass' } },
            { kind: 'api', method: 'GET', path: '/api/v1/dashboard' },
          ],
        });

        const matrix = {
          raw: {}, overlay: null, compiled: null, pages: [], endpoints: [],
          forms: [], middleware: [],
          authDetection: { registerSurface: null, loginSurface: null, apiPrefix: 'api/v1' },
          bootPlan: { driver: 'worktree-stack' }, scope: 'session', ignoredRoutes: new Set(),
          responseEnvelope: { successWrapper: null },
        };

        const results = await probeFlow(client, flow, matrix);
        const allPassed = results.every((r) => r.passed);
        assert.ok(allPassed, `Steps should pass. Failures: ${JSON.stringify(results.filter((r) => !r.passed))}`);

        // The second request should have received the session cookie
        assert.ok(capturedCookieHeader, 'Cookie header should be sent on second request');
        assert.ok(capturedCookieHeader.includes('session=abc123'), `Cookie header should contain session=abc123, got: ${capturedCookieHeader}`);
      },
    );
  });

  test('multiple cookies from one response are all replayed', async () => {
    let capturedCookieHeader = null;

    await withMockServer(
      [
        {
          match: (m, u) => m === 'POST' && u === '/api/v1/login',
          handler: (_req, res) => {
            res.setHeader('content-type', 'application/json');
            // Use setHeader with array for multiple Set-Cookie headers
            res.setHeader('set-cookie', [
              'refresh_token=rt1; Path=/; HttpOnly',
              'csrf=tok1; Path=/',
            ]);
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true }));
          },
        },
        {
          match: (m, u) => m === 'GET' && u === '/api/v1/data',
          handler: (req, res) => {
            capturedCookieHeader = req.headers.cookie ?? null;
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.end('{}');
          },
        },
      ],
      async (baseUrl) => {
        const { probeFlow } = loadModule();
        const { HttpClient } = require('../../probes/http-client');
        const client = new HttpClient(baseUrl);

        const flow = makeFlow({
          steps: [
            { kind: 'api', method: 'POST', path: '/api/v1/login', body: {} },
            { kind: 'api', method: 'GET', path: '/api/v1/data' },
          ],
        });

        const matrix = {
          raw: {}, overlay: null, compiled: null, pages: [], endpoints: [],
          forms: [], middleware: [],
          authDetection: { registerSurface: null, loginSurface: null, apiPrefix: 'api/v1' },
          bootPlan: { driver: 'worktree-stack' }, scope: 'session', ignoredRoutes: new Set(),
          responseEnvelope: { successWrapper: null },
        };

        await probeFlow(client, flow, matrix);
        assert.ok(capturedCookieHeader, 'Cookie header should be sent');
        assert.ok(capturedCookieHeader.includes('refresh_token=rt1'), 'Should include refresh_token');
        assert.ok(capturedCookieHeader.includes('csrf=tok1'), 'Should include csrf');
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Concurrent flows: each gets its own jar, no cross-talk
// ---------------------------------------------------------------------------

describe('http-smoke jar wiring — concurrent flow isolation', () => {
  test('parallel flows have independent cookie jars', async () => {
    const capturedCookies = { flow1: null, flow2: null };

    await withMockServer(
      [
        {
          match: (m, u) => m === 'POST' && u === '/api/v1/login-a',
          handler: (_req, res) => {
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.setHeader('set-cookie', 'session=flow-a-cookie; Path=/');
            res.end(JSON.stringify({ ok: true }));
          },
        },
        {
          match: (m, u) => m === 'POST' && u === '/api/v1/login-b',
          handler: (_req, res) => {
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.setHeader('set-cookie', 'session=flow-b-cookie; Path=/');
            res.end(JSON.stringify({ ok: true }));
          },
        },
        {
          match: (m, u) => m === 'GET' && u === '/api/v1/check-a',
          handler: (req, res) => {
            capturedCookies.flow1 = req.headers.cookie ?? null;
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.end('{}');
          },
        },
        {
          match: (m, u) => m === 'GET' && u === '/api/v1/check-b',
          handler: (req, res) => {
            capturedCookies.flow2 = req.headers.cookie ?? null;
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.end('{}');
          },
        },
      ],
      async (baseUrl) => {
        const { probeFlow } = loadModule();
        const { HttpClient } = require('../../probes/http-client');

        const matrix = {
          raw: {}, overlay: null, compiled: null, pages: [], endpoints: [],
          forms: [], middleware: [],
          authDetection: { registerSurface: null, loginSurface: null, apiPrefix: 'api/v1' },
          bootPlan: { driver: 'worktree-stack' }, scope: 'session', ignoredRoutes: new Set(),
          responseEnvelope: { successWrapper: null },
        };

        const flow1 = makeFlow({
          id: 'flow-a',
          steps: [
            { kind: 'api', method: 'POST', path: '/api/v1/login-a', body: {} },
            { kind: 'api', method: 'GET', path: '/api/v1/check-a' },
          ],
        });

        const flow2 = makeFlow({
          id: 'flow-b',
          steps: [
            { kind: 'api', method: 'POST', path: '/api/v1/login-b', body: {} },
            { kind: 'api', method: 'GET', path: '/api/v1/check-b' },
          ],
        });

        // Each flow gets its own HttpClient (isolated jar)
        const client1 = new HttpClient(baseUrl);
        const client2 = new HttpClient(baseUrl);

        // Run both flows concurrently
        await Promise.all([
          probeFlow(client1, flow1, matrix),
          probeFlow(client2, flow2, matrix),
        ]);

        // Flow A should only see flow-a-cookie
        assert.ok(capturedCookies.flow1, 'Flow 1 should have cookies');
        assert.ok(capturedCookies.flow1.includes('flow-a-cookie'), `Flow 1 should have flow-a-cookie, got: ${capturedCookies.flow1}`);
        assert.ok(!capturedCookies.flow1.includes('flow-b-cookie'), 'Flow 1 should NOT have flow-b-cookie');

        // Flow B should only see flow-b-cookie
        assert.ok(capturedCookies.flow2, 'Flow 2 should have cookies');
        assert.ok(capturedCookies.flow2.includes('flow-b-cookie'), `Flow 2 should have flow-b-cookie, got: ${capturedCookies.flow2}`);
        assert.ok(!capturedCookies.flow2.includes('flow-a-cookie'), 'Flow 2 should NOT have flow-a-cookie');
      },
    );
  });
});

// ---------------------------------------------------------------------------
// One-shot modifier semantics
// ---------------------------------------------------------------------------

describe('http-smoke jar wiring — one-shot modifier semantics', () => {
  test('omit-cookie: suppresses for one request, subsequent requests include it', async () => {
    const capturedCookies = { request1: undefined, request2: undefined };
    let protectedHitCount = 0;

    await withMockServer(
      [
        {
          match: (m, u) => m === 'POST' && u === '/api/v1/login',
          handler: (_req, res) => {
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.setHeader('set-cookie', 'session=sess1; Path=/');
            res.end(JSON.stringify({ ok: true }));
          },
        },
        {
          match: (m, u) => m === 'GET' && u === '/api/v1/protected',
          handler: (req, res) => {
            protectedHitCount++;
            if (protectedHitCount === 1) {
              capturedCookies.request1 = req.headers.cookie ?? null;
            } else {
              capturedCookies.request2 = req.headers.cookie ?? null;
            }
            const hasCookie = (req.headers.cookie ?? '').includes('session=sess1');
            res.statusCode = hasCookie ? 200 : 401;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ authed: hasCookie }));
          },
        },
      ],
      async (baseUrl) => {
        const { probeFlow } = loadModule();
        const { HttpClient } = require('../../probes/http-client');
        const client = new HttpClient(baseUrl);

        const flow = makeFlow({
          steps: [
            { kind: 'api', method: 'POST', path: '/api/v1/login', body: {} },
            { kind: 'omit-cookie', name: 'session' },
            { kind: 'api', method: 'GET', path: '/api/v1/protected' },
            { kind: 'expect', status: 401 },
            // Second request without omit — cookie should be back
            { kind: 'api', method: 'GET', path: '/api/v1/protected' },
            { kind: 'expect', status: 200 },
          ],
        });

        const matrix = {
          raw: {}, overlay: null, compiled: null, pages: [], endpoints: [],
          forms: [], middleware: [],
          authDetection: { registerSurface: null, loginSurface: null, apiPrefix: 'api/v1' },
          bootPlan: { driver: 'worktree-stack' }, scope: 'session', ignoredRoutes: new Set(),
          responseEnvelope: { successWrapper: null },
        };

        const results = await probeFlow(client, flow, matrix);
        const allPassed = results.every((r) => r.passed);
        assert.ok(allPassed, `All steps should pass. Failures: ${JSON.stringify(results.filter((r) => !r.passed))}`);

        // First protected request: cookie omitted
        assert.ok(!capturedCookies.request1 || !capturedCookies.request1.includes('session=sess1'),
          `Request 1 should NOT have session cookie, got: ${capturedCookies.request1}`);

        // Second protected request: cookie restored
        assert.ok(capturedCookies.request2 && capturedCookies.request2.includes('session=sess1'),
          `Request 2 should have session cookie, got: ${capturedCookies.request2}`);
      },
    );
  });

  test('tamper-cookie: tampers for one request, jar unchanged for next', async () => {
    const capturedCookies = { request1: null, request2: null };

    await withMockServer(
      [
        {
          match: (m, u) => m === 'POST' && u === '/api/v1/login',
          handler: (_req, res) => {
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.setHeader('set-cookie', 'session=real-value; Path=/');
            res.end(JSON.stringify({ ok: true }));
          },
        },
        {
          match: (m, u) => m === 'GET' && u === '/api/v1/check',
          handler: (req, res) => {
            if (!capturedCookies.request1) {
              capturedCookies.request1 = req.headers.cookie ?? null;
            } else {
              capturedCookies.request2 = req.headers.cookie ?? null;
            }
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.end('{}');
          },
        },
      ],
      async (baseUrl) => {
        const { probeFlow } = loadModule();
        const { HttpClient } = require('../../probes/http-client');
        const client = new HttpClient(baseUrl);

        const flow = makeFlow({
          steps: [
            { kind: 'api', method: 'POST', path: '/api/v1/login', body: {} },
            { kind: 'tamper-cookie', name: 'session', withValue: 'tampered!' },
            { kind: 'api', method: 'GET', path: '/api/v1/check' },
            // Second request: jar value should be back
            { kind: 'api', method: 'GET', path: '/api/v1/check' },
          ],
        });

        const matrix = {
          raw: {}, overlay: null, compiled: null, pages: [], endpoints: [],
          forms: [], middleware: [],
          authDetection: { registerSurface: null, loginSurface: null, apiPrefix: 'api/v1' },
          bootPlan: { driver: 'worktree-stack' }, scope: 'session', ignoredRoutes: new Set(),
          responseEnvelope: { successWrapper: null },
        };

        const results = await probeFlow(client, flow, matrix);
        const allPassed = results.every((r) => r.passed);
        assert.ok(allPassed, `All steps should pass. Failures: ${JSON.stringify(results.filter((r) => !r.passed))}`);

        // First check: tampered value
        assert.ok(capturedCookies.request1 && capturedCookies.request1.includes('session=tampered!'),
          `Request 1 should have tampered cookie, got: ${capturedCookies.request1}`);

        // Second check: original jar value
        assert.ok(capturedCookies.request2 && capturedCookies.request2.includes('session=real-value'),
          `Request 2 should have original cookie, got: ${capturedCookies.request2}`);
      },
    );
  });
});

// ---------------------------------------------------------------------------
// capture-cookie + assert-cookie-rotated end-to-end
// ---------------------------------------------------------------------------

describe('http-smoke jar wiring — capture + rotation', () => {
  test('full rotation flow: issue → capture → rotate → assert-rotated', async () => {
    await withMockServer(
      [
        {
          match: (m, u) => m === 'POST' && u === '/api/v1/login',
          handler: (_req, res) => {
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.setHeader('set-cookie', 'rt=token-v1; Path=/; HttpOnly');
            res.end(JSON.stringify({ ok: true }));
          },
        },
        {
          match: (m, u) => m === 'POST' && u === '/api/v1/refresh',
          handler: (_req, res) => {
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.setHeader('set-cookie', 'rt=token-v2; Path=/; HttpOnly');
            res.end(JSON.stringify({ ok: true }));
          },
        },
      ],
      async (baseUrl) => {
        const { probeFlow } = loadModule();
        const { HttpClient } = require('../../probes/http-client');
        const client = new HttpClient(baseUrl);

        const flow = makeFlow({
          steps: [
            { kind: 'api', method: 'POST', path: '/api/v1/login', body: {} },
            { kind: 'capture-cookie', name: 'rt', savePath: 'rt_v1' },
            { kind: 'api', method: 'POST', path: '/api/v1/refresh', body: {} },
            { kind: 'assert-cookie-rotated', name: 'rt', previousFromBag: 'rt_v1' },
          ],
        });

        const matrix = {
          raw: {}, overlay: null, compiled: null, pages: [], endpoints: [],
          forms: [], middleware: [],
          authDetection: { registerSurface: null, loginSurface: null, apiPrefix: 'api/v1' },
          bootPlan: { driver: 'worktree-stack' }, scope: 'session', ignoredRoutes: new Set(),
          responseEnvelope: { successWrapper: null },
        };

        const results = await probeFlow(client, flow, matrix);
        const allPassed = results.every((r) => r.passed);
        assert.ok(allPassed, `All steps should pass. Failures: ${JSON.stringify(results.filter((r) => !r.passed))}`);
      },
    );
  });
});

// ---------------------------------------------------------------------------
// capture-cookie + assert-cookie-cleared end-to-end
// ---------------------------------------------------------------------------

describe('http-smoke jar wiring — capture + clear', () => {
  test('issue → clear → assert-cleared', async () => {
    await withMockServer(
      [
        {
          match: (m, u) => m === 'POST' && u === '/api/v1/login',
          handler: (_req, res) => {
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.setHeader('set-cookie', 'sess=abc; Path=/; HttpOnly');
            res.end(JSON.stringify({ ok: true }));
          },
        },
        {
          match: (m, u) => m === 'POST' && u === '/api/v1/logout',
          handler: (_req, res) => {
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.setHeader('set-cookie', 'sess=; Path=/; Max-Age=0');
            res.end(JSON.stringify({ ok: true }));
          },
        },
      ],
      async (baseUrl) => {
        const { probeFlow } = loadModule();
        const { HttpClient } = require('../../probes/http-client');
        const client = new HttpClient(baseUrl);

        const flow = makeFlow({
          steps: [
            { kind: 'api', method: 'POST', path: '/api/v1/login', body: {} },
            { kind: 'capture-cookie', name: 'sess' },
            { kind: 'api', method: 'POST', path: '/api/v1/logout', body: {} },
            { kind: 'assert-cookie-cleared', name: 'sess' },
          ],
        });

        const matrix = {
          raw: {}, overlay: null, compiled: null, pages: [], endpoints: [],
          forms: [], middleware: [],
          authDetection: { registerSurface: null, loginSurface: null, apiPrefix: 'api/v1' },
          bootPlan: { driver: 'worktree-stack' }, scope: 'session', ignoredRoutes: new Set(),
          responseEnvelope: { successWrapper: null },
        };

        const results = await probeFlow(client, flow, matrix);
        const allPassed = results.every((r) => r.passed);
        assert.ok(allPassed, `All steps should pass. Failures: ${JSON.stringify(results.filter((r) => !r.passed))}`);
      },
    );
  });
});
