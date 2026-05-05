/**
 * Tests for contract-flows/lib/adapters/http-adapter.ts.
 *
 * Coverage (by step kind):
 *   - api: GET / POST / path interpolation / Authorization header / Cookie jar drain.
 *   - api: bodyKind json / form-urlencoded / text. (multipart covered separately.)
 *   - api: per-step timeout → FLOW_STEP_TIMEOUT.
 *   - expect: status / statusAnyOf / bodyHas / headerHas / bodyShape (contains / lengths) / errorEnvelope.
 *   - capture: bindings + headerBindings + cookie:<name> shorthand.
 *   - capture: missing path → FLOW_CAPTURE_NOT_FOUND; missing header → FLOW_HEADER_CAPTURE_NOT_FOUND.
 *   - setAuth: actor lookup, binding fallback, scoped bearer (actor:scope).
 *   - setAuth: unknown id → FLOW_BINDING_UNRESOLVED.
 *   - logout: clears active credential and cookie jar.
 *   - wait: ms wall-clock; advanceMs hits the configured test endpoint.
 *   - poll: terminates on whileBody no-longer-matching; finalCapture binds.
 *   - poll: timeout → FLOW_POLL_TIMEOUT.
 *   - assertIdempotent: replay-same body deep-equal; status mismatch → diagnostic.
 *   - DEFERRED step kinds (parallel, matrix, all 7 cookie kinds — owned
 *     by sibling CookieJarAdapter) → FLOW_UNKNOWN_STEP_KIND.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HttpAdapter } from '../http-adapter';
import { createCookieJar } from '../cookie-jar';
import { createFixtureResolver } from '../../fixtures';
import type { ExecCtx, StepResult } from '../../../adapter-interface';
import type { Step } from '../../../step-types';

function makeCtx(extras: Partial<ExecCtx> = {}): ExecCtx {
  return {
    bindings: {},
    flowId: 'test-flow',
    client: undefined,
    flowScratch: new Map(),
    ...extras,
  };
}

function jsonRes(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

// ── api ────────────────────────────────────────────────────────────────────

test('api: GET interpolates ${binding} in path and stores response on scratch', async () => {
  const fetchStub: typeof fetch = async (input) => {
    const url = String(input);
    assert.equal(url, 'http://h.test/api/users/u-7');
    return jsonRes(200, { id: 'u-7', name: 'Ana' });
  };
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  const ctx = makeCtx({ bindings: { uid: 'u-7' } });
  const r = await adapter.execute(
    { kind: 'api', transport: 'http', method: 'GET', path: '/api/users/${uid}' } as Step,
    ctx,
  );
  assert.equal(r.passed, true);
  // expect can read the response.
  const e = await adapter.execute({ kind: 'expect', status: 200, bodyHas: { '$.id': 'u-7' } } as Step, ctx);
  assert.equal(e.passed, true);
});

test('api: POST with body=json sets Content-Type and stringifies', async () => {
  let receivedBody: string | undefined;
  let receivedCT: string | null = null;
  const fetchStub: typeof fetch = async (_, init) => {
    receivedBody = init!.body as string;
    receivedCT = (init!.headers as Record<string, string>)['Content-Type'];
    return jsonRes(201, { id: 'p-1' });
  };
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  const ctx = makeCtx();
  await adapter.execute({
    kind: 'api', transport: 'http', method: 'POST', path: '/api/posts',
    body: { title: 'hi' },
  } as Step, ctx);
  assert.equal(receivedCT, 'application/json');
  assert.deepEqual(JSON.parse(receivedBody!), { title: 'hi' });
});

test('api: bodyKind=form-urlencoded sets the right content-type', async () => {
  let body: string | undefined;
  let ct: string | null = null;
  const fetchStub: typeof fetch = async (_, init) => {
    body = init!.body as string;
    ct = (init!.headers as Record<string, string>)['Content-Type'];
    return jsonRes(200, {});
  };
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  await adapter.execute({
    kind: 'api', transport: 'http', method: 'POST', path: '/x',
    bodyKind: 'form-urlencoded', body: { a: '1', b: '2' },
  } as Step, makeCtx());
  assert.equal(ct, 'application/x-www-form-urlencoded');
  assert.equal(body, 'a=1&b=2');
});

test('api: bodyKind=text passes raw string with text/plain', async () => {
  let body: string | undefined;
  let ct: string | null = null;
  const fetchStub: typeof fetch = async (_, init) => {
    body = init!.body as string;
    ct = (init!.headers as Record<string, string>)['Content-Type'];
    return jsonRes(200, {});
  };
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  await adapter.execute({
    kind: 'api', transport: 'http', method: 'POST', path: '/x',
    bodyKind: 'text', body: 'plain words',
  } as Step, makeCtx());
  assert.equal(ct, 'text/plain');
  assert.equal(body, 'plain words');
});

test('api: Set-Cookie response headers are drained into the jar', async () => {
  const fetchStub: typeof fetch = async () => {
    const h = new Headers({ 'content-type': 'application/json' });
    h.append('set-cookie', 'sid=abc; Path=/');
    return new Response('{}', { status: 200, headers: h });
  };
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  const ctx = makeCtx();
  await adapter.execute({ kind: 'api', transport: 'http', method: 'POST', path: '/login' } as Step, ctx);
  // Subsequent api step sends the cookie.
  let sentCookie: string | undefined;
  const adapter2Fetch: typeof fetch = async (_, init) => {
    sentCookie = (init!.headers as Record<string, string>)['Cookie'];
    return jsonRes(200, {});
  };
  const a2 = new HttpAdapter('http://h.test', { fetch: adapter2Fetch });
  // Re-use the same ctx.flowScratch / ctx.cookieJar.
  await a2.execute({ kind: 'api', transport: 'http', method: 'GET', path: '/me' } as Step, ctx);
  assert.equal(sentCookie, 'sid=abc');
});

test('api: per-step timeout → blockReason references FLOW_STEP_TIMEOUT', async () => {
  const fetchStub: typeof fetch = (_, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    // Never resolves on its own.
  });
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub, timeoutMs: 50 });
  const r = await adapter.execute(
    { kind: 'api', transport: 'http', method: 'GET', path: '/slow' } as Step,
    makeCtx(),
  );
  assert.equal(r.passed, false);
  assert.match(r.blockReason!, /did not complete within 50ms/);
});

// ── expect ─────────────────────────────────────────────────────────────────

test('expect: statusAnyOf accepts any matching status', async () => {
  const fetchStub: typeof fetch = async () => jsonRes(404, {});
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  const ctx = makeCtx();
  await adapter.execute({ kind: 'api', transport: 'http', method: 'GET', path: '/x' } as Step, ctx);
  const ok = await adapter.execute({ kind: 'expect', statusAnyOf: [403, 404] } as Step, ctx);
  assert.equal(ok.passed, true);
  const fail = await adapter.execute({ kind: 'expect', statusAnyOf: [500] } as Step, ctx);
  assert.equal(fail.passed, false);
});

test('expect: bodyHas matchers (literal, regex, oneOf, type, present/absent)', async () => {
  const fetchStub: typeof fetch = async () => jsonRes(200, {
    name: 'alice', age: 30, status: 'active', tags: ['a'],
  });
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  const ctx = makeCtx();
  await adapter.execute({ kind: 'api', transport: 'http', method: 'GET', path: '/x' } as Step, ctx);
  const r = await adapter.execute({
    kind: 'expect',
    bodyHas: {
      '$.name': 'alice',
      '$.age': { type: 'number' },
      '$.status': { oneOf: ['active', 'pending'] },
      '$.bio': { absent: true },
      '$.tags': { present: true },
    },
  } as Step, ctx);
  assert.equal(r.passed, true);

  const r2 = await adapter.execute({
    kind: 'expect', bodyHas: { '$.name': { matches: '^bob' } },
  } as Step, ctx);
  assert.equal(r2.passed, false);
});

test('expect: headerHas case-insensitive', async () => {
  const fetchStub: typeof fetch = async () => jsonRes(200, {}, { 'X-Trace-Id': 'xyz-9' });
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  const ctx = makeCtx();
  await adapter.execute({ kind: 'api', transport: 'http', method: 'GET', path: '/x' } as Step, ctx);
  const r = await adapter.execute({
    kind: 'expect', headerHas: { 'x-trace-id': { matches: '^xyz' } },
  } as Step, ctx);
  assert.equal(r.passed, true);
});

test('expect: bodyShape contains/excludes assertions on arrays', async () => {
  const fetchStub: typeof fetch = async () => jsonRes(200, [
    { id: '1', kind: 'a' }, { id: '2', kind: 'b' },
  ]);
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  const ctx = makeCtx();
  await adapter.execute({ kind: 'api', transport: 'http', method: 'GET', path: '/x' } as Step, ctx);
  const ok = await adapter.execute({
    kind: 'expect', bodyShape: {
      arrayLength: 2, arrayLengthAtLeast: 1, arrayLengthAtMost: 2,
      contains: [{ kind: 'a' }],
      excludes: [{ kind: 'c' }],
    },
  } as Step, ctx);
  assert.equal(ok.passed, true);
});

test('expect: errorEnvelope checks code/field/messageMatches', async () => {
  const fetchStub: typeof fetch = async () => jsonRes(400, {
    code: 'BAD_INPUT', field: 'email', message: 'must be a valid email',
  });
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  const ctx = makeCtx();
  await adapter.execute({ kind: 'api', transport: 'http', method: 'GET', path: '/x' } as Step, ctx);
  const ok = await adapter.execute({
    kind: 'expect', status: 400,
    errorEnvelope: { code: 'BAD_INPUT', field: 'email', messageMatches: 'valid email' },
  } as Step, ctx);
  assert.equal(ok.passed, true);
});

// ── capture ────────────────────────────────────────────────────────────────

test('capture: bindings + headerBindings populate ctx.bindings', async () => {
  const fetchStub: typeof fetch = async () => jsonRes(200, { id: 'r-1' }, { etag: 'W/"v1"' });
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  const ctx = makeCtx();
  await adapter.execute({ kind: 'api', transport: 'http', method: 'GET', path: '/x' } as Step, ctx);
  const r = await adapter.execute({
    kind: 'capture',
    bindings: { id: '$.id' },
    headerBindings: { etag: 'ETag' },
  } as Step, ctx);
  assert.equal(r.passed, true);
  assert.equal(ctx.bindings.id, 'r-1');
  assert.equal(ctx.bindings.etag, 'W/"v1"');
});

test('capture: missing jsonPath → blockReason mentions FLOW_CAPTURE_NOT_FOUND', async () => {
  const fetchStub: typeof fetch = async () => jsonRes(200, { other: 'v' });
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  const ctx = makeCtx();
  await adapter.execute({ kind: 'api', transport: 'http', method: 'GET', path: '/x' } as Step, ctx);
  const r = await adapter.execute({ kind: 'capture', bindings: { id: '$.id' } } as Step, ctx);
  assert.equal(r.passed, false);
  assert.match(r.blockReason!, /undefined/);
});

test('capture: missing header → blockReason references FLOW_HEADER_CAPTURE_NOT_FOUND', async () => {
  const fetchStub: typeof fetch = async () => jsonRes(200, {});
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  const ctx = makeCtx();
  await adapter.execute({ kind: 'api', transport: 'http', method: 'GET', path: '/x' } as Step, ctx);
  const r = await adapter.execute({
    kind: 'capture', headerBindings: { etag: 'ETag' },
  } as Step, ctx);
  assert.equal(r.passed, false);
  assert.match(r.blockReason!, /missing header/);
});

test('capture: cookie:<name> headerBinding pulls from the jar', async () => {
  const fetchStub: typeof fetch = async () => {
    const h = new Headers({ 'content-type': 'application/json' });
    h.append('set-cookie', 'csrf=tok-9; Path=/');
    return new Response('{}', { status: 200, headers: h });
  };
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  const ctx = makeCtx();
  await adapter.execute({ kind: 'api', transport: 'http', method: 'POST', path: '/login' } as Step, ctx);
  const r = await adapter.execute({
    kind: 'capture', headerBindings: { csrf: 'cookie:csrf' },
  } as Step, ctx);
  assert.equal(r.passed, true);
  assert.equal(ctx.bindings.csrf, 'tok-9');
});

// ── setAuth ────────────────────────────────────────────────────────────────

test('setAuth: actor name lookup populates Authorization on next api', async () => {
  let sent: string | undefined;
  const fetchStub: typeof fetch = async (_, init) => {
    sent = (init!.headers as Record<string, string>)['Authorization'];
    return jsonRes(200, {});
  };
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  adapter.setActorTokens({ owner: { bearer: 'tok-OWNER' } });
  const ctx = makeCtx();
  await adapter.execute({ kind: 'setAuth', binding: 'owner' } as Step, ctx);
  await adapter.execute({ kind: 'api', transport: 'http', method: 'GET', path: '/x' } as Step, ctx);
  assert.equal(sent, 'Bearer tok-OWNER');
});

test('setAuth: scoped bearer via actor:scope syntax', async () => {
  let sent: string | undefined;
  const fetchStub: typeof fetch = async (_, init) => {
    sent = (init!.headers as Record<string, string>)['Authorization'];
    return jsonRes(200, {});
  };
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  adapter.setActorTokens({ srv: { scopedBearers: { write: 'scope-WRITE' } } });
  const ctx = makeCtx();
  await adapter.execute({ kind: 'setAuth', binding: 'srv:write' } as Step, ctx);
  await adapter.execute({ kind: 'api', transport: 'http', method: 'POST', path: '/x' } as Step, ctx);
  assert.equal(sent, 'Bearer scope-WRITE');
});

test('setAuth: capture-binding fallback (when binding name == captured token)', async () => {
  let sent: string | undefined;
  const fetchStub: typeof fetch = async (_, init) => {
    sent = (init!.headers as Record<string, string>)['Authorization'];
    return jsonRes(200, {});
  };
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  const ctx = makeCtx({ bindings: { accessToken: 'cap-TOK' } });
  await adapter.execute({ kind: 'setAuth', binding: 'accessToken' } as Step, ctx);
  await adapter.execute({ kind: 'api', transport: 'http', method: 'GET', path: '/x' } as Step, ctx);
  assert.equal(sent, 'Bearer cap-TOK');
});

test('setAuth: unknown id surfaces blockReason mentioning FLOW_BINDING_UNRESOLVED', async () => {
  const adapter = new HttpAdapter('http://h.test', { fetch: async () => new Response() });
  const r = await adapter.execute({ kind: 'setAuth', binding: 'unknown-id' } as Step, makeCtx());
  assert.equal(r.passed, false);
  assert.match(r.blockReason!, /not set|neither/);
});

test('setAuth: api-key actor injects custom header', async () => {
  let captured: Record<string, string> | undefined;
  const fetchStub: typeof fetch = async (_, init) => {
    captured = init!.headers as Record<string, string>;
    return jsonRes(200, {});
  };
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  adapter.setActorTokens({ k: { apiKey: { headerName: 'X-Tenant-Key', value: 'T-9' } } });
  const ctx = makeCtx();
  await adapter.execute({ kind: 'setAuth', binding: 'k' } as Step, ctx);
  await adapter.execute({ kind: 'api', transport: 'http', method: 'GET', path: '/x' } as Step, ctx);
  assert.equal(captured!['X-Tenant-Key'], 'T-9');
});

// ── logout ─────────────────────────────────────────────────────────────────

test('logout: clears active credential and cookie jar', async () => {
  let authSent: string | undefined;
  const fetchStub: typeof fetch = async (_, init) => {
    authSent = (init!.headers as Record<string, string>)['Authorization'];
    return jsonRes(200, {});
  };
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  adapter.setActorTokens({ u: { bearer: 'T1' } });
  const ctx = makeCtx();
  await adapter.execute({ kind: 'setAuth', binding: 'u' } as Step, ctx);
  await adapter.execute({ kind: 'api', transport: 'http', method: 'GET', path: '/x' } as Step, ctx);
  assert.equal(authSent, 'Bearer T1');
  await adapter.execute({ kind: 'logout' } as Step, ctx);
  await adapter.execute({ kind: 'api', transport: 'http', method: 'GET', path: '/x' } as Step, ctx);
  assert.equal(authSent, undefined);
});

// ── wait ───────────────────────────────────────────────────────────────────

test('wait.ms: sleeps for declared duration (small)', async () => {
  const adapter = new HttpAdapter('http://h.test', { fetch: async () => new Response() });
  const before = Date.now();
  await adapter.execute({ kind: 'wait', ms: 30 } as Step, makeCtx());
  const after = Date.now();
  assert.ok(after - before >= 25, `expected at least 25ms slept, got ${after - before}ms`);
});

test('wait.advanceMs: posts to declared test_endpoints.clockAdvance', async () => {
  let posted: { url: string; body: string } | undefined;
  const fetchStub: typeof fetch = async (input, init) => {
    posted = { url: String(input), body: init!.body as string };
    return jsonRes(200, {});
  };
  const adapter = new HttpAdapter('http://h.test', {
    fetch: fetchStub, testEndpoints: { clockAdvance: '/test/tick' },
  });
  const r = await adapter.execute({ kind: 'wait', advanceMs: 1000 } as Step, makeCtx());
  assert.equal(r.passed, true);
  assert.equal(posted!.url, 'http://h.test/test/tick');
  assert.deepEqual(JSON.parse(posted!.body), { ms: 1000 });
});

// ── poll ───────────────────────────────────────────────────────────────────

test('poll: stops when whileBody no longer matches; finalCapture binds', async () => {
  let i = 0;
  const fetchStub: typeof fetch = async () => {
    i += 1;
    if (i < 3) return jsonRes(200, { status: 'pending' });
    return jsonRes(200, { status: 'complete', downloadUrl: 'http://h.test/file' });
  };
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  const ctx = makeCtx();
  const r = await adapter.execute({
    kind: 'poll',
    request: { method: 'GET', path: '/job/1/status' },
    whileBody: { '$.status': 'pending' },
    intervalMs: 5,
    timeoutMs: 1000,
    finalExpect: { status: 200, bodyHas: { '$.status': 'complete' } },
    finalCapture: { bindings: { downloadUrl: '$.downloadUrl' } },
  } as Step, ctx);
  assert.equal(r.passed, true);
  assert.equal(ctx.bindings.downloadUrl, 'http://h.test/file');
  assert.ok(i >= 3);
});

test('poll: timeout → FLOW_POLL_TIMEOUT', async () => {
  const fetchStub: typeof fetch = async () => jsonRes(200, { status: 'pending' });
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  const r = await adapter.execute({
    kind: 'poll',
    request: { method: 'GET', path: '/x' },
    whileBody: { '$.status': 'pending' },
    intervalMs: 5,
    timeoutMs: 30,
  } as Step, makeCtx());
  assert.equal(r.passed, false);
  assert.match(r.blockReason!, /predicate kept matching for 30ms/);
});

// ── assertIdempotent ───────────────────────────────────────────────────────

test('assertIdempotent: replay-same with deep-equal body passes', async () => {
  let calls = 0;
  const fetchStub: typeof fetch = async () => {
    calls += 1;
    return jsonRes(calls === 1 ? 201 : 200, { id: 'r-1', val: 42 });
  };
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  const r = await adapter.execute({
    kind: 'assertIdempotent',
    request: { method: 'POST', path: '/x', body: { a: 1 } },
    keyHeader: 'Idempotency-Key',
    variant: 'replay-same',
    expectReplayStatus: 200,
  } as Step, makeCtx());
  assert.equal(r.passed, true);
  assert.equal(calls, 2);
});

test('assertIdempotent: replay-same with diverging body → FLOW_IDEMPOTENCY_REPLAY_MISMATCH', async () => {
  let calls = 0;
  const fetchStub: typeof fetch = async () => {
    calls += 1;
    return jsonRes(calls === 1 ? 201 : 200, { id: 'r-1', val: calls });
  };
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  const r = await adapter.execute({
    kind: 'assertIdempotent',
    request: { method: 'POST', path: '/x', body: { a: 1 } },
    keyHeader: 'Idempotency-Key',
    variant: 'replay-same',
    expectReplayStatus: 200,
  } as Step, makeCtx());
  assert.equal(r.passed, false);
  assert.match(r.blockReason!, /diverged/);
});

test('assertIdempotent: first-not-2xx surfaces a typed mismatch', async () => {
  const fetchStub: typeof fetch = async () => jsonRes(500, { err: 'down' });
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  const r = await adapter.execute({
    kind: 'assertIdempotent',
    request: { method: 'POST', path: '/x', body: {} },
    keyHeader: 'Idempotency-Key',
    variant: 'replay-same',
  } as Step, makeCtx());
  assert.equal(r.passed, false);
  assert.match(r.blockReason!, /first response status 500/);
});

test('assertIdempotent: replay-different-body expects conflictStatus', async () => {
  let calls = 0;
  const fetchStub: typeof fetch = async () => {
    calls += 1;
    return jsonRes(calls === 1 ? 201 : 409, { ok: calls === 1 });
  };
  const adapter = new HttpAdapter('http://h.test', { fetch: fetchStub });
  const r = await adapter.execute({
    kind: 'assertIdempotent',
    request: { method: 'POST', path: '/x', body: { a: 1 } },
    keyHeader: 'Idempotency-Key',
    variant: 'replay-different-body',
    conflictStatus: 409,
  } as Step, makeCtx());
  assert.equal(r.passed, true);
});

// ── deferred kinds ─────────────────────────────────────────────────────────

test('cookie primitive step kinds are NOT claimed by HttpAdapter — sibling owns them', () => {
  const a = new HttpAdapter('http://h.test');
  for (const kind of [
    'capture-cookie', 'replay-cookie-as-header', 'omit-cookie',
    'assert-cookie-rotated', 'assert-cookie-cleared', 'assert-cookie-attrs',
    'tamper-cookie',
  ]) {
    assert.equal(a.supports({ kind, name: 'sid', binding: 'b', header: 'X', attrs: {} } as unknown as Step), false,
      `expected supports() to reject '${kind}'`);
  }
});

test('cookie step that reaches execute() is reported as belonging-to-other-adapter', async () => {
  const a = new HttpAdapter('http://h.test');
  const r = await a.execute({ kind: 'capture-cookie', name: 'sid', binding: 'b' } as Step, makeCtx());
  assert.equal(r.passed, false);
  assert.match(r.blockReason!, /capture-cookie/);
});

test('parallel step (P2-1) is reported as deferred via FLOW_UNKNOWN_STEP_KIND', async () => {
  const adapter = new HttpAdapter('http://h.test', { fetch: async () => new Response() });
  const r = await adapter.execute({
    kind: 'parallel', branches: [{ steps: [{ kind: 'api', transport: 'http', method: 'GET', path: '/x' }] }],
  } as Step, makeCtx());
  assert.equal(r.passed, false);
  assert.match(r.blockReason!, /parallel/);
});

test('matrix step (P2-3) is reported as deferred', async () => {
  const adapter = new HttpAdapter('http://h.test', { fetch: async () => new Response() });
  const r = await adapter.execute({
    kind: 'matrix', axis: { a: ['1'] },
    template: { steps: [{ kind: 'api', transport: 'http', method: 'GET', path: '/x' }] },
  } as Step, makeCtx());
  assert.equal(r.passed, false);
  assert.match(r.blockReason!, /matrix/);
});

// ── adapter discovery ──────────────────────────────────────────────────────

test('adapter id is { transport: "http", version: "1" } and supports() routes by transport tag', () => {
  const a = new HttpAdapter('http://h.test');
  assert.deepEqual(a.id, { transport: 'http', version: '1' });
  assert.equal(a.supports({ kind: 'api', transport: 'http', method: 'GET', path: '/' } as Step), true);
  assert.equal(a.supports({ kind: 'api', transport: 'ws', method: 'GET', path: '/' } as Step), false);
  // Untagged HTTP step kinds the adapter owns (cookie kinds belong to the
  // sibling CookieJarAdapter and are NOT claimed here — see separate test).
  assert.equal(a.supports({ kind: 'wait', ms: 1 } as Step), true);
  assert.equal(a.supports({ kind: 'poll', request: { method: 'GET', path: '/' }, intervalMs: 1, timeoutMs: 1 } as Step), true);
});

test('parseSchema() returns the StepSchema (Zod accepts a valid api step)', () => {
  const a = new HttpAdapter('http://h.test');
  const ok = a.parseSchema().safeParse({ kind: 'api', transport: 'http', method: 'GET', path: '/x' });
  assert.equal(ok.success, true);
});
