import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseArgvOptions,
  runHttpSmokeMain,
  bootstrapAuth,
  loadGeneratedFlows,
  FlowsLoadError,
  topoSortFlows,
  FlowDependencyCycleError,
  checkContractCoverage,
} from '../http-smoke';
import { probeFlowWithBindings, GeneratedFlow } from '../assertion-library';
import { HttpClient } from '../http-client';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';

test('parseArgvOptions parses every documented flag', () => {
  const opts = parseArgvOptions([
    '--matrix', 'm.json',
    '--overlay', 'o.json',
    '--compiled', 'c.json',
    '--report', 'r.json',
    '--human-report', 'h.md',
    '--timeout', '60',
    '--boot-timeout', '30',
    '--strict',
    '--read-only',
    '--full',
    '--json',
    '--profile', 'builder',
    '--only', 'api',
    '--keep-stack',
    '--no-reuse',
  ]);
  assert.equal(opts.matrixPath, 'm.json');
  assert.equal(opts.overlayPath, 'o.json');
  assert.equal(opts.compiledPath, 'c.json');
  assert.equal(opts.reportPath, 'r.json');
  assert.equal(opts.humanReportPath, 'h.md');
  assert.equal(opts.timeoutSec, 60);
  assert.equal(opts.bootTimeoutSec, 30);
  assert.equal(opts.strict, true);
  assert.equal(opts.readOnly, true);
  assert.equal(opts.fullScope, true);
  assert.equal(opts.jsonOutput, true);
  assert.equal(opts.profile, 'builder');
  assert.equal(opts.only, 'api');
  assert.equal(opts.keepStack, true);
  assert.equal(opts.reuseRunning, false);
});

test('runHttpSmokeMain returns exit 4 when matrix missing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smoke-cli-'));
  try {
    const result = await runHttpSmokeMain({
      matrixPath: join(dir, 'nope.json'),
      reportPath: join(dir, 'report.json'),
      humanReportPath: join(dir, 'human.md'),
      skipRegen: true,
    });
    assert.equal(result.exitCode, 4);
    assert.match(result.blockReason ?? '', /MATRIX_MISSING/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runHttpSmokeMain returns exit 3 when matrix malformed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smoke-cli-'));
  try {
    const matrixPath = join(dir, 'matrix.json');
    writeFileSync(matrixPath, '{not-json');
    const result = await runHttpSmokeMain({
      matrixPath,
      reportPath: join(dir, 'r.json'),
      humanReportPath: join(dir, 'h.md'),
      skipRegen: true,
    });
    assert.equal(result.exitCode, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runHttpSmokeMain returns exit 2 when bootPlan.driver is none and no running stack', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'smoke-cli-'));
  try {
    const matrixPath = join(dir, 'matrix.json');
    writeFileSync(matrixPath, JSON.stringify({
      version: '1',
      scope: 'session',
      bootPlan: { driver: 'none' },
      pages: [],
      apiEndpoints: [],
      authDetection: {},
    }));
    const result = await runHttpSmokeMain({
      matrixPath,
      reportPath: join(dir, 'r.json'),
      humanReportPath: join(dir, 'h.md'),
      reuseRunning: false,
      skipRegen: true,
    });
    assert.equal(result.exitCode, 2);
    assert.ok(result.report.blockCodes.includes('STACK_DRIVER_MISSING') || result.report.blockCodes.includes('STACK_BOOT_FAILED'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('bootstrapAuth returns skip when no authenticated surface needed', async () => {
  const client = new HttpClient('http://127.0.0.1:1');
  const ctx = await bootstrapAuth(client, {
    raw: {}, overlay: null, compiled: null, pages: [], endpoints: [], forms: [], middleware: [],
    authDetection: {}, bootPlan: { driver: 'worktree-stack' }, scope: 'session', ignoredRoutes: new Set(),
  });
  assert.equal(ctx.source, 'skip');
  assert.equal(ctx.bearer, null);
});

test('bootstrapAuth extracts bearer from register response', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/api/v1/auth/register' && req.method === 'POST') {
      res.statusCode = 201;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ accessToken: 'header.payload.signature', user: { id: '1' } }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  try {
    const client = new HttpClient(`http://127.0.0.1:${port}`);
    const ctx = await bootstrapAuth(client, {
      raw: {}, overlay: null, compiled: null,
      pages: [{ file: 'p', route: '/dashboard', guard: 'authenticated' }],
      endpoints: [],
      forms: [], middleware: [],
      authDetection: { registerSurface: '/api/v1/auth/register', loginSurface: '/api/v1/auth/login' },
      bootPlan: { driver: 'worktree-stack' }, scope: 'session', ignoredRoutes: new Set(),
    });
    assert.equal(ctx.source, 'register');
    assert.equal(ctx.bearer, 'header.payload.signature');
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('bootstrapAuth falls back to login on 409 duplicate', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/api/v1/auth/register' && req.method === 'POST') {
      res.statusCode = 409;
      res.end(JSON.stringify({ message: 'exists' }));
      return;
    }
    if (req.url === '/api/v1/auth/login' && req.method === 'POST') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ accessToken: 'aaa.bbb.ccc' }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  try {
    const client = new HttpClient(`http://127.0.0.1:${port}`);
    const ctx = await bootstrapAuth(client, {
      raw: {}, overlay: null, compiled: null,
      pages: [{ file: 'p', route: '/dashboard', guard: 'authenticated' }],
      endpoints: [],
      forms: [], middleware: [],
      authDetection: { registerSurface: '/api/v1/auth/register', loginSurface: '/api/v1/auth/login' },
      bootPlan: { driver: 'worktree-stack' }, scope: 'session', ignoredRoutes: new Set(),
    });
    assert.equal(ctx.source, 'login');
    assert.equal(ctx.bearer, 'aaa.bbb.ccc');
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('bootstrapAuth obtains bearer from Keycloak password grant when app auth endpoints are absent', async () => {
  const server = createServer(async (req, res) => {
    if (req.url === '/realms/generated/protocol/openid-connect/token' && req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const params = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      assert.equal(params.get('grant_type'), 'password');
      assert.equal(params.get('client_id'), 'generated-dev-proxy');
      assert.equal(params.get('client_secret'), 'proxy-secret');
      assert.equal(params.get('username'), 'viewer@example.com');
      assert.equal(params.get('password'), 'password');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ access_token: 'keycloak.access.token' }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const priorEnv = {
    HTTP_SMOKE_SEED_EMAIL: process.env.HTTP_SMOKE_SEED_EMAIL,
    HTTP_SMOKE_SEED_PASSWORD: process.env.HTTP_SMOKE_SEED_PASSWORD,
    OAUTH_ISSUER_URL: process.env.OAUTH_ISSUER_URL,
    OAUTH2_PROXY_CLIENT_ID: process.env.OAUTH2_PROXY_CLIENT_ID,
    OAUTH2_PROXY_CLIENT_SECRET: process.env.OAUTH2_PROXY_CLIENT_SECRET,
  };
  try {
    process.env.HTTP_SMOKE_SEED_EMAIL = 'viewer@example.com';
    process.env.HTTP_SMOKE_SEED_PASSWORD = 'password';
    process.env.OAUTH_ISSUER_URL = `http://127.0.0.1:${port}/realms/generated`;
    process.env.OAUTH2_PROXY_CLIENT_ID = 'generated-dev-proxy';
    process.env.OAUTH2_PROXY_CLIENT_SECRET = 'proxy-secret';

    const client = new HttpClient('http://127.0.0.1:1');
    const ctx = await bootstrapAuth(client, {
      raw: {}, overlay: null, compiled: null,
      pages: [],
      endpoints: [{ file: 'auth.ts', path: '/api/v1/auth/me', method: 'GET', guard: 'authenticated' }],
      forms: [], middleware: [],
      authDetection: { registerSurface: null, loginSurface: null },
      bootPlan: { driver: 'worktree-stack' }, scope: 'session', ignoredRoutes: new Set(),
    });

    assert.equal(ctx.source, 'keycloak');
    assert.equal(ctx.bearer, 'keycloak.access.token');
  } finally {
    for (const [key, value] of Object.entries(priorEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('bootstrapAuth derives Keycloak issuer from worktree .stack.json when env is not exported', async () => {
  const server = createServer(async (req, res) => {
    if (req.url === '/realms/sfx-webapp-boilerplate/protocol/openid-connect/token' && req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const params = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      assert.equal(params.get('client_id'), 'sfx-webapp-boilerplate-dev-proxy');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ access_token: 'stack-json-token' }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const stackPath = join(process.cwd(), '.stack.json');
  const previousStack = existsSync(stackPath) ? readFileSync(stackPath, 'utf8') : null;
  const priorEnv = {
    HTTP_SMOKE_SEED_EMAIL: process.env.HTTP_SMOKE_SEED_EMAIL,
    HTTP_SMOKE_SEED_PASSWORD: process.env.HTTP_SMOKE_SEED_PASSWORD,
    OAUTH_ISSUER_URL: process.env.OAUTH_ISSUER_URL,
    OAUTH2_PROXY_CLIENT_ID: process.env.OAUTH2_PROXY_CLIENT_ID,
    OAUTH2_PROXY_CLIENT_SECRET: process.env.OAUTH2_PROXY_CLIENT_SECRET,
  };

  try {
    process.env.HTTP_SMOKE_SEED_EMAIL = 'viewer@example.com';
    process.env.HTTP_SMOKE_SEED_PASSWORD = 'password';
    delete process.env.OAUTH_ISSUER_URL;
    delete process.env.OAUTH2_PROXY_CLIENT_ID;
    delete process.env.OAUTH2_PROXY_CLIENT_SECRET;
    writeFileSync(stackPath, JSON.stringify({
      keycloak_port: port,
      host: '127.0.0.1',
      is_worktree: true,
    }));

    const client = new HttpClient('http://127.0.0.1:1');
    const ctx = await bootstrapAuth(client, {
      raw: {}, overlay: null, compiled: null,
      pages: [],
      endpoints: [{ file: 'auth.ts', path: '/api/v1/auth/me', method: 'GET', guard: 'authenticated' }],
      forms: [], middleware: [],
      authDetection: { registerSurface: null, loginSurface: null },
      bootPlan: { driver: 'worktree-stack' }, scope: 'session', ignoredRoutes: new Set(),
    });

    assert.equal(ctx.source, 'keycloak');
    assert.equal(ctx.bearer, 'stack-json-token');
  } finally {
    for (const [key, value] of Object.entries(priorEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (previousStack === null) rmSync(stackPath, { force: true });
    else writeFileSync(stackPath, previousStack);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('bootstrapAuth returns skip error when no token extractable', async () => {
  const server = createServer((_q, res) => { res.statusCode = 200; res.end(JSON.stringify({ user: { id: '1' } })); });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  try {
    const client = new HttpClient(`http://127.0.0.1:${port}`);
    const ctx = await bootstrapAuth(client, {
      raw: {}, overlay: null, compiled: null,
      pages: [{ file: 'p', route: '/dashboard', guard: 'authenticated' }],
      endpoints: [], forms: [], middleware: [],
      authDetection: { registerSurface: '/api/v1/auth/register', loginSurface: '/api/v1/auth/login' },
      bootPlan: { driver: 'worktree-stack' }, scope: 'session', ignoredRoutes: new Set(),
    });
    assert.equal(ctx.source, 'skip');
    assert.match(ctx.error ?? '', /AUTH_BOOTSTRAP_INCONSISTENT/);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

// ---------------------------------------------------------------------------
// Generated flows loading
// ---------------------------------------------------------------------------

test('loadGeneratedFlows throws FLOWS_GENERATED_MISSING when file absent', () => {
  assert.throws(
    () => loadGeneratedFlows('/tmp/nonexistent-flows-12345.json'),
    (error: unknown) => {
      assert.ok(error instanceof FlowsLoadError);
      assert.equal(error.code, 'FLOWS_GENERATED_MISSING');
      assert.match(error.message, /flows:regen/);
      return true;
    },
  );
});

test('loadGeneratedFlows throws FLOWS_GENERATED_INVALID when file is bad JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'flows-load-'));
  try {
    const flowsPath = join(dir, '.flows.generated.json');
    writeFileSync(flowsPath, '{bad-json');
    assert.throws(
      () => loadGeneratedFlows(flowsPath),
      (error: unknown) => {
        assert.ok(error instanceof FlowsLoadError);
        assert.equal(error.code, 'FLOWS_GENERATED_INVALID');
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadGeneratedFlows parses valid flows file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'flows-load-'));
  try {
    const flowsPath = join(dir, '.flows.generated.json');
    const content = {
      version: '1',
      generatedAt: '2026-01-01',
      matrixSource: '.matrix.json',
      flows: [{ id: 'test-flow', contract: { endpoint: 'GET /test', kind: 'happy', source: 'test.ts' }, dependsOn: [], onFail: { check: [], implies: 'test' }, steps: [] }],
      diagnostics: [],
    };
    writeFileSync(flowsPath, JSON.stringify(content));
    const result = loadGeneratedFlows(flowsPath);
    assert.equal(result.flows.length, 1);
    assert.equal(result.flows[0].id, 'test-flow');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Topological sort
// ---------------------------------------------------------------------------

test('topoSortFlows sorts A before B when B dependsOn A', () => {
  const flowA: GeneratedFlow = {
    id: 'flow-a',
    contract: { endpoint: 'POST /register', kind: 'happy', source: 'auth.ts' },
    dependsOn: [],
    onFail: { check: ['auth.ts'], implies: 'register fails' },
    steps: [{ kind: 'api', method: 'POST', path: '/api/v1/auth/register' }],
  };
  const flowB: GeneratedFlow = {
    id: 'flow-b',
    contract: { endpoint: 'GET /me', kind: 'chain', source: 'auth.ts' },
    dependsOn: ['flow-a'],
    onFail: { check: ['auth.ts'], implies: 'me fails' },
    steps: [{ kind: 'api', method: 'GET', path: '/api/v1/auth/me' }],
  };
  // Feed B first to ensure topo sort reorders.
  const sorted = topoSortFlows([flowB, flowA]);
  assert.equal(sorted[0].id, 'flow-a');
  assert.equal(sorted[1].id, 'flow-b');
});

test('topoSortFlows handles independent flows in stable order', () => {
  const flowX: GeneratedFlow = {
    id: 'flow-x', contract: { endpoint: 'GET /x', kind: 'happy', source: 'x.ts' },
    dependsOn: [], onFail: { check: [], implies: '' }, steps: [],
  };
  const flowY: GeneratedFlow = {
    id: 'flow-y', contract: { endpoint: 'GET /y', kind: 'happy', source: 'y.ts' },
    dependsOn: [], onFail: { check: [], implies: '' }, steps: [],
  };
  const sorted = topoSortFlows([flowX, flowY]);
  assert.equal(sorted.length, 2);
  // Both independent — maintains input order.
  assert.equal(sorted[0].id, 'flow-x');
  assert.equal(sorted[1].id, 'flow-y');
});

test('topoSortFlows throws FlowDependencyCycleError on circular deps', () => {
  const flowA: GeneratedFlow = {
    id: 'flow-a', contract: { endpoint: 'a', kind: 'a', source: 'a' },
    dependsOn: ['flow-b'], onFail: { check: [], implies: '' }, steps: [],
  };
  const flowB: GeneratedFlow = {
    id: 'flow-b', contract: { endpoint: 'b', kind: 'b', source: 'b' },
    dependsOn: ['flow-a'], onFail: { check: [], implies: '' }, steps: [],
  };
  assert.throws(
    () => topoSortFlows([flowA, flowB]),
    (error: unknown) => {
      assert.ok(error instanceof FlowDependencyCycleError);
      assert.match(error.message, /FLOW_DEPENDENCY_CYCLE/);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Binding propagation across dependent flows
// ---------------------------------------------------------------------------

test('probeFlowWithBindings propagates bindings from flow A to flow B', async () => {
  // Mock HTTP server: register returns accessToken, me requires auth.
  const server = createServer((req, res) => {
    if (req.url === '/api/v1/auth/register' && req.method === 'POST') {
      res.statusCode = 201;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ accessToken: 'tok.en.value', user: { id: 'u1' } }));
      return;
    }
    if (req.url === '/api/v1/auth/me' && req.method === 'GET') {
      const auth = req.headers.authorization;
      if (auth === 'Bearer tok.en.value') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ id: 'u1', email: 'test@test.com' }));
      } else {
        res.statusCode = 401;
        res.end(JSON.stringify({ message: 'Unauthorized' }));
      }
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;

  try {
    const client = new HttpClient(`http://127.0.0.1:${port}`);
    const emptyMatrix = {
      raw: {}, overlay: null, compiled: null, pages: [], endpoints: [],
      forms: [], middleware: [], authDetection: {}, bootPlan: { driver: 'none' as const },
      scope: 'session', ignoredRoutes: new Set<string>(),
    };

    // Flow A: register + capture accessToken
    const flowA: GeneratedFlow = {
      id: 'chain:auth-bootstrap',
      contract: { endpoint: 'POST /api/v1/auth/register', kind: 'chain-auth-bootstrap', source: 'auth.ts' },
      dependsOn: [],
      onFail: { check: ['auth.ts'], implies: 'Auth bootstrap fails.' },
      steps: [
        { kind: 'api', method: 'POST', path: '/api/v1/auth/register', body: { email: 'test@test.com', password: 'Pass1234', name: 'Test' } },
        { kind: 'expect', status: 201 },
        { kind: 'capture', bindings: { accessToken: '$.accessToken' } },
        { kind: 'setAuth', binding: 'accessToken' },
      ],
    };

    // Flow B: uses captured accessToken via shared bindings.
    const flowB: GeneratedFlow = {
      id: 'chain:authed-me',
      contract: { endpoint: 'GET /api/v1/auth/me', kind: 'chain', source: 'auth.ts' },
      dependsOn: ['chain:auth-bootstrap'],
      onFail: { check: ['auth.ts'], implies: 'Authed /me fails.' },
      steps: [
        { kind: 'api', method: 'GET', path: '/api/v1/auth/me' },
        { kind: 'expect', status: 200 },
      ],
    };

    // Run A first, get bindings and auth state.
    const sharedBindings: Record<string, unknown> = {};
    let sharedBearer: string | null = null;
    const resultA = await probeFlowWithBindings(client, flowA, emptyMatrix, { bindings: sharedBindings });
    assert.ok(resultA.cases.every((c) => c.passed), 'All flow A steps should pass');
    assert.equal(resultA.bindings.accessToken, 'tok.en.value');
    assert.equal(resultA.authHeader, 'tok.en.value');

    // Merge bindings and auth for B.
    Object.assign(sharedBindings, resultA.bindings);
    if (resultA.authHeader !== null) sharedBearer = resultA.authHeader;

    const resultB = await probeFlowWithBindings(client, flowB, emptyMatrix, {
      bindings: sharedBindings,
      bearer: sharedBearer,
    });
    assert.ok(resultB.cases.every((c) => c.passed), 'All flow B steps should pass (using A auth)');
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

// ---------------------------------------------------------------------------
// Contract coverage check
// ---------------------------------------------------------------------------

test('checkContractCoverage returns failures for unreached declared statuses', () => {
  const matrix = {
    raw: {}, overlay: null, compiled: null, pages: [],
    endpoints: [
      {
        file: 'auth.controller.ts',
        method: 'POST' as const,
        path: '/api/v1/auth/register',
        guard: 'public',
        swaggerDeclared: { statuses: [201, 400, 409] },
      },
    ],
    forms: [], middleware: [], authDetection: {},
    bootPlan: { driver: 'none' as const }, scope: 'session',
    ignoredRoutes: new Set<string>(),
  };

  // Only 201 and 400 were observed — 409 was not.
  const observed = new Set(['POST /api/v1/auth/register 201', 'POST /api/v1/auth/register 400']);
  const failures = checkContractCoverage(matrix, observed);

  assert.equal(failures.length, 1);
  assert.equal(failures[0].declaredStatus, 409);
  assert.equal(failures[0].method, 'POST');
  assert.equal(failures[0].path, '/api/v1/auth/register');
  assert.equal(failures[0].controllerFile, 'auth.controller.ts');
});

test('checkContractCoverage returns empty array when all statuses reached', () => {
  const matrix = {
    raw: {}, overlay: null, compiled: null, pages: [],
    endpoints: [
      {
        file: 'auth.controller.ts',
        method: 'POST' as const,
        path: '/api/v1/auth/register',
        guard: 'public',
        swaggerDeclared: { statuses: [201, 400] },
      },
    ],
    forms: [], middleware: [], authDetection: {},
    bootPlan: { driver: 'none' as const }, scope: 'session',
    ignoredRoutes: new Set<string>(),
  };

  const observed = new Set(['POST /api/v1/auth/register 201', 'POST /api/v1/auth/register 400']);
  const failures = checkContractCoverage(matrix, observed);
  assert.equal(failures.length, 0);
});

test('checkContractCoverage skips endpoints without swaggerDeclared', () => {
  const matrix = {
    raw: {}, overlay: null, compiled: null, pages: [],
    endpoints: [
      { file: 'health.controller.ts', method: 'GET' as const, path: '/api/v1/health', guard: 'public' },
    ],
    forms: [], middleware: [], authDetection: {},
    bootPlan: { driver: 'none' as const }, scope: 'session',
    ignoredRoutes: new Set<string>(),
  };

  const failures = checkContractCoverage(matrix, new Set());
  assert.equal(failures.length, 0);
});
