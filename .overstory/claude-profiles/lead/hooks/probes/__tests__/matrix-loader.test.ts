import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMatrix, MatrixLoadError, resolveSuccessStatus, getRouteOverlay } from '../matrix-loader';

function withSandbox<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'matrix-loader-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const validMatrix = {
  version: '1',
  generatedAt: '2026-01-01T00:00:00Z',
  scope: 'session' as const,
  bootPlan: { driver: 'worktree-stack', startCmd: 'x', stopCmd: 'y', portsCmd: 'z', stackFile: '.stack.json' },
  pages: [{ file: 'a', route: '/', guard: 'public' as const, changed: true }],
  apiEndpoints: [{ file: 'a', method: 'GET', path: '/api/v1/health', changed: true }],
  forms: [],
  middleware: [],
  authDetection: { registerSurface: '/api/v1/auth/register', loginSurface: '/api/v1/auth/login' },
};

test('loadMatrix throws MATRIX_MISSING when file not present', () => {
  withSandbox((dir) => {
    assert.throws(() => loadMatrix({ matrixPath: join(dir, 'nope.json') }), (err: unknown) => err instanceof MatrixLoadError && err.code === 'MATRIX_MISSING');
  });
});

test('loadMatrix throws MATRIX_INVALID on bad JSON', () => {
  withSandbox((dir) => {
    const path = join(dir, 'matrix.json');
    writeFileSync(path, '{not-json');
    assert.throws(() => loadMatrix({ matrixPath: path }), (err: unknown) => err instanceof MatrixLoadError && err.code === 'MATRIX_INVALID');
  });
});

test('loadMatrix throws MATRIX_INVALID when bootPlan missing', () => {
  withSandbox((dir) => {
    const path = join(dir, 'matrix.json');
    writeFileSync(path, JSON.stringify({ pages: [], apiEndpoints: [] }));
    assert.throws(() => loadMatrix({ matrixPath: path }), (err: unknown) => err instanceof MatrixLoadError && err.code === 'MATRIX_INVALID');
  });
});

test('loadMatrix happy path returns merged matrix', () => {
  withSandbox((dir) => {
    const path = join(dir, 'matrix.json');
    writeFileSync(path, JSON.stringify(validMatrix));
    const merged = loadMatrix({ matrixPath: path });
    assert.equal(merged.pages.length, 1);
    assert.equal(merged.endpoints.length, 1);
    assert.equal(merged.bootPlan.driver, 'worktree-stack');
    assert.equal(merged.scope, 'session');
    assert.equal(merged.authDetection.registerSurface, '/api/v1/auth/register');
  });
});

test('loadMatrix applies overlay tokens and mustNotContain', () => {
  withSandbox((dir) => {
    const matrixPath = join(dir, 'matrix.json');
    const overlayPath = join(dir, 'overlay.json');
    const matrixData = { ...validMatrix, pages: [{ ...validMatrix.pages[0], tokens: ['original'], mustNotContain: ['bad'] }] };
    writeFileSync(matrixPath, JSON.stringify(matrixData));
    writeFileSync(overlayPath, JSON.stringify({ routes: { '/': { tokens: ['override'], mustNotContain: ['also-bad'] } } }));
    const merged = loadMatrix({ matrixPath, overlayPath });
    assert.deepEqual(merged.pages[0].tokens, ['override']);
    assert.deepEqual(merged.pages[0].mustNotContain, ['bad', 'also-bad']);
  });
});

test('loadMatrix honors ignore[] for both pages and endpoints', () => {
  withSandbox((dir) => {
    const matrixPath = join(dir, 'matrix.json');
    const overlayPath = join(dir, 'overlay.json');
    writeFileSync(matrixPath, JSON.stringify(validMatrix));
    writeFileSync(overlayPath, JSON.stringify({ ignore: [{ path: '/', reason: 'not relevant' }] }));
    const merged = loadMatrix({ matrixPath, overlayPath });
    assert.equal(merged.pages.length, 0);
    assert.ok(merged.ignoredRoutes.has('/'));
  });
});

test('loadMatrix applies compiled successStatus override', () => {
  withSandbox((dir) => {
    const matrixPath = join(dir, 'matrix.json');
    const compiledPath = join(dir, 'compiled.json');
    writeFileSync(matrixPath, JSON.stringify(validMatrix));
    writeFileSync(compiledPath, JSON.stringify({ endpoints: [{ method: 'GET', path: '/api/v1/health', successStatus: 200 }] }));
    const merged = loadMatrix({ matrixPath, compiledPath });
    assert.equal(merged.endpoints[0].successStatus, 200);
  });
});

test('loadMatrix throws OVERLAY_INVALID on malformed overlay', () => {
  withSandbox((dir) => {
    const matrixPath = join(dir, 'matrix.json');
    const overlayPath = join(dir, 'overlay.json');
    writeFileSync(matrixPath, JSON.stringify(validMatrix));
    writeFileSync(overlayPath, 'not-json');
    assert.throws(() => loadMatrix({ matrixPath, overlayPath }), (err: unknown) => err instanceof MatrixLoadError && err.code === 'OVERLAY_INVALID');
  });
});

test('resolveSuccessStatus defaults per verb when not declared', () => {
  assert.equal(resolveSuccessStatus({ file: '', method: 'GET', path: '/x' }, null), 200);
  assert.equal(resolveSuccessStatus({ file: '', method: 'POST', path: '/x' }, null), 201);
  assert.equal(resolveSuccessStatus({ file: '', method: 'DELETE', path: '/x' }, null), 204);
  assert.equal(resolveSuccessStatus({ file: '', method: 'POST', path: '/x', successStatus: 200 }, null), 200);
});

test('getRouteOverlay returns null when absent', () => {
  assert.equal(getRouteOverlay(null, '/x'), null);
  assert.equal(getRouteOverlay({ routes: {} }, '/x'), null);
  assert.deepEqual(getRouteOverlay({ routes: { '/x': { tokens: ['a'] } } }, '/x'), { tokens: ['a'] });
});

test('loadMatrix preserves empty-matrix case without throwing', () => {
  withSandbox((dir) => {
    const path = join(dir, 'matrix.json');
    writeFileSync(path, JSON.stringify({ ...validMatrix, pages: [], apiEndpoints: [] }));
    const merged = loadMatrix({ matrixPath: path });
    assert.equal(merged.pages.length, 0);
    assert.equal(merged.endpoints.length, 0);
  });
});

test('scopeOverride "full" wins over raw session scope', () => {
  withSandbox((dir) => {
    const path = join(dir, 'matrix.json');
    writeFileSync(path, JSON.stringify(validMatrix));
    const merged = loadMatrix({ matrixPath: path, scopeOverride: 'full' });
    assert.equal(merged.scope, 'full');
  });
});
