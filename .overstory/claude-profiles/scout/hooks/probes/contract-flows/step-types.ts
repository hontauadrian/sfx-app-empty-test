/**
 * contract-flows/step-types.ts
 *
 * Universal Step / Capture / Expect / matcher shapes shared across YAML
 * parsing, the in-memory contract, the generated artefact, and runtime
 * execution.
 *
 * Scope per Phase 0a §7:
 *   - Reserves every P0 / P1 / P2 schema slot from Decision 17 so future
 *     phases bolt on emitters/adapters without re-shaping existing YAML.
 *   - Open `StepKind` enum so transport-specific kinds (SSE, WS, gRPC,
 *     queue, db) slot in additively.
 *   - Open `BodyKind` enum reserves binary/text variants for the
 *     non-JSON response surface checklist row.
 *   - Open `transport` field on ApiStep so the registry routes by
 *     `step.transport` (Decision §5).
 *
 * No runtime imports beyond zod.
 */

import { z } from 'zod';

// ────────────────────────────────────────────────────────────────────────────
// Step-kind enumeration. Open at the type level (string-extension) so
// transport-specific kinds can be added in adapter bundles without
// touching this file.
// ────────────────────────────────────────────────────────────────────────────

export type KnownStepKind =
  // Core sequential primitives.
  | 'api'
  | 'expect'
  | 'capture'
  | 'setAuth'
  | 'logout'
  | 'navigate'
  | 'wait'
  // P0-2 — async polling.
  | 'poll'
  // P0-4 — idempotency assertion as a single step.
  | 'assertIdempotent'
  // P2-1 — concurrency. Schema reserves the kind; emitters / adapter for
  // this kind ship in a later phase.
  | 'parallel'
  // P2-3 — matrix expansion.
  | 'matrix'
  // P2-4 — bulk-op assertion sugar.
  | 'assertBulk'
  // Cookie / token primitives — open enum so transport-specific kinds slot
  // in additively without touching this file.
  | 'capture-cookie'
  | 'assert-cookie-rotated'
  | 'assert-cookie-cleared'
  | 'assert-cookie-attrs'
  | 'replay-cookie-as-header'
  | 'omit-cookie'
  | 'tamper-cookie'
  // Side-effect surfaces (declarative; adapter-specific execution).
  | 'assertSideEffect';

// `StepKind = known | (string & {})` — the empty-object intersection is the
// idiomatic TS trick that keeps autocomplete on the known literals while
// still accepting any string at the type level. Decision: open enum.
export type StepKind = KnownStepKind | (string & {});

export const KNOWN_STEP_KINDS: readonly KnownStepKind[] = [
  'api', 'expect', 'capture', 'setAuth', 'logout', 'navigate', 'wait',
  'poll', 'assertIdempotent', 'parallel', 'matrix', 'assertBulk',
  'capture-cookie', 'assert-cookie-rotated', 'assert-cookie-cleared',
  'assert-cookie-attrs', 'replay-cookie-as-header', 'omit-cookie', 'tamper-cookie',
  'assertSideEffect',
] as const;

// ────────────────────────────────────────────────────────────────────────────
// Body kind. Used on `ApiStep` and `Resource.create`.
// ────────────────────────────────────────────────────────────────────────────

export type BodyKind = 'json' | 'multipart' | 'form-urlencoded' | 'text' | 'binary';

export const BODY_KINDS: readonly BodyKind[] = [
  'json', 'multipart', 'form-urlencoded', 'text', 'binary',
] as const;

export const BodyKindSchema = z.enum(['json', 'multipart', 'form-urlencoded', 'text', 'binary']);

// ────────────────────────────────────────────────────────────────────────────
// Matcher language (P1-1). Used for expect.bodyHas, expect.headerHas,
// expect.bodyShape, capture matchers.
//
// Primitives (string, number, boolean, null) are accepted directly so YAML
// like `bodyHas: { status: "active" }` does not need a wrapper object.
// ────────────────────────────────────────────────────────────────────────────

export type Matcher =
  | string | number | boolean | null
  | { matches: string }                 // regex; runtime-compiled
  | { absent: true }                    // path must NOT exist
  | { present: true }                   // path must exist (any value)
  | { oneOf: Array<unknown> }
  | { type: 'string' | 'number' | 'array' | 'object' | 'boolean' | 'null' }
  | { equalsCapture: string }
  | { lengthGte: number }
  | { lengthLte: number }
  | { length: number }
  | { containsId: string }
  | { notContainsId: string }
  | { sortedAscBy: string }
  | { sortedDescBy: string }
  | { disjointFrom: string };

// Zod for the matcher object union. Primitives are handled by a wrapping
// `z.union([...])` at the call site.
const MatcherObjectSchema: z.ZodType<Exclude<Matcher, string | number | boolean | null>> = z.union([
  z.object({ matches: z.string() }).strict(),
  z.object({ absent: z.literal(true) }).strict(),
  z.object({ present: z.literal(true) }).strict(),
  z.object({ oneOf: z.array(z.unknown()) }).strict(),
  z.object({ type: z.enum(['string', 'number', 'array', 'object', 'boolean', 'null']) }).strict(),
  z.object({ equalsCapture: z.string() }).strict(),
  z.object({ lengthGte: z.number() }).strict(),
  z.object({ lengthLte: z.number() }).strict(),
  z.object({ length: z.number() }).strict(),
  z.object({ containsId: z.string() }).strict(),
  z.object({ notContainsId: z.string() }).strict(),
  z.object({ sortedAscBy: z.string() }).strict(),
  z.object({ sortedDescBy: z.string() }).strict(),
  z.object({ disjointFrom: z.string() }).strict(),
]);

export const MatcherSchema: z.ZodType<Matcher> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  MatcherObjectSchema,
]);

// ────────────────────────────────────────────────────────────────────────────
// Body shape (P1-2).
// ────────────────────────────────────────────────────────────────────────────

export interface BodyShapeMatchers {
  arrayLength?: number;
  arrayLengthAtLeast?: number;
  arrayLengthAtMost?: number;
  contains?: Array<Record<string, Matcher>>;
  excludes?: Array<Record<string, Matcher>>;
  unique?: { jsonPath: string; count?: number };
  each?: Record<string, Matcher>;
}

export const BodyShapeMatchersSchema: z.ZodType<BodyShapeMatchers> = z.object({
  arrayLength: z.number().int().nonnegative().optional(),
  arrayLengthAtLeast: z.number().int().nonnegative().optional(),
  arrayLengthAtMost: z.number().int().nonnegative().optional(),
  contains: z.array(z.record(MatcherSchema)).optional(),
  excludes: z.array(z.record(MatcherSchema)).optional(),
  unique: z.object({
    jsonPath: z.string().min(1),
    count: z.number().int().nonnegative().optional(),
  }).strict().optional(),
  each: z.record(MatcherSchema).optional(),
}).strict();

// ────────────────────────────────────────────────────────────────────────────
// Step interfaces.
// ────────────────────────────────────────────────────────────────────────────

export interface ApiStep {
  kind: 'api';
  transport: string;                    // 'http' canonical; open enum
  method: string;
  path: string;
  body?: unknown;
  bodyKind?: BodyKind;                  // default 'json'
  multipart?: Array<{
    name: string;
    value?: string;
    file?: { fixtureRef: string; mimeType: string; filename?: string };
  }>;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  stepId?: string;
}

export interface ExpectStep {
  kind: 'expect';
  status?: number;
  statusAnyOf?: number[];
  bodyHas?: Record<string, Matcher>;
  headerHas?: Record<string, Matcher>;
  bodyShape?: BodyShapeMatchers;
  errorEnvelope?: { code?: string; field?: string; messageMatches?: string };
  stepId?: string;
}

export interface CaptureStep {
  kind: 'capture';
  bindings?: Record<string, string>;
  headerBindings?: Record<string, string>;
  captureEach?: Array<{
    binding: string;
    fromPath: string;
    where?: Record<string, Matcher>;
  }>;
  stepId?: string;
}

export interface SetAuthStep   { kind: 'setAuth'; binding: string; stepId?: string }
export interface LogoutStep    { kind: 'logout'; stepId?: string }
export interface NavigateStep  { kind: 'navigate'; to: string; stepId?: string }

export interface WaitStep {
  kind: 'wait';
  ms?: number;                            // wall-clock sleep (existing)
  advanceMs?: number;                     // call test-clock-advance endpoint
  advanceEndpoint?: string;               // overrides config.clockAdvanceEndpoint
  freezeAt?: string;                      // ISO-8601
  issuedAt?: string;                      // '-31m' style
  stepId?: string;
}

export interface PollStep {
  kind: 'poll';
  request: { method: string; path: string; headers?: Record<string, string> };
  whileBody?: Record<string, Matcher>;
  whileStatus?: number[];
  untilBody?: Record<string, Matcher>;
  untilStatus?: number[];
  intervalMs: number;
  timeoutMs: number;
  finalExpect?: Omit<ExpectStep, 'kind'>;
  finalCapture?: Omit<CaptureStep, 'kind'>;
  stepId?: string;
}

export interface AssertIdempotentStep {
  kind: 'assertIdempotent';
  request: { method: string; path: string; body?: unknown; headers?: Record<string, string> };
  keyHeader: string;
  variant: 'replay-same' | 'replay-different-body' | 'different-key';
  expectReplayStatus?: number;
  conflictStatus?: number;
  stepId?: string;
}

// Forward declaration — ParallelStep nests Step[]; use a lazy schema below.
export interface ParallelStep {
  kind: 'parallel';
  branches: Array<{
    actor?: string;
    steps: Step[];
    isolatedAuth?: boolean;
  }>;
  aggregate?: {
    statusCounts?: Record<number, number>;
    successCount?: number;
    failureCount?: number;
  };
  stepId?: string;
}

export interface MatrixStep {
  kind: 'matrix';
  axis: Record<string, string[]>;
  template: { steps: Step[] };
  cells?: Array<{ when: Record<string, string>; expect: Omit<ExpectStep, 'kind'> }>;
  stepId?: string;
}

export interface AssertBulkStep {
  kind: 'assertBulk';
  request: { method: string; path: string; body: unknown };
  shape: 'multi-status' | 'all-or-nothing';
  multiStatusCode?: number;
  entries?: Array<{ index: number; status: number; bodyHas?: Record<string, Matcher> }>;
  stepId?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Side-effect declaration. Used by AssertSideEffectStep AND by
// SpecialFlow.sideEffects[] in the file schema. Defined here (not in
// contract-flows-schema.ts) so step-types is the single point of
// reference for any consumer that only needs step shapes.
// ────────────────────────────────────────────────────────────────────────────

export interface SideEffectDecl {
  kind:
    | 'db-rows-inserted'
    | 'db-rows-updated'
    | 'db-rows-deleted'
    | 'audit-log'
    | 'outbound-webhook'
    | 'email-sent'
    | 'queue-message'
    | 'metric-incremented'
    | 'cache-invalidation'
    | 'event-bus'
    | 'other';
  polarity: 'expected' | 'expected-absent';
  description: string;
  target?: string;
  count?: number;
  rowMatch?: Record<string, unknown>;
  payloadMatch?: Record<string, unknown>;
  verifiedBy: 'integration-test' | 'http-probe' | 'db-adapter' | 'manual';
  testRef?: string;
}

export const SideEffectDeclSchema: z.ZodType<SideEffectDecl> = z.object({
  kind: z.enum([
    'db-rows-inserted', 'db-rows-updated', 'db-rows-deleted',
    'audit-log', 'outbound-webhook', 'email-sent', 'queue-message',
    'metric-incremented', 'cache-invalidation', 'event-bus', 'other',
  ]),
  polarity: z.enum(['expected', 'expected-absent']),
  description: z.string().min(1),
  target: z.string().optional(),
  count: z.number().int().nonnegative().optional(),
  rowMatch: z.record(z.unknown()).optional(),
  payloadMatch: z.record(z.unknown()).optional(),
  verifiedBy: z.enum(['integration-test', 'http-probe', 'db-adapter', 'manual']),
  testRef: z.string().optional(),
}).strict();

export interface AssertSideEffectStep {
  kind: 'assertSideEffect';
  decl: SideEffectDecl;
  stepId?: string;
}

// Cookie / token primitives.
export interface CaptureCookieStep        { kind: 'capture-cookie';        name: string; binding: string; stepId?: string }
export interface AssertCookieRotatedStep  { kind: 'assert-cookie-rotated'; name: string; stepId?: string }
export interface AssertCookieClearedStep  { kind: 'assert-cookie-cleared'; name: string; stepId?: string }
export interface AssertCookieAttrsStep {
  kind: 'assert-cookie-attrs';
  name: string;
  attrs: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
    path?: string;
    domain?: string;
    maxAgeAtMost?: number;
  };
  stepId?: string;
}
export interface ReplayCookieAsHeaderStep { kind: 'replay-cookie-as-header'; name: string; header: string; stepId?: string }
export interface OmitCookieStep           { kind: 'omit-cookie'; name: string; stepId?: string }
export interface TamperCookieStep         {
  kind: 'tamper-cookie';
  name: string;
  with: 'invalid-value' | 'expired' | 'wrong-issuer' | 'wrong-audience';
  stepId?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Step union (TypeScript).
// ────────────────────────────────────────────────────────────────────────────

export type Step =
  | ApiStep | ExpectStep | CaptureStep | SetAuthStep
  | LogoutStep | NavigateStep | WaitStep
  | PollStep | AssertIdempotentStep | ParallelStep | MatrixStep | AssertBulkStep
  | AssertSideEffectStep
  | CaptureCookieStep | AssertCookieRotatedStep | AssertCookieClearedStep
  | AssertCookieAttrsStep | ReplayCookieAsHeaderStep | OmitCookieStep | TamperCookieStep;

// ────────────────────────────────────────────────────────────────────────────
// Zod schemas for every step kind. ParallelStep / MatrixStep nest Step[],
// so the union is built lazily.
// ────────────────────────────────────────────────────────────────────────────

const ApiStepSchema: z.ZodType<ApiStep> = z.object({
  kind: z.literal('api'),
  transport: z.string().min(1),
  method: z.string().min(1),
  path: z.string().min(1),
  body: z.unknown().optional(),
  bodyKind: BodyKindSchema.optional(),
  multipart: z.array(z.object({
    name: z.string().min(1),
    value: z.string().optional(),
    file: z.object({
      fixtureRef: z.string().min(1),
      mimeType: z.string().min(1),
      filename: z.string().optional(),
    }).strict().optional(),
  }).strict()).optional(),
  headers: z.record(z.string()).optional(),
  query: z.record(z.string()).optional(),
  stepId: z.string().optional(),
}).strict();

const ExpectStepSchema: z.ZodType<ExpectStep> = z.object({
  kind: z.literal('expect'),
  status: z.number().int().min(100).max(599).optional(),
  statusAnyOf: z.array(z.number().int().min(100).max(599)).optional(),
  bodyHas: z.record(MatcherSchema).optional(),
  headerHas: z.record(MatcherSchema).optional(),
  bodyShape: BodyShapeMatchersSchema.optional(),
  errorEnvelope: z.object({
    code: z.string().optional(),
    field: z.string().optional(),
    messageMatches: z.string().optional(),
  }).strict().optional(),
  stepId: z.string().optional(),
}).strict();

const CaptureStepSchema: z.ZodType<CaptureStep> = z.object({
  kind: z.literal('capture'),
  bindings: z.record(z.string().min(1)).optional(),
  headerBindings: z.record(z.string().min(1)).optional(),
  captureEach: z.array(z.object({
    binding: z.string().min(1),
    fromPath: z.string().min(1),
    where: z.record(MatcherSchema).optional(),
  }).strict()).optional(),
  stepId: z.string().optional(),
}).strict();

const SetAuthStepSchema: z.ZodType<SetAuthStep> = z.object({
  kind: z.literal('setAuth'),
  binding: z.string().min(1),
  stepId: z.string().optional(),
}).strict();

const LogoutStepSchema: z.ZodType<LogoutStep> = z.object({
  kind: z.literal('logout'),
  stepId: z.string().optional(),
}).strict();

const NavigateStepSchema: z.ZodType<NavigateStep> = z.object({
  kind: z.literal('navigate'),
  to: z.string().min(1),
  stepId: z.string().optional(),
}).strict();

const WaitStepSchema: z.ZodType<WaitStep> = z.object({
  kind: z.literal('wait'),
  ms: z.number().int().nonnegative().optional(),
  advanceMs: z.number().int().nonnegative().optional(),
  advanceEndpoint: z.string().optional(),
  freezeAt: z.string().optional(),
  issuedAt: z.string().optional(),
  stepId: z.string().optional(),
}).strict();

// ExpectStep / CaptureStep without the discriminator — used for poll's
// finalExpect / finalCapture.
const ExpectStepInnerSchema = z.object({
  status: z.number().int().min(100).max(599).optional(),
  statusAnyOf: z.array(z.number().int().min(100).max(599)).optional(),
  bodyHas: z.record(MatcherSchema).optional(),
  headerHas: z.record(MatcherSchema).optional(),
  bodyShape: BodyShapeMatchersSchema.optional(),
  errorEnvelope: z.object({
    code: z.string().optional(),
    field: z.string().optional(),
    messageMatches: z.string().optional(),
  }).strict().optional(),
  stepId: z.string().optional(),
}).strict();

const CaptureStepInnerSchema = z.object({
  bindings: z.record(z.string().min(1)).optional(),
  headerBindings: z.record(z.string().min(1)).optional(),
  captureEach: z.array(z.object({
    binding: z.string().min(1),
    fromPath: z.string().min(1),
    where: z.record(MatcherSchema).optional(),
  }).strict()).optional(),
  stepId: z.string().optional(),
}).strict();

const PollStepSchema: z.ZodType<PollStep> = z.object({
  kind: z.literal('poll'),
  request: z.object({
    method: z.string().min(1),
    path: z.string().min(1),
    headers: z.record(z.string()).optional(),
  }).strict(),
  whileBody: z.record(MatcherSchema).optional(),
  whileStatus: z.array(z.number().int().min(100).max(599)).optional(),
  untilBody: z.record(MatcherSchema).optional(),
  untilStatus: z.array(z.number().int().min(100).max(599)).optional(),
  intervalMs: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
  finalExpect: ExpectStepInnerSchema.optional(),
  finalCapture: CaptureStepInnerSchema.optional(),
  stepId: z.string().optional(),
}).strict();

const AssertIdempotentStepSchema: z.ZodType<AssertIdempotentStep> = z.object({
  kind: z.literal('assertIdempotent'),
  request: z.object({
    method: z.string().min(1),
    path: z.string().min(1),
    body: z.unknown().optional(),
    headers: z.record(z.string()).optional(),
  }).strict(),
  keyHeader: z.string().min(1),
  variant: z.enum(['replay-same', 'replay-different-body', 'different-key']),
  expectReplayStatus: z.number().int().min(100).max(599).optional(),
  conflictStatus: z.number().int().min(100).max(599).optional(),
  stepId: z.string().optional(),
}).strict();

const AssertBulkStepSchema: z.ZodType<AssertBulkStep> = z.object({
  kind: z.literal('assertBulk'),
  request: z.object({
    method: z.string().min(1),
    path: z.string().min(1),
    body: z.unknown(),
  }).strict(),
  shape: z.enum(['multi-status', 'all-or-nothing']),
  multiStatusCode: z.number().int().min(100).max(599).optional(),
  entries: z.array(z.object({
    index: z.number().int().nonnegative(),
    status: z.number().int().min(100).max(599),
    bodyHas: z.record(MatcherSchema).optional(),
  }).strict()).optional(),
  stepId: z.string().optional(),
}).strict();

const AssertSideEffectStepSchema: z.ZodType<AssertSideEffectStep> = z.object({
  kind: z.literal('assertSideEffect'),
  decl: SideEffectDeclSchema,
  stepId: z.string().optional(),
}).strict();

const CaptureCookieStepSchema: z.ZodType<CaptureCookieStep> = z.object({
  kind: z.literal('capture-cookie'),
  name: z.string().min(1),
  binding: z.string().min(1),
  stepId: z.string().optional(),
}).strict();

const AssertCookieRotatedStepSchema: z.ZodType<AssertCookieRotatedStep> = z.object({
  kind: z.literal('assert-cookie-rotated'),
  name: z.string().min(1),
  stepId: z.string().optional(),
}).strict();

const AssertCookieClearedStepSchema: z.ZodType<AssertCookieClearedStep> = z.object({
  kind: z.literal('assert-cookie-cleared'),
  name: z.string().min(1),
  stepId: z.string().optional(),
}).strict();

const AssertCookieAttrsStepSchema: z.ZodType<AssertCookieAttrsStep> = z.object({
  kind: z.literal('assert-cookie-attrs'),
  name: z.string().min(1),
  attrs: z.object({
    httpOnly: z.boolean().optional(),
    secure: z.boolean().optional(),
    sameSite: z.string().optional(),
    path: z.string().optional(),
    domain: z.string().optional(),
    maxAgeAtMost: z.number().int().nonnegative().optional(),
  }).strict(),
  stepId: z.string().optional(),
}).strict();

const ReplayCookieAsHeaderStepSchema: z.ZodType<ReplayCookieAsHeaderStep> = z.object({
  kind: z.literal('replay-cookie-as-header'),
  name: z.string().min(1),
  header: z.string().min(1),
  stepId: z.string().optional(),
}).strict();

const OmitCookieStepSchema: z.ZodType<OmitCookieStep> = z.object({
  kind: z.literal('omit-cookie'),
  name: z.string().min(1),
  stepId: z.string().optional(),
}).strict();

const TamperCookieStepSchema: z.ZodType<TamperCookieStep> = z.object({
  kind: z.literal('tamper-cookie'),
  name: z.string().min(1),
  with: z.enum(['invalid-value', 'expired', 'wrong-issuer', 'wrong-audience']),
  stepId: z.string().optional(),
}).strict();

// Lazy-recursive: ParallelStep / MatrixStep reference Step[].
export const StepSchema: z.ZodType<Step> = z.lazy(() => z.discriminatedUnion('kind', [
  ApiStepSchema,
  ExpectStepSchema,
  CaptureStepSchema,
  SetAuthStepSchema,
  LogoutStepSchema,
  NavigateStepSchema,
  WaitStepSchema,
  PollStepSchema,
  AssertIdempotentStepSchema,
  ParallelStepSchema,
  MatrixStepSchema,
  AssertBulkStepSchema,
  AssertSideEffectStepSchema,
  CaptureCookieStepSchema,
  AssertCookieRotatedStepSchema,
  AssertCookieClearedStepSchema,
  AssertCookieAttrsStepSchema,
  ReplayCookieAsHeaderStepSchema,
  OmitCookieStepSchema,
  TamperCookieStepSchema,
]) as unknown as z.ZodType<Step>);

const ParallelStepSchema: z.ZodType<ParallelStep> = z.object({
  kind: z.literal('parallel'),
  branches: z.array(z.object({
    actor: z.string().optional(),
    steps: z.array(StepSchema).min(1),
    isolatedAuth: z.boolean().optional(),
  }).strict()).min(1),
  aggregate: z.object({
    statusCounts: z.record(z.string().regex(/^\d+$/), z.number().int().nonnegative()).optional(),
    successCount: z.number().int().nonnegative().optional(),
    failureCount: z.number().int().nonnegative().optional(),
  }).strict().optional(),
  stepId: z.string().optional(),
}).strict();

const MatrixStepSchema: z.ZodType<MatrixStep> = z.object({
  kind: z.literal('matrix'),
  axis: z.record(z.array(z.string()).min(1)),
  template: z.object({
    steps: z.array(StepSchema).min(1),
  }).strict(),
  cells: z.array(z.object({
    when: z.record(z.string()),
    expect: ExpectStepInnerSchema,
  }).strict()).optional(),
  stepId: z.string().optional(),
}).strict();

// Re-export the inner schemas for poll's finalExpect / finalCapture
// (consumers may want to validate independently).
export { ExpectStepInnerSchema, CaptureStepInnerSchema };
