/**
 * contract-flows/contract-flows-schema.ts
 *
 * Zod schemas describing the shape of one YAML contract-flow file.
 * Decisions 1, 2, 5 govern. Single-file consistency rules live here
 * (in `.refine()`); cross-file rules are deferred to the merger
 * (§3) and the resource graph (§6).
 *
 * Every P0 / P1 declarative behaviour block on `Resource` is
 * `z.optional()` so files written before later phases land continue
 * to parse unchanged; new fields are additive.
 */

import { z } from 'zod';
import {
  StepSchema,
  Step,
  SideEffectDecl,
  SideEffectDeclSchema,
} from './step-types';

// ────────────────────────────────────────────────────────────────────────────
// Actor.
// ────────────────────────────────────────────────────────────────────────────

export interface Actor {
  name: string;
  auth: Record<string, unknown>;
  transport?: string;
}

export const ActorSchema: z.ZodType<Actor> = z.object({
  name: z.string().min(1),
  auth: z.record(z.unknown()),
  transport: z.string().optional(),
}).strict();

// ────────────────────────────────────────────────────────────────────────────
// Resource — every P0/P1/P2 declarative behaviour block reserved as
// optional + additive.
// ────────────────────────────────────────────────────────────────────────────

export interface Resource {
  name: string;
  kind?: 'crud' | 'endpoint';
  create?: {
    operationId?: string;
    method?: string;
    path?: string;
    body?: unknown;
    bodyKind?: 'json' | 'multipart' | 'form-urlencoded' | 'text' | 'binary';
    headers?: Record<string, string>;
    query?: Record<string, string>;
  };
  capture?: {
    bindings?: Record<string, string>;
    headerBindings?: Record<string, string>;
  };
  parents?: string[];

  idempotency?: {
    keyHeader: string;
    scope: 'route' | 'tenant' | 'global';
    conflictStatus?: number;
    cacheReplayStatus?: number;
  };

  multipartCreate?: {
    parts: Array<{ name: string; fixtureRef?: string; mimeType?: string }>;
  };

  pagination?: {
    shape: 'offset' | 'cursor' | 'page';
    pageParam?: string;
    limitParam?: string;
    defaultLimit: number;
    maxLimit?: number;
    emptyResultAllowed?: boolean;
    nextCursorPath?: string;
    itemsPath?: string;
  };

  ttl?: {
    durationMs: number;
    expiredStatus: number;
    advanceEndpoint?: string;
  };

  optimisticConcurrency?: {
    responseHeader: string;
    requestHeader: string;
    staleStatus: number;
  };

  immutableFields?: string[];

  tenantScopedBy?: string;

  transitions?: Array<{
    from: string;
    to: string;
    trigger: { method: string; pathSuffix?: string; body?: Record<string, unknown> };
    expectStatus: number;
    reverseAllowed?: boolean;
  }>;

  bulkOperations?: Array<{
    routeSuffix: string;
    shape: 'multi-status' | 'all-or-nothing';
    multiStatusCode?: number;
  }>;

  concurrencyChecks?: Array<{
    op: 'create' | 'update' | 'delete';
    expectedStatusCounts: Record<number, number>;
  }>;
}

// RFC-7230 token shape (used for header names).
const RFC7230_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

// Resource.create.body validation: discriminated by bodyKind.
//   json (default)        → object | array | undefined
//   multipart             → array of parts (passed through; structure on step)
//   form-urlencoded       → object
//   text                  → string
//   binary                → string (base64)
function validateResourceCreateBody(create: NonNullable<Resource['create']>, ctx: z.RefinementCtx): void {
  const kind = create.bodyKind ?? 'json';
  const body = create.body;
  if (body === undefined) return;
  const ok = (() => {
    switch (kind) {
      case 'json': return body !== null && (typeof body === 'object');
      case 'multipart': return Array.isArray(body);
      case 'form-urlencoded': return body !== null && typeof body === 'object' && !Array.isArray(body);
      case 'text': return typeof body === 'string';
      case 'binary': return typeof body === 'string';
      default: return true;
    }
  })();
  if (!ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Resource.create.body shape does not match bodyKind '${kind}'`,
      path: ['body'],
    });
  }
}

const ResourceCreateSchema = z.object({
  operationId: z.string().optional(),
  method: z.string().optional(),
  path: z.string().optional(),
  body: z.unknown().optional(),
  bodyKind: z.enum(['json', 'multipart', 'form-urlencoded', 'text', 'binary']).optional(),
  headers: z.record(z.string()).optional(),
  query: z.record(z.string()).optional(),
}).strict().superRefine((create, ctx) => {
  validateResourceCreateBody(create, ctx);
});

const ResourceCaptureSchema = z.object({
  bindings: z.record(z.string().min(1)).optional(),
  headerBindings: z.record(z.string().min(1)).optional(),
}).strict().refine(
  (c) => (Object.keys(c.bindings ?? {}).length + Object.keys(c.headerBindings ?? {}).length) > 0,
  { message: 'Resource.capture must declare at least one of bindings or headerBindings' },
);

export const ResourceSchema: z.ZodType<Resource> = z.object({
  name: z.string().min(1),
  kind: z.enum(['crud', 'endpoint']).optional(),
  create: ResourceCreateSchema.optional(),
  capture: ResourceCaptureSchema.optional(),
  parents: z.array(z.string().min(1)).optional(),

  idempotency: z.object({
    keyHeader: z.string().regex(RFC7230_TOKEN, 'idempotency.keyHeader must match RFC-7230 token shape'),
    scope: z.enum(['route', 'tenant', 'global']),
    conflictStatus: z.number().int().min(400).max(599).optional(),
    cacheReplayStatus: z.number().int().min(100).max(599).optional(),
  }).strict().optional(),

  multipartCreate: z.object({
    parts: z.array(z.object({
      name: z.string().min(1),
      fixtureRef: z.string().optional(),
      mimeType: z.string().optional(),
    }).strict()).min(1),
  }).strict().optional(),

  pagination: z.object({
    shape: z.enum(['offset', 'cursor', 'page']),
    pageParam: z.string().optional(),
    limitParam: z.string().optional(),
    defaultLimit: z.number().int().positive(),
    maxLimit: z.number().int().positive().optional(),
    emptyResultAllowed: z.boolean().optional(),
    nextCursorPath: z.string().optional(),
    itemsPath: z.string().optional(),
  }).strict().optional(),

  ttl: z.object({
    durationMs: z.number().int().positive(),
    expiredStatus: z.number().int().min(400).max(599),
    advanceEndpoint: z.string().optional(),
  }).strict().optional(),

  optimisticConcurrency: z.object({
    responseHeader: z.string().min(1),
    requestHeader: z.string().min(1),
    staleStatus: z.number().int().min(400).max(599),
  }).strict().optional(),

  immutableFields: z.array(z.string().min(1)).optional(),
  tenantScopedBy: z.string().min(1).optional(),

  transitions: z.array(z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    trigger: z.object({
      method: z.string().min(1),
      pathSuffix: z.string().optional(),
      body: z.record(z.unknown()).optional(),
    }).strict(),
    expectStatus: z.number().int().min(100).max(599),
    reverseAllowed: z.boolean().optional(),
  }).strict()).optional(),

  bulkOperations: z.array(z.object({
    routeSuffix: z.string().min(1),
    shape: z.enum(['multi-status', 'all-or-nothing']),
    multiStatusCode: z.number().int().min(100).max(599).optional(),
  }).strict()).optional(),

  concurrencyChecks: z.array(z.object({
    op: z.enum(['create', 'update', 'delete']),
    expectedStatusCounts: z.record(z.string().regex(/^\d+$/), z.number().int().nonnegative()),
  }).strict()).optional(),
}).strict().superRefine((resource, ctx) => {
  if (resource.kind !== 'endpoint') {
    if (!resource.create) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['create'], message: 'Required for non-endpoint resources' });
    }
    if (!resource.capture) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['capture'], message: 'Required for non-endpoint resources' });
    }
  }
}) as unknown as z.ZodType<Resource>;

// ────────────────────────────────────────────────────────────────────────────
// SideEffectDecl re-exported for convenience.
// ────────────────────────────────────────────────────────────────────────────

export type { SideEffectDecl } from './step-types';
export { SideEffectDeclSchema } from './step-types';

// ────────────────────────────────────────────────────────────────────────────
// InvariantDecl — multi-request assertion.
// ────────────────────────────────────────────────────────────────────────────

export interface InvariantDecl {
  kind:
    | 'replay-equality'
    | 'replay-status-equality'
    | 'unique-across-responses'
    | 'count-across-responses'
    | 'monotonic-across-responses';
  steps?: Array<number | string>;
  jsonPath?: string;
  match?: Record<string, unknown>;
  count?: number;
}

export const InvariantDeclSchema: z.ZodType<InvariantDecl> = z.object({
  kind: z.enum([
    'replay-equality',
    'replay-status-equality',
    'unique-across-responses',
    'count-across-responses',
    'monotonic-across-responses',
  ]),
  steps: z.array(z.union([z.number().int().nonnegative(), z.string().min(1)])).optional(),
  jsonPath: z.string().optional(),
  match: z.record(z.unknown()).optional(),
  count: z.number().int().nonnegative().optional(),
}).strict();

// ────────────────────────────────────────────────────────────────────────────
// SpecialFlow.
// ────────────────────────────────────────────────────────────────────────────

export interface SpecialFlow {
  id: string;
  description?: string;
  contract: {
    kind: string;
    source: string;
    endpoint?: string;
  };
  dependsOn?: string[];
  setup?: Array<{
    create: string;
    by?: string;
    body?: Record<string, unknown>;
    capture?: string;
    repeat?: { n: number };
  }>;
  steps: Step[];
  sideEffects?: SideEffectDecl[];
  invariants?: InvariantDecl[];
  coverageTemplate?: string;
  onFail?: { check: string[]; implies: string };
}

const SPECIAL_FLOW_ID_REGEX = /^[A-Za-z0-9_-]+:[A-Za-z0-9_:.-]+$/;

export const SpecialFlowSchema: z.ZodType<SpecialFlow> = z.object({
  id: z.string().regex(SPECIAL_FLOW_ID_REGEX, 'special_flow.id must be of the form <prefix>:<scenario> (e.g. <task-id>:<scenario>)'),
  description: z.string().optional(),
  contract: z.object({
    kind: z.string().min(1),
    source: z.string().min(1),
    endpoint: z.string().optional(),
  }).strict(),
  dependsOn: z.array(z.string().min(1)).optional(),
  setup: z.array(z.object({
    create: z.string().min(1),
    by: z.string().optional(),
    body: z.record(z.unknown()).optional(),
    capture: z.string().optional(),
    repeat: z.object({ n: z.number().int().positive() }).strict().optional(),
  }).strict()).optional(),
  steps: z.array(StepSchema).min(1),
  sideEffects: z.array(SideEffectDeclSchema).optional(),
  invariants: z.array(InvariantDeclSchema).optional(),
  coverageTemplate: z.string().min(1).optional(),
  onFail: z.object({
    check: z.array(z.string().min(1)).min(1),
    implies: z.string(),
  }).strict().optional(),
}).strict();

// ────────────────────────────────────────────────────────────────────────────
// File-level: owns / extends / config / ContractFile.
// Decision 2 mandates owns + extends and discriminated-union per entry.
// ────────────────────────────────────────────────────────────────────────────

const OwnsEntrySchema = z.discriminatedUnion('_kind', [
  z.object({ _kind: z.literal('actor'),    actor: z.string().min(1) }).strict(),
  z.object({ _kind: z.literal('resource'), resource: z.string().min(1) }).strict(),
]);

// User-facing form: `{ actor: <name> }` XOR `{ resource: <name> }` — no
// `_kind` discriminator in YAML. We pre-process raw entries into the
// internal discriminated form before Zod sees them.
const OwnsEntrySchemaUserFacing = z.union([
  z.object({ actor: z.string().min(1) }).strict(),
  z.object({ resource: z.string().min(1) }).strict(),
]).superRefine((raw, ctx) => {
  const hasActor = 'actor' in raw;
  const hasResource = 'resource' in raw;
  if (hasActor === hasResource) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'each owns/extends entry must be exactly one of {actor:<name>} OR {resource:<name>}',
    });
  }
});

export type OwnsOrExtendsEntry = { actor: string } | { resource: string };

export interface ContractConfig {
  reservedActors?: Record<string, { auth: Record<string, unknown> }>;
  clockAdvanceEndpoint?: string;
  fixturesRoot?: string;
  envelope?: {
    successWrapper?: string[];
    errorWrapper?: string[];
  };
  cookieJar?: {
    /**
     * RFC 6265 §5.4 normally blocks Secure cookies on http URLs. Some test
     * environments serve the probe target over http://localhost; this flag
     * relaxes the check for the probe runner only. Decision lives in the
     * contract (declarative) instead of being baked into the library, so
     * probes targeting production https endpoints retain strict semantics.
     */
    allowSecureOnHttp?: boolean;
  };
}

export const ContractConfigSchema: z.ZodType<ContractConfig> = z.object({
  reservedActors: z.record(z.object({
    auth: z.record(z.unknown()),
  }).strict()).optional(),
  clockAdvanceEndpoint: z.string().optional(),
  fixturesRoot: z.string().optional(),
  envelope: z.object({
    successWrapper: z.array(z.string().min(1)).optional(),
    errorWrapper: z.array(z.string().min(1)).optional(),
  }).strict().optional(),
  cookieJar: z.object({
    allowSecureOnHttp: z.boolean().optional(),
  }).strict().optional(),
}).strict();

export interface ContractFile {
  version: 1;
  task_id: string;
  owns: OwnsOrExtendsEntry[];
  extends?: OwnsOrExtendsEntry[];
  actors?: Actor[];
  resources?: Resource[];
  special_flows?: SpecialFlow[];
  config?: ContractConfig;
}

// Raw schema for the file as YAML provides it (objects).
//
// Single-file consistency rules:
//
//   1. Each owns/extends entry is exactly {actor:<name>} XOR {resource:<name>}
//      — enforced by Zod (OwnsEntrySchemaUserFacing).
//   2. Owns / declarations consistency (every declared actor/resource is
//      listed in owns[]; owns[] non-empty when declarations exist) — moved
//      OUT of the schema and into the loader so the dedicated error code
//      `FLOW_FILE_MISSING_OWNS_OR_EXTENDS` (Decision 10) is the user-facing
//      result, not a generic FLOW_FILE_SCHEMA_INVALID. The loader's check is
//      authoritative; this schema only enforces shape.
//
// Cross-file rules (Decision 2 conflict, dependsOn membership, parents
// existence, fixture existence, filename matching task_id, invariant step
// resolution, coverageTemplate registry) live in the loader (§2) and
// merger (§3).
export const ContractFileSchema: z.ZodType<ContractFile> = z.object({
  version: z.literal(1),
  task_id: z.string().min(1),
  owns: z.array(OwnsEntrySchemaUserFacing),
  extends: z.array(OwnsEntrySchemaUserFacing).optional(),
  actors: z.array(ActorSchema).optional(),
  resources: z.array(ResourceSchema).optional(),
  special_flows: z.array(SpecialFlowSchema).optional(),
  config: ContractConfigSchema.optional(),
}).strict();

// ────────────────────────────────────────────────────────────────────────────
// Source-attribution wrapper (Decision 2 conflict diagnostic mandate).
// ────────────────────────────────────────────────────────────────────────────

export interface AttributedContractFile {
  file: string;
  taskId: string;
  contract: ContractFile;
}

// ────────────────────────────────────────────────────────────────────────────
// Coverage-template registry. Loader (§2) holds the canonical set;
// callers can extend by passing custom names through.
// ────────────────────────────────────────────────────────────────────────────

export const KNOWN_COVERAGE_TEMPLATES: readonly string[] = [
  'cross-tenant-block',
  'idempotency-replay-same',
  'idempotency-replay-different-body',
  'idempotency-different-key',
  'async-poll-to-complete',
  'optimistic-concurrency-stale',
  'optimistic-concurrency-current',
  'pagination-empty',
  'pagination-full',
  'pagination-invalid-cursor',
  'pagination-out-of-range',
  'pagination-stable-on-insert',
  'ttl-expires',
  'state-transition',
  'state-transition-forbidden',
  'reparent-rejected',
  'tenant-leak-prevented',
  'rate-limit-headers',
  'concurrent-equivalence',
  'read-your-write',
] as const;
