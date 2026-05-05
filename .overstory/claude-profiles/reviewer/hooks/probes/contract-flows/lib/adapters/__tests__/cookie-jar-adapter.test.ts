/**
 * Tests for contract-flows/lib/adapters/cookie-jar-adapter.ts.
 *
 * Coverage (each step kind):
 *   - capture-cookie: cookie present → binds; absent → blockReason.
 *   - replay-cookie-as-header: cookie present → header binding; absent → blockReason.
 *   - omit-cookie: removes the cookie from the jar.
 *   - assert-cookie-rotated: first observation passes; same value twice fails;
 *     rotated value passes.
 *   - assert-cookie-cleared: cookie absent → pass; present → blockReason.
 *   - assert-cookie-attrs: each attribute (httpOnly, secure, sameSite, path,
 *     domain, maxAgeAtMost) verified independently.
 *   - tamper-cookie: each variant (invalid-value, expired, wrong-issuer,
 *     wrong-audience) leaves a mutated cookie in the jar.
 *
 *   - supports() — claims cookie kinds; rejects steps tagged with foreign
 *     transport; claims when transport === 'cookie-jar'.
 *
 * Tests share a single CookieJar across CookieJarAdapter calls via
 * `ExecCtx.cookieJar` (the foundation interface).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CookieJarAdapter } from '../cookie-jar-adapter';
import { createCookieJar } from '../cookie-jar';
import type { ExecCtx } from '../../../adapter-interface';
import type { Step } from '../../../step-types';

function makeCtx(): ExecCtx {
  return {
    bindings: {},
    flowId: 'cj-test',
    client: undefined,
    cookieJar: createCookieJar(),
    flowScratch: new Map(),
  };
}

// ── capture-cookie ─────────────────────────────────────────────────────────

test('capture-cookie binds the value when the cookie is in the jar', async () => {
  const a = new CookieJarAdapter();
  const ctx = makeCtx();
  (ctx.cookieJar as ReturnType<typeof createCookieJar>).setCookie('sid=ABC; Path=/', 'https://h.test/');
  const r = await a.execute({ kind: 'capture-cookie', name: 'sid', binding: 'session' } as Step, ctx);
  assert.equal(r.passed, true);
  assert.equal(ctx.bindings.session, 'ABC');
  assert.deepEqual(r.capturedBindings, { session: 'ABC' });
});

test('capture-cookie surfaces blockReason when the cookie is absent', async () => {
  const a = new CookieJarAdapter();
  const ctx = makeCtx();
  const r = await a.execute({ kind: 'capture-cookie', name: 'missing', binding: 'b' } as Step, ctx);
  assert.equal(r.passed, false);
  assert.match(r.blockReason!, /absent/);
});

// ── replay-cookie-as-header ────────────────────────────────────────────────

test('replay-cookie-as-header writes the binding for header echo', async () => {
  const a = new CookieJarAdapter();
  const ctx = makeCtx();
  (ctx.cookieJar as ReturnType<typeof createCookieJar>).setCookie('csrf=tok; Path=/', 'https://h.test/');
  const r = await a.execute({ kind: 'replay-cookie-as-header', name: 'csrf', header: 'X-CSRF' } as Step, ctx);
  assert.equal(r.passed, true);
  assert.equal(ctx.bindings['X-CSRF'], 'tok');
});

test('replay-cookie-as-header errors when the cookie is absent', async () => {
  const a = new CookieJarAdapter();
  const r = await a.execute({ kind: 'replay-cookie-as-header', name: 'no', header: 'X' } as Step, makeCtx());
  assert.equal(r.passed, false);
  assert.match(r.blockReason!, /not in jar/);
});

// ── omit-cookie ────────────────────────────────────────────────────────────

test('omit-cookie removes the cookie from the jar', async () => {
  const a = new CookieJarAdapter();
  const ctx = makeCtx();
  const jar = ctx.cookieJar as ReturnType<typeof createCookieJar>;
  jar.setCookie('sid=A; Path=/', 'https://h.test/');
  await a.execute({ kind: 'omit-cookie', name: 'sid' } as Step, ctx);
  assert.equal(jar.cookieHeaderFor('https://h.test/'), '');
});

// ── assert-cookie-rotated ──────────────────────────────────────────────────

test('assert-cookie-rotated: first observation passes (records sentinel)', async () => {
  const a = new CookieJarAdapter();
  const ctx = makeCtx();
  (ctx.cookieJar as ReturnType<typeof createCookieJar>).setCookie('sid=v1; Path=/', 'https://h.test/');
  const r = await a.execute({ kind: 'assert-cookie-rotated', name: 'sid' } as Step, ctx);
  assert.equal(r.passed, true);
});

test('assert-cookie-rotated: unchanged value on second observation fails', async () => {
  const a = new CookieJarAdapter();
  const ctx = makeCtx();
  const jar = ctx.cookieJar as ReturnType<typeof createCookieJar>;
  jar.setCookie('sid=v1; Path=/', 'https://h.test/');
  await a.execute({ kind: 'assert-cookie-rotated', name: 'sid' } as Step, ctx);
  // Same value on second call → fail.
  const r = await a.execute({ kind: 'assert-cookie-rotated', name: 'sid' } as Step, ctx);
  assert.equal(r.passed, false);
  assert.match(r.blockReason!, /unchanged/);
});

test('assert-cookie-rotated: different value on second observation passes', async () => {
  const a = new CookieJarAdapter();
  const ctx = makeCtx();
  const jar = ctx.cookieJar as ReturnType<typeof createCookieJar>;
  jar.setCookie('sid=v1; Path=/', 'https://h.test/');
  await a.execute({ kind: 'assert-cookie-rotated', name: 'sid' } as Step, ctx);
  jar.setCookie('sid=v2; Path=/', 'https://h.test/');
  const r = await a.execute({ kind: 'assert-cookie-rotated', name: 'sid' } as Step, ctx);
  assert.equal(r.passed, true);
});

test('assert-cookie-rotated: missing cookie on first call fails', async () => {
  const a = new CookieJarAdapter();
  const r = await a.execute({ kind: 'assert-cookie-rotated', name: 'missing' } as Step, makeCtx());
  assert.equal(r.passed, false);
  assert.match(r.blockReason!, /absent/);
});

// ── assert-cookie-cleared ──────────────────────────────────────────────────

test('assert-cookie-cleared passes when the cookie is absent', async () => {
  const a = new CookieJarAdapter();
  const r = await a.execute({ kind: 'assert-cookie-cleared', name: 'sid' } as Step, makeCtx());
  assert.equal(r.passed, true);
});

test('assert-cookie-cleared fails when the cookie is present', async () => {
  const a = new CookieJarAdapter();
  const ctx = makeCtx();
  (ctx.cookieJar as ReturnType<typeof createCookieJar>).setCookie('sid=v; Path=/', 'https://h.test/');
  const r = await a.execute({ kind: 'assert-cookie-cleared', name: 'sid' } as Step, ctx);
  assert.equal(r.passed, false);
  assert.match(r.blockReason!, /present in jar/);
});

// ── assert-cookie-attrs ────────────────────────────────────────────────────

test('assert-cookie-attrs verifies httpOnly + secure + sameSite together', async () => {
  const a = new CookieJarAdapter();
  const ctx = makeCtx();
  (ctx.cookieJar as ReturnType<typeof createCookieJar>).setCookie(
    'sid=v; Path=/; HttpOnly; Secure; SameSite=Lax', 'https://h.test/',
  );
  const r = await a.execute({
    kind: 'assert-cookie-attrs', name: 'sid',
    attrs: { httpOnly: true, secure: true, sameSite: 'Lax' },
  } as Step, ctx);
  assert.equal(r.passed, true);
});

test('assert-cookie-attrs fails when httpOnly mismatches', async () => {
  const a = new CookieJarAdapter();
  const ctx = makeCtx();
  (ctx.cookieJar as ReturnType<typeof createCookieJar>).setCookie('sid=v; Path=/', 'https://h.test/');
  const r = await a.execute({
    kind: 'assert-cookie-attrs', name: 'sid', attrs: { httpOnly: true },
  } as Step, ctx);
  assert.equal(r.passed, false);
  assert.match(r.blockReason!, /httpOnly=true/);
});

test('assert-cookie-attrs fails when path mismatches', async () => {
  const a = new CookieJarAdapter();
  const ctx = makeCtx();
  (ctx.cookieJar as ReturnType<typeof createCookieJar>).setCookie('sid=v; Path=/admin', 'https://h.test/admin');
  const r = await a.execute({
    kind: 'assert-cookie-attrs', name: 'sid', attrs: { path: '/' },
  } as Step, ctx);
  assert.equal(r.passed, false);
  assert.match(r.blockReason!, /path=\//);
});

test('assert-cookie-attrs maxAgeAtMost: passes within window', async () => {
  const a = new CookieJarAdapter();
  const ctx = makeCtx();
  (ctx.cookieJar as ReturnType<typeof createCookieJar>).setCookie(
    'sid=v; Path=/; Max-Age=10', 'https://h.test/',
  );
  const r = await a.execute({
    kind: 'assert-cookie-attrs', name: 'sid', attrs: { maxAgeAtMost: 60 },
  } as Step, ctx);
  assert.equal(r.passed, true);
});

test('assert-cookie-attrs maxAgeAtMost: fails when remaining exceeds bound', async () => {
  const a = new CookieJarAdapter();
  const ctx = makeCtx();
  (ctx.cookieJar as ReturnType<typeof createCookieJar>).setCookie(
    'sid=v; Path=/; Max-Age=3600', 'https://h.test/',
  );
  const r = await a.execute({
    kind: 'assert-cookie-attrs', name: 'sid', attrs: { maxAgeAtMost: 5 },
  } as Step, ctx);
  assert.equal(r.passed, false);
  assert.match(r.blockReason!, /maxAgeAtMost=5/);
});

test('assert-cookie-attrs fails when cookie is absent entirely', async () => {
  const a = new CookieJarAdapter();
  const r = await a.execute({
    kind: 'assert-cookie-attrs', name: 'missing', attrs: { secure: true },
  } as Step, makeCtx());
  assert.equal(r.passed, false);
  assert.match(r.blockReason!, /absent/);
});

// ── tamper-cookie ──────────────────────────────────────────────────────────

test('tamper-cookie invalid-value: prefixes the value with INVALID-', async () => {
  const a = new CookieJarAdapter();
  const ctx = makeCtx();
  const jar = ctx.cookieJar as ReturnType<typeof createCookieJar>;
  jar.setCookie('sid=ABC; Path=/', 'https://h.test/');
  await a.execute({ kind: 'tamper-cookie', name: 'sid', with: 'invalid-value' } as Step, ctx);
  assert.equal(jar.cookieHeaderFor('https://h.test/'), 'sid=INVALID-ABC');
});

test('tamper-cookie expired: cookie is no longer emitted', async () => {
  const a = new CookieJarAdapter();
  const ctx = makeCtx();
  const jar = ctx.cookieJar as ReturnType<typeof createCookieJar>;
  jar.setCookie('sid=ABC; Path=/', 'https://h.test/');
  await a.execute({ kind: 'tamper-cookie', name: 'sid', with: 'expired' } as Step, ctx);
  assert.equal(jar.cookieHeaderFor('https://h.test/'), '');
});

test('tamper-cookie wrong-issuer: prefixes value with wrong-issuer.', async () => {
  const a = new CookieJarAdapter();
  const ctx = makeCtx();
  const jar = ctx.cookieJar as ReturnType<typeof createCookieJar>;
  jar.setCookie('sid=ABC; Path=/', 'https://h.test/');
  await a.execute({ kind: 'tamper-cookie', name: 'sid', with: 'wrong-issuer' } as Step, ctx);
  assert.match(jar.cookieHeaderFor('https://h.test/'), /wrong-issuer\.ABC/);
});

test('tamper-cookie wrong-audience: prefixes value with wrong-aud.', async () => {
  const a = new CookieJarAdapter();
  const ctx = makeCtx();
  const jar = ctx.cookieJar as ReturnType<typeof createCookieJar>;
  jar.setCookie('sid=ABC; Path=/', 'https://h.test/');
  await a.execute({ kind: 'tamper-cookie', name: 'sid', with: 'wrong-audience' } as Step, ctx);
  assert.match(jar.cookieHeaderFor('https://h.test/'), /wrong-aud\.ABC/);
});

test('tamper-cookie fails when the cookie is absent', async () => {
  const a = new CookieJarAdapter();
  const r = await a.execute({ kind: 'tamper-cookie', name: 'no', with: 'invalid-value' } as Step, makeCtx());
  assert.equal(r.passed, false);
  assert.match(r.blockReason!, /absent from jar/);
});

// ── adapter discovery ──────────────────────────────────────────────────────

test('adapter id is { transport: "cookie-jar", version: "1" }', () => {
  const a = new CookieJarAdapter();
  assert.deepEqual(a.id, { transport: 'cookie-jar', version: '1' });
});

test('supports() claims all 7 cookie kinds when untagged', () => {
  const a = new CookieJarAdapter();
  for (const kind of [
    'capture-cookie', 'replay-cookie-as-header', 'omit-cookie',
    'assert-cookie-rotated', 'assert-cookie-cleared', 'assert-cookie-attrs',
    'tamper-cookie',
  ]) {
    assert.equal(a.supports({ kind, name: 'x', binding: 'b', header: 'H', attrs: {} } as unknown as Step), true,
      `expected supports() to claim '${kind}'`);
  }
});

test('supports() claims when transport tag is "cookie-jar"', () => {
  const a = new CookieJarAdapter();
  assert.equal(a.supports({ kind: 'capture-cookie', transport: 'cookie-jar', name: 's', binding: 'b' } as unknown as Step), true);
});

test('supports() rejects steps tagged with a foreign transport', () => {
  const a = new CookieJarAdapter();
  assert.equal(a.supports({ kind: 'capture-cookie', transport: 'http', name: 's', binding: 'b' } as unknown as Step), false);
});

test('supports() rejects api / expect / setAuth (HTTP adapter owns those)', () => {
  const a = new CookieJarAdapter();
  assert.equal(a.supports({ kind: 'api', method: 'GET', path: '/' } as unknown as Step), false);
  assert.equal(a.supports({ kind: 'expect', status: 200 } as unknown as Step), false);
  assert.equal(a.supports({ kind: 'setAuth', binding: 'x' } as unknown as Step), false);
});
