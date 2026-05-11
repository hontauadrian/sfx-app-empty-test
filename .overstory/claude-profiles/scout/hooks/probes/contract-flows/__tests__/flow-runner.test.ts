/**
 * Tests for contract-flows/flow-runner.ts pure helpers.
 *
 * Coverage:
 *   - applyPathPrefix(): empty prefix, absolute URLs, idempotent guard,
 *     prefix-prefix substring trap, leading-slash normalisation, query
 *     strings, deep prefixes.
 *
 * Live HTTP integration is exercised by `pnpm probe:smoke`, not here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyPathPrefix, topoSortFlows } from '../flow-runner';
import type { AttributedSpecialFlow } from '../contract-flows-merger';

// Build a minimal AttributedSpecialFlow stub for the topo-sort tests.
// The sort only reads `flow.id` and `flow.dependsOn`; the rest is
// inert padding to satisfy the interface so we don't ship a fixture
// merged contract for a unit test.
function makeFlow(id: string, dependsOn: string[] = []): AttributedSpecialFlow {
  return {
    flow: { id, description: id, steps: [], dependsOn } as never,
    sourceFile: 'test',
  } as never;
}

function ids(flows: AttributedSpecialFlow[]): string[] {
  return flows.map((f) => f.flow.id);
}

test('applyPathPrefix: returns the path unchanged when prefix is empty', () => {
  assert.equal(applyPathPrefix('/health', ''), '/health');
  assert.equal(applyPathPrefix('/probe-ref/auth-flows/me', ''), '/probe-ref/auth-flows/me');
});

test('applyPathPrefix: passes absolute http URLs through untouched', () => {
  assert.equal(applyPathPrefix('http://localhost:3001/foo', '/api/v1'), 'http://localhost:3001/foo');
  assert.equal(applyPathPrefix('https://example.com/bar', '/api/v1'), 'https://example.com/bar');
});

test('applyPathPrefix: prepends the prefix to a relative path that does not have it', () => {
  assert.equal(applyPathPrefix('/probe-ref/auth-flows/me', '/api/v1'), '/api/v1/probe-ref/auth-flows/me');
  assert.equal(applyPathPrefix('/health', '/api/v1'), '/api/v1/health');
});

test('applyPathPrefix: is idempotent — paths that already start with the prefix are unchanged', () => {
  assert.equal(applyPathPrefix('/api/v1/health', '/api/v1'), '/api/v1/health');
  assert.equal(applyPathPrefix('/api/v1/probe-ref/auth-flows/me', '/api/v1'), '/api/v1/probe-ref/auth-flows/me');
});

test('applyPathPrefix: handles a path equal to exactly the prefix', () => {
  assert.equal(applyPathPrefix('/api/v1', '/api/v1'), '/api/v1');
});

test('applyPathPrefix: does not match a prefix-prefix substring (avoids /api/v1 matching /api/v10)', () => {
  assert.equal(applyPathPrefix('/api/v10/foo', '/api/v1'), '/api/v1/api/v10/foo');
});

test('applyPathPrefix: normalises a prefix without leading slash', () => {
  assert.equal(applyPathPrefix('/health', 'api/v1'), '/api/v1/health');
  assert.equal(applyPathPrefix('/api/v1/health', 'api/v1'), '/api/v1/health');
});

test('applyPathPrefix: handles a relative path without leading slash', () => {
  assert.equal(applyPathPrefix('probe-ref/auth-flows/me', '/api/v1'), '/api/v1/probe-ref/auth-flows/me');
});

test('applyPathPrefix: preserves query strings on relative paths', () => {
  assert.equal(applyPathPrefix('/probe-ref/list?page=2', '/api/v1'), '/api/v1/probe-ref/list?page=2');
});

test('applyPathPrefix: handles a deep prefix', () => {
  assert.equal(applyPathPrefix('/foo', '/svc/api/v1'), '/svc/api/v1/foo');
  assert.equal(applyPathPrefix('/svc/api/v1/foo', '/svc/api/v1'), '/svc/api/v1/foo');
});

test('topoSortFlows: empty input returns empty array', () => {
  assert.deepEqual(topoSortFlows([]), []);
});

test('topoSortFlows: flows with no dependencies preserve input order', () => {
  const a = makeFlow('a');
  const b = makeFlow('b');
  const c = makeFlow('c');
  assert.deepEqual(ids(topoSortFlows([a, b, c])), ['a', 'b', 'c']);
});

test('topoSortFlows: dependent appears after its dependency', () => {
  // Provided in reverse order — sorter must move the dependency first.
  const dependent = makeFlow('happy', ['chain:resource-setup:teams']);
  const chain = makeFlow('chain:resource-setup:teams');
  const sorted = ids(topoSortFlows([dependent, chain]));
  const chainIdx = sorted.indexOf('chain:resource-setup:teams');
  const happyIdx = sorted.indexOf('happy');
  assert.ok(
    chainIdx < happyIdx,
    `chain must precede dependent; got ${sorted.join(',')}`,
  );
});

test('topoSortFlows: chain of three flows resolves end-to-end', () => {
  const setup = makeFlow('setup');
  const middle = makeFlow('middle', ['setup']);
  const tail = makeFlow('tail', ['middle']);
  // Shuffle the input.
  const sorted = ids(topoSortFlows([tail, middle, setup]));
  assert.deepEqual(sorted, ['setup', 'middle', 'tail']);
});

test('topoSortFlows: ignores dependsOn entries that point at unknown ids', () => {
  // External dep (e.g. an auth-bootstrap flow handled outside this loop)
  // should not block the sort or push the flow to the end.
  const a = makeFlow('a', ['flow-not-in-this-set']);
  const b = makeFlow('b');
  const sorted = ids(topoSortFlows([a, b]));
  assert.equal(sorted.length, 2);
  assert.ok(sorted.includes('a'));
  assert.ok(sorted.includes('b'));
});

test('topoSortFlows: cycle falls back to original order', () => {
  // A → B → A is a cycle. Sorter must not loop forever or drop entries;
  // it should return the input verbatim so the caller can keep going
  // (the resource-graph builder reports cycles separately at load time).
  const a = makeFlow('a', ['b']);
  const b = makeFlow('b', ['a']);
  const sorted = topoSortFlows([a, b]);
  assert.equal(sorted.length, 2);
  assert.deepEqual(ids(sorted), ['a', 'b']);
});

test('topoSortFlows: diamond dependency — both branches before the join', () => {
  // root → left, root → right, both → join
  const root = makeFlow('root');
  const left = makeFlow('left', ['root']);
  const right = makeFlow('right', ['root']);
  const join = makeFlow('join', ['left', 'right']);
  const sorted = ids(topoSortFlows([join, right, left, root]));
  // Strict requirement: root before {left,right}, both before join.
  const idx = (id: string) => sorted.indexOf(id);
  assert.ok(idx('root') < idx('left'));
  assert.ok(idx('root') < idx('right'));
  assert.ok(idx('left') < idx('join'));
  assert.ok(idx('right') < idx('join'));
});
