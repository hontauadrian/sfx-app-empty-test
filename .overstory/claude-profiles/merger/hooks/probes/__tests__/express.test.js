'use strict';

// Tests for detectors/express.js — Express route detection.
//
// Verifies that:
//   1. Express routes are detected via ROUTE_REGEX (app.get, router.post, etc.)
//   2. Guard is ALWAYS 'unknown' — middleware function-name heuristic removed.
//   3. DIAG EXPRESS_AUTH_UNDECLARED emitted when endpoints detected.
//   4. No DIAG when zero endpoints.
//
// Run directly: `node --test __tests__/express.test.js`

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { detectExpress } = require('../detectors/express');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDiag() {
  const entries = [];
  return {
    entries,
    info: (msg) => entries.push({ level: 'info', message: msg }),
    warn: (msg) => entries.push({ level: 'warn', message: msg }),
  };
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'express-test-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Guard always 'unknown' (heuristic removed)
// ---------------------------------------------------------------------------

test('express: guard is always unknown even when middleware looks like auth', () => {
  withTempDir((dir) => {
    // Write a file with an Express route that has requireAuth middleware
    const source = `
      const app = require('express')();
      app.get('/api/users', requireAuth, (req, res) => { res.json([]); });
    `;
    fs.writeFileSync(path.join(dir, 'server.js'), source);
    const diag = makeDiag();
    const result = detectExpress(dir, diag);
    assert.strictEqual(result.endpoints.length, 1);
    assert.strictEqual(result.endpoints[0].guard, 'unknown');
    assert.strictEqual(result.endpoints[0].path, '/api/users');
    assert.strictEqual(result.endpoints[0].method, 'GET');
  });
});

test('express: guard is unknown for authGuard/isAuthenticated/ensureAuth/jwt/protect middleware', () => {
  withTempDir((dir) => {
    const source = `
      const router = require('express').Router();
      router.post('/api/admin', authGuard, isAuthenticated, ensureAuth, jwt, protect, handler);
    `;
    fs.writeFileSync(path.join(dir, 'routes.js'), source);
    const diag = makeDiag();
    const result = detectExpress(dir, diag);
    assert.strictEqual(result.endpoints.length, 1);
    assert.strictEqual(result.endpoints[0].guard, 'unknown');
  });
});

// ---------------------------------------------------------------------------
// Route detection
// ---------------------------------------------------------------------------

test('express: detects multiple routes from a single file', () => {
  withTempDir((dir) => {
    const source = `
      app.get('/api/health', handler);
      app.post('/api/users', handler);
      app.put('/api/users/:id', handler);
      app.delete('/api/users/:id', handler);
    `;
    fs.writeFileSync(path.join(dir, 'app.js'), source);
    const diag = makeDiag();
    const result = detectExpress(dir, diag);
    assert.strictEqual(result.endpoints.length, 4);
    assert.strictEqual(result.endpoints[0].method, 'GET');
    assert.strictEqual(result.endpoints[1].method, 'POST');
    assert.strictEqual(result.endpoints[1].successStatus, 201);
    assert.strictEqual(result.endpoints[2].method, 'PUT');
    assert.strictEqual(result.endpoints[3].method, 'DELETE');
  });
});

test('express: returns empty when no routes found', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'empty.js'), 'const x = 1;');
    const diag = makeDiag();
    const result = detectExpress(dir, diag);
    assert.strictEqual(result.endpoints.length, 0);
    assert.deepStrictEqual(result.pages, []);
  });
});

test('express: skips node_modules', () => {
  withTempDir((dir) => {
    const nmDir = path.join(dir, 'node_modules', 'pkg');
    fs.mkdirSync(nmDir, { recursive: true });
    fs.writeFileSync(path.join(nmDir, 'index.js'), `app.get('/hidden', handler);`);
    const diag = makeDiag();
    const result = detectExpress(dir, diag);
    assert.strictEqual(result.endpoints.length, 0);
  });
});

// ---------------------------------------------------------------------------
// DIAG emission
// ---------------------------------------------------------------------------

test('express: emits EXPRESS_AUTH_UNDECLARED diag when endpoints found', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'app.js'), `app.get('/api/data', handler);`);
    const diag = makeDiag();
    detectExpress(dir, diag);
    const undeclared = diag.entries.find(
      (entry) => entry.message.includes('EXPRESS_AUTH_UNDECLARED')
    );
    assert.ok(undeclared, 'Expected EXPRESS_AUTH_UNDECLARED diag');
    assert.ok(undeclared.message.includes('x-auth-required'));
  });
});

test('express: does NOT emit EXPRESS_AUTH_UNDECLARED when no endpoints', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'empty.js'), 'const x = 1;');
    const diag = makeDiag();
    detectExpress(dir, diag);
    const undeclared = diag.entries.find(
      (entry) => entry.message.includes('EXPRESS_AUTH_UNDECLARED')
    );
    assert.strictEqual(undeclared, undefined);
  });
});

// ---------------------------------------------------------------------------
// Route param extraction
// ---------------------------------------------------------------------------

test('express: extracts route params', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'app.js'), `app.get('/api/users/:id/posts/:postId', handler);`);
    const diag = makeDiag();
    const result = detectExpress(dir, diag);
    assert.strictEqual(result.endpoints.length, 1);
    assert.deepStrictEqual(result.endpoints[0].routeParams, ['id', 'postId']);
  });
});
