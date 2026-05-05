import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { HttpClient } from '../http-client';
import { probePage, probeEndpoint, probeFlow, formatBlockReason, resolveConstrainedSigil } from '../assertion-library';
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
    raw: {},
    overlay: null,
    compiled: null,
    pages: [],
    endpoints: [],
    forms: [],
    middleware: [],
    authDetection: { registerSurface: '/api/v1/auth/register', loginSurface: '/login', apiPrefix: 'api/v1' },
    bootPlan: { driver: 'worktree-stack' },
    scope: 'session',
    ignoredRoutes: new Set(),
    ...overrides,
  };
}

test('formatBlockReason truncates long detail', () => {
  const reason = formatBlockReason('API_500_RESPONSE', 'POST /x', 'a'.repeat(500));
  assert.ok(reason.startsWith('API_500_RESPONSE:POST /x:'));
  assert.ok(reason.length < 500);
});

test('probePage passes a public 200 with body length > 100', async () => {
  await withMockServer(
    [{ match: (m, u) => m === 'GET' && u === '/', handler: (_q, res) => { res.statusCode = 200; res.end('<html>'.padEnd(200, 'x') + '</html>'); } }],
    async (base) => {
      const client = new HttpClient(base);
      const result = await probePage(client, { file: '', route: '/', guard: 'public' }, makeMatrix());
      assert.equal(result.passed, true);
      assert.equal(result.status, 200);
    },
  );
});

test('probePage blocks PAGE_ERROR_OVERLAY when body contains anti-token', async () => {
  await withMockServer(
    [{ match: () => true, handler: (_q, res) => { res.statusCode = 200; res.end('<html>Application error: a server-side exception has occurred</html>'.padEnd(200, 'x')); } }],
    async (base) => {
      const client = new HttpClient(base);
      const result = await probePage(client, { file: '', route: '/', guard: 'public' }, makeMatrix());
      assert.equal(result.passed, false);
      assert.match(result.blockReason ?? '', /^PAGE_ERROR_OVERLAY:/);
    },
  );
});

test('probePage blocks AUTH_CONTRACT_VIOLATION when authed page returns 200 unauth', async () => {
  await withMockServer(
    [{ match: () => true, handler: (_q, res) => { res.statusCode = 200; res.end('<html>Dashboard</html>'.padEnd(200, 'x')); } }],
    async (base) => {
      const client = new HttpClient(base);
      const result = await probePage(client, { file: '', route: '/dashboard', guard: 'authenticated' }, makeMatrix());
      assert.equal(result.passed, false);
      assert.match(result.blockReason ?? '', /^AUTH_CONTRACT_VIOLATION:/);
    },
  );
});

test('probePage passes authed page that redirects unauth', async () => {
  await withMockServer(
    [{ match: () => true, handler: (_q, res) => { res.statusCode = 302; res.setHeader('Location', '/login'); res.end(); } }],
    async (base) => {
      const client = new HttpClient(base);
      const result = await probePage(client, { file: '', route: '/dashboard', guard: 'authenticated' }, makeMatrix());
      assert.equal(result.passed, true);
      assert.equal(result.status, 302);
    },
  );
});

test('probePage blocks PAGE_MISSING_TOKEN when expected token absent', async () => {
  await withMockServer(
    [{ match: () => true, handler: (_q, res) => { res.statusCode = 200; res.end('<html>not the word</html>'.padEnd(200, 'x')); } }],
    async (base) => {
      const client = new HttpClient(base);
      const result = await probePage(client, { file: '', route: '/', guard: 'public', tokens: ['Welcome'] }, makeMatrix());
      assert.equal(result.passed, false);
      assert.match(result.blockReason ?? '', /^PAGE_MISSING_TOKEN:/);
    },
  );
});

test('probePage reports UNRESOLVABLE_PARAM when seeds missing', async () => {
  await withMockServer([{ match: () => true, handler: (_q, res) => { res.end('x'); } }], async (base) => {
    const client = new HttpClient(base);
    const result = await probePage(client, { file: '', route: '/teams/:teamSlug', guard: 'public' }, makeMatrix());
    assert.equal(result.passed, false);
    assert.match(result.blockReason ?? '', /^UNRESOLVABLE_PARAM:/);
  });
});

test('probeEndpoint blocks API_500_RESPONSE on happy path 500', async () => {
  await withMockServer(
    [{ match: (m, u) => m === 'POST' && u === '/api/v1/x', handler: (_q, res) => { res.statusCode = 500; res.end(JSON.stringify({ message: 'boom' })); } }],
    async (base) => {
      const client = new HttpClient(base);
      const matrix = makeMatrix({ compiled: { endpoints: [{ method: 'POST', path: '/api/v1/x', sampleValid: { name: 'test' } }] } as never });
      const results = await probeEndpoint(client, { file: '', method: 'POST', path: '/api/v1/x', successStatus: 201 }, matrix);
      assert.ok(results.some((r) => r.blockReason?.startsWith('API_500_RESPONSE:')));
    },
  );
});

test('probeEndpoint blocks API_BAD_INPUT_NOT_4XX when empty body returns 200', async () => {
  await withMockServer(
    [{ match: (m, u) => m === 'POST' && u === '/api/v1/x', handler: (_q, res) => { res.statusCode = 200; res.end(JSON.stringify({ ok: true })); } }],
    async (base) => {
      const client = new HttpClient(base);
      const matrix = makeMatrix({ compiled: { endpoints: [{ method: 'POST', path: '/api/v1/x', sampleValid: { name: 'test' }, sampleInvalid: [{ body: {}, reason: 'empty-body' }] }] } as never });
      const results = await probeEndpoint(client, { file: '', method: 'POST', path: '/api/v1/x', successStatus: 200 }, matrix);
      assert.ok(results.some((r) => r.blockReason?.startsWith('API_BAD_INPUT_NOT_4XX:')));
    },
  );
});

test('probeEndpoint blocks API_AUTH_BOUNDARY_LEAK on 200 without bearer', async () => {
  await withMockServer(
    [{ match: (m, u) => m === 'GET' && u === '/api/v1/me', handler: (_q, res) => { res.statusCode = 200; res.end('{}'); } }],
    async (base) => {
      const client = new HttpClient(base);
      const results = await probeEndpoint(client, { file: '', method: 'GET', path: '/api/v1/me', guard: 'authenticated' }, makeMatrix());
      assert.ok(results.some((r) => r.blockReason?.startsWith('API_AUTH_BOUNDARY_LEAK:')));
    },
  );
});

test('probeEndpoint readOnly skips mutating happy-path but keeps bad-input', async () => {
  let happyHit = 0;
  let badHit = 0;
  await withMockServer(
    [
      { match: (m) => m === 'POST', handler: (_req, res, body) => {
        let parsed: Record<string, unknown> = {};
        try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = {}; }
        const isEmpty = Object.keys(parsed).length === 0;
        if (isEmpty) { badHit++; res.statusCode = 400; res.end('{"message":"required"}'); }
        else { happyHit++; res.statusCode = 201; res.end('{}'); }
      } },
    ],
    async (base) => {
      const client = new HttpClient(base);
      const matrix = makeMatrix({ compiled: { endpoints: [{ method: 'POST', path: '/api/v1/x', sampleValid: { name: 'test' }, sampleInvalid: [{ body: {}, reason: 'empty-body' }] }] } as never });
      await probeEndpoint(client, { file: '', method: 'POST', path: '/api/v1/x', successStatus: 201 }, matrix, { readOnly: true });
      assert.equal(happyHit, 0, 'happy path should be skipped in readOnly');
      assert.ok(badHit >= 1, 'bad-input check still runs');
    },
  );
});

test('probeFlow passes a simple navigate + expect flow', async () => {
  await withMockServer(
    [{ match: (m, u) => m === 'GET' && u === '/login', handler: (_q, res) => { res.statusCode = 200; res.end('login'); } }],
    async (base) => {
      const client = new HttpClient(base);
      const results = await probeFlow(client, {
        id: 'login-flow',
        contract: { endpoint: 'page /login', kind: 'test', source: 'test.ts' },
        dependsOn: [],
        onFail: { check: ['test.ts'], implies: 'Login page unreachable.' },
        steps: [
          { kind: 'navigate', path: '/login' },
          { kind: 'expect', statusAnyOf: [200] },
        ],
      }, makeMatrix());
      assert.ok(results.every((r) => r.passed), `expected all passed, got ${JSON.stringify(results)}`);
    },
  );
});

test('probeFlow runs all steps in new generated-flow format', async () => {
  await withMockServer(
    [{ match: (m, u) => m === 'GET' && u === '/api/v1/health', handler: (_q, res) => { res.statusCode = 200; res.setHeader('content-type', 'application/json'); res.end('{"status":"ok"}'); } }],
    async (base) => {
      const client = new HttpClient(base);
      const results = await probeFlow(client, {
        id: 'health-check',
        contract: { endpoint: 'GET /api/v1/health', kind: 'test', source: 'test.ts' },
        dependsOn: [],
        onFail: { check: ['test.ts'], implies: 'Health endpoint failed.' },
        steps: [
          { kind: 'api', method: 'GET', path: '/api/v1/health' },
          { kind: 'expect', status: 200 },
        ],
      }, makeMatrix());
      assert.ok(results.every((r) => r.passed), `expected all passed, got ${JSON.stringify(results)}`);
    },
  );
});

// ---------------------------------------------------------------------------
// Regression: capture step must surface drift, not silently overwrite bindings
// Bug previously: when a capture's JSONPath resolved to undefined, the value
// was unconditionally written to ctx.bindings — wiping a token captured by an
// earlier step. The downstream setAuth then failed with the misleading
// "binding value is undefined", pointing the operator at the wrong step.
// Fix: fail the capture step itself when the extracted value is undefined.
// ---------------------------------------------------------------------------
test('probeFlow capture step FAILS when JSONPath resolves to undefined', async () => {
  await withMockServer(
    [
      { match: (m, u) => m === 'GET' && u === '/api/v1/no-token', handler: (_q, res) => {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        // 200 OK but the body has no `accessToken` field — capture must FAIL,
        // not silently write `undefined` and let the failure surface several
        // steps later as a misleading "binding value is undefined" on setAuth.
        res.end('{"status":"ok"}');
      } },
    ],
    async (base) => {
      const client = new HttpClient(base);
      const results = await probeFlow(client, {
        id: 'undefined-binding-regression',
        contract: { endpoint: 'GET /api/v1/no-token', kind: 'test', source: 'test.ts' },
        dependsOn: [],
        onFail: { check: ['test.ts'], implies: 'Capture must fail on undefined.' },
        steps: [
          { kind: 'api', method: 'GET', path: '/api/v1/no-token' },
          { kind: 'capture', bindings: { accessToken: '$.accessToken' } },
        ],
      }, makeMatrix());
      // The api step (idx 0) passes; the capture step (idx 1) must fail and
      // halt the flow. Match by step1 suffix to avoid false positives where
      // the flowId itself contains the substring "capture".
      const captureResult = results.find((r) => r.label?.endsWith(':step1:capture'));
      assert.ok(
        captureResult,
        `capture step result should exist; got cases=${JSON.stringify(results.map((r) => ({ l: r.label, p: r.passed })))}`,
      );
      assert.equal(
        captureResult!.passed,
        false,
        'capture step must fail when bound value resolves to undefined — silent overwrite hides drift',
      );
    },
  );
});

test('probeFlow resolves ${uniqUuid2} to a different UUID than ${uniqUuid} (idempotency different-key)', async () => {
  // This test verifies Bug #1 fix: seedUniqueBindings must produce uniqUuid2.
  // Before the fix, ${uniqUuid2} was never seeded and would be sent as a literal string.
  let capturedHeaders: string[] = [];
  await withMockServer(
    [
      {
        match: (m) => m === 'POST',
        handler: (_req, res, _body) => {
          const idempotencyKey = (_req as any).headers['idempotency-key'] ?? '';
          capturedHeaders.push(idempotencyKey);
          res.writeHead(201, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id: 'test-id-1' }));
        },
      },
    ],
    async (baseUrl) => {
      const client = new HttpClient(baseUrl);
      capturedHeaders = [];
      const results = await probeFlow(client, {
        id: 'test:idempotency:different-key',
        contract: { endpoint: 'POST /test', kind: 'endpoint-idempotency', source: 'test.ts' },
        dependsOn: [],
        onFail: { check: ['test.ts'], implies: 'test' },
        steps: [
          { kind: 'api' as const, method: 'POST', path: '/test', body: {}, headers: { 'Idempotency-Key': '${uniqUuid}' } },
          { kind: 'expect' as const, statusAnyOf: [200, 201] },
          { kind: 'api' as const, method: 'POST', path: '/test', body: {}, headers: { 'Idempotency-Key': '${uniqUuid2}' } },
          { kind: 'expect' as const, statusAnyOf: [200, 201] },
        ],
      }, makeMatrix());

      // All steps should pass
      for (const r of results) {
        assert.equal(r.passed, true, `step ${r.label} should pass: ${r.blockReason ?? 'no reason'}`);
      }

      // Both headers should be valid UUIDs, not literal "${uniqUuid}" or "${uniqUuid2}"
      assert.equal(capturedHeaders.length, 2, 'should have captured 2 idempotency headers');
      assert.ok(!capturedHeaders[0].includes('${'), `first key should be resolved UUID, got: ${capturedHeaders[0]}`);
      assert.ok(!capturedHeaders[1].includes('${'), `second key should be resolved UUID, got: ${capturedHeaders[1]}`);

      // The two UUIDs should be DIFFERENT (that's the whole point of different-key flow)
      assert.notEqual(capturedHeaders[0], capturedHeaders[1], 'uniqUuid and uniqUuid2 must produce different UUIDs');
    },
  );
});

// ---------------------------------------------------------------------------
// resolveConstrainedSigil — parameterized unique sigil resolution
// ---------------------------------------------------------------------------

describe('resolveConstrainedSigil', () => {
  test('resolves maxLen + pattern to a string matching both constraints', () => {
    const pattern = '^[A-Z0-9]+$';
    const encoded = Buffer.from(pattern).toString('base64');
    const key = `uniq:maxLen:8:pattern:${encoded}`;
    const result = resolveConstrainedSigil(key);

    assert.ok(result !== null, 'should resolve');
    assert.ok(result!.length <= 8, `length ${result!.length} should be <= 8`);
    assert.match(result!, /^[A-Z0-9]+$/, 'should match pattern');
  });

  test('resolves maxLen only', () => {
    const result = resolveConstrainedSigil('uniq:maxLen:5');
    assert.ok(result !== null);
    assert.ok(result!.length <= 5, `length ${result!.length} should be <= 5`);
  });

  test('resolves with no constraints (just uniq:)', () => {
    // 'uniq:' alone still matches the prefix — uses defaults
    const result = resolveConstrainedSigil('uniq:');
    assert.ok(result !== null);
    assert.ok(result!.length > 0);
  });

  test('returns null for non-uniq key', () => {
    assert.equal(resolveConstrainedSigil('accessToken'), null);
    assert.equal(resolveConstrainedSigil('someOtherKey'), null);
  });

  test('produces unique values across calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const val = resolveConstrainedSigil('uniq:maxLen:12');
      assert.ok(val !== null);
      seen.add(val!);
    }
    // With 12-char random alphanumeric, collision in 20 calls is astronomically unlikely
    assert.ok(seen.size >= 15, `expected mostly unique values, got ${seen.size}/20`);
  });
});
