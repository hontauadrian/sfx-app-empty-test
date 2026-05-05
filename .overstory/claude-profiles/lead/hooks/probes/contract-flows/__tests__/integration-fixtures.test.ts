/**
 * Integration tests for the load → merge → graph pipeline against the
 * committed __fixtures__/ folders.
 *
 * The fixtures use only abstract placeholders (<actor-A>, <parent-resource>,
 * <task-id>) and exercise:
 *   - happy/        — every P0/P1/P2 declarative behaviour block, every
 *                     step kind, multipart fixture resolution, and the
 *                     three-level resource chain (parent → child).
 *   - conflicts/    — actor cred conflict, resource definition conflict
 *                     (different idempotency.scope), duplicate flow id.
 *   - bad-shape/    — every per-file error code (FLOW_FILE_PARSE_ERROR,
 *                     FLOW_FILE_SCHEMA_INVALID, FLOW_TASK_ID_MISMATCH,
 *                     FLOW_FILE_MISSING_OWNS_OR_EXTENDS,
 *                     FLOW_INVARIANT_STEP_MISSING,
 *                     FLOW_COVERAGE_TEMPLATE_UNKNOWN,
 *                     FLOW_FIXTURE_MISSING) plus the cross-file codes
 *                     (FLOW_DEPENDSON_TARGET_MISSING,
 *                     FLOW_EXTENDS_TARGET_MISSING,
 *                     FLOW_RESOURCE_PARENT_MISSING,
 *                     FLOW_ACTOR_REFERENCE_MISSING) and the resource-graph
 *                     code FLOW_RESOURCE_CYCLE.
 *
 * The fifteenth code, FLOW_ADAPTER_UNREGISTERED, is runtime-only and is
 * exercised by adapter-registry.test.ts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { loadContractFlowsFolder } from '../contract-flows-loader';
import { mergeContractFlows } from '../contract-flows-merger';
import { buildResourceGraph } from '../resource-graph';
import { ALL_ERROR_CODES } from '../errors';

const FIXTURES_ROOT = resolve(__dirname, '..', '__fixtures__');

function runPipeline(folder: string) {
  const loaded = loadContractFlowsFolder(folder);
  const merged = mergeContractFlows(loaded.files, loaded.fixtures);
  const graph  = buildResourceGraph(merged.merged.resources);
  const codes = new Set<string>();
  for (const e of [...loaded.errors, ...merged.errors, ...graph.errors]) codes.add(e.code);
  return { loaded, merged, graph, codes };
}

test('happy fixtures load + merge + graph cleanly with zero errors', () => {
  const { loaded, merged, graph } = runPipeline(`${FIXTURES_ROOT}/happy`);

  assert.deepEqual(loaded.errors, [], `loader errors: ${JSON.stringify(loaded.errors)}`);
  assert.deepEqual(merged.errors, [], `merger errors: ${JSON.stringify(merged.errors)}`);
  assert.deepEqual(graph.errors, [], `graph errors: ${JSON.stringify(graph.errors)}`);

  // _shared + task-001 + task-002 = 3.
  assert.equal(loaded.files.length, 3);

  // Resources: parent-resource (task-001), child-resource (task-002).
  assert.deepEqual([...merged.merged.resources.keys()].sort(), ['child-resource', 'parent-resource']);

  // Resource graph: parent before child.
  assert.deepEqual(graph.graph.topo(), ['parent-resource', 'child-resource']);
  assert.deepEqual(graph.graph.parents('child-resource'),  ['parent-resource']);
  assert.deepEqual(graph.graph.children('parent-resource'), ['child-resource']);

  // Special flows: lex-sorted by id.
  const flowIds = merged.merged.specialFlows.map((f) => f.flow.id);
  assert.deepEqual(flowIds, [...flowIds].sort());

  // Multipart fixture resolved.
  assert.ok(loaded.fixtures.has('avatar.png'));
});

test('conflicts fixtures emit FLOW_MERGE_CONFLICT (actor + resource) and FLOW_DUPLICATE_ID', () => {
  const { merged, codes } = runPipeline(`${FIXTURES_ROOT}/conflicts`);

  // At least one merge conflict per kind.
  const conflicts = merged.errors.filter((e) => e.code === 'FLOW_MERGE_CONFLICT');
  const conflictKinds = new Set(conflicts.map((c) => c.code === 'FLOW_MERGE_CONFLICT' ? c.kind : ''));
  assert.ok(conflictKinds.has('actor'),    'expected actor merge conflict');
  assert.ok(conflictKinds.has('resource'), 'expected resource merge conflict');

  // Duplicate flow id.
  assert.ok(codes.has('FLOW_DUPLICATE_ID'));

  // Conflict-class errors carry both file paths.
  for (const c of conflicts) {
    if (c.code === 'FLOW_MERGE_CONFLICT') assert.equal(c.files.length, 2, 'merge conflict must name both files');
  }
});

test('bad-shape fixtures emit every per-file and cross-file diagnostic code', () => {
  const { codes } = runPipeline(`${FIXTURES_ROOT}/bad-shape`);

  for (const expected of [
    'FLOW_FILE_PARSE_ERROR',
    'FLOW_FILE_SCHEMA_INVALID',
    'FLOW_TASK_ID_MISMATCH',
    'FLOW_FILE_MISSING_OWNS_OR_EXTENDS',
    'FLOW_INVARIANT_STEP_MISSING',
    'FLOW_COVERAGE_TEMPLATE_UNKNOWN',
    'FLOW_FIXTURE_MISSING',
    'FLOW_DEPENDSON_TARGET_MISSING',
    'FLOW_EXTENDS_TARGET_MISSING',
    'FLOW_RESOURCE_PARENT_MISSING',
    'FLOW_ACTOR_REFERENCE_MISSING',
    'FLOW_RESOURCE_CYCLE',
  ]) {
    assert.ok(codes.has(expected), `bad-shape fixtures should trigger ${expected}; got ${[...codes].sort().join(', ')}`);
  }
});

test('FLOW_RESOURCE_CYCLE includes the full cycle path', () => {
  const { graph } = runPipeline(`${FIXTURES_ROOT}/bad-shape`);
  const cycle = graph.errors.find((e) => e.code === 'FLOW_RESOURCE_CYCLE');
  assert.ok(cycle);
  if (cycle && cycle.code === 'FLOW_RESOURCE_CYCLE') {
    for (const n of ['cycle-a', 'cycle-b']) {
      assert.ok(cycle.cyclePath.includes(n), `cyclePath should include ${n}`);
    }
  }
});

test('aggregate fixtures trigger 14 of 15 error codes (FLOW_ADAPTER_UNREGISTERED is runtime-only)', () => {
  const all = new Set<string>();
  for (const sub of ['happy', 'conflicts', 'bad-shape']) {
    const { codes } = runPipeline(`${FIXTURES_ROOT}/${sub}`);
    codes.forEach((c) => all.add(c));
  }
  // Codes whose only emitter is the load → merge → graph pipeline.
  // Runtime codes (timeouts, capture-not-found, idempotency mismatch,
  // adapter-unregistered, etc.) and coverage codes (declared-status-
  // untriggered, business-rule-missing-negative, etc.) cannot fire from a
  // YAML-only pipeline; they are exercised by W2's adapter tests and W3's
  // drift-hook tests respectively.
  const fixtureReachable = [
    'FLOW_FILE_PARSE_ERROR',
    'FLOW_FILE_SCHEMA_INVALID',
    'FLOW_TASK_ID_MISMATCH',
    'FLOW_FILE_MISSING_OWNS_OR_EXTENDS',
    'FLOW_INVARIANT_STEP_MISSING',
    'FLOW_COVERAGE_TEMPLATE_UNKNOWN',
    'FLOW_FIXTURE_MISSING',
    'FLOW_DEPENDSON_TARGET_MISSING',
    'FLOW_EXTENDS_TARGET_MISSING',
    'FLOW_RESOURCE_PARENT_MISSING',
    'FLOW_ACTOR_REFERENCE_MISSING',
    'FLOW_RESOURCE_CYCLE',
    'FLOW_MERGE_CONFLICT',
    'FLOW_DUPLICATE_ID',
  ] as const;

  for (const code of fixtureReachable) {
    assert.ok(all.has(code), `expected fixture-reachable code '${code}' to be triggered; got: ${[...all].sort().join(', ')}`);
  }
  // Sanity: every code the pipeline fires must be a known taxonomy member,
  // catching drift between errors.ts and the fixture set.
  for (const fired of all) {
    assert.ok(
      ALL_ERROR_CODES.includes(fired as typeof ALL_ERROR_CODES[number]),
      `fixture fired unknown code '${fired}' — taxonomy out of sync with errors.ts`,
    );
  }
});

test('happy load is byte-stable across two runs (deterministic ordering)', () => {
  const a = runPipeline(`${FIXTURES_ROOT}/happy`);
  const b = runPipeline(`${FIXTURES_ROOT}/happy`);
  // taskIds order
  assert.deepEqual(a.merged.merged.taskIds, b.merged.merged.taskIds);
  // specialFlows id order
  assert.deepEqual(
    a.merged.merged.specialFlows.map((f) => f.flow.id),
    b.merged.merged.specialFlows.map((f) => f.flow.id),
  );
  // graph topo order
  assert.deepEqual(a.graph.graph.topo(), b.graph.graph.topo());
});
