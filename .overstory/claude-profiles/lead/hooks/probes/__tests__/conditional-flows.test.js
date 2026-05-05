'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  emitConditionalFlows,
} = require('../flows-generator');

// ---------------------------------------------------------------------------
// Helper: minimal endpoint factory
// ---------------------------------------------------------------------------

function makeEp(method, path, conditionalProfile, extras = {}) {
  return {
    method,
    path,
    file: 'src/modules/items/items.controller.ts',
    operationId: `${method.toLowerCase()}Items`,
    conditionalProfile,
    zodContract: extras.zodContract || null,
    swaggerDeclared: { statuses: [200] },
    authDecorators: { authRequired: false, isPublic: true, guards: [], rolesRequired: [] },
    ...extras,
  };
}

function makeETagProfile(overrides = {}) {
  return {
    supportsETag: true,
    supportsLastModified: false,
    patterns: ['if-none-match'],
    conditionalStatuses: [304],
    responseHeaders: ['etag'],
    requestHeaders: ['if-none-match'],
    ...overrides,
  };
}

function makeLastModifiedProfile(overrides = {}) {
  return {
    supportsETag: false,
    supportsLastModified: true,
    patterns: ['if-modified-since'],
    conditionalStatuses: [304],
    responseHeaders: ['last-modified'],
    requestHeaders: ['if-modified-since'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// emitConditionalFlows — returns empty for non-conditional endpoints
// ---------------------------------------------------------------------------

test('emitConditionalFlows: returns empty array when no endpoints have conditionalProfile', () => {
  const endpoints = [
    makeEp('GET', '/api/v1/items', null),
    makeEp('POST', '/api/v1/items', null),
  ];
  const flows = emitConditionalFlows(endpoints);
  assert.deepStrictEqual(flows, []);
});

// ---------------------------------------------------------------------------
// ETag-based flows
// ---------------------------------------------------------------------------

test('emitConditionalFlows: emits etag-304 flow for GET with ETag + if-none-match', () => {
  const profile = makeETagProfile();
  const endpoints = [makeEp('GET', '/api/v1/items/:id', profile)];
  const flows = emitConditionalFlows(endpoints);

  const etag304 = flows.find((f) => f.id.includes('conditional:etag-304'));
  assert.ok(etag304, 'etag-304 flow should be emitted');
  assert.strictEqual(etag304.contract.kind, 'endpoint-conditional');

  // Should have: GET → expect 200 → capture etag → GET If-None-Match → expect 304
  assert.strictEqual(etag304.steps.length, 5);
  assert.strictEqual(etag304.steps[0].kind, 'api');
  assert.strictEqual(etag304.steps[0].method, 'GET');
  assert.strictEqual(etag304.steps[1].kind, 'expect');
  assert.strictEqual(etag304.steps[1].status, 200);
  assert.strictEqual(etag304.steps[2].kind, 'capture');
  assert.strictEqual(etag304.steps[2].bindings.capturedETag, 'header:etag');
  assert.strictEqual(etag304.steps[3].kind, 'api');
  assert.strictEqual(etag304.steps[3].headers['If-None-Match'], '${capturedETag}');
  assert.strictEqual(etag304.steps[4].kind, 'expect');
  assert.strictEqual(etag304.steps[4].status, 304);
});

test('emitConditionalFlows: does not emit etag-304 for non-GET endpoints', () => {
  const profile = makeETagProfile();
  const endpoints = [makeEp('PUT', '/api/v1/items/:id', profile)];
  const flows = emitConditionalFlows(endpoints);

  const etag304 = flows.find((f) => f.id.includes('conditional:etag-304'));
  assert.strictEqual(etag304, undefined, 'etag-304 should not emit for PUT');
});

test('emitConditionalFlows: emits if-match-stale flow for PUT with if-match pattern', () => {
  const profile = makeETagProfile({ patterns: ['if-none-match', 'if-match'], conditionalStatuses: [304, 412] });
  const endpoints = [makeEp('PUT', '/api/v1/items/:id', profile, {
    zodContract: { schemaRef: 'UpdateItem', sampleValid: { title: 'test' }, fields: [{ name: 'title' }] },
  })];
  const flows = emitConditionalFlows(endpoints);

  const ifMatchStale = flows.find((f) => f.id.includes('conditional:if-match-stale'));
  assert.ok(ifMatchStale, 'if-match-stale flow should be emitted');
  assert.strictEqual(ifMatchStale.steps[0].headers['If-Match'], '"stale-etag-probe-00000"');
  assert.strictEqual(ifMatchStale.steps[1].status, 412);
});

test('emitConditionalFlows: emits if-match-valid flow when sibling GET exists', () => {
  const profile = makeETagProfile({ patterns: ['if-none-match', 'if-match'], conditionalStatuses: [304, 412] });
  const getEp = makeEp('GET', '/api/v1/items/:id', profile);
  const putEp = makeEp('PUT', '/api/v1/items/:id', profile, {
    zodContract: { schemaRef: 'UpdateItem', sampleValid: { title: 'test' }, fields: [{ name: 'title' }] },
  });
  const flows = emitConditionalFlows([getEp, putEp]);

  const ifMatchValid = flows.find((f) => f.id.includes('conditional:if-match-valid'));
  assert.ok(ifMatchValid, 'if-match-valid flow should be emitted');

  // Step 0: GET to capture ETag
  assert.strictEqual(ifMatchValid.steps[0].method, 'GET');
  // Step 2: capture ETag
  assert.strictEqual(ifMatchValid.steps[2].bindings.capturedETag, 'header:etag');
  // Step 3: PUT with captured ETag
  assert.strictEqual(ifMatchValid.steps[3].headers['If-Match'], '${capturedETag}');
  // Step 4: expect success
  assert.deepStrictEqual(ifMatchValid.steps[4].statusAnyOf, [200, 204]);
});

test('emitConditionalFlows: does not emit if-match-valid when no sibling GET', () => {
  const profile = makeETagProfile({ patterns: ['if-match'], conditionalStatuses: [412] });
  const putEp = makeEp('PUT', '/api/v1/items/:id', profile);
  const flows = emitConditionalFlows([putEp]);

  const ifMatchValid = flows.find((f) => f.id.includes('conditional:if-match-valid'));
  assert.strictEqual(ifMatchValid, undefined, 'if-match-valid needs sibling GET');
});

// ---------------------------------------------------------------------------
// Last-Modified-based flows (Bug #3 fix)
// ---------------------------------------------------------------------------

test('emitConditionalFlows: emits last-modified-304 flow for GET with Last-Modified', () => {
  const profile = makeLastModifiedProfile();
  const endpoints = [makeEp('GET', '/api/v1/articles/:id', profile)];
  const flows = emitConditionalFlows(endpoints);

  const lm304 = flows.find((f) => f.id.includes('conditional:last-modified-304'));
  assert.ok(lm304, 'last-modified-304 flow should be emitted');

  // Step 0: GET, Step 1: expect 200, Step 2: capture Last-Modified, Step 3: GET If-Modified-Since, Step 4: expect 304
  assert.strictEqual(lm304.steps.length, 5);
  assert.strictEqual(lm304.steps[2].kind, 'capture');
  assert.strictEqual(lm304.steps[2].bindings.capturedLastModified, 'header:last-modified');
  assert.strictEqual(lm304.steps[3].headers['If-Modified-Since'], '${capturedLastModified}');
  assert.strictEqual(lm304.steps[4].status, 304);
});

test('emitConditionalFlows: does not emit last-modified-304 for non-GET', () => {
  const profile = makeLastModifiedProfile();
  const endpoints = [makeEp('PUT', '/api/v1/articles/:id', profile)];
  const flows = emitConditionalFlows(endpoints);

  const lm304 = flows.find((f) => f.id.includes('conditional:last-modified-304'));
  assert.strictEqual(lm304, undefined);
});

test('emitConditionalFlows: emits if-unmodified-since-stale for PUT with if-unmodified-since pattern', () => {
  const profile = {
    supportsETag: false,
    supportsLastModified: true,
    patterns: ['if-modified-since', 'if-unmodified-since'],
    conditionalStatuses: [304, 412],
    responseHeaders: ['last-modified'],
    requestHeaders: ['if-modified-since', 'if-unmodified-since'],
  };
  const endpoints = [makeEp('PUT', '/api/v1/articles/:id', profile, {
    zodContract: { schemaRef: 'UpdateArticle', sampleValid: { body: 'text' }, fields: [{ name: 'body' }] },
  })];
  const flows = emitConditionalFlows(endpoints);

  const stale = flows.find((f) => f.id.includes('conditional:if-unmodified-since-stale'));
  assert.ok(stale, 'if-unmodified-since-stale flow should be emitted');
  assert.strictEqual(stale.steps[0].headers['If-Unmodified-Since'], 'Thu, 01 Jan 1970 00:00:00 GMT');
  assert.strictEqual(stale.steps[1].status, 412);
});

// ---------------------------------------------------------------------------
// 428 Precondition Required (Bug #4 fix)
// ---------------------------------------------------------------------------

test('emitConditionalFlows: emits precondition-required-428 when 428 is in conditionalStatuses', () => {
  const profile = makeETagProfile({
    patterns: ['if-none-match', 'if-match'],
    conditionalStatuses: [304, 412, 428],
  });
  const putEp = makeEp('PUT', '/api/v1/items/:id', profile, {
    zodContract: { schemaRef: 'UpdateItem', sampleValid: { title: 'test' }, fields: [{ name: 'title' }] },
  });
  const flows = emitConditionalFlows([putEp]);

  const precond428 = flows.find((f) => f.id.includes('conditional:precondition-required-428'));
  assert.ok(precond428, 'precondition-required-428 flow should be emitted');
  assert.strictEqual(precond428.steps[1].status, 428);

  // The API step should NOT have If-Match header — that's the test
  const apiStep = precond428.steps[0];
  assert.strictEqual(apiStep.kind, 'api');
  assert.strictEqual(apiStep.method, 'PUT');
  assert.ok(!apiStep.headers || !apiStep.headers['If-Match'], 'Should NOT send If-Match');
  // But should have body from zodContract
  assert.ok(apiStep.body);
});

test('emitConditionalFlows: 428 flow mentions If-Match in implies when if-match pattern present', () => {
  const profile = makeETagProfile({
    patterns: ['if-match'],
    conditionalStatuses: [428],
  });
  const flows = emitConditionalFlows([makeEp('PUT', '/api/v1/items/:id', profile)]);
  const precond428 = flows.find((f) => f.id.includes('precondition-required-428'));
  assert.ok(precond428);
  assert.ok(precond428.onFail.implies.includes('If-Match'));
});

test('emitConditionalFlows: 428 flow mentions If-Unmodified-Since when that pattern present', () => {
  const profile = {
    supportsETag: false,
    supportsLastModified: true,
    patterns: ['if-unmodified-since'],
    conditionalStatuses: [428],
    responseHeaders: ['last-modified'],
    requestHeaders: ['if-unmodified-since'],
  };
  const flows = emitConditionalFlows([makeEp('PATCH', '/api/v1/items/:id', profile)]);
  const precond428 = flows.find((f) => f.id.includes('precondition-required-428'));
  assert.ok(precond428);
  assert.ok(precond428.onFail.implies.includes('If-Unmodified-Since'));
});

test('emitConditionalFlows: does not emit 428 for GET endpoints', () => {
  const profile = makeETagProfile({
    patterns: ['if-none-match', 'if-match'],
    conditionalStatuses: [304, 428],
  });
  const flows = emitConditionalFlows([makeEp('GET', '/api/v1/items/:id', profile)]);
  const precond428 = flows.find((f) => f.id.includes('precondition-required-428'));
  assert.strictEqual(precond428, undefined, '428 should not emit for GET');
});

test('emitConditionalFlows: does not emit 428 when not in conditionalStatuses', () => {
  const profile = makeETagProfile({
    patterns: ['if-match'],
    conditionalStatuses: [412],
  });
  const flows = emitConditionalFlows([makeEp('PUT', '/api/v1/items/:id', profile)]);
  const precond428 = flows.find((f) => f.id.includes('precondition-required-428'));
  assert.strictEqual(precond428, undefined);
});

// ---------------------------------------------------------------------------
// Combined: full conditional endpoint emits all expected flows
// ---------------------------------------------------------------------------

test('emitConditionalFlows: full ETag endpoint emits etag-304, if-match-stale, if-match-valid, 428', () => {
  const profile = makeETagProfile({
    patterns: ['if-none-match', 'if-match'],
    conditionalStatuses: [304, 412, 428],
  });
  const getEp = makeEp('GET', '/api/v1/items/:id', profile);
  const putEp = makeEp('PUT', '/api/v1/items/:id', profile, {
    zodContract: { schemaRef: 'UpdateItem', sampleValid: { title: 'test' }, fields: [{ name: 'title' }] },
  });
  const flows = emitConditionalFlows([getEp, putEp]);

  const ids = flows.map((f) => f.id);
  assert.ok(ids.some((id) => id.includes('etag-304')), 'should have etag-304');
  assert.ok(ids.some((id) => id.includes('if-match-stale')), 'should have if-match-stale');
  assert.ok(ids.some((id) => id.includes('if-match-valid')), 'should have if-match-valid');
  assert.ok(ids.some((id) => id.includes('precondition-required-428')), 'should have precondition-required-428');
});

// ---------------------------------------------------------------------------
// x-etag-type extension — weak/strong format assertion in etag-304 flow
// ---------------------------------------------------------------------------

test('emitConditionalFlows: weak ETag adds headerMatches W/ assertion', () => {
  const profile = makeETagProfile({ etagType: 'weak' });
  const ep = makeEp('GET', '/api/v1/etag-weak', profile);
  const flows = emitConditionalFlows([ep]);
  const etag304 = flows.find((f) => f.id.includes('etag-304'));
  assert.ok(etag304);
  // Should have a headerMatches step inserted after expect:200
  const headerMatchStep = etag304.steps.find((s) => s.headerMatches);
  assert.ok(headerMatchStep, 'should have headerMatches step for weak ETag');
  assert.strictEqual(headerMatchStep.headerMatches.etag, '^W/');
  // Contract should annotate etagType
  assert.strictEqual(etag304.contract.etagType, 'weak');
});

test('emitConditionalFlows: strong ETag adds headerMatches non-W/ assertion', () => {
  const profile = makeETagProfile({ etagType: 'strong' });
  const ep = makeEp('GET', '/api/v1/etag-strong', profile);
  const flows = emitConditionalFlows([ep]);
  const etag304 = flows.find((f) => f.id.includes('etag-304'));
  assert.ok(etag304);
  const headerMatchStep = etag304.steps.find((s) => s.headerMatches);
  assert.ok(headerMatchStep, 'should have headerMatches step for strong ETag');
  assert.strictEqual(headerMatchStep.headerMatches.etag, '^"[^W]');
  assert.strictEqual(etag304.contract.etagType, 'strong');
});

test('emitConditionalFlows: no etagType does not add headerMatches step', () => {
  const profile = makeETagProfile({ etagType: null });
  const ep = makeEp('GET', '/api/v1/etag-default', profile);
  const flows = emitConditionalFlows([ep]);
  const etag304 = flows.find((f) => f.id.includes('etag-304'));
  assert.ok(etag304);
  const headerMatchStep = etag304.steps.find((s) => s.headerMatches);
  assert.strictEqual(headerMatchStep, undefined, 'should not have headerMatches step without etagType');
  assert.strictEqual(etag304.contract.etagType, null);
});

// ---------------------------------------------------------------------------
// Vary header flow emission
// ---------------------------------------------------------------------------

test('emitConditionalFlows: emits :vary flow when supportsVary is non-null', () => {
  const profile = makeETagProfile({ supportsVary: ['Accept-Language'] });
  const ep = makeEp('GET', '/api/v1/vary-conditional', profile);
  const flows = emitConditionalFlows([ep]);
  const varyFlow = flows.find((f) => f.id.includes(':vary'));
  assert.ok(varyFlow, 'should emit :vary flow');
  assert.ok(varyFlow.id.endsWith(':get:conditional:vary'));
  // Should assert header:vary presence
  const expectStep = varyFlow.steps.find((s) => s.kind === 'expect');
  assert.ok(expectStep.bodyHas.includes('header:vary'));
});

test('emitConditionalFlows: does NOT emit :vary flow when supportsVary is null', () => {
  const profile = makeETagProfile({ supportsVary: null });
  const ep = makeEp('GET', '/api/v1/no-vary', profile);
  const flows = emitConditionalFlows([ep]);
  const varyFlow = flows.find((f) => f.id.includes(':vary'));
  assert.strictEqual(varyFlow, undefined, 'should not emit :vary flow without supportsVary');
});

test('emitConditionalFlows: :vary flow not emitted for non-GET methods', () => {
  const profile = makeETagProfile({ supportsVary: ['Accept-Language'], patterns: ['if-match'] });
  const ep = makeEp('PUT', '/api/v1/vary-put', profile);
  const flows = emitConditionalFlows([ep]);
  const varyFlow = flows.find((f) => f.id.includes(':vary'));
  assert.strictEqual(varyFlow, undefined, 'should not emit :vary flow for PUT');
});

// ---------------------------------------------------------------------------
// x-etag-source: cross-path ETag capture via operationId declaration
// ---------------------------------------------------------------------------

test('emitConditionalFlows: emits if-match-valid via x-etag-source when GET is at different path', () => {
  const getProfile = makeETagProfile({ etagType: 'strong' });
  const putProfile = makeETagProfile({
    patterns: ['if-none-match', 'if-match'],
    conditionalStatuses: [304, 412, 428],
    etagSourceOperationId: 'getItemEtag',
  });

  const getEp = makeEp('GET', '/api/v1/items/:id/etag', getProfile, {
    operationId: 'getItemEtag',
  });
  const putEp = makeEp('PUT', '/api/v1/items/:id', putProfile, {
    zodContract: { schemaRef: 'UpdateItem', sampleValid: { title: 'test' }, fields: [{ name: 'title' }] },
  });
  const flows = emitConditionalFlows([getEp, putEp]);

  const ifMatchValid = flows.find((f) => f.id.includes('conditional:if-match-valid'));
  assert.ok(ifMatchValid, 'if-match-valid flow should be emitted via x-etag-source');

  // Step 0: GET from the x-etag-source endpoint (different path)
  assert.strictEqual(ifMatchValid.steps[0].method, 'GET');
  assert.strictEqual(ifMatchValid.steps[0].path, '/api/v1/items/:id/etag');
  // Step 2: capture ETag
  assert.strictEqual(ifMatchValid.steps[2].bindings.capturedETag, 'header:etag');
  // Step 3: PUT on the actual endpoint path
  assert.strictEqual(ifMatchValid.steps[3].method, 'PUT');
  assert.strictEqual(ifMatchValid.steps[3].path, '/api/v1/items/:id');
  assert.strictEqual(ifMatchValid.steps[3].headers['If-Match'], '${capturedETag}');
  // Step 4: expect success
  assert.deepStrictEqual(ifMatchValid.steps[4].statusAnyOf, [200, 204]);
});

test('emitConditionalFlows: x-etag-source takes precedence over same-path sibling', () => {
  const samePathGetProfile = makeETagProfile({ etagType: 'weak' });
  const crossPathGetProfile = makeETagProfile({ etagType: 'strong' });
  const putProfile = makeETagProfile({
    patterns: ['if-none-match', 'if-match'],
    conditionalStatuses: [304, 412],
    etagSourceOperationId: 'crossPathGet',
  });

  const samePathGet = makeEp('GET', '/api/v1/items/:id', samePathGetProfile, {
    operationId: 'samePathGet',
  });
  const crossPathGet = makeEp('GET', '/api/v1/items/:id/etag-source', crossPathGetProfile, {
    operationId: 'crossPathGet',
  });
  const putEp = makeEp('PUT', '/api/v1/items/:id', putProfile, {
    zodContract: { schemaRef: 'UpdateItem', sampleValid: { title: 'test' }, fields: [{ name: 'title' }] },
  });
  const flows = emitConditionalFlows([samePathGet, crossPathGet, putEp]);

  const ifMatchValid = flows.find((f) => f.id.includes('conditional:if-match-valid'));
  assert.ok(ifMatchValid, 'if-match-valid should be emitted');
  // Should use cross-path GET (x-etag-source), not same-path GET
  assert.strictEqual(ifMatchValid.steps[0].path, '/api/v1/items/:id/etag-source');
});

test('emitConditionalFlows: falls back to same-path sibling when x-etag-source is null', () => {
  const getProfile = makeETagProfile();
  const putProfile = makeETagProfile({
    patterns: ['if-none-match', 'if-match'],
    conditionalStatuses: [304, 412],
    etagSourceOperationId: null,
  });

  const getEp = makeEp('GET', '/api/v1/items/:id', getProfile, { operationId: 'getItem' });
  const putEp = makeEp('PUT', '/api/v1/items/:id', putProfile, {
    zodContract: { schemaRef: 'UpdateItem', sampleValid: { title: 'test' }, fields: [{ name: 'title' }] },
  });
  const flows = emitConditionalFlows([getEp, putEp]);

  const ifMatchValid = flows.find((f) => f.id.includes('conditional:if-match-valid'));
  assert.ok(ifMatchValid, 'should fall back to same-path sibling');
  assert.strictEqual(ifMatchValid.steps[0].path, '/api/v1/items/:id');
});

test('emitConditionalFlows: no if-match-valid when x-etag-source operationId not found and no same-path sibling', () => {
  const putProfile = makeETagProfile({
    patterns: ['if-match'],
    conditionalStatuses: [412],
    etagSourceOperationId: 'nonExistentOp',
  });
  const putEp = makeEp('PUT', '/api/v1/items/:id', putProfile);
  const flows = emitConditionalFlows([putEp]);

  const ifMatchValid = flows.find((f) => f.id.includes('conditional:if-match-valid'));
  assert.strictEqual(ifMatchValid, undefined, 'should not emit when source not found');
});

test('emitConditionalFlows: x-etag-source ignores non-GET endpoints with matching operationId', () => {
  const putProfile = makeETagProfile({
    patterns: ['if-match'],
    conditionalStatuses: [412],
    etagSourceOperationId: 'postItemEtag',
  });
  // POST endpoint with matching operationId — should NOT be used as ETag source
  const postEp = makeEp('POST', '/api/v1/items', makeETagProfile(), {
    operationId: 'postItemEtag',
  });
  const putEp = makeEp('PUT', '/api/v1/items/:id', putProfile);
  const flows = emitConditionalFlows([postEp, putEp]);

  const ifMatchValid = flows.find((f) => f.id.includes('conditional:if-match-valid'));
  assert.strictEqual(ifMatchValid, undefined, 'should not match non-GET endpoint');
});
