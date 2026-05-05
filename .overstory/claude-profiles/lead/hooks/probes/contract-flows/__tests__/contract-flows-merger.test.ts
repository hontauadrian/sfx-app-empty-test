/**
 * Tests for contract-flows/contract-flows-merger.ts.
 *
 * Decision 2 conflict rules:
 *   - actors: union by name; deep-equal payload conflict → hard error.
 *   - resources: union by name; deep-equal full Resource (every behaviour
 *     block included) → hard error.
 *   - special_flows: concat; duplicate id across files → hard error.
 *
 * Cross-file checks:
 *   - extends targets exist (FLOW_EXTENDS_TARGET_MISSING).
 *   - dependsOn ids exist (FLOW_DEPENDSON_TARGET_MISSING).
 *   - setup.create resources exist (FLOW_RESOURCE_PARENT_MISSING).
 *   - setup.by actors exist (FLOW_ACTOR_REFERENCE_MISSING).
 *
 * Determinism:
 *   - specialFlows sorted by id (lex) regardless of input order.
 *   - taskIds sorted + deduped.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  mergeContractFlows,
  emptyMergedContract,
  __deepEqualForTests as deepEqual,
} from '../contract-flows-merger';
import type {
  AttributedContractFile,
  ContractFile,
} from '../contract-flows-schema';

function file(path: string, contract: ContractFile): AttributedContractFile {
  return { file: path, taskId: contract.task_id, contract };
}

function basicContract(taskId: string, partial: Partial<ContractFile> = {}): ContractFile {
  return {
    version: 1,
    task_id: taskId,
    owns: [],
    ...partial,
  };
}

test('mergeContractFlows on empty input returns empty merged contract', () => {
  const r = mergeContractFlows([]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.merged.actors.size, 0);
  assert.equal(r.merged.resources.size, 0);
  assert.equal(r.merged.specialFlows.length, 0);
  assert.deepEqual(r.merged.taskIds, []);
});

test('emptyMergedContract returns a fresh, isolated instance', () => {
  const a = emptyMergedContract();
  const b = emptyMergedContract();
  a.actors.set('x', { actor: { name: 'x', auth: {} }, sourceFile: '/a' });
  assert.equal(b.actors.size, 0);
});

test('actors union by name (no conflict on identical payload)', () => {
  const f1 = file('/a.yaml', basicContract('_shared', {
    owns: [{ actor: 'A' }],
    actors: [{ name: 'A', auth: { token: 'x' } }],
  }));
  const f2 = file('/b.yaml', basicContract('task-1', {
    owns: [{ actor: 'A' }],
    actors: [{ name: 'A', auth: { token: 'x' } }],
  }));
  const r = mergeContractFlows([f1, f2]);
  assert.equal(r.errors.length, 0);
  assert.equal(r.merged.actors.size, 1);
});

test('actors disagreeing on payload → FLOW_MERGE_CONFLICT names BOTH files', () => {
  const f1 = file('/a.yaml', basicContract('_shared', {
    owns: [{ actor: 'A' }],
    actors: [{ name: 'A', auth: { token: 'x' } }],
  }));
  const f2 = file('/b.yaml', basicContract('task-1', {
    owns: [{ actor: 'A' }],
    actors: [{ name: 'A', auth: { token: 'CONFLICT' } }],
  }));
  const r = mergeContractFlows([f1, f2]);
  const conflict = r.errors.find((e) => e.code === 'FLOW_MERGE_CONFLICT');
  assert.ok(conflict);
  if (conflict && conflict.code === 'FLOW_MERGE_CONFLICT') {
    assert.equal(conflict.kind, 'actor');
    assert.equal(conflict.name, 'A');
    assert.deepEqual(conflict.files.sort(), ['/a.yaml', '/b.yaml']);
  }
});

test('resources differing on declarative behaviour block → FLOW_MERGE_CONFLICT { kind: resource }', () => {
  const make = (path: string, scope: 'route' | 'tenant'): AttributedContractFile =>
    file(path, basicContract(`task-${scope}`, {
      owns: [{ resource: 'X' }],
      resources: [{
        name: 'X',
        create: { method: 'POST', path: '/x' },
        capture: { bindings: { id: '$.id' } },
        idempotency: { keyHeader: 'Idempotency-Key', scope },
      }],
    }));
  const f1 = make('/a.yaml', 'route');
  const f2 = make('/b.yaml', 'tenant');
  const r = mergeContractFlows([f1, f2]);
  const c = r.errors.find((e) => e.code === 'FLOW_MERGE_CONFLICT');
  assert.ok(c);
  if (c && c.code === 'FLOW_MERGE_CONFLICT') {
    assert.equal(c.kind, 'resource');
    assert.equal(c.name, 'X');
    assert.deepEqual(c.files.sort(), ['/a.yaml', '/b.yaml']);
  }
});

test('special_flows duplicate id across files → FLOW_DUPLICATE_ID names both files', () => {
  const flow = (path: string, source: string): AttributedContractFile =>
    file(path, basicContract(`task-${source}`, {
      owns: [],
      special_flows: [{
        id: 'shared:scenario',
        contract: { kind: 'http', source: 'p' },
        steps: [{ kind: 'api', transport: 'http', method: 'GET', path: '/' }],
      }],
    }));
  const f1 = flow('/a.yaml', '1');
  const f2 = flow('/b.yaml', '2');
  const r = mergeContractFlows([f1, f2]);
  const dup = r.errors.find((e) => e.code === 'FLOW_DUPLICATE_ID');
  assert.ok(dup);
  if (dup && dup.code === 'FLOW_DUPLICATE_ID') {
    assert.equal(dup.flowId, 'shared:scenario');
    assert.deepEqual(dup.files.sort(), ['/a.yaml', '/b.yaml']);
  }
});

test('extends target missing → FLOW_EXTENDS_TARGET_MISSING for both kinds', () => {
  const f1 = file('/a.yaml', basicContract('task-1', {
    owns: [],
    extends: [{ actor: 'ghost-actor' }, { resource: 'ghost-resource' }],
  }));
  const r = mergeContractFlows([f1]);
  const errs = r.errors.filter((e) => e.code === 'FLOW_EXTENDS_TARGET_MISSING');
  assert.equal(errs.length, 2);
  const kinds = errs.map((e) => e.code === 'FLOW_EXTENDS_TARGET_MISSING' ? e.kind : '').sort();
  assert.deepEqual(kinds, ['actor', 'resource']);
});

test('dependsOn pointing at undeclared flow → FLOW_DEPENDSON_TARGET_MISSING', () => {
  const f = file('/a.yaml', basicContract('task-1', {
    owns: [],
    special_flows: [{
      id: 'task-1:flow',
      contract: { kind: 'http', source: 'p' },
      dependsOn: ['task-1:nonexistent'],
      steps: [{ kind: 'api', transport: 'http', method: 'GET', path: '/' }],
    }],
  }));
  const r = mergeContractFlows([f]);
  const err = r.errors.find((e) => e.code === 'FLOW_DEPENDSON_TARGET_MISSING');
  assert.ok(err);
  if (err && err.code === 'FLOW_DEPENDSON_TARGET_MISSING') {
    assert.equal(err.flowId, 'task-1:flow');
    assert.equal(err.missingDependency, 'task-1:nonexistent');
  }
});

test('setup.create / setup.by missing → resource + actor errors', () => {
  const f = file('/a.yaml', basicContract('task-1', {
    owns: [],
    special_flows: [{
      id: 'task-1:flow',
      contract: { kind: 'http', source: 'p' },
      setup: [{ create: 'ghost-resource', by: 'ghost-actor' }],
      steps: [{ kind: 'api', transport: 'http', method: 'GET', path: '/' }],
    }],
  }));
  const r = mergeContractFlows([f]);
  assert.ok(r.errors.some((e) => e.code === 'FLOW_RESOURCE_PARENT_MISSING'));
  assert.ok(r.errors.some((e) => e.code === 'FLOW_ACTOR_REFERENCE_MISSING'));
});

test('specialFlows are sorted by id (lex) regardless of input order', () => {
  const f = file('/a.yaml', basicContract('task-1', {
    owns: [],
    special_flows: [
      { id: 'task-1:zzz', contract: { kind: 'http', source: 's' }, steps: [{ kind: 'api', transport: 'http', method: 'GET', path: '/' }] },
      { id: 'task-1:aaa', contract: { kind: 'http', source: 's' }, steps: [{ kind: 'api', transport: 'http', method: 'GET', path: '/' }] },
      { id: 'task-1:mmm', contract: { kind: 'http', source: 's' }, steps: [{ kind: 'api', transport: 'http', method: 'GET', path: '/' }] },
    ],
  }));
  const r = mergeContractFlows([f]);
  assert.deepEqual(r.merged.specialFlows.map((sf) => sf.flow.id), ['task-1:aaa', 'task-1:mmm', 'task-1:zzz']);
});

test('taskIds is sorted and deduped', () => {
  const r = mergeContractFlows([
    file('/c.yaml', basicContract('zzz')),
    file('/b.yaml', basicContract('aaa')),
    file('/a.yaml', basicContract('aaa')), // dup
    file('/d.yaml', basicContract('mmm')),
  ]);
  assert.deepEqual(r.merged.taskIds, ['aaa', 'mmm', 'zzz']);
});

test('config.clockAdvanceEndpoint conflict → FLOW_MERGE_CONFLICT { kind: clock-endpoint }', () => {
  const a = file('/a.yaml', basicContract('_shared', {
    owns: [],
    config: { clockAdvanceEndpoint: '/clock-a' },
  }));
  const b = file('/b.yaml', basicContract('task-1', {
    owns: [],
    config: { clockAdvanceEndpoint: '/clock-b' },
  }));
  const r = mergeContractFlows([a, b]);
  const c = r.errors.find((e) => e.code === 'FLOW_MERGE_CONFLICT');
  assert.ok(c);
  if (c && c.code === 'FLOW_MERGE_CONFLICT') assert.equal(c.kind, 'clock-endpoint');
});

test('config merge — identical clockAdvanceEndpoint produces no conflict', () => {
  const a = file('/a.yaml', basicContract('_shared', {
    owns: [], config: { clockAdvanceEndpoint: '/clock' },
  }));
  const b = file('/b.yaml', basicContract('task-1', {
    owns: [], config: { clockAdvanceEndpoint: '/clock' },
  }));
  const r = mergeContractFlows([a, b]);
  assert.equal(r.errors.length, 0);
  assert.equal(r.merged.config.clockAdvanceEndpoint, '/clock');
});

test('deepEqual helper handles arrays, nested objects, NaN, key order', () => {
  assert.equal(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
  assert.equal(deepEqual([1, 2, 3], [1, 2, 3]), true);
  assert.equal(deepEqual([1, 2, 3], [1, 3, 2]), false);
  assert.equal(deepEqual(NaN, NaN), true);
  assert.equal(deepEqual(null, undefined), false);
  assert.equal(deepEqual({ a: { b: { c: [1] } } }, { a: { b: { c: [1] } } }), true);
  assert.equal(deepEqual({ a: { b: 1 } }, { a: { b: 2 } }), false);
});
