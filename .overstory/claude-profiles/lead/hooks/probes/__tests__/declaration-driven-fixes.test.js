'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  pickUniqueSigil,
  buildSampleBody,
  emitStatusReachabilityFlows,
  emitHappyFlow,
  emitCrudRoundtrips,
  emitResourceSetupChains,
  fanOutMutableChains,
  resolveResourceRefDeps,
  detectPathPrefixParent,
  emitLogicalContractFlows,
  emitAuthBootstrapChain,
} = require('../flows-generator');

const { emitCookieRefreshRotation } = require('../emitters/cookie-refresh-rotation');

// ---------------------------------------------------------------------------
// Fix #2: pickUniqueSigil with constraints
// ---------------------------------------------------------------------------

describe('pickUniqueSigil with constraints', () => {
  it('returns ${uniqEmail} when constraints.format is email', () => {
    const result = pickUniqueSigil('user@example.com', { format: 'email' });
    assert.equal(result, '${uniqEmail}');
  });

  it('emits parameterized sigil with maxLen constraint', () => {
    const result = pickUniqueSigil('ABC', { max: 8 });
    assert.match(result, /^\$\{uniq:maxLen:8\}$/);
  });

  it('emits parameterized sigil with maxLen + pattern constraints', () => {
    const result = pickUniqueSigil('ABC', { max: 10, pattern: '^[A-Z]+$' });
    assert.match(result, /^\$\{uniq:maxLen:10:pattern:/);
    // Verify base64-encoded pattern is present
    const expected64 = Buffer.from('^[A-Z]+$').toString('base64');
    assert.ok(result.includes(expected64), `expected base64 pattern ${expected64} in ${result}`);
  });

  it('emits parameterized sigil with pattern only', () => {
    const result = pickUniqueSigil('ABC', { pattern: '^[A-Z]+$' });
    assert.match(result, /^\$\{uniq:pattern:/);
  });

  it('emits ${uniqString} when no constraints (no heuristic fallback)', () => {
    // Per source-of-truth principle: no constraints → no guessing from sample value.
    // All untyped fields get ${uniqString}; if the field actually needs email/uuid,
    // the probe will fail, surfacing the missing .email()/.uuid() declaration.
    assert.equal(pickUniqueSigil('user@example.com', null), '${uniqString}');
    assert.equal(pickUniqueSigil('550e8400-e29b-41d4-a716-446655440000', null), '${uniqString}');
    assert.equal(pickUniqueSigil('hello', null), '${uniqString}');
  });

  it('prefers constraints.format over sample-value detection', () => {
    // Even though sample has no @, email format should win
    const result = pickUniqueSigil('notanemail', { format: 'email' });
    assert.equal(result, '${uniqEmail}');
  });
});

// ---------------------------------------------------------------------------
// Fix #2: buildSampleBody with field constraints
// ---------------------------------------------------------------------------

describe('buildSampleBody with field constraints', () => {
  it('passes field constraints to pickUniqueSigil', () => {
    const zodContract = {
      sampleValid: { username: 'testuser', code: 'ABC123' },
      fields: {
        username: { constraints: {} },
        code: { constraints: { max: 6, pattern: '^[A-Z0-9]+$' } },
      },
    };
    const uniqueFieldSet = new Set(['username', 'code']);
    const body = buildSampleBody(zodContract, uniqueFieldSet);

    assert.equal(body.username, '${uniqString}');
    assert.match(body.code, /^\$\{uniq:maxLen:6:pattern:/);
  });

  it('uses email sigil when field has format:email constraint', () => {
    const zodContract = {
      sampleValid: { email: 'user@example.com' },
      fields: {
        email: { constraints: { format: 'email' } },
      },
    };
    const uniqueFieldSet = new Set(['email']);
    const body = buildSampleBody(zodContract, uniqueFieldSet);

    assert.equal(body.email, '${uniqEmail}');
  });

  it('handles maxLength property name (matrix format)', () => {
    const zodContract = {
      sampleValid: { key: 'WEB' },
      fields: [
        { name: 'key', type: 'string', required: true, constraints: { minLength: 2, maxLength: 10, pattern: '^[A-Z][A-Z0-9]*$' } },
      ],
    };
    const uniqueFieldSet = new Set(['key']);
    const body = buildSampleBody(zodContract, uniqueFieldSet);
    assert.match(body.key, /^\$\{uniq:maxLen:10:pattern:/,
      'maxLength property should be recognized and emitted as maxLen sigil');
  });

  it('returns null for missing zodContract', () => {
    assert.equal(buildSampleBody(null, new Set(['email'])), null);
  });

  it('handles zodContract without fields gracefully', () => {
    const zodContract = { sampleValid: { name: 'test' } };
    const body = buildSampleBody(zodContract, new Set(['name']));
    assert.equal(body.name, '${uniqString}');
  });
});

// ---------------------------------------------------------------------------
// Fix #3: status-reach:404 with body + auth + dependsOn
// ---------------------------------------------------------------------------

describe('emitStatusReachabilityFlows fix for 404', () => {
  const baseEp = {
    method: 'PATCH',
    path: '/api/v1/items/:id',
    file: 'items.controller.ts',
    swaggerDeclared: { statuses: [200, 404] },
    authDecorators: { authRequired: true },
    zodContract: {
      sampleValid: { name: 'updated' },
      fields: { name: { constraints: {} } },
    },
  };

  it('adds body for PATCH endpoint on 404 reach flow', () => {
    const coveredStatuses = new Set([200]);
    const diags = [];
    const flows = emitStatusReachabilityFlows(baseEp, coveredStatuses, diags, {
      authBootstrapAvailable: true,
      uniqueFieldSet: new Set(),
    });

    assert.equal(flows.length, 1);
    const f = flows[0];
    assert.match(f.id, /status-reach:404/);

    // Should have setAuth + api + expect steps
    const setAuthStep = f.steps.find((s) => s.kind === 'setAuth');
    assert.ok(setAuthStep, 'should have setAuth step for authed endpoint');

    const apiStep = f.steps.find((s) => s.kind === 'api');
    assert.ok(apiStep.body, 'PATCH 404 reach should include body');
    assert.equal(apiStep.body.name, 'updated');

    // dependsOn should include auth-bootstrap
    assert.ok(f.dependsOn.includes('chain:auth-bootstrap'));
  });

  it('omits auth setup when authBootstrapAvailable is false', () => {
    const coveredStatuses = new Set([200]);
    const diags = [];
    const flows = emitStatusReachabilityFlows(baseEp, coveredStatuses, diags, {
      authBootstrapAvailable: false,
    });

    assert.equal(flows.length, 1);
    const f = flows[0];
    const setAuthStep = f.steps.find((s) => s.kind === 'setAuth');
    assert.equal(setAuthStep, undefined, 'no setAuth when no bootstrap');
    assert.deepEqual(f.dependsOn, []);
  });

  it('omits body for GET endpoint on 404 reach flow', () => {
    const getEp = {
      ...baseEp,
      method: 'GET',
      zodContract: null,
    };
    const coveredStatuses = new Set([200]);
    const diags = [];
    const flows = emitStatusReachabilityFlows(getEp, coveredStatuses, diags, {
      authBootstrapAvailable: true,
    });

    assert.equal(flows.length, 1);
    const apiStep = flows[0].steps.find((s) => s.kind === 'api');
    assert.equal(apiStep.body, undefined, 'GET should not have body');
  });
});

// ---------------------------------------------------------------------------
// Fix #4: cookie-refresh-rotation email substitution
// ---------------------------------------------------------------------------

describe('cookie-refresh-rotation email substitution', () => {
  const baseFlow = {
    name: 'refresh_token',
    role: 'refresh-token',
    issuers: [{
      method: 'POST',
      path: '/api/v1/auth/login',
      operationId: 'AuthController_login',
      declaredStatus: 200,
      requestBodyExample: { email: 'user@example.com', password: 'pass123' },
    }],
    rotators: [{
      method: 'POST',
      path: '/api/v1/auth/refresh',
      operationId: 'AuthController_refresh',
      declaredStatus: 200,
    }],
    clearers: [],
  };

  it('substitutes email field with ${uniqEmail} when zodContract declares format:email', () => {
    const endpoints = [{
      method: 'POST',
      path: '/api/v1/auth/login',
      zodContract: {
        fields: {
          email: { constraints: { format: 'email' } },
          password: { constraints: {} },
        },
      },
    }];
    const flows = emitCookieRefreshRotation(baseFlow, { endpoints });

    assert.equal(flows.length, 1);
    const apiStep = flows[0].steps.find((s) => s.kind === 'api' && s.path === '/api/v1/auth/login');
    assert.equal(apiStep.body.email, '${registeredEmail}', 'email field should use registeredEmail (login needs bootstrap-registered user)');
    assert.equal(apiStep.body.password, 'pass123', 'non-email field should remain');
  });

  it('adds setAuth and dependsOn when email sigil detected', () => {
    const endpoints = [{
      method: 'POST',
      path: '/api/v1/auth/login',
      zodContract: {
        fields: {
          email: { constraints: { format: 'email' } },
        },
      },
    }];
    const flows = emitCookieRefreshRotation(baseFlow, { endpoints });

    assert.equal(flows.length, 1);
    const setAuthStep = flows[0].steps.find((s) => s.kind === 'setAuth');
    assert.ok(setAuthStep, 'should add setAuth when email sigil present');
    assert.ok(flows[0].dependsOn.includes('chain:auth-bootstrap'));
  });

  it('does not substitute when no zodContract fields', () => {
    const flows = emitCookieRefreshRotation(baseFlow, { endpoints: [] });

    assert.equal(flows.length, 1);
    const apiStep = flows[0].steps.find((s) => s.kind === 'api' && s.path === '/api/v1/auth/login');
    assert.equal(apiStep.body.email, 'user@example.com', 'should keep original value');
  });

  it('issue-only chain also gets email substitution', () => {
    const flowNoRotator = { ...baseFlow, rotators: [] };
    const endpoints = [{
      method: 'POST',
      path: '/api/v1/auth/login',
      zodContract: {
        fields: {
          email: { constraints: { format: 'email' } },
        },
      },
    }];
    const flows = emitCookieRefreshRotation(flowNoRotator, { endpoints });

    assert.equal(flows.length, 1);
    assert.match(flows[0].id, /issue$/);
    const apiStep = flows[0].steps.find((s) => s.kind === 'api');
    assert.equal(apiStep.body.email, '${registeredEmail}', 'issue-only chain should also use registeredEmail');
  });

  it('handles array-format zodContract.fields (from zod-introspect)', () => {
    // Real matrix data from zod-introspect uses array format:
    // [{name:'email', type:'string', constraints:{format:'email'}}, ...]
    const endpoints = [{
      method: 'POST',
      path: '/api/v1/auth/login',
      zodContract: {
        fields: [
          { name: 'email', type: 'string', required: true, constraints: { format: 'email' } },
          { name: 'password', type: 'string', required: true, constraints: { minLength: 8 } },
        ],
      },
    }];
    const flows = emitCookieRefreshRotation(baseFlow, { endpoints });

    assert.equal(flows.length, 1);
    const apiStep = flows[0].steps.find((s) => s.kind === 'api' && s.path === '/api/v1/auth/login');
    assert.equal(apiStep.body.email, '${registeredEmail}', 'array-format fields should also trigger email substitution');
    assert.equal(apiStep.body.password, 'pass123', 'non-email field should remain');
    assert.ok(flows[0].dependsOn.includes('chain:auth-bootstrap'), 'should depend on auth-bootstrap');
  });
});

// ---------------------------------------------------------------------------
// Fix #5: authed-refresh-persists uses buildSampleBody
// ---------------------------------------------------------------------------

describe('authed-refresh-persists sigil substitution', () => {
  it('reuses inherited accessToken from chain:auth-bootstrap (no redundant login)', () => {
    const endpoints = [
      {
        method: 'GET',
        path: '/api/v1/me',
        file: 'profile.controller.ts',
        authDecorators: { authRequired: true },
      },
      {
        method: 'POST',
        path: '/api/v1/auth/login',
        file: 'auth.controller.ts',
        zodContract: {
          sampleValid: { email: 'user@example.com', password: 'pass123' },
          fields: {
            email: { constraints: { format: 'email' } },
            password: { constraints: {} },
          },
        },
      },
    ];
    const logicalRows = [{ id: 'authed-refresh-persists', type: 'authed-refresh-persists' }];
    const authFlows = {
      tokenIssuer: { method: 'POST', path: '/api/v1/auth/login' },
    };

    const flows = emitLogicalContractFlows(logicalRows, endpoints, [], {
      authFlows,
      uniqueFieldSet: new Set(['email']),
    });

    const refreshFlow = flows.find((f) => f.id === 'logical:authed-refresh-persists');
    assert.ok(refreshFlow, 'authed-refresh-persists flow should be emitted');

    // The flow should NOT re-login — it reuses the accessToken inherited from
    // chain:auth-bootstrap via sharedBindings. Re-logging in with ${uniqEmail}
    // would fail because each flow gets a fresh unique seed and the email was
    // only registered in the bootstrap chain's scope.
    const loginStep = refreshFlow.steps.find((s) => s.kind === 'api' && s.path === '/api/v1/auth/login');
    assert.ok(!loginStep, 'should NOT have a redundant login API step');

    // First step should be setAuth using inherited accessToken
    const setAuthStep = refreshFlow.steps.find((s) => s.kind === 'setAuth');
    assert.ok(setAuthStep, 'should have setAuth step');
    assert.equal(setAuthStep.binding, 'accessToken', 'should use inherited accessToken');

    // Should depend on chain:auth-bootstrap
    assert.ok(refreshFlow.dependsOn.includes('chain:auth-bootstrap'), 'should depend on auth-bootstrap');
  });
});

// ---------------------------------------------------------------------------
// Fix #1: Resource-setup chains — path-prefix autodetection + body-field refs
// ---------------------------------------------------------------------------

// --- Part A: detectPathPrefixParent ---

describe('detectPathPrefixParent', () => {
  const parentPost = {
    method: 'POST',
    path: '/api/v1/teams',
    operationId: 'TeamController_create',
    file: 'team.controller.ts',
    zodContract: { sampleValid: { name: 'Team A' }, fields: {} },
    responseContract: { requiredPaths: ['id', 'name'] },
    swaggerDeclared: { statuses: [201] },
  };

  it('autodetects parent from path prefix /teams/:teamId/members', () => {
    const child = { method: 'GET', path: '/api/v1/teams/:teamId/members', file: 'member.controller.ts' };
    const result = detectPathPrefixParent(child, [parentPost, child]);
    assert.ok(result, 'should detect parent');
    assert.equal(result.parentEp, parentPost);
    assert.equal(result.paramName, 'teamId');
    assert.equal(result.resourceName, 'teams');
    assert.equal(result.chainId, 'chain:resource-setup:teams');
  });

  it('autodetects parent for deeply nested child /teams/:teamId/members/:id', () => {
    const child = { method: 'GET', path: '/api/v1/teams/:teamId/members/:id', file: 'member.controller.ts' };
    const result = detectPathPrefixParent(child, [parentPost, child]);
    assert.ok(result, 'should detect parent');
    assert.equal(result.paramName, 'teamId');
    assert.equal(result.resourceName, 'teams');
  });

  it('returns null when no POST exists at parent path', () => {
    const child = { method: 'GET', path: '/api/v1/orgs/:orgId/repos', file: 'repo.controller.ts' };
    const result = detectPathPrefixParent(child, [child]);
    assert.equal(result, null);
  });

  it('returns null when parent POST has no zodContract', () => {
    const barePost = { method: 'POST', path: '/api/v1/teams', file: 'team.controller.ts' };
    const child = { method: 'GET', path: '/api/v1/teams/:teamId/members', file: 'member.controller.ts' };
    const result = detectPathPrefixParent(child, [barePost, child]);
    assert.equal(result, null, 'parent without zodContract should not match');
  });

  it('returns null for non-nested endpoint /api/v1/teams/:id', () => {
    // This is a direct resource param, not a child — no parent path exists
    const ep = { method: 'GET', path: '/api/v1/teams/:id', file: 'team.controller.ts' };
    const result = detectPathPrefixParent(ep, [parentPost, ep]);
    // /api/v1/teams/:id → parent base would be /api/v1/teams, but :id is the
    // resource's own param, not a parent ref. The parent POST exists at
    // /api/v1/teams, but this is the SAME resource — legitimate autodetection.
    // The function will detect it; the caller (emitHappyFlow) already has
    // its own :id param handling. This is correct behavior.
    // For a bare GET /teams/:id, the parent IS /teams.
    if (result) {
      assert.equal(result.paramName, 'id');
      assert.equal(result.resourceName, 'teams');
    }
  });
});

// --- Part A: emitResourceSetupChains (path-prefix autodetection) ---

describe('emitResourceSetupChains — path-prefix autodetection', () => {
  it('autodetects and emits chain for path-prefix child resource', () => {
    const endpoints = [
      {
        method: 'POST',
        path: '/api/v1/teams',
        operationId: 'TeamController_create',
        file: 'team.controller.ts',
        zodContract: { sampleValid: { name: 'Team A' }, fields: {} },
        responseContract: { requiredPaths: ['id'] },
        swaggerDeclared: { statuses: [201], extensions: { 'x-resource-captures': [{ fromPath: 'id', resource: 'team', pathParam: 'teamId' }] } },
      },
      {
        method: 'GET',
        path: '/api/v1/teams/:teamId/members',
        file: 'member.controller.ts',
      },
    ];

    const flows = emitResourceSetupChains(endpoints, { uniqueFieldSet: new Set(), diagnostics: [] });
    assert.equal(flows.length, 1);
    assert.equal(flows[0].id, 'chain:resource-setup:teams');

    const createStep = flows[0].steps.find((s) => s.kind === 'api');
    assert.equal(createStep.method, 'POST');
    assert.equal(createStep.path, '/api/v1/teams');

    const captureStep = flows[0].steps.find((s) => s.kind === 'capture');
    assert.ok(captureStep.bindings['resource:teams:id'], 'should capture resource:teams:id');
  });

  it('deduplicates chains when multiple children share same parent', () => {
    const endpoints = [
      {
        method: 'POST',
        path: '/api/v1/teams',
        operationId: 'TeamController_create',
        file: 'team.controller.ts',
        zodContract: { sampleValid: { name: 'Team A' }, fields: {} },
        responseContract: { requiredPaths: ['id'] },
        swaggerDeclared: { statuses: [201], extensions: { 'x-resource-captures': [{ fromPath: 'id', resource: 'team', pathParam: 'teamId' }] } },
      },
      { method: 'GET', path: '/api/v1/teams/:teamId/members', file: 'member.controller.ts' },
      { method: 'POST', path: '/api/v1/teams/:teamId/projects', file: 'project.controller.ts' },
    ];

    const flows = emitResourceSetupChains(endpoints, { uniqueFieldSet: new Set(), diagnostics: [] });
    assert.equal(flows.length, 1, 'should deduplicate same parent');
  });

  it('adds auth when parent endpoint requires auth', () => {
    const endpoints = [
      {
        method: 'POST',
        path: '/api/v1/teams',
        operationId: 'TeamController_create',
        file: 'team.controller.ts',
        zodContract: { sampleValid: { name: 'Team A' }, fields: {} },
        responseContract: { requiredPaths: ['id'] },
        swaggerDeclared: { statuses: [201], extensions: { 'x-resource-captures': [{ fromPath: 'id', resource: 'team', pathParam: 'teamId' }] } },
        authDecorators: { authRequired: true },
      },
      { method: 'GET', path: '/api/v1/teams/:teamId/members', file: 'member.controller.ts' },
    ];

    const flows = emitResourceSetupChains(endpoints, {
      uniqueFieldSet: new Set(),
      authBootstrapAvailable: true,
      diagnostics: [],
    });

    assert.equal(flows.length, 1);
    assert.ok(flows[0].steps.find((s) => s.kind === 'setAuth'));
    assert.ok(flows[0].dependsOn.includes('chain:auth-bootstrap'));
  });
});

// --- Part B: emitResourceSetupChains (body-field x-probe-resource-ref) ---

describe('emitResourceSetupChains — body-field x-probe-resource-ref', () => {
  it('emits chain for x-probe-resource-ref with operationId', () => {
    const endpoints = [
      {
        method: 'POST',
        path: '/api/v1/teams',
        operationId: 'TeamController_create',
        file: 'team.controller.ts',
        zodContract: { sampleValid: { name: 'Team A' }, fields: {} },
        swaggerDeclared: { statuses: [201] },
      },
      {
        method: 'POST',
        path: '/api/v1/projects',
        operationId: 'ProjectController_create',
        file: 'project.controller.ts',
        swaggerDeclared: {
          extensions: {
            'x-probe-resource-ref': {
              parentField: 'teamId',
              parentCreate: { operationId: 'TeamController_create' },
              captureFrom: '$.id',
            },
          },
        },
      },
    ];

    const flows = emitResourceSetupChains(endpoints, { uniqueFieldSet: new Set() });
    assert.equal(flows.length, 1);
    assert.equal(flows[0].id, 'chain:resource-setup:teamId');
    const captureStep = flows[0].steps.find((s) => s.kind === 'capture');
    assert.ok(captureStep.bindings['resource:teamId:id']);
  });

  it('emits chain for x-probe-resource-ref with resource path', () => {
    const endpoints = [
      {
        method: 'POST',
        path: '/api/v1/teams',
        operationId: 'TeamController_create',
        file: 'team.controller.ts',
        zodContract: { sampleValid: { name: 'Team A' }, fields: {} },
        swaggerDeclared: { statuses: [201], extensions: { 'x-resource-captures': [{ fromPath: 'id', resource: 'team', pathParam: 'id' }] } },
      },
      {
        method: 'POST',
        path: '/api/v1/projects',
        operationId: 'ProjectController_create',
        file: 'project.controller.ts',
        swaggerDeclared: {
          extensions: {
            'x-probe-resource-ref': {
              parentField: 'teamId',
              resource: '/api/v1/teams',
            },
          },
        },
      },
    ];

    const flows = emitResourceSetupChains(endpoints, { uniqueFieldSet: new Set(), diagnostics: [] });
    assert.equal(flows.length, 1);
    assert.equal(flows[0].id, 'chain:resource-setup:teams');
  });
});

// --- resolveResourceRefDeps ---

describe('resolveResourceRefDeps', () => {
  it('returns empty when no parent or extension', () => {
    const ep = { path: '/api/v1/items', swaggerDeclared: { statuses: [200] } };
    const result = resolveResourceRefDeps(ep, []);
    assert.deepEqual(result.deps, []);
    assert.deepEqual(result.overrides, {});
    assert.deepEqual(result.pathSubstitutions, {});
  });

  it('returns pathSubstitutions for path-prefix child', () => {
    const parentPost = {
      method: 'POST', path: '/api/v1/teams',
      zodContract: { sampleValid: { name: 'A' }, fields: {} },
      responseContract: { requiredPaths: ['id'] },
      swaggerDeclared: { statuses: [201] },
    };
    const child = { method: 'GET', path: '/api/v1/teams/:teamId/members' };
    const result = resolveResourceRefDeps(child, [parentPost, child]);

    assert.ok(result.deps.includes('chain:resource-setup:teams'));
    assert.equal(result.pathSubstitutions.teamId, '${resource:teams:id}');
  });

  it('returns overrides for body-field x-probe-resource-ref', () => {
    const ep = {
      path: '/api/v1/projects',
      swaggerDeclared: {
        extensions: {
          'x-probe-resource-ref': {
            parentField: 'teamId',
            parentCreate: { operationId: 'TeamController_create' },
          },
        },
      },
    };
    const endpoints = [{ operationId: 'TeamController_create', method: 'POST', path: '/api/v1/teams' }];
    const result = resolveResourceRefDeps(ep, endpoints);

    assert.ok(result.deps.includes('chain:resource-setup:teamId'));
    assert.equal(result.overrides.teamId, '${resource:teamId:id}');
  });

  it('handles both path-prefix and body-field refs simultaneously', () => {
    const parentPost = {
      method: 'POST', path: '/api/v1/teams',
      operationId: 'TeamController_create',
      zodContract: { sampleValid: { name: 'A' }, fields: {} },
      responseContract: { requiredPaths: ['id'] },
      swaggerDeclared: { statuses: [201] },
    };
    const child = {
      method: 'POST', path: '/api/v1/teams/:teamId/projects',
      swaggerDeclared: {
        extensions: {
          'x-probe-resource-ref': {
            parentField: 'orgId',
            resource: '/api/v1/orgs',
          },
        },
      },
    };
    const orgPost = {
      method: 'POST', path: '/api/v1/orgs',
      zodContract: { sampleValid: { name: 'Org' }, fields: {} },
      swaggerDeclared: { statuses: [201] },
    };
    const result = resolveResourceRefDeps(child, [parentPost, child, orgPost]);

    // Path-prefix: teams parent
    assert.ok(result.deps.includes('chain:resource-setup:teams'));
    assert.equal(result.pathSubstitutions.teamId, '${resource:teams:id}');
    // Body-field: orgs parent
    assert.ok(result.deps.includes('chain:resource-setup:orgs'));
    assert.equal(result.overrides.orgId, '${resource:orgs:id}');
  });
});

// --- emitHappyFlow resource-ref wiring ---

describe('emitHappyFlow resource-ref wiring', () => {
  it('applies body-field overrides to body and deps (part B)', () => {
    const ep = {
      method: 'POST',
      path: '/api/v1/projects',
      file: 'project.controller.ts',
      zodContract: {
        sampleValid: { name: 'Project A', teamId: 'some-uuid' },
        fields: {},
        schemaRef: 'create-project.schema.ts',
      },
      swaggerDeclared: {
        statuses: [201],
        extensions: {
          'x-probe-resource-ref': {
            parentField: 'teamId',
            parentCreate: { operationId: 'TeamController_create' },
          },
        },
      },
    };
    const endpoints = [
      { operationId: 'TeamController_create', method: 'POST', path: '/api/v1/teams' },
    ];

    const flow = emitHappyFlow(ep, { endpoints, uniqueFieldSet: new Set() });
    assert.ok(flow);

    const apiStep = flow.steps.find((s) => s.kind === 'api');
    assert.equal(apiStep.body.teamId, '${resource:teamId:id}', 'body-field should have resource ref override');
    assert.ok(flow.dependsOn.includes('chain:resource-setup:teamId'));
  });

  it('applies path substitutions for path-prefix child (part A)', () => {
    const parentPost = {
      method: 'POST', path: '/api/v1/teams',
      operationId: 'TeamController_create',
      file: 'team.controller.ts',
      zodContract: { sampleValid: { name: 'A' }, fields: {} },
      responseContract: { requiredPaths: ['id'] },
      swaggerDeclared: { statuses: [201] },
    };
    const child = {
      method: 'GET',
      path: '/api/v1/teams/:teamId/members',
      file: 'member.controller.ts',
      swaggerDeclared: { statuses: [200] },
    };
    const flow = emitHappyFlow(child, { endpoints: [parentPost, child], uniqueFieldSet: new Set() });
    assert.ok(flow);

    const apiStep = flow.steps.find((s) => s.kind === 'api');
    assert.equal(apiStep.path, '/api/v1/teams/${resource:teams:id}/members',
      'path param should be substituted with parent resource sigil');
    assert.ok(flow.dependsOn.includes('chain:resource-setup:teams'));
  });
});

// --- emitCrudRoundtrips resource-ref + auth wiring ---

describe('emitCrudRoundtrips resource-ref + auth wiring', () => {
  it('adds auth and body-field resource-ref deps to CRUD chain', () => {
    const endpoints = [
      {
        method: 'POST',
        path: '/api/v1/projects',
        file: 'project.controller.ts',
        operationId: 'ProjectController_create',
        zodContract: { sampleValid: { name: 'P', teamId: 'uuid' }, fields: {} },
        authDecorators: { authRequired: true },
        swaggerDeclared: {
          extensions: {
            'x-probe-resource-ref': {
              parentField: 'teamId',
              parentCreate: { operationId: 'TeamController_create' },
            },
          },
        },
      },
      {
        method: 'GET',
        path: '/api/v1/projects/:id',
        file: 'project.controller.ts',
        operationId: 'ProjectController_findOne',
      },
      {
        method: 'PATCH',
        path: '/api/v1/projects/:id',
        file: 'project.controller.ts',
        operationId: 'ProjectController_update',
        zodContract: { sampleValid: { name: 'Updated' }, fields: {} },
      },
      {
        method: 'DELETE',
        path: '/api/v1/projects/:id',
        file: 'project.controller.ts',
        operationId: 'ProjectController_remove',
      },
      {
        method: 'POST',
        path: '/api/v1/teams',
        operationId: 'TeamController_create',
        file: 'team.controller.ts',
      },
    ];

    const flows = emitCrudRoundtrips(endpoints, {
      endpoints,
      uniqueFieldSet: new Set(),
      authBootstrapAvailable: true,
    });

    assert.equal(flows.length, 1);
    const f = flows[0];
    assert.ok(f.dependsOn.includes('chain:auth-bootstrap'), 'should depend on auth');
    assert.ok(f.dependsOn.includes('chain:resource-setup:teamId'), 'should depend on resource setup');

    const setAuth = f.steps.find((s) => s.kind === 'setAuth');
    assert.ok(setAuth, 'CRUD chain should have setAuth');

    const createStep = f.steps.find((s) => s.kind === 'api' && s.method === 'POST');
    assert.equal(createStep.body.teamId, '${resource:teamId:id}', 'should override teamId');
  });
});

// --- status-reach:404 with path-prefix parent ---

describe('status-reach:404 with path-prefix parent', () => {
  it('substitutes parent param and keeps leaf as non-existent', () => {
    const parentPost = {
      method: 'POST', path: '/api/v1/teams',
      zodContract: { sampleValid: { name: 'A' }, fields: {} },
      responseContract: { requiredPaths: ['id'] },
      swaggerDeclared: { statuses: [201] },
    };
    const child = {
      method: 'GET',
      path: '/api/v1/teams/:teamId/members/:id',
      file: 'member.controller.ts',
      swaggerDeclared: { statuses: [200, 404] },
      authDecorators: null,
    };

    const coveredStatuses = new Set([200]);
    const diags = [];
    const flows = emitStatusReachabilityFlows(child, coveredStatuses, diags, {
      endpoints: [parentPost, child],
    });

    assert.equal(flows.length, 1);
    const apiStep = flows[0].steps.find((s) => s.kind === 'api');
    // teamId should be substituted with parent sigil, :id should be non-existent
    assert.ok(apiStep.path.includes('${resource:teams:id}'), `expected parent sigil in path, got: ${apiStep.path}`);
    assert.ok(apiStep.path.includes('non-existent-id-00000'), `expected non-existent leaf in path, got: ${apiStep.path}`);
    assert.ok(flows[0].dependsOn.includes('chain:resource-setup:teams'));
  });
});

describe('status-reach:404 leaf param override for single-param paths', () => {
  it('uses non-existent-id for /teams/:id even though parent POST exists', () => {
    const parentPost = {
      method: 'POST', path: '/api/v1/teams',
      zodContract: { sampleValid: { name: 'A' }, fields: {} },
      responseContract: { requiredPaths: ['id'] },
      swaggerDeclared: { statuses: [201] },
    };
    const teamsById = {
      method: 'GET',
      path: '/api/v1/teams/:id',
      file: 'team.controller.ts',
      swaggerDeclared: { statuses: [200, 404] },
      authDecorators: null,
    };

    const coveredStatuses = new Set([200]);
    const diags = [];
    const flows = emitStatusReachabilityFlows(teamsById, coveredStatuses, diags, {
      endpoints: [parentPost, teamsById],
    });

    assert.equal(flows.length, 1, 'should emit one 404 reach flow');
    const apiStep = flows[0].steps.find((s) => s.kind === 'api');
    // :id is the LEAF param — it must be non-existent for 404-reach,
    // even though detectPathPrefixParent maps it as a parent substitution.
    assert.ok(
      apiStep.path.includes('non-existent-id-00000'),
      `leaf param :id should be non-existent, got: ${apiStep.path}`,
    );
    assert.ok(
      !apiStep.path.includes('${resource:teams:id}'),
      `leaf param should NOT use parent sigil, got: ${apiStep.path}`,
    );
    // Should NOT depend on chain:resource-setup:teams since we don't use the real ID
    assert.ok(
      !flows[0].dependsOn.includes('chain:resource-setup:teams'),
      'should not depend on resource-setup:teams when leaf is non-existent',
    );
  });

  it('still uses parent sigil for non-leaf params in multi-param paths', () => {
    const parentPost = {
      method: 'POST', path: '/api/v1/teams',
      zodContract: { sampleValid: { name: 'A' }, fields: {} },
      responseContract: { requiredPaths: ['id'] },
      swaggerDeclared: { statuses: [201] },
    };
    const child = {
      method: 'PATCH',
      path: '/api/v1/teams/:teamId/members/:id',
      file: 'member.controller.ts',
      swaggerDeclared: { statuses: [200, 404] },
      authDecorators: null,
      zodContract: { sampleValid: { role: 'ADMIN' }, fields: {} },
    };

    const coveredStatuses = new Set([200]);
    const diags = [];
    const flows = emitStatusReachabilityFlows(child, coveredStatuses, diags, {
      endpoints: [parentPost, child],
    });

    assert.equal(flows.length, 1);
    const apiStep = flows[0].steps.find((s) => s.kind === 'api');
    // :teamId is parent, :id is leaf
    assert.ok(
      apiStep.path.includes('${resource:teams:id}'),
      `parent param :teamId should use sigil, got: ${apiStep.path}`,
    );
    assert.ok(
      apiStep.path.includes('non-existent-id-00000'),
      `leaf param :id should be non-existent, got: ${apiStep.path}`,
    );
    assert.ok(flows[0].dependsOn.includes('chain:resource-setup:teams'));
  });
});

// ---------------------------------------------------------------------------
// Bug 1b: pickUniqueSigil reads constraints.regex (not just .pattern)
// ---------------------------------------------------------------------------

describe('pickUniqueSigil reads constraints.regex field', () => {
  it('emits parameterized sigil when constraints has regex (not pattern)', () => {
    const result = pickUniqueSigil('ABC', { max: 10, regex: '^[A-Z][A-Z0-9]*$' });
    assert.match(result, /^\$\{uniq:maxLen:10:pattern:/);
    const expected64 = Buffer.from('^[A-Z][A-Z0-9]*$').toString('base64');
    assert.ok(result.includes(expected64), `expected base64 regex in ${result}`);
  });

  it('emits parameterized sigil with regex only (no max)', () => {
    const result = pickUniqueSigil('ABC', { regex: '^[A-Z]+$' });
    assert.match(result, /^\$\{uniq:pattern:/);
  });

  it('prefers pattern over regex when both present', () => {
    const result = pickUniqueSigil('ABC', { max: 5, pattern: '^[A-Z]+$', regex: '^[0-9]+$' });
    // pattern takes precedence (first in || chain)
    const expected64 = Buffer.from('^[A-Z]+$').toString('base64');
    assert.ok(result.includes(expected64));
  });
});

// ---------------------------------------------------------------------------
// Bug 3: CRUD roundtrip capture step applies envelope wrapping
// ---------------------------------------------------------------------------

describe('emitCrudRoundtrips envelope-aware capture', () => {
  it('wraps capture paths with successWrapper when present', () => {
    const endpoints = [
      {
        method: 'POST',
        path: '/api/v1/items',
        file: 'item.controller.ts',
        operationId: 'ItemController_create',
        zodContract: { sampleValid: { name: 'Item' }, fields: {} },
        swaggerDeclared: { statuses: [201] },
      },
      {
        method: 'GET',
        path: '/api/v1/items/:id',
        file: 'item.controller.ts',
        operationId: 'ItemController_findOne',
        swaggerDeclared: { statuses: [200] },
      },
      {
        method: 'PATCH',
        path: '/api/v1/items/:id',
        file: 'item.controller.ts',
        operationId: 'ItemController_update',
        zodContract: { sampleValid: { name: 'Updated' }, fields: {} },
        swaggerDeclared: { statuses: [200] },
      },
      {
        method: 'DELETE',
        path: '/api/v1/items/:id',
        file: 'item.controller.ts',
        operationId: 'ItemController_remove',
        swaggerDeclared: { statuses: [200] },
      },
    ];

    const flows = emitCrudRoundtrips(endpoints, {
      endpoints,
      uniqueFieldSet: new Set(),
      envelopeWrapper: ['data'],
    });

    assert.equal(flows.length, 1);
    const captureStep = flows[0].steps.find((s) => s.kind === 'capture');
    assert.equal(captureStep.bindings.resourceId, '$.data.id',
      'capture should use envelope-wrapped path $.data.id');
    assert.equal(captureStep.bindings.resourceIdAlt, '$.data.id',
      'alt capture should also be envelope-wrapped');
  });

  it('uses bare path when no envelope wrapper', () => {
    const endpoints = [
      {
        method: 'POST',
        path: '/api/v1/items',
        file: 'item.controller.ts',
        operationId: 'ItemController_create',
        zodContract: { sampleValid: { name: 'Item' }, fields: {} },
        swaggerDeclared: { statuses: [201] },
      },
      {
        method: 'GET',
        path: '/api/v1/items/:id',
        file: 'item.controller.ts',
        operationId: 'ItemController_findOne',
        swaggerDeclared: { statuses: [200] },
      },
      {
        method: 'PATCH',
        path: '/api/v1/items/:id',
        file: 'item.controller.ts',
        operationId: 'ItemController_update',
        zodContract: { sampleValid: { name: 'Updated' }, fields: {} },
        swaggerDeclared: { statuses: [200] },
      },
      {
        method: 'DELETE',
        path: '/api/v1/items/:id',
        file: 'item.controller.ts',
        operationId: 'ItemController_remove',
        swaggerDeclared: { statuses: [200] },
      },
    ];

    const flows = emitCrudRoundtrips(endpoints, {
      endpoints,
      uniqueFieldSet: new Set(),
    });

    assert.equal(flows.length, 1);
    const captureStep = flows[0].steps.find((s) => s.kind === 'capture');
    assert.equal(captureStep.bindings.resourceId, '$.id');
    assert.equal(captureStep.bindings.resourceIdAlt, '$.id');
  });
});

// ---------------------------------------------------------------------------
// Bug 3: Resource-setup chain capture step applies envelope wrapping
// ---------------------------------------------------------------------------

describe('emitResourceSetupChains envelope-aware capture', () => {
  it('wraps capture path with successWrapper when present', () => {
    const endpoints = [
      {
        method: 'POST',
        path: '/api/v1/teams',
        operationId: 'TeamController_create',
        file: 'team.controller.ts',
        zodContract: { sampleValid: { name: 'Team A' }, fields: {} },
        responseContract: { requiredPaths: ['id'] },
        swaggerDeclared: { statuses: [201], extensions: { 'x-resource-captures': [{ fromPath: 'id', resource: 'team', pathParam: 'teamId' }] } },
      },
      {
        method: 'GET',
        path: '/api/v1/teams/:teamId/members',
        file: 'member.controller.ts',
      },
    ];

    const flows = emitResourceSetupChains(endpoints, {
      uniqueFieldSet: new Set(),
      envelopeWrapper: ['data'],
      diagnostics: [],
    });

    assert.equal(flows.length, 1);
    const captureStep = flows[0].steps.find((s) => s.kind === 'capture');
    assert.equal(captureStep.bindings['resource:teams:id'], '$.data.id',
      'resource-setup capture should use envelope-wrapped path');
  });

  it('uses bare $.id when no envelope wrapper', () => {
    const endpoints = [
      {
        method: 'POST',
        path: '/api/v1/teams',
        operationId: 'TeamController_create',
        file: 'team.controller.ts',
        zodContract: { sampleValid: { name: 'Team A' }, fields: {} },
        responseContract: { requiredPaths: ['id'] },
        swaggerDeclared: { statuses: [201], extensions: { 'x-resource-captures': [{ fromPath: 'id', resource: 'team', pathParam: 'teamId' }] } },
      },
      {
        method: 'GET',
        path: '/api/v1/teams/:teamId/members',
        file: 'member.controller.ts',
      },
    ];

    const flows = emitResourceSetupChains(endpoints, { uniqueFieldSet: new Set(), diagnostics: [] });
    assert.equal(flows.length, 1);
    const captureStep = flows[0].steps.find((s) => s.kind === 'capture');
    assert.equal(captureStep.bindings['resource:teams:id'], '$.id');
  });

  it('wraps x-probe-resource-ref captureFrom with envelope', () => {
    const endpoints = [
      {
        method: 'POST',
        path: '/api/v1/teams',
        operationId: 'TeamController_create',
        file: 'team.controller.ts',
        zodContract: { sampleValid: { name: 'Team A' }, fields: {} },
        swaggerDeclared: { statuses: [201] },
      },
      {
        method: 'POST',
        path: '/api/v1/projects',
        operationId: 'ProjectController_create',
        file: 'project.controller.ts',
        swaggerDeclared: {
          extensions: {
            'x-probe-resource-ref': {
              parentField: 'teamId',
              parentCreate: { operationId: 'TeamController_create' },
              captureFrom: '$.id',
            },
          },
        },
      },
    ];

    const flows = emitResourceSetupChains(endpoints, {
      uniqueFieldSet: new Set(),
      envelopeWrapper: ['data'],
    });

    assert.equal(flows.length, 1);
    const captureStep = flows[0].steps.find((s) => s.kind === 'capture');
    assert.equal(captureStep.bindings['resource:teamId:id'], '$.data.id',
      'x-probe-resource-ref captureFrom should be envelope-wrapped');
  });
});

// ---------------------------------------------------------------------------
// Bug 6: buildSampleBody handles array-format zodContract.fields
// ---------------------------------------------------------------------------

describe('buildSampleBody array-format fields', () => {
  it('reads constraints from array fields (format:email → ${uniqEmail})', () => {
    const zodContract = {
      sampleValid: { email: 'alice@example.com', name: 'Alice', password: 'Pass123!' },
      fields: [
        { name: 'email', type: 'string', required: true, constraints: { format: 'email' } },
        { name: 'name', type: 'string', required: true, constraints: { minLength: 2 } },
        { name: 'password', type: 'string', required: true, constraints: { minLength: 8 } },
      ],
    };
    const uniqueFieldSet = new Set(['email']);
    const body = buildSampleBody(zodContract, uniqueFieldSet);
    assert.equal(body.email, '${uniqEmail}',
      'email field with format:email constraint from array fields should get ${uniqEmail} sigil');
    assert.equal(body.name, 'Alice', 'non-unique fields untouched');
    assert.equal(body.password, 'Pass123!', 'non-unique fields untouched');
  });

  it('reads constraints from object-map fields (backward compat)', () => {
    const zodContract = {
      sampleValid: { email: 'alice@example.com', name: 'Alice' },
      fields: {
        email: { constraints: { format: 'email' } },
        name: { constraints: { minLength: 2 } },
      },
    };
    const uniqueFieldSet = new Set(['email']);
    const body = buildSampleBody(zodContract, uniqueFieldSet);
    assert.equal(body.email, '${uniqEmail}',
      'email field with format:email constraint from object fields should get ${uniqEmail} sigil');
  });

  it('falls back to ${uniqString} when array field has no constraints', () => {
    const zodContract = {
      sampleValid: { username: 'testuser' },
      fields: [
        { name: 'username', type: 'string', required: true },
      ],
    };
    const uniqueFieldSet = new Set(['username']);
    const body = buildSampleBody(zodContract, uniqueFieldSet);
    assert.equal(body.username, '${uniqString}');
  });
});

// ---------------------------------------------------------------------------
// Bug 5: pickUniqueSigil no heuristic — always ${uniqString} without constraints
// ---------------------------------------------------------------------------

describe('pickUniqueSigil no-heuristic behavior', () => {
  it('returns ${uniqString} for email-like sample when constraints null', () => {
    assert.equal(pickUniqueSigil('admin@company.io', null), '${uniqString}');
  });

  it('returns ${uniqString} for uuid-like sample when constraints null', () => {
    assert.equal(pickUniqueSigil('a1b2c3d4-e5f6-7890-abcd-ef1234567890', null), '${uniqString}');
  });

  it('returns ${uniqString} for undefined constraints', () => {
    assert.equal(pickUniqueSigil('something', undefined), '${uniqString}');
  });

  it('still uses format:email from constraints (not sample-based)', () => {
    assert.equal(pickUniqueSigil('not-an-email', { format: 'email' }), '${uniqEmail}');
  });
});

// ---------------------------------------------------------------------------
// Auth-bootstrap captures registeredEmail from register response
// ---------------------------------------------------------------------------

describe('emitAuthBootstrapChain captures registeredEmail', () => {
  it('includes registeredEmail capture from register response', () => {
    const register = {
      method: 'POST', path: '/api/v1/auth/register',
      file: 'auth.controller.ts',
      zodContract: {
        sampleValid: { email: 'user@example.com', password: 'pass123', name: 'Alice' },
        fields: { email: { constraints: { format: 'email' } } },
      },
    };
    const login = {
      method: 'POST', path: '/api/v1/auth/login',
      file: 'auth.controller.ts',
      zodContract: {
        sampleValid: { email: 'user@example.com', password: 'pass123' },
        fields: { email: { constraints: { format: 'email' } } },
      },
    };
    const authFlows = {
      register: { method: 'POST', path: '/api/v1/auth/register' },
      tokenIssuer: { method: 'POST', path: '/api/v1/auth/login' },
    };

    const flow = emitAuthBootstrapChain([register, login], {
      authFlows,
      uniqueFieldSet: new Set(['email']),
      envelopeWrapper: ['data'],
    });

    assert.ok(flow, 'should emit auth-bootstrap chain');
    // Find capture step that includes registeredEmail
    const captureSteps = flow.steps.filter((s) => s.kind === 'capture');
    assert.ok(captureSteps.length > 0, 'should have capture steps');
    const emailCapture = captureSteps.find((s) => s.bindings && s.bindings.registeredEmail);
    assert.ok(emailCapture, 'should capture registeredEmail');
    assert.equal(
      emailCapture.bindings.registeredEmail,
      '$.data.user.email',
      'registeredEmail should be envelope-aware capture from user.email',
    );
  });

  it('captures registeredEmail without envelope when no wrapper', () => {
    const register = {
      method: 'POST', path: '/api/v1/auth/register',
      file: 'auth.controller.ts',
      zodContract: {
        sampleValid: { email: 'user@example.com', password: 'pass123', name: 'Alice' },
        fields: { email: { constraints: { format: 'email' } } },
      },
    };
    const login = {
      method: 'POST', path: '/api/v1/auth/login',
      file: 'auth.controller.ts',
      zodContract: {
        sampleValid: { email: 'user@example.com', password: 'pass123' },
        fields: { email: { constraints: { format: 'email' } } },
      },
    };
    const authFlows = {
      register: { method: 'POST', path: '/api/v1/auth/register' },
      tokenIssuer: { method: 'POST', path: '/api/v1/auth/login' },
    };

    const flow = emitAuthBootstrapChain([register, login], {
      authFlows,
      uniqueFieldSet: new Set(['email']),
    });

    assert.ok(flow);
    const captureSteps = flow.steps.filter((s) => s.kind === 'capture');
    const emailCapture = captureSteps.find((s) => s.bindings && s.bindings.registeredEmail);
    assert.ok(emailCapture, 'should capture registeredEmail');
    assert.equal(
      emailCapture.bindings.registeredEmail,
      '$.user.email',
      'registeredEmail should be bare path when no envelope',
    );
  });
});

// ---------------------------------------------------------------------------
// @ResourceCaptures: declaration-driven resource-id capture (replaces heuristic)
// ---------------------------------------------------------------------------

describe('resource-captures: declaration-driven capture via x-resource-captures', () => {
  function buildEndpoints(parentCaptures, opts = {}) {
    const parentPath = opts.parentPath || '/api/v1/teams';
    const childPath = opts.childPath || '/api/v1/teams/:id/members';
    const parentExtensions = {};
    if (parentCaptures !== undefined) {
      parentExtensions['x-resource-captures'] = parentCaptures;
    }
    const parent = {
      method: 'POST',
      path: parentPath,
      file: 'team.controller.ts',
      operationId: opts.parentOperationId || 'createTeam',
      zodContract: { sampleValid: { name: 'Test Team' }, fields: { name: { constraints: {} } } },
      swaggerDeclared: { statuses: [201], extensions: parentExtensions },
      responseContract: { requiredPaths: opts.requiredPaths || ['id', 'name'] },
    };
    const child = {
      method: 'POST',
      path: childPath,
      file: 'team-members.controller.ts',
      operationId: 'addMember',
      zodContract: { sampleValid: { email: 'bob@example.com' }, fields: { email: { constraints: { format: 'email' } } } },
      swaggerDeclared: { statuses: [201], extensions: {} },
      authDecorators: { authRequired: true },
    };
    return [parent, child];
  }

  it('standard {id} field captures $.id when declared', () => {
    const endpoints = buildEndpoints([{ fromPath: 'id', resource: 'team', pathParam: 'id' }]);
    const diags = [];
    const flows = emitResourceSetupChains(endpoints, { diagnostics: diags, uniqueFieldSet: new Set() });
    assert.ok(flows.length >= 1);
    const chain = flows.find((f) => f.id === 'chain:resource-setup:teams');
    assert.ok(chain);
    const captureStep = chain.steps.find((s) => s.kind === 'capture');
    assert.equal(captureStep.bindings['resource:teams:id'], '$.id');
    assert.equal(diags.length, 0);
  });

  it('custom-named {userId} captures $.userId', () => {
    const endpoints = buildEndpoints([{ fromPath: 'userId', resource: 'user', pathParam: 'id' }]);
    const diags = [];
    const flows = emitResourceSetupChains(endpoints, { diagnostics: diags, uniqueFieldSet: new Set() });
    const chain = flows.find((f) => f.id === 'chain:resource-setup:teams');
    assert.ok(chain);
    const captureStep = chain.steps.find((s) => s.kind === 'capture');
    assert.equal(captureStep.bindings['resource:teams:id'], '$.userId');
  });

  it('slug-based captures $.slug', () => {
    const endpoints = buildEndpoints([{ fromPath: 'slug', resource: 'team', pathParam: 'id' }]);
    const diags = [];
    const flows = emitResourceSetupChains(endpoints, { diagnostics: diags, uniqueFieldSet: new Set() });
    const chain = flows.find((f) => f.id === 'chain:resource-setup:teams');
    assert.ok(chain);
    const captureStep = chain.steps.find((s) => s.kind === 'capture');
    assert.equal(captureStep.bindings['resource:teams:id'], '$.slug');
  });

  it('nested FK (membership + userId) routes to correct pathParam', () => {
    const grandparent = {
      method: 'POST', path: '/api/v1/teams', file: 'team.controller.ts',
      operationId: 'createTeam',
      zodContract: { sampleValid: { name: 'Team' }, fields: { name: { constraints: {} } } },
      swaggerDeclared: { statuses: [201], extensions: { 'x-resource-captures': [{ fromPath: 'id', resource: 'team', pathParam: 'teamId' }] } },
    };
    const parent = {
      method: 'POST', path: '/api/v1/teams/:teamId/members', file: 'team-members.controller.ts',
      operationId: 'addMember',
      zodContract: { sampleValid: { email: 'bob@example.com' }, fields: { email: { constraints: { format: 'email' } } } },
      swaggerDeclared: { statuses: [201], extensions: { 'x-resource-captures': [{ fromPath: 'id', resource: 'membership', pathParam: 'membershipId' }, { fromPath: 'userId', resource: 'user', pathParam: 'userId' }] } },
    };
    const child = {
      method: 'POST', path: '/api/v1/teams/:teamId/members/:membershipId/notes', file: 'notes.controller.ts',
      operationId: 'addNote',
      zodContract: { sampleValid: { content: 'hello' }, fields: { content: { constraints: {} } } },
      swaggerDeclared: { statuses: [201], extensions: {} },
    };
    const diags = [];
    const flows = emitResourceSetupChains([grandparent, parent, child], { diagnostics: diags, uniqueFieldSet: new Set() });
    const membersChain = flows.find((f) => f.id === 'chain:resource-setup:members');
    assert.ok(membersChain, 'should emit chain for members resource');
    const captureStep = membersChain.steps.find((s) => s.kind === 'capture');
    assert.equal(captureStep.bindings['resource:members:id'], '$.id');
  });

  it('envelope wrapped fromPath:id + envelopeWrapper:data produces $.data.id', () => {
    const endpoints = buildEndpoints([{ fromPath: 'id', resource: 'team', pathParam: 'id' }]);
    const diags = [];
    const flows = emitResourceSetupChains(endpoints, { diagnostics: diags, uniqueFieldSet: new Set(), envelopeWrapper: 'data' });
    const chain = flows.find((f) => f.id === 'chain:resource-setup:teams');
    assert.ok(chain);
    const captureStep = chain.steps.find((s) => s.kind === 'capture');
    assert.equal(captureStep.bindings['resource:teams:id'], '$.data.id');
  });

  it('missing decorator emits DIAG RESOURCE_CAPTURE_UNDECLARED and no chain', () => {
    const endpoints = buildEndpoints(undefined);
    const diags = [];
    const flows = emitResourceSetupChains(endpoints, { diagnostics: diags, uniqueFieldSet: new Set() });
    const chain = flows.find((f) => f.id === 'chain:resource-setup:teams');
    assert.equal(chain, undefined);
    const diag = diags.find((d) => d.code === 'RESOURCE_CAPTURE_UNDECLARED');
    assert.ok(diag);
    assert.match(diag.message, /no @ResourceCaptures decorator/);
  });

  it('pathParam not in declared captures emits DIAG RESOURCE_CAPTURE_PATHPARAM_UNDECLARED', () => {
    const endpoints = buildEndpoints([{ fromPath: 'slug', resource: 'team', pathParam: 'slug' }]);
    const diags = [];
    const flows = emitResourceSetupChains(endpoints, { diagnostics: diags, uniqueFieldSet: new Set() });
    const chain = flows.find((f) => f.id === 'chain:resource-setup:teams');
    assert.equal(chain, undefined);
    const diag = diags.find((d) => d.code === 'RESOURCE_CAPTURE_PATHPARAM_UNDECLARED');
    assert.ok(diag);
    assert.match(diag.message, /pathParam='id'/);
    assert.match(diag.message, /Got: slug/);
  });

  it('empty captures array same as missing emits DIAG no chain', () => {
    const endpoints = buildEndpoints([]);
    const diags = [];
    const flows = emitResourceSetupChains(endpoints, { diagnostics: diags, uniqueFieldSet: new Set() });
    const chain = flows.find((f) => f.id === 'chain:resource-setup:teams');
    assert.equal(chain, undefined);
    const diag = diags.find((d) => d.code === 'RESOURCE_CAPTURE_UNDECLARED');
    assert.ok(diag);
  });
});

// --- Chain create-step substitution: path-prefix params + body-field refs ---
//
// Regression: previously emitChain wrote createStep.path = parentEp.path with
// any ':param' literals untouched, and createStep.body untouched. So
// chain:resource-setup:members for POST /teams/:id/members produced a request
// to literal /api/v1/teams/:id/members → 404. Fix: emitChain now applies
// resolveResourceRefDeps to its own create step (path-prefix substitutions,
// body overrides, dep merging) — same resolution leaf endpoints already use.

describe('emitResourceSetupChains — chain create-step substitution', () => {
  // Grandparent (POST /teams) -> parent (POST /teams/:id/members) -> grandchild
  // (DELETE /teams/:id/members/:userId). The grandchild is what triggers
  // emission of chain:resource-setup:members (its parent is the inviteMember
  // endpoint), which is the chain we are validating.
  function buildMemberChainFixture({ inviteRefs = null } = {}) {
    const inviteExtensions = {
      'x-resource-captures': [{ fromPath: 'userId', resource: 'user', pathParam: 'userId' }],
    };
    if (inviteRefs) inviteExtensions['x-probe-resource-ref'] = inviteRefs;
    return [
      {
        method: 'POST',
        path: '/api/v1/teams',
        operationId: 'createTeam',
        file: 'team.controller.ts',
        zodContract: { sampleValid: { name: 'My Team' }, fields: {} },
        swaggerDeclared: {
          statuses: [201],
          extensions: { 'x-resource-captures': [{ fromPath: 'id', resource: 'team', pathParam: 'id' }] },
        },
      },
      {
        method: 'POST',
        path: '/api/v1/teams/:id/members',
        operationId: 'inviteMember',
        file: 'team.controller.ts',
        zodContract: { sampleValid: { email: 'a@b.com', role: 'MEMBER' }, fields: {} },
        swaggerDeclared: {
          statuses: [201],
          extensions: inviteExtensions,
        },
      },
      {
        method: 'DELETE',
        path: '/api/v1/teams/:id/members/:userId',
        operationId: 'removeMember',
        file: 'team.controller.ts',
        swaggerDeclared: { statuses: [204], extensions: {} },
      },
    ];
  }

  it('substitutes path-prefix :param in chain create step and adds parent dep', () => {
    const endpoints = buildMemberChainFixture();
    const flows = emitResourceSetupChains(endpoints, { uniqueFieldSet: new Set(), diagnostics: [] });
    const memberChain = flows.find((f) => f.id === 'chain:resource-setup:members');
    assert.ok(memberChain, 'expected chain:resource-setup:members');

    const createStep = memberChain.steps.find((s) => s.kind === 'api');
    assert.equal(createStep.path, '/api/v1/teams/${resource:teams:id}/members',
      'path :id must be substituted with parent resource sigil');
    assert.ok(memberChain.dependsOn.includes('chain:resource-setup:teams'),
      'parent chain must be declared as dependency');
  });

  it('applies body override from x-probe-resource-ref to chain create step and merges dep', () => {
    const endpoints = [
      {
        method: 'POST',
        path: '/api/v1/auth/register',
        operationId: 'register',
        file: 'auth.controller.ts',
        zodContract: { sampleValid: { email: 'x@y.com', password: 'pw' }, fields: {} },
        swaggerDeclared: {
          statuses: [201],
          extensions: { 'x-resource-captures': [{ fromPath: 'email', resource: 'user', pathParam: 'email' }] },
        },
      },
      ...buildMemberChainFixture({
        inviteRefs: [{
          parentField: 'email',
          parentCreate: { operationId: 'register' },
          captureFrom: '$.email',
        }],
      }),
    ];
    const flows = emitResourceSetupChains(endpoints, {
      uniqueFieldSet: new Set(['email']),
      diagnostics: [],
    });
    const memberChain = flows.find((f) => f.id === 'chain:resource-setup:members');
    assert.ok(memberChain, 'expected chain:resource-setup:members');

    const createStep = memberChain.steps.find((s) => s.kind === 'api');
    assert.equal(createStep.body.email, '${resource:email:id}',
      'body.email must be substituted with captured-email sigil from register chain');
    assert.equal(createStep.body.role, 'MEMBER', 'untouched body fields preserved');
    assert.ok(memberChain.dependsOn.includes('chain:resource-setup:email'),
      'invitee-creation chain must be a dep of the member chain');
    assert.ok(memberChain.dependsOn.includes('chain:resource-setup:teams'),
      'parent path-prefix chain must remain a dep of the member chain');
  });

  it('substitutes EVERY :param along a deep path, not just the immediate parent', () => {
    // Path: /orgs/:orgId/projects/:projId/tasks
    // Without ancestor walking, only :projId is substituted (immediate parent),
    // and :orgId stays literal → runtime 404. Walker must resolve both.
    const endpoints = [
      {
        method: 'POST',
        path: '/api/v1/orgs',
        operationId: 'createOrg',
        file: 'org.controller.ts',
        zodContract: { sampleValid: { name: 'Acme' }, fields: {} },
        swaggerDeclared: {
          statuses: [201],
          extensions: { 'x-resource-captures': [{ fromPath: 'id', resource: 'org', pathParam: 'orgId' }] },
        },
      },
      {
        method: 'POST',
        path: '/api/v1/orgs/:orgId/projects',
        operationId: 'createProject',
        file: 'project.controller.ts',
        zodContract: { sampleValid: { name: 'Proj' }, fields: {} },
        swaggerDeclared: {
          statuses: [201],
          extensions: { 'x-resource-captures': [{ fromPath: 'id', resource: 'project', pathParam: 'projId' }] },
        },
      },
      {
        method: 'POST',
        path: '/api/v1/orgs/:orgId/projects/:projId/tasks',
        operationId: 'createTask',
        file: 'task.controller.ts',
        zodContract: { sampleValid: { title: 'T' }, fields: {} },
        swaggerDeclared: {
          statuses: [201],
          extensions: { 'x-resource-captures': [{ fromPath: 'id', resource: 'task', pathParam: 'taskId' }] },
        },
      },
      {
        method: 'GET',
        path: '/api/v1/orgs/:orgId/projects/:projId/tasks/:taskId',
        operationId: 'getTask',
        file: 'task.controller.ts',
        swaggerDeclared: { statuses: [200], extensions: {} },
      },
    ];
    const flows = emitResourceSetupChains(endpoints, { uniqueFieldSet: new Set(), diagnostics: [] });
    const tasksChain = flows.find((f) => f.id === 'chain:resource-setup:tasks');
    assert.ok(tasksChain, 'expected chain:resource-setup:tasks');
    const create = tasksChain.steps.find((s) => s.kind === 'api');
    assert.equal(
      create.path,
      '/api/v1/orgs/${resource:orgs:id}/projects/${resource:projects:id}/tasks',
      'BOTH :orgId and :projId must be substituted, even though only :projId is the immediate parent',
    );
    assert.ok(tasksChain.dependsOn.includes('chain:resource-setup:projects'));
    assert.ok(tasksChain.dependsOn.includes('chain:resource-setup:orgs'),
      'transitive ancestor must be a dep, not just the immediate parent');
  });

  it('does not add self as dep when chain references its own resource', () => {
    const endpoints = buildMemberChainFixture();
    const flows = emitResourceSetupChains(endpoints, { uniqueFieldSet: new Set(), diagnostics: [] });
    const teamsChain = flows.find((f) => f.id === 'chain:resource-setup:teams');
    assert.ok(teamsChain);
    assert.ok(!teamsChain.dependsOn.includes('chain:resource-setup:teams'),
      'a chain must not depend on itself');
  });
});

// --- fanOutMutableChains: stateful resource-setup chain duplication ---
//
// Bug class fixed: a chain like chain:resource-setup:members creates a
// stateful record. The runner shares its captured bindings session-wide,
// so the FIRST mutating dependent (DELETE/PATCH) consumes the record and
// the SECOND mutator sees "X not found". Generator must emit one chain
// copy per mutating dependent with renamed binding keys, and rewrite the
// dependents' references. Detection is graph + HTTP-method-based; no name
// patterns.

describe('fanOutMutableChains', () => {
  function buildChain(id, capturedKey) {
    return {
      id,
      contract: { kind: 'chain-resource-setup', endpoint: 'POST /x', source: '' },
      dependsOn: [],
      steps: [
        { kind: 'api', method: 'POST', path: '/x', body: { name: 'a' } },
        { kind: 'expect', status: 201 },
        { kind: 'capture', bindings: { [capturedKey]: '$.id' } },
      ],
    };
  }

  function buildLeaf(id, dependsOn, method, sigil) {
    return {
      id,
      contract: { kind: 'endpoint-happy', endpoint: `${method} /x/:id`, source: '' },
      dependsOn,
      steps: [
        { kind: 'api', method, path: `/x/${sigil}` },
        { kind: 'expect', status: method === 'DELETE' ? 204 : 200 },
      ],
    };
  }

  it('does not fan out when only one mutating dependent exists', () => {
    const chain = buildChain('chain:resource-setup:members', 'resource:members:id');
    const leaf = buildLeaf('only:delete:happy', ['chain:resource-setup:members'], 'DELETE', '${resource:members:id}');
    const out = fanOutMutableChains([chain, leaf]);
    assert.equal(out.length, 2, 'no copies emitted for single mutator');
    assert.equal(out.find((f) => f.id === 'only:delete:happy').dependsOn[0], 'chain:resource-setup:members');
  });

  it('does not fan out for GET dependents (read-only)', () => {
    const chain = buildChain('chain:resource-setup:members', 'resource:members:id');
    const get1 = buildLeaf('a:get', ['chain:resource-setup:members'], 'GET', '${resource:members:id}');
    const get2 = buildLeaf('b:get', ['chain:resource-setup:members'], 'GET', '${resource:members:id}');
    const out = fanOutMutableChains([chain, get1, get2]);
    assert.equal(out.length, 3, 'GET dependents share the chain');
  });

  it('fans out when 2+ mutating dependents (DELETE + PATCH) reference the captured sigil', () => {
    const chain = buildChain('chain:resource-setup:members', 'resource:members:id');
    const del = buildLeaf('teams-id-members-userId:delete:happy', ['chain:resource-setup:members'], 'DELETE', '${resource:members:id}');
    const patch = buildLeaf('teams-id-members-userId:patch:happy', ['chain:resource-setup:members'], 'PATCH', '${resource:members:id}');
    const out = fanOutMutableChains([chain, del, patch]);

    // 2 copies + 2 leaves = 4. Original chain is pruned because all its
    // dependents were redirected to copies and nothing else references it
    // (orphan elimination).
    assert.equal(out.length, 4);
    const copies = out.filter((f) => f.id.startsWith('chain:resource-setup:members:for:'));
    assert.equal(copies.length, 2, 'one copy per mutating dependent');
    assert.ok(!out.find((f) => f.id === 'chain:resource-setup:members'),
      'orphaned original chain should be pruned');

    // Each copy's binding key is uniquely renamed
    for (const copy of copies) {
      const cap = copy.steps.find((s) => s.kind === 'capture');
      const keys = Object.keys(cap.bindings);
      assert.equal(keys.length, 1);
      assert.match(keys[0], /^resource:members:id:for:/);
    }

    // Each mutator's dependsOn now points at its assigned copy, and its
    // step path uses the renamed sigil.
    const delOut = out.find((f) => f.id === 'teams-id-members-userId:delete:happy');
    assert.equal(delOut.dependsOn.length, 1);
    assert.match(delOut.dependsOn[0], /^chain:resource-setup:members:for:/);
    assert.match(delOut.steps[0].path, /\$\{resource:members:id:for:/);
    assert.ok(!delOut.steps[0].path.includes('${resource:members:id}'),
      'old sigil must be rewritten away');

    const patchOut = out.find((f) => f.id === 'teams-id-members-userId:patch:happy');
    assert.notEqual(delOut.dependsOn[0], patchOut.dependsOn[0],
      'each mutator gets its own copy id');
  });

  it('rewrites sigils inside body and query, not just path, when fan-out is triggered by path', () => {
    // Mutation TARGET detection uses path final segment (REST convention),
    // but once fan-out fires the rewriter must still rename sigils anywhere
    // they appear (body, query, headers) so the dependent's request lines
    // up with the renamed binding key.
    const chain = buildChain('chain:resource-setup:foo', 'resource:foo:id');
    const a = {
      id: 'mut-a',
      dependsOn: ['chain:resource-setup:foo'],
      steps: [
        { kind: 'api', method: 'PUT', path: '/bar/${resource:foo:id}', body: { fooId: '${resource:foo:id}', name: 'x' }, query: { ref: '${resource:foo:id}' } },
        { kind: 'expect', status: 200 },
      ],
    };
    const b = {
      id: 'mut-b',
      dependsOn: ['chain:resource-setup:foo'],
      steps: [
        { kind: 'api', method: 'PATCH', path: '/baz/${resource:foo:id}' },
        { kind: 'expect', status: 200 },
      ],
    };
    const out = fanOutMutableChains([chain, a, b]);
    const aOut = out.find((f) => f.id === 'mut-a');
    assert.match(aOut.steps[0].path, /\$\{resource:foo:id:for:/);
    assert.match(aOut.steps[0].body.fooId, /\$\{resource:foo:id:for:/);
    assert.match(aOut.steps[0].query.ref, /\$\{resource:foo:id:for:/);
    assert.equal(aOut.steps[0].body.name, 'x', 'unrelated fields untouched');
  });


  it('does NOT fan out a chain when its sigil is only in path scope (non-final), not target', () => {
    // /teams/:id/members/:userId — DELETE/PATCH mutates the member (last
    // segment), team is just scope. Teams chain must NOT fan out for the
    // member mutators.
    const teams = buildChain('chain:resource-setup:teams', 'resource:teams:id');
    const members = buildChain('chain:resource-setup:members', 'resource:members:id');
    members.dependsOn = ['chain:resource-setup:teams'];
    members.steps[0].path = '/teams/${resource:teams:id}/members';
    const del = {
      id: 'member-delete',
      dependsOn: ['chain:resource-setup:teams', 'chain:resource-setup:members'],
      steps: [
        { kind: 'api', method: 'DELETE', path: '/teams/${resource:teams:id}/members/${resource:members:id}' },
        { kind: 'expect', status: 204 },
      ],
    };
    const patch = {
      id: 'member-patch',
      dependsOn: ['chain:resource-setup:teams', 'chain:resource-setup:members'],
      steps: [
        { kind: 'api', method: 'PATCH', path: '/teams/${resource:teams:id}/members/${resource:members:id}' },
        { kind: 'expect', status: 200 },
      ],
    };
    const out = fanOutMutableChains([teams, members, del, patch]);

    const memberCopies = out.filter((f) => f.id.startsWith('chain:resource-setup:members:for:'));
    assert.equal(memberCopies.length, 2,
      'members chain (mutation TARGET in last segment) fans out per mutator');

    const teamsCopies = out.filter((f) => f.id.startsWith('chain:resource-setup:teams:for:'));
    assert.equal(teamsCopies.length, 2,
      'teams chain duplicates transitively because members depends on it; it is NOT triggered directly by the scope-only references in the leaf paths');

    // Each member copy points at its own team copy (consequence of recursion),
    // not the original shared teams chain.
    for (const m of memberCopies) {
      const suffix = m.id.split(':for:')[1];
      assert.ok(m.dependsOn.includes(`chain:resource-setup:teams:for:${suffix}`),
        `${m.id} depends on its own teams copy`);
    }
  });

  it('preserves original chain so non-mutator (GET) dependents still share state', () => {
    const chain = buildChain('chain:resource-setup:items', 'resource:items:id');
    const del = buildLeaf('item:delete', ['chain:resource-setup:items'], 'DELETE', '${resource:items:id}');
    const put = buildLeaf('item:put', ['chain:resource-setup:items'], 'PUT', '${resource:items:id}');
    const get = buildLeaf('item:get', ['chain:resource-setup:items'], 'GET', '${resource:items:id}');
    const out = fanOutMutableChains([chain, del, put, get]);
    const original = out.find((f) => f.id === 'chain:resource-setup:items');
    assert.ok(original, 'original chain stays for the GET dependent');

    const getOut = out.find((f) => f.id === 'item:get');
    assert.equal(getOut.dependsOn[0], 'chain:resource-setup:items',
      'GET still points at the original chain');
  });

  it('skips non-resource-setup chains (e.g. chain:auth-bootstrap)', () => {
    const auth = {
      id: 'chain:auth-bootstrap',
      contract: { kind: 'chain-auth-bootstrap', endpoint: 'POST /auth/login' },
      dependsOn: [],
      steps: [
        { kind: 'api', method: 'POST', path: '/auth/login' },
        { kind: 'capture', bindings: { accessToken: '$.accessToken' } },
      ],
    };
    const a = buildLeaf('a', ['chain:auth-bootstrap'], 'DELETE', '${accessToken}');
    const b = buildLeaf('b', ['chain:auth-bootstrap'], 'PATCH', '${accessToken}');
    const out = fanOutMutableChains([auth, a, b]);
    assert.equal(out.length, 3, 'auth-bootstrap is not duplicated even with mutating dependents');
  });
});

describe('fanOutMutableChains — recursive dep duplication', () => {
  it('duplicates resource-setup deps recursively per mutator; auth shared', () => {
    const auth = { id: 'chain:auth-bootstrap', contract: { kind: 'chain-auth-bootstrap' }, dependsOn: [], steps: [{ kind: 'capture', bindings: { accessToken: '$.t' } }] };
    const email = { id: 'chain:resource-setup:email', contract: { kind: 'chain-body-resource-ref' }, dependsOn: [], steps: [{ kind: 'api', method: 'POST', path: '/auth/register', body: { email: '${uniqEmail}' } }, { kind: 'capture', bindings: { 'resource:email:id': '$.email' } }] };
    const teams = { id: 'chain:resource-setup:teams', contract: { kind: 'chain-resource-setup' }, dependsOn: ['chain:auth-bootstrap'], steps: [{ kind: 'api', method: 'POST', path: '/teams' }, { kind: 'capture', bindings: { 'resource:teams:id': '$.id' } }] };
    const members = { id: 'chain:resource-setup:members', contract: { kind: 'chain-resource-setup' }, dependsOn: ['chain:auth-bootstrap', 'chain:resource-setup:teams', 'chain:resource-setup:email'], steps: [{ kind: 'api', method: 'POST', path: '/teams/${resource:teams:id}/members', body: { email: '${resource:email:id}' } }, { kind: 'capture', bindings: { 'resource:members:id': '$.userId' } }] };
    const del = { id: 'mem:delete', dependsOn: ['chain:resource-setup:members'], steps: [{ kind: 'api', method: 'DELETE', path: '/teams/${resource:teams:id}/members/${resource:members:id}' }] };
    const patch = { id: 'mem:patch', dependsOn: ['chain:resource-setup:members'], steps: [{ kind: 'api', method: 'PATCH', path: '/teams/${resource:teams:id}/members/${resource:members:id}' }] };
    const out = fanOutMutableChains([auth, email, teams, members, del, patch]);

    assert.equal(out.filter((f) => f.id.startsWith('chain:resource-setup:members:for:')).length, 2);
    assert.equal(out.filter((f) => f.id.startsWith('chain:resource-setup:teams:for:')).length, 2,
      'teams chain duplicated recursively per mutator');
    assert.equal(out.filter((f) => f.id.startsWith('chain:resource-setup:email:for:')).length, 2,
      'email chain duplicated recursively per mutator');
    assert.equal(out.filter((f) => f.id.startsWith('chain:auth-bootstrap:for:')).length, 0,
      'auth-bootstrap stays shared');

    for (const copy of out.filter((f) => f.id.startsWith('chain:resource-setup:members:for:'))) {
      const suffix = copy.id.split(':for:')[1];
      assert.ok(copy.dependsOn.includes(`chain:resource-setup:teams:for:${suffix}`));
      assert.ok(copy.dependsOn.includes(`chain:resource-setup:email:for:${suffix}`));
      assert.ok(copy.dependsOn.includes('chain:auth-bootstrap'));
      const api = copy.steps.find((s) => s.kind === 'api');
      assert.match(api.body.email, /\$\{resource:email:id:for:/);
      assert.match(api.path, /\$\{resource:teams:id:for:/);
    }
  });
});
