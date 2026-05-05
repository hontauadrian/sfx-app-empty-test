/**
 * contract-flows/errors.ts
 *
 * Failure-mode taxonomy for the probe-flow DSL system.
 * Decision 10 mandates the first three codes; the rest extend the same
 * discriminated-union shape so consumers structurally pattern-match on
 * `code` and never string-parse the message.
 *
 * Conflict-class errors carry `files: [string, string]` (BOTH absolute
 * paths) per Decision 2's "name both conflicting files" mandate.
 *
 * This module is the contract downstream phases code against. It has zero
 * runtime dependencies (type-only), so it can be imported from loader,
 * merger, resource-graph, and adapter-registry without cycles.
 */

// ────────────────────────────────────────────────────────────────────────────
// Discriminated union — every error is one member.
// ────────────────────────────────────────────────────────────────────────────

export type TypedError =
  // Decision 10 — mandatory.
  | FlowMergeConflictError
  | FlowDuplicateIdError
  | FlowFileMissingOwnsOrExtendsError
  // Loader-level (extensions in Decision 10's spirit).
  | FlowFileParseError
  | FlowFileSchemaInvalidError
  | FlowTaskIdMismatchError
  | FlowFixtureMissingError
  | FlowInvariantStepMissingError
  | FlowCoverageTemplateUnknownError
  // Cross-file (merger).
  | FlowExtendsTargetMissingError
  | FlowDependsOnTargetMissingError
  | FlowActorReferenceMissingError
  // Resource graph.
  | FlowResourceParentMissingError
  | FlowResourceCycleError
  // Adapter / runtime.
  | FlowAdapterUnregisteredError
  | FlowStepTimeoutError
  | FlowPollTimeoutError
  | FlowPollTerminalMismatchError
  | FlowIdempotencyReplayMismatchError
  | FlowCaptureNotFoundError
  | FlowHeaderCaptureNotFoundError
  | FlowBindingUnresolvedError
  | FlowChainParentMissingError
  | FlowParallelAggregateMismatchError
  | FlowCookieJarForkRequiredError
  | FlowUnknownTestEndpointError
  | FlowUnknownStepKindError
  | FlowStepFailedError
  | FlowAuthBootstrapActorFailedError
  | FlowSpecialFlowAdapterUnavailableError
  // File / ownership (drift hook + path-boundary hook).
  | FlowOwnershipViolationError
  | FlowNewEndpointUncoveredError
  // Schema / matcher (runtime).
  | FlowUnknownMatcherError
  // Coverage (drift hook + post-run audit).
  | FlowDeclaredStatusUntriggeredError
  | FlowBusinessRuleMissingNegativeError
  | FlowTransitionMissingError
  | FlowSideEffectUndeclaredError;

// ────────────────────────────────────────────────────────────────────────────
// Decision 10 mandatory.
// ────────────────────────────────────────────────────────────────────────────

export interface FlowMergeConflictError {
  code: 'FLOW_MERGE_CONFLICT';
  kind: 'actor' | 'resource' | 'reserved-actor' | 'clock-endpoint' | 'fixtures-root' | 'cookie-jar' | 'envelope';
  name?: string;
  files: [string, string];
  message: string;
}

export interface FlowDuplicateIdError {
  code: 'FLOW_DUPLICATE_ID';
  flowId: string;
  files: [string, string];
  message: string;
}

export interface FlowFileMissingOwnsOrExtendsError {
  code: 'FLOW_FILE_MISSING_OWNS_OR_EXTENDS';
  file: string;
  unboundDeclarations: Array<{ kind: 'actor' | 'resource'; name: string }>;
  message: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Loader-level.
// ────────────────────────────────────────────────────────────────────────────

export interface FlowFileParseError {
  code: 'FLOW_FILE_PARSE_ERROR';
  file: string;
  /** The underlying parser's error message (JSON.parse SyntaxError, etc.). */
  parseError: string;
  message: string;
}

export interface FlowFileSchemaInvalidError {
  code: 'FLOW_FILE_SCHEMA_INVALID';
  file: string;
  zodIssues: unknown[];
  message: string;
}

export interface FlowTaskIdMismatchError {
  code: 'FLOW_TASK_ID_MISMATCH';
  file: string;
  expected: string;
  actual: string;
  message: string;
}

export interface FlowFixtureMissingError {
  code: 'FLOW_FIXTURE_MISSING';
  file: string;
  fixtureRef: string;
  resolvedPath: string;
  message: string;
}

export interface FlowInvariantStepMissingError {
  code: 'FLOW_INVARIANT_STEP_MISSING';
  file: string;
  flowId: string;
  invariantIndex: number;
  missingStep: number | string;
  message: string;
}

export interface FlowCoverageTemplateUnknownError {
  code: 'FLOW_COVERAGE_TEMPLATE_UNKNOWN';
  file: string;
  flowId: string;
  template: string;
  knownTemplates: string[];
  message: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Cross-file (merger).
// ────────────────────────────────────────────────────────────────────────────

export interface FlowExtendsTargetMissingError {
  code: 'FLOW_EXTENDS_TARGET_MISSING';
  file: string;
  kind: 'actor' | 'resource';
  name: string;
  message: string;
}

export interface FlowDependsOnTargetMissingError {
  code: 'FLOW_DEPENDSON_TARGET_MISSING';
  file: string;
  flowId: string;
  missingDependency: string;
  message: string;
}

export interface FlowActorReferenceMissingError {
  code: 'FLOW_ACTOR_REFERENCE_MISSING';
  file: string;
  flowId: string;
  missingActor: string;
  message: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Resource graph.
// ────────────────────────────────────────────────────────────────────────────

export interface FlowResourceParentMissingError {
  code: 'FLOW_RESOURCE_PARENT_MISSING';
  file: string;
  resourceName: string;
  missingParent: string;
  message: string;
}

export interface FlowResourceCycleError {
  code: 'FLOW_RESOURCE_CYCLE';
  cyclePath: string[];
  message: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Adapter / runtime.
// ────────────────────────────────────────────────────────────────────────────

export interface FlowAdapterUnregisteredError {
  code: 'FLOW_ADAPTER_UNREGISTERED';
  transport: string;
  stepKind: string;
  message: string;
}

// Per-step wall-clock timeout (ApiStep + chain-control kinds). The poll
// step has its own dedicated timeout error below.
export interface FlowStepTimeoutError {
  code: 'FLOW_STEP_TIMEOUT';
  flowId: string;
  stepIndex: number;
  stepKind: string;
  timeoutMs: number;
  message: string;
}

// Poll-step exhausted timeoutMs while predicates kept matching.
export interface FlowPollTimeoutError {
  code: 'FLOW_POLL_TIMEOUT';
  flowId: string;
  stepIndex: number;
  attempts: number;
  timeoutMs: number;
  lastStatus?: number;
  lastBodyExcerpt?: string;
  message: string;
}

// Poll-step finished without timeout but the post-loop finalExpect
// rejected the last response.
export interface FlowPollTerminalMismatchError {
  code: 'FLOW_POLL_TERMINAL_MISMATCH';
  flowId: string;
  stepIndex: number;
  attempts: number;
  expected: string;
  actual: string;
  message: string;
}

// assertIdempotent: the replay diverged from the first response.
export interface FlowIdempotencyReplayMismatchError {
  code: 'FLOW_IDEMPOTENCY_REPLAY_MISMATCH';
  flowId: string;
  stepIndex: number;
  reason: 'status' | 'body' | 'first-not-2xx';
  firstStatus: number;
  secondStatus: number;
  diffExcerpt?: string;
  message: string;
}

// Body-binding capture path resolved to undefined.
export interface FlowCaptureNotFoundError {
  code: 'FLOW_CAPTURE_NOT_FOUND';
  flowId: string;
  stepIndex: number;
  binding: string;
  jsonPath: string;
  message: string;
}

// Header-binding capture: header absent on the response.
export interface FlowHeaderCaptureNotFoundError {
  code: 'FLOW_HEADER_CAPTURE_NOT_FOUND';
  flowId: string;
  stepIndex: number;
  binding: string;
  headerName: string;
  message: string;
}

// `${binding}` reference encountered with no value in ctx.bindings.
export interface FlowBindingUnresolvedError {
  code: 'FLOW_BINDING_UNRESOLVED';
  flowId: string;
  stepIndex: number;
  binding: string;
  in: 'path' | 'body' | 'header' | 'query' | 'url';
  message: string;
}

// dependsOn chain-id pointed at a flow that is not registered for this
// batch (different from FLOW_DEPENDSON_TARGET_MISSING which is caught at
// merge time — this is the runtime variant).
export interface FlowChainParentMissingError {
  code: 'FLOW_CHAIN_PARENT_MISSING';
  flowId: string;
  missingChainId: string;
  message: string;
}

// Parallel branches finished but the aggregated counts did not match.
export interface FlowParallelAggregateMismatchError {
  code: 'FLOW_PARALLEL_AGGREGATE_MISMATCH';
  flowId: string;
  stepIndex: number;
  field: 'statusCounts' | 'successCount' | 'failureCount';
  expected: unknown;
  actual: unknown;
  message: string;
}

// A parallel branch declared `isolatedAuth: true` but no per-actor cookie
// jar fork was available — the adapter refuses to silently share.
export interface FlowCookieJarForkRequiredError {
  code: 'FLOW_COOKIE_JAR_FORK_REQUIRED';
  flowId: string;
  stepIndex: number;
  branchActor?: string;
  message: string;
}

// `_shared.test_endpoints` referenced an unknown role (e.g. WaitStep
// asked for clockAdvance but no endpoint declared).
export interface FlowUnknownTestEndpointError {
  code: 'FLOW_UNKNOWN_TEST_ENDPOINT';
  flowId: string;
  stepIndex: number;
  role: string;
  message: string;
}

// Step kind reached the adapter but no handler is implemented (P2 step
// kinds in Phase 1: parallel, matrix, assertBulk, and side-effect kinds
// the HTTP adapter does not own).
export interface FlowUnknownStepKindError {
  code: 'FLOW_UNKNOWN_STEP_KIND';
  flowId: string;
  stepIndex: number;
  stepKind: string;
  reason: 'deferred-to-later-phase' | 'belongs-to-other-adapter';
  message: string;
}

// Generic expect-step / api-step failure envelope. Adapters fold every
// non-typed assertion failure into this shape so consumers can structurally
// pattern-match instead of reading prose.
export interface FlowStepFailedError {
  code: 'FLOW_STEP_FAILED';
  flowId: string;
  stepIndex: number;
  stepKind: string;
  expected: string;
  actual: string;
  responseExcerpt?: string;
  message: string;
}

// Auth bootstrap could not resolve credentials for an actor; flows that
// reference the actor are excluded from execution.
export interface FlowAuthBootstrapActorFailedError {
  code: 'FLOW_AUTH_BOOTSTRAP_ACTOR_FAILED';
  actorName: string;
  scheme: string;
  reason: string;
  message: string;
}

// A special_flow targeted a transport for which no adapter was registered.
// Skipped non-fatally per Phase 1 §A.3.
export interface FlowSpecialFlowAdapterUnavailableError {
  code: 'FLOW_SPECIAL_FLOW_ADAPTER_UNAVAILABLE';
  flowId: string;
  transport: string;
  message: string;
}

// ────────────────────────────────────────────────────────────────────────────
// File / ownership (drift hook + path-boundary hook).
// Decision 10: builders cannot edit the flows folder, and the drift hook
// fires when a builder's diff introduces an endpoint not covered by any
// flow file. These codes are emitted by W3's hooks at close-gate time.
// ────────────────────────────────────────────────────────────────────────────

export interface FlowOwnershipViolationError {
  code: 'FLOW_OWNERSHIP_VIOLATION';
  /** The role that attempted the write. */
  role: 'builder' | 'merger' | 'lead' | 'coordinator' | string;
  /** Path of the attempted write under the flows folder. */
  attemptedWrite: string;
  message: string;
}

export interface FlowNewEndpointUncoveredError {
  code: 'FLOW_NEW_ENDPOINT_UNCOVERED';
  /** Endpoints introduced by the diff that are not covered by any flow file. */
  endpoints: Array<{ method: string; path: string }>;
  /** The flows folder the drift hook scanned. */
  flowsFolder: string;
  message: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Schema / matcher (runtime).
// `bodyHas` / `headerHas` references a matcher the adapter does not know.
// ────────────────────────────────────────────────────────────────────────────

export interface FlowUnknownMatcherError {
  code: 'FLOW_UNKNOWN_MATCHER';
  flowId: string;
  stepIndex: number;
  /** The matcher object verbatim, so the diagnostic shows what the lead wrote. */
  matcher: unknown;
  message: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Coverage (drift hook + post-run audit).
// These fire AFTER a probe run when a flow file fails to cover something
// the contract surface promised.
// ────────────────────────────────────────────────────────────────────────────

export interface FlowDeclaredStatusUntriggeredError {
  code: 'FLOW_DECLARED_STATUS_UNTRIGGERED';
  /** The endpoint surface that declared the untriggered status. */
  endpoint: { method: string; path: string };
  status: number;
  message: string;
}

export interface FlowBusinessRuleMissingNegativeError {
  code: 'FLOW_BUSINESS_RULE_MISSING_NEGATIVE';
  ruleId: string;
  /** The flow that asserts the positive case but has no negative sibling. */
  positiveFlowId: string;
  message: string;
}

export interface FlowTransitionMissingError {
  code: 'FLOW_TRANSITION_MISSING';
  resourceName: string;
  /** Which side is missing — 'forward' (cannot perform the action) or
   *  'forbidden-from' (other states wrongly allowed to transition). */
  missingSide: 'forward' | 'forbidden-from';
  from: string;
  to: string;
  message: string;
}

export interface FlowSideEffectUndeclaredError {
  code: 'FLOW_SIDE_EFFECT_UNDECLARED';
  flowId: string;
  /** The side-effect kind referenced but not registered in the side-effect
   *  vocabulary (Decision 14). */
  kind: string;
  message: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Convenience: every error code as a string-literal type. Useful for
// switch/case exhaustiveness checks in consumers.
// ────────────────────────────────────────────────────────────────────────────

export type ErrorCode = TypedError['code'];

export const ALL_ERROR_CODES: readonly ErrorCode[] = [
  'FLOW_MERGE_CONFLICT',
  'FLOW_DUPLICATE_ID',
  'FLOW_FILE_MISSING_OWNS_OR_EXTENDS',
  'FLOW_FILE_PARSE_ERROR',
  'FLOW_FILE_SCHEMA_INVALID',
  'FLOW_TASK_ID_MISMATCH',
  'FLOW_FIXTURE_MISSING',
  'FLOW_INVARIANT_STEP_MISSING',
  'FLOW_COVERAGE_TEMPLATE_UNKNOWN',
  'FLOW_EXTENDS_TARGET_MISSING',
  'FLOW_DEPENDSON_TARGET_MISSING',
  'FLOW_ACTOR_REFERENCE_MISSING',
  'FLOW_RESOURCE_PARENT_MISSING',
  'FLOW_RESOURCE_CYCLE',
  'FLOW_ADAPTER_UNREGISTERED',
  'FLOW_STEP_TIMEOUT',
  'FLOW_POLL_TIMEOUT',
  'FLOW_POLL_TERMINAL_MISMATCH',
  'FLOW_IDEMPOTENCY_REPLAY_MISMATCH',
  'FLOW_CAPTURE_NOT_FOUND',
  'FLOW_HEADER_CAPTURE_NOT_FOUND',
  'FLOW_BINDING_UNRESOLVED',
  'FLOW_CHAIN_PARENT_MISSING',
  'FLOW_PARALLEL_AGGREGATE_MISMATCH',
  'FLOW_COOKIE_JAR_FORK_REQUIRED',
  'FLOW_UNKNOWN_TEST_ENDPOINT',
  'FLOW_UNKNOWN_STEP_KIND',
  'FLOW_STEP_FAILED',
  'FLOW_AUTH_BOOTSTRAP_ACTOR_FAILED',
  'FLOW_SPECIAL_FLOW_ADAPTER_UNAVAILABLE',
  // File / ownership (Decision 10).
  'FLOW_OWNERSHIP_VIOLATION',
  'FLOW_NEW_ENDPOINT_UNCOVERED',
  // Schema / matcher (Decision 10).
  'FLOW_UNKNOWN_MATCHER',
  // Coverage (Decision 10).
  'FLOW_DECLARED_STATUS_UNTRIGGERED',
  'FLOW_BUSINESS_RULE_MISSING_NEGATIVE',
  'FLOW_TRANSITION_MISSING',
  'FLOW_SIDE_EFFECT_UNDECLARED',
] as const;

// Throwable wrapper. Loader/merger/graph collect TypedError[] non-fatally;
// callers that want fast-fail can wrap one in this Error subclass.
export class ContractFlowError extends Error {
  readonly typed: TypedError;
  constructor(typed: TypedError) {
    super(typed.message);
    this.name = 'ContractFlowError';
    this.typed = typed;
  }
}
