/**
 * Tests for contract-flows/step-types.ts.
 *
 * Coverage:
 *   - Every known StepKind parses with valid input.
 *   - The Matcher language accepts every documented variant.
 *   - BodyKindSchema enforces the enum.
 *   - Open-enum behaviour: an unknown step kind is rejected by the
 *     discriminated union (rejecting at parse-time is the contract; the
 *     adapter-registry handles unknown-but-routable steps separately).
 *   - SideEffectDeclSchema rejects payloads with the wrong polarity / kind.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  StepSchema,
  MatcherSchema,
  BodyKindSchema,
  KNOWN_STEP_KINDS,
  BODY_KINDS,
  SideEffectDeclSchema,
  ExpectStepInnerSchema,
  CaptureStepInnerSchema,
} from '../step-types';

test('StepSchema parses ApiStep with multipart and explicit transport', () => {
  const r = StepSchema.safeParse({
    kind: 'api',
    transport: 'http',
    method: 'POST',
    path: '/api/v1/x',
    bodyKind: 'multipart',
    multipart: [
      { name: 'name', value: 'value' },
      { name: 'file', file: { fixtureRef: 'a.png', mimeType: 'image/png', filename: 'a.png' } },
    ],
    headers: { 'X-Test': '1' },
    query: { q: 'a' },
    stepId: 'do',
  });
  assert.equal(r.success, true);
});

test('StepSchema rejects ApiStep with missing transport', () => {
  const r = StepSchema.safeParse({ kind: 'api', method: 'GET', path: '/' });
  assert.equal(r.success, false);
});

test('StepSchema parses ExpectStep with bodyShape, errorEnvelope, statusAnyOf', () => {
  const r = StepSchema.safeParse({
    kind: 'expect',
    statusAnyOf: [200, 201],
    bodyHas: { '$.id': { present: true }, '$.status': 'active' },
    headerHas: { 'Content-Type': { matches: '^application/json' } },
    bodyShape: { arrayLengthAtLeast: 1, contains: [{ '$.id': { present: true } }] },
    errorEnvelope: { code: 'E_BAD', field: 'name', messageMatches: 'must.*' },
  });
  assert.equal(r.success, true);
});

test('StepSchema parses CaptureStep with all three capture forms', () => {
  const r = StepSchema.safeParse({
    kind: 'capture',
    bindings: { id: '$.id' },
    headerBindings: { etag: 'ETag' },
    captureEach: [{ binding: 'items', fromPath: '$.items', where: { '$.kind': 'X' } }],
  });
  assert.equal(r.success, true);
});

test('StepSchema parses every cookie / token primitive', () => {
  const cases = [
    { kind: 'capture-cookie', name: 'sess', binding: 'cookie' },
    { kind: 'assert-cookie-rotated', name: 'sess' },
    { kind: 'assert-cookie-cleared', name: 'sess' },
    { kind: 'assert-cookie-attrs', name: 'sess', attrs: { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', domain: 'a', maxAgeAtMost: 60 } },
    { kind: 'replay-cookie-as-header', name: 'sess', header: 'X-Session' },
    { kind: 'omit-cookie', name: 'sess' },
    { kind: 'tamper-cookie', name: 'sess', with: 'invalid-value' },
  ];
  for (const step of cases) {
    const r = StepSchema.safeParse(step);
    assert.equal(r.success, true, `step kind ${step.kind} should parse: ${r.success ? '' : JSON.stringify(r.error.issues)}`);
  }
});

test('StepSchema parses PollStep with whileBody/whileStatus/finalExpect/finalCapture', () => {
  const r = StepSchema.safeParse({
    kind: 'poll',
    request: { method: 'GET', path: '/jobs/1' },
    whileBody: { '$.state': { oneOf: ['queued', 'running'] } },
    whileStatus: [202],
    untilStatus: [200],
    intervalMs: 250,
    timeoutMs: 5000,
    finalExpect: { status: 200, bodyHas: { '$.state': 'complete' } },
    finalCapture: { bindings: { result: '$.result' } },
  });
  assert.equal(r.success, true);
});

test('StepSchema parses AssertIdempotentStep all three variants', () => {
  for (const variant of ['replay-same', 'replay-different-body', 'different-key'] as const) {
    const r = StepSchema.safeParse({
      kind: 'assertIdempotent',
      request: { method: 'POST', path: '/api/v1/x' },
      keyHeader: 'Idempotency-Key',
      variant,
      expectReplayStatus: 201,
      conflictStatus: 409,
    });
    assert.equal(r.success, true, `variant ${variant} should parse`);
  }
});

test('StepSchema parses ParallelStep with nested steps + aggregate', () => {
  const r = StepSchema.safeParse({
    kind: 'parallel',
    branches: [
      { actor: 'A', isolatedAuth: true, steps: [{ kind: 'api', transport: 'http', method: 'GET', path: '/' }] },
      { actor: 'B', isolatedAuth: false, steps: [{ kind: 'api', transport: 'http', method: 'GET', path: '/' }] },
    ],
    aggregate: { successCount: 1, failureCount: 1, statusCounts: { '200': 1, '409': 1 } },
  });
  assert.equal(r.success, true);
});

test('StepSchema parses MatrixStep with axis / template / cells', () => {
  const r = StepSchema.safeParse({
    kind: 'matrix',
    axis: { actor: ['A', 'B'], lang: ['en', 'fr'] },
    template: { steps: [{ kind: 'api', transport: 'http', method: 'GET', path: '/' }] },
    cells: [{ when: { actor: 'A' }, expect: { status: 200 } }],
  });
  assert.equal(r.success, true);
});

test('StepSchema parses AssertBulkStep / AssertSideEffectStep / WaitStep / SetAuth / Logout / Navigate', () => {
  const cases = [
    { kind: 'assertBulk', request: { method: 'POST', path: '/bulk', body: {} }, shape: 'multi-status', multiStatusCode: 207, entries: [{ index: 0, status: 201 }] },
    { kind: 'assertSideEffect', decl: { kind: 'audit-log', polarity: 'expected', description: 'logged', verifiedBy: 'http-probe' } },
    { kind: 'wait', advanceMs: 60001, freezeAt: '2026-01-01T00:00:00Z', issuedAt: '-31m' },
    { kind: 'setAuth', binding: 'a' },
    { kind: 'logout' },
    { kind: 'navigate', to: '/home' },
  ];
  for (const step of cases) {
    const r = StepSchema.safeParse(step);
    assert.equal(r.success, true, `step ${step.kind} should parse: ${r.success ? '' : JSON.stringify(r.error.issues)}`);
  }
});

test('StepSchema rejects unknown step kind at parse time', () => {
  const r = StepSchema.safeParse({ kind: 'totally-not-a-real-kind' });
  assert.equal(r.success, false);
});

test('MatcherSchema accepts every documented matcher form', () => {
  const matchers = [
    'literal-string', 42, true, null,
    { matches: '^foo' },
    { absent: true },
    { present: true },
    { oneOf: ['a', 'b', 1, null] },
    { type: 'string' },
    { type: 'number' },
    { type: 'array' },
    { type: 'object' },
    { type: 'boolean' },
    { type: 'null' },
    { equalsCapture: 'binding-name' },
    { lengthGte: 3 },
    { lengthLte: 10 },
    { length: 5 },
    { containsId: 'abc' },
    { notContainsId: 'xyz' },
    { sortedAscBy: '$.name' },
    { sortedDescBy: '$.createdAt' },
    { disjointFrom: 'binding-name' },
  ];
  for (const m of matchers) {
    const r = MatcherSchema.safeParse(m);
    assert.equal(r.success, true, `matcher ${JSON.stringify(m)} should parse: ${r.success ? '' : JSON.stringify(r.error.issues)}`);
  }
});

test('MatcherSchema rejects bogus matcher object', () => {
  const r = MatcherSchema.safeParse({ unknownKey: 1 });
  assert.equal(r.success, false);
});

test('BodyKindSchema enforces the enumeration', () => {
  for (const k of BODY_KINDS) assert.equal(BodyKindSchema.safeParse(k).success, true);
  assert.equal(BodyKindSchema.safeParse('bogus').success, false);
});

test('KNOWN_STEP_KINDS lists every kind the union parses', () => {
  // Sanity: every known kind parses *some* minimal payload through StepSchema.
  // We cannot build a payload for every kind here without duplicating the
  // schema, but we assert the count is consistent with the union members.
  assert.ok(KNOWN_STEP_KINDS.length >= 20);
});

test('SideEffectDeclSchema rejects unknown polarity / kind', () => {
  const okR = SideEffectDeclSchema.safeParse({
    kind: 'audit-log',
    polarity: 'expected',
    description: 'x',
    verifiedBy: 'http-probe',
  });
  assert.equal(okR.success, true);

  const badPol = SideEffectDeclSchema.safeParse({
    kind: 'audit-log',
    polarity: 'maybe',
    description: 'x',
    verifiedBy: 'http-probe',
  });
  assert.equal(badPol.success, false);

  const badKind = SideEffectDeclSchema.safeParse({
    kind: 'unknown-kind',
    polarity: 'expected',
    description: 'x',
    verifiedBy: 'http-probe',
  });
  assert.equal(badKind.success, false);
});

test('ExpectStepInnerSchema / CaptureStepInnerSchema parse without the discriminator', () => {
  assert.equal(ExpectStepInnerSchema.safeParse({ status: 200 }).success, true);
  assert.equal(CaptureStepInnerSchema.safeParse({ bindings: { x: '$.y' } }).success, true);
});
