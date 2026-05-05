/**
 * Tests for contract-flows/resource-graph.ts.
 *
 * Coverage:
 *   - Empty graph is fine (zero nodes).
 *   - Linear chain → topo order is parents-before-children.
 *   - Three-level chain (3+ depth — Decision 11.16).
 *   - Multi-root forest with deterministic lex-tiebreak ordering.
 *   - Diamond DAG.
 *   - Self-loop is a cycle.
 *   - Two-node mutual cycle is detected and surfaces FLOW_RESOURCE_CYCLE.
 *   - Unknown parent surfaces FLOW_RESOURCE_PARENT_MISSING.
 *   - ancestors() / descendants() / parents() / children() correctness.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildResourceGraph, type ResourceLike } from '../resource-graph';

function lib(name: string, parents: string[] = [], file = '/x.yaml'): ResourceLike {
  return {
    resource: { name, parents },
    sourceFile: file,
  };
}

test('empty graph builds without error and topo() returns []', () => {
  const r = buildResourceGraph(new Map());
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.graph.topo(), []);
});

test('linear chain a → b → c yields topo [a, b, c]', () => {
  const m = new Map([
    ['a', lib('a')],
    ['b', lib('b', ['a'])],
    ['c', lib('c', ['b'])],
  ]);
  const r = buildResourceGraph(m);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.graph.topo(), ['a', 'b', 'c']);
  assert.deepEqual(r.graph.parents('c'), ['b']);
  assert.deepEqual(r.graph.children('a'), ['b']);
  assert.deepEqual(r.graph.ancestors('c'), ['a', 'b']);
  assert.deepEqual(r.graph.descendants('a'), ['b', 'c']);
  assert.equal(r.graph.has('a'), true);
  assert.equal(r.graph.has('z'), false);
});

test('multi-root forest uses lex tiebreak for determinism', () => {
  const m = new Map([
    ['z', lib('z')],
    ['m', lib('m')],
    ['a', lib('a')],
  ]);
  const r = buildResourceGraph(m);
  assert.deepEqual(r.errors, []);
  // All three are roots — lex-sort produces ['a','m','z'].
  assert.deepEqual(r.graph.topo(), ['a', 'm', 'z']);
});

test('diamond DAG (a → {b,c} → d) topo orders parents before children', () => {
  const m = new Map([
    ['a', lib('a')],
    ['b', lib('b', ['a'])],
    ['c', lib('c', ['a'])],
    ['d', lib('d', ['b', 'c'])],
  ]);
  const r = buildResourceGraph(m);
  assert.deepEqual(r.errors, []);
  const order = r.graph.topo();
  assert.equal(order[0], 'a');
  assert.equal(order[order.length - 1], 'd');
  assert.ok(order.indexOf('b') < order.indexOf('d'));
  assert.ok(order.indexOf('c') < order.indexOf('d'));
  assert.deepEqual(r.graph.ancestors('d').sort(), ['a', 'b', 'c']);
  assert.deepEqual(r.graph.descendants('a').sort(), ['b', 'c', 'd']);
});

test('three-level chain (Decision 11.16 leaf-create) topo-sorts grandparent first', () => {
  const m = new Map([
    ['grandparent', lib('grandparent')],
    ['parent',      lib('parent', ['grandparent'])],
    ['child',       lib('child', ['parent'])],
  ]);
  const r = buildResourceGraph(m);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.graph.topo(), ['grandparent', 'parent', 'child']);
  assert.deepEqual(r.graph.ancestors('child'), ['grandparent', 'parent']);
});

test('self-loop is detected as a cycle', () => {
  const m = new Map([['a', lib('a', ['a'])]]);
  const r = buildResourceGraph(m);
  assert.equal(r.errors.length, 1);
  const err = r.errors[0];
  assert.equal(err.code, 'FLOW_RESOURCE_CYCLE');
  if (err.code === 'FLOW_RESOURCE_CYCLE') {
    assert.ok(err.cyclePath.includes('a'));
  }
  assert.throws(() => r.graph.topo(), /cycle/);
});

test('two-node mutual cycle a ⇄ b emits FLOW_RESOURCE_CYCLE', () => {
  const m = new Map([
    ['a', lib('a', ['b'])],
    ['b', lib('b', ['a'])],
  ]);
  const r = buildResourceGraph(m);
  assert.ok(r.errors.some((e) => e.code === 'FLOW_RESOURCE_CYCLE'));
});

test('three-node cycle a → b → c → a emits FLOW_RESOURCE_CYCLE with full path', () => {
  const m = new Map([
    ['a', lib('a', ['c'])],
    ['b', lib('b', ['a'])],
    ['c', lib('c', ['b'])],
  ]);
  const r = buildResourceGraph(m);
  const err = r.errors.find((e) => e.code === 'FLOW_RESOURCE_CYCLE');
  assert.ok(err);
  if (err && err.code === 'FLOW_RESOURCE_CYCLE') {
    // Cycle path must reference each node at least once.
    for (const n of ['a', 'b', 'c']) assert.ok(err.cyclePath.includes(n), `cyclePath should include ${n}`);
  }
});

test('unknown parent emits FLOW_RESOURCE_PARENT_MISSING with sourceFile', () => {
  const m = new Map([
    ['child', lib('child', ['ghost'], '/path/to/task-x.yaml')],
  ]);
  const r = buildResourceGraph(m);
  const err = r.errors.find((e) => e.code === 'FLOW_RESOURCE_PARENT_MISSING');
  assert.ok(err);
  if (err && err.code === 'FLOW_RESOURCE_PARENT_MISSING') {
    assert.equal(err.resourceName, 'child');
    assert.equal(err.missingParent, 'ghost');
    assert.equal(err.file, '/path/to/task-x.yaml');
  }
});

test('disconnected nodes both topo-sort, parents/children empty', () => {
  const m = new Map([
    ['a', lib('a')],
    ['b', lib('b')],
  ]);
  const r = buildResourceGraph(m);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.graph.topo(), ['a', 'b']);
  assert.deepEqual(r.graph.parents('a'), []);
  assert.deepEqual(r.graph.children('a'), []);
  assert.deepEqual(r.graph.ancestors('a'), []);
  assert.deepEqual(r.graph.descendants('a'), []);
});

test('ancestors / descendants of unknown node return []', () => {
  const m = new Map([['a', lib('a')]]);
  const r = buildResourceGraph(m);
  assert.deepEqual(r.graph.ancestors('ghost'), []);
  assert.deepEqual(r.graph.descendants('ghost'), []);
  assert.deepEqual(r.graph.parents('ghost'), []);
  assert.deepEqual(r.graph.children('ghost'), []);
});
