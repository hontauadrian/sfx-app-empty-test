/**
 * Tests for contract-flows/errors.ts.
 *
 * `errors.ts` has no runtime logic beyond the `ContractFlowError` wrapper
 * and the `ALL_ERROR_CODES` constant; the type-level discriminated union
 * is exercised by every other test file via the codes they emit.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_ERROR_CODES,
  ContractFlowError,
  type TypedError,
  type FlowMergeConflictError,
} from '../errors';

test('ALL_ERROR_CODES contains the W1-foundation Decision-10 surface without duplicates', () => {
  // W1 ships the load → merge → graph code surface plus the file/ownership,
  // schema/matcher, and coverage groupings from Decision 10 (which downstream
  // hooks emit but this module owns the type definitions for). W2 will
  // append runtime/adapter codes (FLOW_STEP_TIMEOUT, FLOW_CAPTURE_NOT_FOUND,
  // FLOW_IDEMPOTENCY_REPLAY_MISMATCH, FLOW_POLL_TIMEOUT, etc.) when its
  // adapter bundle lands. The count is implementation-driven; the contract
  // this test enforces is "every code below is exported and there are no
  // duplicates."
  assert.equal(new Set(ALL_ERROR_CODES).size, ALL_ERROR_CODES.length, 'ALL_ERROR_CODES must contain no duplicates');

  for (const required of [
    // File / ownership.
    'FLOW_OWNERSHIP_VIOLATION',
    'FLOW_NEW_ENDPOINT_UNCOVERED',
    'FLOW_FILE_MISSING_OWNS_OR_EXTENDS',
    'FLOW_MERGE_CONFLICT',
    'FLOW_DUPLICATE_ID',
    'FLOW_FIXTURE_MISSING',
    // Single-file (loader).
    'FLOW_FILE_PARSE_ERROR',
    'FLOW_FILE_SCHEMA_INVALID',
    'FLOW_TASK_ID_MISMATCH',
    'FLOW_INVARIANT_STEP_MISSING',
    'FLOW_COVERAGE_TEMPLATE_UNKNOWN',
    // Cross-file (merger).
    'FLOW_EXTENDS_TARGET_MISSING',
    'FLOW_DEPENDSON_TARGET_MISSING',
    'FLOW_ACTOR_REFERENCE_MISSING',
    // Resource graph.
    'FLOW_RESOURCE_PARENT_MISSING',
    'FLOW_RESOURCE_CYCLE',
    // Adapter (registry-side, runtime-side codes ship in W2).
    'FLOW_ADAPTER_UNREGISTERED',
    // Schema / matcher (runtime).
    'FLOW_UNKNOWN_MATCHER',
    // Coverage (drift hook + post-run audit).
    'FLOW_DECLARED_STATUS_UNTRIGGERED',
    'FLOW_BUSINESS_RULE_MISSING_NEGATIVE',
    'FLOW_TRANSITION_MISSING',
    'FLOW_SIDE_EFFECT_UNDECLARED',
  ] as const) {
    assert.ok(
      ALL_ERROR_CODES.includes(required),
      `Expected Decision 10 code '${required}' in ALL_ERROR_CODES`,
    );
  }
});

test('ContractFlowError preserves the typed error shape', () => {
  const typed: FlowMergeConflictError = {
    code: 'FLOW_MERGE_CONFLICT',
    kind: 'actor',
    name: 'actor-A',
    files: ['/a.yaml', '/b.yaml'],
    message: 'actor mismatch',
  };
  const err = new ContractFlowError(typed);
  assert.equal(err.name, 'ContractFlowError');
  assert.equal(err.message, 'actor mismatch');
  assert.equal(err.typed.code, 'FLOW_MERGE_CONFLICT');
  assert.deepEqual(err.typed, typed);
  assert.ok(err instanceof Error);
});

test('TypedError union accepts conflict-class codes with file pair', () => {
  const t: TypedError = {
    code: 'FLOW_DUPLICATE_ID',
    flowId: 'task:flow',
    files: ['/a.yaml', '/b.yaml'],
    message: 'dup',
  };
  // Compile-time discrimination: switch on code narrows the type.
  switch (t.code) {
    case 'FLOW_DUPLICATE_ID':
      assert.equal(t.flowId, 'task:flow');
      assert.equal(t.files.length, 2);
      break;
    default:
      assert.fail('discriminated union failed to narrow');
  }
});
