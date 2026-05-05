import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { HttpClient } from '../http-client';
import { probeFlowWithBindings, GeneratedFlow } from '../assertion-library';
import { MergedMatrix } from '../matrix-loader';

interface MockRoute {
  match: (method: string, url: string) => boolean;
  handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, body: string) => void;
}

async function withMockServer<T>(routes: MockRoute[], fn: (baseUrl: string, server: Server) => Promise<T>): Promise<T> {
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
      res.end('not found');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  try {
    return await fn(`http://127.0.0.1:${port}`, server);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

function makeMatrix(overrides: Partial<MergedMatrix> = {}): MergedMatrix {
  return {
    raw: {} as MergedMatrix['raw'],
    overlay: null,
    compiled: null,
    pages: [],
    endpoints: [],
    forms: [],
    middleware: [],
    authDetection: { registerSurface: '/api/v1/auth/register', loginSurface: '/login', apiPrefix: 'api/v1' },
    responseEnvelope: { successWrapper: null, errorWrapper: null, source: null },
    errorEnvelope: null,
    prismaModels: { models: {}, source: null },
    cookieFlows: [],
    securitySchemes: {},
    bootPlan: { driver: 'worktree-stack' },
    scope: 'session',
    ignoredRoutes: new Set(),
    ...overrides,
  };
}

function makeFlow(steps: GeneratedFlow['steps']): GeneratedFlow {
  return {
    id: 'test-cookie-undeclared',
    contract: { endpoint: '/test', kind: 'cookie-undeclared-test', source: 'test' },
    dependsOn: [],
    onFail: { check: [], implies: 'test' },
    steps,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('COOKIE_UNDECLARED: emits diagnostic when Set-Cookie name is not in matrix.cookieFlows', async () => {
  await withMockServer(
    [{
      match: (m, u) => m === 'GET' && u === '/api/v1/test-undeclared',
      handler: (_req, res) => {
        res.statusCode = 200;
        res.setHeader('Set-Cookie', 'surprise_cookie=abc123; HttpOnly; Path=/');
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
      },
    }],
    async (baseUrl) => {
      const client = new HttpClient(baseUrl);
      const matrix = makeMatrix({
        cookieFlows: [
          { name: 'declared_cookie', role: 'session', issuers: [], consumers: [], clearers: [], rotators: [], attrs: {}, diagnostics: [] },
        ],
      });
      const flow = makeFlow([
        { kind: 'api', method: 'GET', path: '/api/v1/test-undeclared' },
      ]);

      const result = await probeFlowWithBindings(client, flow, matrix);

      assert.ok(result.runtimeDiagnostics.length > 0, 'should have at least one runtime diagnostic');
      const diag = result.runtimeDiagnostics.find((d) => d.code === 'COOKIE_UNDECLARED');
      assert.ok(diag, 'should have a COOKIE_UNDECLARED diagnostic');
      assert.equal(diag!.level, 'warning');
      assert.equal(diag!.details.cookieName, 'surprise_cookie');
      assert.equal(diag!.details.method, 'GET');
      assert.equal(diag!.details.path, '/api/v1/test-undeclared');
      assert.equal(diag!.details.flowId, 'test-cookie-undeclared');
    },
  );
});

test('COOKIE_UNDECLARED: does NOT emit when cookie name IS declared in matrix.cookieFlows', async () => {
  await withMockServer(
    [{
      match: (m, u) => m === 'GET' && u === '/api/v1/test-declared',
      handler: (_req, res) => {
        res.statusCode = 200;
        res.setHeader('Set-Cookie', 'declared_cookie=abc123; HttpOnly; Path=/');
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
      },
    }],
    async (baseUrl) => {
      const client = new HttpClient(baseUrl);
      const matrix = makeMatrix({
        cookieFlows: [
          { name: 'declared_cookie', role: 'session', issuers: [], consumers: [], clearers: [], rotators: [], attrs: {}, diagnostics: [] },
        ],
      });
      const flow = makeFlow([
        { kind: 'api', method: 'GET', path: '/api/v1/test-declared' },
      ]);

      const result = await probeFlowWithBindings(client, flow, matrix);

      const undeclaredDiags = result.runtimeDiagnostics.filter((d) => d.code === 'COOKIE_UNDECLARED');
      assert.equal(undeclaredDiags.length, 0, 'should NOT emit COOKIE_UNDECLARED for declared cookie');
    },
  );
});

test('COOKIE_UNDECLARED: does NOT emit when matrix has no cookieFlows (empty set)', async () => {
  await withMockServer(
    [{
      match: (m, u) => m === 'GET' && u === '/api/v1/test-nocf',
      handler: (_req, res) => {
        res.statusCode = 200;
        res.setHeader('Set-Cookie', 'any_cookie=abc; HttpOnly');
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
      },
    }],
    async (baseUrl) => {
      const client = new HttpClient(baseUrl);
      const matrix = makeMatrix({ cookieFlows: [] });
      const flow = makeFlow([
        { kind: 'api', method: 'GET', path: '/api/v1/test-nocf' },
      ]);

      const result = await probeFlowWithBindings(client, flow, matrix);

      const undeclaredDiags = result.runtimeDiagnostics.filter((d) => d.code === 'COOKIE_UNDECLARED');
      assert.equal(undeclaredDiags.length, 0, 'should NOT emit COOKIE_UNDECLARED when no cookies are declared');
    },
  );
});

test('COOKIE_UNDECLARED: emits for each undeclared cookie when multiple Set-Cookie headers', async () => {
  await withMockServer(
    [{
      match: (m, u) => m === 'POST' && u === '/api/v1/test-multi',
      handler: (_req, res) => {
        res.statusCode = 200;
        // Multiple Set-Cookie headers — one declared, two undeclared
        res.setHeader('Set-Cookie', [
          'declared_one=val1; HttpOnly',
          'undeclared_a=val2; HttpOnly',
          'undeclared_b=val3; Secure',
        ]);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
      },
    }],
    async (baseUrl) => {
      const client = new HttpClient(baseUrl);
      const matrix = makeMatrix({
        cookieFlows: [
          { name: 'declared_one', role: 'session', issuers: [], consumers: [], clearers: [], rotators: [], attrs: {}, diagnostics: [] },
        ],
      });
      const flow = makeFlow([
        { kind: 'api', method: 'POST', path: '/api/v1/test-multi' },
      ]);

      const result = await probeFlowWithBindings(client, flow, matrix);

      const undeclaredDiags = result.runtimeDiagnostics.filter((d) => d.code === 'COOKIE_UNDECLARED');
      assert.equal(undeclaredDiags.length, 2, 'should emit two COOKIE_UNDECLARED diagnostics');

      const names = undeclaredDiags.map((d) => d.details.cookieName as string).sort();
      assert.deepEqual(names, ['undeclared_a', 'undeclared_b']);
    },
  );
});

test('COOKIE_UNDECLARED: emits for no response cookies (no Set-Cookie header)', async () => {
  await withMockServer(
    [{
      match: (m, u) => m === 'GET' && u === '/api/v1/test-nocookie',
      handler: (_req, res) => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
      },
    }],
    async (baseUrl) => {
      const client = new HttpClient(baseUrl);
      const matrix = makeMatrix({
        cookieFlows: [
          { name: 'some_cookie', role: 'session', issuers: [], consumers: [], clearers: [], rotators: [], attrs: {}, diagnostics: [] },
        ],
      });
      const flow = makeFlow([
        { kind: 'api', method: 'GET', path: '/api/v1/test-nocookie' },
      ]);

      const result = await probeFlowWithBindings(client, flow, matrix);

      assert.equal(result.runtimeDiagnostics.length, 0, 'should not emit any diagnostics when no Set-Cookie');
    },
  );
});
