'use strict';

// Fixture-driven tests for derive-test-matrix.js.
// Run directly with: `node __tests__/derive-test-matrix.test.js`
// Uses node:test (stable on Node 18+). No external deps.

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROBE = path.resolve(__dirname, '..', 'derive-test-matrix.js');
const FIXTURES = path.resolve(__dirname, '..', '__fixtures__');

function run(fixture, extra = []) {
  const projectDir = path.join(FIXTURES, fixture);
  const outputFile = path.join(os.tmpdir(), `matrix-${fixture}-${Date.now()}.json`);
  execFileSync('node', [PROBE, '--project-dir', projectDir, '--full', '--output', outputFile, ...extra], {
    stdio: 'pipe',
  });
  const parsed = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  try { fs.unlinkSync(outputFile); } catch { /* ignore */ }
  return parsed;
}

test('next-app: detects next + app router + grouped dashboard is authenticated', () => {
  const matrix = run('next-app');
  assert.ok(matrix.detectedFrameworks.web.includes('next'));
  assert.strictEqual(matrix.scope, 'full');
  const loginPage = matrix.pages.find((page) => page.route === '/login');
  assert.ok(loginPage, 'expected /login page');
  assert.strictEqual(loginPage.guard, 'public');
  const dashboardPage = matrix.pages.find((page) => page.route === '/dashboard');
  assert.ok(dashboardPage, 'expected /dashboard page (group stripped)');
  assert.strictEqual(dashboardPage.guard, 'authenticated');
  const teamPage = matrix.pages.find((page) => page.route === '/teams/:id');
  assert.ok(teamPage, 'expected dynamic /teams/:id page');
  assert.deepStrictEqual(teamPage.routeParams, ['id']);
});

test('next-app: middleware is detected with matcher', () => {
  const matrix = run('next-app');
  assert.ok(matrix.middleware.length > 0, 'expected at least one middleware entry');
  assert.deepStrictEqual(matrix.middleware[0].matcher, ['/dashboard/:path*']);
});

test('next-pages: pages + api routes', () => {
  const matrix = run('next-pages');
  assert.ok(matrix.detectedFrameworks.web.includes('next'));
  assert.ok(matrix.pages.some((page) => page.route === '/login'));
  assert.ok(matrix.apiEndpoints.some((endpoint) => endpoint.path === '/api/auth/register'));
});

test('sveltekit: derives +server.ts endpoints', () => {
  const matrix = run('sveltekit');
  assert.ok(matrix.detectedFrameworks.web.includes('sveltekit'));
  assert.ok(
    matrix.apiEndpoints.some((endpoint) => endpoint.method === 'POST' && endpoint.path.endsWith('/api/auth')),
    'expected POST /api/auth endpoint from +server.ts'
  );
});

test('remix: flat and dollar-param routes', () => {
  const matrix = run('remix');
  assert.ok(matrix.detectedFrameworks.web.includes('remix'));
  assert.ok(matrix.pages.some((page) => page.route === '/login'));
  assert.ok(matrix.pages.some((page) => page.route === '/teams/:id'));
});

test('astro: pages + endpoint-exported verbs', () => {
  const matrix = run('astro');
  assert.ok(matrix.detectedFrameworks.web.includes('astro'));
  assert.ok(matrix.pages.some((page) => page.route === '/'));
  assert.ok(matrix.apiEndpoints.some((endpoint) => endpoint.method === 'GET' && endpoint.path === '/api/ping'));
});

test('nest: controller + global prefix + UseGuards', () => {
  const matrix = run('nest');
  assert.ok(matrix.detectedFrameworks.api.includes('nest'));
  const register = matrix.apiEndpoints.find((endpoint) => endpoint.path === '/api/v1/auth/register');
  assert.ok(register, 'expected register endpoint');
  assert.strictEqual(register.guard, 'public');
  assert.strictEqual(register.inputSchemaRef, 'RegisterDto');
  const me = matrix.apiEndpoints.find((endpoint) => endpoint.path === '/api/v1/auth/me');
  assert.ok(me, 'expected /auth/me endpoint');
  assert.strictEqual(me.guard, 'authenticated');
});

test('express: path + guard middleware detection', () => {
  const matrix = run('express');
  assert.ok(matrix.detectedFrameworks.api.includes('express'));
  const health = matrix.apiEndpoints.find((endpoint) => endpoint.path === '/health');
  assert.ok(health);
  assert.strictEqual(health.guard, 'public');
  const users = matrix.apiEndpoints.find((endpoint) => endpoint.path === '/users');
  assert.ok(users);
  assert.strictEqual(users.guard, 'authenticated');
});

test('fastify: schema-in-route → inputSchemaRef set', () => {
  const matrix = run('fastify');
  assert.ok(matrix.detectedFrameworks.api.includes('fastify'));
  const register = matrix.apiEndpoints.find((endpoint) => endpoint.path === '/auth/register');
  assert.ok(register);
  assert.strictEqual(register.inputSchemaRef, 'inline');
});

test('trpc: router dot-paths → /trpc/auth.register', () => {
  const matrix = run('trpc');
  assert.ok(matrix.detectedFrameworks.api.includes('trpc'));
  const register = matrix.apiEndpoints.find((endpoint) => endpoint.path === '/trpc/auth.register');
  assert.ok(register, 'expected /trpc/auth.register');
  assert.strictEqual(register.method, 'POST');
  const session = matrix.apiEndpoints.find((endpoint) => endpoint.path === '/trpc/auth.session');
  assert.ok(session);
  assert.strictEqual(session.method, 'GET');
});

test('no-framework: produces valid matrix with empty surfaces', () => {
  const matrix = run('no-framework');
  assert.deepStrictEqual(matrix.detectedFrameworks.web, []);
  assert.deepStrictEqual(matrix.detectedFrameworks.api, []);
  assert.deepStrictEqual(matrix.pages, []);
  assert.deepStrictEqual(matrix.apiEndpoints, []);
  assert.strictEqual(matrix.version, '1');
});

test('boot-plan: worktree-stack.sh → driver + portsCmd', () => {
  const matrix = run('with-stack-driver');
  assert.strictEqual(matrix.bootPlan.driver, 'worktree-stack');
  assert.strictEqual(matrix.bootPlan.driverPath, 'scripts/worktree-stack.sh');
  assert.strictEqual(typeof matrix.bootPlan.ports.web, 'number');
  assert.ok(matrix.bootPlan.ports.api > 0);
});

test('manifest priority: compiled routes override detector guard', () => {
  const matrix = run('with-manifest-override');
  const dashboard = matrix.pages.find((page) => page.route === '/dashboard');
  assert.ok(dashboard);
  assert.strictEqual(dashboard.guard, 'public', 'compiled manifest must override convention');
  assert.strictEqual(matrix.manifest.compiledPresent, true);
});

test('session scope: only listed files are changed=true', () => {
  const projectDir = path.join(FIXTURES, 'next-app');
  const sessionPath = path.join(os.tmpdir(), `test-session-${Date.now()}.json`);
  const targetFile = path.join(projectDir, 'src/app/login/page.tsx');
  fs.writeFileSync(sessionPath, JSON.stringify({ startedAt: Date.now(), files: [targetFile] }));
  const outputFile = path.join(os.tmpdir(), `matrix-session-${Date.now()}.json`);
  execFileSync('node', [
    PROBE,
    '--project-dir', projectDir,
    '--session-files', sessionPath,
    '--output', outputFile,
  ]);
  const matrix = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  const changedPages = matrix.pages.filter((page) => page.changed === true);
  assert.strictEqual(changedPages.length, 1);
  assert.strictEqual(changedPages[0].route, '/login');
  try { fs.unlinkSync(sessionPath); fs.unlinkSync(outputFile); } catch { /* ignore */ }
});

test('tokens: login page extracts heading text', () => {
  const matrix = run('next-app');
  const login = matrix.pages.find((page) => page.route === '/login');
  assert.ok(login.tokens.includes('sign in'));
});

test('output: schema-required fields present', () => {
  const matrix = run('next-app');
  assert.strictEqual(matrix.version, '1');
  assert.ok(typeof matrix.generatedAt === 'string');
  assert.ok(typeof matrix.projectDir === 'string');
  assert.ok(matrix.detectedFrameworks);
  assert.ok(matrix.bootPlan);
  assert.ok(Array.isArray(matrix.pages));
  assert.ok(Array.isArray(matrix.apiEndpoints));
  assert.ok(matrix.diagnostics);
});

test('args: parseArgs handles --key=value and --bool', () => {
  const { parseArgs } = require('../lib/args');
  const parsed = parseArgs(['--project-dir=/tmp/x', '--full', '--verbose'], {
    string: ['project-dir'], boolean: ['full', 'verbose'],
  });
  assert.strictEqual(parsed['project-dir'], '/tmp/x');
  assert.strictEqual(parsed.full, true);
  assert.strictEqual(parsed.verbose, true);
});

test('routeNormalize: paramize brackets + extract params', () => {
  const { paramizeNextBrackets, extractRouteParams } = require('../lib/routeNormalize');
  assert.strictEqual(paramizeNextBrackets('teams/[id]/members'), 'teams/:id/members');
  assert.deepStrictEqual(extractRouteParams('/teams/:id/posts/:postId'), ['id', 'postId']);
});

test('normalize: lowercase + collapse whitespace + trim punctuation', () => {
  const { normalizeToken } = require('../lib/normalize');
  assert.strictEqual(normalizeToken('  Sign   In!  '), 'sign in');
  assert.strictEqual(normalizeToken('"Email address"'), 'email address');
});

test('merge: overlay tokens stamp onto merged page', () => {
  const { mergeEntries } = require('../lib/merge');
  const merged = mergeEntries(
    { pages: [{ route: '/login', file: 'x.tsx', framework: 'next-app', guard: 'public', tokens: [] }] },
    { compiled: { routes: [], endpoints: [] }, overlay: { routes: { '/login': { tokens: ['welcome'] } } } }
  );
  assert.deepStrictEqual(merged.pages[0].tokens, ['welcome']);
});

test('merge: empty overlay (default boilerplate shape) does not throw', () => {
  const { mergeEntries } = require('../lib/merge');
  assert.doesNotThrow(() => mergeEntries(
    { pages: [], endpoints: [] },
    { compiled: { routes: [], endpoints: [] }, overlay: { routes: {}, endpoints: {} } }
  ));
});

test('merge: compiled guard wins over detector guard', () => {
  const { mergeEntries } = require('../lib/merge');
  const merged = mergeEntries(
    { pages: [{ route: '/x', file: 'x.tsx', framework: 'next-app', guard: 'authenticated' }] },
    { compiled: { routes: [{ route: '/x', guard: 'public' }], endpoints: [] }, overlay: null }
  );
  assert.strictEqual(merged.pages[0].guard, 'public');
  assert.strictEqual(merged.pages[0].fromManifest, true);
});

// ---------------------------------------------------------------------------
// detectorWarnings flow-through (csrf / oauth / multi-tenant DIAGs)
// ---------------------------------------------------------------------------

function runWithTempProject(spec, extra = []) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-detector-warnings-'));
  fs.mkdirSync(path.join(tmp, 'apps', 'api'), { recursive: true });
  // Make framework detection see NestJS so the OpenAPI loader runs.
  fs.writeFileSync(
    path.join(tmp, 'package.json'),
    JSON.stringify({
      name: 'fixture-detector-warnings',
      private: true,
      dependencies: { '@nestjs/core': '11.0.0', '@nestjs/common': '11.0.0' },
    }),
  );
  fs.writeFileSync(path.join(tmp, 'apps', 'api', '.openapi.json'), JSON.stringify(spec));
  const outputFile = path.join(os.tmpdir(), `matrix-warnings-${Date.now()}.json`);
  execFileSync('node', [PROBE, '--project-dir', tmp, '--full', '--output', outputFile, ...extra], {
    stdio: 'pipe',
  });
  const parsed = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  try { fs.unlinkSync(outputFile); fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  return parsed;
}

test('matrix.diagnostics.detectorWarnings: present and an array even when detectors emit nothing', () => {
  const matrix = run('next-app');
  assert.ok(Array.isArray(matrix.diagnostics.detectorWarnings),
    'expected diagnostics.detectorWarnings to be an array');
});

test('matrix.diagnostics.detectorWarnings: forwards CSRF_ISSUER_AMBIGUOUS when two operations declare csrfToken', () => {
  // Two distinct endpoints both declare operationId === 'csrfToken' →
  // csrf.js emits DIAG CSRF_ISSUER_AMBIGUOUS. The matrix derivation must
  // forward it into diagnostics.detectorWarnings tagged with detector: 'csrf'.
  const spec = {
    openapi: '3.0.0',
    paths: {
      '/auth/csrf-a': {
        get: {
          operationId: 'csrfToken',
          responses: {
            '200': {
              description: 'token',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['token'],
                    properties: { token: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
      '/auth/csrf-b': {
        get: {
          operationId: 'csrfToken',
          responses: {
            '200': {
              description: 'token',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['token'],
                    properties: { token: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
  const matrix = runWithTempProject(spec);
  const warnings = matrix.diagnostics.detectorWarnings || [];
  const ambiguous = warnings.find(
    (w) => w.detector === 'csrf' && w.code === 'CSRF_ISSUER_AMBIGUOUS',
  );
  assert.ok(
    ambiguous,
    `expected CSRF_ISSUER_AMBIGUOUS detectorWarning, got: ${JSON.stringify(warnings)}`,
  );
  assert.strictEqual(ambiguous.detector, 'csrf');
  assert.strictEqual(ambiguous.code, 'CSRF_ISSUER_AMBIGUOUS');
  assert.ok(typeof ambiguous.reason === 'string' && ambiguous.reason.length > 0,
    'expected ambiguous warning to carry a non-empty reason');
});

test('matrix.diagnostics.detectorWarnings: entries are tagged with their originating detector', () => {
  // Sanity check: every entry has a detector field of the expected union.
  const matrix = run('next-app');
  const warnings = matrix.diagnostics.detectorWarnings || [];
  const allowed = new Set(['csrf', 'oauth', 'multi-tenant']);
  for (const w of warnings) {
    assert.ok(typeof w.detector === 'string', 'each warning must have a string detector field');
    assert.ok(allowed.has(w.detector),
      `unexpected detector '${w.detector}' (expected one of ${[...allowed].join(', ')})`);
    assert.ok(typeof w.code === 'string' && w.code.length > 0,
      'each warning must carry a non-empty code');
  }
});
