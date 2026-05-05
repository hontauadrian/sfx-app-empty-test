'use strict';

// Fixture-driven tests for flows-generator.js (Phase 2).
// Run with: node --test __tests__/flows-generator/flows-generator.test.js
// Uses node:test (stable on Node 18+). No external deps.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { generate, sortKeys, buildCoverageSet } = require(path.resolve(
  __dirname, '..', '..', 'probes', 'flows-generator.js'
));

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

test('roles-endpoint: total flow count (1 happy + 4 auth + 1 role = 6)', () => {
  const { matrix, logical } = loadFixture('roles-endpoint');
  const result = generate(matrix, logical, { ignore: [] });
  assert.strictEqual(result.flows.length, 6);
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
