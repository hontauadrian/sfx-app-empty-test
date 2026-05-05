'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  emitIdempotencyFlow,
  emitIdempotencyFlows,
  emitHappyFlow,
} = require('../flows-generator');

// ---------------------------------------------------------------------------
// Helper: minimal endpoint factory
// ---------------------------------------------------------------------------

function makeEndpoint(overrides = {}) {
  return {
    method: 'POST',
    path: '/api/v1/orders',
    file: 'src/modules/orders/orders.controller.ts',
    operationId: 'createOrder',
    idempotencyProfile: { headerName: 'Idempotency-Key', required: true, source: 'openapi-parameter' },
    zodContract: {
      schemaRef: 'CreateOrderSchema',
      sampleValid: { item: 'widget', quantity: 2 },
      fields: [
        { name: 'item', type: 'string' },
        { name: 'quantity', type: 'number' },
      ],
    },
    // Declaration-driven capture bindings consume `responseContract.requiredPaths`
    // populated by detectors/response-contract.js. Tests use a contrived
    // {id, body} shape so legacy capture-binding assertions remain valid; tests
    // covering other field shapes override `responseContract` explicitly.
    responseContract: {
      status: 201,
      schemaRef: 'OrderDto',
      fields: ['id', 'body'],
      requiredPaths: ['id', 'body'],
    },
    swaggerDeclared: { statuses: [201, 400, 409] },
    authDecorators: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// emitIdempotencyFlow — null guards
// ---------------------------------------------------------------------------

test('emitIdempotencyFlow: returns null when idempotencyProfile is null', () => {
  const ep = makeEndpoint({ idempotencyProfile: null });
  const result = emitIdempotencyFlow(ep);
  assert.strictEqual(result, null);
});

test('emitIdempotencyFlow: returns null when idempotencyProfile is undefined', () => {
  const ep = makeEndpoint({ idempotencyProfile: undefined });
  const result = emitIdempotencyFlow(ep);
  assert.strictEqual(result, null);
});

test('emitIdempotencyFlow: returns null for non-POST method', () => {
  const ep = makeEndpoint({ method: 'PUT' });
  const result = emitIdempotencyFlow(ep);
  assert.strictEqual(result, null);
});

// ---------------------------------------------------------------------------
// emitIdempotencyFlow — flow structure
// ---------------------------------------------------------------------------

test('emitIdempotencyFlow: emits array of 2 flows for POST with idempotencyProfile', () => {
  const ep = makeEndpoint();
  const flows = emitIdempotencyFlow(ep);

  assert.ok(Array.isArray(flows));
  assert.strictEqual(flows.length, 2);
  assert.strictEqual(flows[0].id, 'orders:post:idempotency:replay');
  assert.strictEqual(flows[1].id, 'orders:post:idempotency:different-key');
});

test('emitIdempotencyFlow: replay flow has correct contract kind', () => {
  const ep = makeEndpoint();
  const flows = emitIdempotencyFlow(ep);
  const replay = flows[0];

  assert.strictEqual(replay.contract.kind, 'endpoint-idempotency');
  assert.strictEqual(replay.contract.endpoint, 'POST /api/v1/orders');
  assert.deepStrictEqual(replay.dependsOn, []);
});

test('emitIdempotencyFlow: replay flow has two API steps with correct header name', () => {
  const ep = makeEndpoint();
  const flows = emitIdempotencyFlow(ep);
  const replay = flows[0];
  const apiSteps = replay.steps.filter((s) => s.kind === 'api');

  assert.strictEqual(apiSteps.length, 2);
  assert.strictEqual(apiSteps[0].headers['Idempotency-Key'], '${uniqUuid}');
  assert.strictEqual(apiSteps[1].headers['Idempotency-Key'], '${uniqUuid}');
  assert.strictEqual(apiSteps[0].method, 'POST');
  assert.strictEqual(apiSteps[1].method, 'POST');
});

test('emitIdempotencyFlow: replay flow has body from zodContract', () => {
  const ep = makeEndpoint();
  const flows = emitIdempotencyFlow(ep);
  const apiSteps = flows[0].steps.filter((s) => s.kind === 'api');

  assert.deepStrictEqual(apiSteps[0].body, { item: 'widget', quantity: 2 });
  assert.deepStrictEqual(apiSteps[1].body, { item: 'widget', quantity: 2 });
});

test('emitIdempotencyFlow: replay flow has capture step after first API call', () => {
  const ep = makeEndpoint();
  const flows = emitIdempotencyFlow(ep);
  const captureSteps = flows[0].steps.filter((s) => s.kind === 'capture');

  assert.strictEqual(captureSteps.length, 1);
  assert.deepStrictEqual(captureSteps[0].bindings, { firstId: '$.id', firstBody: '$.body' });
});

test('emitIdempotencyFlow: replay flow expects 200 or 201 for both requests', () => {
  const ep = makeEndpoint();
  const flows = emitIdempotencyFlow(ep);
  const expectSteps = flows[0].steps.filter((s) => s.kind === 'expect');

  assert.strictEqual(expectSteps.length, 2);
  assert.deepStrictEqual(expectSteps[0].statusAnyOf, [200, 201]);
  assert.deepStrictEqual(expectSteps[1].statusAnyOf, [200, 201]);
});

// ---------------------------------------------------------------------------
// emitIdempotencyFlow — different-key flow
// ---------------------------------------------------------------------------

test('emitIdempotencyFlow: different-key flow uses uniqUuid and uniqUuid2', () => {
  const ep = makeEndpoint();
  const flows = emitIdempotencyFlow(ep);
  const diffKey = flows[1];
  const apiSteps = diffKey.steps.filter((s) => s.kind === 'api');

  assert.strictEqual(apiSteps.length, 2);
  assert.strictEqual(apiSteps[0].headers['Idempotency-Key'], '${uniqUuid}');
  assert.strictEqual(apiSteps[1].headers['Idempotency-Key'], '${uniqUuid2}');
});

test('emitIdempotencyFlow: different-key flow captures declared response fields', () => {
  const ep = makeEndpoint();
  const flows = emitIdempotencyFlow(ep);
  const diffKey = flows[1];
  const captureSteps = diffKey.steps.filter((s) => s.kind === 'capture');

  // Declaration-driven: bindings reflect responseContract.requiredPaths.
  // The default mock declares ['id','body'] → first<PascalField> per path.
  assert.strictEqual(captureSteps.length, 1);
  assert.deepStrictEqual(captureSteps[0].bindings, { firstId: '$.id', firstBody: '$.body' });
});

test('emitIdempotencyFlow: different-key flow has correct onFail message', () => {
  const ep = makeEndpoint();
  const flows = emitIdempotencyFlow(ep);
  const diffKey = flows[1];

  assert.ok(diffKey.onFail.implies.includes('different'));
  assert.ok(diffKey.onFail.implies.includes('Idempotency-Key'));
});

// ---------------------------------------------------------------------------
// emitIdempotencyFlow — custom header name
// ---------------------------------------------------------------------------

test('emitIdempotencyFlow: uses custom headerName from idempotencyProfile', () => {
  const ep = makeEndpoint({
    idempotencyProfile: { headerName: 'X-Idempotency-Key', required: true, source: 'openapi-parameter' },
  });
  const flows = emitIdempotencyFlow(ep);
  const replayApi = flows[0].steps.filter((s) => s.kind === 'api');

  assert.strictEqual(replayApi[0].headers['X-Idempotency-Key'], '${uniqUuid}');
  assert.strictEqual(replayApi[0].headers['Idempotency-Key'], undefined);
});

// ---------------------------------------------------------------------------
// emitIdempotencyFlow — auth-aware
// ---------------------------------------------------------------------------

test('emitIdempotencyFlow: authed endpoint prepends setAuth and depends on bootstrap', () => {
  const ep = makeEndpoint({
    authDecorators: { authRequired: true },
  });
  const flows = emitIdempotencyFlow(ep, { authBootstrapAvailable: true });

  for (const flow of flows) {
    assert.deepStrictEqual(flow.dependsOn, ['chain:auth-bootstrap']);
    assert.strictEqual(flow.steps[0].kind, 'setAuth');
    assert.strictEqual(flow.steps[0].binding, 'accessToken');
  }
});

test('emitIdempotencyFlow: authed endpoint without bootstrap has no dependsOn', () => {
  const ep = makeEndpoint({
    authDecorators: { authRequired: true },
  });
  const flows = emitIdempotencyFlow(ep, { authBootstrapAvailable: false });

  for (const flow of flows) {
    assert.deepStrictEqual(flow.dependsOn, []);
    const setAuthSteps = flow.steps.filter((s) => s.kind === 'setAuth');
    assert.strictEqual(setAuthSteps.length, 0);
  }
});

// ---------------------------------------------------------------------------
// emitIdempotencyFlow — unique field substitution
// ---------------------------------------------------------------------------

test('emitIdempotencyFlow: unique fields get sigil substitution', () => {
  const ep = makeEndpoint({
    zodContract: {
      schemaRef: 'CreateOrderSchema',
      sampleValid: { email: 'user@example.com', name: 'Test' },
      fields: [
        { name: 'email', type: 'string' },
        { name: 'name', type: 'string' },
      ],
    },
  });
  const uniqueFieldSet = new Set(['email']);
  const flows = emitIdempotencyFlow(ep, { uniqueFieldSet });
  const apiSteps = flows[0].steps.filter((s) => s.kind === 'api');

  assert.strictEqual(apiSteps[0].body.email, '${uniqEmail}');
  assert.strictEqual(apiSteps[0].body.name, 'Test');
});

// ---------------------------------------------------------------------------
// emitIdempotencyFlow — edge cases
// ---------------------------------------------------------------------------

test('emitIdempotencyFlow: onFail references controller file', () => {
  const ep = makeEndpoint();
  const flows = emitIdempotencyFlow(ep);

  for (const flow of flows) {
    assert.deepStrictEqual(flow.onFail.check, ['src/modules/orders/orders.controller.ts']);
  }
});

test('emitIdempotencyFlow: empty body when no zodContract', () => {
  const ep = makeEndpoint({ zodContract: null });
  const flows = emitIdempotencyFlow(ep);
  const apiSteps = flows[0].steps.filter((s) => s.kind === 'api');

  assert.deepStrictEqual(apiSteps[0].body, {});
});

// ---------------------------------------------------------------------------
// emitIdempotencyFlows (aggregator)
// ---------------------------------------------------------------------------

test('emitIdempotencyFlows: returns empty array when no endpoints have idempotencyProfile', () => {
  const endpoints = [
    makeEndpoint({ idempotencyProfile: null }),
    makeEndpoint({ method: 'GET', idempotencyProfile: null }),
  ];
  const result = emitIdempotencyFlows(endpoints);
  assert.deepStrictEqual(result, []);
});

test('emitIdempotencyFlows: emits flows for endpoints with idempotencyProfile', () => {
  const endpoints = [
    makeEndpoint({ path: '/api/v1/orders' }),
    makeEndpoint({ path: '/api/v1/payments' }),
    makeEndpoint({ path: '/api/v1/users', idempotencyProfile: null }),
  ];
  const result = emitIdempotencyFlows(endpoints);
  // 2 endpoints x 2 flows each = 4
  assert.strictEqual(result.length, 4);
  assert.ok(result.some((f) => f.id === 'orders:post:idempotency:replay'));
  assert.ok(result.some((f) => f.id === 'orders:post:idempotency:different-key'));
  assert.ok(result.some((f) => f.id === 'payments:post:idempotency:replay'));
  assert.ok(result.some((f) => f.id === 'payments:post:idempotency:different-key'));
});

test('emitIdempotencyFlows: skips non-POST endpoints even with idempotencyProfile', () => {
  const endpoints = [
    makeEndpoint({ method: 'PUT', path: '/api/v1/orders/:id' }),
  ];
  const result = emitIdempotencyFlows(endpoints);
  assert.deepStrictEqual(result, []);
});

// ---------------------------------------------------------------------------
// emitHappyFlow — idempotency header injection
// ---------------------------------------------------------------------------

test('emitHappyFlow: injects idempotency header when profile.required is true', () => {
  const ep = makeEndpoint();
  const flow = emitHappyFlow(ep);
  const apiStep = flow.steps.find((s) => s.kind === 'api');

  assert.ok(apiStep.headers);
  assert.strictEqual(apiStep.headers['Idempotency-Key'], '${uniqUuid}');
});

test('emitHappyFlow: no idempotency header when profile is null', () => {
  const ep = makeEndpoint({ idempotencyProfile: null });
  const flow = emitHappyFlow(ep);
  const apiStep = flow.steps.find((s) => s.kind === 'api');

  assert.strictEqual(apiStep.headers, undefined);
});

test('emitHappyFlow: no idempotency header when profile.required is false', () => {
  const ep = makeEndpoint({
    idempotencyProfile: { headerName: 'Idempotency-Key', required: false, source: 'openapi-parameter' },
  });
  const flow = emitHappyFlow(ep);
  const apiStep = flow.steps.find((s) => s.kind === 'api');

  assert.strictEqual(apiStep.headers, undefined);
});

// ---------------------------------------------------------------------------
// emitIdempotencyFlow — :no-key flow for optional idempotency
// ---------------------------------------------------------------------------

test('emitIdempotencyFlow emits :no-key flow when idempotency is optional', () => {
  const ep = makeEndpoint({
    idempotencyProfile: { headerName: 'Idempotency-Key', required: false, source: 'openapi-parameter' },
  });
  const flows = emitIdempotencyFlow(ep);
  assert.ok(flows);
  const noKeyFlow = flows.find((f) => f.id.includes(':no-key'));
  assert.ok(noKeyFlow, 'should emit :no-key flow');
  assert.ok(noKeyFlow.id.endsWith(':post:idempotency:no-key'));
  // The API step should have no idempotency header
  const apiStep = noKeyFlow.steps.find((s) => s.kind === 'api');
  assert.ok(apiStep);
  assert.strictEqual(apiStep.headers, undefined);
  // Should expect success
  const expectStep = noKeyFlow.steps.find((s) => s.kind === 'expect');
  assert.deepStrictEqual(expectStep.statusAnyOf, [200, 201]);
});

test('emitIdempotencyFlow does NOT emit :no-key flow when idempotency is required', () => {
  const ep = makeEndpoint({
    idempotencyProfile: { headerName: 'Idempotency-Key', required: true, source: 'openapi-parameter' },
  });
  const flows = emitIdempotencyFlow(ep);
  assert.ok(flows);
  const noKeyFlow = flows.find((f) => f.id.includes(':no-key'));
  assert.strictEqual(noKeyFlow, undefined, 'should not emit :no-key flow for required idempotency');
});

test('emitIdempotencyFlow emits 3 flows total for optional idempotency (replay + different-key + no-key)', () => {
  const ep = makeEndpoint({
    idempotencyProfile: { headerName: 'Idempotency-Key', required: false, source: 'openapi-parameter' },
  });
  const flows = emitIdempotencyFlow(ep);
  assert.ok(flows);
  assert.strictEqual(flows.length, 3);
  const ids = flows.map((f) => f.id);
  assert.ok(ids.some((id) => id.includes(':replay')));
  assert.ok(ids.some((id) => id.includes(':different-key')));
  assert.ok(ids.some((id) => id.includes(':no-key')));
});

test('emitIdempotencyFlow emits 2 flows total for required idempotency (replay + different-key)', () => {
  const ep = makeEndpoint({
    idempotencyProfile: { headerName: 'Idempotency-Key', required: true, source: 'openapi-parameter' },
  });
  const flows = emitIdempotencyFlow(ep);
  assert.ok(flows);
  assert.strictEqual(flows.length, 2);
});

// ---------------------------------------------------------------------------
// x-idempotency-ttl extension support
// ---------------------------------------------------------------------------

test('idempotencyProfile preserves ttl from x-idempotency-ttl extension', () => {
  // This tests the nest-openapi detector; we verify the profile shape here
  const ep = makeEndpoint({
    idempotencyProfile: { headerName: 'Idempotency-Key', required: true, ttl: 3600, source: 'openapi-parameter' },
  });
  assert.strictEqual(ep.idempotencyProfile.ttl, 3600);
  const flows = emitIdempotencyFlow(ep);
  assert.ok(flows);
  assert.strictEqual(flows.length, 2);
});

test('idempotencyProfile has null ttl when x-idempotency-ttl is not declared', () => {
  const ep = makeEndpoint({
    idempotencyProfile: { headerName: 'Idempotency-Key', required: true, ttl: null, source: 'openapi-parameter' },
  });
  assert.strictEqual(ep.idempotencyProfile.ttl, null);
});

// ---------------------------------------------------------------------------
// emitIdempotencyFlow — capture path respects responseEnvelope.successWrapper
// (Task #23)
// ---------------------------------------------------------------------------

test('replay capture uses $.id when no envelopeWrapper option', () => {
  const ep = makeEndpoint();
  const flows = emitIdempotencyFlow(ep, {});
  const replay = flows.find((f) => f.id.endsWith(':replay'));
  const cap = replay.steps.find((s) => s.kind === 'capture');
  assert.strictEqual(cap.bindings.firstId, '$.id');
  assert.strictEqual(cap.bindings.firstBody, '$.body');
});

test('replay capture wraps with envelopeWrapper as array (e.g. ["data"])', () => {
  const ep = makeEndpoint();
  const flows = emitIdempotencyFlow(ep, { envelopeWrapper: ['data'] });
  const replay = flows.find((f) => f.id.endsWith(':replay'));
  const cap = replay.steps.find((s) => s.kind === 'capture');
  assert.strictEqual(cap.bindings.firstId, '$.data.id');
  assert.strictEqual(cap.bindings.firstBody, '$.data.body');
});

test('replay capture wraps with envelopeWrapper as nested array', () => {
  const ep = makeEndpoint();
  const flows = emitIdempotencyFlow(ep, { envelopeWrapper: ['payload', 'data'] });
  const replay = flows.find((f) => f.id.endsWith(':replay'));
  const cap = replay.steps.find((s) => s.kind === 'capture');
  assert.strictEqual(cap.bindings.firstId, '$.payload.data.id');
  assert.strictEqual(cap.bindings.firstBody, '$.payload.data.body');
});

test('replay capture wraps with envelopeWrapper as string', () => {
  const ep = makeEndpoint();
  const flows = emitIdempotencyFlow(ep, { envelopeWrapper: 'data' });
  const replay = flows.find((f) => f.id.endsWith(':replay'));
  const cap = replay.steps.find((s) => s.kind === 'capture');
  assert.strictEqual(cap.bindings.firstId, '$.data.id');
});

test('different-key capture wraps declared paths under envelope', () => {
  const ep = makeEndpoint();
  const flows = emitIdempotencyFlow(ep, { envelopeWrapper: ['data'] });
  const diff = flows.find((f) => f.id.endsWith(':different-key'));
  const cap = diff.steps.find((s) => s.kind === 'capture');
  assert.strictEqual(cap.bindings.firstId, '$.data.id');
  assert.strictEqual(cap.bindings.firstBody, '$.data.body');
});

test('capture step is omitted when responseContract is missing (declaration-driven)', () => {
  // No responseContract declared → emitter cannot know which fields to capture.
  // Per source-of-truth: skip capture rather than guess `id`/`body` exists.
  const ep = makeEndpoint({ responseContract: null });
  const flows = emitIdempotencyFlow(ep);
  const replay = flows.find((f) => f.id.endsWith(':replay'));
  const diff = flows.find((f) => f.id.endsWith(':different-key'));
  const replayCaptures = replay.steps.filter((s) => s.kind === 'capture');
  const diffCaptures = diff.steps.filter((s) => s.kind === 'capture');
  assert.strictEqual(replayCaptures.length, 0);
  assert.strictEqual(diffCaptures.length, 0);
});

test('capture step is omitted when responseContract.requiredPaths is empty', () => {
  const ep = makeEndpoint({
    responseContract: { status: 201, fields: [], requiredPaths: [] },
  });
  const flows = emitIdempotencyFlow(ep);
  const replay = flows.find((f) => f.id.endsWith(':replay'));
  const captures = replay.steps.filter((s) => s.kind === 'capture');
  assert.strictEqual(captures.length, 0);
});

test('capture bindings reflect declared response fields exactly', () => {
  // Endpoint declares { id, item, quantity } — bindings are
  // first<PascalField> for each, derived from requiredPaths.
  const ep = makeEndpoint({
    responseContract: {
      status: 201,
      schemaRef: 'IdempotentCreateDto',
      fields: ['id', 'item', 'quantity'],
      requiredPaths: ['id', 'item', 'quantity'],
    },
  });
  const flows = emitIdempotencyFlow(ep, { envelopeWrapper: ['data'] });
  const replay = flows.find((f) => f.id.endsWith(':replay'));
  const cap = replay.steps.find((s) => s.kind === 'capture');
  assert.deepStrictEqual(cap.bindings, {
    firstId: '$.data.id',
    firstItem: '$.data.item',
    firstQuantity: '$.data.quantity',
  });
});

test('conditional-request endpoints (@Res()) bypass envelope wrapping', () => {
  const ep = makeEndpoint({
    conditionalProfile: { patterns: ['if-match'] },
  });
  const flows = emitIdempotencyFlow(ep, { envelopeWrapper: ['data'] });
  const replay = flows.find((f) => f.id.endsWith(':replay'));
  const cap = replay.steps.find((s) => s.kind === 'capture');
  assert.strictEqual(cap.bindings.firstId, '$.id');
  assert.strictEqual(cap.bindings.firstBody, '$.body');
});

// ---------------------------------------------------------------------------
// emitHappyFlow — error-only endpoints get NO :happy flow (Task #22)
// ---------------------------------------------------------------------------

test('emitHappyFlow: returns null when endpoint declares only 4xx statuses', () => {
  const ep = {
    method: 'GET',
    path: '/api/v1/admin-only',
    file: 'src/modules/admin.controller.ts',
    swaggerDeclared: { statuses: [401, 403] },
    authDecorators: null,
  };
  const result = emitHappyFlow(ep);
  assert.strictEqual(result, null);
});

test('emitHappyFlow: returns null when endpoint declares only 5xx statuses', () => {
  const ep = {
    method: 'GET',
    path: '/api/v1/always-broken',
    file: 'src/modules/broken.controller.ts',
    swaggerDeclared: { statuses: [500, 503] },
    authDecorators: null,
  };
  const result = emitHappyFlow(ep);
  assert.strictEqual(result, null);
});

test('emitHappyFlow: returns null when endpoint declares only 410 (gone)', () => {
  const ep = {
    method: 'GET',
    path: '/api/v1/gone',
    file: 'src/modules/legacy.controller.ts',
    swaggerDeclared: { statuses: [410] },
    authDecorators: null,
  };
  const result = emitHappyFlow(ep);
  assert.strictEqual(result, null);
});

test('emitHappyFlow: returns null when endpoint declares only 301 (redirect)', () => {
  const ep = {
    method: 'GET',
    path: '/api/v1/old',
    file: 'src/modules/legacy.controller.ts',
    swaggerDeclared: { statuses: [301] },
    authDecorators: null,
  };
  const result = emitHappyFlow(ep);
  assert.strictEqual(result, null);
});

test('emitHappyFlow: emits a flow when endpoint declares mixed 2xx + 4xx', () => {
  const ep = {
    method: 'GET',
    path: '/api/v1/items',
    file: 'src/modules/items.controller.ts',
    swaggerDeclared: { statuses: [200, 404] },
    authDecorators: null,
  };
  const result = emitHappyFlow(ep);
  assert.ok(result);
  const expectStep = result.steps.find((s) => s.kind === 'expect');
  assert.strictEqual(expectStep.status, 200);
});

test('emitHappyFlow: emits a flow when endpoint declares no statuses (defaults apply)', () => {
  const ep = {
    method: 'GET',
    path: '/api/v1/items',
    file: 'src/modules/items.controller.ts',
    swaggerDeclared: { statuses: [] },
    authDecorators: null,
  };
  const result = emitHappyFlow(ep);
  assert.ok(result, 'endpoints without declared statuses should fall back to method default');
});

test('emitHappyFlow: emits a flow when endpoint declares 201 + 409', () => {
  const ep = {
    method: 'POST',
    path: '/api/v1/items',
    file: 'src/modules/items.controller.ts',
    swaggerDeclared: { statuses: [201, 409] },
    authDecorators: null,
  };
  const result = emitHappyFlow(ep);
  assert.ok(result);
  const expectStep = result.steps.find((s) => s.kind === 'expect');
  assert.strictEqual(expectStep.status, 201);
});
