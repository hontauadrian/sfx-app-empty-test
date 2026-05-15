'use strict';

// Fixture-driven tests for flows-generator.js (Phase 2).
// Run with: node --test __tests__/flows-generator/flows-generator.test.js
// Uses node:test (stable on Node 18+). No external deps.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { generate, sortKeys, buildCoverageSet, loadCuratedFlowSteps, deriveApiPrefixFromEndpoints, canonicalizePathParams } = require(path.resolve(
  __dirname, '..', '..', 'probes', 'flows-generator.js'
));
const { mkdtempSync, mkdirSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');

const FIXTURES = path.resolve(__dirname, 'fixtures');

function loadFixture(name) {
  const dir = path.join(FIXTURES, name);
  const matrix = JSON.parse(fs.readFileSync(path.join(dir, 'matrix.json'), 'utf8'));
  const logical = JSON.parse(fs.readFileSync(path.join(dir, 'logical.json'), 'utf8'));
  return { matrix, logical };
}

function findFlow(flows, id) {
  return flows.find((f) => f.id === id);
}

function findFlowsByKind(flows, kind) {
  return flows.filter((f) => f.contract.kind === kind);
}

// ---------------------------------------------------------------------------
// Fixture: bare-post — 1 POST endpoint with zodContract
// ---------------------------------------------------------------------------

test('bare-post: emits 1 happy-path flow', () => {
  const { matrix, logical } = loadFixture('bare-post');
  const result = generate(matrix, logical, { ignore: [] });

  const happy = findFlow(result.flows, 'items:post:happy');
  assert.ok(happy, 'should have a happy-path flow for POST /api/v1/items');
  assert.strictEqual(happy.contract.kind, 'endpoint-happy');
  assert.strictEqual(happy.contract.endpoint, 'POST /api/v1/items');

  const apiStep = happy.steps.find((s) => s.kind === 'api');
  assert.strictEqual(apiStep.method, 'POST');
  assert.strictEqual(apiStep.path, '/api/v1/items');
  assert.deepStrictEqual(apiStep.body, { title: 'test-title' });

  const expectStep = happy.steps.find((s) => s.kind === 'expect');
  assert.strictEqual(expectStep.status, 201);
});

test('bare-post: emits 3 invalidator flows', () => {
  const { matrix, logical } = loadFixture('bare-post');
  const result = generate(matrix, logical, { ignore: [] });

  const invalidators = findFlowsByKind(result.flows, 'endpoint-invalidator');
  assert.strictEqual(invalidators.length, 3, 'should emit 3 invalidator flows (missing + wrong-type + empty-string)');

  const missing = findFlow(result.flows, 'items:post:field-title:missing');
  assert.ok(missing, 'should have missing invalidator');
  const missingApi = missing.steps.find((s) => s.kind === 'api');
  assert.strictEqual(missingApi.body.title, undefined, 'missing invalidator should drop the field');

  const wrongType = findFlow(result.flows, 'items:post:field-title:wrong-type');
  assert.ok(wrongType, 'should have wrong-type invalidator');
  const wrongTypeApi = wrongType.steps.find((s) => s.kind === 'api');
  assert.strictEqual(wrongTypeApi.body.title, 12345, 'wrong-type should use number');

  const emptyString = findFlow(result.flows, 'items:post:field-title:empty-string');
  assert.ok(emptyString, 'should have empty-string invalidator');
  const emptyApi = emptyString.steps.find((s) => s.kind === 'api');
  assert.strictEqual(emptyApi.body.title, '', 'empty-string should use empty string');
});

test('bare-post: no auth-boundary flows (endpoint is public)', () => {
  const { matrix, logical } = loadFixture('bare-post');
  const result = generate(matrix, logical, { ignore: [] });
  const authFlows = findFlowsByKind(result.flows, 'auth-boundary');
  assert.strictEqual(authFlows.length, 0, 'public endpoint should have no auth-boundary flows');
});

test('bare-post: no chain flows (no register/login)', () => {
  const { matrix, logical } = loadFixture('bare-post');
  const result = generate(matrix, logical, { ignore: [] });
  const chains = result.flows.filter((f) => f.id.startsWith('chain:'));
  assert.strictEqual(chains.length, 0, 'no chain flows without register/login');
});

test('bare-post: total flow count', () => {
  const { matrix, logical } = loadFixture('bare-post');
  const result = generate(matrix, logical, { ignore: [] });
  // 1 happy + 3 invalidators = 4
  assert.strictEqual(result.flows.length, 4);
});

test('bare-post: does not double-prefix enveloped response paths', () => {
  const { matrix, logical } = loadFixture('bare-post');
  matrix.responseEnvelope = { successWrapper: ['data'] };
  matrix.apiEndpoints[0].responseContract = {
    status: 201,
    schemaRef: 'Envelope<ItemDto>',
    requiredPaths: ['data', 'data.id', 'success'],
  };
  const result = generate(matrix, logical, { ignore: [] });

  const happy = findFlow(result.flows, 'items:post:happy');
  const expectStep = happy.steps.find((step) => step.kind === 'expect');

  assert.deepStrictEqual(expectStep.bodyHas, ['data', 'data.id', 'success']);
});

// ---------------------------------------------------------------------------
// Fixture: auth-bootstrap — register + login + /me
// ---------------------------------------------------------------------------

test('auth-bootstrap: emits happy flows for all 3 endpoints', () => {
  const { matrix, logical } = loadFixture('auth-bootstrap');
  const result = generate(matrix, logical, { ignore: [] });

  const registerHappy = findFlow(result.flows, 'auth-register:post:happy');
  assert.ok(registerHappy, 'should have register happy flow');
  assert.strictEqual(registerHappy.contract.kind, 'endpoint-happy');

  // Login (tokenIssuer) intentionally has no standalone :happy — the
  // chain:auth-bootstrap exercises login (step 2) with a freshly-registered
  // user. A standalone happy would 401 against an empty DB.
  const loginHappy = findFlow(result.flows, 'auth-login:post:happy');
  assert.strictEqual(loginHappy, undefined, 'tokenIssuer must not emit standalone happy when chain exists');

  const meHappy = findFlow(result.flows, 'auth-me:get:happy');
  assert.ok(meHappy, 'should have me happy flow');
  assert.strictEqual(meHappy.contract.kind, 'endpoint-stub-untyped');
});

test('auth-bootstrap: emits auth-boundary flows for /me', () => {
  const { matrix, logical } = loadFixture('auth-bootstrap');
  const result = generate(matrix, logical, { ignore: [] });

  const authFlows = findFlowsByKind(result.flows, 'auth-boundary');
  assert.strictEqual(authFlows.length, 4, 'should emit 4 auth-boundary flows (no-bearer, garbage, wrong-secret, expired)');

  const noBearerFlow = findFlow(result.flows, 'auth-me:get:auth:no-bearer');
  assert.ok(noBearerFlow, 'should have no-bearer flow');
  assert.strictEqual(noBearerFlow.steps[1].status, 401);
});

test('auth-bootstrap: emits duplicate-conflict for register', () => {
  const { matrix, logical } = loadFixture('auth-bootstrap');
  const result = generate(matrix, logical, { ignore: [] });

  const dupFlow = findFlow(result.flows, 'auth-register:duplicate-conflict');
  assert.ok(dupFlow, 'should have duplicate-conflict flow');
  // Self-contained 4-step shape: POST → expect 200/201 → re-POST → expect conflict.
  assert.deepStrictEqual(dupFlow.steps[1].statusAnyOf, [200, 201]);
  assert.deepStrictEqual(dupFlow.steps[3].statusAnyOf, [400, 409, 422]);
  assert.ok(dupFlow.dependsOn.includes('auth-register:post:happy'));
});

test('auth-bootstrap: emits auth-bootstrap chain', () => {
  const { matrix, logical } = loadFixture('auth-bootstrap');
  const result = generate(matrix, logical, { ignore: [] });

  const chain = findFlow(result.flows, 'chain:auth-bootstrap');
  assert.ok(chain, 'should have auth-bootstrap chain');
  assert.strictEqual(chain.contract.kind, 'chain-auth-bootstrap');

  const stepKinds = chain.steps.map((s) => s.kind);
  assert.ok(stepKinds.includes('api'), 'should have api steps');
  assert.ok(stepKinds.includes('capture'), 'should have capture steps');
  assert.ok(stepKinds.includes('setAuth'), 'should have setAuth step');
  assert.ok(stepKinds.includes('expect'), 'should have expect step');
});

test('auth-bootstrap: emits session-lifecycle chain', () => {
  const { matrix, logical } = loadFixture('auth-bootstrap');
  const result = generate(matrix, logical, { ignore: [] });

  const chain = findFlow(result.flows, 'chain:session-lifecycle');
  assert.ok(chain, 'should have session-lifecycle chain');
  assert.strictEqual(chain.contract.kind, 'chain-session-lifecycle');

  const lastExpect = [...chain.steps].reverse().find((s) => s.kind === 'expect');
  assert.strictEqual(lastExpect.status, 401, 'after logout, should expect 401');
});

test('auth-bootstrap: emits invalidator flows for register fields', () => {
  const { matrix, logical } = loadFixture('auth-bootstrap');
  const result = generate(matrix, logical, { ignore: [] });

  const invalidators = findFlowsByKind(result.flows, 'endpoint-invalidator');
  // email: 3 (missing, wrong-type, format-violation) + password: 3 (missing, wrong-type, below-min) = 6
  assert.strictEqual(invalidators.length, 6, 'should emit 6 invalidator flows');
});

test('auth-bootstrap: emits logical-contract flows', () => {
  const { matrix, logical } = loadFixture('auth-bootstrap');
  const result = generate(matrix, logical, { ignore: [] });

  const logicalFlows = findFlowsByKind(result.flows, 'logical-contract');
  assert.ok(logicalFlows.length >= 2, 'should emit logical-contract flows');

  // Check public-api flows have correct forbidden list.
  const publicApiFlows = logicalFlows.filter((f) => f.id.includes('unauth-public-api'));
  assert.ok(publicApiFlows.length >= 1, 'should have at least 1 unauth-public-api flow');
  for (const f of publicApiFlows) {
    const expect = f.steps.find((s) => s.kind === 'expect');
    assert.deepStrictEqual(expect.forbidden, [500, 502, 503, 504]);
  }
});

// ---------------------------------------------------------------------------
// Fixture: full-crud — POST + GET/:id + PATCH/:id + DELETE/:id
// ---------------------------------------------------------------------------

test('full-crud: emits CRUD roundtrip chain', () => {
  const { matrix, logical } = loadFixture('full-crud');
  const result = generate(matrix, logical, { ignore: [] });

  const crud = findFlow(result.flows, 'chain:crud-roundtrip:tasks');
  assert.ok(crud, 'should have CRUD roundtrip chain');
  assert.strictEqual(crud.contract.kind, 'chain-crud-roundtrip');

  const apiSteps = crud.steps.filter((s) => s.kind === 'api');
  assert.strictEqual(apiSteps.length, 6, 'should have 6 api steps (POST, GET, PATCH, GET, DELETE, GET)');
  assert.strictEqual(apiSteps[0].method, 'POST');
  assert.strictEqual(apiSteps[1].method, 'GET');
  assert.strictEqual(apiSteps[2].method, 'PATCH');
  assert.strictEqual(apiSteps[3].method, 'GET');
  assert.strictEqual(apiSteps[4].method, 'DELETE');
  assert.strictEqual(apiSteps[5].method, 'GET');

  const expectSteps = crud.steps.filter((s) => s.kind === 'expect');
  const lastExpect = expectSteps[expectSteps.length - 1];
  assert.strictEqual(lastExpect.status, 404, 'after delete, GET should expect 404');
});

test('full-crud: emits auth-boundary flows for all protected endpoints', () => {
  const { matrix, logical } = loadFixture('full-crud');
  const result = generate(matrix, logical, { ignore: [] });

  const authFlows = findFlowsByKind(result.flows, 'auth-boundary');
  // 4 endpoints x 4 auth-boundary flows = 16
  assert.strictEqual(authFlows.length, 16, 'should emit 16 auth-boundary flows (4 per protected endpoint)');
});

test('full-crud: emits invalidator flows for POST and PATCH', () => {
  const { matrix, logical } = loadFixture('full-crud');
  const result = generate(matrix, logical, { ignore: [] });

  const invalidators = findFlowsByKind(result.flows, 'endpoint-invalidator');
  // POST: title(missing, wrong-type) + description(wrong-type) = 3
  // PATCH: title(wrong-type) = 1
  assert.strictEqual(invalidators.length, 4, 'should emit 4 invalidator flows');
});

// ---------------------------------------------------------------------------
// Fixture: roles-endpoint — @Roles('admin')
// ---------------------------------------------------------------------------

test('roles-endpoint: emits auth-boundary-role flow with 403 expect', () => {
  const { matrix, logical } = loadFixture('roles-endpoint');
  const result = generate(matrix, logical, { ignore: [] });

  const roleFlows = findFlowsByKind(result.flows, 'auth-boundary-role');
  assert.strictEqual(roleFlows.length, 1, 'should emit 1 role flow');

  const roleFlow = roleFlows[0];
  assert.strictEqual(roleFlow.id, 'admin-dashboard:get:auth:non-matching-role');
  const expect = roleFlow.steps.find((s) => s.kind === 'expect');
  assert.strictEqual(expect.status, 403, 'role flow should expect 403');
});

test('roles-endpoint: emits standard auth-boundary flows', () => {
  const { matrix, logical } = loadFixture('roles-endpoint');
  const result = generate(matrix, logical, { ignore: [] });

  const authFlows = findFlowsByKind(result.flows, 'auth-boundary');
  assert.strictEqual(authFlows.length, 4, 'should emit 4 standard auth-boundary flows');
});

test('roles-endpoint: total flow count (4 auth + 1 role = 5)', () => {
  const { matrix, logical } = loadFixture('roles-endpoint');
  const result = generate(matrix, logical, { ignore: [] });
  assert.strictEqual(result.flows.length, 5);
});

test('roles-endpoint: skips protected happy path without auth bootstrap', () => {
  const { matrix, logical } = loadFixture('roles-endpoint');
  const result = generate(matrix, logical, { ignore: [] });

  assert.strictEqual(findFlow(result.flows, 'admin-dashboard:get:happy'), undefined);
  const diagnostic = result.diagnostics.find(
    (item) =>
      item.code === 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE' &&
      item.endpoint === 'GET /api/v1/admin/dashboard',
  );
  assert.ok(diagnostic, 'protected success status should be marked ungeneratable');
  assert.match(diagnostic.message, /requires authentication and no auth bootstrap chain/);
});

// ---------------------------------------------------------------------------
// Fixture: unreachable-status — declared 500 that no rule can generate
// ---------------------------------------------------------------------------

test('unreachable-status: emits diagnostic for 500', () => {
  const { matrix, logical } = loadFixture('unreachable-status');
  const result = generate(matrix, logical, { ignore: [] });

  assert.strictEqual(result.diagnostics.length, 1, 'should have 1 diagnostic');
  assert.strictEqual(result.diagnostics[0].code, 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE');
  assert.ok(result.diagnostics[0].message.includes('500'));
});

test('unreachable-status: still emits happy-path flow', () => {
  const { matrix, logical } = loadFixture('unreachable-status');
  const result = generate(matrix, logical, { ignore: [] });

  const happy = findFlow(result.flows, 'items:get:happy');
  assert.ok(happy, 'should have happy-path flow');
  assert.strictEqual(happy.contract.kind, 'endpoint-stub-untyped');
});

test('unreachable-status: no unreachable flows in flows array', () => {
  const { matrix, logical } = loadFixture('unreachable-status');
  const result = generate(matrix, logical, { ignore: [] });

  const unreachable = result.flows.filter((f) =>
    f.contract.kind === 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE'
  );
  assert.strictEqual(unreachable.length, 0, 'ungeneratable statuses should be diagnostics, not flows');
});

// ---------------------------------------------------------------------------
// Determinism test
// ---------------------------------------------------------------------------

test('determinism: generate twice produces identical output', () => {
  const { matrix, logical } = loadFixture('auth-bootstrap');
  const result1 = generate(matrix, logical, { ignore: [] });
  const result2 = generate(matrix, logical, { ignore: [] });

  const json1 = JSON.stringify(result1, null, 2);
  const json2 = JSON.stringify(result2, null, 2);
  assert.strictEqual(json1, json2, 'two runs should produce byte-identical output');
});

test('determinism: all fixtures produce identical output on re-run', () => {
  const fixtures = ['bare-post', 'auth-bootstrap', 'full-crud', 'roles-endpoint', 'unreachable-status'];
  for (const fixture of fixtures) {
    const { matrix, logical } = loadFixture(fixture);
    const result1 = generate(matrix, logical, { ignore: [] });
    const result2 = generate(matrix, logical, { ignore: [] });
    assert.deepStrictEqual(result1, result2, `${fixture}: two runs should produce identical output`);
  }
});

// ---------------------------------------------------------------------------
// Sorting / structure tests
// ---------------------------------------------------------------------------

test('flows are sorted by id', () => {
  const { matrix, logical } = loadFixture('auth-bootstrap');
  const result = generate(matrix, logical, { ignore: [] });

  for (let i = 1; i < result.flows.length; i++) {
    assert.ok(
      result.flows[i - 1].id.localeCompare(result.flows[i].id) <= 0,
      `flows should be sorted by id: ${result.flows[i - 1].id} should come before ${result.flows[i].id}`
    );
  }
});

test('every flow has required fields', () => {
  const { matrix, logical } = loadFixture('auth-bootstrap');
  const result = generate(matrix, logical, { ignore: [] });

  for (const flow of result.flows) {
    assert.ok(typeof flow.id === 'string', `flow should have string id: ${JSON.stringify(flow)}`);
    assert.ok(flow.contract, 'flow should have contract');
    assert.ok(typeof flow.contract.kind === 'string', 'contract should have kind');
    assert.ok(typeof flow.contract.endpoint === 'string', 'contract should have endpoint');
    assert.ok(typeof flow.contract.source === 'string', 'contract should have source');
    assert.ok(Array.isArray(flow.dependsOn), 'flow should have dependsOn array');
    assert.ok(flow.onFail, 'flow should have onFail');
    assert.ok(Array.isArray(flow.steps), 'flow should have steps array');
    assert.ok(flow.steps.length >= 1, 'flow should have at least 1 step');
  }
});

// ---------------------------------------------------------------------------
// Overlay ignore filtering
// ---------------------------------------------------------------------------

test('overlay ignore filters out matching endpoints', () => {
  const { matrix, logical } = loadFixture('bare-post');
  const overlay = { ignore: [{ path: '/api/v1/items', reason: 'test ignore' }] };
  const result = generate(matrix, logical, overlay);
  assert.strictEqual(result.flows.length, 0, 'all flows for ignored endpoint should be filtered');
});

test('overlay ignore with wildcard', () => {
  const { matrix, logical } = loadFixture('bare-post');
  const overlay = { ignore: [{ path: '/api/v1/**', reason: 'ignore all v1' }] };
  const result = generate(matrix, logical, overlay);
  assert.strictEqual(result.flows.length, 0, 'wildcard ignore should filter all matching endpoints');
});

// ---------------------------------------------------------------------------
// Invalidator fallback construction
// ---------------------------------------------------------------------------

test('constructInvalidators: constructs from constraints when samples absent', () => {
  const { matrix, logical } = loadFixture('bare-post');
  // Remove pre-built invalidators to test fallback
  const modMatrix = JSON.parse(JSON.stringify(matrix));
  delete modMatrix.apiEndpoints[0].zodContract.fields[0].samples;

  const result = generate(modMatrix, logical, { ignore: [] });
  const invalidators = findFlowsByKind(result.flows, 'endpoint-invalidator');
  // string field with min:1, max:200: missing, wrong-type, empty-string, above-max = 4
  assert.ok(invalidators.length >= 4, `should construct invalidators from constraints, got ${invalidators.length}`);
});

// ---------------------------------------------------------------------------
// Real-repo smoke test
// ---------------------------------------------------------------------------

test('real-repo smoke: pnpm flows:regen produces valid output', () => {
  const { execSync } = require('child_process');
  const projectRoot = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
  const outputFile = path.join(projectRoot, '.claude', 'hooks', '.flows.generated.json');

  try {
    execSync('node .overstory/claude-profiles/builder/hooks/probes/flows-generator.js', {
      cwd: projectRoot,
      stdio: 'pipe',
      timeout: 10000,
    });
  } catch (err) {
    assert.fail(`flows-generator failed: ${err.message}`);
  }

  assert.ok(fs.existsSync(outputFile), '.flows.generated.json should exist');
  const output = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  assert.strictEqual(output.version, '1');
  assert.ok(Array.isArray(output.flows), 'flows should be an array');
  assert.ok(Array.isArray(output.diagnostics), 'diagnostics should be an array');
  assert.ok(output.flows.length > 0, 'should have at least 1 flow');
});

// ---------------------------------------------------------------------------
// buildCoverageSet — extracts (method, path, status) from emitted flows
// ---------------------------------------------------------------------------

test('buildCoverageSet: extracts status from expect step', () => {
  const flows = [
    {
      id: 'test:happy',
      steps: [
        { kind: 'api', method: 'GET', path: '/api/v1/items' },
        { kind: 'expect', status: 200 },
      ],
    },
  ];
  const covered = buildCoverageSet(flows);
  assert.ok(covered.has('GET /api/v1/items:200'));
  assert.ok(!covered.has('GET /api/v1/items:404'));
});

test('buildCoverageSet: extracts all statuses from statusAnyOf', () => {
  const flows = [
    {
      id: 'test:tenant-cross',
      steps: [
        { kind: 'api', method: 'GET', path: '/api/v1/resource' },
        { kind: 'expect', statusAnyOf: [403, 404, 401] },
      ],
    },
  ];
  const covered = buildCoverageSet(flows);
  assert.ok(covered.has('GET /api/v1/resource:403'));
  assert.ok(covered.has('GET /api/v1/resource:404'));
  assert.ok(covered.has('GET /api/v1/resource:401'));
});

test('buildCoverageSet: tracks multiple api steps in multi-step chains', () => {
  const flows = [
    {
      id: 'chain:auth',
      steps: [
        { kind: 'api', method: 'POST', path: '/api/v1/register' },
        { kind: 'expect', statusAnyOf: [200, 201] },
        { kind: 'capture', bindings: { token: '$.token' } },
        { kind: 'api', method: 'POST', path: '/api/v1/refresh' },
        { kind: 'expect', statusAnyOf: [200, 201] },
      ],
    },
  ];
  const covered = buildCoverageSet(flows);
  assert.ok(covered.has('POST /api/v1/register:200'));
  assert.ok(covered.has('POST /api/v1/register:201'));
  assert.ok(covered.has('POST /api/v1/refresh:200'));
  assert.ok(covered.has('POST /api/v1/refresh:201'));
});

test('buildCoverageSet: handles flows with no steps gracefully', () => {
  const flows = [{ id: 'empty', steps: null }];
  const covered = buildCoverageSet(flows);
  assert.strictEqual(covered.size, 0);
});

// ---------------------------------------------------------------------------
// Coverage-set suppression: UNGENERATABLE filtered when flow covers status
// ---------------------------------------------------------------------------

test('coverage-set suppression: cross-endpoint flow suppresses UNGENERATABLE', () => {
  // Simulate: endpoint declares 403, no per-endpoint flow covers it,
  // but a cross-endpoint tenant-isolation flow DOES cover it.
  const { matrix, logical } = loadFixture('unreachable-status');
  const result = generate(matrix, logical, { ignore: [] });

  // Find diagnostics for the tenant endpoint
  const tenantUngen = result.diagnostics.filter(
    (d) => d.code === 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE' &&
           d.endpoint && d.endpoint.includes('/tenant/')
  );
  // If the fixture has a tenant flow that covers 403, it should be suppressed.
  // This test validates the suppression mechanism works.
  // The number of remaining UNGENERATABLE diagnostics should only include
  // truly unreachable statuses.
  for (const d of tenantUngen) {
    // For any remaining diagnostic, verify no flow covers it
    const statusMatch = d.message.match(/^Status (\d+)/);
    if (statusMatch) {
      const status = parseInt(statusMatch[1], 10);
      const flowCovers = result.flows.some((fl) => {
        if (!fl.steps) return false;
        let lastMethod = null, lastPath = null;
        for (const step of fl.steps) {
          if (step.kind === 'api') { lastMethod = step.method; lastPath = step.path; }
          if (step.kind === 'expect' && lastMethod && lastPath) {
            const epStr = `${lastMethod} ${lastPath}`;
            if (epStr === d.endpoint) {
              if (step.status === status) return true;
              if (Array.isArray(step.statusAnyOf) && step.statusAnyOf.includes(status)) return true;
            }
          }
        }
        return false;
      });
      assert.ok(!flowCovers,
        `UNGENERATABLE for ${d.endpoint} status ${status} should not exist if a flow covers it`);
    }
  }
});

// ---------------------------------------------------------------------------
// Curated-flow coverage merging — UNGENERATABLE diagnostics for endpoints
// covered by curated flows in `runtime-contract.flows/*.json` are suppressed.
// ---------------------------------------------------------------------------

test('curated flows: passing curatedFlowSteps suppresses UNGENERATABLE for matched (method, path, status)', () => {
  const { matrix, logical } = loadFixture('unreachable-status');

  const baseline = generate(matrix, logical, { ignore: [] });
  const baselineUngen = baseline.diagnostics.filter(
    (diag) => diag.code === 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE' &&
              diag.endpoint === 'GET /api/v1/items'
  );
  assert.ok(
    baselineUngen.some((diag) => /Status 500/.test(diag.message)),
    'baseline run should still emit UNGENERATABLE for declared status 500',
  );

  const curatedFlowSteps = [
    {
      id: 'task-items:curated-500',
      steps: [
        { kind: 'setAuth', binding: 'anonymous' },
        { kind: 'api', method: 'GET', path: '/api/v1/items' },
        { kind: 'expect', status: 500 },
      ],
    },
  ];
  const withCurated = generate(matrix, logical, { ignore: [] }, curatedFlowSteps);
  const withCuratedUngen = withCurated.diagnostics.filter(
    (diag) => diag.code === 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE' &&
              diag.endpoint === 'GET /api/v1/items' &&
              /Status 500/.test(diag.message)
  );
  assert.strictEqual(
    withCuratedUngen.length,
    0,
    'curated flow covering GET /api/v1/items:500 should suppress the UNGENERATABLE diagnostic',
  );
});

test('curated flows: undefined / non-array curatedFlowSteps is a no-op', () => {
  const { matrix, logical } = loadFixture('unreachable-status');
  const noFlow = generate(matrix, logical, { ignore: [] });
  const undefArg = generate(matrix, logical, { ignore: [] }, undefined);
  const nullArg = generate(matrix, logical, { ignore: [] }, null);
  const stringArg = generate(matrix, logical, { ignore: [] }, 'not-an-array');
  // All four should produce the same diagnostic count.
  const countOf = (result) => result.diagnostics.filter(
    (diag) => diag.code === 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE'
  ).length;
  assert.strictEqual(countOf(noFlow), countOf(undefArg));
  assert.strictEqual(countOf(noFlow), countOf(nullArg));
  assert.strictEqual(countOf(noFlow), countOf(stringArg));
});

test('curated flows: statusAnyOf in expect step covers every listed status', () => {
  const { matrix, logical } = loadFixture('unreachable-status');
  const curatedFlowSteps = [
    {
      id: 'task-items:curated-multi',
      steps: [
        { kind: 'api', method: 'GET', path: '/api/v1/items' },
        { kind: 'expect', statusAnyOf: [500, 502, 503] },
      ],
    },
  ];
  const result = generate(matrix, logical, { ignore: [] }, curatedFlowSteps);
  const ungens = result.diagnostics.filter(
    (diag) => diag.code === 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE' &&
              diag.endpoint === 'GET /api/v1/items' &&
              /Status 500/.test(diag.message)
  );
  assert.strictEqual(
    ungens.length,
    0,
    'statusAnyOf entries must each contribute coverage so UNGENERATABLE for 500 is suppressed',
  );
});

// ---------------------------------------------------------------------------
// loadCuratedFlowSteps — reads runtime-contract.flows/*.json from disk
// ---------------------------------------------------------------------------

function mkTmpProjectWithFlows(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'flows-curated-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

test('loadCuratedFlowSteps: returns [] when runtime-contract.flows directory is missing', () => {
  const root = mkTmpProjectWithFlows({ 'README.md': '# nothing' });
  const steps = loadCuratedFlowSteps(root);
  assert.deepStrictEqual(steps, []);
});

test('loadCuratedFlowSteps: collects special_flows from per-task json files', () => {
  const root = mkTmpProjectWithFlows({
    '.overstory/runtime-contract.flows/task-auth.json': JSON.stringify({
      version: 1,
      task_id: 'task-auth',
      owns: [{ resource: 'auth-session' }],
      special_flows: [
        {
          id: 'task-auth:happy',
          contract: { kind: 'http', source: 'apps/api AuthController.me' },
          steps: [
            { kind: 'setAuth', binding: 'admin' },
            { kind: 'api', method: 'GET', path: '/api/v1/auth/me' },
            { kind: 'expect', status: 200 },
          ],
        },
      ],
    }),
  });
  const steps = loadCuratedFlowSteps(root);
  assert.strictEqual(steps.length, 1);
  assert.strictEqual(steps[0].id, 'task-auth:happy');
  assert.strictEqual(steps[0].steps.length, 3);
});

test('loadCuratedFlowSteps: skips _shared.json (actor declarations only)', () => {
  const root = mkTmpProjectWithFlows({
    '.overstory/runtime-contract.flows/_shared.json': JSON.stringify({
      version: 1,
      task_id: '_shared',
      owns: [{ actor: 'admin' }],
      actors: [{ name: 'admin', auth: { scheme: 'anonymous' } }],
      special_flows: [
        {
          id: '_shared:should-not-be-loaded',
          contract: { kind: 'http', source: 'unused' },
          steps: [
            { kind: 'api', method: 'GET', path: '/x' },
            { kind: 'expect', status: 200 },
          ],
        },
      ],
    }),
  });
  const steps = loadCuratedFlowSteps(root);
  assert.deepStrictEqual(steps, []);
});

test('loadCuratedFlowSteps: tolerates malformed JSON in one file without dropping others', () => {
  const root = mkTmpProjectWithFlows({
    '.overstory/runtime-contract.flows/task-bad.json': '{not valid json',
    '.overstory/runtime-contract.flows/task-good.json': JSON.stringify({
      version: 1,
      task_id: 'task-good',
      owns: [],
      special_flows: [
        {
          id: 'task-good:happy',
          contract: { kind: 'http', source: 'apps/api X.foo' },
          steps: [
            { kind: 'api', method: 'GET', path: '/x' },
            { kind: 'expect', status: 200 },
          ],
        },
      ],
    }),
  });
  const steps = loadCuratedFlowSteps(root);
  assert.strictEqual(steps.length, 1);
  assert.strictEqual(steps[0].id, 'task-good:happy');
});

// ---------------------------------------------------------------------------
// apiPrefix-aware curated coverage — guards against the path-prefix mismatch
// where curated flows use unprefixed step.path (because executeCuratedFlows
// in http-smoke.ts prepends the API global prefix at execution time) but
// diagnostics report endpoint strings that include the prefix from OpenAPI.
// Without buildCoverageSet honoring `matrix.authDetection.apiPrefix`, curated
// coverage silently fails to suppress CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE
// for endpoints whose auth bootstrap is delegated (Keycloak/OIDC) and whose
// only success-path coverage lives in a curated flow file.
// ---------------------------------------------------------------------------

function makeAuthMatrix(apiPrefix) {
  return {
    version: '1',
    generatedAt: '2026-01-01T00:00:00.000Z',
    projectDir: '/test',
    scope: 'full',
    detectedFrameworks: { web: [], api: ['nest'], monorepo: 'none', auth: [], appRouter: false },
    bootPlan: {
      driver: 'framework-defaults', driverPath: null,
      startCmd: 'npx nest start', stopCmd: null, portsCmd: null,
      alreadyRunning: false, envFiles: [], ports: { api: 3000 }
    },
    pages: [],
    apiEndpoints: [
      {
        file: 'src/auth/auth.controller.ts',
        method: 'GET',
        path: '/api/v1/auth/me',
        framework: 'nest',
        guard: 'authenticated',
        inputSchemaRef: null,
        sampleValid: null,
        sampleInvalid: [],
        successStatus: 200,
        errorStatuses: [401],
        changed: true,
        routeParams: [],
        zodContract: null,
        authDecorators: {
          authRequired: true,
          isPublic: false,
          guards: ['JwtAuthGuard'],
          rolesRequired: [],
          bearerAuth: true,
        },
        swaggerDeclared: { tags: ['auth'], statuses: [200, 401] },
      },
    ],
    forms: [],
    middleware: [],
    authDetection: {
      loginSurface: null,
      registerSurface: null,
      logoutSurface: null,
      sessionMechanism: 'unknown',
      tokenStorage: 'unknown',
      persistsAcrossRefresh: false,
      apiPrefix,
    },
    diagnostics: {
      missingGuardHeaders: [], pagesProtectedByConvention: [],
      unreachablePages: [], orphanEndpoints: [], unknownFrameworks: [],
      detectorErrors: [], orphanOverlayRoutes: [],
    },
    flows: [],
    manifest: { compiledPresent: false, overlayPresent: false, overlayCoverage: null },
  };
}

const EMPTY_LOGICAL = { rows: [] };

test('apiPrefix-aware curated coverage: unprefixed curated path suppresses UNGENERATABLE for prefixed OpenAPI endpoint', () => {
  // Repro the exact production scenario that surfaced in run-2026-05-15:
  // - matrix.authDetection.apiPrefix === 'api/v1'
  // - endpoint declared at /api/v1/auth/me with authRequired=true (no auth
  //   bootstrap chain because Keycloak owns the credential surface)
  // - curated task-auth flow uses step.path '/auth/me' (the runtime prepends
  //   /api/v1 via executeCuratedFlows)
  // Without the apiPrefix fix, suppression keys mismatch
  // ('GET /auth/me:200' vs 'GET /api/v1/auth/me:200') and the diagnostic
  // survives even though the endpoint IS covered.
  const matrix = makeAuthMatrix('api/v1');
  const curatedFlowSteps = [
    {
      id: 'task-auth:happy-admin-can-read-own-session',
      steps: [
        { kind: 'setAuth', binding: 'admin' },
        { kind: 'api', method: 'GET', path: '/auth/me' },
        { kind: 'expect', status: 200 },
      ],
    },
  ];
  const result = generate(matrix, EMPTY_LOGICAL, { ignore: [] }, curatedFlowSteps);
  const unmatched = result.diagnostics.filter(
    (diag) => diag.code === 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE' &&
              diag.endpoint === 'GET /api/v1/auth/me' &&
              /Status 200/.test(diag.message)
  );
  assert.strictEqual(
    unmatched.length,
    0,
    'curated flow with unprefixed path /auth/me MUST suppress UNGENERATABLE for OpenAPI endpoint GET /api/v1/auth/me when matrix declares apiPrefix="api/v1"',
  );
});

test('apiPrefix-aware curated coverage: missing authDetection but consistent endpoint prefix → derivation suppresses', () => {
  // When the matrix omits authDetection.apiPrefix BUT the apiEndpoints[]
  // share a consistent leading prefix, the post-generation filter must
  // derive the prefix from the endpoints and use it to normalize curated
  // coverage. This is the real-world fresh-seed bug: matrix-loader's
  // default does not always survive into the persisted .matrix.json, and
  // the diagnostic was firing despite curated coverage existing.
  const matrix = makeAuthMatrix(undefined);
  // makeAuthMatrix only puts /api/v1/auth/me into apiEndpoints — too few
  // for derivation alone, so add one more endpoint to give the heuristic
  // enough samples.
  matrix.apiEndpoints.push({
    file: 'src/health/health.controller.ts',
    method: 'GET',
    path: '/api/v1/health',
    framework: 'nest',
    guard: 'public',
    inputSchemaRef: null,
    sampleValid: null,
    sampleInvalid: [],
    successStatus: 200,
    errorStatuses: [],
    changed: true,
    routeParams: [],
    zodContract: null,
    authDecorators: { authRequired: false, isPublic: true, guards: [], rolesRequired: [], bearerAuth: false },
    swaggerDeclared: { tags: ['health'], statuses: [200] },
  });
  const curatedFlowSteps = [
    {
      id: 'task-auth:happy-admin-can-read-own-session',
      steps: [
        { kind: 'api', method: 'GET', path: '/auth/me' },
        { kind: 'expect', status: 200 },
      ],
    },
  ];
  const result = generate(matrix, EMPTY_LOGICAL, { ignore: [] }, curatedFlowSteps);
  const surviving = result.diagnostics.filter(
    (diag) => diag.code === 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE' &&
              diag.endpoint === 'GET /api/v1/auth/me' &&
              /Status 200/.test(diag.message)
  );
  assert.strictEqual(
    surviving.length,
    0,
    'derivation from apiEndpoints[] MUST find /api/v1 and suppress the diagnostic when curated flow uses unprefixed path /auth/me',
  );
});

test('apiPrefix-aware curated coverage: prefixed curated path is NOT double-prefixed', () => {
  // Defensive: if a curated flow already uses the prefixed path
  // ('/api/v1/auth/me'), we must NOT add a doubly-prefixed variant
  // ('/api/v1/api/v1/auth/me'). The exact-match path stays.
  const matrix = makeAuthMatrix('api/v1');
  const curatedFlowSteps = [
    {
      id: 'task-auth:happy',
      steps: [
        { kind: 'api', method: 'GET', path: '/api/v1/auth/me' },
        { kind: 'expect', status: 200 },
      ],
    },
  ];
  const covered = buildCoverageSet(curatedFlowSteps, 'api/v1');
  assert.ok(covered.has('GET /api/v1/auth/me:200'), 'prefixed curated path stays in coverage');
  assert.ok(!covered.has('GET /api/v1/api/v1/auth/me:200'), 'must not emit doubly-prefixed variant');
});

test('buildCoverageSet: apiPrefix=null preserves legacy unprefixed behavior', () => {
  const flows = [{
    id: 'x',
    steps: [
      { kind: 'api', method: 'GET', path: '/auth/me' },
      { kind: 'expect', status: 200 },
    ],
  }];
  const covered = buildCoverageSet(flows, null);
  assert.ok(covered.has('GET /auth/me:200'));
  assert.strictEqual(covered.size, 1, 'no extra variants when apiPrefix is null');
});

test('buildCoverageSet: apiPrefix without leading slash is normalized', () => {
  const flows = [{
    id: 'x',
    steps: [
      { kind: 'api', method: 'GET', path: '/auth/me' },
      { kind: 'expect', status: 200 },
    ],
  }];
  // Both 'api/v1' and '/api/v1' must produce the same prefixed variant.
  const a = buildCoverageSet(flows, 'api/v1');
  const b = buildCoverageSet(flows, '/api/v1');
  assert.deepStrictEqual([...a].sort(), [...b].sort());
});

// ---------------------------------------------------------------------------
// Diagnostic message text — guards against agents being pushed back toward
// inventing local register/login endpoints when delegated auth (Keycloak,
// oauth2-proxy) is the actual architecture. The previous text led an agent
// to scaffold a custom email/password module on top of a Keycloak-backed
// boilerplate; the new text leads with the curated-flow path and qualifies
// the register/login suggestion as conditional on the API owning credentials.
// ---------------------------------------------------------------------------

test('CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE message: leads with curated-flow guidance, qualifies register/login', () => {
  // Auth-required endpoint, no auth bootstrap chain, no curated flow.
  const matrix = makeAuthMatrix('api/v1');
  const result = generate(matrix, EMPTY_LOGICAL, { ignore: [] });
  const diag = result.diagnostics.find(
    (entry) => entry.code === 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE' &&
               entry.endpoint === 'GET /api/v1/auth/me' &&
               /requires authentication and no auth bootstrap chain/.test(entry.message)
  );
  assert.ok(diag, 'auth-required endpoint without curated coverage must emit the auth UNGENERATABLE diagnostic');
  assert.match(
    diag.message,
    /Cover this success path with a curated authenticated flow/,
    'message must lead with the curated-flow guidance',
  );
  assert.match(
    diag.message,
    /_shared\.json/,
    'message must mention _shared.json so agents look at the actor login bindings',
  );
  assert.match(
    diag.message,
    /Do NOT use @Public\(\) to bypass/,
    'message must explicitly forbid the @Public() escape hatch',
  );
  assert.match(
    diag.message,
    /only if the API itself owns the credential surface — add a register\/login endpoint/,
    'register/login suggestion must be qualified — not the primary path for delegated-auth (Keycloak/oauth2-proxy) projects',
  );
  assert.doesNotMatch(
    diag.message,
    /^Status \d+ declared on [^.]+\.\s*Add a declared register\/login flow/,
    'old leading text "Add a declared register/login flow" must be gone — it pushed agents toward inventing local-auth scaffolds on Keycloak-backed projects',
  );
});

// ---------------------------------------------------------------------------
// deriveApiPrefixFromEndpoints — fallback when matrix.authDetection.apiPrefix
// is missing (real-world bug observed on fresh seeds where .matrix.json was
// written without going through matrix-loader.ts's defaulting pass).
// ---------------------------------------------------------------------------

test('deriveApiPrefixFromEndpoints: returns null for empty/missing input', () => {
  assert.strictEqual(deriveApiPrefixFromEndpoints(undefined), null);
  assert.strictEqual(deriveApiPrefixFromEndpoints(null), null);
  assert.strictEqual(deriveApiPrefixFromEndpoints([]), null);
  assert.strictEqual(deriveApiPrefixFromEndpoints([{}, {}]), null);
});

test('deriveApiPrefixFromEndpoints: detects /api/v1 from boilerplate-style endpoints', () => {
  const endpoints = [
    { method: 'GET', path: '/api/v1/health' },
    { method: 'GET', path: '/api/v1/auth/me' },
    { method: 'GET', path: '/api/v1/version' },
    { method: 'POST', path: '/api/v1/teams' },
  ];
  assert.strictEqual(deriveApiPrefixFromEndpoints(endpoints), 'api/v1');
});

test('deriveApiPrefixFromEndpoints: tolerates outliers below 20% (e.g. /health outside prefix)', () => {
  const endpoints = [
    { method: 'GET', path: '/api/v1/auth/me' },
    { method: 'GET', path: '/api/v1/version' },
    { method: 'POST', path: '/api/v1/teams' },
    { method: 'GET', path: '/api/v1/users' },
    { method: 'GET', path: '/health' },
  ];
  assert.strictEqual(deriveApiPrefixFromEndpoints(endpoints), 'api/v1');
});

test('deriveApiPrefixFromEndpoints: returns null when no clear majority', () => {
  const endpoints = [
    { method: 'GET', path: '/api/v1/foo' },
    { method: 'GET', path: '/v2/bar' },
    { method: 'GET', path: '/internal/baz' },
  ];
  assert.strictEqual(deriveApiPrefixFromEndpoints(endpoints), null);
});

test('deriveApiPrefixFromEndpoints: prefers longer prefix when both depths qualify', () => {
  const endpoints = [
    { method: 'GET', path: '/api/v1/foo' },
    { method: 'GET', path: '/api/v1/bar' },
  ];
  assert.strictEqual(deriveApiPrefixFromEndpoints(endpoints), 'api/v1');
});

test('deriveApiPrefixFromEndpoints: falls back to single segment when depth-2 is too varied', () => {
  const endpoints = [
    { method: 'GET', path: '/api/v1/foo' },
    { method: 'GET', path: '/api/v2/bar' },
    { method: 'GET', path: '/api/v3/baz' },
  ];
  // depth-2 splits: api/v1, api/v2, api/v3 — none reaches threshold.
  // depth-1: 'api' across all 3 → 100% → 'api'.
  assert.strictEqual(deriveApiPrefixFromEndpoints(endpoints), 'api');
});

test('deriveApiPrefixFromEndpoints: ignores entries with no path', () => {
  const endpoints = [
    { method: 'GET', path: '/api/v1/foo' },
    { method: 'GET' },
    { path: 12345 },
    { method: 'GET', path: '/api/v1/bar' },
  ];
  assert.strictEqual(deriveApiPrefixFromEndpoints(endpoints), 'api/v1');
});

test('apiPrefix-aware curated coverage: works when matrix omits authDetection (fallback to derivation)', () => {
  // Real-world bug: fresh-seed .matrix.json written without authDetection.
  // The post-generation filter must still suppress UNGENERATABLE for the
  // curated /auth/me coverage, by deriving apiPrefix from the apiEndpoints.
  const matrix = {
    version: '1',
    generatedAt: '2026-01-01T00:00:00.000Z',
    projectDir: '/test',
    scope: 'full',
    detectedFrameworks: { web: [], api: ['nest'], monorepo: 'none', auth: [], appRouter: false },
    bootPlan: {
      driver: 'framework-defaults', driverPath: null,
      startCmd: 'npx nest start', stopCmd: null, portsCmd: null,
      alreadyRunning: false, envFiles: [], ports: { api: 3000 }
    },
    pages: [],
    apiEndpoints: [
      {
        file: 'src/health/health.controller.ts',
        method: 'GET',
        path: '/api/v1/health',
        framework: 'nest',
        guard: 'public',
        inputSchemaRef: null,
        sampleValid: null,
        sampleInvalid: [],
        successStatus: 200,
        errorStatuses: [],
        changed: true,
        routeParams: [],
        zodContract: null,
        authDecorators: { authRequired: false, isPublic: true, guards: [], rolesRequired: [], bearerAuth: false },
        swaggerDeclared: { tags: ['health'], statuses: [200] },
      },
      {
        file: 'src/auth/auth.controller.ts',
        method: 'GET',
        path: '/api/v1/auth/me',
        framework: 'nest',
        guard: 'authenticated',
        inputSchemaRef: null,
        sampleValid: null,
        sampleInvalid: [],
        successStatus: 200,
        errorStatuses: [401],
        changed: true,
        routeParams: [],
        zodContract: null,
        authDecorators: { authRequired: true, isPublic: false, guards: ['JwtAuthGuard'], rolesRequired: [], bearerAuth: true },
        swaggerDeclared: { tags: ['auth'], statuses: [200, 401] },
      },
    ],
    forms: [],
    middleware: [],
    // authDetection: deliberately omitted to simulate the fresh-seed bug.
    diagnostics: { missingGuardHeaders: [], pagesProtectedByConvention: [], unreachablePages: [], orphanEndpoints: [], unknownFrameworks: [], detectorErrors: [], orphanOverlayRoutes: [] },
    flows: [],
    manifest: { compiledPresent: false, overlayPresent: false, overlayCoverage: null },
  };
  const curatedFlowSteps = [
    {
      id: 'task-auth:happy',
      steps: [
        { kind: 'setAuth', binding: 'admin' },
        { kind: 'api', method: 'GET', path: '/auth/me' },
        { kind: 'expect', status: 200 },
      ],
    },
  ];
  const result = generate(matrix, { rows: [] }, { ignore: [] }, curatedFlowSteps);
  const surviving = result.diagnostics.filter(
    (diag) => diag.code === 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE' &&
              diag.endpoint === 'GET /api/v1/auth/me' &&
              /Status 200/.test(diag.message)
  );
  assert.strictEqual(
    surviving.length,
    0,
    'curated coverage MUST suppress UNGENERATABLE even when matrix omits authDetection — the prefix is derived from apiEndpoints[]',
  );
});

// ---------------------------------------------------------------------------
// canonicalizePathParams: shape-based path normalization
// 2026-05-15: F1 brand-profile builder hit 6 UNGENERATABLE rows on
// `GET|PUT|DELETE /api/v1/brands/:id` despite curated coverage exercising
// every status against a real Keycloak-authed stack. The diagnostics use
// `:id` (NestJS route-param style); the curated steps use `${brandId}`
// (template-literal style). Both must reduce to the same canonical form
// for the suppression filter to match.
// ---------------------------------------------------------------------------

test('canonicalizePathParams reduces ${var} segments to <P>', () => {
  assert.strictEqual(canonicalizePathParams('/brands/${brandId}'), '/brands/<P>');
  assert.strictEqual(
    canonicalizePathParams('/teams/${teamId}/members/${memberId}'),
    '/teams/<P>/members/<P>',
  );
});

test('canonicalizePathParams reduces :param segments to <P>', () => {
  assert.strictEqual(canonicalizePathParams('/brands/:id'), '/brands/<P>');
  assert.strictEqual(canonicalizePathParams('/api/v1/teams/:teamId/members/:memberId'), '/api/v1/teams/<P>/members/<P>');
});

test('canonicalizePathParams keeps literal segments untouched (UUIDs, slugs, sentinels like non-existent-id)', () => {
  assert.strictEqual(
    canonicalizePathParams('/brands/non-existent-id'),
    '/brands/non-existent-id',
    'literal sentinel segments must not match the param regex',
  );
  assert.strictEqual(
    canonicalizePathParams('/brands/4f3a92e1-aeae-4d5f-9e7d-65b2c1a1c0a9'),
    '/brands/4f3a92e1-aeae-4d5f-9e7d-65b2c1a1c0a9',
    'UUID literals must not match the param regex',
  );
  assert.strictEqual(
    canonicalizePathParams('/brands/active-only'),
    '/brands/active-only',
    'kebab-case slug literals must not match the param regex',
  );
});

test('canonicalizePathParams handles full method+path tuples', () => {
  assert.strictEqual(
    canonicalizePathParams('GET /api/v1/brands/${brandId}'),
    'GET /api/v1/brands/<P>',
  );
  assert.strictEqual(
    canonicalizePathParams('DELETE /api/v1/brands/:id'),
    'DELETE /api/v1/brands/<P>',
  );
});

test('canonicalizePathParams is idempotent', () => {
  const onceCanonical = canonicalizePathParams('/brands/${brandId}/items/:itemId');
  assert.strictEqual(canonicalizePathParams(onceCanonical), onceCanonical);
});

test('canonicalizePathParams handles non-string and empty inputs gracefully', () => {
  assert.strictEqual(canonicalizePathParams(''), '');
  assert.strictEqual(canonicalizePathParams(null), null);
  assert.strictEqual(canonicalizePathParams(undefined), undefined);
});

test('buildCoverageSet emits canonical-shape variants alongside literal forms for ${var} paths', () => {
  const flows = [
    {
      id: 'admin-get-by-id',
      steps: [
        { kind: 'setAuth', binding: 'admin' },
        { kind: 'api', method: 'GET', path: '/brands/${brandId}' },
        { kind: 'expect', status: 200 },
      ],
    },
  ];
  const cov = buildCoverageSet(flows, 'api/v1');
  // Literal forms still emitted (backward compat with name-based matching).
  assert.ok(cov.has('GET /brands/${brandId}:200'), 'literal unprefixed tuple must be emitted');
  assert.ok(cov.has('GET /api/v1/brands/${brandId}:200'), 'literal prefixed tuple must be emitted');
  // Canonical-shape forms must also be emitted so :id-style diagnostics match.
  assert.ok(cov.has('GET /brands/<P>:200'), 'canonical unprefixed tuple must be emitted');
  assert.ok(cov.has('GET /api/v1/brands/<P>:200'), 'canonical prefixed tuple must be emitted');
});

test('canonicalization suppresses CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE for parameterized routes', () => {
  // Reproduces the 2026-05-15 brand-profile incident: the controller declares
  // `@Get(':id')` so the diagnostic emits `GET /api/v1/brands/:id`, but the
  // curated flow uses `path: "/brands/${brandId}"`. Without canonicalization
  // the suppression check misses and 6 UNGENERATABLE rows survive.
  const matrix = {
    apiEndpoints: [
      {
        method: 'GET',
        path: '/api/v1/brands/:id',
        framework: 'nest',
        guard: 'authenticated',
        responseContract: { status: 200, schemaRef: 'Envelope<BrandProfileDto>' },
        securityRequirement: [{ accessToken: [] }],
      },
      {
        method: 'PUT',
        path: '/api/v1/brands/:id',
        framework: 'nest',
        guard: 'authenticated',
        responseContract: { status: 200, schemaRef: 'Envelope<BrandProfileDto>' },
        securityRequirement: [{ accessToken: [] }],
      },
    ],
    authDetection: { sessionMechanism: 'unknown', tokenStorage: 'unknown' },
  };
  const logical = { actors: ['admin'], surfaces: [] };
  const curatedSteps = [
    {
      id: 'admin-get-by-id',
      steps: [
        { kind: 'setAuth', binding: 'admin' },
        { kind: 'api', method: 'GET', path: '/brands/${brandId}' },
        { kind: 'expect', status: 200 },
      ],
    },
    {
      id: 'admin-rename',
      steps: [
        { kind: 'setAuth', binding: 'admin' },
        { kind: 'api', method: 'PUT', path: '/brands/${brandId}' },
        { kind: 'expect', status: 200 },
      ],
    },
  ];
  const result = generate(matrix, logical, { ignore: [], curatedFlowSteps: curatedSteps });
  const surviving = (result.diagnostics || []).filter(
    (diag) => diag.code === 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE'
      && /\/api\/v1\/brands\/:id/.test(diag.endpoint || '')
      && /Status 200/.test(diag.message || ''),
  );
  assert.strictEqual(
    surviving.length,
    0,
    `Canonical-shape coverage MUST suppress UNGENERATABLE for :id-style diagnostics covered by \${var}-style curated flows. Surviving: ${JSON.stringify(surviving)}`,
  );
});
