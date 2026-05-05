#!/usr/bin/env node
/**
 * Plan 07 task #8 — unit tests for overlay schema tightening.
 *
 * Tests:
 *   - OVERLAY_FLOWS_RETIRED: overlay with `flows` key is rejected
 *   - OVERLAY_IGNORE_COVERS_MATRIX_PATH: ignore entry matching a matrix path is rejected
 *   - Valid ignore entries (framework internals) pass
 *   - Merged contract no longer contains flows field
 */

'use strict';

const path = require('node:path');
const { validateOverlay, validateIgnoreAgainstMatrix, mergeContract } = require('../../probes/contract-merge.js');

let passed = 0;
let failed = 0;

function assert(condition, name, detail) {
  if (condition) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.error(`FAIL ${name}`);
    if (detail) console.error(`  ${detail}`);
  }
}

// --- OVERLAY_FLOWS_RETIRED ---

{
  const overlay = { version: '1', coverage: 'partial', flows: [] };
  const diagnostics = validateOverlay(overlay);
  const retired = diagnostics.find((d) => d.code === 'OVERLAY_FLOWS_RETIRED');
  assert(
    retired !== undefined,
    'OVERLAY_FLOWS_RETIRED: rejects overlay with flows key (empty array)',
    `diagnostics: ${JSON.stringify(diagnostics)}`
  );
  assert(
    retired && retired.level === 'error',
    'OVERLAY_FLOWS_RETIRED: diagnostic level is error',
    `level: ${retired?.level}`
  );
  assert(
    retired && retired.message.includes('flows key is retired'),
    'OVERLAY_FLOWS_RETIRED: message mentions "flows key is retired"',
    `message: ${retired?.message}`
  );
  assert(
    retired && retired.message.includes('.flows.generated.json'),
    'OVERLAY_FLOWS_RETIRED: message mentions .flows.generated.json',
    `message: ${retired?.message}`
  );
}

{
  const overlay = {
    version: '1',
    coverage: 'partial',
    flows: [{ name: 'login', steps: [{ kind: 'navigate', path: '/login' }] }],
  };
  const diagnostics = validateOverlay(overlay);
  const retired = diagnostics.find((d) => d.code === 'OVERLAY_FLOWS_RETIRED');
  assert(
    retired !== undefined,
    'OVERLAY_FLOWS_RETIRED: rejects overlay with flows key (non-empty array)',
    `diagnostics: ${JSON.stringify(diagnostics)}`
  );
  assert(
    retired && retired.message.includes('Remove this key'),
    'OVERLAY_FLOWS_RETIRED: message says "Remove this key"',
    `message: ${retired?.message}`
  );
}

{
  const overlay = {
    version: '1',
    coverage: 'partial',
    routes: {},
    ignore: [{ path: '/_next/**', reason: 'framework internals' }],
  };
  const diagnostics = validateOverlay(overlay);
  const retired = diagnostics.find((d) => d.code === 'OVERLAY_FLOWS_RETIRED');
  assert(
    retired === undefined,
    'OVERLAY_FLOWS_RETIRED: accepts overlay without flows key',
    `diagnostics: ${JSON.stringify(diagnostics)}`
  );
}

// --- OVERLAY_IGNORE_COVERS_MATRIX_PATH ---

{
  const overlay = {
    version: '1',
    coverage: 'partial',
    ignore: [{ path: '/api/v1/auth/register', reason: 'skip for now' }],
  };
  const matrix = {
    apiEndpoints: [{ method: 'POST', path: '/api/v1/auth/register' }],
    pages: [],
  };
  const diagnostics = validateIgnoreAgainstMatrix(overlay, matrix);
  assert(
    diagnostics.length === 1,
    'OVERLAY_IGNORE_COVERS_MATRIX_PATH: rejects ignore matching API endpoint (exact)',
    `count: ${diagnostics.length}`
  );
  assert(
    diagnostics[0] && diagnostics[0].code === 'OVERLAY_IGNORE_COVERS_MATRIX_PATH',
    'OVERLAY_IGNORE_COVERS_MATRIX_PATH: correct error code',
    `code: ${diagnostics[0]?.code}`
  );
  assert(
    diagnostics[0] && diagnostics[0].message.includes('matrix paths cannot be ignored'),
    'OVERLAY_IGNORE_COVERS_MATRIX_PATH: message explains restriction',
    `message: ${diagnostics[0]?.message}`
  );
}

{
  const overlay = {
    version: '1',
    coverage: 'partial',
    ignore: [{ path: '/dashboard/**', reason: 'not ready' }],
  };
  const matrix = {
    apiEndpoints: [],
    pages: [{ route: '/dashboard/settings' }],
  };
  const diagnostics = validateIgnoreAgainstMatrix(overlay, matrix);
  assert(
    diagnostics.length === 1 && diagnostics[0].code === 'OVERLAY_IGNORE_COVERS_MATRIX_PATH',
    'OVERLAY_IGNORE_COVERS_MATRIX_PATH: rejects ignore glob matching page route',
    `diagnostics: ${JSON.stringify(diagnostics)}`
  );
  assert(
    diagnostics[0] && diagnostics[0].path === '/dashboard/**',
    'OVERLAY_IGNORE_COVERS_MATRIX_PATH: diagnostic path field is the ignore pattern',
    `path: ${diagnostics[0]?.path}`
  );
}

{
  const overlay = {
    version: '1',
    coverage: 'partial',
    ignore: [{ path: '/_next/**', reason: 'Next.js framework internals' }],
  };
  const matrix = {
    apiEndpoints: [{ method: 'POST', path: '/api/v1/auth/register' }],
    pages: [{ route: '/dashboard' }],
  };
  const diagnostics = validateIgnoreAgainstMatrix(overlay, matrix);
  assert(
    diagnostics.length === 0,
    'OVERLAY_IGNORE_COVERS_MATRIX_PATH: accepts /_next/** (framework internals)',
    `diagnostics: ${JSON.stringify(diagnostics)}`
  );
}

{
  const overlay = {
    version: '1',
    coverage: 'partial',
    ignore: [{ path: '/api/health', reason: 'liveness probe' }],
  };
  const matrix = {
    apiEndpoints: [{ method: 'POST', path: '/api/v1/auth/login' }],
    pages: [],
  };
  const diagnostics = validateIgnoreAgainstMatrix(overlay, matrix);
  assert(
    diagnostics.length === 0,
    'OVERLAY_IGNORE_COVERS_MATRIX_PATH: accepts /api/health not in matrix',
    `diagnostics: ${JSON.stringify(diagnostics)}`
  );
}

{
  const overlay = { version: '1', coverage: 'partial' };
  const matrix = {
    apiEndpoints: [{ method: 'GET', path: '/api/v1/users' }],
    pages: [],
  };
  const diagnostics = validateIgnoreAgainstMatrix(overlay, matrix);
  assert(
    diagnostics.length === 0,
    'OVERLAY_IGNORE_COVERS_MATRIX_PATH: empty when overlay has no ignore entries',
    `diagnostics: ${JSON.stringify(diagnostics)}`
  );
}

{
  const overlay = {
    version: '1',
    coverage: 'partial',
    ignore: [{ path: '/api/v1/auth/register', reason: 'skip' }],
  };
  const diagnostics = validateIgnoreAgainstMatrix(overlay, null);
  assert(
    diagnostics.length === 0,
    'OVERLAY_IGNORE_COVERS_MATRIX_PATH: empty when matrix is null',
    `diagnostics: ${JSON.stringify(diagnostics)}`
  );
}

{
  const overlay = {
    version: '1',
    coverage: 'partial',
    ignore: [{ path: '/api/**', reason: 'ignore all api' }],
  };
  const matrix = {
    apiEndpoints: [
      { method: 'POST', path: '/api/v1/auth/register' },
      { method: 'POST', path: '/api/v1/auth/login' },
      { method: 'GET', path: '/api/v1/users' },
    ],
    pages: [],
  };
  const diagnostics = validateIgnoreAgainstMatrix(overlay, matrix);
  assert(
    diagnostics.length === 1,
    'OVERLAY_IGNORE_COVERS_MATRIX_PATH: one diagnostic per ignore entry, not per matrix match',
    `count: ${diagnostics.length}, diagnostics: ${JSON.stringify(diagnostics)}`
  );
}

// --- Merged contract no longer contains flows ---

{
  const compiled = { version: '1', routes: [], endpoints: [], diagnostics: [] };
  const overlay = { version: '1', coverage: 'partial' };
  const { merged } = mergeContract({ compiled, overlay });
  assert(
    !('flows' in merged),
    'mergeContract: merged output does not contain flows field',
    `keys: ${Object.keys(merged).join(', ')}`
  );
}

{
  const compiled = { version: '1', routes: [], endpoints: [], diagnostics: [] };
  const overlay = {
    version: '1',
    coverage: 'partial',
    ignore: [{ path: '/_next/**', reason: 'framework' }],
  };
  const { merged } = mergeContract({ compiled, overlay });
  assert(
    Array.isArray(merged.ignore) && merged.ignore.length === 1 && merged.ignore[0].path === '/_next/**',
    'mergeContract: merged output still includes ignore array',
    `ignore: ${JSON.stringify(merged.ignore)}`
  );
}

// --- Summary ---

console.log('');
console.log(`Overlay validation tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed === 0 ? 0 : 1);
