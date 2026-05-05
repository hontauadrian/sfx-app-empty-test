import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { CookieJar, HttpClient, parseSetCookie } from '../http-client';

test('parseSetCookie returns null for empty / malformed input', () => {
  assert.equal(parseSetCookie(''), null);
  assert.equal(parseSetCookie('no-equals'), null);
});

test('parseSetCookie parses name, value, domain, path, httpOnly, secure', () => {
  const cookie = parseSetCookie('sid=abc123; Path=/; Domain=example.com; HttpOnly; Secure; SameSite=Lax');
  assert.ok(cookie);
  assert.equal(cookie?.name, 'sid');
  assert.equal(cookie?.value, 'abc123');
  assert.equal(cookie?.domain, 'example.com');
  assert.equal(cookie?.path, '/');
  assert.equal(cookie?.httpOnly, true);
  assert.equal(cookie?.secure, true);
  assert.equal(cookie?.sameSite, 'Lax');
});

test('parseSetCookie applies Max-Age as expires', () => {
  const cookie = parseSetCookie('sid=x; Max-Age=60');
  assert.ok(cookie);
  assert.ok(cookie?.expires instanceof Date);
  const diff = (cookie!.expires!.getTime() - Date.now());
  assert.ok(diff > 50_000 && diff <= 60_000);
});

test('CookieJar stores and replays cookies for an origin', () => {
  const jar = new CookieJar();
  jar.storeSetCookieHeaders('http://localhost:3000/x', ['sid=abc123; Path=/']);
  const header = jar.buildCookieHeader('http://localhost:3000/other');
  assert.equal(header, 'sid=abc123');
});

test('CookieJar ignores expired cookies', () => {
  const jar = new CookieJar();
  const past = new Date(Date.now() - 10_000).toUTCString();
  jar.storeSetCookieHeaders('http://a.test/', [`gone=1; Expires=${past}`, 'fresh=2']);
  const header = jar.buildCookieHeader('http://a.test/');
  assert.ok(header.includes('fresh=2'));
  assert.ok(!header.includes('gone=1'));
});

test('CookieJar segregates by origin', () => {
  const jar = new CookieJar();
  jar.storeSetCookieHeaders('http://a.test/', ['a=1']);
  jar.storeSetCookieHeaders('http://b.test/', ['b=2']);
  assert.equal(jar.buildCookieHeader('http://a.test/x'), 'a=1');
  assert.equal(jar.buildCookieHeader('http://b.test/x'), 'b=2');
});

test('HttpClient GET returns status, body, and captures Set-Cookie', async () => {
  const server = createServer((req, res) => {
    res.setHeader('Set-Cookie', 'sid=probe; Path=/');
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, path: req.url }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  try {
    const client = new HttpClient(`http://127.0.0.1:${port}`);
    const response = await client.request('/api/x');
    assert.equal(response.status, 200);
    assert.deepEqual(response.bodyJson, { ok: true, path: '/api/x' });
    assert.ok(response.setCookies.some((c) => c.includes('sid=probe')));
    const header = client.jar.buildCookieHeader(`http://127.0.0.1:${port}/anything`);
    assert.equal(header, 'sid=probe');
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('HttpClient POST sends JSON body and auth header', async () => {
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 201;
      res.end(JSON.stringify({
        method: req.method,
        body: raw,
        auth: req.headers.authorization ?? null,
        ctype: req.headers['content-type'] ?? null,
      }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  try {
    const client = new HttpClient(`http://127.0.0.1:${port}`);
    const response = await client.request('/x', { method: 'POST', body: { hi: 1 }, bearer: 'tok123' });
    assert.equal(response.status, 201);
    const json = response.bodyJson as { method: string; body: string; auth: string; ctype: string };
    assert.equal(json.method, 'POST');
    assert.equal(json.auth, 'Bearer tok123');
    assert.deepEqual(JSON.parse(json.body), { hi: 1 });
    assert.equal(json.ctype, 'application/json');
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('HttpClient returns status=0 on network error', async () => {
  const client = new HttpClient('http://127.0.0.1:1');
  const response = await client.request('/', { timeoutMs: 500 });
  assert.equal(response.status, 0);
  assert.ok(['NETWORK_ERROR', 'TIMEOUT'].includes(response.statusText));
});

test('HttpClient honors manual redirect mode', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/guarded') {
      res.statusCode = 302;
      res.setHeader('Location', '/login');
      res.end();
    } else {
      res.statusCode = 200;
      res.end('login page');
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  try {
    const client = new HttpClient(`http://127.0.0.1:${port}`);
    const response = await client.request('/guarded', { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.location, '/login');
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
