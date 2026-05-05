'use strict';

/**
 * Unit tests for lib/cookie-jar.js — RFC 6265bis-compliant cookie jar.
 *
 * Run with: node --test __tests__/cookie-jar/cookie-jar.test.js
 * Uses node:test + node:assert/strict. No external deps.
 *
 * Covers spec §6 edge cases 1–25 (unit-testable subset).
 */

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { CookieJar, parseSetCookie } = require(path.resolve(
  __dirname, '..', '..', 'probes', 'lib', 'cookie-jar.js'
));

// ---------------------------------------------------------------------------
// parseSetCookie — low-level parser tests
// ---------------------------------------------------------------------------

describe('parseSetCookie', () => {
  test('parses simple name=value', () => {
    const result = parseSetCookie('session=abc123');
    assert.equal(result.name, 'session');
    assert.equal(result.value, 'abc123');
    assert.equal(result.attrs.httpOnly, false);
    assert.equal(result.attrs.secure, false);
    assert.equal(result.attrs.sameSite, null);
    assert.equal(result.attrs.path, null);
    assert.equal(result.attrs.domain, null);
    assert.equal(result.attrs.maxAge, null);
    assert.equal(result.attrs.expires, null);
  });

  test('parses all attributes', () => {
    const header = 'tok=v; Path=/api; Domain=example.com; HttpOnly; Secure; SameSite=Strict; Max-Age=3600; Expires=Thu, 01 Jan 2099 00:00:00 GMT';
    const result = parseSetCookie(header);
    assert.equal(result.name, 'tok');
    assert.equal(result.value, 'v');
    assert.equal(result.attrs.path, '/api');
    assert.equal(result.attrs.domain, 'example.com');
    assert.equal(result.attrs.httpOnly, true);
    assert.equal(result.attrs.secure, true);
    assert.equal(result.attrs.sameSite, 'Strict');
    assert.equal(result.attrs.maxAge, 3600);
    assert.equal(result.attrs.expires, 'Thu, 01 Jan 2099 00:00:00 GMT');
  });

  test('strips leading dot from Domain (RFC 6265 §5.2.3)', () => {
    const result = parseSetCookie('a=b; Domain=.example.com');
    assert.equal(result.attrs.domain, 'example.com');
  });

  test('lowercases Domain', () => {
    const result = parseSetCookie('a=b; Domain=Example.COM');
    assert.equal(result.attrs.domain, 'example.com');
  });

  test('normalizes SameSite casing: lax → Lax', () => {
    assert.equal(parseSetCookie('a=b; SameSite=lax').attrs.sameSite, 'Lax');
    assert.equal(parseSetCookie('a=b; SameSite=STRICT').attrs.sameSite, 'Strict');
    assert.equal(parseSetCookie('a=b; SameSite=none').attrs.sameSite, 'None');
  });

  test('handles non-standard SameSite value as-is', () => {
    assert.equal(parseSetCookie('a=b; SameSite=Banana').attrs.sameSite, 'Banana');
  });

  test('parses Max-Age=0', () => {
    const result = parseSetCookie('a=b; Max-Age=0');
    assert.equal(result.attrs.maxAge, 0);
  });

  test('parses negative Max-Age', () => {
    const result = parseSetCookie('a=b; Max-Age=-1');
    assert.equal(result.attrs.maxAge, -1);
  });

  test('ignores non-numeric Max-Age', () => {
    const result = parseSetCookie('a=b; Max-Age=abc');
    assert.equal(result.attrs.maxAge, null);
  });

  // Edge 23: quoted value
  test('unquotes double-quoted value', () => {
    const result = parseSetCookie('tok="hello world"');
    assert.equal(result.value, 'hello world');
  });

  // Edge 17: empty value
  test('handles empty value (name=)', () => {
    const result = parseSetCookie('pr_empty=');
    assert.equal(result.name, 'pr_empty');
    assert.equal(result.value, '');
  });

  test('returns null for empty string', () => {
    assert.equal(parseSetCookie(''), null);
  });

  test('returns null for non-string input', () => {
    assert.equal(parseSetCookie(null), null);
    assert.equal(parseSetCookie(undefined), null);
    assert.equal(parseSetCookie(42), null);
  });

  test('returns null for cookie with empty name', () => {
    assert.equal(parseSetCookie('=value'), null);
  });

  test('handles cookie with no = (name only, empty value)', () => {
    const result = parseSetCookie('justname');
    assert.equal(result.name, 'justname');
    assert.equal(result.value, '');
  });

  // Edge 2: cookie with special chars in value (= and ; encoded/base64)
  test('handles base64-padded value with = inside', () => {
    const result = parseSetCookie('tok=dGVzdA==; Path=/');
    assert.equal(result.name, 'tok');
    assert.equal(result.value, 'dGVzdA==');
    assert.equal(result.attrs.path, '/');
  });

  test('handles HttpOnly as case-insensitive', () => {
    assert.equal(parseSetCookie('a=b; httponly').attrs.httpOnly, true);
    assert.equal(parseSetCookie('a=b; HTTPONLY').attrs.httpOnly, true);
    assert.equal(parseSetCookie('a=b; HttpOnly').attrs.httpOnly, true);
  });

  test('handles Secure as case-insensitive', () => {
    assert.equal(parseSetCookie('a=b; secure').attrs.secure, true);
    assert.equal(parseSetCookie('a=b; SECURE').attrs.secure, true);
  });

  test('ignores unknown attributes per RFC 6265 §5.2 step 7', () => {
    const result = parseSetCookie('a=b; SomeCustom=xyz; HttpOnly');
    assert.equal(result.attrs.httpOnly, true);
    assert.equal(result.name, 'a');
  });
});

// ---------------------------------------------------------------------------
// CookieJar — capture, replay, lifecycle
// ---------------------------------------------------------------------------

describe('CookieJar', () => {
  /** @type {CookieJar} */
  let jar;

  beforeEach(() => {
    jar = new CookieJar();
  });

  // -----------------------------------------------------------------------
  // Basic capture + get
  // -----------------------------------------------------------------------

  test('captures and retrieves a simple cookie', () => {
    jar.capture(['session=abc; Path=/; HttpOnly'], 'http://localhost:3001/login');
    assert.equal(jar.has('session'), true);
    const entry = jar.get('session');
    assert.equal(entry.value, 'abc');
    assert.equal(entry.attrs.httpOnly, true);
    assert.equal(entry.attrs.path, '/');
  });

  test('returns null for non-existent cookie', () => {
    assert.equal(jar.get('nonexistent'), null);
    assert.equal(jar.has('nonexistent'), false);
    assert.equal(jar.attrsOf('nonexistent'), null);
  });

  test('size() returns number of live cookies', () => {
    assert.equal(jar.size(), 0);
    jar.capture(['a=1', 'b=2'], 'http://localhost:3001/');
    assert.equal(jar.size(), 2);
  });

  // Edge 1: Multiple Set-Cookie headers in one response
  test('captures multiple Set-Cookie headers from one response', () => {
    jar.capture([
      'refresh_token=rt1; Path=/; HttpOnly; Max-Age=3600',
      'access_hint=ah1; Path=/',
    ], 'http://localhost:3001/login');
    assert.equal(jar.size(), 2);
    assert.equal(jar.get('refresh_token').value, 'rt1');
    assert.equal(jar.get('access_hint').value, 'ah1');
  });

  // Edge 2: special chars in value (base64 with padding)
  test('stores cookie value with = signs (base64)', () => {
    jar.capture(['tok=dGVzdA==; Path=/'], 'http://localhost:3001/');
    assert.equal(jar.get('tok').value, 'dGVzdA==');
  });

  // Edge 3: cookie with no attributes (defaults)
  test('applies default path when no Path attr', () => {
    jar.capture(['pr_simple=value'], 'http://localhost:3001/api/v1/login');
    const entry = jar.get('pr_simple');
    assert.equal(entry.value, 'value');
    // Default path = directory of /api/v1/login → /api/v1
    assert.notEqual(jar.cookieHeaderFor('http://localhost:3001/api/v1/other'), null);
    // Should NOT match /api/v2 (different subtree)
    assert.equal(jar.cookieHeaderFor('http://localhost:3001/api/v2/other'), null);
  });

  test('default path for root URL is /', () => {
    jar.capture(['x=1'], 'http://localhost:3001/');
    // Default path of "/" → defaultPath("/") → "/"
    assert.notEqual(jar.cookieHeaderFor('http://localhost:3001/anything'), null);
  });

  // Edge 4: cookie cleared via Max-Age=0
  test('clears cookie when Max-Age=0', () => {
    jar.capture(['refresh_token=abc; Path=/; HttpOnly; Max-Age=3600'], 'http://localhost:3001/login');
    assert.equal(jar.has('refresh_token'), true);
    assert.equal(jar.isCleared('refresh_token'), false);

    jar.capture(['refresh_token=; Path=/; Max-Age=0'], 'http://localhost:3001/logout');
    assert.equal(jar.has('refresh_token'), false);
    assert.equal(jar.isCleared('refresh_token'), true);
    assert.equal(jar.get('refresh_token'), null);
    assert.deepEqual(jar.clearedNames(), ['refresh_token']);
  });

  // Edge 5: cookie cleared via Expires in the past
  test('clears cookie when Expires is in the past', () => {
    jar.capture(['sid=abc; Path=/; Max-Age=3600'], 'http://localhost:3001/login');
    assert.equal(jar.has('sid'), true);

    jar.capture(['sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'], 'http://localhost:3001/logout');
    assert.equal(jar.has('sid'), false);
    assert.equal(jar.isCleared('sid'), true);
  });

  // Max-Age takes precedence over Expires
  test('Max-Age takes precedence over Expires when both present', () => {
    // Max-Age=3600 (live) + Expires in past → Max-Age wins → cookie lives
    jar.capture(
      ['tok=v; Path=/; Max-Age=3600; Expires=Thu, 01 Jan 1970 00:00:00 GMT'],
      'http://localhost:3001/'
    );
    assert.equal(jar.has('tok'), true);
    assert.equal(jar.isCleared('tok'), false);
  });

  test('Max-Age=0 takes precedence over future Expires', () => {
    jar.capture(
      ['tok=v; Path=/; Max-Age=0; Expires=Thu, 01 Jan 2099 00:00:00 GMT'],
      'http://localhost:3001/'
    );
    assert.equal(jar.has('tok'), false);
    assert.equal(jar.isCleared('tok'), true);
  });

  // Edge 6: Domain matching — subdomain
  test('Domain attr: cookie applies to domain and subdomains', () => {
    jar.capture(['a=1; Domain=example.com; Path=/'], 'http://example.com/');
    assert.notEqual(jar.cookieHeaderFor('http://example.com/page'), null);
    assert.notEqual(jar.cookieHeaderFor('http://sub.example.com/page'), null);
    assert.equal(jar.cookieHeaderFor('http://notexample.com/page'), null);
  });

  test('localhost: exact host match only (probe convention)', () => {
    jar.capture(['a=1; Path=/'], 'http://localhost:3001/');
    assert.notEqual(jar.cookieHeaderFor('http://localhost:3001/page'), null);
    // sub.localhost should NOT match
    assert.equal(jar.cookieHeaderFor('http://sub.localhost:3001/page'), null);
  });

  // Edge 7: Path matching specificity
  test('cookie with Path=/api matches /api and /api/v1 but not /application', () => {
    jar.capture(['a=1; Path=/api'], 'http://localhost:3001/');
    assert.notEqual(jar.cookieHeaderFor('http://localhost:3001/api'), null);
    assert.notEqual(jar.cookieHeaderFor('http://localhost:3001/api/v1'), null);
    assert.equal(jar.cookieHeaderFor('http://localhost:3001/application'), null);
    assert.equal(jar.cookieHeaderFor('http://localhost:3001/'), null);
  });

  // Edge 8: cookie ordering by Path length (RFC 6265 §5.4)
  test('cookies ordered: longest path first, then earlier creation', () => {
    jar.capture(['wide=w; Path=/'], 'http://localhost:3001/');
    jar.capture(['narrow=n; Path=/api'], 'http://localhost:3001/');
    const header = jar.cookieHeaderFor('http://localhost:3001/api/test');
    assert.equal(header, 'narrow=n; wide=w');
  });

  test('same path length: earlier-created cookie first', () => {
    jar.capture(['first=1; Path=/'], 'http://localhost:3001/');
    jar.capture(['second=2; Path=/'], 'http://localhost:3001/');
    const header = jar.cookieHeaderFor('http://localhost:3001/any');
    assert.equal(header, 'first=1; second=2');
  });

  // Edge 9: Rotation — same name, new value (overwrite)
  test('re-issuing same name+path overwrites (not duplicates)', () => {
    jar.capture(['tok=old; Path=/'], 'http://localhost:3001/login');
    jar.capture(['tok=new; Path=/'], 'http://localhost:3001/refresh');
    assert.equal(jar.size(), 1);
    assert.equal(jar.get('tok').value, 'new');
  });

  // Edge 13: Two cookies with same name on different paths
  test('same name on different paths stored separately', () => {
    jar.capture(['x=root; Path=/'], 'http://localhost:3001/');
    jar.capture(['x=api; Path=/api'], 'http://localhost:3001/');
    assert.equal(jar.size(), 2);

    // Request to /api/test includes both, narrow path first
    const header = jar.cookieHeaderFor('http://localhost:3001/api/test');
    assert.equal(header, 'x=api; x=root');

    // Request to / includes only the root one
    const rootHeader = jar.cookieHeaderFor('http://localhost:3001/');
    assert.equal(rootHeader, 'x=root');
  });

  // Edge 17: empty value
  test('empty cookie value is stored correctly', () => {
    jar.capture(['pr_empty=; Path=/'], 'http://localhost:3001/');
    assert.equal(jar.has('pr_empty'), true);
    assert.equal(jar.get('pr_empty').value, '');
  });

  // Edge 19: Idempotent re-issue — same value means no rotation
  test('re-issuing same name+value: value unchanged (idempotent)', () => {
    jar.capture(['tok=same; Path=/'], 'http://localhost:3001/');
    const v1 = jar.get('tok').value;
    jar.capture(['tok=same; Path=/'], 'http://localhost:3001/');
    const v2 = jar.get('tok').value;
    assert.equal(v1, v2);
  });

  // Edge 22: each jar instance is isolated (concurrent flow runs)
  test('separate CookieJar instances are isolated', () => {
    const jar2 = new CookieJar();
    jar.capture(['a=1; Path=/'], 'http://localhost:3001/');
    jar2.capture(['b=2; Path=/'], 'http://localhost:3001/');
    assert.equal(jar.has('a'), true);
    assert.equal(jar.has('b'), false);
    assert.equal(jar2.has('a'), false);
    assert.equal(jar2.has('b'), true);
  });

  // Edge 23: quoted value in jar
  test('quoted cookie value is stored unquoted', () => {
    jar.capture(['"tok"="hello world"; Path=/'], 'http://localhost:3001/');
    // The name after trim does not have quotes stripped (quotes in name are unusual)
    // But value should be unquoted
    jar.capture(['tok="hello world"; Path=/'], 'http://localhost:3001/');
    assert.equal(jar.get('tok').value, 'hello world');
  });

  // Edge 24: Set-Cookie in a 3xx response — jar captures BEFORE redirect
  test('captures cookies from any response (including 3xx)', () => {
    // The jar itself does not know about status codes — it processes headers.
    // This test confirms capture works regardless of response semantics.
    jar.capture(['state=abc; Path=/'], 'http://localhost:3001/authorize');
    assert.equal(jar.has('state'), true);
    // Cookie included in the redirected-to request
    assert.notEqual(jar.cookieHeaderFor('http://localhost:3001/callback'), null);
  });

  // Edge 25: Secure cookie on localhost (probe enforces declared intent)
  test('Secure cookie included on http:// (probe declared-intent policy)', () => {
    jar.capture(['tok=v; Path=/; Secure'], 'http://localhost:3001/login');
    assert.equal(jar.has('tok'), true);
    // cookieHeaderFor on http:// still includes it (probe design decision)
    const header = jar.cookieHeaderFor('http://localhost:3001/dashboard');
    assert.notEqual(header, null);
    assert.ok(header.includes('tok=v'));
  });

  // Edge 15: SameSite=None requires Secure — jar stores attrs for upstream DIAG
  test('SameSite=None stored with Secure attr for upstream inspection', () => {
    jar.capture(['a=1; Path=/; SameSite=None; Secure'], 'http://localhost:3001/');
    const attrs = jar.attrsOf('a');
    assert.equal(attrs.sameSite, 'None');
    assert.equal(attrs.secure, true);
  });

  test('SameSite=None without Secure: attrs stored for upstream DIAG', () => {
    jar.capture(['a=1; Path=/; SameSite=None'], 'http://localhost:3001/');
    const attrs = jar.attrsOf('a');
    assert.equal(attrs.sameSite, 'None');
    assert.equal(attrs.secure, false);
    // Jar does not reject — upstream DIAG responsibility
  });

  // Edge 18: __Secure- and __Host- prefixed cookies
  test('__Secure- prefixed cookie: attrs stored for upstream inspection', () => {
    jar.capture(['__Secure-tok=v; Path=/; Secure'], 'http://localhost:3001/');
    assert.equal(jar.has('__Secure-tok'), true);
    assert.equal(jar.attrsOf('__Secure-tok').secure, true);
  });

  test('__Secure- without Secure attr: jar still stores (upstream DIAG)', () => {
    jar.capture(['__Secure-tok=v; Path=/'], 'http://localhost:3001/');
    assert.equal(jar.has('__Secure-tok'), true);
    assert.equal(jar.attrsOf('__Secure-tok').secure, false);
  });

  test('__Host- prefixed cookie: attrs stored for upstream validation', () => {
    jar.capture(['__Host-tok=v; Path=/; Secure'], 'http://localhost:3001/');
    assert.equal(jar.has('__Host-tok'), true);
    const attrs = jar.attrsOf('__Host-tok');
    assert.equal(attrs.secure, true);
    assert.equal(attrs.path, '/');
    assert.equal(attrs.domain, null);
  });

  test('__Host- with Domain attr: jar stores (upstream DIAG)', () => {
    jar.capture(['__Host-tok=v; Path=/; Secure; Domain=localhost'], 'http://localhost:3001/');
    assert.equal(jar.has('__Host-tok'), true);
    // Domain is stored — upstream responsible for DIAG
    assert.equal(jar.attrsOf('__Host-tok').domain, 'localhost');
  });

  // -----------------------------------------------------------------------
  // reset()
  // -----------------------------------------------------------------------

  test('reset() clears all cookies and cleared names', () => {
    jar.capture(['a=1; Path=/'], 'http://localhost:3001/');
    jar.capture(['b=2; Path=/; Max-Age=0'], 'http://localhost:3001/');
    assert.equal(jar.size(), 1);
    assert.deepEqual(jar.clearedNames(), ['b']);

    jar.reset();
    assert.equal(jar.size(), 0);
    assert.deepEqual(jar.clearedNames(), []);
    assert.equal(jar.has('a'), false);
    assert.equal(jar.isCleared('b'), false);
  });

  // -----------------------------------------------------------------------
  // cookieHeaderFor — null when no match
  // -----------------------------------------------------------------------

  test('cookieHeaderFor returns null when no cookies match', () => {
    jar.capture(['a=1; Path=/api'], 'http://localhost:3001/');
    assert.equal(jar.cookieHeaderFor('http://localhost:3001/other'), null);
  });

  test('cookieHeaderFor returns null for empty jar', () => {
    assert.equal(jar.cookieHeaderFor('http://localhost:3001/'), null);
  });

  // -----------------------------------------------------------------------
  // Domain matching edge cases
  // -----------------------------------------------------------------------

  test('domain reject: request host does not match cookie domain', () => {
    // Request to host A, cookie specifies domain B → rejected
    jar.capture(['a=1; Domain=other.com; Path=/'], 'http://example.com/');
    assert.equal(jar.size(), 0);
  });

  test('host-only cookie: only exact host match', () => {
    jar.capture(['a=1; Path=/'], 'http://example.com/');
    assert.notEqual(jar.cookieHeaderFor('http://example.com/'), null);
    assert.equal(jar.cookieHeaderFor('http://sub.example.com/'), null);
  });

  test('IP address: exact match only', () => {
    jar.capture(['a=1; Path=/'], 'http://127.0.0.1:3001/');
    assert.notEqual(jar.cookieHeaderFor('http://127.0.0.1:3001/'), null);
    assert.equal(jar.cookieHeaderFor('http://127.0.0.2:3001/'), null);
  });

  // -----------------------------------------------------------------------
  // Path matching edge cases
  // -----------------------------------------------------------------------

  test('path / matches everything', () => {
    jar.capture(['a=1; Path=/'], 'http://localhost:3001/');
    assert.notEqual(jar.cookieHeaderFor('http://localhost:3001/'), null);
    assert.notEqual(jar.cookieHeaderFor('http://localhost:3001/deep/nested/path'), null);
  });

  test('path match requires directory boundary', () => {
    jar.capture(['a=1; Path=/app'], 'http://localhost:3001/');
    // /app → match
    assert.notEqual(jar.cookieHeaderFor('http://localhost:3001/app'), null);
    // /app/sub → match (directory boundary after /app)
    assert.notEqual(jar.cookieHeaderFor('http://localhost:3001/app/sub'), null);
    // /application → no match (no / boundary)
    assert.equal(jar.cookieHeaderFor('http://localhost:3001/application'), null);
  });

  test('path with trailing slash matches paths under it', () => {
    jar.capture(['a=1; Path=/api/'], 'http://localhost:3001/');
    assert.notEqual(jar.cookieHeaderFor('http://localhost:3001/api/v1'), null);
    assert.notEqual(jar.cookieHeaderFor('http://localhost:3001/api/'), null);
  });

  // -----------------------------------------------------------------------
  // capture() edge cases
  // -----------------------------------------------------------------------

  test('capture ignores non-array input', () => {
    jar.capture('not-an-array', 'http://localhost:3001/');
    assert.equal(jar.size(), 0);
  });

  test('capture ignores unparseable headers', () => {
    jar.capture(['', '=noname'], 'http://localhost:3001/');
    assert.equal(jar.size(), 0);
  });

  // -----------------------------------------------------------------------
  // Re-issue after clear un-clears the name
  // -----------------------------------------------------------------------

  test('re-issuing a cleared cookie un-clears it', () => {
    jar.capture(['tok=a; Path=/'], 'http://localhost:3001/');
    jar.capture(['tok=; Path=/; Max-Age=0'], 'http://localhost:3001/');
    assert.equal(jar.isCleared('tok'), true);
    assert.equal(jar.has('tok'), false);

    jar.capture(['tok=b; Path=/'], 'http://localhost:3001/');
    assert.equal(jar.isCleared('tok'), false);
    assert.equal(jar.has('tok'), true);
    assert.equal(jar.get('tok').value, 'b');
  });

  // -----------------------------------------------------------------------
  // clearedNames() tracks multiple cleared cookies
  // -----------------------------------------------------------------------

  test('clearedNames() returns all cleared cookie names', () => {
    jar.capture(['a=1; Path=/'], 'http://localhost:3001/');
    jar.capture(['b=2; Path=/'], 'http://localhost:3001/');
    jar.capture(['a=; Path=/; Max-Age=0'], 'http://localhost:3001/');
    jar.capture(['b=; Path=/; Max-Age=0'], 'http://localhost:3001/');
    const names = jar.clearedNames();
    assert.equal(names.length, 2);
    assert.ok(names.includes('a'));
    assert.ok(names.includes('b'));
  });

  // -----------------------------------------------------------------------
  // attrsOf returns full attribute set
  // -----------------------------------------------------------------------

  test('attrsOf returns all parsed attributes', () => {
    jar.capture(
      ['tok=v; Path=/api; Domain=example.com; HttpOnly; Secure; SameSite=Strict; Max-Age=300'],
      'http://example.com/'
    );
    const attrs = jar.attrsOf('tok');
    assert.equal(attrs.httpOnly, true);
    assert.equal(attrs.secure, true);
    assert.equal(attrs.sameSite, 'Strict');
    assert.equal(attrs.path, '/api');
    assert.equal(attrs.domain, 'example.com');
    assert.equal(attrs.maxAge, 300);
  });

  // -----------------------------------------------------------------------
  // Negative Max-Age clears cookie
  // -----------------------------------------------------------------------

  test('negative Max-Age clears cookie (treated same as 0)', () => {
    jar.capture(['tok=v; Path=/'], 'http://localhost:3001/');
    jar.capture(['tok=; Path=/; Max-Age=-1'], 'http://localhost:3001/');
    assert.equal(jar.has('tok'), false);
    assert.equal(jar.isCleared('tok'), true);
  });

  // -----------------------------------------------------------------------
  // Realistic flow: refresh token rotation + clear
  // -----------------------------------------------------------------------

  test('full refresh-token lifecycle: issue → rotate → clear', () => {
    const url = 'http://localhost:3001';

    // Issue
    jar.capture(
      ['refresh_token=rt1; Path=/; HttpOnly; Max-Age=3600'],
      `${url}/auth/login`
    );
    assert.equal(jar.get('refresh_token').value, 'rt1');
    assert.notEqual(jar.cookieHeaderFor(`${url}/auth/refresh`), null);

    // Rotate
    jar.capture(
      ['refresh_token=rt2; Path=/; HttpOnly; Max-Age=3600'],
      `${url}/auth/refresh`
    );
    assert.equal(jar.get('refresh_token').value, 'rt2');
    assert.notEqual(jar.get('refresh_token').value, 'rt1');

    // Clear
    jar.capture(
      ['refresh_token=; Path=/; Max-Age=0'],
      `${url}/auth/logout`
    );
    assert.equal(jar.isCleared('refresh_token'), true);
    assert.equal(jar.has('refresh_token'), false);
    // Cookie header should be null after clear
    assert.equal(jar.cookieHeaderFor(`${url}/auth/refresh`), null);
  });

  // -----------------------------------------------------------------------
  // Realistic flow: CSRF double-submit
  // -----------------------------------------------------------------------

  test('CSRF flow: issue cookie, replay as header value', () => {
    jar.capture(['XSRF-TOKEN=csrf123; Path=/'], 'http://localhost:3001/csrf-token');
    const entry = jar.get('XSRF-TOKEN');
    assert.equal(entry.value, 'csrf123');
    // Consumer would read this value and set X-CSRF-Token header
    const header = jar.cookieHeaderFor('http://localhost:3001/api/mutate');
    assert.ok(header.includes('XSRF-TOKEN=csrf123'));
  });

  // -----------------------------------------------------------------------
  // Realistic flow: session cookie auth
  // -----------------------------------------------------------------------

  test('session flow: login → protected → logout → no cookie', () => {
    const url = 'http://localhost:3001';

    // Login sets session cookie
    jar.capture(['connect.sid=sess1; Path=/; HttpOnly'], `${url}/login`);
    assert.notEqual(jar.cookieHeaderFor(`${url}/dashboard`), null);

    // Logout clears
    jar.capture(['connect.sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'], `${url}/logout`);
    assert.equal(jar.cookieHeaderFor(`${url}/dashboard`), null);
    assert.equal(jar.isCleared('connect.sid'), true);
  });

  // -----------------------------------------------------------------------
  // cookieHeaderFor: format verification
  // -----------------------------------------------------------------------

  test('cookieHeaderFor formats as "name1=value1; name2=value2"', () => {
    jar.capture(['a=1; Path=/'], 'http://localhost:3001/');
    jar.capture(['b=2; Path=/'], 'http://localhost:3001/');
    const header = jar.cookieHeaderFor('http://localhost:3001/');
    // Both present, separated by '; '
    assert.ok(header.includes('a=1'));
    assert.ok(header.includes('b=2'));
    assert.ok(header.includes('; '));
  });
});
