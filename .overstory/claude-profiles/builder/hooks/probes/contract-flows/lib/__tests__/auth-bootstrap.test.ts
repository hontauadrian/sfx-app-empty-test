/**
 * Tests for contract-flows/lib/auth-bootstrap.ts.
 *
 * Coverage (per scheme):
 *   - bearer-in-body: register-then-login happy path; 4xx login → diagnostic.
 *   - bearer-in-header: Authorization extracted; missing header → diagnostic.
 *   - cookie: Set-Cookie populates a per-actor jar.
 *   - api-key: pure pass-through; missing fields → diagnostic.
 *   - oauth-scoped: per-scope POST to tokenEndpoint.
 *   - anonymous: no-op.
 *   - unknown scheme → diagnostic.
 *
 * Tests use a stub fetch (no real network).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { MergedContract } from '../../contract-flows-merger';
import { bootstrapActors } from '../auth-bootstrap';

function emptyContract(): MergedContract {
  return {
    actors: new Map(),
    resources: new Map(),
    specialFlows: [],
    taskIds: [],
    fixtures: new Map(),
    config: { reservedActors: {} },
  };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const h = new Headers({ 'content-type': 'application/json', ...headers });
  return new Response(JSON.stringify(body), { status, headers: h });
}

test('bearer-in-body: register-then-login extracts $.accessToken', async () => {
  const contract = emptyContract();
  contract.actors.set('owner', {
    sourceFile: '_shared.yaml',
    actor: {
      name: 'owner',
      auth: {
        scheme: 'bearer-in-body',
        register: { path: '/auth/register', body: { email: 'o@x.test', password: 'p' } },
        login:    { path: '/auth/login',    body: { email: 'o@x.test', password: 'p' }, key: '$.accessToken' },
      },
    },
  });

  const calls: string[] = [];
  const fetchStub: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : (input as URL).toString();
    calls.push(url);
    if (url.endsWith('/auth/register')) return jsonResponse(201, { ok: true });
    if (url.endsWith('/auth/login')) return jsonResponse(200, { accessToken: 'tok-123', refreshToken: 'r' });
    return new Response(null, { status: 404 });
  };

  const result = await bootstrapActors(contract, { baseUrl: 'http://h.test', fetch: fetchStub });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.tokens.owner.bearer, 'tok-123');
  assert.equal(calls.length, 2);
});

test('bearer-in-body: login 401 produces AUTH_BOOTSTRAP_ACTOR_FAILED', async () => {
  const contract = emptyContract();
  contract.actors.set('bad', {
    sourceFile: '_shared.yaml',
    actor: { name: 'bad', auth: { scheme: 'bearer-in-body', login: { path: '/login', body: {} } } },
  });

  const fetchStub: typeof fetch = async () => new Response(null, { status: 401 });

  const result = await bootstrapActors(contract, { baseUrl: 'http://h.test', fetch: fetchStub });
  assert.equal(result.tokens.bad, undefined);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].code, 'FLOW_AUTH_BOOTSTRAP_ACTOR_FAILED');
});

test('bearer-in-header: Authorization stripped of "Bearer " prefix', async () => {
  const contract = emptyContract();
  contract.actors.set('h', {
    sourceFile: '_shared.yaml',
    actor: { name: 'h', auth: { scheme: 'bearer-in-header', login: { path: '/login', body: {} } } },
  });

  const fetchStub: typeof fetch = async () => new Response(null, {
    status: 200, headers: { authorization: 'Bearer hdr-token-9' },
  });

  const result = await bootstrapActors(contract, { baseUrl: 'http://h.test', fetch: fetchStub });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.tokens.h.bearer, 'hdr-token-9');
});

test('bearer-in-header: missing header → diagnostic', async () => {
  const contract = emptyContract();
  contract.actors.set('h', {
    sourceFile: '_shared.yaml',
    actor: { name: 'h', auth: { scheme: 'bearer-in-header', login: { path: '/login', body: {} } } },
  });
  const fetchStub: typeof fetch = async () => new Response(null, { status: 200 });
  const result = await bootstrapActors(contract, { baseUrl: 'http://h.test', fetch: fetchStub });
  assert.equal(result.tokens.h, undefined);
  assert.equal(result.diagnostics[0].code, 'FLOW_AUTH_BOOTSTRAP_ACTOR_FAILED');
});

test('cookie scheme populates a CookieJar from Set-Cookie', async () => {
  const contract = emptyContract();
  contract.actors.set('c', {
    sourceFile: '_shared.yaml',
    actor: { name: 'c', auth: { scheme: 'cookie', login: { path: '/login', body: {} } } },
  });
  const fetchStub: typeof fetch = async () => {
    const h = new Headers();
    h.append('set-cookie', 'session=abc; Path=/; HttpOnly; Secure');
    h.append('set-cookie', 'csrf=xyz; Path=/');
    return new Response(null, { status: 200, headers: h });
  };
  const result = await bootstrapActors(contract, { baseUrl: 'https://h.test', fetch: fetchStub });
  assert.deepEqual(result.diagnostics, []);
  const jar = result.tokens.c.cookieJar!;
  const sent = jar.cookieHeaderFor('https://h.test/something');
  assert.match(sent, /session=abc/);
  assert.match(sent, /csrf=xyz/);
});

test('api-key scheme: pure pass-through, no fetch call', async () => {
  const contract = emptyContract();
  contract.actors.set('k', {
    sourceFile: '_shared.yaml',
    actor: { name: 'k', auth: { scheme: 'api-key', headerName: 'X-API-Key', value: 'secret-XYZ' } },
  });
  let called = false;
  const fetchStub: typeof fetch = async () => { called = true; return new Response(); };
  const result = await bootstrapActors(contract, { baseUrl: 'http://h.test', fetch: fetchStub });
  assert.equal(called, false);
  assert.deepEqual(result.tokens.k.apiKey, { headerName: 'X-API-Key', value: 'secret-XYZ' });
});

test('api-key scheme: missing value → diagnostic', async () => {
  const contract = emptyContract();
  contract.actors.set('k', {
    sourceFile: '_shared.yaml',
    actor: { name: 'k', auth: { scheme: 'api-key', headerName: 'X-API-Key' } },
  });
  const result = await bootstrapActors(contract, { baseUrl: 'http://h.test', fetch: async () => new Response() });
  assert.equal(result.tokens.k, undefined);
  assert.equal(result.diagnostics[0].code, 'FLOW_AUTH_BOOTSTRAP_ACTOR_FAILED');
});

test('oauth-scoped: each scope produces a per-scope bearer', async () => {
  const contract = emptyContract();
  contract.actors.set('o', {
    sourceFile: '_shared.yaml',
    actor: {
      name: 'o',
      auth: {
        scheme: 'oauth-scoped',
        tokenEndpoint: '/oauth/token',
        scopes: ['read', 'write'],
        clientId: 'cid', clientSecret: 'csec',
      },
    },
  });
  const seen: string[] = [];
  const fetchStub: typeof fetch = async (_input, init) => {
    const body = init?.body as string;
    const m = /scope=([^&]+)/.exec(body);
    seen.push(m![1]);
    return jsonResponse(200, { access_token: `t-${m![1]}` });
  };
  const result = await bootstrapActors(contract, { baseUrl: 'http://h.test', fetch: fetchStub });
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.tokens.o.scopedBearers, { read: 't-read', write: 't-write' });
  assert.deepEqual(seen.sort(), ['read', 'write']);
});

test('anonymous scheme is a no-op (empty credential)', async () => {
  const contract = emptyContract();
  contract.actors.set('guest', {
    sourceFile: '_shared.yaml',
    actor: { name: 'guest', auth: { scheme: 'anonymous' } },
  });
  let called = false;
  const fetchStub: typeof fetch = async () => { called = true; return new Response(); };
  const result = await bootstrapActors(contract, { baseUrl: 'http://h.test', fetch: fetchStub });
  assert.equal(called, false);
  assert.deepEqual(result.tokens.guest, {});
});

test('reserved anonymous actor is always present even if not declared', async () => {
  const contract = emptyContract();
  const result = await bootstrapActors(contract, { baseUrl: 'http://h.test', fetch: async () => new Response() });
  assert.ok('anonymous' in result.tokens);
  assert.deepEqual(result.tokens.anonymous, {});
});

test('unknown scheme → diagnostic; actor excluded from tokens', async () => {
  const contract = emptyContract();
  contract.actors.set('weird', {
    sourceFile: '_shared.yaml',
    actor: { name: 'weird', auth: { scheme: 'lightning-bolt' } },
  });
  const result = await bootstrapActors(contract, { baseUrl: 'http://h.test', fetch: async () => new Response() });
  assert.equal(result.tokens.weird, undefined);
  assert.equal(result.diagnostics[0].code, 'FLOW_AUTH_BOOTSTRAP_ACTOR_FAILED');
});
