'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  emitPaginationFlows,
} = require('../flows-generator');

// ---------------------------------------------------------------------------
// Helper: minimal endpoint factory for paginated endpoints
// ---------------------------------------------------------------------------

function makeOffsetEp(path, overrides = {}) {
  return {
    method: 'GET',
    path,
    file: 'src/modules/items/items.controller.ts',
    operationId: 'listItems',
    paginationProfile: {
      style: 'offset',
      paramNames: { page: 'page', limit: 'limit' },
      responseKeys: { items: 'items', total: 'total' },
      isBareArray: false,
      maxLimit: 100,
      defaultLimit: 20,
      constraints: {},
      queryContract: {
        schemaRef: 'pagination-query',
        fields: [
          { name: 'page', type: 'number', required: false, constraints: {}, samples: { valid: 1 } },
          { name: 'limit', type: 'number', required: false, constraints: { max: 100 }, samples: { valid: 20 } },
        ],
        sampleValid: { page: 1, limit: 20 },
        diagnostics: [],
      },
    },
    swaggerDeclared: { statuses: [200] },
    authDecorators: { authRequired: false },
    ...overrides,
  };
}

function makeCursorEp(path, overrides = {}) {
  return {
    method: 'GET',
    path,
    file: 'src/modules/items/items.controller.ts',
    operationId: 'listItems',
    paginationProfile: {
      style: 'cursor',
      paramNames: { cursor: 'cursor', limit: 'limit' },
      responseKeys: { items: 'items', nextCursor: 'nextCursor' },
      isBareArray: false,
      maxLimit: 50,
      defaultLimit: 10,
      constraints: {},
      queryContract: {
        schemaRef: 'pagination-query',
        fields: [
          { name: 'cursor', type: 'string', required: false, constraints: {}, samples: { valid: 'xxx' } },
          { name: 'limit', type: 'number', required: false, constraints: { max: 50 }, samples: { valid: 10 } },
        ],
        sampleValid: { limit: 10 },
        diagnostics: [],
      },
    },
    swaggerDeclared: { statuses: [200] },
    authDecorators: { authRequired: false },
    ...overrides,
  };
}

function makeLinkHeaderEp(path, overrides = {}) {
  return {
    method: 'GET',
    path,
    file: 'src/modules/items/items.controller.ts',
    operationId: 'listItems',
    paginationProfile: {
      style: 'link-header',
      paramNames: { page: 'page', limit: 'limit' },
      responseKeys: {},
      isBareArray: true,
      maxLimit: 100,
      defaultLimit: 20,
      constraints: {},
      queryContract: {
        schemaRef: 'pagination-query',
        fields: [
          { name: 'page', type: 'number', required: false, constraints: {}, samples: { valid: 1 } },
          { name: 'limit', type: 'number', required: false, constraints: { max: 100 }, samples: { valid: 20 } },
        ],
        sampleValid: { page: 1, limit: 20 },
        diagnostics: [],
      },
    },
    swaggerDeclared: { statuses: [200] },
    authDecorators: { authRequired: false },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// emitPaginationFlows — empty cases
// ---------------------------------------------------------------------------

test('emitPaginationFlows: returns empty for no endpoints', () => {
  assert.deepStrictEqual(emitPaginationFlows([]), []);
});

test('emitPaginationFlows: returns empty for non-paginated endpoints', () => {
  const ep = makeOffsetEp('/api/v1/items');
  ep.paginationProfile = null;
  assert.deepStrictEqual(emitPaginationFlows([ep]), []);
});

test('emitPaginationFlows: skips non-GET endpoints', () => {
  const ep = makeOffsetEp('/api/v1/items');
  ep.method = 'POST';
  assert.deepStrictEqual(emitPaginationFlows([ep]), []);
});

// ---------------------------------------------------------------------------
// Offset-style flows
// ---------------------------------------------------------------------------

test('emitPaginationFlows: offset style emits first-page, past-end, empty, max-limit, over-max-limit', () => {
  const flows = emitPaginationFlows([makeOffsetEp('/api/v1/items')]);
  const ids = flows.map((f) => f.id);

  assert.ok(ids.some((id) => id.includes(':pagination:first-page')), 'should have first-page');
  assert.ok(ids.some((id) => id.includes(':pagination:past-end')), 'should have past-end');
  assert.ok(ids.some((id) => id.includes(':pagination:empty')), 'should have empty');
  assert.ok(ids.some((id) => id.includes(':pagination:max-limit')), 'should have max-limit');
  assert.ok(ids.some((id) => id.includes(':pagination:over-max-limit')), 'should have over-max-limit');
});

test('emitPaginationFlows: offset first-page has correct query and bodyHas', () => {
  const flows = emitPaginationFlows([makeOffsetEp('/api/v1/items')]);
  const fp = flows.find((f) => f.id.includes(':first-page'));

  assert.ok(fp);
  const apiStep = fp.steps.find((s) => s.kind === 'api');
  assert.strictEqual(apiStep.query.page, 1);
  assert.strictEqual(apiStep.query.limit, 20);
  const expectStep = fp.steps.find((s) => s.kind === 'expect');
  assert.strictEqual(expectStep.status, 200);
  assert.ok(expectStep.bodyHas.includes('items'));
  assert.ok(expectStep.bodyIsArray.includes('items'));
});

test('emitPaginationFlows: offset past-end uses page=999999', () => {
  const flows = emitPaginationFlows([makeOffsetEp('/api/v1/items')]);
  const pe = flows.find((f) => f.id.includes(':past-end'));

  assert.ok(pe);
  const apiStep = pe.steps.find((s) => s.kind === 'api');
  assert.strictEqual(apiStep.query.page, 999999);
  const expectStep = pe.steps.find((s) => s.kind === 'expect');
  assert.strictEqual(expectStep.status, 200);
  assert.ok(expectStep.bodyArrayEmpty.includes('items'));
});

test('emitPaginationFlows: offset max-limit uses maxLimit value', () => {
  const flows = emitPaginationFlows([makeOffsetEp('/api/v1/items')]);
  const ml = flows.find((f) => f.id.includes(':max-limit') && !f.id.includes('over-'));

  assert.ok(ml);
  const apiStep = ml.steps.find((s) => s.kind === 'api');
  assert.strictEqual(apiStep.query.limit, 100);
});

test('emitPaginationFlows: offset over-max-limit uses maxLimit+1 and expects 400', () => {
  const flows = emitPaginationFlows([makeOffsetEp('/api/v1/items')]);
  const oml = flows.find((f) => f.id.includes(':over-max-limit'));

  assert.ok(oml);
  const apiStep = oml.steps.find((s) => s.kind === 'api');
  assert.strictEqual(apiStep.query.limit, 101);
  const expectStep = oml.steps.find((s) => s.kind === 'expect');
  assert.strictEqual(expectStep.status, 400);
});

test('emitPaginationFlows: offset without maxLimit skips max-limit and over-max-limit', () => {
  const ep = makeOffsetEp('/api/v1/items');
  ep.paginationProfile.maxLimit = null;
  const flows = emitPaginationFlows([ep]);
  const ids = flows.map((f) => f.id);

  assert.ok(!ids.some((id) => id.includes(':max-limit')), 'should not have max-limit');
  assert.ok(!ids.some((id) => id.includes(':over-max-limit')), 'should not have over-max-limit');
});

// ---------------------------------------------------------------------------
// Cursor-style flows
// ---------------------------------------------------------------------------

test('emitPaginationFlows: cursor style emits first-page, past-end, empty, invalid-cursor', () => {
  const flows = emitPaginationFlows([makeCursorEp('/api/v1/items')]);
  const ids = flows.map((f) => f.id);

  assert.ok(ids.some((id) => id.includes(':pagination:first-page')), 'should have first-page');
  assert.ok(ids.some((id) => id.includes(':pagination:past-end')), 'should have past-end (Bug #2 fix)');
  assert.ok(ids.some((id) => id.includes(':pagination:empty')), 'should have empty');
  assert.ok(ids.some((id) => id.includes(':pagination:invalid-cursor')), 'should have invalid-cursor');
});

test('emitPaginationFlows: cursor past-end uses exhausted cursor value', () => {
  const flows = emitPaginationFlows([makeCursorEp('/api/v1/items')]);
  const pe = flows.find((f) => f.id.includes(':past-end'));

  assert.ok(pe, 'cursor past-end must exist');
  const apiStep = pe.steps.find((s) => s.kind === 'api');
  assert.strictEqual(apiStep.query.cursor, '__exhausted_cursor_past_end__');
  const expectStep = pe.steps.find((s) => s.kind === 'expect');
  assert.deepStrictEqual(expectStep.statusAnyOf, [200, 400]);
});

test('emitPaginationFlows: cursor invalid-cursor uses __invalid_cursor_value__', () => {
  const flows = emitPaginationFlows([makeCursorEp('/api/v1/items')]);
  const ic = flows.find((f) => f.id.includes(':invalid-cursor'));

  assert.ok(ic);
  const apiStep = ic.steps.find((s) => s.kind === 'api');
  assert.strictEqual(apiStep.query.cursor, '__invalid_cursor_value__');
  const expectStep = ic.steps.find((s) => s.kind === 'expect');
  assert.strictEqual(expectStep.status, 400);
});

test('emitPaginationFlows: cursor first-page does not include cursor in query', () => {
  const flows = emitPaginationFlows([makeCursorEp('/api/v1/items')]);
  const fp = flows.find((f) => f.id.includes(':first-page'));

  assert.ok(fp);
  const apiStep = fp.steps.find((s) => s.kind === 'api');
  // First page should only have limit, not cursor
  assert.strictEqual(apiStep.query.cursor, undefined);
  assert.strictEqual(apiStep.query.limit, 10);
});

// ---------------------------------------------------------------------------
// Link-header style flows
// ---------------------------------------------------------------------------

test('emitPaginationFlows: link-header style emits first-page with bodyIsRootArray', () => {
  const flows = emitPaginationFlows([makeLinkHeaderEp('/api/v1/items')]);
  const fp = flows.find((f) => f.id.includes(':first-page'));

  assert.ok(fp);
  const expectStep = fp.steps.find((s) => s.kind === 'expect');
  assert.strictEqual(expectStep.bodyIsRootArray, true);
  assert.strictEqual(expectStep.bodyHas, undefined);
});

test('emitPaginationFlows: link-header past-end has bodyRootArrayEmpty', () => {
  const flows = emitPaginationFlows([makeLinkHeaderEp('/api/v1/items')]);
  const pe = flows.find((f) => f.id.includes(':past-end'));

  assert.ok(pe);
  const expectStep = pe.steps.find((s) => s.kind === 'expect');
  assert.strictEqual(expectStep.bodyIsRootArray, true);
  assert.strictEqual(expectStep.bodyRootArrayEmpty, true);
});

// ---------------------------------------------------------------------------
// :empty flow — filter param selection (Bug #5 fix)
// ---------------------------------------------------------------------------

test('emitPaginationFlows: empty flow uses declared string filter param when available', () => {
  const ep = makeOffsetEp('/api/v1/items');
  ep.paginationProfile.queryContract.fields.push({
    name: 'search', type: 'string', required: false, constraints: {},
    samples: { valid: 'test' },
  });
  const flows = emitPaginationFlows([ep]);
  const empty = flows.find((f) => f.id.includes(':empty'));

  assert.ok(empty);
  const apiStep = empty.steps.find((s) => s.kind === 'api');
  assert.strictEqual(apiStep.query.search, '__never_exists_probe_filter__');
  assert.strictEqual(apiStep.query.title, undefined, 'should not use hardcoded title');
});

test('emitPaginationFlows: empty flow falls back to title when no string filter params declared', () => {
  const flows = emitPaginationFlows([makeOffsetEp('/api/v1/items')]);
  const empty = flows.find((f) => f.id.includes(':empty'));

  assert.ok(empty);
  const apiStep = empty.steps.find((s) => s.kind === 'api');
  assert.strictEqual(apiStep.query.title, '__never_exists_probe_filter__');
});

test('emitPaginationFlows: empty flow skips cursor/offset/limit params as filter candidates', () => {
  const ep = makeCursorEp('/api/v1/items');
  // All declared fields are cursor/limit — should fall back to 'title'
  const flows = emitPaginationFlows([ep]);
  const empty = flows.find((f) => f.id.includes(':empty'));

  assert.ok(empty);
  const apiStep = empty.steps.find((s) => s.kind === 'api');
  assert.strictEqual(apiStep.query.title, '__never_exists_probe_filter__');
});

// ---------------------------------------------------------------------------
// Envelope wrapping
// ---------------------------------------------------------------------------

test('emitPaginationFlows: respects envelopeWrapper option for non-bare-array endpoints', () => {
  const flows = emitPaginationFlows([makeOffsetEp('/api/v1/items')], { envelopeWrapper: 'data' });
  const fp = flows.find((f) => f.id.includes(':first-page'));

  assert.ok(fp);
  const expectStep = fp.steps.find((s) => s.kind === 'expect');
  assert.ok(expectStep.bodyHas.includes('data.items'));
  assert.ok(expectStep.bodyIsArray.includes('data.items'));
});

test('emitPaginationFlows: link-header style ignores envelopeWrapper', () => {
  const flows = emitPaginationFlows([makeLinkHeaderEp('/api/v1/items')], { envelopeWrapper: 'data' });
  const fp = flows.find((f) => f.id.includes(':first-page'));

  assert.ok(fp);
  const expectStep = fp.steps.find((s) => s.kind === 'expect');
  assert.strictEqual(expectStep.bodyIsRootArray, true);
  assert.strictEqual(expectStep.bodyHas, undefined);
});

// ---------------------------------------------------------------------------
// Multiple endpoints
// ---------------------------------------------------------------------------

test('emitPaginationFlows: handles multiple endpoints independently', () => {
  const flows = emitPaginationFlows([
    makeOffsetEp('/api/v1/items'),
    makeCursorEp('/api/v1/comments'),
  ]);

  const itemFlows = flows.filter((f) => f.id.includes('items:'));
  const commentFlows = flows.filter((f) => f.id.includes('comments:'));

  assert.ok(itemFlows.length > 0, 'should have item flows');
  assert.ok(commentFlows.length > 0, 'should have comment flows');

  // Items (offset) should have past-end with page=999999
  const itemPastEnd = itemFlows.find((f) => f.id.includes(':past-end'));
  assert.ok(itemPastEnd);
  assert.strictEqual(itemPastEnd.steps[0].query.page, 999999);

  // Comments (cursor) should have past-end with cursor sigil
  const commentPastEnd = commentFlows.find((f) => f.id.includes(':past-end'));
  assert.ok(commentPastEnd, 'cursor endpoint should have past-end flow');
  assert.strictEqual(commentPastEnd.steps[0].query.cursor, '__exhausted_cursor_past_end__');
});

// ---------------------------------------------------------------------------
// Link-header :no-next flow
// ---------------------------------------------------------------------------

test('emitPaginationFlows: link-header emits :no-next flow', () => {
  const ep = makeLinkHeaderEp('/api/v1/list-links');
  const flows = emitPaginationFlows([ep]);
  const noNext = flows.find((f) => f.id.includes(':no-next'));
  assert.ok(noNext, 'should emit :no-next flow for link-header style');
  assert.ok(noNext.id.endsWith(':get:pagination:no-next'));
  // Should request page=999999 (past end)
  assert.strictEqual(noNext.steps[0].query.page, 999999);
  // Should expect 200
  assert.strictEqual(noNext.steps[1].status, 200);
  // Should assert absence of rel="next" in Link header
  const absentStep = noNext.steps.find((s) => s.headerAbsent);
  assert.ok(absentStep, 'should have headerAbsent assertion step');
  assert.strictEqual(absentStep.headerAbsent, 'link:rel="next"');
});

test('emitPaginationFlows: offset style does NOT emit :no-next flow', () => {
  const ep = makeOffsetEp('/api/v1/list-offset');
  const flows = emitPaginationFlows([ep]);
  const noNext = flows.find((f) => f.id.includes(':no-next'));
  assert.strictEqual(noNext, undefined, 'offset style should not have :no-next flow');
});

test('emitPaginationFlows: cursor style does NOT emit :no-next flow', () => {
  const ep = makeCursorEp('/api/v1/list-cursor');
  const flows = emitPaginationFlows([ep]);
  const noNext = flows.find((f) => f.id.includes(':no-next'));
  assert.strictEqual(noNext, undefined, 'cursor style should not have :no-next flow');
});
