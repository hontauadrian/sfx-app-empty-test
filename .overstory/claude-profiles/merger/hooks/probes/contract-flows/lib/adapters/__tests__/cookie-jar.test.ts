/**
 * Tests for contract-flows/lib/adapters/cookie-jar.ts.
 *
 * Coverage:
 *   - setCookie() ingests Domain, Path, Expires, Max-Age, HttpOnly, Secure, SameSite.
 *   - cookieHeaderFor() emits matching cookies, respecting domain/path/secure.
 *   - Max-Age overrides Expires.
 *   - Expired cookies (Max-Age=0 or past Expires) are evicted.
 *   - fork() returns an isolated deep-copy.
 *   - delete()/clear() behave as documented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCookieJar } from '../cookie-jar';

test('setCookie() and cookieHeaderFor() round-trip for an exact-host cookie', () => {
  const jar = createCookieJar();
  jar.setCookie('sid=abc; Path=/', 'https://api.example.com/login');
  assert.equal(jar.cookieHeaderFor('https://api.example.com/'), 'sid=abc');
});

test('cookieHeaderFor() respects Path prefix matching', () => {
  const jar = createCookieJar();
  jar.setCookie('admin=1; Path=/admin', 'https://api.example.com/admin');
  assert.equal(jar.cookieHeaderFor('https://api.example.com/admin/users'), 'admin=1');
  assert.equal(jar.cookieHeaderFor('https://api.example.com/'), '');
});

test('cookieHeaderFor() honors Secure attribute (https only)', () => {
  const jar = createCookieJar();
  jar.setCookie('s=v; Path=/; Secure', 'https://api.example.com/');
  assert.equal(jar.cookieHeaderFor('https://api.example.com/'), 's=v');
  assert.equal(jar.cookieHeaderFor('http://api.example.com/'), '');
});

test('Domain attribute allows subdomain match', () => {
  const jar = createCookieJar();
  jar.setCookie('top=t; Domain=example.com; Path=/', 'https://api.example.com/');
  assert.equal(jar.cookieHeaderFor('https://api.example.com/'), 'top=t');
  assert.equal(jar.cookieHeaderFor('https://other.example.com/'), 'top=t');
  assert.equal(jar.cookieHeaderFor('https://example.com/'), 'top=t');
  assert.equal(jar.cookieHeaderFor('https://malicious.com/'), '');
});

test('Max-Age overrides Expires (later wins from Max-Age)', () => {
  const jar = createCookieJar();
  // Expires in the past, Max-Age=60 → effective expiry is Now + 60s.
  jar.setCookie('m=1; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=60', 'https://x.test/');
  assert.equal(jar.cookieHeaderFor('https://x.test/'), 'm=1');
});

test('Max-Age=0 deletes the cookie', () => {
  const jar = createCookieJar();
  jar.setCookie('m=1; Path=/', 'https://x.test/');
  assert.equal(jar.cookieHeaderFor('https://x.test/'), 'm=1');
  jar.setCookie('m=1; Path=/; Max-Age=0', 'https://x.test/');
  assert.equal(jar.cookieHeaderFor('https://x.test/'), '');
});

test('Expired cookies are evicted on read', () => {
  const jar = createCookieJar();
  jar.setCookie('s=v; Path=/', 'https://x.test/');
  // Force an in-the-past now.
  const future = Date.now() + 1000;
  // Override expiresAt directly via the public list/setCookie path: emit
  // an updated Set-Cookie with Max-Age=1 so it expires after a tiny
  // sleep would tick — instead probe via the `now` param to the read
  // method.
  jar.setCookie('s=v; Path=/; Max-Age=1', 'https://x.test/');
  assert.equal(jar.cookieHeaderFor('https://x.test/'), 's=v');
  assert.equal(jar.cookieHeaderFor('https://x.test/', future + 5000), '');
});

test('fork() produces an isolated deep-copy', () => {
  const a = createCookieJar();
  a.setCookie('k=1; Path=/', 'https://x.test/');
  const b = a.fork();
  assert.equal(b.cookieHeaderFor('https://x.test/'), 'k=1');
  // Mutate child; parent must not change.
  b.setCookie('k=2; Path=/', 'https://x.test/');
  assert.equal(b.cookieHeaderFor('https://x.test/'), 'k=2');
  assert.equal(a.cookieHeaderFor('https://x.test/'), 'k=1');
  // Mutate parent; child stays.
  a.setCookie('k=3; Path=/', 'https://x.test/');
  assert.equal(a.cookieHeaderFor('https://x.test/'), 'k=3');
  assert.equal(b.cookieHeaderFor('https://x.test/'), 'k=2');
});

test('delete(name) removes across all (domain,path) tuples', () => {
  const jar = createCookieJar();
  jar.setCookie('s=1; Path=/; Domain=example.com', 'https://api.example.com/');
  jar.setCookie('s=2; Path=/admin; Domain=api.example.com', 'https://api.example.com/admin');
  jar.delete('s');
  assert.equal(jar.cookieHeaderFor('https://api.example.com/'), '');
  assert.equal(jar.cookieHeaderFor('https://api.example.com/admin/'), '');
});

test('clear() empties the jar', () => {
  const jar = createCookieJar();
  jar.setCookie('a=1; Path=/', 'https://x.test/');
  jar.setCookie('b=2; Path=/', 'https://x.test/');
  jar.clear();
  assert.equal(jar.cookieHeaderFor('https://x.test/'), '');
  assert.equal(jar.list().length, 0);
});

test('SameSite attribute is parsed and exposed via list()', () => {
  const jar = createCookieJar();
  jar.setCookie('s=v; Path=/; SameSite=Lax', 'https://x.test/');
  const [c] = jar.list();
  assert.equal(c.sameSite, 'Lax');
});

test('HttpOnly attribute is parsed and exposed via list()', () => {
  const jar = createCookieJar();
  jar.setCookie('s=v; Path=/; HttpOnly', 'https://x.test/');
  const [c] = jar.list();
  assert.equal(c.httpOnly, true);
});

test('cookieHeaderFor() concatenates multiple cookies in path-length-desc order', () => {
  const jar = createCookieJar();
  jar.setCookie('root=r; Path=/', 'https://x.test/');
  jar.setCookie('inner=i; Path=/admin', 'https://x.test/admin');
  const got = jar.cookieHeaderFor('https://x.test/admin/x');
  // Longer path first.
  assert.equal(got, 'inner=i; root=r');
});

test('malformed Set-Cookie (no =) is ignored', () => {
  const jar = createCookieJar();
  jar.setCookie('justaword', 'https://x.test/');
  assert.equal(jar.cookieHeaderFor('https://x.test/'), '');
});

test('overwriting same (domain,path,name) tuple replaces value', () => {
  const jar = createCookieJar();
  jar.setCookie('k=1; Path=/', 'https://x.test/');
  jar.setCookie('k=2; Path=/', 'https://x.test/');
  assert.equal(jar.cookieHeaderFor('https://x.test/'), 'k=2');
});
