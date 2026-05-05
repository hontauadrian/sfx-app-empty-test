'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  emitStatusReachabilityFlows,
  pickWrongMethod,
} = require('../flows-generator');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal endpoint fixture with declared statuses. */
function makeEp(method, path, statuses, extras = {}) {
  return {
    file: 'test-controller.ts',
    method,
    path,
    guard: 'public',
    swaggerDeclared: { tags: ['test'], statuses },
    authDecorators: { authRequired: false, isPublic: true, guards: [], rolesRequired: [] },
    ...extras,
  };
}

// ---------------------------------------------------------------------------
// pickWrongMethod
// ---------------------------------------------------------------------------

test('pickWrongMethod returns DELETE for GET', () => {
  assert.strictEqual(pickWrongMethod('GET'), 'DELETE');
});

test('pickWrongMethod returns GET for POST', () => {
  assert.strictEqual(pickWrongMethod('POST'), 'GET');
});

test('pickWrongMethod returns GET for PUT', () => {
  assert.strictEqual(pickWrongMethod('PUT'), 'GET');
});

test('pickWrongMethod returns GET for PATCH', () => {
  assert.strictEqual(pickWrongMethod('PATCH'), 'GET');
});

test('pickWrongMethod returns POST for DELETE', () => {
  assert.strictEqual(pickWrongMethod('DELETE'), 'POST');
});

test('pickWrongMethod returns a different method for unknown input', () => {
  const result = pickWrongMethod('OPTIONS');
  assert.notStrictEqual(result, 'OPTIONS');
  assert.ok(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(result));
});

// ---------------------------------------------------------------------------
// emitStatusReachabilityFlows — returns empty when no swaggerDeclared
// ---------------------------------------------------------------------------

test('returns empty array when no swaggerDeclared', () => {
  const ep = { file: 'test.ts', method: 'GET', path: '/test', swaggerDeclared: null };
  const diag = [];
  assert.deepStrictEqual(emitStatusReachabilityFlows(ep, new Set(), diag), []);
});

test('returns empty array when swaggerDeclared has no statuses', () => {
  const ep = { file: 'test.ts', method: 'GET', path: '/test', swaggerDeclared: { tags: [] } };
  const diag = [];
  assert.deepStrictEqual(emitStatusReachabilityFlows(ep, new Set(), diag), []);
});

// ---------------------------------------------------------------------------
// Skips already-covered statuses
// ---------------------------------------------------------------------------

test('skips statuses already in coveredStatuses set', () => {
  const ep = makeEp('GET', '/api/v1/items', [200, 404]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([200, 404]), diag);
  assert.strictEqual(flows.length, 0);
});

// ---------------------------------------------------------------------------
// 404 — missing resource
// ---------------------------------------------------------------------------

test('emits 404 flow with non-existent ID substitution', () => {
  const ep = makeEp('GET', '/api/v1/items/:id', [404]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set(), diag);
  assert.strictEqual(flows.length, 1);
  const flow = flows[0];
  assert.ok(flow.id.includes('status-reach:404'));
  assert.strictEqual(flow.steps[0].kind, 'api');
  assert.strictEqual(flow.steps[0].path, '/api/v1/items/non-existent-id-00000');
  assert.strictEqual(flow.steps[1].kind, 'expect');
  assert.strictEqual(flow.steps[1].status, 404);
});

// ---------------------------------------------------------------------------
// 301 — permanent redirect
// ---------------------------------------------------------------------------

test('emits 301 redirect flow with Location header assertion', () => {
  const ep = makeEp('GET', '/api/v1/old-path', [301]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set(), diag);
  assert.strictEqual(flows.length, 1);
  const flow = flows[0];
  assert.ok(flow.id.includes('status-reach:301'));
  assert.strictEqual(flow.steps[0].kind, 'api');
  assert.strictEqual(flow.steps[0].method, 'GET');
  assert.strictEqual(flow.steps[1].kind, 'expect');
  assert.strictEqual(flow.steps[1].status, 301);
  assert.ok(flow.steps[1].bodyHas.includes('header:location'));
});

// ---------------------------------------------------------------------------
// 302 — temporary redirect
// ---------------------------------------------------------------------------

test('emits 302 redirect flow with Location header assertion', () => {
  const ep = makeEp('GET', '/api/v1/temp-redirect', [302]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set(), diag);
  assert.strictEqual(flows.length, 1);
  const flow = flows[0];
  assert.ok(flow.id.includes('status-reach:302'));
  assert.strictEqual(flow.steps[1].status, 302);
  assert.ok(flow.steps[1].bodyHas.includes('header:location'));
});

// ---------------------------------------------------------------------------
// 307 — temporary redirect (preserve method)
// ---------------------------------------------------------------------------

test('emits 307 redirect flow', () => {
  const ep = makeEp('POST', '/api/v1/redir-307', [307]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set(), diag);
  assert.strictEqual(flows.length, 1);
  assert.ok(flows[0].id.includes('status-reach:307'));
  assert.strictEqual(flows[0].steps[0].method, 'POST');
  assert.strictEqual(flows[0].steps[1].status, 307);
});

// ---------------------------------------------------------------------------
// 308 — permanent redirect (preserve method)
// ---------------------------------------------------------------------------

test('emits 308 redirect flow', () => {
  const ep = makeEp('PUT', '/api/v1/redir-308', [308]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set(), diag);
  assert.strictEqual(flows.length, 1);
  assert.ok(flows[0].id.includes('status-reach:308'));
  assert.strictEqual(flows[0].steps[1].status, 308);
});

// ---------------------------------------------------------------------------
// 304 — conditional GET (If-None-Match)
// ---------------------------------------------------------------------------

test('emits 304 conditional flow with If-None-Match header', () => {
  const ep = makeEp('GET', '/api/v1/conditional', [200, 304]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([200]), diag);
  assert.strictEqual(flows.length, 1);
  const flow = flows[0];
  assert.ok(flow.id.includes('status-reach:304'));
  assert.strictEqual(flow.steps[0].kind, 'api');
  assert.strictEqual(flow.steps[0].headers['If-None-Match'], '"stale-etag-probe-00000"');
  assert.strictEqual(flow.steps[1].status, 304);
});

// ---------------------------------------------------------------------------
// 405 — method not allowed
// ---------------------------------------------------------------------------

test('emits 405 flow with wrong HTTP method', () => {
  const ep = makeEp('POST', '/api/v1/create', [201, 405]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([201]), diag);
  assert.strictEqual(flows.length, 1);
  const flow = flows[0];
  assert.ok(flow.id.includes('status-reach:405'));
  assert.strictEqual(flow.steps[0].kind, 'api');
  // Wrong method should be GET (since endpoint is POST)
  assert.strictEqual(flow.steps[0].method, 'GET');
  assert.strictEqual(flow.steps[0].path, '/api/v1/create');
  assert.strictEqual(flow.steps[1].status, 405);
});

test('emits 405 flow with DELETE as wrong method for GET endpoint', () => {
  const ep = makeEp('GET', '/api/v1/read', [200, 405]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([200]), diag);
  assert.strictEqual(flows.length, 1);
  assert.strictEqual(flows[0].steps[0].method, 'DELETE');
});

// Self-rejection branch: when an endpoint declares ONLY 405 (no 2xx success
// status), the endpoint itself is a 405-thrower (e.g. a GET fallback whose
// only purpose is to return 405 for an otherwise POST-only path). The wrong-
// method probe would never reach it (would 404 instead). The 405 emitter
// must dispatch on declaration shape — status set composition — and probe
// the endpoint's own method when no 2xx is declared.
test('emits 405 self-method flow when endpoint declares only 405 (no 2xx)', () => {
  const ep = makeEp('GET', '/api/v1/method-restricted', [405]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set(), diag);
  assert.strictEqual(flows.length, 1);
  const flow = flows[0];
  assert.ok(flow.id.includes('status-reach:405'));
  // Probe must call the endpoint's OWN method, not a wrong method.
  assert.strictEqual(flow.steps[0].method, 'GET');
  assert.strictEqual(flow.steps[0].path, '/api/v1/method-restricted');
  assert.strictEqual(flow.steps[1].status, 405);
});

test('emits 405 self-method flow for POST-only 405 endpoint (no 2xx)', () => {
  const ep = makeEp('POST', '/api/v1/blocked', [405]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set(), diag);
  assert.strictEqual(flows.length, 1);
  // Calls own method, not wrong method.
  assert.strictEqual(flows[0].steps[0].method, 'POST');
  assert.strictEqual(flows[0].steps[1].status, 405);
});

test('still uses wrong-method probe when endpoint declares 2xx alongside 405', () => {
  // Mixed declaration shape: endpoint serves a 2xx happy path AND declares
  // 405 for wrong methods. Must use wrong-method probe (existing behavior).
  const ep = makeEp('POST', '/api/v1/create', [201, 405]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([201]), diag);
  assert.strictEqual(flows.length, 1);
  // Wrong method, not own method.
  assert.notStrictEqual(flows[0].steps[0].method, 'POST');
  assert.strictEqual(flows[0].steps[1].status, 405);
});

// ---------------------------------------------------------------------------
// 410 — gone
// ---------------------------------------------------------------------------

test('emits 410 gone flow with statusAnyOf [410, 404]', () => {
  const ep = makeEp('GET', '/api/v1/items/:id', [200, 410]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([200]), diag);
  assert.strictEqual(flows.length, 1);
  const flow = flows[0];
  assert.ok(flow.id.includes('status-reach:410'));
  assert.strictEqual(flow.steps[0].path, '/api/v1/items/non-existent-id-00000');
  assert.deepStrictEqual(flow.steps[1].statusAnyOf, [410, 404]);
});

// ---------------------------------------------------------------------------
// 412 — precondition failed
// ---------------------------------------------------------------------------

test('emits 412 precondition failed flow with wrong If-Match', () => {
  const ep = makeEp('PUT', '/api/v1/items/:id', [200, 412]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([200]), diag);
  assert.strictEqual(flows.length, 1);
  const flow = flows[0];
  assert.ok(flow.id.includes('status-reach:412'));
  assert.strictEqual(flow.steps[0].headers['If-Match'], '"wrong-etag-probe-00000"');
  assert.strictEqual(flow.steps[1].status, 412);
});

// ---------------------------------------------------------------------------
// 415 — unsupported media type
// ---------------------------------------------------------------------------

test('emits 415 unsupported media type flow with text/plain Content-Type', () => {
  const ep = makeEp('POST', '/api/v1/json-only', [201, 415]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([201]), diag);
  assert.strictEqual(flows.length, 1);
  const flow = flows[0];
  assert.ok(flow.id.includes('status-reach:415'));
  assert.strictEqual(flow.steps[0].headers['Content-Type'], 'text/plain');
  assert.strictEqual(flow.steps[0].body, 'probe-unsupported-media-type');
  assert.strictEqual(flow.steps[1].status, 415);
});

// ---------------------------------------------------------------------------
// 428 — precondition required
// ---------------------------------------------------------------------------

test('emits 428 precondition required flow without If-Match header', () => {
  const ep = makeEp('PUT', '/api/v1/require-precond', [200, 428]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([200]), diag);
  assert.strictEqual(flows.length, 1);
  const flow = flows[0];
  assert.ok(flow.id.includes('status-reach:428'));
  assert.strictEqual(flow.steps[0].kind, 'api');
  assert.strictEqual(flow.steps[0].method, 'PUT');
  // Should NOT have If-Match header
  assert.ok(!flow.steps[0].headers || !flow.steps[0].headers['If-Match']);
  assert.strictEqual(flow.steps[1].status, 428);
});

test('emits 428 flow with body when zodContract is present', () => {
  const ep = makeEp('PUT', '/api/v1/require-precond', [200, 428], {
    zodContract: {
      schemaRef: 'UpdateItem',
      sampleValid: { title: 'test', authorName: 'Author' },
      fields: [{ name: 'title' }, { name: 'authorName' }],
    },
  });
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([200]), diag);
  assert.strictEqual(flows.length, 1);
  const flow = flows[0];
  assert.ok(flow.steps[0].body);
  assert.ok(flow.steps[0].body.title);
});

// ---------------------------------------------------------------------------
// 429 — too many requests (rate limiting)
// ---------------------------------------------------------------------------

test('emits 429 rate limit flow with burst steps', () => {
  const ep = makeEp('GET', '/api/v1/rate-limited', [200, 429]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([200]), diag);
  assert.strictEqual(flows.length, 1);
  const flow = flows[0];
  assert.ok(flow.id.includes('status-reach:429'));
  // Should have multiple api steps (burst)
  const apiSteps = flow.steps.filter((s) => s.kind === 'api');
  assert.ok(apiSteps.length >= 5, `Expected at least 5 burst api steps, got ${apiSteps.length}`);
  // All api steps target the same path
  for (const step of apiSteps) {
    assert.strictEqual(step.path, '/api/v1/rate-limited');
  }
  // Last expect step should accept either 429 or 200/201
  const lastExpect = flow.steps[flow.steps.length - 1];
  assert.strictEqual(lastExpect.kind, 'expect');
  assert.ok(lastExpect.statusAnyOf.includes(429));
});

// ---------------------------------------------------------------------------
// 451 — unavailable for legal reasons
// ---------------------------------------------------------------------------

test('emits 451 legal block flow with Link header assertion', () => {
  const ep = makeEp('GET', '/api/v1/legal-block', [451]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set(), diag);
  assert.strictEqual(flows.length, 1);
  const flow = flows[0];
  assert.ok(flow.id.includes('status-reach:451'));
  assert.strictEqual(flow.steps[1].status, 451);
  assert.ok(flow.steps[1].bodyHas.includes('header:link'));
});

// ---------------------------------------------------------------------------
// 206 — partial content (Range request)
// ---------------------------------------------------------------------------

test('emits 206 partial content flow with Range header and Content-Range assertion', () => {
  const ep = makeEp('GET', '/api/v1/download', [200, 206]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([200]), diag);
  assert.strictEqual(flows.length, 1);
  const flow = flows[0];
  assert.ok(flow.id.includes('status-reach:206'));
  assert.strictEqual(flow.steps[0].headers['Range'], 'bytes=0-99');
  assert.strictEqual(flow.steps[1].status, 206);
  assert.ok(flow.steps[1].bodyHas.includes('header:content-range'));
});

// ---------------------------------------------------------------------------
// Diagnostic for unknown status codes
// ---------------------------------------------------------------------------

test('emits diagnostic for unhandled status codes', () => {
  const ep = makeEp('GET', '/api/v1/custom', [299]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set(), diag);
  assert.strictEqual(flows.length, 0);
  assert.strictEqual(diag.length, 1);
  assert.strictEqual(diag[0].code, 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE');
  assert.ok(diag[0].message.includes('299'));
});

// ---------------------------------------------------------------------------
// Multiple statuses at once
// ---------------------------------------------------------------------------

test('emits flows for multiple declared statuses on same endpoint', () => {
  const ep = makeEp('PUT', '/api/v1/items/:id', [200, 404, 412, 428]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([200]), diag);
  assert.strictEqual(flows.length, 3); // 404, 412, 428
  const statusCodes = flows.map((f) => {
    const expect = f.steps.find((s) => s.kind === 'expect');
    return expect.status || (expect.statusAnyOf ? expect.statusAnyOf[0] : null);
  });
  assert.ok(statusCodes.includes(404));
  assert.ok(statusCodes.includes(412));
  assert.ok(statusCodes.includes(428));
});

// ---------------------------------------------------------------------------
// Flow metadata structure
// ---------------------------------------------------------------------------

test('flow has correct contract kind and source', () => {
  const ep = makeEp('GET', '/api/v1/items/:id', [404]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set(), diag);
  const flow = flows[0];
  assert.strictEqual(flow.contract.kind, 'status-reachability');
  assert.strictEqual(flow.contract.endpoint, 'GET /api/v1/items/:id');
  assert.strictEqual(flow.contract.source, 'test-controller.ts');
  assert.deepStrictEqual(flow.dependsOn, []);
  assert.ok(flow.onFail.check.includes('test-controller.ts'));
});

// ---------------------------------------------------------------------------
// 3xx: non-redirect statuses in 300 range are NOT matched by redirect handler
// ---------------------------------------------------------------------------

test('does not emit redirect flow for non-redirect 3xx (e.g. 300, 303, 305, 306)', () => {
  const ep = makeEp('GET', '/api/v1/test', [300, 303, 305, 306]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set(), diag);
  // 304 handled separately, 300/303/305/306 should go to diagnostic fallback
  assert.strictEqual(flows.length, 0);
  assert.strictEqual(diag.length, 4);
  for (const d of diag) {
    assert.strictEqual(d.code, 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE');
  }
});

// ---------------------------------------------------------------------------
// 502 — bad gateway
// ---------------------------------------------------------------------------

test('emits 502 bad gateway flow', () => {
  const ep = makeEp('GET', '/api/v1/gateway-502', [200, 502]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([200]), diag);
  assert.strictEqual(flows.length, 1);
  const flow = flows[0];
  assert.ok(flow.id.includes('status-reach:502'));
  assert.strictEqual(flow.steps[0].method, 'GET');
  assert.strictEqual(flow.steps[0].path, '/api/v1/gateway-502');
  assert.strictEqual(flow.steps[1].status, 502);
  assert.strictEqual(diag.length, 0);
});

// ---------------------------------------------------------------------------
// 503 — service unavailable
// ---------------------------------------------------------------------------

test('emits 503 service unavailable flow', () => {
  const ep = makeEp('GET', '/api/v1/service-unavailable', [200, 503]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([200]), diag);
  assert.strictEqual(flows.length, 1);
  const flow = flows[0];
  assert.ok(flow.id.includes('status-reach:503'));
  assert.strictEqual(flow.steps[0].method, 'GET');
  assert.strictEqual(flow.steps[0].path, '/api/v1/service-unavailable');
  assert.strictEqual(flow.steps[1].status, 503);
  assert.strictEqual(diag.length, 0);
});

// ---------------------------------------------------------------------------
// 504 — gateway timeout
// ---------------------------------------------------------------------------

test('emits 504 gateway timeout flow', () => {
  const ep = makeEp('GET', '/api/v1/gateway-timeout', [200, 504]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([200]), diag);
  assert.strictEqual(flows.length, 1);
  const flow = flows[0];
  assert.ok(flow.id.includes('status-reach:504'));
  assert.strictEqual(flow.steps[0].method, 'GET');
  assert.strictEqual(flow.steps[0].path, '/api/v1/gateway-timeout');
  assert.strictEqual(flow.steps[1].status, 504);
  assert.strictEqual(diag.length, 0);
});

test('502/503/504 no longer fall to diagnostic fallback', () => {
  const ep = makeEp('GET', '/api/v1/gateway', [200, 502, 503, 504]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([200]), diag);
  assert.strictEqual(flows.length, 3);
  assert.strictEqual(diag.length, 0);
  const ids = flows.map(f => f.id);
  assert.ok(ids.some(id => id.includes('502')));
  assert.ok(ids.some(id => id.includes('503')));
  assert.ok(ids.some(id => id.includes('504')));
});

// ---------------------------------------------------------------------------
// 422 validation error — Commit G
// ---------------------------------------------------------------------------

test('emits 422 flow for POST with zodContract (empty body triggers validation)', () => {
  const ep = makeEp('POST', '/api/v1/items', [200, 422], {
    zodContract: { schemaRef: 'CreateItem', sampleValid: { name: 'test' }, fields: [{ name: 'name' }] },
  });
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([200]), diag);
  assert.strictEqual(flows.length, 1);
  const flow = flows[0];
  assert.ok(flow.id.includes('status-reach:422'));
  assert.strictEqual(flow.steps[0].method, 'POST');
  // Body should be empty to trigger validation
  assert.deepStrictEqual(flow.steps[0].body, {});
  // Expect 400 or 422
  assert.deepStrictEqual(flow.steps[1].statusAnyOf, [400, 422]);
  assert.strictEqual(diag.length, 0);
});

test('emits 422 flow for PUT with zodContract', () => {
  const ep = makeEp('PUT', '/api/v1/items/:id', [200, 422], {
    zodContract: { schemaRef: 'UpdateItem', sampleValid: { title: 'x' }, fields: [{ name: 'title' }] },
  });
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([200]), diag);
  assert.strictEqual(flows.length, 1);
  const flow = flows[0];
  assert.ok(flow.id.includes('status-reach:422'));
  assert.strictEqual(flow.steps[0].method, 'PUT');
  assert.deepStrictEqual(flow.steps[0].body, {});
  assert.strictEqual(diag.length, 0);
});

test('emits 422 flow for GET with queryContract (omit required query params)', () => {
  const ep = makeEp('GET', '/api/v1/search', [200, 422], {
    queryContract: {
      schemaRef: 'SearchQuery',
      sampleValid: { q: 'test' },
      fields: [{ name: 'q', required: true }],
    },
  });
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([200]), diag);
  assert.strictEqual(flows.length, 1);
  const flow = flows[0];
  assert.ok(flow.id.includes('status-reach:422'));
  assert.strictEqual(flow.steps[0].method, 'GET');
  // No query params sent — triggers validation
  assert.strictEqual(flow.steps[0].query, undefined);
  assert.deepStrictEqual(flow.steps[1].statusAnyOf, [400, 422]);
  assert.strictEqual(diag.length, 0);
});

test('emits UNGENERATABLE diagnostic for GET without queryContract declaring 422', () => {
  const ep = makeEp('GET', '/api/v1/nested-error', [200, 422]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([200]), diag);
  // No flow emitted for 422
  const flow422 = flows.find(f => f.id.includes('status-reach:422'));
  assert.strictEqual(flow422, undefined, 'should not emit flow for 422 on GET without query validation');
  // Diagnostic emitted
  assert.strictEqual(diag.length, 1);
  assert.strictEqual(diag[0].code, 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE');
  assert.ok(diag[0].message.includes('422'));
  assert.ok(diag[0].message.includes('no validatable input'));
});

test('emits UNGENERATABLE diagnostic for DELETE without queryContract declaring 422', () => {
  const ep = makeEp('DELETE', '/api/v1/items/:id', [200, 422]);
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([200]), diag);
  const flow422 = flows.find(f => f.id.includes('status-reach:422'));
  assert.strictEqual(flow422, undefined);
  assert.strictEqual(diag.length, 1);
  assert.strictEqual(diag[0].code, 'CONTRACT_STATUS_UNREACHABLE_UNGENERATABLE');
});

test('422 skipped when already in coveredStatuses', () => {
  const ep = makeEp('POST', '/api/v1/items', [200, 422], {
    zodContract: { schemaRef: 'CreateItem', sampleValid: { name: 'test' }, fields: [{ name: 'name' }] },
  });
  const diag = [];
  const flows = emitStatusReachabilityFlows(ep, new Set([200, 422]), diag);
  const flow422 = flows.find(f => f.id.includes('status-reach:422'));
  assert.strictEqual(flow422, undefined, '422 already covered — skip');
  assert.strictEqual(diag.length, 0);
});
