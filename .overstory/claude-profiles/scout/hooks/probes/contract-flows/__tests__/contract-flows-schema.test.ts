/**
 * Tests for contract-flows/contract-flows-schema.ts.
 *
 * Single-file Zod rules:
 *   - version: literal 1
 *   - task_id: non-empty
 *   - owns/extends entries: {actor:<name>} XOR {resource:<name>}
 *   - resource.capture: at least one of bindings/headerBindings
 *   - resource.create.body: shape matches bodyKind discriminator
 *   - resource.idempotency.keyHeader: RFC-7230 token shape
 *   - special_flow.id: <prefix>:<scenario> regex
 *
 * Cross-file rules (Decision 2 conflict, dependsOn membership, parents
 * existence) are covered by the merger / loader / resource-graph tests.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ContractFileSchema,
  ResourceSchema,
  ActorSchema,
  SpecialFlowSchema,
  KNOWN_COVERAGE_TEMPLATES,
} from '../contract-flows-schema';

test('ContractFileSchema parses a kitchen-sink happy file', () => {
  const file = {
    version: 1,
    task_id: 'task-001',
    owns: [{ actor: 'actor-A' }, { resource: 'parent-resource' }],
    extends: [{ resource: 'other-resource' }],
    actors: [{ name: 'actor-A', auth: { token: 't' } }],
    resources: [{
      name: 'parent-resource',
      create: { method: 'POST', path: '/p' },
      capture: { bindings: { id: '$.id' } },
      idempotency: { keyHeader: 'Idempotency-Key', scope: 'route' as const, conflictStatus: 409 },
      pagination: { shape: 'cursor' as const, defaultLimit: 20 },
      ttl: { durationMs: 60000, expiredStatus: 410 },
      optimisticConcurrency: { responseHeader: 'ETag', requestHeader: 'If-Match', staleStatus: 412 },
      immutableFields: ['parentId'],
      tenantScopedBy: 'tenant-id',
      transitions: [{ from: 'a', to: 'b', trigger: { method: 'POST' }, expectStatus: 200 }],
      bulkOperations: [{ routeSuffix: '/bulk', shape: 'multi-status' as const, multiStatusCode: 207 }],
      concurrencyChecks: [{ op: 'create' as const, expectedStatusCounts: { '201': 1 } }],
      multipartCreate: { parts: [{ name: 'avatar', mimeType: 'image/png' }] },
    }],
    special_flows: [{
      id: 'task-001:scenario',
      contract: { kind: 'http', source: 'spec' },
      steps: [{ kind: 'api', transport: 'http', method: 'GET', path: '/' }],
    }],
  };
  const r = ContractFileSchema.safeParse(file);
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(r.error.issues, null, 2));
});

test('ContractFileSchema rejects version != 1', () => {
  const r = ContractFileSchema.safeParse({ version: 2, task_id: 't', owns: [] });
  assert.equal(r.success, false);
});

test('ContractFileSchema rejects empty task_id', () => {
  const r = ContractFileSchema.safeParse({ version: 1, task_id: '', owns: [] });
  assert.equal(r.success, false);
});

test('owns entry must be exactly one of actor / resource', () => {
  const both = ContractFileSchema.safeParse({
    version: 1, task_id: 't',
    owns: [{ actor: 'a', resource: 'r' }],
    actors: [{ name: 'a', auth: {} }],
  });
  assert.equal(both.success, false);

  const neither = ContractFileSchema.safeParse({
    version: 1, task_id: 't',
    owns: [{}],
  });
  assert.equal(neither.success, false);
});

test('owns/declarations consistency is NOT enforced by the schema (loader owns it)', () => {
  // Single-file schema accepts a file declaring an actor without owns.
  // The dedicated FLOW_FILE_MISSING_OWNS_OR_EXTENDS error fires only at the
  // loader level; the schema's job is shape, not cross-section consistency.
  const r = ContractFileSchema.safeParse({
    version: 1, task_id: 't',
    owns: [],
    actors: [{ name: 'orphan', auth: {} }],
  });
  assert.equal(r.success, true);
});

test('Resource.capture must declare at least one of bindings or headerBindings', () => {
  const r = ResourceSchema.safeParse({
    name: 'r',
    create: { method: 'POST', path: '/r' },
    capture: {},
  });
  assert.equal(r.success, false);
});

test('Resource.create body shape is validated against bodyKind', () => {
  for (const [kind, body, ok] of [
    ['json',           { name: 'x' }, true],
    ['json',           [1, 2],         true],
    ['multipart',      [{ name: 'a' }], true],
    ['multipart',      { not: 'array' }, false],
    ['form-urlencoded', { a: 'b' },     true],
    ['form-urlencoded', [1],            false],
    ['text',           'literal',       true],
    ['text',           { obj: 1 },      false],
    ['binary',         'base64==',      true],
    ['binary',         { obj: 1 },      false],
  ] as const) {
    const r = ResourceSchema.safeParse({
      name: 'r',
      create: { method: 'POST', path: '/r', bodyKind: kind, body },
      capture: { bindings: { id: '$.id' } },
    });
    assert.equal(
      r.success, ok,
      `bodyKind=${kind} body=${JSON.stringify(body)} expected ok=${ok}, got ${r.success}: ${r.success ? '' : JSON.stringify(r.error.issues)}`,
    );
  }
});

test('Resource.idempotency.keyHeader must match RFC-7230 token shape', () => {
  const ok = ResourceSchema.safeParse({
    name: 'r', create: { method: 'POST', path: '/r' }, capture: { bindings: { id: '$.id' } },
    idempotency: { keyHeader: 'Idempotency-Key', scope: 'route' as const },
  });
  assert.equal(ok.success, true);

  const bad = ResourceSchema.safeParse({
    name: 'r', create: { method: 'POST', path: '/r' }, capture: { bindings: { id: '$.id' } },
    idempotency: { keyHeader: 'has spaces', scope: 'route' as const },
  });
  assert.equal(bad.success, false);
});

test('Resource.pagination.shape is restricted to offset|cursor|page', () => {
  const ok = ResourceSchema.safeParse({
    name: 'r', create: { method: 'POST', path: '/r' }, capture: { bindings: { id: '$.id' } },
    pagination: { shape: 'cursor' as const, defaultLimit: 20 },
  });
  assert.equal(ok.success, true);

  const bad = ResourceSchema.safeParse({
    name: 'r', create: { method: 'POST', path: '/r' }, capture: { bindings: { id: '$.id' } },
    pagination: { shape: 'bogus', defaultLimit: 20 },
  });
  assert.equal(bad.success, false);
});

test('Resource.ttl.expiredStatus must be a 4xx/5xx integer', () => {
  for (const [status, ok] of [[410, true], [200, false], [600, false]] as const) {
    const r = ResourceSchema.safeParse({
      name: 'r', create: { method: 'POST', path: '/r' }, capture: { bindings: { id: '$.id' } },
      ttl: { durationMs: 1000, expiredStatus: status },
    });
    assert.equal(r.success, ok);
  }
});

test('SpecialFlow.id must match <prefix>:<scenario>', () => {
  for (const [id, ok] of [
    ['task-001:happy', true],
    ['task-001:happy.path', true],
    ['task-001:happy_under-score', true],
    ['task-001:nested:tag', true],
    ['no-colon', false],
    [':missing-prefix', false],
    ['ends-with:', false],
    ['has space:scenario', false],
    ['', false],
  ] as const) {
    const r = SpecialFlowSchema.safeParse({
      id,
      contract: { kind: 'http', source: 's' },
      steps: [{ kind: 'api', transport: 'http', method: 'GET', path: '/' }],
    });
    assert.equal(r.success, ok, `id ${JSON.stringify(id)} expected ok=${ok}`);
  }
});

test('SpecialFlow.steps must be non-empty', () => {
  const r = SpecialFlowSchema.safeParse({
    id: 'task:flow',
    contract: { kind: 'http', source: 's' },
    steps: [],
  });
  assert.equal(r.success, false);
});

test('Actor.auth accepts arbitrary record', () => {
  const r1 = ActorSchema.safeParse({ name: 'a', auth: {} });
  assert.equal(r1.success, true);
  const r2 = ActorSchema.safeParse({ name: 'a', auth: { token: 't', extra: { nested: true } } });
  assert.equal(r2.success, true);
});

test('KNOWN_COVERAGE_TEMPLATES contains the canonical names', () => {
  for (const t of [
    'cross-tenant-block',
    'idempotency-replay-same',
    'idempotency-replay-different-body',
    'async-poll-to-complete',
    'optimistic-concurrency-stale',
    'pagination-empty',
    'pagination-full',
    'ttl-expires',
    'state-transition',
    'reparent-rejected',
    'tenant-leak-prevented',
  ]) {
    assert.ok(KNOWN_COVERAGE_TEMPLATES.includes(t), `expected '${t}' in KNOWN_COVERAGE_TEMPLATES`);
  }
});
